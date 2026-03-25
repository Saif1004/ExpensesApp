const { app } = require("@azure/functions");
const OpenAI = require("openai");
const admin = require("firebase-admin");
const PLAN_LIMITS = require("./planLimits");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`
});

const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const ANALYTICS_RATE_PER_MINUTE = 3; // all paid plans

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
      // AUTH
      ////////////////////////////////////////////////////

      const authHeader = request.headers.get("authorization");
      if (!authHeader) {
        return { status: 401, jsonBody: { error: "Unauthorized" } };
      }

      const token = authHeader.split("Bearer ")[1];
      const decoded = await admin.auth().verifyIdToken(token);
      const userId = decoded.uid;

      ////////////////////////////////////////////////////
      // ORG + PLAN CHECK
      ////////////////////////////////////////////////////

      const orgId = await getOrgForUser(userId);
      if (!orgId) {
        return { status: 403, jsonBody: { error: "No approved organisation found" } };
      }

      const orgSnap = await db.collection("organisations").doc(orgId).get();
      const orgData = orgSnap.data() || {};

      const plan = getEffectivePlan(orgData);
      const planConfig = PLAN_LIMITS[plan];

      if (!planConfig?.analyticsAccess) {
        return { status: 403, jsonBody: { error: "Upgrade your plan to use AI insights." } };
      }

      ////////////////////////////////////////////////////
      // RATE LIMIT
      ////////////////////////////////////////////////////

      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data() || {};

      const rw = userData.rateLimitAnalytics || { count: 0, windowStart: 0 };
      const now = Date.now();
      const windowExpired = (now - rw.windowStart) > RATE_WINDOW_MS;

      const newCount = windowExpired ? 1 : rw.count + 1;

      if (newCount > ANALYTICS_RATE_PER_MINUTE) {
        return {
          status: 429,
          jsonBody: { error: "Too many requests. Wait a moment before generating another insight." }
        };
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

      return {
        status: 200,
        jsonBody: { insight: res.choices[0].message.content }
      };

    } catch (err) {
      return {
        status: 500,
        jsonBody: { error: err.message }
      };
    }

  }
});
