/**
 * passwordPolicy.test.js
 *
 * Tests the client-side password validation rules from sign-up.tsx (L-6).
 * We replicate the validation function here so it can be tested without
 * a React Native environment.
 *
 * Rules enforced:
 *  1. At least 8 characters
 *  2. At least one uppercase letter
 *  3. At least one lowercase letter
 *  4. At least one digit
 *  5. At least one special character (non-alphanumeric)
 */

function validatePassword(password) {
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
  return null; // valid
}

describe("validatePassword — sign-up policy (L-6)", () => {
  // ── Valid passwords ─────────────────────────────────────────

  test("accepts a strong password", () => {
    expect(validatePassword("Secure@123")).toBeNull();
  });

  test("accepts a long mixed-character password", () => {
    expect(validatePassword("MyStr0ng!Pass#2024")).toBeNull();
  });

  test("accepts password with various special chars", () => {
    ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "-", "_", "=", "+"].forEach(char => {
      expect(validatePassword(`Abc1${char}defg`)).toBeNull();
    });
  });

  // ── Too short ───────────────────────────────────────────────

  test("rejects a 7-character password", () => {
    expect(validatePassword("Abc1!ef")).toBeTruthy();
  });

  test("rejects an empty string", () => {
    expect(validatePassword("")).toBeTruthy();
  });

  test("rejects null", () => {
    expect(validatePassword(null)).toBeTruthy();
  });

  // ── Missing character classes ───────────────────────────────

  test("rejects a password with no uppercase", () => {
    expect(validatePassword("secure@123")).toBeTruthy();
  });

  test("rejects a password with no lowercase", () => {
    expect(validatePassword("SECURE@123")).toBeTruthy();
  });

  test("rejects a password with no digit", () => {
    expect(validatePassword("Secure@abc")).toBeTruthy();
  });

  test("rejects a password with no special character (L-6 fix)", () => {
    // This was the newly added requirement
    expect(validatePassword("Secure123abc")).toBeTruthy();
    expect(validatePassword("Password1")).toBeTruthy();
  });

  // ── Boundary conditions ─────────────────────────────────────

  test("accepts exactly 8 characters if all rules met", () => {
    expect(validatePassword("Abc1!xyz")).toBeNull();
  });

  test("rejects a password that looks strong but has no special char", () => {
    expect(validatePassword("Secure123456")).toBeTruthy();
  });
});
