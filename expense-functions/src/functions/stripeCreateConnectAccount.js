const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Creates a Stripe Connect Express account for an employee so they can receive payouts.
// Stores the stripeAccountId on the user's Firestore document.
app.http('stripeCreateConnectAccount', {
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

      if (!userDoc.exists) {
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers });
      }

      // If already has a Connect account, return existing id
      if (userData.stripeAccountId) {
        return new Response(JSON.stringify({ accountId: userData.stripeAccountId }), { status: 200, headers });
      }

      // Create Stripe Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email: userData.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { uid },
      });

      // Save to Firestore
      await admin.firestore().collection('users').doc(uid).update({
        stripeAccountId: account.id,
        stripeOnboardingComplete: false,
      });

      return new Response(JSON.stringify({ accountId: account.id }), { status: 200, headers });
    } catch (err) {
      context.error('stripeCreateConnectAccount error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  },
});
