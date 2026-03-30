/**
 * syncPlan.js
 *
 * Verifies a RevenueCat subscription server-side and writes the
 * resulting plan to Firestore using Admin SDK.
 *
 * Client cannot write `plan` / `aiCreditsRemaining` / `aiCreditsResetAt`
 * directly (blocked by Firestore security rules) — this function is the
 * ONLY way to update billing fields from a purchase or restore flow.
 *
 * Flow:
 *  1. Verify Firebase bearer token
 *  2. Confirm caller is the org owner
 *  3. Query RevenueCat REST API with the user's UID as the subscriber ID
 *  4. Determine the active plan from entitlements
 *  5. Update Firestore organisation doc via Admin SDK
 */

const { app } = require("@azure/functions");
const admin   = require("firebase-admin");
const { requireAuth, secureResponse } = require("./security");
const PLAN_LIMITS = require("./planLimits");

////////////////////////////////////////////////////
// FIREBASE INIT
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

////////////////////////////////////////////////////
// REVENUECAT ENTITLEMENT IDs
// Must match constants/planLimits.ts on the frontend
////////////////////////////////////////////////////

const RC_PRO_ENTITLEMENT      = "pro";
const RC_BUSINESS_ENTITLEMENT = "business";

////////////////////////////////////////////////////
// HANDLER
////////////////////////////////////////////////////

app.http("syncPlan", {
  methods:   ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {

      ////////////////////////////////////////////////////
      // AUTH
      ////////////////////////////////////////////////////

      const { uid, authError } = await requireAuth(request);
      if (authError) return authError;

      ////////////////////////////////////////////////////
      // PARSE BODY
      ////////////////////////////////////////////////////

      const body  = await request.json();
      const orgId = (body.orgId ?? "").trim();

      if (!orgId) {
        return secureResponse({ error: "Missing orgId" }, 400);
      }

      ////////////////////////////////////////////////////
      // VERIFY OWNERSHIP
      ////////////////////////////////////////////////////

      const orgRef = db.collection("organisations").doc(orgId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        return secureResponse({ error: "Organisation not found" }, 404);
      }

      if (orgDoc.data().ownerId !== uid) {
        return secureResponse({ error: "Forbidden: not the org owner" }, 403);
      }

      ////////////////////////////////////////////////////
      // QUERY REVENUECAT REST API
      // Uses the Firebase UID as the RevenueCat app user ID
      // (set via Purchases.logIn(uid) in the mobile app)
      ////////////////////////////////////////////////////

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

      ////////////////////////////////////////////////////
      // DETERMINE PLAN FROM ACTIVE ENTITLEMENTS
      ////////////////////////////////////////////////////

      const hasBusiness = (entitlements[RC_BUSINESS_ENTITLEMENT]?.expires_date ?? "") > now;
      const hasPro      = (entitlements[RC_PRO_ENTITLEMENT]?.expires_date      ?? "") > now;

      const newPlan = hasBusiness ? "business" : hasPro ? "pro" : "free";

      ////////////////////////////////////////////////////
      // BUILD UPDATE
      // Don't downgrade an active trial — let it expire naturally
      ////////////////////////////////////////////////////

      const currentPlan = orgDoc.data().plan ?? "free";
      const isActiveTrial =
        currentPlan === "trial" &&
        orgDoc.data().trialEndsAt?.toDate?.() > new Date();

      if (newPlan === "free" && isActiveTrial) {
        // No paid sub found, but trial is still active — do nothing
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
