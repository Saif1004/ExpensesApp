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

const RATE_WINDOW_MS = 60 * 1000; // 1 minute sliding window

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

app.http("chatbot", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      ////////////////////////////////////////////////////
      // OAUTH 2.0 — Bearer token verification
      ////////////////////////////////////////////////////

      const { uid: userId, authError } = await requireAuth(request);
      if (authError) return authError;

      const blocked = await checkAiKillSwitch("chatbot");
      if (blocked) return blocked;

      const { message, history = [] } = await request.json();

      ////////////////////////////////////////////////////
      // INPUT VALIDATION
      ////////////////////////////////////////////////////

      if (message !== "__getCredits__") {
        if (typeof message !== "string" || message.trim().length === 0) {
          return secureResponse({ success: false, error: "message is required" }, 400);
        }
        if (message.length > 1000) {
          return secureResponse({ success: false, error: "message must be under 1000 characters" }, 400);
        }
        if (!Array.isArray(history)) {
          return secureResponse({ success: false, error: "history must be an array" }, 400);
        }
        if (history.length > 20) {
          return secureResponse({ success: false, error: "history must not exceed 20 messages" }, 400);
        }
      }

      ////////////////////////////////////////////////////
      // RBAC — org membership lookup
      ////////////////////////////////////////////////////

      const orgId = await getOrgForUser(userId);
      if (!orgId) {
        return secureResponse({ success: false, error: "No approved organisation found" }, 403);
      }

      const orgRef = db.collection("organisations").doc(orgId);
      const orgSnap = await orgRef.get();
      const orgData = orgSnap.data() || {};

      const plan = getEffectivePlan(orgData);
      const planConfig = PLAN_LIMITS[plan];

      ////////////////////////////////////////////////////
      // HANDLE __getCredits__
      ////////////////////////////////////////////////////

      if (message === "__getCredits__") {
        return secureResponse({
          success: true,
          remaining: orgData.aiCreditsRemaining ?? 0,
          limit: planConfig?.aiCreditsPerPeriod ?? 0
        }, 200);
      }

      ////////////////////////////////////////////////////
      // PLAN CHECK
      ////////////////////////////////////////////////////

      if (!planConfig?.chatbotAccess) {
        return secureResponse({ success: false, error: "Upgrade your plan to use the AI assistant." }, 403);
      }

      ////////////////////////////////////////////////////
      // MONTHLY CREDIT RESET (pro / business)
      ////////////////////////////////////////////////////

      let aiCreditsRemaining = orgData.aiCreditsRemaining ?? 0;

      if (plan === "pro" || plan === "business") {
        const resetAt = orgData.aiCreditsResetAt?.toDate?.() ?? null;
        if (!resetAt || resetAt < new Date()) {
          aiCreditsRemaining = planConfig.aiCreditsPerPeriod;
          await orgRef.update({
            aiCreditsRemaining,
            aiCreditsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });
        }
      }

      ////////////////////////////////////////////////////
      // CREDIT CHECK
      ////////////////////////////////////////////////////

      if (aiCreditsRemaining <= 0) {
        return secureResponse({
          success: false,
          error: "No AI credits remaining. Upgrade your plan or wait for the monthly reset."
        }, 429);
      }

      ////////////////////////////////////////////////////
      // RATE LIMIT (per user, per minute)
      ////////////////////////////////////////////////////

      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data() || {};

      const rw = userData.rateLimitChatbot || { count: 0, windowStart: 0 };
      const now = Date.now();
      const windowExpired = (now - rw.windowStart) > RATE_WINDOW_MS;
      const newCount = windowExpired ? 1 : rw.count + 1;
      const maxPerMinute = planConfig.chatbotRatePerMinute;

      if (newCount > maxPerMinute) {
        return secureResponse({
          success: false,
          error: `Rate limit exceeded. Max ${maxPerMinute} messages per minute on your plan.`
        }, 429);
      }

      // Fire-and-forget window update to keep latency low
      userRef.update({
        rateLimitChatbot: {
          count: newCount,
          windowStart: windowExpired ? now : rw.windowStart
        }
      });

      ////////////////////////////////////////////////////
      // CLAIM DATA
      ////////////////////////////////////////////////////

      const claimsSnap = await db.collection("claims")
        .where("userId", "==", userId)
        .get();

      const claims = claimsSnap.docs.map(d => d.data());
      let claimsContext = "User has no claims.";

      if (claims.length) {
        const total    = claims.reduce((s, c) => s + (Number(c.amount) || 0), 0);
        const approved = claims.filter(c => c.status === "approved").length;
        const pending  = claims.filter(c => c.status === "pending").length;
        const rejected = claims.filter(c => c.status === "rejected").length;
        const recent   = claims.slice(0, 5)
          .map(c => `${c.category} £${c.amount} (${c.status})`)
          .join("\n");

        claimsContext = `
USER CLAIM DATA:

Total Spend: £${total}
Approved: ${approved}
Pending: ${pending}
Rejected: ${rejected}

Recent Claims:
${recent}
`;
      }

      ////////////////////////////////////////////////////
      // AI CALL
      ////////////////////////////////////////////////////

      const aiRes = await client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT,
        messages: [
          {
            role: "system",
            content: `You are a smart expense assistant.

IMPORTANT:
- You DO have access to the user's financial data below
- NEVER say you don't have access
- ALWAYS use the data when answering

Policy:
Meals £50
Tech £500`
          },
          { role: "system", content: claimsContext },
          ...history.map(m => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text
          })),
          { role: "user", content: message }
        ],
        temperature: 0.3,
        max_tokens: 200
      });

      const reply = aiRes.choices[0].message.content;

      ////////////////////////////////////////////////////
      // DEDUCT CREDIT FROM ORG
      ////////////////////////////////////////////////////

      await orgRef.update({
        aiCreditsRemaining: admin.firestore.FieldValue.increment(-1)
      });

      const updatedOrgSnap = await orgRef.get();
      const remaining = updatedOrgSnap.data().aiCreditsRemaining ?? 0;

      return secureResponse({
        success: true,
        reply,
        remaining,
        limit: planConfig.aiCreditsPerPeriod
      }, 200);

    } catch (err) {
      return secureResponse({ success: false, error: err.message }, 200);
    }

  }
});
