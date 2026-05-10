const { app } = require("@azure/functions");
const admin = require("firebase-admin");
const { BlobServiceClient } = require("@azure/storage-blob");
const { authAndLimit, WINDOW_15_MIN } = require("./rateLimit");
const { secureResponse } = require("./security");

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

// Delete receipt blobs from Azure Storage (GDPR right-to-erasure)
async function deleteReceiptBlobs(receiptUrls) {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr || receiptUrls.length === 0) return;
  try {
    const blobClient = BlobServiceClient.fromConnectionString(connStr);
    await Promise.all(receiptUrls.map(async (url) => {
      try {
        const u = new URL(url);
        // path is /<container>/<blobName>
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length < 2) return;
        const containerName = parts[0];
        const blobName = parts.slice(1).join("/").split("?")[0]; // strip SAS query
        await blobClient.getContainerClient(containerName).getBlockBlobClient(blobName).deleteIfExists();
      } catch { /* non-fatal — blob may already be gone */ }
    }));
  } catch { /* non-fatal */ }
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
      // OAUTH 2.0 + IP rate limit (irreversible action — both layers required)
      ////////////////////////////////////////////////////

      const auth = await authAndLimit(request, 'rateLimitDeleteAccount', 5, WINDOW_15_MIN);
      if (auth.error) return auth.error;
      const uid = auth.uid;

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

          // Find other approved admins who could take over the org
          const otherAdmins = await db.collection("memberships")
            .where("orgId",  "==", orgId)
            .where("role",   "==", "admin")
            .where("status", "==", "approved")
            .get();

          const nextAdmin = otherAdmins.docs.find(d => d.data().userId !== uid);

          // Count ALL other members (anyone who isn't the deleting owner)
          const allMemberships = await db.collection("memberships").where("orgId", "==", orgId).get();
          const otherMembers = allMemberships.docs.filter(d => d.data().userId !== uid);

          if (nextAdmin) {
            // PATH 1: Another admin exists — transfer ownership, remove the deleting user only.
            // Employees and their data are completely untouched.
            const newOwnerId = nextAdmin.data().userId;
            const orgAdminsSnap = orgDoc.data()?.orgAdmins ?? [];
            const updatedOrgAdmins = orgAdminsSnap.filter((id) => id !== uid);
            if (!updatedOrgAdmins.includes(newOwnerId)) updatedOrgAdmins.push(newOwnerId);

            await orgDoc.ref.update({
              ownerId:   newOwnerId,
              orgAdmins: updatedOrgAdmins,
            });

            // Remove only the owner's own membership + their own claims
            refsToDelete.push(memberDoc.ref);
            const ownerClaims = await db.collection("claims").where("userId", "==", uid).get();
            ownerClaims.docs.forEach(c => refsToDelete.push(c.ref));

          } else if (otherMembers.length === 0) {
            // PATH 2: Owner is the sole member — safe to delete everything.
            allMemberships.docs.forEach(m => refsToDelete.push(m.ref));
            const orgClaims = await db.collection("claims").where("orgId", "==", orgId).get();
            orgClaims.docs.forEach(c => refsToDelete.push(c.ref));
            const orgPolicies = await db.collection("policies").where("orgId", "==", orgId).get();
            orgPolicies.docs.forEach(p => refsToDelete.push(p.ref));
            refsToDelete.push(orgDoc.ref);

          } else {
            // PATH 3: Owner is sole admin but employees still exist — block deletion.
            // We cannot destroy other people's data without their consent.
            return secureResponse({
              error: "OwnerHasMembers",
              message: "You are the only admin for this organisation. Please promote another member to admin or remove all employees before deleting your account."
            }, 409);
          }

        } else {

          // Non-owner: remove only this membership and their own claims
          refsToDelete.push(memberDoc.ref);

          const userClaims = await db.collection("claims").where("userId", "==", uid).get();
          userClaims.docs.forEach(c => refsToDelete.push(c.ref));

        }
      }

      // If user had no membership, still clean up their claims
      if (membershipSnap.empty) {
        const userClaims = await db.collection("claims").where("userId", "==", uid).get();
        userClaims.docs.forEach(c => refsToDelete.push(c.ref));
      }

      // Username lookup doc
      if (username) refsToDelete.push(db.collection("usernames").doc(username));

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

      // Collect receipt blob URLs before wiping Firestore docs (GDPR erasure)
      const claimRefs = uniqueRefs.filter(r => r.path.startsWith("claims/"));
      const receiptUrls = [];
      await Promise.all(claimRefs.map(async (ref) => {
        const snap = await ref.get();
        const url = snap.data()?.receiptUrl;
        if (url && typeof url === "string" && url.startsWith("https://")) {
          receiptUrls.push(url);
        }
      }));

      await deleteInBatches(uniqueRefs);
      await deleteReceiptBlobs(receiptUrls);

      ////////////////////////////////////////////////////
      // DELETE FIREBASE AUTH USER
      ////////////////////////////////////////////////////

      await admin.auth().deleteUser(uid);

      return secureResponse({ success: true }, 200);

    } catch (err) {
      context.log("Delete account error:", err);
      return secureResponse({ error: "Failed to delete account" }, 500);
    }

  }

});
