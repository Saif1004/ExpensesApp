const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const { sendEmail } = require('./notify');

////////////////////////////////////////////////////
// DIGEST EMAIL — Timer Trigger
// Runs every day at 08:00 UTC.
// Sends a pending-claims digest to admins who have
// digestFrequency set to "daily" or "weekly".
// Weekly digests are only sent on Mondays (dayOfWeek === 1).
////////////////////////////////////////////////////

app.timer('digestEmail', {
  schedule: '0 0 8 * * *', // 08:00 UTC daily
  handler: async (myTimer, context) => {
    try {
      const db         = admin.firestore();
      const now        = new Date();
      const isMonday   = now.getUTCDay() === 1;
      const todayLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

      // Find all users who want a digest
      const usersSnap = await db.collection('users')
        .where('digestFrequency', 'in', ['daily', 'weekly'])
        .get();

      context.log(`Digest: found ${usersSnap.size} users with digest enabled`);

      await Promise.all(usersSnap.docs.map(async (userDoc) => {
        const userData = userDoc.data();
        const uid      = userDoc.id;
        const freq     = userData.digestFrequency;

        // Weekly: only send on Mondays
        if (freq === 'weekly' && !isMonday) return;

        // Must have an email
        if (!userData.email) return;

        // Get their approved membership (must be admin)
        const memberSnap = await db.collection('memberships')
          .where('userId', '==', uid)
          .where('role',   '==', 'admin')
          .where('status', '==', 'approved')
          .limit(1)
          .get();

        if (memberSnap.empty) return;

        const orgId   = memberSnap.docs[0].data().orgId;
        const orgDoc  = await db.collection('organisations').doc(orgId).get();
        const orgName = orgDoc.exists ? (orgDoc.data().name || 'your organisation') : 'your organisation';

        // Count pending claims
        const pendingSnap = await db.collection('claims')
          .where('orgId',  '==', orgId)
          .where('status', '==', 'pending')
          .get();

        const pendingCount = pendingSnap.size;

        // Get recently approved/rejected claims (last 24h or last 7 days)
        const windowMs   = freq === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        const windowDate = new Date(now.getTime() - windowMs);
        const windowLabel = freq === 'weekly' ? 'this week' : 'today';

        const recentSnap = await db.collection('claims')
          .where('orgId',   '==', orgId)
          .where('status',  'in', ['approved', 'rejected'])
          .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(windowDate))
          .orderBy('updatedAt', 'desc')
          .limit(10)
          .get();

        const recentClaims = recentSnap.docs.map(d => d.data());

        const adminName = userData.displayName || userData.email || 'Admin';
        const subject   = pendingCount > 0
          ? `📋 ${pendingCount} claim${pendingCount !== 1 ? 's' : ''} awaiting approval — ${orgName}`
          : `✅ No pending claims — ${orgName} digest`;

        const html = digestEmailTemplate({
          adminName,
          orgName,
          pendingCount,
          recentClaims,
          windowLabel,
          todayLabel,
          freq,
        });

        await sendEmail(userData.email, subject, html).catch(err => {
          context.warn(`Digest email failed for ${userData.email}:`, err?.message);
        });

        context.log(`Digest sent to ${userData.email} (${freq}, ${pendingCount} pending)`);
      }));

    } catch (err) {
      context.error('digestEmail error:', err);
    }
  },
});

////////////////////////////////////////////////////
// EMAIL TEMPLATE
////////////////////////////////////////////////////

function digestEmailTemplate({ adminName, orgName, pendingCount, recentClaims, windowLabel, todayLabel, freq }) {
  const pendingSection = pendingCount > 0
    ? `
    <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:32px;font-weight:800;color:#D97706;">${pendingCount}</div>
      <div style="color:#92400E;font-size:14px;margin-top:4px;">claim${pendingCount !== 1 ? 's' : ''} awaiting your approval</div>
      <a href="https://claimio.org" style="display:inline-block;margin-top:14px;background:#6366F1;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Review Claims
      </a>
    </div>`
    : `
    <div style="background:#D1FAE5;border:1px solid #34D399;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:24px;">✅</div>
      <div style="color:#065F46;font-size:14px;margin-top:6px;font-weight:600;">No pending claims — you're all caught up!</div>
    </div>`;

  const recentRows = recentClaims.length > 0
    ? recentClaims.map(c => {
        const statusColor = c.status === 'approved' ? '#16a34a' : '#dc2626';
        const statusLabel = c.status === 'approved' ? '✅ Approved' : '❌ Rejected';
        return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${c.merchant ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">£${Number(c.amount).toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;">${c.userEmail ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:${statusColor};font-weight:600;">${statusLabel}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#9CA3AF;font-size:13px;">No activity ${windowLabel}</td></tr>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366F1,#4F46E5);padding:32px 40px;text-align:center;">
              <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Claimio</div>
              <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">${freq === 'weekly' ? 'Weekly' : 'Daily'} Digest · ${todayLabel}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#374151;font-size:15px;margin:0 0 24px;">Hi ${adminName},</p>
              <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">Here's your ${freq} summary for <strong>${orgName}</strong>.</p>

              ${pendingSection}

              ${recentClaims.length > 0 ? `
              <h3 style="color:#111827;font-size:14px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.8px;">Activity ${windowLabel}</h3>
              <table width="100%" style="border-collapse:collapse;margin-bottom:24px;">
                <thead>
                  <tr style="background:#F9FAFB;">
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Merchant</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Employee</th>
                    <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
                  </tr>
                </thead>
                <tbody>${recentRows}</tbody>
              </table>` : ''}

              <p style="color:#9CA3AF;font-size:12px;margin:24px 0 0;">
                You're receiving this because you set up a ${freq} digest in Claimio.
                <a href="https://claimio.org" style="color:#6366F1;">Manage preferences</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
