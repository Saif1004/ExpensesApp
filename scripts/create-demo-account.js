/**
 * Creates Apple Review demo accounts in Firebase.
 *
 * Credentials and the service-account key are read from environment variables
 * so they are never committed to source control.
 *
 * Required env vars (set in your shell or a local .env file — never commit):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY      ← paste the full PEM, newlines as \n
 *   DEMO_ADMIN_EMAIL
 *   DEMO_ADMIN_PASSWORD
 *   DEMO_EMP_EMAIL
 *   DEMO_EMP_PASSWORD
 *
 * Run: node scripts/create-demo-account.js
 */

// Load .env.demo so the private key (multi-line) is parsed correctly
require("../node_modules/dotenv").config({ path: __dirname + "/.env.demo" });

const admin = require("../expense-functions/node_modules/firebase-admin");

// ── Credentials from environment — never hardcoded ────────────────────────
const projectId   = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL;
const EMP_EMAIL   = process.env.DEMO_EMP_EMAIL;
const ADMIN_PW    = process.env.DEMO_ADMIN_PASSWORD;
const EMP_PW      = process.env.DEMO_EMP_PASSWORD;

const ADMIN_USERNAME = "applereview";
const EMP_USERNAME   = "appleemployee";

// Guard: fail fast if any required var is missing
const missing = [
  ["FIREBASE_PROJECT_ID",   projectId],
  ["FIREBASE_CLIENT_EMAIL", clientEmail],
  ["FIREBASE_PRIVATE_KEY",  privateKey],
  ["DEMO_ADMIN_EMAIL",      ADMIN_EMAIL],
  ["DEMO_ADMIN_PASSWORD",   ADMIN_PW],
  ["DEMO_EMP_EMAIL",        EMP_EMAIL],
  ["DEMO_EMP_PASSWORD",     EMP_PW],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error("Missing required environment variables:", missing.join(", "));
  console.error("Set them in your shell before running this script.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db   = admin.firestore();
const auth = admin.auth();
const TS   = admin.firestore.Timestamp;
const now  = () => TS.now();

// helper — create or fetch existing user
async function upsertUser(email, password, displayName) {
  try {
    return await auth.createUser({ email, password, displayName, emailVerified: true });
  } catch (e) {
    if (e.code === "auth/email-already-exists") {
      const u = await auth.getUserByEmail(email);
      await auth.updateUser(u.uid, { password, displayName, emailVerified: true });
      return u;
    }
    throw e;
  }
}

async function run() {
  console.log("Creating demo accounts…");

  // ── 1. Create Firebase Auth users ────────────────────────────────────
  const adminUser = await upsertUser(ADMIN_EMAIL, ADMIN_PW, "Alex Johnson (Demo)");
  const empUser   = await upsertUser(EMP_EMAIL,   EMP_PW,   "Sam Taylor (Demo)");
  const adminUid  = adminUser.uid;
  const empUid    = empUser.uid;

  console.log("Admin UID  :", adminUid);
  console.log("Emp UID    :", empUid);

  // ── 2. Org ────────────────────────────────────────────────────────────
  const orgRef = db.collection("organisations").doc();
  const orgId  = orgRef.id;

  // ── 3. Firestore documents ────────────────────────────────────────────
  const batch = db.batch();

  batch.set(db.collection("users").doc(adminUid), {
    uid:           adminUid,
    email:         ADMIN_EMAIL,
    displayName:   "Alex Johnson (Demo)",
    username:      ADMIN_USERNAME,
    plan:          "business",
    termsAccepted: true,
    createdAt:     now(),
  }, { merge: true });

  batch.set(db.collection("users").doc(empUid), {
    uid:           empUid,
    email:         EMP_EMAIL,
    displayName:   "Sam Taylor (Demo)",
    username:      EMP_USERNAME,
    plan:          "business",
    termsAccepted: true,
    createdAt:     now(),
  }, { merge: true });

  batch.set(db.collection("usernames").doc(ADMIN_USERNAME), { uid: adminUid, email: ADMIN_EMAIL }, { merge: true });
  batch.set(db.collection("usernames").doc(EMP_USERNAME),   { uid: empUid,   email: EMP_EMAIL   }, { merge: true });

  batch.set(orgRef, {
    name:                "Claimio Demo Ltd",
    ownerId:             adminUid,
    plan:                "business",
    inviteCode:          "DEMO01",
    categories:          ["Meals", "Travel", "Technology", "Office"],
    orgAdmins:           [],
    aiCreditsRemaining:  150,
    aiUsage:             0,
    createdAt:           now(),
  });

  const adminMemberRef = db.collection("memberships").doc();
  batch.set(adminMemberRef, {
    userId:    adminUid,
    orgId,
    role:      "admin",
    status:    "approved",
    createdAt: now(),
  });

  const empMemberRef = db.collection("memberships").doc();
  batch.set(empMemberRef, {
    userId:    empUid,
    orgId,
    role:      "employee",
    status:    "approved",
    createdAt: now(),
  });

  await batch.commit();
  console.log("Org ID     :", orgId);

  // ── 4. Sample claims ──────────────────────────────────────────────────
  const daysAgo = d => TS.fromDate(new Date(Date.now() - d * 86400000));

  const claims = [
    { userId: empUid,   merchant: "Costa Coffee",   amount: 12.50,  category: "Meals",      status: "approved", purchaseDate: "2026-04-28", adminFeedback: "Approved — team meeting.",         createdAt: daysAgo(11), approvedAt: daysAgo(10) },
    { userId: empUid,   merchant: "Uber",            amount: 22.00,  category: "Travel",     status: "approved", purchaseDate: "2026-04-25", adminFeedback: "Approved.",                        createdAt: daysAgo(14), approvedAt: daysAgo(13) },
    { userId: empUid,   merchant: "Tesco Extra",     amount: 34.20,  category: "Meals",      status: "rejected", purchaseDate: "2026-04-20", adminFeedback: "Personal shopping — not covered.", createdAt: daysAgo(19) },
    { userId: empUid,   merchant: "British Airways", amount: 245.00, category: "Travel",     status: "pending",  purchaseDate: "2026-05-01", createdAt: daysAgo(8) },
    { userId: empUid,   merchant: "Tech Store",      amount: 89.99,  category: "Technology", status: "pending",  purchaseDate: "2026-05-05", createdAt: daysAgo(4) },
    { userId: empUid,   merchant: "Staples",         amount: 47.60,  category: "Office",     status: "pending",  purchaseDate: "2026-05-06", createdAt: daysAgo(3) },
    { userId: adminUid, merchant: "Hilton London",   amount: 320.00, category: "Travel",     status: "approved", purchaseDate: "2026-04-15", adminFeedback: "Approved — client visit.",         createdAt: daysAgo(24), approvedAt: daysAgo(23) },
    { userId: adminUid, merchant: "Slack Pro",       amount: 15.00,  category: "Technology", status: "approved", purchaseDate: "2026-04-30", adminFeedback: "Approved.",                        createdAt: daysAgo(9),  approvedAt: daysAgo(8)  },
  ];

  for (const c of claims) {
    await db.collection("claims").add({ orgId, receiptUrl: "", description: "", ...c });
  }

  console.log(`Added ${claims.length} sample claims.`);
  console.log("\n✅  Done!\n");
  console.log("Admin email    :", ADMIN_EMAIL);
  console.log("Employee email :", EMP_EMAIL);
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
