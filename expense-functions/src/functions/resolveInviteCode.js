const { app } = require("@azure/functions");
const admin = require("firebase-admin");
const { authAndLimit, WINDOW_15_MIN } = require("./rateLimit");
const { secureResponse } = require("./security");

/**
 * resolveInviteCode
 *
 * Accepts an invite code from the client and returns only the orgId + org name
 * for that code. Running this server-side means:
 *  - The full organisations collection is no longer publicly readable via Firestore rules
 *  - Rate limiting is applied before any Firestore read
 *  - Sensitive org fields (webhook URLs, credit counts, plan, inviteCode) are never exposed
 *
 * L-2 fix: replaces the direct client-to-Firestore `where("inviteCode", "==", code)` query.
 */
app.http("resolveInviteCode", {
  methods: ["POST"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    try {

      // Auth + rate limit (5 per 15 min) — prevents invite-code brute-force
      const auth = await authAndLimit(request, "rateLimitResolveInvite", 5, WINDOW_15_MIN);
      if (auth.error) return auth.error;

      const { inviteCode } = await request.json();

      if (!inviteCode || typeof inviteCode !== "string" || inviteCode.trim().length === 0) {
        return secureResponse({ error: "inviteCode is required" }, 400);
      }

      const code = inviteCode.trim().toUpperCase();

      // Code must be 6 alphanumeric characters
      if (!/^[A-Z0-9]{4,10}$/.test(code)) {
        return secureResponse({ found: false }, 200);
      }

      const snap = await admin.firestore()
        .collection("organisations")
        .where("inviteCode", "==", code)
        .limit(1)
        .get();

      if (snap.empty) {
        return secureResponse({ found: false }, 200);
      }

      const org = snap.docs[0];
      const { name } = org.data();

      // Return only the minimum fields the client needs — never expose webhook URLs,
      // credit counts, plan details, or the invite code itself
      return secureResponse({ found: true, orgId: org.id, orgName: name || "Organisation" }, 200);

    } catch (err) {
      context.error("resolveInviteCode error:", err);
      return secureResponse({ error: "Internal server error" }, 500);
    }
  },
});
