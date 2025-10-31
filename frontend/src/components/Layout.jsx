import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useModal } from "../context/ModalContext.jsx";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import CartModal from "./CartModal.jsx";
import BookingModal from "./BookingModal.jsx";

function Layout() {
  const location = useLocation();
  const { closeCart, closeBooking } = useModal();

  useEffect(() => {
    closeCart();
    closeBooking();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname, closeCart, closeBooking]);

  return (
    <div className="layout">
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <CartModal />
      <BookingModal />
    </div>
  );
}

export default Layout;
