/**
 * Creates Apple Review demo accounts in Firebase.
 *
 * Admin account  → apple.review@claimio.org  / ClaimioReview1!
 * Employee account → apple.employee@claimio.org / ClaimioReview1!
 *
 * Run: node scripts/create-demo-account.js
 */

const admin = require("../expense-functions/node_modules/firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   "expenseapp-3dafd",
    clientEmail: "firebase-adminsdk-fbsvc@expenseapp-3dafd.iam.gserviceaccount.com",
    privateKey:  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC0B5Nmdy0HLTuh\nYqecxJLK7gdXola7CPW8lYpKuVlQjdZhebykRVUfcvKWwjp6kix0JqxRvtjXDwJB\novP7dc3iaH8o0PW0yDDoC+wATjkl2bFQeU47wz0ZOebIFVxK4AZAyufkMr8l3A+X\nF+zrzK58MnpHVY1d+jsLxQuY59F6fmuwL8o1Yw7Jd3dLHxYd7pmaEFLSBmnIPisx\npgXyxjmMxzMChQbMnQk1SLlRaTDbuHevwD82FLoqu+tU5RIMwWAwr/jNQmm/+5oJ\n82mG6Du1TkXiQ94TUhJ9tWcXrLZn4N3hsSIJd3Xz8qfaLxY6GYz7sYGDNvtft+R/\nj2SVHIE/AgMBAAECggEACULwgs9zuhBKJonIPKjiMl1fdFMuKg4SckKxLBnv7dR2\nKGqWWU8Vy3ni3/2a+45Eii8pI0Vxq1Ki15SV/6Q2VMTycbuaQFQiK/XdDMD5cKiL\n1it/alSncoJHjJiIuHNg7vlhR5ySt9Rj2u6IqjLL8Si5oKzWinSij/7xk0qtvKLp\nIpRFiwCVmUUthc0bpjuOjyKUmP83kcOs4B1xZtbt9CamvJeBsp5yb9Z5Gn4xq9AC\nFprvVhoqV8/cXGdRU8pWS0va7xCabIZyukUVwNdM+kEV6J+q6tKVMHyGpxx7yCtc\nlJJaII/Ob/+PIqxSy34MfBjdUGwOQ+s3GE8cL10BqQKBgQDq/PCfWBHaeUpwzsd4\n5ovGo2jqZ1Z/rPIPoFLN93/XaY7idrNqtehoytNnko4aHOSQKEOcmmzVCtniFkh/\nwG1uKSQg6Wk7C1wQW6RY1JxwX6lD/hjcElv7F1yFSkd52L2hcBjvS41xN+jADlcH\nLnKn6KtWVmni4qyHDCJ04lFehwKBgQDEIJgI8NJayHeHat5H4ekVzklGNEJNup57\nVQMSmiwqPx3SyWFJUJd3DM4Cvgk0SCwuZt92mnqRkIxpRtYltY4jyrbqnO0nLb4B\nN5FQGqiYYYXdDI6p4xUlZ1schjM+j0dSd/pSyoYOUQ2Ag1VYwAl0WCHj2rrlY5vv\nk9UTWY99iQKBgBCrWsJi8/lEi2RPNtU7vYScyO9/3yH1ecJkBBu6R+ZXBZzJANc8\nCj2MzcxWGCCAFjKnuIweZEQEngosvH3bf6fF4Vs4U4+tsZ0zcwgeJO7PymkZWFgc\nMUwxjw2hhEp/doxCMHKhMGpspeUh30iSIe4JUkYwoRhILibyVGtoNo93AoGAVmr6\nMq5SMdg0+sE3EjtTpd0QYlOyh2dcX4GU6gRuw2quLGu5Z0GQi89jksfDbHsEpKmF\ne1AUA8HKbLTetRzrdY/jyzq8MFAycXzXlZE5inMmNcFLt0Ws0p9ZAReMytr9FTRy\nYzqDmRlTtrWnzIRJZi9TN3/wbBTY59aew3jqBekCgYEAw1NONZ9aBDnmzwD7TXGq\nf6tO130q9HFQNCZATbeXMCcVy1yS2urotlLQXGJ51SbNgeLv7NWKt8k1tMT76FaV\n3dZKvDmfH1WHUVHU3CfM/ISxug5caUWQD/0kOyKFd/M4hjdYKqsFX29zKT6vZUlo\nwyqukyGGYWWlZ2zLGcDsR4Y=\n-----END PRIVATE KEY-----\n",
  }),
});

const db   = admin.firestore();
const auth = admin.auth();
const TS   = admin.firestore.Timestamp;
const now  = () => TS.now();

const ADMIN_EMAIL    = "apple.review@claimio.org";
const EMP_EMAIL      = "apple.employee@claimio.org";
const PASSWORD       = "ClaimioReview1!";
const ADMIN_USERNAME = "applereview";
const EMP_USERNAME   = "appleemployee";

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
  const adminUser = await upsertUser(ADMIN_EMAIL, PASSWORD, "Alex Johnson (Demo)");
  const empUser   = await upsertUser(EMP_EMAIL,   PASSWORD, "Sam Taylor (Demo)");
  const adminUid  = adminUser.uid;
  const empUid    = empUser.uid;

  console.log("Admin UID  :", adminUid);
  console.log("Emp UID    :", empUid);

  // ── 2. Org ────────────────────────────────────────────────────────────
  const orgRef = db.collection("organisations").doc();
  const orgId  = orgRef.id;

  // ── 3. Firestore documents ────────────────────────────────────────────
  const batch = db.batch();

  // Admin user doc
  batch.set(db.collection("users").doc(adminUid), {
    uid:           adminUid,
    email:         ADMIN_EMAIL,
    displayName:   "Alex Johnson (Demo)",
    username:      ADMIN_USERNAME,
    plan:          "business",
    termsAccepted: true,
    createdAt:     now(),
  }, { merge: true });

  // Employee user doc
  batch.set(db.collection("users").doc(empUid), {
    uid:           empUid,
    email:         EMP_EMAIL,
    displayName:   "Sam Taylor (Demo)",
    username:      EMP_USERNAME,
    plan:          "business",   // employees inherit org plan
    termsAccepted: true,
    createdAt:     now(),
  }, { merge: true });

  // Username lookup docs
  batch.set(db.collection("usernames").doc(ADMIN_USERNAME), { uid: adminUid, email: ADMIN_EMAIL }, { merge: true });
  batch.set(db.collection("usernames").doc(EMP_USERNAME),   { uid: empUid,   email: EMP_EMAIL   }, { merge: true });

  // Organisation (business plan, unlimited everything)
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

  // Admin membership
  const adminMemberRef = db.collection("memberships").doc();
  batch.set(adminMemberRef, {
    userId:    adminUid,
    orgId,
    role:      "admin",
    status:    "approved",
    createdAt: now(),
  });

  // Employee membership
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
  // Mix of states so all screens are populated when Apple reviews
  const daysAgo = d => TS.fromDate(new Date(Date.now() - d * 86400000));

  const claims = [
    // Employee's own claims (shown on employee's My Claims screen)
    { userId: empUid,   merchant: "Costa Coffee",     amount: 12.50,  category: "Meals",      status: "approved",  purchaseDate: "2026-04-28", adminFeedback: "Approved — team meeting.",  createdAt: daysAgo(11), approvedAt: daysAgo(10) },
    { userId: empUid,   merchant: "Uber",              amount: 22.00,  category: "Travel",     status: "approved",  purchaseDate: "2026-04-25", adminFeedback: "Approved.",                 createdAt: daysAgo(14), approvedAt: daysAgo(13) },
    { userId: empUid,   merchant: "Tesco Extra",       amount: 34.20,  category: "Meals",      status: "rejected",  purchaseDate: "2026-04-20", adminFeedback: "Personal shopping — not covered.", createdAt: daysAgo(19), },
    { userId: empUid,   merchant: "British Airways",   amount: 245.00, category: "Travel",     status: "pending",   purchaseDate: "2026-05-01", createdAt: daysAgo(8) },
    { userId: empUid,   merchant: "Apple Store",       amount: 89.99,  category: "Technology", status: "pending",   purchaseDate: "2026-05-05", createdAt: daysAgo(4) },
    { userId: empUid,   merchant: "Staples",           amount: 47.60,  category: "Office",     status: "pending",   purchaseDate: "2026-05-06", createdAt: daysAgo(3) },
    // Admin's own approved claim (shows on admin's My Claims tab)
    { userId: adminUid, merchant: "Hilton London",     amount: 320.00, category: "Travel",     status: "approved",  purchaseDate: "2026-04-15", adminFeedback: "Approved — client visit.",   createdAt: daysAgo(24), approvedAt: daysAgo(23) },
    { userId: adminUid, merchant: "Slack Pro",         amount: 15.00,  category: "Technology", status: "approved",  purchaseDate: "2026-04-30", adminFeedback: "Approved.",                 createdAt: daysAgo(9),  approvedAt: daysAgo(8)  },
  ];

  for (const c of claims) {
    await db.collection("claims").add({
      orgId,
      receiptUrl:   "",
      description:  "",
      ...c,
    });
  }

  console.log(`Added ${claims.length} sample claims.`);
  console.log("\n✅  Done!\n");
  console.log("═══════════════════════════════════════════");
  console.log("  ADMIN ACCOUNT (full access + approve/reject)");
  console.log("  Username : applereview");
  console.log("  Email    :", ADMIN_EMAIL);
  console.log("  Password :", PASSWORD);
  console.log("─────────────────────────────────────────");
  console.log("  EMPLOYEE ACCOUNT (submit expenses + view own)");
  console.log("  Username : appleemployee");
  console.log("  Email    :", EMP_EMAIL);
  console.log("  Password :", PASSWORD);
  console.log("═══════════════════════════════════════════\n");
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
