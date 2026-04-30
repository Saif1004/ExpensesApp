const admin = require("firebase-admin");

const WINDOW_1_MIN    = 60 * 1000;
const WINDOW_15_MIN   = 15 * 60 * 1000;

// in-memory ip rate limiter — blocks floods before we even check the token

const IP_MAX_PER_MIN = 60;
const ipStore = new Map(); // ip -> { count, windowStart }

// pulls the real client ip from azure's forwarded headers
// Azure Functions sets client-ip and may append to x-forwarded-for.
// We take the LAST entry of x-forwarded-for (most recently added by Azure's
// own infrastructure) to avoid spoofing via a user-supplied XFF header.
function getClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.trim()) {
    const parts = xff.split(",").map(s => s.trim()).filter(Boolean);
    // Use last entry — added by Azure's load balancer, harder to spoof
    if (parts.length > 0) return parts[parts.length - 1];
  }
  const clientIp = request.headers.get("client-ip");
  if (clientIp && clientIp.trim()) {
    // Strip IPv6 port suffix if present (e.g. "1.2.3.4:50234")
    return clientIp.split(":")[0].trim() || null;
  }
  return null;
}

// sliding window rate limit per ip, self-cleans stale entries occasionally
function checkIpRateLimit(request, maxRequests = IP_MAX_PER_MIN, windowMs = WINDOW_1_MIN) {
  const ip = getClientIp(request);
  // If we can't identify the IP, deny the request rather than allowing it —
  // "unknown" IPs previously bypassed the rate limit entirely.
  if (!ip) return { allowed: false, reason: "Cannot identify client IP" };

  const now    = Date.now();
  const entry  = ipStore.get(ip) || { count: 0, windowStart: now };
  const expired = now - entry.windowStart > windowMs;
  const newCount = expired ? 1 : entry.count + 1;

  ipStore.set(ip, {
    count:       newCount,
    windowStart: expired ? now : entry.windowStart,
  });

  // 1% chance cleanup — removes old ip entries to stop the map growing forever
  if (Math.random() < 0.01) {
    const cutoff = now - windowMs * 2;
    for (const [k, v] of ipStore.entries()) {
      if (v.windowStart < cutoff) ipStore.delete(k);
    }
  }

  return { allowed: newCount <= maxRequests };
}

// verifies the firebase id token and returns the decoded payload (null if bad)
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

// per-user sliding window stored in firestore — survives across cold starts
async function checkRateLimit(userId, field, maxRequests, windowMs = WINDOW_1_MIN) {
  const db = admin.firestore();
  const userRef = db.collection("users").doc(userId);

  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const rw = userData[field] || { count: 0, windowStart: 0 };

  const now = Date.now();
  const windowExpired = now - rw.windowStart > windowMs;
  const newCount = windowExpired ? 1 : rw.count + 1;

  // fire-and-forget so we don't slow down the response
  userRef.update({
    [field]: {
      count: newCount,
      windowStart: windowExpired ? now : rw.windowStart,
    },
  }).catch(() => {});

  return { allowed: newCount <= maxRequests };
}

// runs ip check → token verify → per-user limit in one go
async function authAndLimit(request, field, maxRequests, windowMs = WINDOW_1_MIN) {

  // 1. ip check first — stops floods before we waste time on token verification
  const ipCheck = checkIpRateLimit(request);
  if (!ipCheck.allowed) {
    const msg = ipCheck.reason === "Cannot identify client IP"
      ? "Request origin could not be determined."
      : "Too many requests from your IP. Please slow down.";
    const status = ipCheck.reason === "Cannot identify client IP" ? 400 : 429;
    return {
      error: new Response(
        JSON.stringify({ error: msg }),
        { status, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
      ),
    };
  }

  // 2. verify the token
  const decoded = await verifyToken(request);
  if (!decoded) {
    return {
      error: new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  // 3. per-user limit (firestore-backed so it survives restarts)
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
