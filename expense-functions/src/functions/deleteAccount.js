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
// BATCH DELETE HELPER (stays under 500-op limit)
//////////////////////////////////////////////////////

async function deleteInBatches(refs) {
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = db.batch();
    refs.slice(i, i + CHUNK).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

//////////////////////////////////////////////////////
// DELETE ACCOUNT
//////////////////////////////////////////////////////

app.http("deleteAccount", {
  methods: ["DELETE"],
  authLevel: "anonymous",

  handler: async (request, context) => {

    try {

      ////////////////////////////////////////////////////
      // VERIFY TOKEN
      ////////////////////////////////////////////////////

      const authHeader = request.headers.get("authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();

      if (!token) {
        return { status: 401, jsonBody: { error: "Unauthorized" } };
      }

      let uid;
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
      } catch {
        return { status: 401, jsonBody: { error: "Invalid token" } };
      }

      ////////////////////////////////////////////////////
      // GATHER ALL REFS TO DELETE
      ////////////////////////////////////////////////////

      const refsToDelete = [];

      // Get user doc (need username for usernames collection)
      const userDoc = await db.collection("users").doc(uid).get();
      const username = userDoc.data()?.username ?? null;

      // Get this user's membership(s)
      const membershipSnap = await db
        .collection("memberships")
        .where("userId", "==", uid)
        .get();

      for (const memberDoc of membershipSnap.docs) {

        const orgId = memberDoc.data().orgId;
        if (!orgId) {
          refsToDelete.push(memberDoc.ref);
          continue;
        }

        const orgDoc = await db.collection("organisations").doc(orgId).get();
        const isOwner = orgDoc.exists && orgDoc.data()?.ownerId === uid;

        if (isOwner) {

          // Delete every membership in this org
          const allMemberships = await db
            .collection("memberships")
            .where("orgId", "==", orgId)
            .get();
          allMemberships.docs.forEach(m => refsToDelete.push(m.ref));

          // Delete every claim in this org
          const orgClaims = await db
            .collection("claims")
            .where("orgId", "==", orgId)
            .get();
          orgClaims.docs.forEach(c => refsToDelete.push(c.ref));

          // Delete every policy in this org
          const orgPolicies = await db
            .collection("policies")
            .where("orgId", "==", orgId)
            .get();
          orgPolicies.docs.forEach(p => refsToDelete.push(p.ref));

          // Delete the org itself
          refsToDelete.push(orgDoc.ref);

        } else {

          // Non-owner: remove only this membership
          refsToDelete.push(memberDoc.ref);

          // Delete this user's claims
          const userClaims = await db
            .collection("claims")
            .where("userId", "==", uid)
            .get();
          userClaims.docs.forEach(c => refsToDelete.push(c.ref));

        }
      }

      // If user had no membership, still clean up their claims
      if (membershipSnap.empty) {
        const userClaims = await db
          .collection("claims")
          .where("userId", "==", uid)
          .get();
        userClaims.docs.forEach(c => refsToDelete.push(c.ref));
      }

      // Username lookup doc
      if (username) {
        refsToDelete.push(db.collection("usernames").doc(username));
      }

      // User profile doc
      refsToDelete.push(db.collection("users").doc(uid));

      ////////////////////////////////////////////////////
      // DEDUPLICATE & COMMIT
      ////////////////////////////////////////////////////

      const seen = new Set();
      const uniqueRefs = refsToDelete.filter(ref => {
        if (seen.has(ref.path)) return false;
        seen.add(ref.path);
        return true;
      });

      await deleteInBatches(uniqueRefs);

      ////////////////////////////////////////////////////
      // DELETE FIREBASE AUTH USER
      ////////////////////////////////////////////////////

      await admin.auth().deleteUser(uid);

      return { status: 200, jsonBody: { success: true } };

    } catch (err) {
      context.log("Delete account error:", err);
      return { status: 500, jsonBody: { error: "Failed to delete account" } };
    }

  }

});
