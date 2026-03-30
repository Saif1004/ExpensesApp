const { app } = require("@azure/functions");
const admin = require("firebase-admin");
const { authAndLimit } = require("./rateLimit");
const {
  secureResponse,
  validateAmount,
  validateCategory,
  validateDate,
  validateString,
  sanitize,
} = require("./security");

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
      // LOAD + APPLY POLICIES
      ////////////////////////////////////////////////////

      const policiesSnap = await db
        .collection("policies")
        .where("orgId", "==", orgId)
        .get();

      let receiptThreshold = 25;
      const categoryLimits = { Meals: 50, Travel: 300, Office: 500, Technology: 3000 };

      policiesSnap.forEach(doc => {
        const policy = doc.data();
        if (policy.type === "receipt_required") receiptThreshold = policy.value ?? receiptThreshold;
        if (policy.type === "category_limit" && policy.category) categoryLimits[policy.category] = policy.value;
      });

      ////////////////////////////////////////////////////
      // RECEIPT POLICY
      ////////////////////////////////////////////////////

      const hasReceipt = !!receiptUrl;

      if (numericAmount > receiptThreshold && !hasReceipt)
        return secureResponse({ valid: false, reason: `Receipt required for expenses above £${receiptThreshold}.` }, 400);

      ////////////////////////////////////////////////////
      // CATEGORY LIMIT
      ////////////////////////////////////////////////////

      if (numericAmount > (categoryLimits[category] ?? Infinity))
        return secureResponse({ valid: false, reason: `${category} limit exceeded.` }, 400);

      ////////////////////////////////////////////////////
      // SUBMISSION WINDOW (30 days)
      ////////////////////////////////////////////////////

      const diffDays = (Date.now() - new Date(purchaseDate).getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays > 30)
        return secureResponse({ valid: false, reason: "Submission window expired (30 days)." }, 400);

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