const { app } = require('@azure/functions');

const html = (title, message, color, icon) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Claimio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1923;
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1a2636;
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      max-width: 400px;
      width: 100%;
      border: 1px solid ${color}33;
    }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: ${color}; margin-bottom: 12px; }
    p { font-size: 15px; color: #888; line-height: 1.6; }
    .hint { margin-top: 24px; font-size: 13px; color: #555; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="hint">You can close this page and return to the Claimio app.</p>
  </div>
</body>
</html>`;

// Called by Stripe after employee completes onboarding
app.http('stripe-return', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (_req, _ctx) => {
    return new Response(
      html(
        'Payout Account Ready',
        'Your payout account has been set up successfully. Approved expense claims will now be automatically reimbursed to your account.',
        '#4CAF50',
        '✅'
      ),
      { status: 200, headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'Referrer-Policy': 'no-referrer',
      } }
    );
  },
});

// Called by Stripe if onboarding link expires and needs refreshing
app.http('stripe-refresh', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (_req, _ctx) => {
    return new Response(
      html(
        'Session Expired',
        'Your onboarding session has expired. Please return to the Claimio app and tap "Set Up Payout Account" again to get a fresh link.',
        '#FF9800',
        '⚠️'
      ),
      { status: 200, headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'Referrer-Policy': 'no-referrer',
      } }
    );
  },
});
