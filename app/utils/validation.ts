/**
 * validation.ts
 *
 * Pure validation helpers shared across the ExpensesApp.
 * These functions contain zero side-effects and no React Native imports,
 * making them trivially unit-testable with plain Jest.
 */

// ─────────────────────────────────────────────────────────────
// Password
// ─────────────────────────────────────────────────────────────

/**
 * Validates password strength.
 * Rules: 8+ chars, uppercase, lowercase, digit, special character.
 * Returns a human-readable error string, or null if valid.
 */
export function validatePassword(password: string): string | null {
  if (!password || password.length < 8)
    return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password))
    return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password))
    return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password))
    return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(password))
    return "Password must contain at least one special character.";
  return null;
}

// ─────────────────────────────────────────────────────────────
// Invite code
// ─────────────────────────────────────────────────────────────

const INVITE_CODE_REGEX = /^[A-Z0-9]{4,10}$/;

/**
 * Normalises and validates an invite code.
 * Accepts 4–10 uppercase alphanumeric characters (whitespace trimmed,
 * lowercase coerced to upper).
 */
export function validateInviteCode(raw: string | undefined | null): {
  valid: boolean;
  normalized?: string;
} {
  if (!raw || typeof raw !== "string" || raw.trim().length === 0)
    return { valid: false };
  const code = raw.trim().toUpperCase();
  return { valid: INVITE_CODE_REGEX.test(code), normalized: code };
}

// ─────────────────────────────────────────────────────────────
// Employee monthly budget
// ─────────────────────────────────────────────────────────────

/**
 * Validates the per-employee monthly budget input.
 *  - Empty / undefined → unlimited (value 0, valid)
 *  - Positive number string → valid
 *  - Negative, NaN, mixed ("500abc") → invalid
 *
 * Uses Number() intentionally — parseFloat("500abc") returns 500,
 * which would silently accept bad input.
 */
export function validateBudget(rawInput: string | number | undefined | null): {
  ok: boolean;
  value?: number;
  error?: string;
} {
  const trimmed = (rawInput ?? "").toString().trim();

  if (!trimmed) return { ok: true, value: 0 };

  const num = Number(trimmed);

  if (isNaN(num) || num < 0) {
    return { ok: false, error: "Please enter a valid positive number." };
  }

  return { ok: true, value: num };
}

// ─────────────────────────────────────────────────────────────
// SecureStore key sanitisation
// ─────────────────────────────────────────────────────────────

/**
 * Sanitises a storage key so it is accepted by expo-secure-store.
 * SecureStore allows only: alphanumeric, ".", "-", "_".
 * Firebase Auth keys often contain ":" and "[" which must be replaced.
 */
export function sanitizeSecureStoreKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}
