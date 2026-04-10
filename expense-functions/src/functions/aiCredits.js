/**
 * Shared AI credit utility.
 *
 * Handles:
 *  - Monthly reset for pro / business plans
 *  - Credit gate (returns an error response if no credits remain)
 *  - Deduction of 1 credit per AI call
 *
 * Usage:
 *   const { creditError, remaining } = await checkAndDeductCredit(orgRef, orgData, planConfig, plan);
 *   if (creditError) return creditError;   // already a secureResponse-shaped value
 */

const admin = require("firebase-admin");
const { secureResponse } = require("./security");

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {FirebaseFirestore.DocumentReference} orgRef
 * @param {object}  orgData      — already-fetched org document data
 * @param {object}  planConfig   — entry from PLAN_LIMITS for the effective plan
 * @param {string}  plan         — effective plan string ("free"|"trial"|"pro"|"business")
 * @returns {{ creditError: object|null, remaining: number }}
 */
async function checkAndDeductCredit(orgRef, orgData, planConfig, plan) {

  // Free plan: no AI credits at all
  if (!planConfig || planConfig.aiCreditsPerPeriod === 0) {
    return {
      creditError: secureResponse(
        { success: false, error: "Upgrade your plan to use AI features." },
        403
      ),
      remaining: 0
    };
  }

  let aiCreditsRemaining = orgData.aiCreditsRemaining ?? 0;

  // ── Monthly reset for paid recurring plans (pro / business) ──────────────
  // Trial credits are a one-time allotment that expire with the trial — no reset.
  if (plan === "pro" || plan === "business") {
    const resetAt = orgData.aiCreditsResetAt?.toDate?.() ?? null;
    if (!resetAt || resetAt < new Date()) {
      aiCreditsRemaining = planConfig.aiCreditsPerPeriod;
      await orgRef.update({
        aiCreditsRemaining,
        aiCreditsResetAt: new Date(Date.now() + MONTH_MS)
      });
    }
  }

  // ── Credit gate ───────────────────────────────────────────────────────────
  if (aiCreditsRemaining <= 0) {
    return {
      creditError: secureResponse(
        {
          success: false,
          error: plan === "trial"
            ? "No AI credits remaining. Upgrade to Pro or Business to continue."
            : "No AI credits remaining. Credits reset monthly — or upgrade for more."
        },
        429
      ),
      remaining: 0
    };
  }

  // ── Deduct 1 credit ───────────────────────────────────────────────────────
  await orgRef.update({
    aiCreditsRemaining: admin.firestore.FieldValue.increment(-1)
  });

  return { creditError: null, remaining: aiCreditsRemaining - 1 };
}

module.exports = { checkAndDeductCredit };
