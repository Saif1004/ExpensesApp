const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { checkRateLimit } = require('./rateLimit');
const { requireAuth, secureResponse } = require('./security');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Called when an admin approves a claim.
// Flow:
//   1. Verify admin token (OAuth 2.0 Bearer) + RBAC (admin of same org)
//   2. Charge admin's saved payment method (PaymentIntent)
//   3. Transfer funds to employee's Connect account
//   4. Update claim in Firestore with payment status
app.http('stripeProcessReimbursement', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {

    try {

      ////////////////////////////////////////////////////
      // OAUTH 2.0 — Bearer token verification
      ////////////////////////////////////////////////////

      const { uid, authError } = await requireAuth(request);
      if (authError) return authError;

      const adminUid = uid;

      ////////////////////////////////////////////////////
      // RATE LIMIT (10 reimbursements per minute)
      ////////////////////////////////////////////////////

      const { allowed } = await checkRateLimit(adminUid, 'rateLimitReimburse', 10);
      if (!allowed) {
        return secureResponse({ error: 'Rate limit exceeded. Please slow down.' }, 429);
      }

      const body = await request.json();
      const { claimId } = body;

      if (!claimId) {
        return secureResponse({ error: 'claimId required' }, 400);
      }

      ////////////////////////////////////////////////////
      // LOAD CLAIM
      ////////////////////////////////////////////////////

      const claimRef = admin.firestore().collection('claims').doc(claimId);
      const claimDoc = await claimRef.get();

      if (!claimDoc.exists) {
        return secureResponse({ error: 'Claim not found' }, 404);
      }

      const claim = claimDoc.data();

      if (claim.paymentStatus === 'paid') {
        return secureResponse({ error: 'Claim already paid' }, 400);
      }

      ////////////////////////////////////////////////////
      // RBAC — admin must belong to the same org as the claim
      ////////////////////////////////////////////////////

      const adminMemberSnap = await admin.firestore()
        .collection('memberships')
        .where('userId', '==', adminUid)
        .where('orgId', '==', claim.orgId)
        .where('role', '==', 'admin')
        .where('status', '==', 'approved')
        .limit(1)
        .get();

      if (adminMemberSnap.empty) {
        return secureResponse({ error: 'Not authorised to approve this claim' }, 403);
      }

      ////////////////////////////////////////////////////
      // LOAD ADMIN PAYMENT METHOD
      ////////////////////////////////////////////////////

      const adminDoc = await admin.firestore().collection('users').doc(adminUid).get();
      const adminData = adminDoc.data();

      if (!adminData?.stripeCustomerId || !adminData?.stripePaymentMethodId) {
        return secureResponse({ error: 'Admin has not linked a payment method' }, 400);
      }

      ////////////////////////////////////////////////////
      // LOAD EMPLOYEE CONNECT ACCOUNT
      ////////////////////////////////////////////////////

      const employeeDoc = await admin.firestore().collection('users').doc(claim.userId).get();
      const employeeData = employeeDoc.data();

      if (!employeeData?.stripeAccountId) {
        return secureResponse({ error: 'Employee has not set up their payment account' }, 400);
      }

      if (!employeeData?.stripeOnboardingComplete) {
        return secureResponse({ error: 'Employee has not completed Stripe onboarding' }, 400);
      }

      ////////////////////////////////////////////////////
      // STRIPE PAYMENT
      ////////////////////////////////////////////////////

      const amountPence = Math.round(claim.amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountPence,
        currency: 'gbp',
        customer: adminData.stripeCustomerId,
        payment_method: adminData.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        transfer_data: { destination: employeeData.stripeAccountId },
        description: `Claimio reimbursement: ${claim.category} - ${claim.description || 'No description'}`,
        metadata: {
          claimId,
          orgId: claim.orgId || '',
          adminUid,
          employeeUid: claim.userId,
        },
      });

      ////////////////////////////////////////////////////
      // UPDATE CLAIM
      ////////////////////////////////////////////////////

      await claimRef.update({
        paymentStatus: 'paid',
        paymentIntentId: paymentIntent.id,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return secureResponse({ success: true, paymentIntentId: paymentIntent.id }, 200);

    } catch (err) {
      context.error('stripeProcessReimbursement error:', err);

      // Mark claim as payment_failed on Stripe errors
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

      return secureResponse({ error: err.message }, 500);
    }
  },
});
