const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const { authAndLimit, WINDOW_15_MIN } = require('./rateLimit');
const { secureResponse } = require('./security');
const { sendEmail, sendPush, claimApprovedEmail, claimRejectedEmail } = require('./notify');

// ── Webhook helpers ──────────────────────────────────────────────────────────

async function sendWebhook(url, payload) {
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch { /* non-fatal */ }
}

function slackPayload(emoji, title, fields) {
  return {
    text: `${emoji} ${title}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${emoji} ${title}*` } },
      { type: 'section', fields: fields.map(([l, v]) => ({ type: 'mrkdwn', text: `*${l}*\n${v}` })) },
    ],
  };
}

function teamsPayload(emoji, title, fields) {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '6366F1',
    summary: title,
    sections: [{ activityTitle: `${emoji} ${title}`, facts: fields.map(([n, v]) => ({ name: n, value: v })) }],
  };
}

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

      if (!claimId || !['approved', 'rejected', 'pending_l2'].includes(status)) {
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

      // load org webhook URLs (non-blocking — no error if missing)
      const orgDoc = await admin.firestore().collection('organisations').doc(claim.orgId).get().catch(() => null);
      const orgData = orgDoc?.exists ? orgDoc.data() : {};
      const slackUrl = orgData.slackWebhookUrl || null;
      const teamsUrl = orgData.teamsWebhookUrl || null;

      // notify all admins when a claim needs L2 sign-off
      if (status === 'pending_l2') {
        const adminSnap = await admin.firestore()
          .collection('memberships')
          .where('orgId', '==', claim.orgId)
          .where('role', '==', 'admin')
          .where('status', '==', 'approved')
          .get();

        await Promise.all(adminSnap.docs.map(async memberDoc => {
          const adminUser = await admin.firestore().collection('users').doc(memberDoc.data().userId).get();
          if (!adminUser.exists) return;
          const a = adminUser.data();
          const amount = Number(claim.amount).toFixed(2);

          if (a.expoPushToken && a.notifPushEnabled !== false) {
            await sendPush(a.expoPushToken, '⚠️ Second Approval Needed',
              `A £${amount} claim at ${claim.merchant ?? 'Unknown'} needs your final sign-off`,
              { claimId }
            ).catch(() => {});
          }
          if (a.email && a.notifEmailEnabled !== false) {
            await sendEmail(a.email,
              `Second approval needed: £${amount} claim`,
              `<p>A £${amount} claim at ${claim.merchant ?? 'Unknown'} from ${claim.userEmail ?? 'employee'} has passed L1 review and needs your final approval.</p><p>Open the Claimio admin panel to review it.</p>`
            ).catch(() => {});
          }
        }));

        // fire webhooks for L2 escalation
        const l2Amount = Number(claim.amount).toFixed(2);
        const l2Fields = [
          ['Amount', `£${l2Amount}`],
          ['Merchant', claim.merchant ?? 'Unknown'],
          ['Employee', claim.userEmail ?? 'Unknown'],
          ['Category', claim.category ?? '—'],
        ];
        await Promise.all([
          sendWebhook(slackUrl, slackPayload('⚠️', `Second Approval Needed — £${l2Amount} at ${claim.merchant ?? 'Unknown'}`, l2Fields)),
          sendWebhook(teamsUrl, teamsPayload('⚠️', `Second Approval Needed — £${l2Amount} at ${claim.merchant ?? 'Unknown'}`, l2Fields)),
        ]);

        return secureResponse({ success: true }, 200);
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
      if (emp.expoPushToken && emp.notifPushEnabled !== false) {
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
      if (emp.email && emp.notifEmailEnabled !== false) {
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

      // fire webhooks for approved / rejected
      const whFields = [
        ['Amount', `£${amount}`],
        ['Merchant', merchant],
        ['Category', category],
        ['Employee', emp.email ?? 'Unknown'],
        ...(feedback ? [['Admin Note', feedback]] : []),
      ];
      const isApproved = status === 'approved';
      const whEmoji = isApproved ? '✅' : '❌';
      const whTitle = isApproved
        ? `Claim Approved — £${amount} at ${merchant}`
        : `Claim Rejected — £${amount} at ${merchant}`;
      await Promise.all([
        sendWebhook(slackUrl, slackPayload(whEmoji, whTitle, whFields)),
        sendWebhook(teamsUrl, teamsPayload(whEmoji, whTitle, whFields)),
      ]);

      return secureResponse({ success: true }, 200);

    } catch (err) {
      context.error('notifyClaimStatus error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});
