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
      } = body;

      // =============================
      // 1️⃣ Required Field Validation
      // =============================

      if (
        amount === undefined ||
        category === undefined ||
        purchaseDate === undefined ||
        userId === undefined
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
            reason: "Future dates are not allowed.",
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
        .collection("expenses")
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

      const recentExpenses = await db
        .collection("expenses")
        .where("userId", "==", userId)
        .where("category", "==", category)
        .get();

      const suspicious = recentExpenses.size >= 5;

      // =============================
      // 7️⃣ Auto Approval Logic
      // =============================

      let status = "Pending";

      if (numericAmount <= 50 && hasReceipt === true && !suspicious) {
        status = "Approved";
      }

      // =============================
      // 8️⃣ Save Expense
      // =============================

      await db.collection("expenses").add({
        userId,
        amount: numericAmount,
        category,
        purchaseDate,
        hasReceipt: Boolean(hasReceipt),
        status,
        suspicious,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // =============================
      // ✅ Success Response
      // =============================

      return {
        status: 200,
        jsonBody: {
          valid: true,
          status,
          suspicious,
        },
      };

    } catch (error) {
      context.log("❌ ERROR:", error);

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