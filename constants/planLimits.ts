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
    priceAnnual: string | null;
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
    priceAnnual: null,
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
    priceAnnual: null,
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
    priceMonthly: "£14.99",
    priceAnnual: "£143.88",           // £11.99/month billed annually (~20% saving)
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
    priceMonthly: "£34.99",
    priceAnnual: "£335.88",           // £27.99/month billed annually (~20% saving)
    rcPackageId: "business_monthly",
    rcAnnualPackageId: "business_annual",
    rcEntitlement: "business"
  }
};
