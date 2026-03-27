# Bethany Blooms System Overview

Last updated: 2026-03-26

## Scope

This document describes the current Bethany Blooms system as implemented in the active `frontend/` app.

It covers:

- application architecture
- route inventory
- page and module responsibilities
- Firestore and Storage data model surfaces
- Cloud Functions inventory
- key business rules and algorithms
- the relationship between the active React app and the retained `legacy/` site

The main source-of-truth files for this overview are:

- `frontend/src/App.jsx`
- `frontend/src/pages/AdminPage.jsx`
- `frontend/src/pages/admin/AdminLayout.jsx`
- `frontend/src/pages/admin/AdminPosPage.jsx`
- `frontend/src/pages/admin/AdminPosCashUpPage.jsx`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/context/CartContext.jsx`
- `frontend/src/context/AdminDataContext.jsx`
- `frontend/functions/index.js`
- `frontend/firestore.rules`
- `frontend/storage.rules`
- `frontend/docs/pos-current-structure.md`

## 1. High-Level Architecture

### Active system

The active product is a React + Vite single-page application backed by Firebase.

Major layers:

- Frontend SPA:
  - customer storefront
  - customer account/subscription area
  - admin operations console
- Firebase Auth:
  - email/password auth
  - role-aware admin/customer behavior
- Firestore:
  - catalog, bookings, orders, subscriptions, gift cards, POS, analytics, user data
- Firebase Storage:
  - images, uploaded proofs, catalog/event/class media
- Cloud Functions:
  - payments
  - email notifications
  - invoice generation
  - subscription automation
  - POS helpers
  - SEO endpoints
  - gift-card services
- Firebase Hosting:
  - SPA hosting
  - rewrites for `sitemap.xml` and `robots.txt`

### Retained legacy system

The `legacy/` folder contains an older static website implementation. It is not the current production application, but it is still useful historical reference material.

Legacy features include:

- simple localStorage cart
- modal system
- gallery lightbox
- parallax sections
- testimonial rotation
- mobile nav toggle

## 2. Frontend Entry Points And Shared Systems

### Main app shell

- `frontend/src/main.jsx`
  - bootstraps React Router and renders `App`
- `frontend/src/App.jsx`
  - registers the full route map
  - lazily loads customer pages and admin views
- `frontend/src/components/Layout.jsx`
  - global customer-facing shell
  - header/footer
  - route scroll reset
  - booking modal host
  - cart notice host
  - WhatsApp floating button

### Shared providers

| Module | Responsibility | Important behavior |
| --- | --- | --- |
| `AuthContext.jsx` | auth session, sign-in, sign-up, password reset, sign-out, role state | creates `users/{uid}` and `customerProfiles/{uid}` on signup, resolves role from cache -> token -> Firestore, exposes `isAdmin`, `refreshRole`, `roleLoading`, `roleError` |
| `CartContext.jsx` | persistent storefront cart | localStorage-backed, blocks mixing workshops and products in the same cart, checks stock before add/increment, computes totals, publishes cart notices through `window` events |
| `ModalContext.jsx` | shared modal state | manages booking modal state and cart-notice state, supports `openBooking()` and cart open/redirect behavior |
| `AdminDataContext.jsx` | shared live admin inventory feeds | subscribes to products, categories, tags, workshops, bookings, orders, events, cut flower bookings, and cut flower classes; only activates for authenticated admins |

### Shared hooks and helper libraries

| Module | Main purpose |
| --- | --- |
| `useFirestoreCollection.js` | live Firestore collection subscription helper with status and fallback behavior |
| `useCustomerProfile.js` | reads and updates the signed-in customer's `customerProfiles/{uid}` document |
| `usePageMetadata.js` | applies title, meta description, canonical URL, robots, Open Graph, and Twitter tags |
| `lib/firebase.js` | Firebase initialization and environment-driven emulator/deployed function selection |
| `lib/seo.js` | central route indexing policy for public vs private pages |
| `lib/stockStatus.js` | product and variant stock normalization, low-stock thresholding, preorder handling |
| `lib/freshFlowerDelivery.js` | category-token based detection of products that need manual delivery follow-up |
| `lib/giftCardStudio.js` | gift-card option normalization, selected-option summaries, whole-crew validation |
| `lib/posSales.js` | POS sale normalization, subtotal/net/discount helpers, line voidability helpers |
| `lib/preorder.js` | preorder month normalization and formatting |
| `lib/shipping.js` | South African province list and shipping address formatting |
| `lib/subscriptionOpsRosterPdf.js` | roster export/print generation for subscription operations |

## 3. Route Inventory

### Customer and public routes

| Path | Page component | Main responsibility |
| --- | --- | --- |
| `/` | `HomePage.jsx` | brand landing page, featured products, hero storytelling, testimonials |
| `/workshops` | `WorkshopsPage.jsx` | workshop listing, session normalization, booking entry |
| `/workshops/:workshopId` | `WorkshopDetailPage.jsx` | full workshop detail, session choice, booking CTA, SEO for a single workshop |
| `/cut-flowers` | `CutFlowersPage.jsx` | cut flower class and bespoke floral experience marketing plus booking |
| `/events` | `EventsPage.jsx` | event listing with dates, slots, workshop links, gallery/lightbox behavior |
| `/products` | `ProductsPage.jsx` | main catalog listing with filters, search, sort, category-driven hero copy |
| `/products/:productId` | `ProductDetailPage.jsx` | full product detail, variants, stock logic, gift-card configuration, related items |
| `/cart` | `CartPage.jsx` | checkout flow for products and workshops |
| `/gallery` | `GalleryPage.jsx` | curated gallery and lightbox experience |
| `/contact` | `ContactPage.jsx` | enquiry form plus direct contact and WhatsApp routes |
| `/account` | `AccountPage.jsx` | customer auth, profile, addresses, orders, subscriptions, invoices |
| `/subscriptions/checkout` | `SubscriptionCheckoutPage.jsx` | subscription onboarding and first invoice creation |
| `/account/orders/:orderId` | `AccountOrderDetailPage.jsx` | customer order detail view with ownership checks |
| `/account/subscriptions/pay/:invoiceId` | `AccountSubscriptionPayPage.jsx` | tokenized PayFast pay-now flow for subscription invoices |
| `/payment/success` | `PaymentSuccessPage.jsx` | PayFast completion landing page and cleanup |
| `/payment/cancel` | `PaymentCancelPage.jsx` | PayFast cancel flow and retry guidance |
| `/payment/eft-submitted` | `EftSubmittedPage.jsx` | EFT instructions and proof upload |
| `/gift-cards/:giftCardId` | `GiftCardPage.jsx` | tokenized public gift-card view |
| `/privacy-policy` | `PrivacyPolicyPage.jsx` | legal/privacy page |
| `/disclaimer` | `DisclaimerPage.jsx` | legal/disclaimer page |
| `/design` | `DesignSystemPage.jsx` | internal design system and UI reference page |
| `*` | `NotFoundPage.jsx` | 404 page |

### Admin routes

| Path | Page/view component | Main responsibility |
| --- | --- | --- |
| `/admin` | `AdminDashboardView` | dashboard, KPIs, quick links, recent activity |
| `/admin/products` | `AdminProductsView` | product catalog management |
| `/admin/products/categories` | `AdminProductsView` | category-management entry point within the product admin module |
| `/admin/subscriptions` | `AdminSubscriptionsView` | subscription plan CRUD |
| `/admin/subscription-ops` | `AdminSubscriptionOpsView` | operational subscription roster, cycle invoicing, plan/payment/status adjustments |
| `/admin/media` | `AdminMediaLibraryView` | image library and reusable media management |
| `/admin/workshops` | `AdminWorkshopsView` | workshop CRUD, scheduling, options, bookings overview |
| `/admin/calendar` | `AdminWorkshopsCalendarView` | unified calendar of workshop bookings, cut flower bookings, and events |
| `/admin/cut-flowers/classes` | `AdminCutFlowerClassesView` | cut flower class CRUD and scheduling |
| `/admin/cut-flowers/bookings` | `AdminCutFlowerBookingsView` | bespoke cut flower booking management |
| `/admin/events` | `AdminEventsView` | event CRUD and workshop linking |
| `/admin/emails` | `AdminEmailTestView` | email template preview/testing |
| `/admin/invoices` | `AdminInvoicePreviewView` | subscription invoice template previewing |
| `/admin/commerce/gift-cards/preview` | redirect | redirects to the generate/manage experience |
| `/admin/commerce/gift-cards/generate` | `AdminGiftCardGenerateManageView` | gift-card generation, registry management, draft issuing |
| `/admin/gift-cards` | redirect | redirects to the gift-card generate/manage route |
| `/admin/pos` | `AdminPosPage.jsx` | in-person point-of-sale workflow |
| `/admin/pos/cash-up` | `AdminPosCashUpPage.jsx` | daily closeout, reconciliation, receipt correction |
| `/admin/reports` | `AdminReportsPage.jsx` | revenue, transaction, and performance reporting |
| `/admin/users` | `AdminUsersView.jsx` | user management, role/edit/profile/POS/subscription flags |
| `/admin/orders` | `AdminOrdersView` | order operations and payment review |
| `/admin/shipping` | `AdminShippingView` | courier option management |
| `/admin/profile` | `AdminProfileView` | admin profile and POS PIN configuration |

## 4. Customer-Facing Page Responsibilities

### Home

`HomePage.jsx` is a hybrid marketing and merchandising page.

Main responsibilities:

- branded hero experience
- service-area positioning
- editorial sections for cut flowers, workshops, and bespoke work
- featured storefront products from the live catalog
- testimonials
- SEO metadata

### Workshops

`WorkshopsPage.jsx` and `WorkshopDetailPage.jsx` together provide the workshop sales funnel.

Main responsibilities:

- normalize live workshop docs and sessions
- expose session dates, pricing, options, and capacity-style metadata
- support standard workshop sessions and by-request workshop flows
- hand booking context into the shared booking modal
- render long-form instructional content and policy content

### Cut flowers and events

`CutFlowersPage.jsx` and `EventsPage.jsx` cover the non-standard experiential side of the business.

Main responsibilities:

- present cut flower classes and bespoke floral sessions separately from workshops
- support date/time-slot driven booking entry
- handle repeating schedules and multiple slots
- allow event/workshop linking
- offer direct WhatsApp support paths for cases requiring manual coordination

### Products

`ProductsPage.jsx` and `ProductDetailPage.jsx` are the main commerce catalog.

Main responsibilities:

- search, filter, sort, and category-based merchandising
- merge standard products and subscription plans into a single customer-facing catalog surface
- resolve sale pricing, stock state, preorder messaging, and botanical metadata
- support product variants and related/upsell/cross-sell items
- support gift-card products with configurable option quantities and gift-recipient metadata
- flag fresh-flower products that require delivery follow-up

### Cart and checkout

`CartPage.jsx` is the main transactional workflow.

Main responsibilities:

- enforce cart-type-specific checkout behavior
- collect contact details
- collect shipping/delivery data
- load courier pricing by province
- validate stock against live product docs
- support PayFast and EFT checkout branches
- persist signed-in customer profile data back to Firestore
- carry pending payment session state across redirects

### Account and subscription self-service

`AccountPage.jsx`, `SubscriptionCheckoutPage.jsx`, `AccountOrderDetailPage.jsx`, and `AccountSubscriptionPayPage.jsx` form the customer operations area.

Main responsibilities:

- account creation and sign-in
- password reset
- customer profile and address book management
- order history and order detail views
- subscription onboarding with Monday-slot delivery preferences
- invoice visibility
- payment-link resend flows
- subscription status changes
- subscription EFT proof upload

### Status, legal, and support pages

Other customer pages serve narrower but operationally important roles:

- `PaymentSuccessPage.jsx`: clears pending storefront session state on successful PayFast completion
- `PaymentCancelPage.jsx`: cancels pending storefront session state and guides retry
- `EftSubmittedPage.jsx`: shows banking instructions and accepts proof uploads
- `GiftCardPage.jsx`: public tokenized gift-card presentation
- `GalleryPage.jsx`: static gallery/lightbox experience
- `ContactPage.jsx`: live support and enquiry intake
- `PrivacyPolicyPage.jsx`: legal/privacy statement
- `DisclaimerPage.jsx`: legal/operational disclaimer
- `DesignSystemPage.jsx`: internal UI reference; intentionally not a normal customer feature
- `NotFoundPage.jsx`: recovery path for broken URLs

## 5. Admin Surface Responsibilities

### Catalog and content

The catalog/content admin surface is centered in `AdminPage.jsx`.

Main responsibilities:

- product CRUD
- category CRUD
- tag CRUD
- stock and featured state management
- variant modeling
- image and gallery upload
- category cover image upload
- long-form product metadata
- category/tag/product relationships
- media library management
- workshop CRUD
- workshop date groups, time slots, repeat scheduling, and options
- event CRUD and workshop linking
- cut flower class CRUD and repeat scheduling

### Booking and calendar operations

The operations side of admin includes:

- workshop bookings visibility within workshop admin
- separate cut flower booking management
- unified calendar view for workshops, cut flower bookings, and events
- quick calendar event create/edit/delete directly from the calendar page

### Orders, subscriptions, and shipping

These modules handle the core operational back office.

Main responsibilities:

- order search and filtering
- EFT payment review and approval/rejection
- manual/admin-created EFT orders
- delivery method updates
- courier assignment
- tracking-link management
- delivery update email sending
- preorder list email sending
- subscription plan CRUD
- subscription ops filtering by cycle, tier, payment method, readiness, and geography
- plan reassignment
- payment method switching
- status changes
- invoice charge and recurring charge management
- roster export and PDF generation
- province-based courier pricing management

### Gift cards

Gift-card administration is a substantial subsystem.

Main responsibilities:

- preview gift-card content
- build catalog-backed or custom giveaway cards
- save drafts
- issue from drafts
- manage the registry
- archive/update issued cards
- backfill/sync the registry from stored gift cards

### POS, users, profile, and reporting

The remaining admin modules cover internal operations and governance.

Main responsibilities:

- in-person POS cart and checkout
- POS-only item management
- gift-card lookup and redemption inside POS
- receipt emailing
- sale void flow
- daily cash-up and PDF export
- user creation and role assignment
- customer profile editing
- subscription EFT approval flags
- POS PIN reset
- admin POS PIN setup/change
- email template preview/testing
- invoice preview/testing
- combined revenue and site-visit reporting

## 6. Data Model And Collection Inventory

### Identity and customer collections

| Collection / document | Access summary | Primary consumers | Main purpose |
| --- | --- | --- | --- |
| `users/{uid}` | self read/update under validation, admin create/update/delete | auth, admin users, welcome-email trigger | canonical app user doc with role and notification state |
| `customerProfiles/{uid}` | self read/write, admin visibility through server-side/admin tools | account page, checkout profile sync, admin user editing | customer profile, preferences, addresses, defaults |
| `customerProfiles/{uid}/orders/{orderId}` | admin-only writes | customer profile order mirroring | customer-scoped order snapshot mirror |

### Catalog, media, and booking collections

| Collection | Access summary | Primary consumers | Main purpose |
| --- | --- | --- | --- |
| `products` | public read, admin write | storefront, checkout stock validation, admin catalog, POS | sellable products and gift-card products |
| `subscriptionPlans` | public read, admin write | subscription checkout, products page, admin plans | subscription plan definitions |
| `productCategories` | public read, admin write | navigation, products page, admin catalog | category metadata and merchandising |
| `productTags` | public read, admin write | product detail/admin | tag metadata |
| `productMedia` | admin read/write | media library, product admin | reusable uploaded media records |
| `workshops` | public read, admin write | workshop pages, booking modal, admin workshops, POS | workshop definitions and sessions |
| `events` | public read, admin write | events page, admin calendar/events, POS | scheduled events |
| `cutFlowerClasses` | public read, admin write | cut flower page, booking modal, admin class manager, POS | class and cut-flower offering definitions |
| `bookings` | public create with validation, admin read/write | workshop booking modal, workshop admin, calendar, POS | workshop booking submissions |
| `cutFlowerBookings` | public create with validation, admin read/write | cut flower booking flows, admin booking screen, calendar, POS | bespoke/class cut flower bookings |

### Orders, subscriptions, and delivery collections

| Collection | Access summary | Primary consumers | Main purpose |
| --- | --- | --- | --- |
| `orders` | public create with validation, owner/admin read, admin update/delete constraints | checkout, account orders, admin orders, triggers, reports | storefront order records |
| `subscriptions` | owner/admin read, admin write | account page, subscription ops | active customer subscription records |
| `subscriptionCustomerSettings` | owner/admin read, admin write | subscription checkout/account/admin users | customer-level subscription settings such as EFT eligibility |
| `subscriptionInvoices` | owner/admin read, admin write | account page, pay link flow, subscription ops | cycle and top-up invoices |
| `subscriptionAdminAuditLogs` | admin read only | subscription audit trails | immutable admin audit trail area |
| `courierOptions` | public read, admin write | checkout, admin shipping, admin orders | courier pricing and province availability |

### POS, analytics, and system collections

| Collection | Access summary | Primary consumers | Main purpose |
| --- | --- | --- | --- |
| `posProducts` | admin read/write | admin POS | studio-only POS inventory |
| `posSales` | admin read/write | admin POS, cash-up, reports | completed and voided POS receipts |
| `posSales/{saleId}/voids/{voidId}` | admin read only | void audit | immutable void history |
| `posCashups` | admin read/write | admin POS cash-up | daily reconciliation snapshots |
| `adminPosSettings/{uid}` | owner/admin read, no direct client writes | admin profile, POS | POS-ready user settings |
| `adminPosCredentials/{uid}` | no client read/write | Cloud Functions only | secure POS PIN credential storage |
| `siteVisits` | admin read/write | reports | site analytics store |
| `config/{document}` | public read for config, special handling for `orderCounter` | general config access, order numbering | configuration docs |
| `config/orderCounter` | public read, tightly validated writes | order creation and numbering | sequential order counter |

### Gift-card and payment-session collections

| Collection | Access summary | Primary consumers | Main purpose |
| --- | --- | --- | --- |
| `giftCards` | admin read/write | gift-card admin, gift-card public endpoints, order trigger | issued gift-card records |
| `giftCardRegistry/{giftCardId}` | admin read only | admin management/search | normalized registry projection of gift cards |
| `giftCardRegistry/{giftCardId}/edits/{editId}` | admin read only | audit/history | immutable edit history |
| `giftCardDrafts` | admin read only, no client write | gift-card admin flow | saved draft gift cards |
| `pendingPayfastOrders` | admin read/write | payment session tracking | pending order payment sessions |
| `pendingPayfastSubscriptions` | admin read/write | subscription pay-now tracking | pending subscription payment sessions |

## 7. Storage Paths

| Storage path | Public read | Write behavior | Main use |
| --- | --- | --- | --- |
| `eftProofs/**` | no, signed-in only | signed-in PDF/image uploads with validation | EFT proof-of-payment uploads |
| `product-media/**` | yes | signed-in image upload/update/delete paths | reusable product/media library |
| `workshops/**` | yes | signed-in image upload/update/delete paths | workshop media |
| `events/**` | yes | signed-in image upload/update/delete paths | event media |
| `cut-flower-classes/**` | yes | signed-in image upload/update/delete paths | cut-flower class media |
| all other paths | yes | writes denied | catch-all fallback rule |

## 8. Cloud Functions Inventory

### User and identity functions

| Function | Type | Main purpose | Main consumers |
| --- | --- | --- | --- |
| `createUserWithRole` | callable | admin creates a user with a chosen role | admin users |
| `adminUpdateUserProfile` | callable | admin updates customer profile data | admin users |
| `adminSetPosPin` | callable | admin sets or changes their POS PIN | admin profile |
| `adminResetUserPosPin` | callable | admin resets another user's POS PIN | admin users |
| `syncUserClaims` | callable | syncs user claims/role state | admin/system utility |

### SEO and public utility endpoints

| Function | Type | Main purpose | Main consumers |
| --- | --- | --- | --- |
| `sitemapXml` | HTTP | dynamic sitemap generation | search engines, hosting rewrite |
| `robotsTxt` | HTTP | robots.txt generation | search engines, hosting rewrite |
| `createPayfastPayment` | callable | deprecated placeholder; instructs callers to use HTTP flow | legacy safety guard |
| `createPayfastPaymentHttp` | HTTP | creates PayFast payload for storefront checkout | `CartPage.jsx` |
| `createSubscriptionPayfastPaymentHttp` | HTTP | creates PayFast payload for subscription invoice pay-now links | `AccountSubscriptionPayPage.jsx` |

### Subscription functions

| Function | Type | Main purpose | Main consumers |
| --- | --- | --- | --- |
| `createCustomerSubscription` | callable | creates subscription, first invoice, and initial email flow | `SubscriptionCheckoutPage.jsx` |
| `updateCustomerSubscriptionDeliveryPreferences` | callable | customer updates Monday-slot delivery preferences | account page |
| `updateCustomerSubscriptionStatus` | callable | customer pause/resume/cancel flow | account page |
| `sendSubscriptionInvoiceEmailNow` | callable | resends a subscription invoice email | account page |
| `adminBackfillSubscriptionInvoiceOwnership` | callable | backfills missing `customerUid` on legacy invoices | admin/system utility |
| `generateSubscriptionInvoiceDocumentNow` | callable | generates invoice PDF/document on demand | account page/admin |
| `sendMonthlySubscriptionInvoices` | scheduled | monthly recurring invoice automation and resend logic | background automation |
| `adminSetSubscriptionEftEligibility` | callable | toggles subscription EFT approval for a user | admin users |
| `adminUpdateSubscriptionPaymentMethod` | callable | switches an active subscription between PayFast and EFT | subscription ops |
| `adminUpdateSubscriptionPlanAssignment` | callable | reassigns a customer to a different subscription plan | subscription ops |
| `adminAddSubscriptionInvoiceCharge` | callable | adds one-time or recurring invoice adjustments | subscription ops |
| `adminRemoveSubscriptionRecurringCharge` | callable | removes a recurring charge rule | subscription ops |
| `attachSubscriptionEftPaymentProof` | callable | stores proof metadata against a subscription invoice | account page |
| `adminUpdateSubscriptionStatus` | callable | admin status change on subscriptions | subscription ops |
| `fixSubscriptionPricingIssue` | callable | maintenance/repair action for subscription pricing inconsistencies | admin subscriptions |
| `adminUpsertSubscriptionInvoiceStatus` | callable | admin invoice status override/create-missing behavior | subscription ops |

### Order, checkout, payment, and messaging functions

| Function | Type | Main purpose | Main consumers |
| --- | --- | --- | --- |
| `createEftOrderHttp` | HTTP | creates EFT storefront orders | `CartPage.jsx` |
| `attachEftPaymentProofHttp` | HTTP | attaches EFT proof metadata to an order | `EftSubmittedPage.jsx` |
| `payfastItn` | HTTP | PayFast Instant Transaction Notification handler | PayFast callback |
| `reviewEftPayment` | callable | admin approves or rejects EFT order payments | admin orders |
| `reconcilePaidOrderProductInventory` | callable | inventory reconciliation for paid/approved orders | admin/system utility |
| `createAdminEftOrder` | callable | admin creates manual EFT orders | admin orders |
| `adminUpdateOrderDeliveryDetails` | callable | admin edits delivery method, courier, address, tracking, and totals | admin orders |
| `adminSendOrderDeliveryUpdateEmail` | callable | manual customer email after delivery changes | admin orders |
| `sendOrderStatusEmail` | callable | manual order status email | admin orders |
| `sendPreorderListEmail` | callable | preorder list email dispatch | admin orders |
| `resendOrderConfirmationEmail` | callable | resend original order confirmation | admin orders |
| `sendContactEmail` | callable | sends contact form/admin confirmation email | `ContactPage.jsx` |
| `sendBookingEmail` | callable | booking email dispatch | booking modal/admin |

### Gift-card and preview/testing functions

| Function | Type | Main purpose | Main consumers |
| --- | --- | --- | --- |
| `getGiftCardPublicHttp` | HTTP | public tokenized gift-card lookup | `GiftCardPage.jsx` |
| `viewGiftCardHttp` | HTTP | authenticated/admin-facing gift-card view endpoint | admin/tools |
| `downloadGiftCardPdfHttp` | HTTP | gift-card PDF download endpoint | account/admin/tools |
| `previewTestEmailTemplate` | callable | render test email HTML for preview | admin email preview |
| `previewSubscriptionInvoiceTemplate` | callable | render invoice email/template preview | admin invoice preview |
| `previewAdminGiveawayGiftCard` | callable | render admin giveaway gift-card preview | admin gift cards |
| `saveAdminGiveawayGiftCardDraft` | callable | saves a draft gift card | admin gift cards |
| `createAdminGiveawayGiftCardFromDraft` | callable | issues a gift card from a saved draft | admin gift cards |
| `createAdminGiveawayGiftCard` | callable | deprecated direct-create path; intentionally blocked | legacy safety guard |
| `adminUpdateGiftCard` | callable | edits active gift-card details | admin gift cards |
| `adminArchiveGiftCard` | callable | archives a gift card | admin gift cards |
| `redeemGiftCardOnline` | callable | online gift-card redemption flow | checkout/gift-card systems |
| `adminBackfillGiftCardRegistry` | callable | synchronizes registry projection from stored gift cards | admin gift cards |
| `sendTestEmail` | callable | sends a test email to a chosen recipient | admin email tools |
| `sendTestGiftCard` | callable | sends a test gift card/email | admin gift-card tools |

### POS and automation functions

| Function | Type | Main purpose | Main consumers |
| --- | --- | --- | --- |
| `adminVoidPosSale` | callable | voids or corrects a POS receipt | POS and cash-up |
| `lookupGiftCardByCode` | callable | gift-card lookup inside POS | admin POS |
| `sendPosReceipt` | callable | optional POS receipt email send | admin POS |
| `onUserCreatedSendWelcomeEmail` | Firestore trigger | sends welcome email on new user creation | background automation |
| `onOrderCreated` | Firestore trigger | order-side effects: notifications, invoice work, gift-card issuing | background automation |
| `onGiftCardWrittenSyncRegistry` | Firestore trigger | keeps registry projection in sync with gift-card writes | background automation |

## 9. Key Business Rules And Algorithms

### Auth and role resolution

`AuthContext.jsx` uses a layered role-resolution strategy:

1. try localStorage role cache
2. try role from the auth token payload
3. fetch the authoritative role from `users/{uid}`
4. write the resolved role back into the cache
5. trim the cache to a fixed limit

This reduces UI flicker while still allowing Firestore to remain authoritative.

### Admin inventory readiness

`AdminDataContext.jsx` keeps per-collection readiness flags. Admin pages do not treat inventory as fully loaded until all core subscriptions have delivered their first snapshot.

This prevents partial admin rendering where some modules appear loaded while others are still empty.

### Workshop sort-date resolution

Admin workshop sorting does not rely only on a single field. It attempts, in order:

1. `scheduledFor`
2. direct session `start` or `startDate`
3. a composed value from session `date` + `time`
4. lexical fallback by workshop title/name

This allows older and newer workshop shapes to sort consistently.

### Cart exclusivity

`CartContext.jsx` enforces a top-level rule:

- the cart may contain workshop-type items or product-type items, but not both

If a user tries to mix them, the add is rejected and a cart notice is published.

### Stock normalization

`lib/stockStatus.js` normalizes stock into a small set of states:

- `in`
- `low`
- `out`
- `preorder`

Important thresholds and rules:

- low-stock threshold: `10`
- customer quantity disclosure threshold: `15`
- gift cards are treated as sellable even though they are not standard inventory items

### Fresh flower delivery classification

`lib/freshFlowerDelivery.js` uses category-token heuristics to decide whether an item or order needs manual delivery follow-up.

Effects of this classification:

- storefront copy changes
- checkout messaging changes
- legal copy references it
- order fulfillment metadata records whether follow-up is required

### Gift-card option normalization

`lib/giftCardStudio.js` normalizes option keys, quantities, values, summaries, and selected-option display lines.

Important business rule:

- the "Whole Crew" style option requires a minimum selection count of `4`

### Checkout retry and fallback

The storefront checkout flow in `CartPage.jsx` uses retry/fallback behavior for HTTP endpoints.

Main behaviors:

- request timeout via `AbortController`
- retry attempts for transient failures
- fallback function-base support through the shared endpoint resolver
- pending session data stored locally before redirecting to PayFast

### Subscription delivery-slot and proration algorithm

The subscription system is built around Monday delivery slots.

Core rules:

- weekly plans require all Mondays in the cycle
- bi-weekly plans require two Monday slots
- monthly plans require one Monday slot
- delivery-slot availability is calculated from the actual Mondays in a given month
- signup pricing is prorated by the number of remaining eligible Mondays
- if no eligible Monday remains in the current month, the first invoice shifts to the next cycle

Recurring billing rules:

- invoices are pre-billed in the last five days of the month
- there is a day-1 fallback if prebilling was missed
- if an older invoice is still unpaid, the system resends the existing pay-link instead of creating a new cycle invoice
- delivery-ready in ops is based on `active subscription + paid base cycle invoice`

### Admin calendar month matrix

`AdminWorkshopsCalendarView` builds a six-week month matrix using:

- the first day of the visible month
- the weekday offset from that first day
- a computed start date for the grid
- date-keyed maps for workshop bookings, cut flower bookings, and events

This allows the calendar to display booking and event markers even when the month view spans days from adjacent months.

### Cut flower booking option gating

`AdminCutFlowerBookingsView` derives valid per-attendee options from the live class definitions and hides options that require a higher attendee minimum than the current booking attendee count.

This prevents invalid option assignment at booking-edit time.

### POS cart identity and sale flow

The POS system uses a cart key derived from line type plus identity fields such as:

- source id
- variant id
- session id

Implications:

- the same keyed item merges into one line
- different variants or sessions stay separate
- gift-card-linked lines can be managed as a coordinated group

The POS flow also applies post-sale side effects such as:

- inventory updates
- booking status/payment updates
- optional receipt email send
- void and correction handling through a shared backend callable

### Cash-up snapshot behavior

Cash-up is snapshot-based rather than derived-only.

Implications:

- a closeout can be saved for a day
- later voids can make an existing cash-up stale
- the UI can surface a review-needed state when saved totals no longer match the current receipt set

### Order trigger side effects

The order-created trigger centralizes asynchronous order follow-up work.

Side effects include:

- notifications
- invoice-related work
- gift-card issuing when the order contains gift-card items

## 10. Security And Access Model Summary

### Publicly readable business content

The following are intentionally public-readable:

- products
- subscription plans
- product categories
- product tags
- workshops
- events
- cut flower classes
- courier options
- config docs intended for public/config use

### Customer self-service surfaces

Customers can directly access their own:

- user doc in constrained ways
- customer profile
- orders
- subscriptions
- subscription invoices
- subscription customer settings read access

### Admin-only operational surfaces

Admin-only write or full-control areas include:

- catalog management
- bookings management
- order operations
- shipping and courier admin
- POS
- gift cards
- subscription operational changes
- media library
- reporting

### Sensitive server-only surfaces

The following are intentionally blocked from direct client access:

- `adminPosCredentials`
- registry write surfaces such as `giftCardRegistry`
- audit log write surfaces
- most background-only system collections

## 11. Relationship To Existing Supporting Docs

The most detailed subsystem handoff currently in the repo is:

- `frontend/docs/pos-current-structure.md`

That document goes deeper than this overview on:

- POS screen responsibilities
- POS data sources
- POS cart structure
- void flow
- cash-up flow
- current architecture pressure points

## 12. Practical Reading Order For New Contributors

If you need to understand the system quickly, read in this order:

1. `frontend/src/App.jsx`
2. `frontend/src/context/AuthContext.jsx`
3. `frontend/src/context/CartContext.jsx`
4. `frontend/src/context/AdminDataContext.jsx`
5. `frontend/src/pages/CartPage.jsx`
6. `frontend/src/pages/SubscriptionCheckoutPage.jsx`
7. `frontend/src/pages/AccountPage.jsx`
8. `frontend/src/pages/AdminPage.jsx`
9. `frontend/src/pages/admin/AdminPosPage.jsx`
10. `frontend/functions/index.js`
11. `frontend/firestore.rules`
12. `frontend/docs/pos-current-structure.md`

## 13. Current-System Summary In One Sentence

Bethany Blooms is currently a unified floral storefront, booking platform, subscription billing system, gift-card engine, admin operations console, and in-person POS system running in one React + Firebase application.
