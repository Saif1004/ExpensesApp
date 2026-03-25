// Shared plan limits — keep in sync with constants/planLimits.ts on the frontend

const PLAN_LIMITS = {
  free: {
    employeeLimit: 5,
    aiCreditsPerPeriod: 0,
    chatbotRatePerMinute: 0,
    chatbotAccess: false,
    analyticsAccess: false
  },
  trial: {
    employeeLimit: 20,
    aiCreditsPerPeriod: 50,
    chatbotRatePerMinute: 5,
    chatbotAccess: true,
    analyticsAccess: true
  },
  pro: {
    employeeLimit: 20,
    aiCreditsPerPeriod: 500,
    chatbotRatePerMinute: 10,
    chatbotAccess: true,
    analyticsAccess: true
  },
  business: {
    employeeLimit: 100,
    aiCreditsPerPeriod: 2000,
    chatbotRatePerMinute: 20,
    chatbotAccess: true,
    analyticsAccess: true
  }
};

module.exports = PLAN_LIMITS;
