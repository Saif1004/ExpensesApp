const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Creates a Stripe Customer for the admin (if not exists) and returns a
// SetupIntent client secret so the app can collect their card via Stripe SDK.
app.http('stripeSetupPaymentMethod', {
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

      let customerId = userData?.stripeCustomerId;

      // Create Stripe Customer if not exists
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userData.email,
          name: userData.displayName || userData.email,
          metadata: { uid },
        });
        customerId = customer.id;
        await admin.firestore().collection('users').doc(uid).update({
          stripeCustomerId: customerId,
        });
      }

      // Create SetupIntent so client can securely collect card
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session', // allow charging without user present
      });

      return new Response(JSON.stringify({
        clientSecret: setupIntent.client_secret,
        customerId,
      }), { status: 200, headers });
    } catch (err) {
      context.error('stripeSetupPaymentMethod error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  },
});

// Called after client-side card setup completes — saves the payment method ID to Firestore.
app.http('stripeSavePaymentMethod', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const headers = { 'Content-Type': 'application/json' };

    try {
      const authHeader = request.headers.get('authorization') || '';
      const idToken = authHeader.replace('Bearer ', '');
      const decoded = await admin.auth().verifyIdToken(idToken);
      const uid = decoded.uid;

      const { paymentMethodId } = await request.json();

      if (!paymentMethodId) {
        return new Response(JSON.stringify({ error: 'paymentMethodId required' }), { status: 400, headers });
      }

      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      const { stripeCustomerId } = userDoc.data();

      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });

      // Set as default
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // Retrieve card details to display
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      const card = pm.card;

      await admin.firestore().collection('users').doc(uid).update({
        stripePaymentMethodId: paymentMethodId,
        stripeCardLast4: card.last4,
        stripeCardBrand: card.brand,
      });

      return new Response(JSON.stringify({
        success: true,
        last4: card.last4,
        brand: card.brand,
      }), { status: 200, headers });
    } catch (err) {
      context.error('stripeSavePaymentMethod error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  },
});

// Checks if employee's Connect account onboarding is complete and updates Firestore.
app.http('stripeCheckOnboarding', {
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
      const { stripeAccountId } = userDoc.data();

      if (!stripeAccountId) {
        return new Response(JSON.stringify({ complete: false }), { status: 200, headers });
      }

      const account = await stripe.accounts.retrieve(stripeAccountId);
      const complete = account.details_submitted && account.charges_enabled;

      if (complete) {
        // Fetch external account details (bank account or debit card)
        const updateData = { stripeOnboardingComplete: true };

        try {
          const externalAccounts = await stripe.accounts.listExternalAccounts(
            stripeAccountId,
            { limit: 1 }
          );
          const ext = externalAccounts.data[0];
          if (ext) {
            updateData.stripePayoutLast4 = ext.last4;
            updateData.stripePayoutBrand = ext.object === 'card'
              ? (ext.brand || 'Card')
              : (ext.bank_name || 'Bank Account');
            updateData.stripePayoutType = ext.object; // 'card' or 'bank_account'
          }
        } catch (_) {}

        await admin.firestore().collection('users').doc(uid).update(updateData);
      }

      return new Response(JSON.stringify({ complete }), { status: 200, headers });
    } catch (err) {
      context.error('stripeCheckOnboarding error:', err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  },
});
