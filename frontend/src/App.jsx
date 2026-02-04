import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import HomePage from "./pages/HomePage.jsx";
import WorkshopsPage from "./pages/WorkshopsPage.jsx";
import WorkshopDetailPage from "./pages/WorkshopDetailPage.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import ProductDetailPage from "./pages/ProductDetailPage.jsx";
import CartPage from "./pages/CartPage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import EventsPage from "./pages/EventsPage.jsx";
import CutFlowersPage from "./pages/CutFlowersPage.jsx";
import PaymentSuccessPage from "./pages/PaymentSuccessPage.jsx";
import PaymentCancelPage from "./pages/PaymentCancelPage.jsx";
import EftSubmittedPage from "./pages/EftSubmittedPage.jsx";
import DesignSystemPage from "./pages/DesignSystemPage.jsx";
import {
  AdminDashboardView,
  AdminCutFlowerBookingsView,
  AdminCutFlowerClassesView,
  AdminEventsView,
  AdminEmailTestView,
  AdminOrdersView,
  AdminUsersView,
  AdminProductsView,
  AdminMediaLibraryView,
  AdminProfileView,
  AdminShippingView,
  AdminWorkshopsView,
  AdminWorkshopsCalendarView,
} from "./pages/AdminPage.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import AdminPosPage from "./pages/admin/AdminPosPage.jsx";
import AdminPosCashUpPage from "./pages/admin/AdminPosCashUpPage.jsx";
import AdminReportsPage from "./pages/admin/AdminReportsPage.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import { ModalProvider } from "./context/ModalContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ModalProvider>
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
              <Route path="/payment/success" element={<PaymentSuccessPage />} />
              <Route path="/payment/cancel" element={<PaymentCancelPage />} />
              <Route path="/payment/eft-submitted" element={<EftSubmittedPage />} />
              <Route path="/design" element={<DesignSystemPage />} />
              <Route path="*" element={<HomePage />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardView />} />
              <Route path="products" element={<AdminProductsView />} />
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
              <Route path="pos" element={<AdminPosPage />} />
              <Route path="pos/cash-up" element={<AdminPosCashUpPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="users" element={<AdminUsersView />} />
              <Route path="orders" element={<AdminOrdersView />} />
              <Route path="shipping" element={<AdminShippingView />} />
              <Route path="profile" element={<AdminProfileView />} />
            </Route>
          </Routes>
        </ModalProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
