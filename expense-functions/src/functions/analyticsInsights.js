const { app } = require("@azure/functions");
const OpenAI = require("openai");
const admin = require("firebase-admin");
const PLAN_LIMITS = require("./planLimits");
const { requireAuth, secureResponse } = require("./security");
const { checkAiKillSwitch } = require("./aiConfig");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`
});

const RATE_WINDOW_MS = 60 * 1000;       // 1 minute
const ANALYTICS_RATE_PER_MINUTE = 3;    // all paid plans

//////////////////////////////////////////////////////
// HELPERS
//////////////////////////////////////////////////////

async function getOrgForUser(userId) {
  const snap = await db.collection("memberships")
    .where("userId", "==", userId)
    .where("status", "==", "approved")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data().orgId;
}

function getEffectivePlan(orgData) {
  const plan = orgData.plan || "free";
  if (plan === "trial") {
    const trialEndsAt = orgData.trialEndsAt?.toDate?.() ?? null;
    if (trialEndsAt && trialEndsAt < new Date()) return "free";
  }
  return plan;
}

//////////////////////////////////////////////////////
// HANDLER
//////////////////////////////////////////////////////

app.http("analyticsInsights", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request) => {

    try {

      ////////////////////////////////////////////////////
      // OAUTH 2.0 — Bearer token verification
      ////////////////////////////////////////////////////

      const { uid: userId, authError } = await requireAuth(request);
      if (authError) return authError;

      const blocked = await checkAiKillSwitch("analytics");
      if (blocked) return blocked;

      ////////////////////////////////////////////////////
      // RBAC — org membership + plan check
      ////////////////////////////////////////////////////

      const orgId = await getOrgForUser(userId);
      if (!orgId) {
        return secureResponse({ error: "No approved organisation found" }, 403);
      }

      const orgSnap = await db.collection("organisations").doc(orgId).get();
      const orgData = orgSnap.data() || {};

      const plan = getEffectivePlan(orgData);
      const planConfig = PLAN_LIMITS[plan];

      if (!planConfig?.analyticsAccess) {
        return secureResponse({ error: "Upgrade your plan to use AI insights." }, 403);
      }

      ////////////////////////////////////////////////////
      // RATE LIMIT (per user, per minute)
      ////////////////////////////////////////////////////

      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data() || {};

      const rw = userData.rateLimitAnalytics || { count: 0, windowStart: 0 };
      const now = Date.now();
      const windowExpired = (now - rw.windowStart) > RATE_WINDOW_MS;
      const newCount = windowExpired ? 1 : rw.count + 1;

      if (newCount > ANALYTICS_RATE_PER_MINUTE) {
        return secureResponse({ error: "Too many requests. Wait a moment before generating another insight." }, 429);
      }

      userRef.update({
        rateLimitAnalytics: {
          count: newCount,
          windowStart: windowExpired ? now : rw.windowStart
        }
      });

      ////////////////////////////////////////////////////
      // AI CALL
      ////////////////////////////////////////////////////

      const { stats } = await request.json();

      ////////////////////////////////////////////////////
      // INPUT VALIDATION
      ////////////////////////////////////////////////////

      if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
        return secureResponse({ error: "stats object is required" }, 400);
      }

      const {
        total, approved, rejected, pending,
        totalSpend, approvedSpend, pendingSpend,
        avgValue, approvalRate,
        categoryCount, categorySpend,
        topMerchants, monthlyData, period
      } = stats;

      if (typeof total !== "number" || total < 0) {
        return secureResponse({ error: "stats.total must be a non-negative number" }, 400);
      }

      // ── Build prompt sections from dynamic data ───────

      const periodLabel = {
        month: "this month", quarter: "this quarter", year: "this year",
        tax_year: "this tax year", all: "all time"
      }[period] || "the selected period";

      // Category breakdown
      const catLines = categoryCount && typeof categoryCount === "object"
        ? Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => {
              const spend = (categorySpend?.[cat] ?? 0).toFixed(2);
              return `  • ${cat}: ${count} claim${count !== 1 ? "s" : ""}, £${spend}`;
            })
            .join("\n")
        : "  (no category data)";

      // Top merchants
      const merchantLines = Array.isArray(topMerchants) && topMerchants.length > 0
        ? topMerchants.map(([name, amt]) => `  • ${name}: £${Number(amt).toFixed(2)}`).join("\n")
        : "  (none)";

      // Monthly trend
      const monthlyLines = Array.isArray(monthlyData) && monthlyData.length > 0
        ? monthlyData.map(m => `  ${m.label}: £${Number(m.value).toFixed(2)}`).join("  |  ")
        : "(no data)";

      const prompt = `
You are a financial analyst assistant. Generate concise, actionable insights for a business expense report.

Period: ${periodLabel}
Total claims: ${total ?? 0}
Total spend: £${Number(totalSpend ?? 0).toFixed(2)}
Approved: ${approved ?? 0} claims (£${Number(approvedSpend ?? 0).toFixed(2)})
Pending:  ${pending  ?? 0} claims (£${Number(pendingSpend  ?? 0).toFixed(2)})
Rejected: ${rejected ?? 0} claims
Approval rate: ${approvalRate ?? 0}%
Average claim: £${Number(avgValue ?? 0).toFixed(2)}

Category breakdown:
${catLines}

Top merchants by spend:
${merchantLines}

Monthly spend trend (last 6 months):
${monthlyLines}

Write 3–4 short sentences of insights focused on:
- Spending trends or anomalies worth flagging
- Which categories or merchants are driving the highest spend
- Whether the approval/rejection rate suggests any policy issues
- Any tax or accounting observations (e.g. high entertainment spend, large pending amounts)

Be specific, reference the actual numbers, and keep the tone professional.
`;

      const res = await client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT,
        messages: [
          { role: "system", content: "You generate financial insights." },
          { role: "user", content: prompt }
        ],
        max_tokens: 220
      });

      return secureResponse({ insight: res.choices[0].message.content }, 200);

    } catch (err) {
      return secureResponse({ error: err.message }, 500);
    }

  }
});
