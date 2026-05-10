/**
 * planLimits.test.js
 *
 * Verifies the plan-limits constants that drive claim caps, AI credits,
 * employee limits, and chatbot access. Catching accidental regressions here
 * is cheap — a wrong constant would silently break billing enforcement.
 */

// planLimits.js exports the PLAN_LIMITS object via module.exports = PLAN_LIMITS.
// Requiring it also registers the Azure Function, but that's harmless in tests.
// We mock @azure/functions to avoid loading the real Azure SDK.
jest.mock("@azure/functions", () => ({
  app: { http: jest.fn() },
}));
jest.mock("../src/functions/security", () => ({
  requireAuth: jest.fn(),
  secureResponse: jest.fn(),
}));

const PLAN_LIMITS = require("../src/functions/planLimits");

describe("PLAN_LIMITS constants", () => {
  const plans = ["free", "trial", "pro", "business"];

  test("all four plans are defined", () => {
    plans.forEach(p => expect(PLAN_LIMITS[p]).toBeDefined());
  });

  test("free plan has a claim cap", () => {
    expect(PLAN_LIMITS.free.claimsPerMonth).toBeGreaterThan(0);
  });

  test("pro plan has unlimited claims (null)", () => {
    expect(PLAN_LIMITS.pro.claimsPerMonth).toBeNull();
  });

  test("business plan has unlimited claims (null)", () => {
    expect(PLAN_LIMITS.business.claimsPerMonth).toBeNull();
  });

  test("free plan has no chatbot access", () => {
    expect(PLAN_LIMITS.free.chatbotAccess).toBe(false);
  });

  test("pro plan has chatbot access", () => {
    expect(PLAN_LIMITS.pro.chatbotAccess).toBe(true);
  });

  test("business plan has higher AI credits than pro", () => {
    expect(PLAN_LIMITS.business.aiCreditsPerPeriod).toBeGreaterThan(
      PLAN_LIMITS.pro.aiCreditsPerPeriod
    );
  });

  test("business plan has higher employee limit than pro", () => {
    expect(PLAN_LIMITS.business.employeeLimit).toBeGreaterThan(
      PLAN_LIMITS.pro.employeeLimit
    );
  });

  test("trial plan has the same employee limit as business", () => {
    expect(PLAN_LIMITS.trial.employeeLimit).toBe(PLAN_LIMITS.business.employeeLimit);
  });

  test("no plan has negative values", () => {
    plans.forEach(p => {
      const pl = PLAN_LIMITS[p];
      if (pl.claimsPerMonth !== null) expect(pl.claimsPerMonth).toBeGreaterThan(0);
      expect(pl.employeeLimit).toBeGreaterThan(0);
      expect(pl.aiCreditsPerPeriod).toBeGreaterThanOrEqual(0);
    });
  });
});
