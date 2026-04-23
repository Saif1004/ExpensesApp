// verifies the revenuecat subscription server-side and updates the org's plan in firestore

const { app } = require("@azure/functions");
const admin   = require("firebase-admin");
const { secureResponse } = require("./security");
const { authAndLimit, WINDOW_15_MIN } = require("./rateLimit");
const PLAN_LIMITS = require("./planLimits");

// firebase init (skip if already done)

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

// these must match the entitlement IDs set up in the revenuecat dashboard

const RC_PRO_ENTITLEMENT      = "pro";
const RC_BUSINESS_ENTITLEMENT = "business";

// http handler

app.http("syncPlan", {
  methods:   ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {

      // verify token and apply rate limit

      const auth = await authAndLimit(request, "rateLimitSyncPlan", 5, WINDOW_15_MIN);
      if (auth.error) return auth.error;
      const uid = auth.uid;

      // look up the org from the user's membership, don't trust anything from the client

      const membershipSnap = await db.collection("memberships")
        .where("userId", "==", uid)
        .where("status", "==", "approved")
        .limit(1)
        .get();

      if (membershipSnap.empty) {
        return secureResponse({ error: "Forbidden: no approved membership found" }, 403);
      }

      const orgId = membershipSnap.docs[0].data().orgId;

      // only the org owner can sync billing

      const orgRef = db.collection("organisations").doc(orgId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        return secureResponse({ error: "Organisation not found" }, 404);
      }

      if (orgDoc.data().ownerId !== uid) {
        return secureResponse({ error: "Forbidden: not the org owner" }, 403);
      }

      // hit the revenuecat REST API using the firebase uid as the subscriber id

      const rcSecretKey = process.env.REVENUECAT_SECRET_KEY;

      if (!rcSecretKey) {
        context.log("REVENUECAT_SECRET_KEY not configured");
        return secureResponse({ error: "Server configuration error" }, 500);
      }

      const rcRes = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${uid}`,
        {
          headers: {
            "Authorization": `Bearer ${rcSecretKey}`,
            "Content-Type":  "application/json",
          },
        }
      );

      if (!rcRes.ok) {
        context.log("RevenueCat API error:", rcRes.status);
        return secureResponse({ error: "Could not verify subscription with RevenueCat" }, 502);
      }

      const rcData      = await rcRes.json();
      const entitlements = rcData.subscriber?.entitlements ?? {};
      const now          = new Date().toISOString();

      // work out which plan the user is on based on active entitlements

      const hasBusiness = (entitlements[RC_BUSINESS_ENTITLEMENT]?.expires_date ?? "") > now;
      const hasPro      = (entitlements[RC_PRO_ENTITLEMENT]?.expires_date      ?? "") > now;

      const newPlan = hasBusiness ? "business" : hasPro ? "pro" : "free";

      // build the firestore update, but don't touch an active trial

      const currentPlan = orgDoc.data().plan ?? "free";
      const isActiveTrial =
        currentPlan === "trial" &&
        orgDoc.data().trialEndsAt?.toDate?.() > new Date();

      if (newPlan === "free" && isActiveTrial) {
        // no paid sub yet but the trial is still running, leave it alone
        context.log(`No paid sub for org ${orgId}; active trial preserved`);
        return secureResponse({ success: true, plan: "trial" }, 200);
      }

      const updates = { plan: newPlan };

      if (newPlan !== "free") {
        const planConfig = PLAN_LIMITS[newPlan];
        updates.aiCreditsRemaining = planConfig.aiCreditsPerPeriod;
        updates.aiCreditsResetAt   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      await orgRef.update(updates);

      context.log(`Plan synced for org ${orgId}: ${currentPlan} → ${newPlan}`);

      return secureResponse({ success: true, plan: newPlan }, 200);

    } catch (error) {
      context.log("SYNC PLAN ERROR:", error?.message || error);
      return secureResponse({ error: "Could not sync plan. Please try again." }, 500);
    }
  },
});
