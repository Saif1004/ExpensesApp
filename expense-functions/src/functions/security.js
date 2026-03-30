/**
 * security.js
 *
 * Centralised security module for all Azure Functions.
 * Covers: OAuth 2.0 bearer token validation, RBAC, input validation, HTTPS headers.
 */

const admin = require("firebase-admin");

//////////////////////////////////////////////////////////////
// HTTPS SECURITY HEADERS
// Applied to every response — enforces HTTPS, prevents
// MIME sniffing, clickjacking, and caches no sensitive data.
//////////////////////////////////////////////////////////////

const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
};

/**
 * Build a JSON Response with security headers baked in.
 */
function secureResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...extra },
  });
}

//////////////////////////////////////////////////////////////
// OAUTH 2.0 — Bearer Token Validation
// Firebase Auth issues RFC 6750-compliant Bearer tokens
// (signed JWTs). verifyBearerToken validates the signature,
// expiry and audience against Google's public keys.
//////////////////////////////////////////////////////////////

/**
 * Extract and verify the OAuth 2.0 Bearer token from the
 * Authorization header. Returns the decoded token payload
 * or null if missing / invalid.
 */
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

/**
 * Require a valid Bearer token. Returns { uid } or throws a
 * 401 Response.
 */
async function requireAuth(request) {
  const decoded = await verifyBearerToken(request);
  if (!decoded) {
    return { authError: secureResponse({ error: "Unauthorized" }, 401) };
  }
  return { uid: decoded.uid };
}

//////////////////////////////////////////////////////////////
// RBAC — Role-Based Access Control
// Roles are stored in the Firestore `memberships` collection.
// Supported roles: "admin" | "employee"
// Only "approved" memberships are considered active.
//////////////////////////////////////////////////////////////

/**
 * Returns the user's role in the given org, or null if they
 * have no approved membership.
 */
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

/**
 * Returns the org that this user belongs to (approved), or null.
 */
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

/**
 * Require the caller to be an approved member of the given org.
 * Returns { role } or a 403 Response.
 */
async function requireMember(uid, orgId) {
  const role = await getUserRole(uid, orgId);
  if (!role) {
    return { rbacError: secureResponse({ error: "Forbidden: not a member of this organisation" }, 403) };
  }
  return { role };
}

/**
 * Require the caller to be an admin of the given org.
 * Returns {} or a 403 Response.
 */
async function requireAdmin(uid, orgId) {
  const role = await getUserRole(uid, orgId);
  if (role !== "admin") {
    return { rbacError: secureResponse({ error: "Forbidden: admin access required" }, 403) };
  }
  return {};
}

//////////////////////////////////////////////////////////////
// INPUT VALIDATION
// All user-supplied data must be validated before use.
//////////////////////////////////////////////////////////////

const ALLOWED_CATEGORIES = ["Meals", "Travel", "Technology", "Office"];

/**
 * Validates and sanitizes a required string field.
 * Returns the trimmed value or throws { field, error }.
 */
function validateString(value, field, { maxLen = 500, minLen = 1 } = {}) {
  if (typeof value !== "string" || value.trim().length < minLen) {
    return { fieldError: `${field} is required` };
  }
  if (value.trim().length > maxLen) {
    return { fieldError: `${field} must be under ${maxLen} characters` };
  }
  return { value: value.trim() };
}

/**
 * Validates a monetary amount (positive number, max £100,000).
 */
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

/**
 * Validates a date string (must be parseable, not in the future).
 */
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

/**
 * Validates expense category against the allowed list.
 */
function validateCategory(value) {
  if (!ALLOWED_CATEGORIES.includes(value)) {
    return { fieldError: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}` };
  }
  return { value };
}

/**
 * Strips HTML tags and trims — apply to all string inputs.
 */
function sanitize(value) {
  if (typeof value !== "string") return value;
  return value.trim().replace(/<[^>]*>/g, "").replace(/[<>'"]/g, "");
}

//////////////////////////////////////////////////////////////
// EXPORTS
//////////////////////////////////////////////////////////////

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
