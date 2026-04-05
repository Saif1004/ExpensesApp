const admin = require("firebase-admin");

const WINDOW_1_MIN    = 60 * 1000;
const WINDOW_15_MIN   = 15 * 60 * 1000;

////////////////////////////////////////////////////
// IP RATE LIMITING (in-memory sliding window)
// Defends against unauthenticated flood attacks and
// credential-stuffing before the token is verified.
// Limits: 60 req/min per IP globally (across all endpoints).
////////////////////////////////////////////////////

const IP_MAX_PER_MIN = 60;
const ipStore = new Map(); // ip -> { count, windowStart }

/**
 * Extract the real client IP from Azure Functions request headers.
 * Azure sets x-forwarded-for or client-ip (with optional port).
 */
function getClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const clientIp = request.headers.get("client-ip") || "";
  return clientIp.split(":")[0].trim() || "unknown";
}

/**
 * In-memory sliding-window rate limit per IP.
 * Returns { allowed: boolean }.
 * Periodically self-cleans stale entries (1% chance per call).
 */
function checkIpRateLimit(request, maxRequests = IP_MAX_PER_MIN, windowMs = WINDOW_1_MIN) {
  const ip = getClientIp(request);
  if (!ip || ip === "unknown") return { allowed: true }; // can't block unknown IPs

  const now    = Date.now();
  const entry  = ipStore.get(ip) || { count: 0, windowStart: now };
  const expired = now - entry.windowStart > windowMs;
  const newCount = expired ? 1 : entry.count + 1;

  ipStore.set(ip, {
    count:       newCount,
    windowStart: expired ? now : entry.windowStart,
  });

  // Probabilistic cleanup — remove entries older than 2× the window
  if (Math.random() < 0.01) {
    const cutoff = now - windowMs * 2;
    for (const [k, v] of ipStore.entries()) {
      if (v.windowStart < cutoff) ipStore.delete(k);
    }
  }

  return { allowed: newCount <= maxRequests };
}

////////////////////////////////////////////////////
// TOKEN VERIFICATION
////////////////////////////////////////////////////

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

////////////////////////////////////////////////////
// PER-USER RATE LIMITING (Firestore sliding window)
// Persists across function instances — prevents a
// single account from abusing the API at scale.
////////////////////////////////////////////////////

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

////////////////////////////////////////////////////
// COMBINED AUTH + IP + USER RATE LIMIT
////////////////////////////////////////////////////

/**
 * Verify token + IP rate limit + per-user rate limit in one call.
 * IP check runs first (before token verification) to block floods early.
 * Returns { uid } on success, or { error: Response } on failure.
 *
 * @param {Request} request
 * @param {string}  field        - Firestore field key
 * @param {number}  maxRequests  - Max requests in the window (per user)
 * @param {number}  windowMs     - Window in ms (default 1 min)
 */
async function authAndLimit(request, field, maxRequests, windowMs = WINDOW_1_MIN) {

  // 1. IP rate limit — checked before token verification to stop floods cheaply
  const ipCheck = checkIpRateLimit(request);
  if (!ipCheck.allowed) {
    return {
      error: new Response(
        JSON.stringify({ error: "Too many requests from your IP. Please slow down." }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
      ),
    };
  }

  // 2. Token verification
  const decoded = await verifyToken(request);
  if (!decoded) {
    return {
      error: new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  // 3. Per-user rate limit (Firestore-backed, survives across instances)
  const { allowed } = await checkRateLimit(decoded.uid, field, maxRequests, windowMs);
  if (!allowed) {
    const windowLabel = windowMs === WINDOW_15_MIN ? "15 minutes" : "minute";
    return {
      error: new Response(
        JSON.stringify({ error: `Too many requests. Max ${maxRequests} per ${windowLabel}.` }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": windowMs === WINDOW_15_MIN ? "900" : "60" } }
      ),
    };
  }

  return { uid: decoded.uid };
}

module.exports = { verifyToken, checkRateLimit, checkIpRateLimit, authAndLimit, WINDOW_1_MIN, WINDOW_15_MIN };
