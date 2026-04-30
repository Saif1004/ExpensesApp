/**
 * Shared AI credit utility.
 *
 * Handles:
 *  - Monthly reset for pro / business plans
 *  - Credit gate (returns an error response if no credits remain)
 *  - Deduction of 1 credit per AI call
 *
 * Uses a Firestore transaction to prevent race conditions where two concurrent
 * requests both read 0 credits remaining and both reset the counter, effectively
 * giving out double the monthly allowance.
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

  const db = admin.firestore();

  // ── Transactional read-reset-deduct to prevent race conditions ──────────────
  // Without a transaction, two simultaneous requests could both see "resetAt
  // expired", both reset to 50 credits, and each deduct 1 — giving 49 instead
  // of 48 remaining. Over time this adds up to free credits.
  let remaining = 0;
  let outOfCredits = false;

  try {
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(orgRef);
      const data = freshSnap.data() || {};

      let credits = data.aiCreditsRemaining ?? 0;
      const resetAt = data.aiCreditsResetAt?.toDate?.() ?? null;

      // Monthly reset only for paid recurring plans (not trial — one-time allotment)
      if ((plan === "pro" || plan === "business") && (!resetAt || resetAt < new Date())) {
        credits = planConfig.aiCreditsPerPeriod;
        tx.update(orgRef, {
          aiCreditsRemaining: credits - 1,          // reset + deduct in one write
          aiCreditsResetAt:   new Date(Date.now() + MONTH_MS),
        });
        remaining = credits - 1;
        return;
      }

      if (credits <= 0) {
        outOfCredits = true;
        return;
      }

      // Normal deduct path
      tx.update(orgRef, {
        aiCreditsRemaining: admin.firestore.FieldValue.increment(-1),
      });
      remaining = credits - 1;
    });
  } catch (txErr) {
    // Transaction failed (conflict or network) — fail open so a single AI call
    // isn't blocked by a transient error, but log it for monitoring.
    console.error("aiCredits transaction error:", txErr?.message);
    return { creditError: null, remaining: 1 }; // treat as 1 credit remaining
  }

  // ── Credit gate ───────────────────────────────────────────────────────────
  if (outOfCredits) {
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

  return { creditError: null, remaining };
}

module.exports = { checkAndDeductCredit };
