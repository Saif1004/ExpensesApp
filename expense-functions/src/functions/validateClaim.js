const { app } = require("@azure/functions");
const admin = require("firebase-admin");

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
// VALIDATE CLAIM FUNCTION
//////////////////////////////////////////////////////

app.http("validateClaim", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {

      //////////////////////////////////////////////////////
      // READ BODY
      //////////////////////////////////////////////////////

      const {
        amount,
        category,
        purchaseDate,
        receiptUrl,
        userId,
        merchant,
        userEmail
      } = await request.json();

      //////////////////////////////////////////////////////
      // BASIC VALIDATION
      //////////////////////////////////////////////////////

      if (!amount || !category || !purchaseDate || !userId || !merchant?.trim()) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Missing required fields."
          }
        };
      }

      const numericAmount = Number(amount);

      if (isNaN(numericAmount) || numericAmount <= 0) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Invalid amount."
          }
        };
      }

      //////////////////////////////////////////////////////
      // CATEGORY VALIDATION
      //////////////////////////////////////////////////////

      const VALID_CATEGORIES = ["Meals","Travel","Office","Technology"];

      if (!VALID_CATEGORIES.includes(category)) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Invalid category."
          }
        };
      }

      //////////////////////////////////////////////////////
      // PURCHASE DATE VALIDATION
      //////////////////////////////////////////////////////

      const expenseDate = new Date(purchaseDate);

      if (isNaN(expenseDate.getTime())) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Invalid purchase date."
          }
        };
      }

      //////////////////////////////////////////////////////
      // FIND USER ORGANISATION
      //////////////////////////////////////////////////////

      const membershipSnap = await db
        .collection("memberships")
        .where("userId", "==", userId)
        .limit(1)
        .get();

      if (membershipSnap.empty) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "User not assigned to organisation."
          }
        };
      }

      const orgId = membershipSnap.docs[0].data().orgId;

      //////////////////////////////////////////////////////
      // LOAD POLICIES
      //////////////////////////////////////////////////////

      const policiesSnap = await db
        .collection("policies")
        .where("orgId", "==", orgId)
        .get();

      let receiptThreshold = 25;

      const categoryLimits = {
        Meals: 50,
        Travel: 300,
        Office: 500,
        Technology: 3000
      };

      policiesSnap.forEach(doc => {

        const text = doc.data().title.toLowerCase();

        const numberMatch = text.match(/\d+/);
        const value = numberMatch ? Number(numberMatch[0]) : null;

        if (text.includes("receipt") && value) {
          receiptThreshold = value;
        }

        if (text.includes("meal") && value) {
          categoryLimits.Meals = value;
        }

        if (text.includes("travel") && value) {
          categoryLimits.Travel = value;
        }

        if (text.includes("office") && value) {
          categoryLimits.Office = value;
        }

        if (text.includes("technology") && value) {
          categoryLimits.Technology = value;
        }

      });

      //////////////////////////////////////////////////////
      // RECEIPT POLICY
      //////////////////////////////////////////////////////

      const hasReceipt = !!receiptUrl;

      if (numericAmount > receiptThreshold && !hasReceipt) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: `Receipt required above £${receiptThreshold}`
          }
        };
      }

      //////////////////////////////////////////////////////
      // CATEGORY LIMIT POLICY
      //////////////////////////////////////////////////////

      if (numericAmount > categoryLimits[category]) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: `${category} limit exceeded`
          }
        };
      }

      //////////////////////////////////////////////////////
      // DATE WINDOW POLICY
      //////////////////////////////////////////////////////

      const today = new Date();

      const diffDays =
        (today.getTime() - expenseDate.getTime()) /
        (1000 * 60 * 60 * 24);

      if (diffDays > 30) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Submission window expired."
          }
        };
      }

      //////////////////////////////////////////////////////
      // DUPLICATE DETECTION
      //////////////////////////////////////////////////////

      const duplicate = await db
        .collection("claims")
        .where("userId", "==", userId)
        .where("amount", "==", numericAmount)
        .where("purchaseDate", "==", purchaseDate)
        .get();

      if (!duplicate.empty) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Duplicate expense detected."
          }
        };
      }

      //////////////////////////////////////////////////////
      // ANOMALY DETECTION
      //////////////////////////////////////////////////////

      const history = await db
        .collection("claims")
        .where("userId", "==", userId)
        .where("category", "==", category)
        .get();

      let anomalyScore = 1;
      let anomalous = false;

      if (!history.empty) {

        const amounts = history.docs
          .map(d => d.data().amount)
          .filter(v => typeof v === "number");

        const avg =
          amounts.reduce((a, b) => a + b, 0) /
          amounts.length;

        if (avg > 0) {
          anomalyScore = numericAmount / avg;
          if (anomalyScore > 3) anomalous = true;
        }

      }

      //////////////////////////////////////////////////////
      // AUTO APPROVAL
      //////////////////////////////////////////////////////

      let status = "pending";

      if (numericAmount <= 50 && hasReceipt && !anomalous) {
        status = "approved";
      }

      //////////////////////////////////////////////////////
      // SAVE CLAIM
      //////////////////////////////////////////////////////

      const claimRef = await db.collection("claims").add({

        userId,
        userEmail,
        orgId,

        merchant: merchant.trim(),
        amount: numericAmount,
        category,
        purchaseDate,

        receiptUrl,
        hasReceipt,

        status,

        anomalous,
        anomalyScore,

        appliedPolicies: policiesSnap.docs.map(p => p.data().title),

        createdAt: admin.firestore.FieldValue.serverTimestamp()

      });

      //////////////////////////////////////////////////////
      // RESPONSE
      //////////////////////////////////////////////////////

      return {
        status: 200,
        jsonBody: {
          valid: true,
          claimId: claimRef.id,
          status
        }
      };

    } catch (error) {

      context.log("ERROR:", error);

      return {
        status: 500,
        jsonBody: {
          valid: false,
          reason: "Internal server error."
        }
      };

    }
  }
});