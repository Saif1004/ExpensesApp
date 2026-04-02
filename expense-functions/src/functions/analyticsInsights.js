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

      const { total, approved, rejected, avgValue, categories } = stats;

      if (typeof total    !== "number" || total    < 0 ||
          typeof approved !== "number" || approved < 0 ||
          typeof rejected !== "number" || rejected < 0 ||
          typeof avgValue !== "number" || avgValue < 0) {
        return secureResponse({ error: "stats fields must be non-negative numbers" }, 400);
      }

      if (!categories || typeof categories !== "object" || Array.isArray(categories)) {
        return secureResponse({ error: "stats.categories must be an object" }, 400);
      }

      const ALLOWED_CATEGORIES = ["Meals", "Travel", "Technology", "Office"];
      for (const key of Object.keys(categories)) {
        if (!ALLOWED_CATEGORIES.includes(key)) {
          return secureResponse({ error: `Unknown category: ${key}` }, 400);
        }
        if (typeof categories[key] !== "number" || categories[key] < 0) {
          return secureResponse({ error: `categories.${key} must be a non-negative number` }, 400);
        }
      }

      const prompt = `
Generate short insights from this expense data.

Total claims: ${stats.total}
Approved: ${stats.approved}
Rejected: ${stats.rejected}

Categories:
Meals ${stats.categories.Meals}
Travel ${stats.categories.Travel}
Technology ${stats.categories.Technology}
Office ${stats.categories.Office}

Average claim: £${stats.avgValue}

Write 2-3 short sentences of insights.
`;

      const res = await client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT,
        messages: [
          { role: "system", content: "You generate financial insights." },
          { role: "user", content: prompt }
        ],
        max_tokens: 120
      });

      return secureResponse({ insight: res.choices[0].message.content }, 200);

    } catch (err) {
      return secureResponse({ error: err.message }, 500);
    }

  }
});
