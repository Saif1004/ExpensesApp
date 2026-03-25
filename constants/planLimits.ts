// Keep in sync with expense-functions/src/functions/planLimits.js

export type OrgPlan = "free" | "trial" | "pro" | "business";

export const PLAN_LIMITS: Record<
  OrgPlan,
  {
    label: string;
    employeeLimit: number;
    aiCreditsPerPeriod: number;
    chatbotAccess: boolean;
    analyticsAccess: boolean;
    priceMonthly: string | null;
    rcPackageId: string | null;        // RevenueCat monthly package identifier
    rcAnnualPackageId: string | null;  // RevenueCat annual package identifier
    rcEntitlement: string | null;      // RevenueCat entitlement identifier
  }
> = {
  free: {
    label: "Free",
    employeeLimit: 5,
    aiCreditsPerPeriod: 0,
    chatbotAccess: false,
    analyticsAccess: false,
    priceMonthly: null,
    rcPackageId: null,
    rcAnnualPackageId: null,
    rcEntitlement: null
  },
  trial: {
    label: "7-Day Trial",
    employeeLimit: 20,
    aiCreditsPerPeriod: 50,
    chatbotAccess: true,
    analyticsAccess: true,
    priceMonthly: null,
    rcPackageId: null,
    rcAnnualPackageId: null,
    rcEntitlement: null
  },
  pro: {
    label: "Pro",
    employeeLimit: 20,
    aiCreditsPerPeriod: 500,
    chatbotAccess: true,
    analyticsAccess: true,
    priceMonthly: "£9.99",
    rcPackageId: "pro_monthly",       // RevenueCat package identifier (monthly)
    rcAnnualPackageId: "pro_annual",  // RevenueCat package identifier (annual)
    rcEntitlement: "pro"              // RevenueCat entitlement identifier
  },
  business: {
    label: "Business",
    employeeLimit: 100,
    aiCreditsPerPeriod: 2000,
    chatbotAccess: true,
    analyticsAccess: true,
    priceMonthly: "£24.99",
    rcPackageId: "business_monthly",
    rcAnnualPackageId: "business_annual",
    rcEntitlement: "business"
  }
};
