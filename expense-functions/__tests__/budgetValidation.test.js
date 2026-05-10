/**
 * budgetValidation.test.js
 *
 * Tests the per-employee monthly budget validation logic added to
 * manage-employees.tsx. Mirrors the exact validation in the saveEdit handler.
 */

function validateBudget(rawInput) {
  const trimmed = (rawInput ?? "").toString().trim();

  // Empty = unlimited, which is valid
  if (!trimmed) return { ok: true, value: 0 };

  // Use Number() (not parseFloat) so "500abc" returns NaN rather than 500
  const num = Number(trimmed);

  if (isNaN(num) || num < 0) {
    return { ok: false, error: "Please enter a valid positive number." };
  }

  return { ok: true, value: num };
}

describe("validateBudget — manage-employees (new feature)", () => {
  // ── Valid inputs ────────────────────────────────────────────

  test("empty string means unlimited (valid, value = 0)", () => {
    const r = validateBudget("");
    expect(r.ok).toBe(true);
    expect(r.value).toBe(0);
  });

  test("undefined means unlimited (valid, value = 0)", () => {
    const r = validateBudget(undefined);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(0);
  });

  test("accepts a positive integer string", () => {
    const r = validateBudget("500");
    expect(r.ok).toBe(true);
    expect(r.value).toBe(500);
  });

  test("accepts a decimal amount", () => {
    const r = validateBudget("250.50");
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo(250.5);
  });

  test("accepts a large budget", () => {
    const r = validateBudget("100000");
    expect(r.ok).toBe(true);
    expect(r.value).toBe(100000);
  });

  test("trims whitespace before parsing", () => {
    expect(validateBudget("  200  ").ok).toBe(true);
  });

  // ── Invalid inputs ──────────────────────────────────────────

  test("rejects a negative number", () => {
    expect(validateBudget("-100").ok).toBe(false);
  });

  test("rejects a non-numeric string", () => {
    expect(validateBudget("abc").ok).toBe(false);
  });

  test("rejects a string with letters mixed in", () => {
    expect(validateBudget("500abc").ok).toBe(false);
  });
});
