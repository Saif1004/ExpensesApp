const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Called when an admin approves a claim.
// Flow:
//   1. Charge admin's saved payment method (PaymentIntent)
//   2. Transfer funds to employee's Connect account
//   3. Update claim in Firestore with payment status
app.http('stripeProcessReimbursement', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const headers = { 'Content-Type': 'application/json' };

    try {
      const authHeader = request.headers.get('authorization') || '';
      const idToken = authHeader.replace('Bearer ', '');
      const decoded = await admin.auth().verifyIdToken(idToken);
      const adminUid = decoded.uid;

      const body = await request.json();
      const { claimId } = body;

      if (!claimId) {
        return new Response(JSON.stringify({ error: 'claimId required' }), { status: 400, headers });
      }

      // Load claim — claims are stored at root /claims/{claimId}
      const claimRef = admin.firestore().collection('claims').doc(claimId);
      const claimDoc = await claimRef.get();

      if (!claimDoc.exists) {
        return new Response(JSON.stringify({ error: 'Claim not found' }), { status: 404, headers });
      }

      const claim = claimDoc.data();

      if (claim.paymentStatus === 'paid') {
        return new Response(JSON.stringify({ error: 'Claim already paid' }), { status: 400, headers });
      }

      // Load admin's Stripe customer + payment method
      const adminDoc = await admin.firestore().collection('users').doc(adminUid).get();
      const adminData = adminDoc.data();

      if (!adminData?.stripeCustomerId || !adminData?.stripePaymentMethodId) {
        return new Response(JSON.stringify({ error: 'Admin has not linked a payment method' }), { status: 400, headers });
      }

      // Load employee's Connect account
      const employeeDoc = await admin.firestore().collection('users').doc(claim.userId).get();
      const employeeData = employeeDoc.data();

      if (!employeeData?.stripeAccountId) {
        return new Response(JSON.stringify({ error: 'Employee has not set up their payment account' }), { status: 400, headers });
      }

      if (!employeeData?.stripeOnboardingComplete) {
        return new Response(JSON.stringify({ error: 'Employee has not completed Stripe onboarding' }), { status: 400, headers });
      }

      const amountPence = Math.round(claim.amount * 100); // convert £ to pence

      // Charge admin's card (with destination transfer to employee)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountPence,
        currency: 'gbp',
        customer: adminData.stripeCustomerId,
        payment_method: adminData.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        transfer_data: {
          destination: employeeData.stripeAccountId,
        },
        description: `Claimio reimbursement: ${claim.category} - ${claim.description || 'No description'}`,
        metadata: {
          claimId,
          orgId: claim.orgId || '',
          adminUid,
          employeeUid: claim.userId,
        },
      });

      // Update claim with payment info
      await claimRef.update({
        paymentStatus: 'paid',
        paymentIntentId: paymentIntent.id,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return new Response(JSON.stringify({ success: true, paymentIntentId: paymentIntent.id }), { status: 200, headers });
    } catch (err) {
      context.error('stripeProcessReimbursement error:', err);

      // Mark claim as payment_failed if it was a Stripe error
      if (err.type?.startsWith('Stripe')) {
        try {
          const { claimId } = await request.json().catch(() => ({}));
          if (claimId) {
            await admin.firestore()
              .collection('claims').doc(claimId)
              .update({ paymentStatus: 'failed', paymentError: err.message });
          }
        } catch (_) {}
      }

      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  },
});
