const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const { authAndLimit, WINDOW_15_MIN } = require('./rateLimit');
const { secureResponse } = require('./security');
const { sendEmail, sendPush, claimApprovedEmail, claimRejectedEmail } = require('./notify');

// Called by the mobile app after an admin approves or rejects a claim.
// Sends both an email and a push notification to the employee.
app.http('notifyClaimStatus', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {

      const auth = await authAndLimit(request, 'rateLimitNotifyClaim', 30, WINDOW_15_MIN);
      if (auth.error) return auth.error;
      const adminUid = auth.uid;

      const { claimId, status, adminFeedback } = await request.json();

      if (!claimId || !['approved', 'rejected'].includes(status)) {
        return secureResponse({ error: 'claimId and valid status required' }, 400);
      }

      // Load claim
      const claimDoc = await admin.firestore().collection('claims').doc(claimId).get();
      if (!claimDoc.exists) return secureResponse({ error: 'Claim not found' }, 404);
      const claim = claimDoc.data();

      // Verify caller is an admin of the same org
      const memberSnap = await admin.firestore()
        .collection('memberships')
        .where('userId', '==', adminUid)
        .where('orgId', '==', claim.orgId)
        .where('role', '==', 'admin')
        .where('status', '==', 'approved')
        .limit(1).get();

      if (memberSnap.empty) {
        return secureResponse({ error: 'Forbidden' }, 403);
      }

      // Load employee
      const empDoc = await admin.firestore().collection('users').doc(claim.userId).get();
      if (!empDoc.exists) return secureResponse({ success: true }, 200); // employee deleted — no-op
      const emp = empDoc.data();

      const amount   = Number(claim.amount).toFixed(2);
      const merchant = claim.merchant ?? 'Unknown merchant';
      const category = claim.category ?? 'Expense';
      const empName  = emp.displayName || emp.email || 'there';
      const feedback = adminFeedback || null;

      // Send push notification
      if (emp.expoPushToken) {
        await sendPush(
          emp.expoPushToken,
          status === 'approved' ? 'Claim Approved ✅' : 'Claim Rejected',
          status === 'approved'
            ? `Your £${amount} claim at ${merchant} was approved`
            : `Your £${amount} claim at ${merchant} was rejected`,
          { claimId }
        ).catch(() => {});
      }

      // Send email
      if (emp.email) {
        const subject = status === 'approved'
          ? `Your £${amount} claim has been approved ✅`
          : `Your £${amount} claim has been rejected`;

        const html = status === 'approved'
          ? claimApprovedEmail({ employeeName: empName, amount, merchant, category, adminFeedback: feedback })
          : claimRejectedEmail({ employeeName: empName, amount, merchant, category, adminFeedback: feedback });

        await sendEmail(emp.email, subject, html).catch((err) => {
          context.warn('Email send failed:', err?.message);
        });
      }

      return secureResponse({ success: true }, 200);

    } catch (err) {
      context.error('notifyClaimStatus error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});
