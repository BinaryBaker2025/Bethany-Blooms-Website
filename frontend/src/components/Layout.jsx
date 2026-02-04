import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useModal } from "../context/ModalContext.jsx";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import BookingModal from "./BookingModal.jsx";
import WhatsAppFloatingButton from "./WhatsAppFloatingButton.jsx";

function Layout() {
  const location = useLocation();
  const { closeBooking, cartNotice, dismissCartNotice } = useModal();

  useEffect(() => {
    closeBooking();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname, closeBooking]);

  useEffect(() => {
    if (!cartNotice) return undefined;
    const timeout = setTimeout(() => {
      dismissCartNotice();
    }, 2200);
    return () => clearTimeout(timeout);
  }, [cartNotice, dismissCartNotice]);

  return (
    <div className="layout">
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      {cartNotice && (
        <div key={cartNotice.id} className="cart-toast" role="status" aria-live="polite">
          <div className="cart-toast__content">
            <span>{cartNotice.message}</span>
            <div className="cart-toast__actions">
              <Link className="cart-toast__link" to="/cart">
                View cart
              </Link>
              <button className="cart-toast__close" type="button" onClick={dismissCartNotice} aria-label="Dismiss">
                &times;
              </button>
            </div>
          </div>
        </div>
      )}
      <WhatsAppFloatingButton hasCartNotice={Boolean(cartNotice)} />
      <BookingModal />
    </div>
  );
}

export default Layout;
