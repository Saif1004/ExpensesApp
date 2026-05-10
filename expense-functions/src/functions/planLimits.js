const { app } = require("@azure/functions");
const { requireAuth, secureResponse } = require("./security");

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
    employeeLimit: 100,        // business-level — try the full product
    aiCreditsPerPeriod: 50,    // one-time allotment (no monthly reset — trial expires)
    chatbotRatePerMinute: 10,
    chatbotAccess: true,
    analyticsAccess: true,
    claimsPerMonth: 25         // capped during trial to limit abuse
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
    const { uid, authError } = await requireAuth(request);
    if (authError) return authError;
    return secureResponse(PLAN_LIMITS, 200);
  }
});

module.exports = PLAN_LIMITS;
