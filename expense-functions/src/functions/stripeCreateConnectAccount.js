const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { authAndLimit, WINDOW_15_MIN } = require('./rateLimit');
const { secureResponse } = require('./security');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Creates a Stripe Connect Express account for an employee so they can receive payouts.
// Stores the stripeAccountId on the user's Firestore document.
app.http('stripeCreateConnectAccount', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {

    try {

      ////////////////////////////////////////////////////
      // OAUTH 2.0 — Bearer token verification
      ////////////////////////////////////////////////////

      const auth = await authAndLimit(request, 'rateLimitCreateAccount', 5, WINDOW_15_MIN);
      if (auth.error) return auth.error;
      const uid = auth.uid;

      ////////////////////////////////////////////////////
      // LOAD USER
      ////////////////////////////////////////////////////

      const userDoc = await admin.firestore().collection('users').doc(uid).get();

      if (!userDoc.exists) {
        return secureResponse({ error: 'User not found' }, 404);
      }

      const userData = userDoc.data();

      // If already has a Connect account, return existing id
      if (userData.stripeAccountId) {
        return secureResponse({ accountId: userData.stripeAccountId }, 200);
      }

      ////////////////////////////////////////////////////
      // CREATE STRIPE EXPRESS ACCOUNT
      ////////////////////////////////////////////////////

      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email: userData.email,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata: { uid },
      });

      await admin.firestore().collection('users').doc(uid).update({
        stripeAccountId: account.id,
        stripeOnboardingComplete: false,
      });

      return secureResponse({ accountId: account.id }, 200);

    } catch (err) {
      context.error('stripeCreateConnectAccount error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});
