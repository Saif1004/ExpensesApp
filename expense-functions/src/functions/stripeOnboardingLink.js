const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Returns a Stripe-hosted onboarding link for a Connect Express account.
// Employee taps this link to add their bank/debit card details.
app.http('stripeOnboardingLink', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const headers = { 'Content-Type': 'application/json' };

    try {
      const authHeader = request.headers.get('authorization') || '';
      const idToken = authHeader.replace('Bearer ', '');
      const decoded = await admin.auth().verifyIdToken(idToken);
      const uid = decoded.uid;

      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      const userData = userDoc.data();

      if (!userData?.stripeAccountId) {
        return new Response(JSON.stringify({ error: 'No Connect account found. Create one first.' }), { status: 400, headers });
      }

      const accountLink = await stripe.accountLinks.create({
        account: userData.stripeAccountId,
        refresh_url: 'https://saifexpensewin2026.azurewebsites.net/api/stripe-refresh',
        return_url: 'https://saifexpensewin2026.azurewebsites.net/api/stripe-return',
        type: 'account_onboarding',
      });

      return new Response(JSON.stringify({ url: accountLink.url }), { status: 200, headers });
    } catch (err) {
      context.error('stripeOnboardingLink error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  },
});
