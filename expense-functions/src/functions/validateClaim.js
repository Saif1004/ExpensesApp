const admin = require("firebase-admin");

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

module.exports = async function (context, req) {
  try {
    const { amount, category, purchaseDate, hasReceipt, userId } = req.body;

    // =============================
    // 1️⃣ Basic validation
    // =============================

    if (!amount || !category || !purchaseDate || !userId) {
      context.res = {
        status: 400,
        body: { valid: false, reason: "Missing required fields." },
      };
      return;
    }

    const numericAmount = Number(amount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      context.res = {
        status: 400,
        body: { valid: false, reason: "Invalid amount." },
      };
      return;
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

    if (!CATEGORY_LIMITS[category]) {
      context.res = {
        status: 400,
        body: { valid: false, reason: "Invalid category." },
      };
      return;
    }

    if (numericAmount > CATEGORY_LIMITS[category]) {
      context.res = {
        status: 400,
        body: { valid: false, reason: "Amount exceeds category limit." },
      };
      return;
    }

    // =============================
    // 3️⃣ Future Date Block
    // =============================

    const today = new Date();
    const expenseDate = new Date(purchaseDate);

    if (expenseDate > today) {
      context.res = {
        status: 400,
        body: { valid: false, reason: "Future dates are not allowed." },
      };
      return;
    }

    // =============================
    // 4️⃣ Time Window (30 days)
    // =============================

    const diffDays =
      (today.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > 30) {
      context.res = {
        status: 400,
        body: { valid: false, reason: "Submission window expired." },
      };
      return;
    }

    // =============================
    // 5️⃣ Duplicate Detection
    // =============================

    const duplicateQuery = await db
      .collection("expenses")
      .where("userId", "==", userId)
      .where("amount", "==", numericAmount)
      .where("purchaseDate", "==", purchaseDate)
      .get();

    if (!duplicateQuery.empty) {
      context.res = {
        status: 400,
        body: { valid: false, reason: "Duplicate expense detected." },
      };
      return;
    }

    // =============================
    // 6️⃣ Suspicious Pattern Detection
    // =============================

    const recentExpenses = await db
      .collection("expenses")
      .where("userId", "==", userId)
      .where("category", "==", category)
      .get();

    let suspicious = false;

    if (recentExpenses.size >= 5) {
      suspicious = true;
    }

    // =============================
    // 7️⃣ Auto Approval Logic
    // =============================

    let status = "Pending";

    if (numericAmount <= 50 && hasReceipt === true && !suspicious) {
      status = "Approved";
    }

    context.res = {
      status: 200,
      body: {
        valid: true,
        status,
        suspicious,
      },
    };
  } catch (error) {
    context.log("ERROR:", error);

    context.res = {
      status: 500,
      body: { valid: false, reason: "Internal server error." },
    };
  }
};