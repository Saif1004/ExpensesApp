const { app } = require("@azure/functions");
const admin = require("firebase-admin");

// =============================
// Firebase Admin Initialization
// =============================

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

// =============================
// Expense Validation Function
// =============================

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
        hasReceipt,
        userId,
        merchant,
        userEmail
      } = body;

      // =============================
      // 1️⃣ Required Field Validation
      // =============================

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
            reason: "Missing required fields.",
          },
        };
      }

      const numericAmount = Number(amount);

      if (isNaN(numericAmount) || numericAmount <= 0) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Invalid amount.",
          },
        };
      }

      // =============================
      // 2️⃣ Category Limits
      // =============================

      const CATEGORY_LIMITS = {
        Meals: 50,
        Travel: 300,
        Office: 500,
        Technology: 3000,
      };

      if (!CATEGORY_LIMITS.hasOwnProperty(category)) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Invalid category.",
          },
        };
      }

      if (numericAmount > CATEGORY_LIMITS[category]) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Amount exceeds category limit.",
          },
        };
      }

      // =============================
      // 3️⃣ Purchase Date Validation
      // =============================

      const today = new Date();
      const expenseDate = new Date(purchaseDate);

      if (isNaN(expenseDate.getTime())) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Invalid purchase date.",
          },
        };
      }

      if (expenseDate > today) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Future dates not allowed.",
          },
        };
      }

      // =============================
      // 4️⃣ 30 Day Submission Window
      // =============================

      const diffDays =
        (today.getTime() - expenseDate.getTime()) /
        (1000 * 60 * 60 * 24);

      if (diffDays > 30) {
        return {
          status: 400,
          jsonBody: {
            valid: false,
            reason: "Submission window expired.",
          },
        };
      }

      // =============================
      // 5️⃣ Duplicate Expense Check
      // =============================

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
            reason: "Duplicate expense detected.",
          },
        };
      }

      // =============================
      // 6️⃣ Suspicious Pattern Detection
      // =============================

      const previousClaims = await db
        .collection("claims")
        .where("userId", "==", userId)
        .where("category", "==", category)
        .get();

      const suspicious = previousClaims.size >= 5;

      // =============================
      // 7️⃣ AI Spending Anomaly Detection
      // =============================

      let anomalyScore = 0;
      let anomalous = false;

      if (!previousClaims.empty) {
        const amounts = previousClaims.docs.map(
          (doc) => doc.data().amount
        );

        const avg =
          amounts.reduce((a, b) => a + b, 0) / amounts.length;

        anomalyScore = numericAmount / avg;

        if (anomalyScore > 3) {
          anomalous = true;
        }
      }

      // =============================
      // 8️⃣ Auto Approval Logic
      // =============================

      let status = "pending";

      if (numericAmount <= 50 && hasReceipt === true && !suspicious) {
        status = "approved";
      }

      // =============================
      // 9️⃣ Save Claim
      // =============================

      const claimRef = await db.collection("claims").add({
        userId,
        userEmail,
        merchant,
        amount: numericAmount,
        category,
        purchaseDate,
        hasReceipt: Boolean(hasReceipt),
        status,
        suspicious,
        anomalyScore,
        anomalous,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // =============================
      // ✅ Success
      // =============================

      return {
        status: 200,
        jsonBody: {
          valid: true,
          claimId: claimRef.id,
          status,
          suspicious,
          anomalous,
          anomalyScore,
        },
      };

    } catch (error) {
      context.log("ERROR:", error);

      return {
        status: 500,
        jsonBody: {
          valid: false,
          reason: "Internal server error.",
        },
      };
    }
  },
});