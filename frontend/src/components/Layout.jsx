import { Suspense, lazy, useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useModal } from "../context/ModalContext.jsx";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import WhatsAppFloatingButton from "./WhatsAppFloatingButton.jsx";

const BookingModal = lazy(() => import("./BookingModal.jsx"));

function Layout() {
  const location = useLocation();
  const hideFloatingWhatsApp =
    location.pathname === "/cart" ||
    location.pathname === "/checkout" ||
    location.pathname.startsWith("/payment/");
  const isInitialPixelPageView = useRef(true);
  const { closeBooking, cartNotice, dismissCartNotice, isBookingOpen } = useModal();

  useEffect(() => {
    closeBooking();
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname, closeBooking]);

  useEffect(() => {
    // The base document records the initial PageView. React Router navigation
    // does not reload that document, so record subsequent virtual page views.
    if (isInitialPixelPageView.current) {
      isInitialPixelPageView.current = false;
      return;
    }
    if (typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!cartNotice) return undefined;
    const timeout = setTimeout(() => {
      dismissCartNotice();
    }, 2200);
    return () => clearTimeout(timeout);
  }, [cartNotice, dismissCartNotice]);

  return (
    <div className="layout">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header />
      <main id="main-content" tabIndex="-1">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      {cartNotice && (
        <div key={cartNotice.id} className="cart-toast" role="status" aria-live="polite">
          <div className="cart-toast__content">
            <span>{cartNotice.message}</span>
            <div className="cart-toast__actions">
              <Link className="cart-toast__link" to="/checkout">
                Proceed to checkout
              </Link>
              <button className="cart-toast__close" type="button" onClick={dismissCartNotice} aria-label="Dismiss">
                &times;
              </button>
            </div>
          </div>
        </div>
      )}
      {!hideFloatingWhatsApp && (
        <WhatsAppFloatingButton hasCartNotice={Boolean(cartNotice)} />
      )}
      {isBookingOpen && (
        <Suspense fallback={null}>
          <BookingModal />
        </Suspense>
      )}
    </div>
  );
}

export default Layout;
