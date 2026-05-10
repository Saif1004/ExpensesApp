/**
 * Deletes all demo account data from Firebase before a fresh recreate.
 * Reads credentials from env vars — never hardcoded.
 *
 * Run: node scripts/cleanup-demo-accounts.js
 */

// Load .env.demo so the private key (multi-line) is parsed correctly
require("../node_modules/dotenv").config({ path: __dirname + "/.env.demo" });

const admin = require("../expense-functions/node_modules/firebase-admin");

const projectId   = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL;
const EMP_EMAIL   = process.env.DEMO_EMP_EMAIL;

const missing = [
  ["FIREBASE_PROJECT_ID",   projectId],
  ["FIREBASE_CLIENT_EMAIL", clientEmail],
  ["FIREBASE_PRIVATE_KEY",  privateKey],
  ["DEMO_ADMIN_EMAIL",      ADMIN_EMAIL],
  ["DEMO_EMP_EMAIL",        EMP_EMAIL],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db   = admin.firestore();
const auth = admin.auth();

async function deleteCollection(collRef, batchSize = 100) {
  const snap = await collRef.limit(batchSize).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  await deleteCollection(collRef, batchSize);
}

async function run() {
  const emails = [ADMIN_EMAIL, EMP_EMAIL];
  const uids   = [];

  // ── 1. Get UIDs then delete Auth users ────────────────────────────────
  for (const email of emails) {
    try {
      const u = await auth.getUserByEmail(email);
      uids.push(u.uid);
      await auth.deleteUser(u.uid);
      console.log("Deleted auth user:", email);
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        console.log("Auth user not found (skipping):", email);
      } else throw e;
    }
  }

  // ── 2. Delete Firestore user docs ─────────────────────────────────────
  for (const uid of uids) {
    await db.collection("users").doc(uid).delete();
    console.log("Deleted users doc:", uid);
  }

  // ── 3. Delete username lookup docs ────────────────────────────────────
  for (const username of ["applereview", "appleemployee"]) {
    await db.collection("usernames").doc(username).delete();
    console.log("Deleted username doc:", username);
  }

  // ── 4. Delete memberships for those UIDs ─────────────────────────────
  for (const uid of uids) {
    const snap = await db.collection("memberships").where("userId", "==", uid).get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
      console.log("Deleted membership:", doc.id);
    }
  }

  // ── 5. Find demo org and delete it + its claims ───────────────────────
  const orgSnap = await db.collection("organisations")
    .where("name", "==", "Claimio Demo Ltd")
    .get();

  for (const orgDoc of orgSnap.docs) {
    const orgId = orgDoc.id;

    // Delete claims belonging to this org
    const claimsSnap = await db.collection("claims").where("orgId", "==", orgId).get();
    for (const c of claimsSnap.docs) {
      await c.ref.delete();
    }
    console.log(`Deleted ${claimsSnap.size} claims for org:`, orgId);

    await orgDoc.ref.delete();
    console.log("Deleted org:", orgId);
  }

  console.log("\n✅  Cleanup complete — ready to recreate.\n");
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
