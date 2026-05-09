// centralised security helpers: bearer token validation, rbac, input validation, response headers

const admin = require("firebase-admin");

// security headers applied to every response

const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  // Restrictive CSP — these are JSON API endpoints, no scripts or frames expected
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  // CORS locked to the web domain — mobile apps don't send Origin so they're unaffected
  "Access-Control-Allow-Origin": "https://claimio.org",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// builds a json response with all the security headers pre-applied
function secureResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...extra },
  });
}

// validates the firebase bearer token and returns the decoded payload (or null)
async function verifyBearerToken(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    return await admin.auth().verifyIdToken(token, true); // checkRevoked = true
  } catch {
    return null;
  }
}

// throws a 401 if no valid token is present, otherwise returns { uid }
async function requireAuth(request) {
  const decoded = await verifyBearerToken(request);
  if (!decoded) {
    return { authError: secureResponse({ error: "Unauthorized" }, 401) };
  }
  return { uid: decoded.uid };
}

// returns the user's role in the given org (null if no approved membership)
async function getUserRole(uid, orgId) {
  const snap = await admin.firestore()
    .collection("memberships")
    .where("userId", "==", uid)
    .where("orgId", "==", orgId)
    .where("status", "==", "approved")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data().role ?? null; // "admin" | "employee"
}

// returns the org the user is approved in, or null
async function getUserOrg(uid) {
  const snap = await admin.firestore()
    .collection("memberships")
    .where("userId", "==", uid)
    .where("status", "==", "approved")
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data().orgId ?? null;
}

// returns { role } or a 403 if the user isn't an approved org member
async function requireMember(uid, orgId) {
  const role = await getUserRole(uid, orgId);
  if (!role) {
    return { rbacError: secureResponse({ error: "Forbidden: not a member of this organisation" }, 403) };
  }
  return { role };
}

// returns {} or a 403 if the user isn't an admin of the org
async function requireAdmin(uid, orgId) {
  const role = await getUserRole(uid, orgId);
  if (role !== "admin") {
    return { rbacError: secureResponse({ error: "Forbidden: admin access required" }, 403) };
  }
  return {};
}

// input validators — all user data goes through these before use

const ALLOWED_CATEGORIES = ["Meals", "Travel", "Technology", "Office"];

// validates and trims a required string field
function validateString(value, field, { maxLen = 500, minLen = 1 } = {}) {
  if (typeof value !== "string" || value.trim().length < minLen) {
    return { fieldError: `${field} is required` };
  }
  if (value.trim().length > maxLen) {
    return { fieldError: `${field} must be under ${maxLen} characters` };
  }
  return { value: value.trim() };
}

// validates a positive amount up to £100,000
function validateAmount(value) {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    return { fieldError: "amount must be a positive number" };
  }
  if (num > 100000) {
    return { fieldError: "amount exceeds the maximum allowed value of £100,000" };
  }
  return { value: num };
}

// checks the date is valid and not in the future
function validateDate(value, field = "date") {
  if (!value || typeof value !== "string") {
    return { fieldError: `${field} is required` };
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { fieldError: `${field} is not a valid date` };
  }
  if (d > new Date()) {
    return { fieldError: `${field} cannot be in the future` };
  }
  return { value };
}

// checks the category is one of the allowed values
function validateCategory(value) {
  if (!ALLOWED_CATEGORIES.includes(value)) {
    return { fieldError: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}` };
  }
  return { value };
}

// strips html tags and trims — run every string input through this
function sanitize(value) {
  if (typeof value !== "string") return value;
  return value.trim().replace(/<[^>]*>/g, "").replace(/[<>'"]/g, "");
}

// exports

module.exports = {
  SECURITY_HEADERS,
  secureResponse,
  verifyBearerToken,
  requireAuth,
  getUserRole,
  getUserOrg,
  requireMember,
  requireAdmin,
  validateString,
  validateAmount,
  validateDate,
  validateCategory,
  sanitize,
};
