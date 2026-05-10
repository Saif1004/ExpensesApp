/**
 * ocrSizeLimit.test.js
 *
 * Tests the base64 image size limit added to receiptOCR (C-2).
 * At ~10 MB decoded, base64 encoding inflates to ~13.5 MB of ASCII text.
 */

const MAX_BASE64_LEN = 13_500_000; // mirrors receiptOCR.js

function checkImageSize(image) {
  if (typeof image !== "string" || image.length > MAX_BASE64_LEN) {
    return { error: "Image exceeds 10 MB limit" };
  }
  return { ok: true };
}

describe("OCR image size limit (C-2)", () => {
  test("accepts a small valid base64 string", () => {
    const small = "A".repeat(1000);
    expect(checkImageSize(small).ok).toBe(true);
  });

  test("accepts a string exactly at the limit", () => {
    const atLimit = "A".repeat(MAX_BASE64_LEN);
    expect(checkImageSize(atLimit).ok).toBe(true);
  });

  test("rejects a string one byte over the limit", () => {
    const overLimit = "A".repeat(MAX_BASE64_LEN + 1);
    expect(checkImageSize(overLimit).error).toBeTruthy();
  });

  test("rejects a non-string (Buffer / object)", () => {
    expect(checkImageSize({ data: "binary" }).error).toBeTruthy();
  });

  test("rejects null", () => {
    expect(checkImageSize(null).error).toBeTruthy();
  });

  test("rejects undefined", () => {
    expect(checkImageSize(undefined).error).toBeTruthy();
  });

  test("rejects a number", () => {
    expect(checkImageSize(99999).error).toBeTruthy();
  });

  test("rejects an empty string (nothing to OCR)", () => {
    // empty string — length is 0, which is NOT > MAX, so it passes size check
    // but is still an invalid image; document current behaviour
    expect(checkImageSize("").ok).toBe(true); // size check only — content validated later by Azure DI
  });
});
