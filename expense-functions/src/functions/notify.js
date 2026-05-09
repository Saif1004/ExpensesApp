const sgMail = require('@sendgrid/mail');

const FROM_EMAIL   = process.env.SENDGRID_FROM_EMAIL || 'noreply@claimio.org';
const FROM_NAME    = 'Claimio';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// HTML-encode all user-controlled values before inserting into email templates.
// Prevents XSS in email clients that render HTML (especially adminFeedback which
// is free-text entered by the admin and not sanitised at ingestion).
function he(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

////////////////////////////////////////////////////
// SEND EMAIL (SendGrid)
////////////////////////////////////////////////////

async function sendEmail(to, subject, html) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key || !to) return;
  sgMail.setApiKey(key);
  await sgMail.send({ to, from: { email: FROM_EMAIL, name: FROM_NAME }, subject, html });
}

////////////////////////////////////////////////////
// SEND PUSH (Expo Push API)
////////////////////////////////////////////////////

async function sendPush(token, title, body, data = {}) {
  if (!token) return;
  await fetch(EXPO_PUSH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ to: token, sound: 'default', title, body, data }),
  });
}

////////////////////////////////////////////////////
// EMAIL TEMPLATES
////////////////////////////////////////////////////

function claimApprovedEmail({ employeeName, amount, merchant, category, adminFeedback }) {
  const feedback = adminFeedback
    ? `<p style="margin:0 0 16px"><strong>Admin note:</strong> ${he(adminFeedback)}</p>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#6366F1;padding:28px 32px">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Claimio</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 8px;font-size:28px">✅</p>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0D1B2A">Claim Approved</h1>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:15px">Hi ${he(employeeName)}, your expense claim has been approved.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FC;border-radius:8px;margin-bottom:24px">
      <tr><td style="padding:20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Amount</td>
            <td align="right" style="font-size:20px;font-weight:700;color:#0D1B2A;padding-bottom:10px">£${he(amount)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Merchant</td>
            <td align="right" style="color:#0D1B2A;font-size:13px;padding-bottom:10px">${he(merchant)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px">Category</td>
            <td align="right" style="color:#0D1B2A;font-size:13px">${he(category)}</td>
          </tr>
        </table>
      </td></tr>
    </table>
    ${feedback}
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:14px;line-height:1.6">Payment will be processed to your linked payout account. You'll receive a separate notification once it's been transferred.</p>
    <p style="margin:32px 0 0;color:#A0ACBB;font-size:12px;border-top:1px solid #E8ECF0;padding-top:16px">Claimio · Expense management made simple</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function claimRejectedEmail({ employeeName, amount, merchant, category, adminFeedback }) {
  const feedback = adminFeedback
    ? `<div style="background:#FEF2F2;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0;color:#DC2626;font-size:13px;font-weight:600">Reason from admin:</p>
        <p style="margin:6px 0 0;color:#7F1D1D;font-size:14px">${he(adminFeedback)}</p>
       </div>`
    : '<p style="margin:0 0 24px;color:#6B7A8D;font-size:14px">No reason was provided. Please contact your admin for details.</p>';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#6366F1;padding:28px 32px">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Claimio</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 8px;font-size:28px">❌</p>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0D1B2A">Claim Rejected</h1>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:15px">Hi ${he(employeeName)}, unfortunately your expense claim was not approved.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FC;border-radius:8px;margin-bottom:24px">
      <tr><td style="padding:20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Amount</td>
            <td align="right" style="font-size:20px;font-weight:700;color:#0D1B2A;padding-bottom:10px">£${he(amount)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Merchant</td>
            <td align="right" style="color:#0D1B2A;font-size:13px;padding-bottom:10px">${he(merchant)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px">Category</td>
            <td align="right" style="color:#0D1B2A;font-size:13px">${he(category)}</td>
          </tr>
        </table>
      </td></tr>
    </table>
    ${feedback}
    <p style="margin:32px 0 0;color:#A0ACBB;font-size:12px;border-top:1px solid #E8ECF0;padding-top:16px">Claimio · Expense management made simple</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function newClaimAdminEmail({ adminName, employeeEmail, amount, merchant, category }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#6366F1;padding:28px 32px">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Claimio</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 8px;font-size:28px">🧾</p>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0D1B2A">New Claim Awaiting Approval</h1>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:15px">Hi ${he(adminName)}, a new expense claim needs your review.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FC;border-radius:8px;margin-bottom:24px">
      <tr><td style="padding:20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Amount</td>
            <td align="right" style="font-size:20px;font-weight:700;color:#0D1B2A;padding-bottom:10px">£${he(amount)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Employee</td>
            <td align="right" style="color:#0D1B2A;font-size:13px;padding-bottom:10px">${he(employeeEmail)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Merchant</td>
            <td align="right" style="color:#0D1B2A;font-size:13px;padding-bottom:10px">${he(merchant)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px">Category</td>
            <td align="right" style="color:#0D1B2A;font-size:13px">${he(category)}</td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:14px;line-height:1.6">Open the Claimio app to review and approve or reject this claim.</p>
    <p style="margin:32px 0 0;color:#A0ACBB;font-size:12px;border-top:1px solid #E8ECF0;padding-top:16px">Claimio · Expense management made simple</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function joinRequestAdminEmail({ adminName, employeeName, employeeEmail, orgName }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#6366F1;padding:28px 32px">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Claimio</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 8px;font-size:28px">👤</p>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0D1B2A">New Join Request</h1>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:15px">Hi ${he(adminName)}, someone wants to join your organisation on Claimio.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FC;border-radius:8px;margin-bottom:24px">
      <tr><td style="padding:20px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Name</td>
            <td align="right" style="color:#0D1B2A;font-size:13px;padding-bottom:10px">${he(employeeName)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px;padding-bottom:10px">Email</td>
            <td align="right" style="color:#0D1B2A;font-size:13px;padding-bottom:10px">${he(employeeEmail)}</td>
          </tr>
          <tr>
            <td style="color:#6B7A8D;font-size:13px">Organisation</td>
            <td align="right" style="color:#0D1B2A;font-size:13px">${he(orgName)}</td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:14px;line-height:1.6">Open the Claimio app and go to <strong>Team Members</strong> to approve or reject this request.</p>
    <p style="margin:32px 0 0;color:#A0ACBB;font-size:12px;border-top:1px solid #E8ECF0;padding-top:16px">Claimio · Expense management made simple</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function membershipApprovedEmail({ employeeName, orgName }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#6366F1;padding:28px 32px">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Claimio</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 8px;font-size:28px">🎉</p>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0D1B2A">You're approved!</h1>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:15px">Hi ${he(employeeName)}, your request to join <strong>${he(orgName)}</strong> has been approved.</p>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:14px;line-height:1.6">You can now sign in to Claimio and start submitting expense claims.</p>
    <p style="margin:32px 0 0;color:#A0ACBB;font-size:12px;border-top:1px solid #E8ECF0;padding-top:16px">Claimio · Expense management made simple</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function membershipRejectedEmail({ employeeName, orgName }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <tr><td style="background:#6366F1;padding:28px 32px">
    <p style="margin:0;font-size:22px;font-weight:700;color:#fff">Claimio</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 8px;font-size:28px">❌</p>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0D1B2A">Request not approved</h1>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:15px">Hi ${he(employeeName)}, your request to join <strong>${he(orgName)}</strong> was not approved.</p>
    <p style="margin:0 0 24px;color:#6B7A8D;font-size:14px;line-height:1.6">Please contact your organisation's admin directly if you think this is a mistake.</p>
    <p style="margin:32px 0 0;color:#A0ACBB;font-size:12px;border-top:1px solid #E8ECF0;padding-top:16px">Claimio · Expense management made simple</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

module.exports = {
  sendEmail, sendPush,
  claimApprovedEmail, claimRejectedEmail, newClaimAdminEmail,
  joinRequestAdminEmail, membershipApprovedEmail, membershipRejectedEmail,
};
