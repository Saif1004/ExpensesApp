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
const { sendEmail, sendPush, newClaimAdminEmail } = require("./notify");
const PLAN_LIMITS = require("./planLimits");
const { checkAndDeductCredit } = require("./aiCredits");

// lazy openai client so the api key is resolved at call time

function getOpenAIClient() {
  return new OpenAI({
    apiKey:   process.env.AZURE_OPENAI_KEY,
    baseURL:  `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1`,
  });
}

// firebase init (skip if already done)

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

// main handler — validates and saves the expense claim

app.http("validateClaim", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      // auth check + rate limit, 10 submissions per minute

      const auth = await authAndLimit(request, "rateLimitValidate", 10);
      if (auth.error) return auth.error;

      // always pull uid from the token, not the request body
      const userId = auth.uid;

      const {
        amount,
        category,
        purchaseDate,
        receiptUrl,
        merchant,
        userEmail
      } = await request.json();

      // run all fields through the validators in security.js

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

      // figure out which org this user belongs to

      const membershipSnap = await db
        .collection("memberships")
        .where("userId", "==", userId)
        .where("status", "==", "approved")
        .limit(1)
        .get();

      if (membershipSnap.empty)
        return secureResponse({ valid: false, reason: "User not assigned to an approved organisation." }, 400);

      const orgId = membershipSnap.docs[0].data().orgId;

      // enforce the monthly claim cap based on the org's plan

      const orgRef  = db.collection("organisations").doc(orgId);
      const orgDoc  = await orgRef.get();
      const orgData = orgDoc.data() || {};

      // treat expired trials as free
      let orgPlan = orgData.plan ?? "free";
      if (orgPlan === "trial") {
        const trialEndsAt = orgData.trialEndsAt?.toDate?.() ?? null;
        if (trialEndsAt && trialEndsAt < new Date()) orgPlan = "free";
      }

      const planConfig   = PLAN_LIMITS[orgPlan] || PLAN_LIMITS.free;
      const monthlyLimit = planConfig.claimsPerMonth ?? null;

      if (monthlyLimit !== null) {
        // filter by user first, then narrow by date in memory to avoid a composite index
        const now           = new Date();
        const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);

        const userClaimsSnap = await db
          .collection("claims")
          .where("userId", "==", userId)
          .get();

        const monthCount = userClaimsSnap.docs.filter(d => {
          const createdAt = d.data().createdAt?.toDate?.() ?? null;
          return createdAt && createdAt >= startOfMonth;
        }).length;

        if (monthCount >= monthlyLimit) {
          const planLabel = orgPlan === "trial" ? "trial" : "free plan";
          return secureResponse(
            { valid: false, reason: `Monthly limit reached. You can submit up to ${monthlyLimit} claims per month on the ${planLabel}. Upgrade to Pro for unlimited submissions.` },
            403
          );
        }
      }

      // pull the org's policies and set defaults before applying them

      const policiesSnap = await db
        .collection("policies")
        .where("orgId", "==", orgId)
        .get();

      // everything is null by default — only kicks in if the admin actually created a policy
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

      // check receipt requirement if the admin has configured one

      const hasReceipt = !!receiptUrl;

      if (receiptThreshold !== null && numericAmount > receiptThreshold && !hasReceipt)
        return secureResponse({ valid: false, reason: `Receipt required for expenses above £${receiptThreshold}.` }, 400);

      // block if the amount exceeds a per-category cap the admin set

      if (category in categoryLimits && numericAmount > categoryLimits[category])
        return secureResponse({ valid: false, reason: `${category} expenses are limited to £${categoryLimits[category]} per claim.` }, 400);

      // reject if the claim is too old and the admin has a submission window set

      const diffDays = (Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24);

      if (submissionWindowDays !== null && diffDays > submissionWindowDays)
        return secureResponse({ valid: false, reason: `Submission window expired. Claims must be submitted within ${submissionWindowDays} days of purchase.` }, 400);

      // send any free-text / unrecognised policies through the LLM to check compliance

      const MECHANICAL_TYPES = new Set(["receipt_required", "category_limit", "submission_window", "approval_required"]);

      const generalPolicies = [];
      policiesSnap.forEach(doc => {
        const p = doc.data();
        if (!MECHANICAL_TYPES.has(p.type)) {
          generalPolicies.push(p.displayText || p.originalText);
        }
      });

      if (generalPolicies.length > 0) {
        // bail out early if AI has been disabled
        const aiBlocked = await checkAiKillSwitch("validateClaim");
        if (aiBlocked) {
          // AI is off, skip the check and let it through
          context.log("AI kill switch active for validateClaim — skipping policy AI check");
        } else
        try {
          // use one AI credit for this check
          const { creditError: policyCheckCreditError } = await checkAndDeductCredit(orgRef, orgData, planConfig, orgPlan);
          if (policyCheckCreditError) {
            // out of credits, skip the AI check and let it through
            context.log("No AI credits remaining — skipping policy AI check");
          } else {

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
          try { aiResult = JSON.parse(cleaned); } catch { /* swallow it */ }

          if (aiResult?.violated === true) {
            return secureResponse(
              { valid: false, reason: aiResult.reason || "This expense violates a company policy." },
              400
            );
          }

          }
        } catch (aiErr) {
          context.log("AI policy check error (non-fatal):", aiErr);
          // AI errored out, let the claim through rather than blocking it
        }
      }

      // all checks passed, write the claim to firestore

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

      // ping admins in the background so the response isn't held up

      (async () => {
        try {
          const adminSnap = await db.collection("memberships")
            .where("orgId",  "==", orgId)
            .where("role",   "==", "admin")
            .where("status", "==", "approved")
            .get();

          await Promise.all(adminSnap.docs.map(async (memberDoc) => {
            const adminUserId = memberDoc.data().userId;
            const adminUserDoc = await db.collection("users").doc(adminUserId).get();
            if (!adminUserDoc.exists) return;
            const adminUser = adminUserDoc.data();
            const adminName = adminUser.displayName || adminUser.email || "Admin";

            const pushTitle = "New Expense Claim";
            const pushBody  = `${cleanUserEmail} submitted a £${numericAmount.toFixed(2)} claim at ${cleanMerchant}`;

            if (adminUser.expoPushToken && adminUser.notifPushEnabled !== false) {
              await sendPush(adminUser.expoPushToken, pushTitle, pushBody, { claimId: claimRef.id }).catch(() => {});
            }
            if (adminUser.email && adminUser.notifEmailEnabled !== false) {
              const html = newClaimAdminEmail({
                adminName,
                employeeEmail: cleanUserEmail,
                amount:   numericAmount.toFixed(2),
                merchant: cleanMerchant,
                category,
              });
              await sendEmail(adminUser.email, `New claim: £${numericAmount.toFixed(2)} from ${cleanUserEmail}`, html).catch(() => {});
            }
          }));
        } catch (notifyErr) {
          context.warn("Admin notification failed:", notifyErr?.message);
        }
      })();

      // done, send back the claim id with security headers

      return secureResponse({ valid: true, claimId: claimRef.id, status: "pending" }, 200);

    } catch (error) {

      context.log("VALIDATE CLAIM ERROR:", error);
      return secureResponse({ valid: false, reason: "Internal server error." }, 500);

    }

  }

});