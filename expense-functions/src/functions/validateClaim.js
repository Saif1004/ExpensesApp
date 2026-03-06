const { app } = require("@azure/functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !process.env.FIREBASE_PRIVATE_KEY
  ) {
    throw new Error("Firebase environment variables not set.");
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

app.http("validateClaim", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {
      const body = await request.json();

      const {
        amount,
        category,
        purchaseDate,
        receiptUrl,
        userId,
        merchant,
        userEmail
      } = body;

      if (
        amount === undefined ||
        category === undefined ||
        purchaseDate === undefined ||
        userId === undefined ||
        merchant === undefined
      ) {
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

      if (!merchant.trim()) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Merchant name required."
          }
        };
      }

      const CATEGORY_LIMITS = {
        Meals: 50,
        Travel: 300,
        Office: 500,
        Technology: 3000
      };

      if (!CATEGORY_LIMITS.hasOwnProperty(category)) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Invalid category."
          }
        };
      }

      if (numericAmount > CATEGORY_LIMITS[category]) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Amount exceeds category limit."
          }
        };
      }

      const today = new Date();
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

      if (expenseDate > today) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Future dates not allowed."
          }
        };
      }

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

      const duplicateQuery = await db
        .collection("claims")
        .where("userId", "==", userId)
        .where("amount", "==", numericAmount)
        .where("purchaseDate", "==", purchaseDate)
        .get();

      if (!duplicateQuery.empty) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Duplicate expense detected."
          }
        };
      }

      const previousClaims = await db
        .collection("claims")
        .where("userId", "==", userId)
        .where("category", "==", category)
        .get();

      const suspicious = previousClaims.size >= 5;

      let anomalyScore = 1;
      let anomalous = false;

      if (!previousClaims.empty) {
        const amounts = previousClaims.docs
          .map(doc => doc.data().amount)
          .filter(v => typeof v === "number");

        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;

        if (avg > 0) {
          anomalyScore = numericAmount / avg;

          if (anomalyScore > 3) {
            anomalous = true;
          }
        }
      }

      const hasReceipt = !!receiptUrl;

      context.log("Receipt URL received:", receiptUrl);

      let status = "pending";

      if (
        numericAmount <= 50 &&
        hasReceipt &&
        !suspicious &&
        !anomalous
      ) {
        status = "approved";
      }

      const claimData = {
        userId,
        userEmail,
        merchant: merchant.trim(),
        amount: numericAmount,
        category,
        purchaseDate,
        hasReceipt,
        receiptUrl: receiptUrl || null,
        status,
        suspicious,
        anomalous,
        anomalyScore,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const claimRef = await db.collection("claims").add(claimData);

      return {
        status: 200,
        jsonBody: {
          valid: true,
          claimId: claimRef.id,
          status,
          suspicious,
          anomalous,
          anomalyScore
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