const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { checkRateLimit, WINDOW_15_MIN } = require('./rateLimit');
const { requireAuth, secureResponse } = require('./security');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Returns a Stripe-hosted onboarding link for a Connect Express account.
// Employee taps this link to add their bank/debit card details.
app.http('stripeOnboardingLink', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {

    try {

      ////////////////////////////////////////////////////
      // OAUTH 2.0 — Bearer token verification
      ////////////////////////////////////////////////////

      const { uid, authError } = await requireAuth(request);
      if (authError) return authError;

      ////////////////////////////////////////////////////
      // RATE LIMIT (5 per 15 minutes — auth-sensitive)
      ////////////////////////////////////////////////////

      const { allowed } = await checkRateLimit(uid, 'rateLimitOnboardingLink', 5, WINDOW_15_MIN);
      if (!allowed) {
        return secureResponse({ error: 'Too many requests. Max 5 per 15 minutes.' }, 429);
      }

      ////////////////////////////////////////////////////
      // LOAD USER + VALIDATE CONNECT ACCOUNT
      ////////////////////////////////////////////////////

      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      const userData = userDoc.data();

      if (!userData?.stripeAccountId) {
        return secureResponse({ error: 'No Connect account found. Create one first.' }, 400);
      }

      ////////////////////////////////////////////////////
      // CREATE ACCOUNT LINK
      ////////////////////////////////////////////////////

      const accountLink = await stripe.accountLinks.create({
        account: userData.stripeAccountId,
        refresh_url: 'https://saifexpensewin2026.azurewebsites.net/api/stripe-refresh',
        return_url: 'https://saifexpensewin2026.azurewebsites.net/api/stripe-return',
        type: 'account_onboarding',
      });

      return secureResponse({ url: accountLink.url }, 200);

    } catch (err) {
      context.error('stripeOnboardingLink error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});
