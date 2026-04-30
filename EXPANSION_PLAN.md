# Claimio — App Expansion Plan

## Current State

Claimio is a mobile-first expense claim app built with React Native (Expo), Firebase, and Azure Functions. It includes AI OCR receipt scanning, Stripe reimbursements, team management, and subscription plans (Free / Trial / Pro / Business at £14.99–£34.99/month).

**Tech Stack:** React Native + Expo, Firebase Auth + Firestore, Azure Functions + OpenAI, Stripe + RevenueCat, Azure Blob Storage.

**Core Flow:** Employee submits claim with receipt → AI extracts data → Admin approves → Stripe pays employee.

---

## Analytics & Tracking (PostHog)

**Status:** ✅ Fully integrated

**SDK:** `posthog-react-native` — EU cloud (`https://eu.i.posthog.com`)
**Screen tracking:** Auto via `ScreenTracker` component + `usePathname` in `app/_layout.tsx`
**User identification:** `posthog.identify()` on sign-in/sign-up (email, Google, Apple). `posthog.reset()` on sign-out.

### Events tracked

| Event | File |
|-------|------|
| `user_signed_in` | `app/sign-in.tsx` |
| `sign_in_failed` | `app/sign-in.tsx` |
| `password_reset_requested` | `app/sign-in.tsx` |
| `organisation_created` | `app/sign-up.tsx` |
| `organisation_joined` | `app/sign-up.tsx` |
| `expense_submitted` | `app/(tabs)/add-expense.tsx` |
| `expense_submission_failed` | `app/(tabs)/add-expense.tsx` |
| `receipt_scanned` | `app/(tabs)/add-expense.tsx` |
| `receipt_scan_failed` | `app/(tabs)/add-expense.tsx` |
| `claim_approved` | `app/(tabs)/admin.tsx` |
| `claim_rejected` | `app/(tabs)/admin.tsx` |
| `analytics_export_triggered` | `app/(tabs)/Analytics.tsx` |
| `ai_insights_generated` | `app/(tabs)/Analytics.tsx` |
| `user_signed_out` | `app/(tabs)/profile.tsx` |
| `subscription_upgrade_tapped` | `app/(tabs)/profile.tsx` |
| `invite_code_generated` | `app/(tabs)/profile.tsx` |
| `invite_code_shared` | `app/(tabs)/profile.tsx` |
| `terms_accepted` | `app/_layout.tsx` |
| `chatbot_message_sent` | `app/(tabs)/chatbot.tsx` |
| `chatbot_response_received` | `app/(tabs)/chatbot.tsx` |
| `chatbot_credits_depleted` | `app/(tabs)/chatbot.tsx` |
| `member_request_approved` | `app/(tabs)/AdminUsers.tsx` |
| `member_request_rejected` | `app/(tabs)/AdminUsers.tsx` |
| `budget_limit_set` | `app/(tabs)/AdminUsers.tsx` |
| `subscription_purchase_started` | `components/paywall-screen.tsx` |
| `subscription_purchased` | `components/paywall-screen.tsx` |
| `subscription_purchase_failed` | `components/paywall-screen.tsx` |
| `trial_start_tapped` | `components/paywall-screen.tsx` |
| `trial_started` | `components/paywall-screen.tsx` |
| `restore_purchases_tapped` | `components/paywall-screen.tsx` |

### PostHog dashboards (EU cloud)
- [Analytics basics dashboard](https://eu.posthog.com/project/166127/dashboard/642652)
- [Sign-ins by method (daily)](https://eu.posthog.com/project/166127/insights/eVC4MZJI)
- [Expense submission funnel](https://eu.posthog.com/project/166127/insights/KoygUfYZ)
- [Claim approval vs rejection rate](https://eu.posthog.com/project/166127/insights/XgHr3Qti)
- [Sign-up to organisation funnel](https://eu.posthog.com/project/166127/insights/uPYlsL3i)
- [Subscription upgrade taps by plan](https://eu.posthog.com/project/166127/insights/2BToN6wu)

---

## Pre-Launch Checklist

### Legal — Terms & Conditions / Privacy Policy
**Status:** 🔲 Needs update

- [ ] Update flycricket-hosted Privacy Policy to add **PostHog** (screen + event tracking) and **Sentry** (crash + performance data)
- [ ] Fix in-app `privacy-policy.tsx`: receipts stored in **Azure Blob Storage** (not Firebase Cloud Storage)
- [ ] Add PostHog + Sentry to in-app privacy policy third-party services list
- [ ] Update "Last updated" date from March 2026 → April 2026
- [ ] Confirm flycricket T&C URL is live and linked correctly in App Store Connect

**URLs used in app:**
- T&C: `https://doc-hosting.flycricket.io/claimio-terms-of-use/1f9b2874-dd4b-4eea-b8e0-6ad1c9ab563b/terms`
- Privacy: `https://doc-hosting.flycricket.io/claimio-privacy-policy/b73958a1-ae06-494d-b3a9-2c9b7183d4b3/privacy`

---

### Subscription Pricing
**Status:** 🔲 Needs decision + Apple IAP setup

**Current prices (too low for B2B):**

| Plan | Monthly | Annual (per month) |
|------|---------|-------------------|
| Pro | £14.99 | £11.99 |
| Business | £34.99 | £27.99 |

**Recommended new prices:**

| Plan | Monthly | Annual (per month) | Annual total |
|------|---------|-------------------|-------------|
| Pro | £24.99 | £19.99 | £239.88 |
| Business | £59.99 | £47.99 | £575.88 |

**Files to update when pricing is confirmed:**
- [ ] `constants/planLimits.ts` — `priceMonthly`, `priceAnnual` fields
- [ ] `app/manage-subscription.tsx` — pricing reference table (lines 478–479)
- [ ] Apple App Store Connect — product prices
- [ ] RevenueCat dashboard — product pricing

---

### Apple In-App Purchases / Subscriptions
**Status:** 🔲 Not configured

**Required product IDs** (must match `constants/planLimits.ts` `rcPackageId` values exactly):

| Product ID | Type | Display Name |
|-----------|------|-------------|
| `pro_monthly` | Auto-Renewable Subscription | Claimio Pro — Monthly |
| `pro_annual` | Auto-Renewable Subscription | Claimio Pro — Annual |
| `business_monthly` | Auto-Renewable Subscription | Claimio Business — Monthly |
| `business_annual` | Auto-Renewable Subscription | Claimio Business — Annual |

**Setup steps:**
- [ ] App Store Connect → your app → **Subscriptions** → Create Subscription Group: `"Claimio Plans"`
- [ ] Add all 4 products to the group with correct product IDs and prices
- [ ] Set subscription durations: monthly = 1 month, annual = 1 year
- [ ] Add localisation (English UK) — display name + description for each product
- [ ] Submit products for review alongside the app
- [ ] RevenueCat dashboard → Products → add all 4 product IDs
- [ ] RevenueCat → Entitlements: confirm `pro` and `business` entitlements exist
- [ ] RevenueCat → Offerings → `default` offering → add all 4 packages
- [ ] Fix bug in `manage-subscription.tsx`: "Manage in Play Store" shows on iOS — should be platform-aware

**RevenueCat entitlements in code:**
- `pro` → unlocks Pro plan (`rcEntitlement: "pro"` in `planLimits.ts`)
- `business` → unlocks Business plan (`rcEntitlement: "business"` in `planLimits.ts`)

---

## Feature Expansion Roadmap

### Priority 1 — CSV/Excel Export + Xero Integration
**Status:** ✅ Done

**Problem:** Finance teams manually re-enter approved expenses into accounting software — wastes hours weekly.

**Built:**
- [x] CSV export — full claim rows with all fields (Ref, Employee, Merchant, Amount, Category, Status, etc.)
- [x] Excel export via `xlsx` library — SheetJS `aoa_to_sheet`, Base64 write via `expo-file-system/legacy`
- [x] PDF export — branded HTML table via `expo-print`, shareable as `.pdf`
- [x] Xero CSV export — Date/Amount/Payee/Description/Reference/Account Code/Tax Rate/Currency format; approved claims only; gated behind Business plan
- [x] QuickBooks Online CSV export — Date/Amount/Description/Account/Payee/RefNo/Memo format; Business plan
- [x] Sage CSV export — Date/Reference/Description/Net/TaxCode/AccountRef/Department format; Business plan
- [x] Category → chart of accounts mapping (hardcoded defaults + admin-configurable `categoryAccountCodes` on org doc)
- [x] Date-range filter in `admin.tsx` History tab for targeted exports
- [x] Export grid in `Analytics.tsx` Summary tab: CSV · PDF · Xero🔒 · QBO🔒 · Sage🔒

**Gate:** Business plan for accounting exports. CSV/PDF available on all plans.

---

### Priority 2 — Email Notifications
**Status:** ✅ Partially done

**Problem:** In-app badges only work if users open the app. Approval delays happen because nobody checks.

**To build:**
- [x] "Your claim has been approved/rejected" email to employee — already exists in notifyClaimStatus.js
- [x] "New expense claim" email to admin — already done in validateClaim.js
- [x] Daily digest email to admins (claims awaiting approval count + total) — just implemented
- [ ] Weekly spend summary email for admins
- [ ] Configurable per-user preferences

**Gate:** Pro tier.

---

### Priority 3 — Bulk Approval Actions
**Status:** ✅ Done

**Problem:** Admins approve one claim at a time. 50 pending claims at month-end = churned admin.

**To build:**
- [x] Multi-select mode in `admin.tsx` pending list
- [x] "Approve selected" / "Reject selected" batch action
- [ ] "Auto-approve all claims under £X with a valid receipt" rule
- [ ] Sort by amount, employee, date, category
- [ ] Smart flag: "N unusual claims need your attention"

**Gate:** Pro tier. Low build cost, massive retention impact.

---

### Priority 4 — Mileage & Per Diem Expenses
**Status:** ✅ Done

**Problem:** Claimio only handles receipt-based claims — mileage and per diem are excluded entirely. Huge underserved segment.

**To build:**
- [x] New claim type: "Mileage" — distance → HMRC rate auto-calc (45p/mile)
- [x] New claim type: "Per Diem" — date range + daily allowance (£25/day)
- [x] No receipt required for these types
- [ ] Google Maps Distance Matrix API for route validation
- [ ] HMRC rates table (UK), IRS rates (US)

**Gate:** All plans. Unlocks field sales, drivers, consultants.

---

### Priority 5 — Department / Cost Centre Structure
**Status:** ✅ Done

**Problem:** Without cost centres, finance can't allocate spending correctly — blocks adoption by any company with 20+ employees.

**Built:**
- [x] `app/admin/manage-departments.tsx` — admin creates/deletes departments (name + 6-char code) from a `departments` Firestore collection
- [x] `app/(tabs)/AdminUsers.tsx` — approved member rows show their department; tap "Change" to open a picker modal and assign any org department (writes `departmentId`/`departmentName` to `memberships`)
- [x] `expense-functions/src/functions/validateClaim.js` — reads `departmentId`/`departmentName` from membership and saves to every new claim
- [x] `app/context/AuthProvider.tsx` — exposes `departmentId` and `departmentName` from the signed-in user's membership
- [x] `app/(tabs)/admin.tsx` — Department row shown on pending + history claim cards; Department column added to CSV and PDF exports
- [ ] Analytics breakdowns by department in `Analytics.tsx` — deferred to next pass

**Gate:** Business plan. Create/assign gated behind `isBusiness`; warning banner shown to non-Business admins.

---

### Priority 6 — Multi-Level Approval Workflows
**Status:** ✅ Done

**Problem:** A £50 lunch needs one approver; a £2,000 conference trip needs a manager + finance director. Currently all approvals are flat.

**Built:**
- [x] `app/admin/manage-policies.tsx` — new "Two-Level Approval" card at top of policies screen; admin sets a £ threshold; saves as `approval_required_above` policy in Firestore; can disable with one tap
- [x] `app/(tabs)/admin.tsx` — pending query includes `status in ["pending", "pending_l2"]`; L1 approval of a claim above the threshold sets status to `pending_l2` instead of `approved`; "L2 Review" purple badge on escalated claims; approve button shows "Final Approve" for L2 claims; L1 approver info shown in history; `claim_escalated_to_l2` PostHog event
- [x] `expense-functions/src/functions/notifyClaimStatus.js` — handles `pending_l2` status: pings all org admins (push + email) that a second sign-off is needed
- [ ] Auto-escalation after N days of no L2 response — deferred (needs cron Azure Function)
- [ ] L3 approval chain — deferred

**Gate:** Business plan. Threshold set in Manage Policies screen.

---

### Priority 7 — Slack / Teams Notifications
**Status:** ✅ Done

**Problem:** Businesses live in Slack and Teams. Approval delays happen because no one is watching the app.

**Built:**
- [x] `app/admin/integrations.tsx` — admin screen to configure Slack + Teams webhook URLs; live test button for both; saves to `organisations/{orgId}.slackWebhookUrl` / `.teamsWebhookUrl`; gated behind Business plan via `UpgradeGate`
- [x] `app/(tabs)/profile.tsx` — "Integrations" menu row visible to Business plan admins; routes to integrations screen
- [x] `expense-functions/src/functions/validateClaim.js` — fires Slack/Teams webhook in background IIFE when a new claim is submitted; Slack blocks format + Teams MessageCard format
- [x] `expense-functions/src/functions/notifyClaimStatus.js` — fires webhooks for `approved`, `rejected`, and `pending_l2` (second approval needed) events; `sendWebhook`, `slackPayload`, `teamsPayload` helpers
- [ ] "Approve" / "Reject" action buttons directly in Slack — deferred (requires Slack App + OAuth, not just webhooks)

**Gate:** Business plan.

---

### Priority 8 — Policy Enforcement (Blocking, Not Just Informational)
**Status:** ✅ Done

**Problem:** The current AI policy check flags violations but the `suspicious` field does nothing meaningful in the UI.

**Built:**
- [x] Hard-block submission when `valid: false` is returned — `validateClaim.js` already rejects with a reason; client now shows an inline dismissible error card (red banner) in `add-expense.tsx` with the full policy violation reason
- [x] Duplicate detection in `validateClaim.js` — same user + merchant + amount within 30 days → HTTP 400 with descriptive message including claim ref; shown inline in the form
- [x] `Claim` type in `admin.tsx` extended with `policyNote` field — admins see an amber warning banner on any claim that has a policy note attached
- [x] Claim type badges on admin pending + history cards — Mileage (blue 🚗) and Per Diem (amber 🌙) clearly distinguished from receipt claims
- [x] Mileage/Per Diem detail rows on admin cards — Route, Distance (miles @ 45p), Destination, Days shown
- [ ] Admin can mark specific policies as "warning only" vs "blocking" — deferred
- [ ] Anomaly detection: spending 3x above user's personal average — deferred

**Gate:** All plans (blocking), Pro (anomaly detection).

---

### Priority 9 — Recurring Expense Templates
**Status:** ✅ Done

**Problem:** Employees claim the same expenses monthly. Every submission is manual from scratch.

**To build:**
- [x] "Save as template" button on any submitted claim
- [x] Templates stored in `expenseTemplates` Firestore collection per user
- [x] "New from template" option in `add-expense.tsx` pre-fills all fields
- [ ] Scheduled auto-submission (weekly/monthly) via a cron Azure Function
- [ ] Admin can pre-approve recurring claims from trusted employees

**Gate:** Pro tier. Template users are sticky.

---

### Priority 10 — Web Dashboard for Finance Teams
**Status:** 🔲 Not started

**Problem:** Finance managers don't want a phone app. Mobile-only blocks enterprise procurement.

**To build:**
- [ ] Expo Web build configured and deployed (already stubbed)
- [ ] Responsive admin dashboard — approve claims, view analytics, run exports
- [ ] Data tables with bulk selection, keyboard shortcuts
- [ ] Separate auth flow optimised for desktop (no push token, no biometrics)
- [ ] Deploy to `app.claimio.org`

**Gate:** Business plan. Key differentiator.

---

### Priority 11 — Audit Trail & Compliance Reporting
**Status:** ✅ Partially done

**Problem:** HMRC compliance, ISO audits, investor due diligence require full history of who approved what and when.

**To build:**
- [x] `auditLog` Firestore collection — append-only, every status change logged
- [x] Writes to audit log after every claim status change (in admin.tsx)
- [x] Admin-facing audit log viewer screen
- [ ] Azure Function writes to audit log after status changes
- [ ] Compliance report export: PDF/CSV
- [ ] Policy change history

**Gate:** Business plan. Required for regulated industries.

---

### Priority 12 — AI Fraud / Duplicate Detection
**Status:** ✅ Partially done

**Problem:** Businesses lose money to duplicate claims, inflated amounts, and policy violations that slip through.

**To build:**
- [x] Duplicate claim detection in `validateClaim.js` — same user + merchant + amount within 30 days → block
- [ ] Receipt image hash stored on upload — identical image = auto-reject
- [ ] Anomaly scoring: compare claim amount vs user's 90-day average by category
- [ ] AI-generated audit summary: "5 claims flagged for review this month"
- [ ] Admin notification when anomalies are detected

**Gate:** Business plan.

---

## Prioritized Summary Table

| # | Feature | Effort | Business Impact | Status |
|---|---------|--------|----------------|--------|
| 1 | CSV/Excel export + Xero integration | Medium | Very High | ✅ |
| 2 | Email notifications | Low | High | ✅ Partial |
| 3 | Bulk approval actions | Low | High | ✅ |
| 4 | Mileage / per diem claims | Medium | Very High | ✅ |
| 5 | Department / cost centre structure | Medium | Very High | ✅ |
| 6 | Multi-level approval workflows | High | Very High | ✅ |
| 7 | Slack / Teams notifications | Medium | High | ✅ |
| 8 | Policy enforcement (blocking) | Low | High | ✅ |
| 9 | Recurring expense templates | Low | Medium | ✅ |
| 10 | Web dashboard for finance teams | High | Very High | 🔲 |
| 11 | Audit trail & compliance reports | Medium | High | ✅ Partial |
| 12 | AI fraud / duplicate detection | Medium | High | ✅ Partial |

---

## Current Subscription Plans

| Plan | Price | Employees | AI Credits |
|------|-------|-----------|-----------|
| Free | £0 | 5 | 0 |
| Trial | £0 (7 days) | 20 | 50 |
| Pro | £14.99/mo | 20 | 50 |
| Business | £34.99/mo | 100 | 150 |

---

## The Core Pitch

The apps that win in B2B SaaS solve the **full workflow**, not just part of it.

Claimio handles **submission → approval → payment** well. The gaps are:

1. **Getting data out** (accounting exports) — finance teams' #1 need
2. **Workflow flexibility** (multi-level approvals, departments) — enterprise requirement
3. **Time savings** (bulk actions, templates, mileage auto-calc) — daily value
4. **Compliance** (audit trails, policy enforcement) — risk mitigation

Closing these gaps transforms Claimio from a useful tool into an **essential business system** — the kind teams don't cancel.
