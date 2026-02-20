import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { ModalProvider } from "./context/ModalContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

const HomePage = lazy(() => import("./pages/HomePage.jsx"));
const WorkshopsPage = lazy(() => import("./pages/WorkshopsPage.jsx"));
const WorkshopDetailPage = lazy(() => import("./pages/WorkshopDetailPage.jsx"));
const ProductsPage = lazy(() => import("./pages/ProductsPage.jsx"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage.jsx"));
const CartPage = lazy(() => import("./pages/CartPage.jsx"));
const GalleryPage = lazy(() => import("./pages/GalleryPage.jsx"));
const ContactPage = lazy(() => import("./pages/ContactPage.jsx"));
const AccountPage = lazy(() => import("./pages/AccountPage.jsx"));
const SubscriptionCheckoutPage = lazy(() => import("./pages/SubscriptionCheckoutPage.jsx"));
const AccountOrderDetailPage = lazy(() => import("./pages/AccountOrderDetailPage.jsx"));
const AccountSubscriptionPayPage = lazy(() =>
  import("./pages/AccountSubscriptionPayPage.jsx"),
);
const EventsPage = lazy(() => import("./pages/EventsPage.jsx"));
const CutFlowersPage = lazy(() => import("./pages/CutFlowersPage.jsx"));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentSuccessPage.jsx"));
const PaymentCancelPage = lazy(() => import("./pages/PaymentCancelPage.jsx"));
const EftSubmittedPage = lazy(() => import("./pages/EftSubmittedPage.jsx"));
const GiftCardPage = lazy(() => import("./pages/GiftCardPage.jsx"));
const DesignSystemPage = lazy(() => import("./pages/DesignSystemPage.jsx"));

const loadAdminPageModule = () => import("./pages/AdminPage.jsx");
const AdminDashboardView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminDashboardView })),
);
const AdminCutFlowerBookingsView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminCutFlowerBookingsView })),
);
const AdminCutFlowerClassesView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminCutFlowerClassesView })),
);
const AdminEventsView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminEventsView })),
);
const AdminEmailTestView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminEmailTestView })),
);
const AdminInvoicePreviewView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminInvoicePreviewView })),
);
const AdminOrdersView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminOrdersView })),
);
const AdminUsersView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminUsersView })),
);
const AdminProductsView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminProductsView })),
);
const AdminSubscriptionsView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminSubscriptionsView })),
);
const AdminSubscriptionOpsView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminSubscriptionOpsView })),
);
const AdminMediaLibraryView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminMediaLibraryView })),
);
const AdminProfileView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminProfileView })),
);
const AdminShippingView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminShippingView })),
);
const AdminWorkshopsView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminWorkshopsView })),
);
const AdminWorkshopsCalendarView = lazy(() =>
  loadAdminPageModule().then((module) => ({ default: module.AdminWorkshopsCalendarView })),
);

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const AdminPosPage = lazy(() => import("./pages/admin/AdminPosPage.jsx"));
const AdminPosCashUpPage = lazy(() => import("./pages/admin/AdminPosCashUpPage.jsx"));
const AdminReportsPage = lazy(() => import("./pages/admin/AdminReportsPage.jsx"));

function RouteFallback() {
  return (
    <section className="section section--tight">
      <div className="section__inner">
        <p className="empty-state">Loading page...</p>
      </div>
    </section>
  );
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ModalProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/workshops" element={<WorkshopsPage />} />
                <Route
                  path="/workshops/:workshopId"
                  element={<WorkshopDetailPage />}
                />
                <Route path="/cut-flowers" element={<CutFlowersPage />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/products/:productId" element={<ProductDetailPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/gallery" element={<GalleryPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/subscriptions/checkout" element={<SubscriptionCheckoutPage />} />
                <Route path="/account/orders/:orderId" element={<AccountOrderDetailPage />} />
                <Route
                  path="/account/subscriptions/pay/:invoiceId"
                  element={<AccountSubscriptionPayPage />}
                />
                <Route path="/payment/success" element={<PaymentSuccessPage />} />
                <Route path="/payment/cancel" element={<PaymentCancelPage />} />
                <Route path="/payment/eft-submitted" element={<EftSubmittedPage />} />
                <Route path="/gift-cards/:giftCardId" element={<GiftCardPage />} />
                <Route path="/design" element={<DesignSystemPage />} />
                <Route path="*" element={<HomePage />} />
              </Route>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboardView />} />
                <Route path="products" element={<AdminProductsView />} />
                <Route path="subscriptions" element={<AdminSubscriptionsView />} />
                <Route path="subscription-ops" element={<AdminSubscriptionOpsView />} />
                <Route path="media" element={<AdminMediaLibraryView />} />
                <Route path="products/categories" element={<AdminProductsView />} />
                <Route path="workshops" element={<AdminWorkshopsView />} />
                <Route
                  path="workshops/calendar"
                  element={<AdminWorkshopsCalendarView />}
                />
                <Route path="cut-flowers/classes" element={<AdminCutFlowerClassesView />} />
                <Route path="cut-flowers/bookings" element={<AdminCutFlowerBookingsView />} />
                <Route path="events" element={<AdminEventsView />} />
                <Route path="emails" element={<AdminEmailTestView />} />
                <Route path="invoices" element={<AdminInvoicePreviewView />} />
                <Route path="pos" element={<AdminPosPage />} />
                <Route path="pos/cash-up" element={<AdminPosCashUpPage />} />
                <Route path="reports" element={<AdminReportsPage />} />
                <Route path="users" element={<AdminUsersView />} />
                <Route path="orders" element={<AdminOrdersView />} />
                <Route path="shipping" element={<AdminShippingView />} />
                <Route path="profile" element={<AdminProfileView />} />
              </Route>
            </Routes>
          </Suspense>
        </ModalProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
