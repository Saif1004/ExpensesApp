/**
 * startTrial.js
 *
 * Starts a 7-day free trial for an organisation.
 * Uses Admin SDK so it can write server-managed fields (plan, aiCreditsRemaining)
 * that are blocked from direct client writes by Firestore security rules.
 *
 * Guards:
 *  - Caller must be authenticated (Firebase bearer token)
 *  - Caller must be the org owner
 *  - Org must currently be on the "free" plan
 *  - Trial must not have been used before (no existing trialEndsAt)
 */

const { app } = require("@azure/functions");
const admin   = require("firebase-admin");
const { secureResponse } = require("./security");
const { authAndLimit, WINDOW_15_MIN } = require("./rateLimit");

////////////////////////////////////////////////////
// FIREBASE INIT (shared across functions)
////////////////////////////////////////////////////

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

const TRIAL_DAYS    = 7;
const TRIAL_CREDITS = 50;

////////////////////////////////////////////////////
// HANDLER
////////////////////////////////////////////////////

app.http("startTrial", {
  methods:   ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {

      ////////////////////////////////////////////////////
      // AUTH + RATE LIMIT (3 per 15 minutes)
      ////////////////////////////////////////////////////

      const auth = await authAndLimit(request, "rateLimitStartTrial", 3, WINDOW_15_MIN);
      if (auth.error) return auth.error;
      const uid = auth.uid;

      ////////////////////////////////////////////////////
      // DERIVE orgId FROM MEMBERSHIP — never trust client
      ////////////////////////////////////////////////////

      const membershipSnap = await db.collection("memberships")
        .where("userId", "==", uid)
        .where("status", "==", "approved")
        .limit(1)
        .get();

      if (membershipSnap.empty) {
        return secureResponse({ error: "Forbidden: no approved membership found" }, 403);
      }

      const orgId = membershipSnap.docs[0].data().orgId;

      ////////////////////////////////////////////////////
      // VERIFY OWNERSHIP + ELIGIBILITY
      ////////////////////////////////////////////////////

      const orgRef = db.collection("organisations").doc(orgId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        return secureResponse({ error: "Organisation not found" }, 404);
      }

      const orgData = orgDoc.data();

      if (orgData.ownerId !== uid) {
        return secureResponse({ error: "Forbidden: not the org owner" }, 403);
      }

      if (orgData.plan !== "free") {
        return secureResponse({ error: "Trial is only available on the free plan" }, 400);
      }

      if (orgData.trialEndsAt) {
        return secureResponse({ error: "Free trial has already been used" }, 400);
      }

      ////////////////////////////////////////////////////
      // START TRIAL
      ////////////////////////////////////////////////////

      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      await orgRef.update({
        plan:               "trial",
        trialEndsAt:        trialEnd,
        aiCreditsRemaining: TRIAL_CREDITS,
        aiCreditsResetAt:   trialEnd,
      });

      context.log(`Trial started for org ${orgId} by user ${uid}`);

      return secureResponse({
        success:     true,
        trialEndsAt: trialEnd.toISOString(),
      }, 200);

    } catch (error) {
      context.log("START TRIAL ERROR:", error?.message || error);
      return secureResponse({ error: "Could not start trial. Please try again." }, 500);
    }
  },
});
