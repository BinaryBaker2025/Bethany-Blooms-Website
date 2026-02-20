# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Checkout function endpoint routing

Checkout calls use a shared endpoint resolver in `src/lib/functionEndpoints.js`.

- Checkout uses deployed Functions by default: `https://us-central1-<project>.cloudfunctions.net`.
- To use the local Functions emulator, set `VITE_USE_LOCAL_FUNCTIONS=true` (or set `VITE_FUNCTIONS_BASE_URL` directly).
- Optional overrides:
  - `VITE_FUNCTIONS_BASE_URL` forces an explicit base URL.
  - `VITE_USE_LOCAL_FUNCTIONS=true|false` forces local emulator or cloud behavior.

## SEO metadata + indexing

- Canonical domain defaults to `https://bethanyblooms.co.za`.
- Optional frontend override: set `VITE_SITE_URL` in `.env` or `.env.local`.
- The SPA metadata hook (`usePageMetadata`) now manages:
  - `title`, `description`, `keywords`
  - canonical URL (`canonicalPath` / `canonicalUrl`)
  - robots directives
  - Open Graph tags
  - Twitter card tags
- Public pages are indexable by default; private pages (`/admin/**`, `/account/**`, `/payment/**`, `/gift-cards/:giftCardId`, `/cart`, `/design`) are marked `noindex,nofollow`.

## Dynamic sitemap and robots

- `GET /sitemap.xml` is served by the Cloud Function `sitemapXml` via Hosting rewrite.
- `GET /robots.txt` is served by the Cloud Function `robotsTxt` via Hosting rewrite.
- Functions use `SITE_URL` as canonical absolute URL source when configured, otherwise they fall back to `https://bethanyblooms.co.za`.
- `sitemap.xml` includes:
  - static public routes
  - dynamic live `products` and `workshops` URLs from Firestore
- If Firestore reads fail, sitemap still returns static routes instead of an error.
- `robots.txt` allows public crawling and disallows private app areas; it includes the sitemap URL.

### Deployment note

- Deploy Hosting and Functions together so rewrites and endpoints stay in sync:
  - `firebase deploy --only functions,hosting`

## Admin order delivery edits

- Admins can update delivery details on placed orders from the admin Orders view:
  - delivery method (`company` or `courier`)
  - courier selection
  - tracking link
  - full shipping address (`street`, `suburb`, `city`, `province`, `postalCode`)
- Save action uses the callable `adminUpdateOrderDeliveryDetails` (admin-only) and recalculates shipping + totals.
- Courier recalculation uses active `courierOptions` pricing for the selected province.
- Company delivery keeps the existing shipping amount.
- If a paid order total changes after a delivery edit, the order is flagged:
  - `paymentAdjustment.required = true`
  - `paymentAdjustment.status = "review-needed"`
- Delivery edits update the order snapshot and the customer order mirror, but do not mutate saved profile addresses.
- Customer email about delivery edits is manual via `adminSendOrderDeliveryUpdateEmail`; no automatic send happens on save.

## Account welcome email

- New customer account creation triggers a welcome email from Cloud Functions on `users/{uid}` document create.
- Trigger applies to both:
  - self-signup accounts
  - admin-created customer accounts
- Admin users are skipped by design.
- Delivery status is stored on each user document at `users/{uid}.notifications.accountWelcome`.
- Signup is never blocked by email failures; failures are logged and tracked in that status object.
- Required email config:
  - `RESEND_API_KEY`
  - `RESEND_FROM`

## Admin users management

- `/admin/users` now supports:
  - role filtering (`All`, `Admin`, `Customer`)
  - sorting (`Updated`, `Email`, `Role`, `Name`)
  - search across `email`, `uid`, `fullName`, and `phone`
- Admins can open an edit modal to update:
  - `fullName`
  - `phone`
  - communication preferences (`marketingEmails`, `orderUpdates`)
  - saved addresses + default address
- Email is read-only in the admin profile editor.
- Admin profile saves use callable `adminUpdateUserProfile` (no direct client write to `customerProfiles`).

## Local PayFast test runbook

1. Configure live credentials in `functions/.env`:
   - `PAYFAST_MODE=live`
   - `PAYFAST_LIVE_MERCHANT_ID` (or `PAYFAST_MERCHANT_ID`)
   - `PAYFAST_LIVE_MERCHANT_KEY` (or `PAYFAST_MERCHANT_KEY`)
2. Start Firebase emulators from `frontend/`:
   - `firebase emulators:start --only functions`
3. Start Vite dev server from `frontend/`:
   - `npm run dev`
4. Ensure `VITE_USE_LOCAL_FUNCTIONS=true` in `.env.local` (or point `VITE_FUNCTIONS_BASE_URL` to the emulator base).
5. Place a checkout from `http://localhost:<vite-port>`.
6. Confirm the `createPayfastPaymentHttp` response includes:
   - `mode: "live"`
   - `url: "https://www.payfast.co.za/eng/process"`

### Troubleshooting localhost PayFast

- If checkout is hitting the wrong backend, check `VITE_USE_LOCAL_FUNCTIONS` / `VITE_FUNCTIONS_BASE_URL`.
- Confirm live credentials exist in `frontend/functions/.env` and `PAYFAST_MODE=live`.

## Customer flower subscriptions

### Admin subscription plan setup

- Subscription plans are managed in `subscriptionPlans` (not `products`).
- Use `/admin/subscriptions` to create plans with:
  - `name`, `description`, `category`, `tier`, `stems`, `status`, `image`
- Per-delivery price is configured per plan by admin.
- Plans must be linked to a `productCategories` category.

### No migration default

- Legacy subscription-like records in `products` are not used for new account plan selection.
- Recreate active customer-facing plans in `/admin/subscriptions`.

### Billing behavior

- Manual payment only: no automatic recurring card charges are used.
- Customers choose tier and Monday delivery slots:
  - `weekly`: all Mondays
  - `bi-weekly`: 2 Monday slots
  - `monthly`: 1 Monday slot
- Stems remain an admin/backend field and are not shown customer-facing.
- Signup immediately creates an invoice and sends an invoice email based on subscription payment method:
  - `payfast`: tokenized pay-now link
  - `eft`: bank details invoice (manual admin approval after payment)
- Signup is atomic around pay-now email delivery:
  - if email send fails, signup fails and created subscription/invoice records are rolled back.
  - invoice email delivery is required for signup success.
- Signup invoice uses Monday-based proration:
  - `invoice = per-delivery price * included deliveries`
  - `full cycle = per-delivery price * total cycle deliveries`
  - signup-day Monday is excluded (only future Mondays count)
- If no eligible Monday remains in signup month, first invoice is issued immediately for next month at full amount.
- Recurring prebilling window: invoices are sent in the **last 5 days of each month** for the next cycle (`Africa/Johannesburg`).
- Day-1 safety fallback: if prebilling was missed, scheduler sends current-cycle invoices on the 1st.
- Unpaid carry-forward rule: if an older invoice is still unpaid, no new cycle invoice is created; the unpaid pay-link is resent.
- Subscription invoice PDF generation is best-effort; email still sends without attachment if PDF generation fails.

### Legacy defaults (no migration)

- Existing subscriptions without `deliveryPreference` are handled with runtime defaults:
  - weekly -> all Monday slots
  - bi-weekly -> `first` + `third`
  - monthly -> `first`

### Customer management actions

- Customers can manage subscription status from Account:
  - `pause`
  - `resume`
  - `cancel`
- Customers can update Monday delivery preferences from Account.
- `pause` stops new monthly invoices.
- `cancel` stops future billing and voids unpaid pending invoices.

### Pay link flow

- PayFast invoice emails include a tokenized pay-now link.
- EFT invoice emails include bank details and invoice reference (no PayFast link).
- Customer checkout UX is email-only for payment links/invoice details after subscribe.
- Links open `/account/subscriptions/pay/:invoiceId?token=...`.
- The page requests a signed PayFast payload from `createSubscriptionPayfastPaymentHttp` and auto-posts to PayFast.
- Scheduler behavior:
  - runs daily at 06:10 (`Africa/Johannesburg`)
  - in the last 5 days, creates/sends next-cycle invoice when eligible
  - on day 1, applies fallback create/send for current cycle if needed
  - if any pending unpaid invoice exists, resends that invoice pay-link instead of creating a new cycle invoice
  - does not create duplicate cycle invoices

### Amount due and delivery eligibility

- Account `Amount due now` uses the latest unpaid subscription invoice (`pending-payment`) for each subscription.
- If a pending invoice exists, the card shows `Payment required` and the payable amount for that invoice cycle.
- If no pending invoice exists and the latest invoice is paid, the card shows `R0.00` with paid state messaging.
- Delivery eligibility in Subscription Ops remains:
  - subscription status is `active`
  - selected cycle invoice status is `paid`
- If the base cycle invoice is paid and a top-up invoice is still pending, delivery-ready stays `Yes` for that cycle.
- Subscription Ops now also surfaces explicit cycle payment visibility (`Paid for <cycle>: Yes/No`) and supports quick filtering:
  - `All`
  - `Delivery-ready only`
  - `Payment required`

### Admin plan reassignment and surcharges

- In `/admin/subscription-ops`, admins can:
  - reassign a customer to a different live subscription plan
  - add one-time or recurring extra charges
  - remove recurring charges
- Charge basis options:
  - `flat`: exact amount once per invoice
  - `per-delivery`: amount multiplied by billed delivery count for that cycle
- Current-cycle behavior:
  - if cycle base invoice is pending, it is repriced in place
  - if cycle base invoice is already paid, a separate top-up invoice is created for additional positive amounts
- Invoice model now supports:
  - `invoiceType`: `cycle` or `topup`
  - `baseAmount`
  - `adjustmentsTotal`
  - `adjustments[]` (admin plan-change/extra-charge/recurring-charge lines)
- Updated invoice emails are sent automatically after admin plan/charge changes by default.
- When a pending PayFast invoice amount changes, stale pay links/sessions are invalidated and marked superseded.

### Subscription EFT approval flow

- EFT is disabled by default for subscription checkout.
- Admin must approve account EFT eligibility in `/admin/users` (Edit user -> `Subscription EFT approved`).
- Eligibility is stored in `subscriptionCustomerSettings/{uid}`.
- Customers see WhatsApp guidance on subscription checkout when EFT is not approved.
- Customers can optionally upload EFT proof for pending subscription invoices from the Account page.
- Admin can switch existing subscriptions between PayFast and EFT in Subscription Ops (audited, reason required).
- Delivery eligibility stays unchanged: `active subscription + paid invoice` for the selected cycle.

### Legacy invoice ownership backfill

- Some legacy `subscriptionInvoices` records may be missing `customerUid`, which prevents customer-side invoice visibility.
- Use admin callable `adminBackfillSubscriptionInvoiceOwnership` to backfill `customerUid` from `subscriptions/{subscriptionId}.customerUid`.
- Callable input:
  - `dryRun?: boolean` (default `false`)
  - `limit?: number` (default `500`, max `2000`)
- Callable output includes:
  - `scanned`
  - `updated`
  - `skipped`
  - `missingSubscription`
  - `dryRun`

### Subscription function endpoints

- Callable:
  - `createCustomerSubscription`
  - `updateCustomerSubscriptionDeliveryPreferences`
  - `updateCustomerSubscriptionStatus`
  - `sendSubscriptionInvoiceEmailNow`
  - `attachSubscriptionEftPaymentProof`
  - `adminSetSubscriptionEftEligibility` (admin)
  - `adminUpdateSubscriptionPaymentMethod` (admin)
  - `adminUpdateSubscriptionPlanAssignment` (admin)
  - `adminAddSubscriptionInvoiceCharge` (admin)
  - `adminRemoveSubscriptionRecurringCharge` (admin)
- HTTP:
  - `createSubscriptionPayfastPaymentHttp`
- Scheduler:
  - `sendMonthlySubscriptionInvoices` (runs daily; acts in last-5-days window with day-1 fallback)
