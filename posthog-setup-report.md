<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into **Claimio** (React Native / Expo). `posthog-react-native` was already wired into `app/_layout.tsx` with `PostHogProvider` and a `ScreenTracker` component that auto-tracks every screen. The integration adds 18 custom events across 6 files, user identification on every sign-in and sign-up path, and `posthog.reset()` on sign-out. Environment variables are stored in `.env` and referenced via `process.env.EXPO_PUBLIC_*`.

| Event | Description | File |
|---|---|---|
| `user_signed_in` | Successful sign-in (email, Google, or Apple) | `app/sign-in.tsx` |
| `sign_in_failed` | Failed sign-in attempt with reason | `app/sign-in.tsx` |
| `password_reset_requested` | User requests a password reset email | `app/sign-in.tsx` |
| `organisation_created` | New organisation created during sign-up | `app/sign-up.tsx` |
| `organisation_joined` | User requests to join an org via invite code | `app/sign-up.tsx` |
| `expense_submitted` | Expense claim submitted successfully | `app/(tabs)/add-expense.tsx` |
| `expense_submission_failed` | Expense rejected by policy validation | `app/(tabs)/add-expense.tsx` |
| `receipt_scanned` | Receipt OCR scan succeeded | `app/(tabs)/add-expense.tsx` |
| `receipt_scan_failed` | Receipt scan or OCR failed | `app/(tabs)/add-expense.tsx` |
| `claim_approved` | Admin approves a claim (with amount, category) | `app/(tabs)/admin.tsx` |
| `claim_rejected` | Admin rejects a claim (with amount, category) | `app/(tabs)/admin.tsx` |
| `analytics_export_triggered` | Data export triggered (csv/excel/pdf/xero/qbo/sage) | `app/(tabs)/Analytics.tsx` |
| `ai_insights_generated` | AI spending insights generated | `app/(tabs)/Analytics.tsx` |
| `user_signed_out` | User explicitly signs out | `app/(tabs)/profile.tsx` |
| `subscription_upgrade_tapped` | Plan upgrade card tapped (with current_plan) | `app/(tabs)/profile.tsx` |
| `invite_code_generated` | Admin generates a new invite code | `app/(tabs)/profile.tsx` |
| `invite_code_shared` | Admin shares the invite code | `app/(tabs)/profile.tsx` |
| `terms_accepted` | User accepts T&Cs on first login | `app/_layout.tsx` |

## Next steps

We've built a dashboard and 5 insights for you to keep an eye on user behavior:

- **Dashboard — Analytics basics**: https://eu.posthog.com/project/166127/dashboard/642652
- **Sign-ins by method (daily)**: https://eu.posthog.com/project/166127/insights/eVC4MZJI
- **Expense submission funnel** (sign-in → submit → approved): https://eu.posthog.com/project/166127/insights/KoygUfYZ
- **Claim approval vs rejection rate**: https://eu.posthog.com/project/166127/insights/XgHr3Qti
- **Sign-up to organisation funnel**: https://eu.posthog.com/project/166127/insights/uPYlsL3i
- **Subscription upgrade taps by plan**: https://eu.posthog.com/project/166127/insights/2BToN6wu

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-expo/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
