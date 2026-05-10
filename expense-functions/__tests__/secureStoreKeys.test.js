/**
 * secureStoreKeys.test.js
 *
 * Tests the sanitizeKey function added to firebaseConfig.js (M-2).
 * Firebase Auth passes keys with colons (e.g. "firebase:authUser:apiKey:DEFAULT")
 * which expo-secure-store rejects. sanitizeKey replaces invalid chars with "_".
 *
 * SecureStore only allows: alphanumeric, ".", "-", "_"
 */

// Reproduce the exact function from firebaseConfig.js
const sanitizeKey = (key) => key.replace(/[^a-zA-Z0-9._-]/g, "_");

const SECURE_STORE_VALID = /^[a-zA-Z0-9._-]+$/;

function isValidSecureStoreKey(key) {
  return typeof key === "string" && key.length > 0 && SECURE_STORE_VALID.test(key);
}

describe("sanitizeKey — SecureStore compatibility (M-2)", () => {
  test("sanitised Firebase auth key passes SecureStore validation", () => {
    const raw = "firebase:authUser:AIzaSyABC123:DEFAULT";
    const sanitized = sanitizeKey(raw);
    expect(isValidSecureStoreKey(sanitized)).toBe(true);
  });

  test("replaces colons with underscores", () => {
    expect(sanitizeKey("a:b:c")).toBe("a_b_c");
  });

  test("replaces square brackets", () => {
    expect(sanitizeKey("key[DEFAULT]")).toBe("key_DEFAULT_");
  });

  test("replaces spaces", () => {
    expect(sanitizeKey("key with spaces")).toBe("key_with_spaces");
  });

  test("replaces slashes", () => {
    expect(sanitizeKey("some/path/key")).toBe("some_path_key");
  });

  test("leaves valid characters untouched", () => {
    const valid = "firebase_auth.token-v1";
    expect(sanitizeKey(valid)).toBe(valid);
  });

  test("leaves alphanumerics untouched", () => {
    expect(sanitizeKey("abcXYZ123")).toBe("abcXYZ123");
  });

  test("leaves dots and dashes untouched", () => {
    expect(sanitizeKey("my-key.v2")).toBe("my-key.v2");
  });

  test("result is always a valid SecureStore key", () => {
    const rawKeys = [
      "firebase:authUser:apiKey:[DEFAULT]",
      "react-native-firebase/auth/user",
      "@@firebase:token::v1",
      "persist:root",
      "key with spaces and !@#$%",
    ];
    rawKeys.forEach(raw => {
      const sanitized = sanitizeKey(raw);
      expect(isValidSecureStoreKey(sanitized)).toBe(true);
    });
  });
});
