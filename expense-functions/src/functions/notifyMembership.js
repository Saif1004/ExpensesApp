const { app } = require('@azure/functions');
const admin = require('firebase-admin');
const { authAndLimit, WINDOW_15_MIN } = require('./rateLimit');
const { secureResponse } = require('./security');
const {
  sendEmail, sendPush,
  joinRequestAdminEmail, membershipApprovedEmail, membershipRejectedEmail,
} = require('./notify');

////////////////////////////////////////////////////
// NOTIFY JOIN REQUEST
// Called by the app after a user submits a join request.
// Sends push + email to all admins of the org.
////////////////////////////////////////////////////

app.http('notifyJoinRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {

      // Auth — the requesting user must be authenticated (even without a membership yet)
      const auth = await authAndLimit(request, 'rateLimitNotifyJoin', 5, WINDOW_15_MIN);
      if (auth.error) return auth.error;

      const { orgId } = await request.json();
      if (!orgId) return secureResponse({ error: 'orgId required' }, 400);

      // Load requesting user
      const userDoc = await admin.firestore().collection('users').doc(auth.uid).get();
      if (!userDoc.exists) return secureResponse({ error: 'User not found' }, 404);
      const userData = userDoc.data();
      const employeeName  = userData.displayName || userData.email || 'Someone';
      const employeeEmail = userData.email || '';

      // Load org name
      const orgDoc = await admin.firestore().collection('organisations').doc(orgId).get();
      const orgName = orgDoc.exists ? (orgDoc.data().name || 'your organisation') : 'your organisation';

      // Find all admins
      const adminSnap = await admin.firestore()
        .collection('memberships')
        .where('orgId',  '==', orgId)
        .where('role',   '==', 'admin')
        .where('status', '==', 'approved')
        .get();

      await Promise.all(adminSnap.docs.map(async (memberDoc) => {
        const adminUserDoc = await admin.firestore().collection('users').doc(memberDoc.data().userId).get();
        if (!adminUserDoc.exists) return;
        const adminUser = adminUserDoc.data();
        const adminName = adminUser.displayName || adminUser.email || 'Admin';

        if (adminUser.expoPushToken && adminUser.notifPushEnabled !== false) {
          await sendPush(
            adminUser.expoPushToken,
            'New Join Request',
            `${employeeName} wants to join your organisation`,
            { orgId }
          ).catch(() => {});
        }
        if (adminUser.email && adminUser.notifEmailEnabled !== false) {
          await sendEmail(
            adminUser.email,
            `New join request from ${employeeName}`,
            joinRequestAdminEmail({ adminName, employeeName, employeeEmail, orgName })
          ).catch(() => {});
        }
      }));

      return secureResponse({ success: true }, 200);

    } catch (err) {
      context.error('notifyJoinRequest error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});

////////////////////////////////////////////////////
// NOTIFY MEMBERSHIP STATUS
// Called by the app after an admin approves/rejects a member.
// Sends push + email to the affected employee.
////////////////////////////////////////////////////

app.http('notifyMembershipStatus', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {

      const auth = await authAndLimit(request, 'rateLimitNotifyMembership', 20, WINDOW_15_MIN);
      if (auth.error) return auth.error;
      const adminUid = auth.uid;

      const { membershipId, status } = await request.json();
      if (!membershipId || !['approved', 'rejected'].includes(status)) {
        return secureResponse({ error: 'membershipId and valid status required' }, 400);
      }

      // Load membership
      const memberDoc = await admin.firestore().collection('memberships').doc(membershipId).get();
      if (!memberDoc.exists) return secureResponse({ error: 'Membership not found' }, 404);
      const membership = memberDoc.data();

      // Verify caller is an admin of the same org
      const adminSnap = await admin.firestore()
        .collection('memberships')
        .where('userId', '==', adminUid)
        .where('orgId',  '==', membership.orgId)
        .where('role',   '==', 'admin')
        .where('status', '==', 'approved')
        .limit(1).get();

      if (adminSnap.empty) return secureResponse({ error: 'Forbidden' }, 403);

      // Load employee
      const empDoc = await admin.firestore().collection('users').doc(membership.userId).get();
      if (!empDoc.exists) return secureResponse({ success: true }, 200);
      const emp = empDoc.data();

      // Load org name
      const orgDoc = await admin.firestore().collection('organisations').doc(membership.orgId).get();
      const orgName = orgDoc.exists ? (orgDoc.data().name || 'your organisation') : 'your organisation';

      const empName = emp.displayName || emp.email || 'there';

      if (emp.expoPushToken && emp.notifPushEnabled !== false) {
        await sendPush(
          emp.expoPushToken,
          status === 'approved' ? 'Request Approved ✅' : 'Request Not Approved',
          status === 'approved'
            ? `You've been approved to join ${orgName}`
            : `Your request to join ${orgName} was not approved`,
          { membershipId }
        ).catch(() => {});
      }

      if (emp.email && emp.notifEmailEnabled !== false) {
        const subject = status === 'approved'
          ? `You've been approved to join ${orgName} ✅`
          : `Your request to join ${orgName} was not approved`;
        const html = status === 'approved'
          ? membershipApprovedEmail({ employeeName: empName, orgName })
          : membershipRejectedEmail({ employeeName: empName, orgName });
        await sendEmail(emp.email, subject, html).catch((err) => {
          context.warn('Membership email failed:', err?.message);
        });
      }

      return secureResponse({ success: true }, 200);

    } catch (err) {
      context.error('notifyMembershipStatus error:', err);
      return secureResponse({ error: err.message }, 500);
    }
  },
});
