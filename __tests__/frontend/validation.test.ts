/**
 * validation.test.ts
 *
 * Unit tests for the pure helper functions in app/utils/validation.ts.
 * No React Native components or native modules are involved, so these
 * tests run with plain Jest — fast and zero-mock overhead.
 */

import {
  validatePassword,
  validateInviteCode,
  validateBudget,
  sanitizeSecureStoreKey,
} from "../../app/utils/validation";

// ─────────────────────────────────────────────────────────────
// validatePassword
// ─────────────────────────────────────────────────────────────

describe("validatePassword", () => {
  // ── Valid ────────────────────────────────────────────────────
  test("returns null for a strong password", () => {
    expect(validatePassword("Secure@123")).toBeNull();
  });

  test("accepts exactly 8 characters when all rules pass", () => {
    expect(validatePassword("Pass@1ab")).toBeNull();
  });

  test("accepts passwords with multiple special chars", () => {
    expect(validatePassword("P@ssw0rd!!")).toBeNull();
  });

  // ── Too short ────────────────────────────────────────────────
  test("rejects a password shorter than 8 chars", () => {
    expect(validatePassword("Ab1@xyz")).not.toBeNull();
  });

  test("rejects an empty string", () => {
    expect(validatePassword("")).not.toBeNull();
  });

  // ── Missing character class ──────────────────────────────────
  test("rejects a password with no uppercase letter", () => {
    const err = validatePassword("secure@123");
    expect(err).toMatch(/uppercase/i);
  });

  test("rejects a password with no lowercase letter", () => {
    const err = validatePassword("SECURE@123");
    expect(err).toMatch(/lowercase/i);
  });

  test("rejects a password with no digit", () => {
    const err = validatePassword("Secure@abc");
    expect(err).toMatch(/number/i);
  });

  test("rejects a password with no special character", () => {
    const err = validatePassword("Secure1234");
    expect(err).toMatch(/special/i);
  });

  // ── Error message quality ────────────────────────────────────
  test("error message is a non-empty string when invalid", () => {
    const err = validatePassword("weak");
    expect(typeof err).toBe("string");
    expect((err as string).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// validateInviteCode
// ─────────────────────────────────────────────────────────────

describe("validateInviteCode", () => {
  // ── Valid ────────────────────────────────────────────────────
  test("accepts a 6-char alphanumeric code", () => {
    expect(validateInviteCode("ABC123").valid).toBe(true);
  });

  test("accepts a 4-char minimum code", () => {
    expect(validateInviteCode("ABCD").valid).toBe(true);
  });

  test("accepts a 10-char maximum code", () => {
    expect(validateInviteCode("ABCDE12345").valid).toBe(true);
  });

  test("normalises lowercase to uppercase before validating", () => {
    const r = validateInviteCode("abc123");
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("ABC123");
  });

  test("trims whitespace before validating", () => {
    expect(validateInviteCode("  ABC123  ").valid).toBe(true);
  });

  // ── Invalid ──────────────────────────────────────────────────
  test("rejects a 3-char code (too short)", () => {
    expect(validateInviteCode("ABC").valid).toBe(false);
  });

  test("rejects an 11-char code (too long)", () => {
    expect(validateInviteCode("ABCDE123456").valid).toBe(false);
  });

  test("rejects a code with a hyphen", () => {
    expect(validateInviteCode("ABC-12").valid).toBe(false);
  });

  test("rejects a code with an internal space", () => {
    expect(validateInviteCode("ABC 12").valid).toBe(false);
  });

  test("rejects null", () => {
    expect(validateInviteCode(null).valid).toBe(false);
  });

  test("rejects undefined", () => {
    expect(validateInviteCode(undefined).valid).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(validateInviteCode("").valid).toBe(false);
  });

  test("rejects a SQL-injection payload", () => {
    expect(validateInviteCode("'; DROP--").valid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// validateBudget
// ─────────────────────────────────────────────────────────────

describe("validateBudget", () => {
  // ── Valid ────────────────────────────────────────────────────
  test("empty string means unlimited (ok, value = 0)", () => {
    const r = validateBudget("");
    expect(r.ok).toBe(true);
    expect(r.value).toBe(0);
  });

  test("undefined means unlimited (ok, value = 0)", () => {
    const r = validateBudget(undefined);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(0);
  });

  test("null means unlimited (ok, value = 0)", () => {
    const r = validateBudget(null);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(0);
  });

  test("accepts a positive integer string", () => {
    const r = validateBudget("500");
    expect(r.ok).toBe(true);
    expect(r.value).toBe(500);
  });

  test("accepts a decimal string", () => {
    const r = validateBudget("250.50");
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo(250.5);
  });

  test("accepts a large budget", () => {
    const r = validateBudget("100000");
    expect(r.ok).toBe(true);
    expect(r.value).toBe(100000);
  });

  test("accepts zero (treated as unlimited)", () => {
    // "0" trims to "0" which Number("0") = 0, not negative, so valid
    const r = validateBudget("0");
    expect(r.ok).toBe(true);
    expect(r.value).toBe(0);
  });

  test("trims whitespace before parsing", () => {
    expect(validateBudget("  200  ").ok).toBe(true);
  });

  // ── Invalid ──────────────────────────────────────────────────
  test("rejects a negative number", () => {
    expect(validateBudget("-100").ok).toBe(false);
  });

  test("rejects a non-numeric string", () => {
    expect(validateBudget("abc").ok).toBe(false);
  });

  test("rejects a mixed string (Number() returns NaN, not parseFloat())", () => {
    // parseFloat("500abc") = 500, but Number("500abc") = NaN — we must use Number()
    expect(validateBudget("500abc").ok).toBe(false);
  });

  test("invalid result includes an error string", () => {
    const r = validateBudget("bad");
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe("string");
    expect((r.error as string).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// sanitizeSecureStoreKey
// ─────────────────────────────────────────────────────────────

const SECURE_STORE_VALID = /^[a-zA-Z0-9._-]+$/;

describe("sanitizeSecureStoreKey", () => {
  test("sanitised Firebase auth key passes SecureStore regex", () => {
    const raw = "firebase:authUser:AIzaSyABC123:DEFAULT";
    expect(SECURE_STORE_VALID.test(sanitizeSecureStoreKey(raw))).toBe(true);
  });

  test("replaces colons with underscores", () => {
    expect(sanitizeSecureStoreKey("a:b:c")).toBe("a_b_c");
  });

  test("replaces square brackets", () => {
    expect(sanitizeSecureStoreKey("key[DEFAULT]")).toBe("key_DEFAULT_");
  });

  test("replaces spaces", () => {
    expect(sanitizeSecureStoreKey("key with spaces")).toBe("key_with_spaces");
  });

  test("replaces forward slashes", () => {
    expect(sanitizeSecureStoreKey("some/path/key")).toBe("some_path_key");
  });

  test("leaves alphanumeric characters untouched", () => {
    expect(sanitizeSecureStoreKey("abcXYZ123")).toBe("abcXYZ123");
  });

  test("leaves dots and dashes untouched", () => {
    expect(sanitizeSecureStoreKey("my-key.v2")).toBe("my-key.v2");
  });

  test("leaves underscores untouched", () => {
    expect(sanitizeSecureStoreKey("valid_key_name")).toBe("valid_key_name");
  });

  test("result is always a valid SecureStore key for known Firebase patterns", () => {
    const rawKeys = [
      "firebase:authUser:apiKey:[DEFAULT]",
      "react-native-firebase/auth/user",
      "@@firebase:token::v1",
      "persist:root",
      "key with spaces and !@#$%",
    ];
    rawKeys.forEach((raw) => {
      const sanitized = sanitizeSecureStoreKey(raw);
      expect(SECURE_STORE_VALID.test(sanitized)).toBe(true);
    });
  });
});
