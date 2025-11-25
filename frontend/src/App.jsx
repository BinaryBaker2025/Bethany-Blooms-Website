import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import HomePage from "./pages/HomePage.jsx";
import WorkshopsPage from "./pages/WorkshopsPage.jsx";
import WorkshopDetailPage from "./pages/WorkshopDetailPage.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import EventsPage from "./pages/EventsPage.jsx";
import CutFlowersPage from "./pages/CutFlowersPage.jsx";
import PaymentSuccessPage from "./pages/PaymentSuccessPage.jsx";
import PaymentCancelPage from "./pages/PaymentCancelPage.jsx";
import {
  AdminDashboardView,
  AdminCutFlowerBookingsView,
  AdminCutFlowerClassesView,
  AdminEventsView,
  AdminOrdersView,
  AdminProductsView,
  AdminProfileView,
  AdminWorkshopsView,
  AdminWorkshopsCalendarView,
} from "./pages/AdminPage.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
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
              <Route path="/gallery" element={<GalleryPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/payment/success" element={<PaymentSuccessPage />} />
              <Route path="/payment/cancel" element={<PaymentCancelPage />} />
              <Route path="*" element={<HomePage />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardView />} />
              <Route path="products" element={<AdminProductsView />} />
              <Route path="workshops" element={<AdminWorkshopsView />} />
              <Route
                path="workshops/calendar"
                element={<AdminWorkshopsCalendarView />}
              />
              <Route path="cut-flowers/classes" element={<AdminCutFlowerClassesView />} />
              <Route path="cut-flowers/bookings" element={<AdminCutFlowerBookingsView />} />
              <Route path="events" element={<AdminEventsView />} />
              <Route path="orders" element={<AdminOrdersView />} />
              <Route path="profile" element={<AdminProfileView />} />
            </Route>
          </Routes>
        </ModalProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
