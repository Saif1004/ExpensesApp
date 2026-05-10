/**
 * inviteCode.test.js
 *
 * Tests the invite code validation regex used in resolveInviteCode.js (L-2).
 * Only 4–10 uppercase alphanumeric characters are accepted to prevent
 * brute-force enumeration of codes.
 */

const INVITE_CODE_REGEX = /^[A-Z0-9]{4,10}$/;

function validateInviteCode(raw) {
  if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
    return { valid: false };
  }
  const code = raw.trim().toUpperCase();
  return { valid: INVITE_CODE_REGEX.test(code), normalized: code };
}

describe("validateInviteCode — resolveInviteCode (L-2)", () => {
  // ── Valid codes ─────────────────────────────────────────────

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

  // ── Invalid codes ───────────────────────────────────────────

  test("rejects a 3-char code (too short)", () => {
    expect(validateInviteCode("ABC").valid).toBe(false);
  });

  test("rejects an 11-char code (too long)", () => {
    expect(validateInviteCode("ABCDE123456").valid).toBe(false);
  });

  test("rejects a code with special characters", () => {
    expect(validateInviteCode("ABC-12").valid).toBe(false);
  });

  test("rejects a code with spaces", () => {
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

  test("rejects a SQL injection payload", () => {
    expect(validateInviteCode("'; DROP--").valid).toBe(false);
  });
});
