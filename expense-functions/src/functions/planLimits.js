const { app } = require("@azure/functions");

// Shared plan limits — keep in sync with constants/planLimits.ts on the frontend

const PLAN_LIMITS = {
  free: {
    employeeLimit: 5,
    aiCreditsPerPeriod: 0,
    chatbotRatePerMinute: 0,
    chatbotAccess: false,
    analyticsAccess: false,
    claimsPerMonth: 10       // max claims a free-tier user may submit per calendar month
  },
  trial: {
    employeeLimit: 20,
    aiCreditsPerPeriod: 50,
    chatbotRatePerMinute: 5,
    chatbotAccess: true,
    analyticsAccess: true,
    claimsPerMonth: null     // unlimited
  },
  pro: {
    employeeLimit: 20,
    aiCreditsPerPeriod: 50,
    chatbotRatePerMinute: 10,
    chatbotAccess: true,
    analyticsAccess: true,
    claimsPerMonth: null
  },
  business: {
    employeeLimit: 100,
    aiCreditsPerPeriod: 150,
    chatbotRatePerMinute: 20,
    chatbotAccess: true,
    analyticsAccess: true,
    claimsPerMonth: null
  }
};

app.http("planLimits", {
  methods: ["GET"],
  authLevel: "anonymous",

  handler: async (request, context) => {
    return {
      status: 200,
      jsonBody: PLAN_LIMITS
    };
  }
});

module.exports = PLAN_LIMITS;
