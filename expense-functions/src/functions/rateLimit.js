const admin = require("firebase-admin");

const WINDOW_1_MIN    = 60 * 1000;
const WINDOW_15_MIN   = 15 * 60 * 1000;

/**
 * Verify Firebase ID token and return decoded payload.
 * Returns null if missing or invalid.
 */
async function verifyToken(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token, true); // checkRevoked = true
  } catch {
    return null;
  }
}

/**
 * Check and update per-user sliding-window rate limit stored in Firestore.
 * @param {string} userId
 * @param {string} field       - Firestore field key e.g. "rateLimitOCR"
 * @param {number} maxRequests - Max allowed requests within the window
 * @param {number} windowMs    - Window size in ms (default: 1 minute)
 * @returns {{ allowed: boolean }}
 */
async function checkRateLimit(userId, field, maxRequests, windowMs = WINDOW_1_MIN) {
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);

  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const rw = userData[field] || { count: 0, windowStart: 0 };

  const now = Date.now();
  const windowExpired = now - rw.windowStart > windowMs;
  const newCount = windowExpired ? 1 : rw.count + 1;

  // Fire-and-forget — don't block the response on this write
  userRef.update({
    [field]: {
      count: newCount,
      windowStart: windowExpired ? now : rw.windowStart,
    },
  }).catch(() => {});

  return { allowed: newCount <= maxRequests };
}

/**
 * Verify token + rate limit in one call.
 * Returns { uid } on success, or { error: Response } on failure.
 *
 * @param {Request} request
 * @param {string}  field        - Firestore field key
 * @param {number}  maxRequests  - Max requests in the window
 * @param {number}  windowMs     - Window in ms (default 1 min)
 */
async function authAndLimit(request, field, maxRequests, windowMs = WINDOW_1_MIN) {
  const decoded = await verifyToken(request);
  if (!decoded) {
    return {
      error: new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  const { allowed } = await checkRateLimit(decoded.uid, field, maxRequests, windowMs);
  if (!allowed) {
    const windowLabel = windowMs === WINDOW_15_MIN ? "15 minutes" : "minute";
    return {
      error: new Response(
        JSON.stringify({ error: `Too many requests. Max ${maxRequests} per ${windowLabel}.` }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { uid: decoded.uid };
}

module.exports = { verifyToken, checkRateLimit, authAndLimit, WINDOW_1_MIN, WINDOW_15_MIN };
