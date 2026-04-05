const { app } = require("@azure/functions");
const admin = require("firebase-admin");
const OpenAI = require("openai");
const { authAndLimit } = require("./rateLimit");
const {
  secureResponse,
  validateAmount,
  validateCategory,
  validateDate,
  validateString,
  sanitize,
} = require("./security");
const { checkAiKillSwitch } = require("./aiConfig");

//////////////////////////////////////////////////////
// OPENAI CLIENT
//////////////////////////////////////////////////////

function getOpenAIClient() {
  return new OpenAI({
    apiKey:   process.env.AZURE_OPENAI_KEY,
    baseURL:  `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`,
  });
}

//////////////////////////////////////////////////////
// FIREBASE INIT
//////////////////////////////////////////////////////

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

//////////////////////////////////////////////////////
// VALIDATE CLAIM
//////////////////////////////////////////////////////

app.http("validateClaim", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      ////////////////////////////////////////////////////
      // AUTH + RATE LIMIT (10 submissions per minute)
      ////////////////////////////////////////////////////

      const auth = await authAndLimit(request, "rateLimitValidate", 10);
      if (auth.error) return auth.error;

      // uid from verified token — never trust body
      const userId = auth.uid;

      const {
        amount,
        category,
        purchaseDate,
        receiptUrl,
        merchant,
        userEmail
      } = await request.json();

      ////////////////////////////////////////////////////
      // INPUT VALIDATION (security.js)
      ////////////////////////////////////////////////////

      const amountResult = validateAmount(amount);
      if (amountResult.fieldError)
        return secureResponse({ valid: false, reason: amountResult.fieldError }, 400);

      const categoryResult = validateCategory(category);
      if (categoryResult.fieldError)
        return secureResponse({ valid: false, reason: categoryResult.fieldError }, 400);

      const dateResult = validateDate(purchaseDate, "purchaseDate");
      if (dateResult.fieldError)
        return secureResponse({ valid: false, reason: dateResult.fieldError }, 400);

      const merchantResult = validateString(merchant, "merchant", { maxLen: 200 });
      if (merchantResult.fieldError)
        return secureResponse({ valid: false, reason: merchantResult.fieldError }, 400);

      const numericAmount = amountResult.value;
      const cleanMerchant = sanitize(merchantResult.value);
      const cleanUserEmail = sanitize(userEmail ?? "");

      ////////////////////////////////////////////////////
      // FIND USER ORG
      ////////////////////////////////////////////////////

      const membershipSnap = await db
        .collection("memberships")
        .where("userId", "==", userId)
        .where("status", "==", "approved")
        .limit(1)
        .get();

      if (membershipSnap.empty)
        return secureResponse({ valid: false, reason: "User not assigned to an approved organisation." }, 400);

      const orgId = membershipSnap.docs[0].data().orgId;

      ////////////////////////////////////////////////////
      // FREE TIER MONTHLY CLAIM LIMIT
      ////////////////////////////////////////////////////

      // Monthly caps per plan — keep in sync with planLimits.js
      const MONTHLY_CLAIM_LIMITS = { free: 10, trial: null, pro: null, business: null };

      const orgDoc  = await db.collection("organisations").doc(orgId).get();
      const orgPlan = orgDoc.data()?.plan ?? "free";
      const monthlyLimit = MONTHLY_CLAIM_LIMITS[orgPlan] ?? null;

      if (monthlyLimit !== null) {
        const now          = new Date();
        const startOfMonth = admin.firestore.Timestamp.fromDate(
          new Date(now.getFullYear(), now.getMonth(), 1)
        );

        const monthClaimsSnap = await db
          .collection("claims")
          .where("userId",    "==", userId)
          .where("createdAt", ">=", startOfMonth)
          .get();

        if (monthClaimsSnap.size >= monthlyLimit) {
          return secureResponse(
            { valid: false, reason: `Free plan limit reached. You can submit up to ${monthlyLimit} claims per month. Upgrade to Pro for unlimited submissions.` },
            403
          );
        }
      }

      ////////////////////////////////////////////////////
      // LOAD + APPLY POLICIES
      ////////////////////////////////////////////////////

      const policiesSnap = await db
        .collection("policies")
        .where("orgId", "==", orgId)
        .get();

      // All limits start as null (inactive) — only activated if admin creates a policy
      let receiptThreshold    = null;  // null = no receipt requirement
      let submissionWindowDays = null; // null = no submission window
      const categoryLimits    = {};   // empty = no category limits

      policiesSnap.forEach(doc => {
        const policy = doc.data();
        if (policy.type === "receipt_required" && policy.value != null)
          receiptThreshold = policy.value;
        if (policy.type === "category_limit" && policy.category && policy.value != null)
          categoryLimits[policy.category] = policy.value;
        if (policy.type === "submission_window" && policy.value != null)
          submissionWindowDays = policy.value;
      });

      ////////////////////////////////////////////////////
      // RECEIPT POLICY (only enforced if admin has set one)
      ////////////////////////////////////////////////////

      const hasReceipt = !!receiptUrl;

      if (receiptThreshold !== null && numericAmount > receiptThreshold && !hasReceipt)
        return secureResponse({ valid: false, reason: `Receipt required for expenses above £${receiptThreshold}.` }, 400);

      ////////////////////////////////////////////////////
      // CATEGORY LIMIT (only enforced if admin has set one)
      ////////////////////////////////////////////////////

      if (category in categoryLimits && numericAmount > categoryLimits[category])
        return secureResponse({ valid: false, reason: `${category} expenses are limited to £${categoryLimits[category]} per claim.` }, 400);

      ////////////////////////////////////////////////////
      // SUBMISSION WINDOW (only enforced if admin has set one)
      ////////////////////////////////////////////////////

      const diffDays = (Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24);

      if (submissionWindowDays !== null && diffDays > submissionWindowDays)
        return secureResponse({ valid: false, reason: `Submission window expired. Claims must be submitted within ${submissionWindowDays} days of purchase.` }, 400);

      ////////////////////////////////////////////////////
      // AI GENERAL-RULE POLICY CHECK
      // Runs any policy stored as "general_rule" (or any
      // unrecognised type) through an LLM compliance check.
      ////////////////////////////////////////////////////

      const MECHANICAL_TYPES = new Set(["receipt_required", "category_limit", "submission_window", "approval_required"]);

      const generalPolicies = [];
      policiesSnap.forEach(doc => {
        const p = doc.data();
        if (!MECHANICAL_TYPES.has(p.type)) {
          generalPolicies.push(p.displayText || p.originalText);
        }
      });

      if (generalPolicies.length > 0) {
        // Check kill switch before making AI call
        const aiBlocked = await checkAiKillSwitch("validateClaim");
        if (aiBlocked) {
          // Kill switch active — skip AI check, fail open
          context.log("AI kill switch active for validateClaim — skipping policy AI check");
        } else
        try {
          const aiClient = getOpenAIClient();

          const compliancePrompt = `You are a strict expense policy compliance checker for a company.

Expense claim submitted:
- Merchant: ${cleanMerchant}
- Amount: £${numericAmount}
- Category: ${category}
- Purchase date: ${purchaseDate}

Company policies to check against:
${generalPolicies.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Does this expense claim violate ANY of the above policies?

Reply with JSON only — no explanation outside the JSON:
{"violated": true or false, "reason": "Which policy was violated and why (one sentence), or null if none violated"}`;

          const completion = await aiClient.chat.completions.create({
            model:       process.env.AZURE_OPENAI_DEPLOYMENT,
            messages: [
              { role: "system", content: "You enforce company expense policies. Be precise and strict." },
              { role: "user",   content: compliancePrompt },
            ],
            temperature: 0,
            max_tokens:  120,
          });

          const raw = completion?.choices?.[0]?.message?.content ?? "";

          const cleaned = raw
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/, "")
            .trim();

          let aiResult;
          try { aiResult = JSON.parse(cleaned); } catch { /* fail open */ }

          if (aiResult?.violated === true) {
            return secureResponse(
              { valid: false, reason: aiResult.reason || "This expense violates a company policy." },
              400
            );
          }

        } catch (aiErr) {
          context.log("AI policy check error (non-fatal):", aiErr);
          // Fail open — do not block the claim if the AI check itself errors
        }
      }

      ////////////////////////////////////////////////////
      // SAVE CLAIM
      ////////////////////////////////////////////////////

      const claimRef = await db.collection("claims").add({
        userId,
        userEmail: cleanUserEmail,
        orgId,
        merchant: cleanMerchant,
        amount: numericAmount,
        category,
        purchaseDate,
        receiptUrl: receiptUrl ?? null,
        hasReceipt,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      ////////////////////////////////////////////////////
      // RESPONSE — HTTPS headers via secureResponse
      ////////////////////////////////////////////////////

      return secureResponse({ valid: true, claimId: claimRef.id, status: "pending" }, 200);

    } catch (error) {

      context.log("VALIDATE CLAIM ERROR:", error);
      return secureResponse({ valid: false, reason: "Internal server error." }, 500);

    }

  }

});