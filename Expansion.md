# Claimio — App Expansion Plan

## Current State Summary

Claimio is a mobile-first expense claim app built with React Native (Expo), Firebase, and Azure Functions. It includes AI OCR receipt scanning, Stripe reimbursements, team management, and subscription plans (Free/Trial/Pro/Business at £14.99–£34.99/month).

**Tech Stack:** React Native + Expo, Firebase Auth + Firestore, Azure Functions + OpenAI, Stripe + RevenueCat, Azure Blob Storage.

**Core Flow:** Employee submits claim with receipt → AI extracts data → Admin approves → Stripe pays employee.

---

## High-Impact Expansion Areas

### 1. ✅ Accounting Software Integrations (Complete)

**Problem solved:** Finance teams manually re-enter approved expenses into accounting software — this wastes hours weekly.

**Features:**
- ✅ CSV export with Reference, Employee, Approved By, Notes columns
- ✅ Excel export with same columns
- ✅ PDF export with same columns
- ✅ Xero CSV export — approved claims only, maps categories to UK nominal codes (Meals→420, Travel→493, Technology→404, Office→429)
- ✅ QuickBooks Online CSV export — approved claims in QBO import format
- ✅ Sage 50 CSV export — approved claims in Sage import format
- ✅ Admin-configurable category → account code mapping (stored per org, used in all accounting exports)

**Monetization:** ✅ Gated behind Business plan — Xero/QBO/Sage buttons show a lock icon and upgrade prompt for non-Business users. Account code editing in manage-categories is also Business-only.

---

### 2. ⬜ Multi-Level Approval Workflows

**Problem solved:** Enterprises require sign-off chains. A £50 lunch needs one approver; a £2,000 conference trip needs a manager + finance director. Currently Claimio is flat — any admin approves anything.

**Features:**
- ⬜ Configurable rules: "claims over £X go to [role/person]"
- ⬜ Sequential or parallel approval chains
- ⬜ Escalation if no response within N days
- ⬜ Auto-approve low-value claims under policy threshold

**Monetization:** Business-tier feature.

---

### 3. ✅ Email & Push Notifications

**Problem solved:** In-app badges only work if users open the app. Businesses live in email.

**Features:**
- ✅ Email alerts: claim approved/rejected → employee notified
- ✅ Email alerts: new claim submitted → admin notified
- ✅ Email alerts: join request submitted → admins notified
- ✅ Email alerts: membership approved/rejected → employee notified
- ✅ Push notifications for all above events
- ✅ Daily/weekly digest emails for admins (pending claims summary + recent activity)
- ✅ Per-user notification preferences (push on/off, email on/off, digest frequency)
- ⬜ Slack bot: admin gets DM when claims need approval
- ⬜ Microsoft Teams webhook support

**Monetization:** Pro tier feature.

---

### 4. ⬜ Mileage & Per Diem Expenses

**Problem solved:** Many companies reimburse mileage (HMRC rate: 45p/mile). Currently Claimio only handles receipt-based claims — a huge segment of users is excluded.

**Features:**
- ⬜ Mileage claims: start/end location → auto-calculate distance + HMRC approved rate
- ⬜ Google Maps API integration for route validation
- ⬜ Per diem: daily allowance by trip destination (HMRC rates)
- ⬜ No receipt required for these claim types

**Monetization:** Unlocks field sales, delivery drivers, consultants — a massive underserved user segment.

---

### 5. ⬜ Department / Cost Centre Structure

**Problem solved:** Every company with 20+ employees has departments. Without cost centres, finance can't allocate spending correctly — this blocks adoption by proper businesses.

**Features:**
- ⬜ Admins create departments (Sales, Engineering, Marketing, etc.)
- ⬜ Employees assigned to a department
- ⬜ Claims tagged to department + cost centre code
- ⬜ Analytics breakdowns by department
- ⬜ Exports map to accounting nominal codes

**Monetization:** Business tier.

---

### 6. ⬜ Web Dashboard for Finance Teams

**Problem solved:** Finance managers and accountants don't want a phone app — they want a browser. Mobile-only is a hard blocker for enterprise procurement.

**Features:**
- ⬜ Expo Web already exists as a stub — needs building out
- ⬜ Responsive admin dashboard: approve claims, view analytics, run exports
- ⬜ Designed for desktop: bulk actions, keyboard shortcuts, data tables

**Monetization:** Key differentiator for Business plan.

---

### 7. ⬜ Bulk Actions & Smart Approval Queue

**Problem solved:** Admins approve one claim at a time. A manager with 50 pending claims at month-end will churn. Fast batch processing is a daily time-saver.

**Features:**
- ⬜ Select multiple claims → approve/reject in one action
- ⬜ "Auto-approve all claims under £X with a valid receipt"
- ⬜ Sort/filter by amount, employee, date, category
- ⬜ Smart flagging: "3 unusual claims need your attention"

**Monetization:** Reduces admin friction → better retention.

---

### 8. ⬜ Enhanced AI: Fraud Detection & Policy Enforcement

**Problem solved:** Businesses lose money to duplicate claims, inflated amounts, and policy violations. The current `suspicious` flag exists but does nothing meaningful.

**Features:**
- ⬜ Duplicate receipt detection (same merchant + amount + date from same user)
- ⬜ Anomaly detection: spending 3x above personal average
- ⬜ Policy enforcement: actually **block** submission if it violates org policy (currently informational only)
- ⬜ AI-generated audit summary for compliance reviews

**Monetization:** Unlocks regulated industries (finance, healthcare, legal).

---

### 9. ⬜ Recurring Expense Templates

**Problem solved:** Employees claim the same expenses monthly (parking, phone bill, subscriptions). Currently every submission is manual from scratch.

**Features:**
- ⬜ "Save as template" on any existing claim
- ⬜ Schedule recurring auto-submissions (weekly/monthly)
- ⬜ Pre-fill all fields from the template
- ⬜ Admin can pre-approve recurring claims from trusted employees

**Monetization:** Drives daily engagement and retention — template users are sticky.

---

### 10. ⬜ Audit Trail & Compliance Reporting

**Problem solved:** HMRC compliance, ISO audits, and investor due diligence all require a full history of who approved what and when. Currently Claimio has minimal logging.

**Features:**
- ⬜ Immutable audit log: every status change, who made it, exact timestamp
- ⬜ Compliance report export (PDF/CSV) covering any date range
- ⬜ Policy change history
- ⬜ Evidence that claims were reviewed by authorized persons

**Monetization:** Enterprise and compliance angle.

---

## Prioritized Roadmap

| Priority | Feature | Status | Effort | Business Impact |
|----------|---------|--------|--------|----------------|
| 1 | CSV/Excel/PDF export | ✅ Done | — | Very High |
| 1 | Xero CSV export | ✅ Done | — | Very High |
| 2 | Email + push notifications | ✅ Done | — | High |
| 2 | Admin digest emails (daily/weekly) | ✅ Done | — | High |
| 3 | Bulk approval actions | ⬜ Next | Low | High |
| 4 | Mileage/per diem claims | ⬜ | Medium | Very High |
| 5 | Department/cost centre structure | ⬜ | Medium | Very High |
| 6 | Multi-level approval workflows | ⬜ | High | Very High |
| 7 | Slack/Teams notifications | ⬜ | Medium | High |
| 8 | Policy enforcement (blocking) | ⬜ | Low | High |
| 9 | Recurring expense templates | ⬜ | Low | Medium |
| 10 | Web dashboard for finance teams | ⬜ | High | Very High |
| 11 | Audit trail & compliance reports | ⬜ | Medium | High |
| 12 | AI fraud/duplicate detection | ⬜ | Medium | High |

---

## The Core Pitch

The apps that win in B2B SaaS solve the **full workflow**, not just part of it.

Claimio handles **submission → approval → payment** well. The gaps are:

1. **Getting data out** (accounting exports) — finance teams' #1 need
2. **Workflow flexibility** (multi-level approvals, departments) — enterprise requirement
3. **Time savings** (bulk actions, templates, mileage auto-calc) — daily value
4. **Compliance** (audit trails, policy enforcement) — risk mitigation

Closing these gaps transforms Claimio from a useful tool into an **essential business system** — the kind teams don't cancel.

---

## Current Tech Stack (for context)

- **Frontend:** React Native, Expo 54, Expo Router, Tailwind (twrnc)
- **Backend:** Azure Functions (Node.js), Firebase Firestore, Firebase Auth
- **AI:** Azure OpenAI (GPT-4) for OCR, categorisation, chatbot, analytics
- **Payments:** Stripe (card storage + Connect payouts), RevenueCat (subscriptions)
- **Storage:** Azure Blob Storage (receipts)
- **Auth:** Email/password, Google Sign-In, Apple Sign-In, RBAC

## Current Subscription Plans

| Plan | Price | Employees | AI Credits |
|------|-------|-----------|-----------|
| Free | £0 | 5 | 0 |
| Trial | £0 (7 days) | 20 | 50 |
| Pro | £14.99/mo | 20 | 50 |
| Business | £34.99/mo | 100 | 150 |


Need an email cooldown for reset password etc