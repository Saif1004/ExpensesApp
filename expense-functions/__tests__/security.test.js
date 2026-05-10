/**
 * security.test.js
 *
 * Unit tests for all pure validation and sanitisation helpers in security.js.
 * These functions are the gatekeepers for every piece of user input that enters
 * the system — so high coverage here gives high confidence across all features.
 */

// Avoid registering any Azure Function handlers when requiring security.js
// (security.js itself doesn't call app.http, so this is safe already)
const {
  validateAmount,
  validateDate,
  validateCategory,
  validateString,
  sanitize,
  secureResponse,
  SECURITY_HEADERS,
} = require("../src/functions/security");

// ─────────────────────────────────────────────────────────────
// validateAmount
// ─────────────────────────────────────────────────────────────

describe("validateAmount", () => {
  // Happy path
  test("accepts a valid positive integer", () => {
    const r = validateAmount(50);
    expect(r.fieldError).toBeUndefined();
    expect(r.value).toBe(50);
  });

  test("accepts a valid decimal amount", () => {
    const r = validateAmount(12.99);
    expect(r.value).toBeCloseTo(12.99);
  });

  test("accepts a string-encoded number (form input)", () => {
    const r = validateAmount("29.50");
    expect(r.fieldError).toBeUndefined();
    expect(r.value).toBeCloseTo(29.5);
  });

  test("accepts the maximum allowed amount (100000)", () => {
    const r = validateAmount(100000);
    expect(r.fieldError).toBeUndefined();
    expect(r.value).toBe(100000);
  });

  // Edge / error cases
  test("rejects zero", () => {
    expect(validateAmount(0).fieldError).toBeTruthy();
  });

  test("rejects a negative number", () => {
    expect(validateAmount(-10).fieldError).toBeTruthy();
  });

  test("rejects undefined", () => {
    expect(validateAmount(undefined).fieldError).toBeTruthy();
  });

  test("rejects null", () => {
    expect(validateAmount(null).fieldError).toBeTruthy();
  });

  test("rejects an empty string", () => {
    expect(validateAmount("").fieldError).toBeTruthy();
  });

  test("rejects a non-numeric string", () => {
    expect(validateAmount("abc").fieldError).toBeTruthy();
  });

  test("rejects an amount above £100,000", () => {
    expect(validateAmount(100001).fieldError).toBeTruthy();
  });

  test("rejects NaN", () => {
    expect(validateAmount(NaN).fieldError).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// validateDate
// ─────────────────────────────────────────────────────────────

describe("validateDate", () => {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  })();
  const future = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  })();

  test("accepts today's date", () => {
    expect(validateDate(today).fieldError).toBeUndefined();
  });

  test("accepts a past date", () => {
    expect(validateDate("2024-01-15").fieldError).toBeUndefined();
  });

  test("accepts yesterday", () => {
    expect(validateDate(yesterday).fieldError).toBeUndefined();
  });

  test("rejects a future date", () => {
    expect(validateDate(future).fieldError).toBeTruthy();
  });

  test("rejects an invalid date string", () => {
    expect(validateDate("not-a-date").fieldError).toBeTruthy();
  });

  test("rejects undefined", () => {
    expect(validateDate(undefined).fieldError).toBeTruthy();
  });

  test("rejects null", () => {
    expect(validateDate(null).fieldError).toBeTruthy();
  });

  test("rejects an empty string", () => {
    expect(validateDate("").fieldError).toBeTruthy();
  });

  test("rejects a number", () => {
    expect(validateDate(20240101).fieldError).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// validateCategory
// ─────────────────────────────────────────────────────────────

describe("validateCategory", () => {
  const validCategories = ["Meals", "Travel", "Technology", "Office"];

  validCategories.forEach((cat) => {
    test(`accepts valid category: ${cat}`, () => {
      expect(validateCategory(cat).fieldError).toBeUndefined();
    });
  });

  test("rejects an unknown category", () => {
    expect(validateCategory("Gambling").fieldError).toBeTruthy();
  });

  test("rejects lowercase (case-sensitive)", () => {
    expect(validateCategory("travel").fieldError).toBeTruthy();
  });

  test("rejects undefined", () => {
    expect(validateCategory(undefined).fieldError).toBeTruthy();
  });

  test("rejects an empty string", () => {
    expect(validateCategory("").fieldError).toBeTruthy();
  });

  test("rejects a SQL injection attempt", () => {
    expect(validateCategory("'; DROP TABLE claims; --").fieldError).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// validateString
// ─────────────────────────────────────────────────────────────

describe("validateString", () => {
  test("accepts a normal merchant name", () => {
    const r = validateString("Starbucks", "merchant");
    expect(r.fieldError).toBeUndefined();
    expect(r.value).toBe("Starbucks");
  });

  test("trims leading and trailing whitespace", () => {
    const r = validateString("  Apple  ", "merchant");
    expect(r.value).toBe("Apple");
  });

  test("rejects an empty string", () => {
    expect(validateString("", "merchant").fieldError).toBeTruthy();
  });

  test("rejects a whitespace-only string", () => {
    expect(validateString("   ", "merchant").fieldError).toBeTruthy();
  });

  test("rejects undefined", () => {
    expect(validateString(undefined, "merchant").fieldError).toBeTruthy();
  });

  test("rejects null", () => {
    expect(validateString(null, "merchant").fieldError).toBeTruthy();
  });

  test("rejects a string exceeding maxLen", () => {
    const long = "a".repeat(201);
    expect(validateString(long, "merchant", { maxLen: 200 }).fieldError).toBeTruthy();
  });

  test("accepts a string exactly at maxLen", () => {
    const exact = "a".repeat(200);
    expect(validateString(exact, "merchant", { maxLen: 200 }).fieldError).toBeUndefined();
  });

  test("rejects a number", () => {
    expect(validateString(42, "merchant").fieldError).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// sanitize
// ─────────────────────────────────────────────────────────────

describe("sanitize", () => {
  test("returns the value trimmed", () => {
    expect(sanitize("  hello  ")).toBe("hello");
  });

  test("strips HTML tags", () => {
    expect(sanitize("<script>alert(1)</script>")).not.toContain("<script>");
    expect(sanitize("<b>bold</b>")).not.toContain("<");
  });

  test("strips angle brackets", () => {
    expect(sanitize("foo<bar>baz")).not.toContain("<");
    expect(sanitize("foo<bar>baz")).not.toContain(">");
  });

  test("strips single quotes", () => {
    expect(sanitize("it's")).not.toContain("'");
  });

  test("strips double quotes", () => {
    expect(sanitize('say "hello"')).not.toContain('"');
  });

  test("leaves normal text intact", () => {
    expect(sanitize("Starbucks Coffee")).toBe("Starbucks Coffee");
  });

  test("handles non-string input gracefully (returns as-is)", () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(null)).toBe(null);
    expect(sanitize(undefined)).toBe(undefined);
  });
});

// ─────────────────────────────────────────────────────────────
// secureResponse
// ─────────────────────────────────────────────────────────────

describe("secureResponse", () => {
  test("returns a Response with the correct status code", () => {
    const r = secureResponse({ ok: true }, 200);
    expect(r.status).toBe(200);
  });

  test("returns a 400 response for client errors", () => {
    const r = secureResponse({ error: "bad request" }, 400);
    expect(r.status).toBe(400);
  });

  test("returns a 500 response for server errors", () => {
    const r = secureResponse({ error: "internal" }, 500);
    expect(r.status).toBe(500);
  });

  test("sets security headers on the response", () => {
    const r = secureResponse({ ok: true }, 200);
    // secureResponse should include Content-Type
    expect(r.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  test("body serialises to valid JSON", async () => {
    const payload = { valid: true, claimId: "abc123" };
    const r = secureResponse(payload, 200);
    const body = await r.json();
    expect(body).toEqual(payload);
  });
});
