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
      // POLICIES (live from Firestore)
      ////////////////////////////////////////////////////

      const policiesSnap = await db.collection("policies")
        .where("orgId", "==", orgId)
        .get();

      let policyContext = "No expense policies set.";
      if (!policiesSnap.empty) {
        const lines = policiesSnap.docs.map(d => {
          const p = d.data();
          if (p.type === "receipt_required")   return `• Receipts required for claims over £${p.value}`;
          if (p.type === "submission_window")  return `• Claims must be submitted within ${p.value} days of purchase`;
          if (p.type === "category_limit")     return `• ${p.category} category limit: £${p.value}`;
          if (p.type === "approval_required")  return `• All claims require manager approval`;
          return `• ${p.displayText || p.originalText || p.type}`;
        });
        policyContext = "ORG EXPENSE POLICIES:\n" + lines.join("\n");
      }

      ////////////////////////////////////////////////////
      // CLAIM DATA — full history with tax-year breakdown
      ////////////////////////////////////////////////////

      const claimsSnap = await db.collection("claims")
        .where("userId", "==", userId)
        .get();

      const claims = claimsSnap.docs.map(d => d.data());
      let claimsContext = "User has no claims on record.";

      if (claims.length) {
        // UK tax year: April 6 – April 5
        const now = new Date();
        const taxYearStartYear =
          now.getMonth() < 3 || (now.getMonth() === 3 && now.getDate() < 6)
            ? now.getFullYear() - 1
            : now.getFullYear();
        const taxYearStart = new Date(taxYearStartYear, 3, 6);
        const prevTaxYearStart = new Date(taxYearStartYear - 1, 3, 6);

        const getDate = c => {
          if (c.purchaseDate) return new Date(c.purchaseDate);
          return c.createdAt?.toDate?.() ?? null;
        };

        const thisYearClaims = claims.filter(c => {
          const d = getDate(c);
          return d && d >= taxYearStart;
        });
        const lastYearClaims = claims.filter(c => {
          const d = getDate(c);
          return d && d >= prevTaxYearStart && d < taxYearStart;
        });

        // Summarise a set of claims
        const summarise = (cs) => {
          const total    = cs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
          const approved = cs.filter(c => c.status === "approved").reduce((s, c) => s + (Number(c.amount) || 0), 0);
          const pending  = cs.filter(c => c.status === "pending").reduce((s, c) => s + (Number(c.amount) || 0), 0);
          const rejected = cs.filter(c => c.status === "rejected").length;
          const byCategory = {};
          const byMerchant = {};
          cs.forEach(c => {
            const cat = c.category || "Uncategorised";
            byCategory[cat] = (byCategory[cat] || 0) + (Number(c.amount) || 0);
            const m = (c.merchant || "").trim();
            if (m) byMerchant[m] = (byMerchant[m] || 0) + (Number(c.amount) || 0);
          });
          const catLines = Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `    ${k}: £${v.toFixed(2)}`)
            .join("\n");
          const topMerchants = Object.entries(byMerchant)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k, v]) => `    ${k}: £${v.toFixed(2)}`)
            .join("\n");
          return { total, approved, pending, rejected, catLines, topMerchants, count: cs.length };
        };

        const ty  = summarise(thisYearClaims);
        const ly  = summarise(lastYearClaims);
        const all = summarise(claims);

        // Last 20 individual claims (most recent first)
        const sorted = [...claims].sort((a, b) => {
          const da = getDate(a), db2 = getDate(b);
          return (db2?.getTime() ?? 0) - (da?.getTime() ?? 0);
        });
        const recentLines = sorted.slice(0, 20).map(c => {
          const d = getDate(c);
          const date = d ? d.toISOString().split("T")[0] : "unknown";
          return `  • ${c.merchant || c.category || "—"} — £${Number(c.amount).toFixed(2)} (${c.category}, ${c.status}, ${date})`;
        }).join("\n");

        claimsContext = `
USER EXPENSE DATA (all time: ${all.count} claims):

═══ CURRENT TAX YEAR (${taxYearStartYear}/${taxYearStartYear + 1}, from 6 Apr ${taxYearStartYear}) ═══
Total claimed:  £${ty.total.toFixed(2)} across ${ty.count} claims
Approved spend: £${ty.approved.toFixed(2)}
Pending spend:  £${ty.pending.toFixed(2)}
Rejected:       ${ty.rejected} claims

By category (current tax year):
${ty.catLines || "    (none)"}

Top merchants (current tax year):
${ty.topMerchants || "    (none)"}

═══ PREVIOUS TAX YEAR (${taxYearStartYear - 1}/${taxYearStartYear}) ═══
Total claimed:  £${ly.total.toFixed(2)} across ${ly.count} claims
Approved spend: £${ly.approved.toFixed(2)}

By category (previous tax year):
${ly.catLines || "    (none)"}

═══ ALL-TIME SUMMARY ═══
Total spend: £${all.total.toFixed(2)} | Approved: £${all.approved.toFixed(2)} | Pending: £${all.pending.toFixed(2)}

═══ RECENT INDIVIDUAL CLAIMS (last 20) ═══
${recentLines || "  (none)"}
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
            content: `You are an expert global business expense, tax, and accounting assistant embedded in the Claimio expense management app.

You have full access to the user's real expense data and org policies (provided below). Use them to give specific, data-driven answers.

YOUR CAPABILITIES — actively use these:
- Calculate tax-year totals, category breakdowns, and spending trends from the data
- Assess allowability of expenses under the relevant country's tax rules
- Identify likely benefit-in-kind or fringe benefit exposure (meals, entertainment, gifts)
- Estimate VAT / GST / sales tax reclaim potential based on the user's country
- Flag non-deductible items (client entertainment, personal expenses, fines)
- Identify compliant mileage reimbursement rates for the relevant country
- Spot patterns: overspending categories, rejected claims, duplicate merchants
- Make predictions: projected annual spend, likely tax liability/saving, whether a claim will pass policy
- Advise on record-keeping obligations appropriate to the user's jurisdiction

COUNTRY / JURISDICTION RULES:
- Tax rules vary significantly by country. NEVER assume a jurisdiction.
- If the user asks ANY tax, VAT, GST, deductibility, or accounting question and their country is NOT already known from the conversation, ask: "Which country are you based in? Tax rules vary — I want to make sure my answer is accurate for your jurisdiction."
- Once the user states their country, remember it for the rest of the conversation and apply the correct rules (e.g. HMRC for UK, IRS for US, ATO for Australia, SARS for South Africa, etc.).
- For non-tax questions about their claims data (spending totals, approval rates, projections), answer immediately without asking for country.

GENERAL RULES:
- ALWAYS use the actual figures from the data — never make up numbers
- NEVER refuse to analyse or predict — that's your job
- Be specific: quote amounts, dates, and categories from the data
- Keep answers clear and structured (use bullet points or short paragraphs)`
          },
          { role: "system", content: policyContext },
          { role: "system", content: claimsContext },
          ...history.map(m => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text
          })),
          { role: "user", content: message }
        ],
        temperature: 0.3,
        max_tokens: 400
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
