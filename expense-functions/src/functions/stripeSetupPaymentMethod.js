const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { checkRateLimit, WINDOW_15_MIN } = require('./rateLimit');
const { requireAuth, secureResponse } = require('./security');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

////////////////////////////////////////////////////
// SETUP PAYMENT METHOD
// Creates a Stripe Customer (if not exists) and
// returns a SetupIntent client secret so the app
// can collect the admin's card via Stripe SDK.
////////////////////////////////////////////////////

app.http('stripeSetupPaymentMethod', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {

    try {

      // OAUTH 2.0 Bearer verification
      const { uid, authError } = await requireAuth(request);
      if (authError) return authError;

      // 5 per 15 minutes — payment setup is auth-sensitive
      const { allowed } = await checkRateLimit(uid, 'rateLimitSetupPayment', 5, WINDOW_15_MIN);
      if (!allowed) {
        return secureResponse({ error: 'Too many requests. Max 5 per 15 minutes.' }, 429);
      }

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
        await admin.firestore().collection('users').doc(uid).update({ stripeCustomerId: customerId });
      }

      // SetupIntent lets the client securely collect card details
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session', // allow charging without user present
      });

      return secureResponse({ clientSecret: setupIntent.client_secret, customerId }, 200);

    } catch (err) {
      context.error('stripeSetupPaymentMethod error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});

////////////////////////////////////////////////////
// SAVE PAYMENT METHOD
// Called after client-side card setup completes —
// attaches the PM to the customer and saves to Firestore.
////////////////////////////////////////////////////

app.http('stripeSavePaymentMethod', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {

    try {

      const { uid, authError } = await requireAuth(request);
      if (authError) return authError;

      const { paymentMethodId } = await request.json();

      if (!paymentMethodId) {
        return secureResponse({ error: 'paymentMethodId required' }, 400);
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

      return secureResponse({ success: true, last4: card.last4, brand: card.brand }, 200);

    } catch (err) {
      context.error('stripeSavePaymentMethod error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});

////////////////////////////////////////////////////
// CHECK ONBOARDING
// Checks if employee's Connect account onboarding
// is complete and updates Firestore.
////////////////////////////////////////////////////

app.http('stripeCheckOnboarding', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {

    try {

      const { uid, authError } = await requireAuth(request);
      if (authError) return authError;

      const userDoc = await admin.firestore().collection('users').doc(uid).get();
      const { stripeAccountId } = userDoc.data();

      if (!stripeAccountId) {
        return secureResponse({ complete: false }, 200);
      }

      const account = await stripe.accounts.retrieve(stripeAccountId);
      const complete = account.details_submitted && account.charges_enabled;

      if (complete) {
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
            updateData.stripePayoutType = ext.object;
          }
        } catch (_) {}

        await admin.firestore().collection('users').doc(uid).update(updateData);
      }

      return secureResponse({ complete }, 200);

    } catch (err) {
      context.error('stripeCheckOnboarding error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});
