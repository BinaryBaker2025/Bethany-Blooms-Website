import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const navigate = useNavigate();
  const [isBookingOpen, setBookingOpen] = useState(false);
  const [bookingContext, setBookingContext] = useState(null);
  const [cartNotice, setCartNotice] = useState(null);

  const openCart = useCallback(() => {
    navigate("/cart");
  }, [navigate]);
  const notifyCart = useCallback((message = "Added to cart") => {
    setCartNotice({ message, id: Date.now() });
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleCartNotice = (event) => {
      const message = event?.detail?.message;
      if (!message) return;
      setCartNotice({ message: String(message), id: Date.now() });
    };
    window.addEventListener("cart-notice", handleCartNotice);
    return () => {
      window.removeEventListener("cart-notice", handleCartNotice);
    };
  }, []);
  const dismissCartNotice = useCallback(() => {
    setCartNotice(null);
  }, []);
  const openBooking = useCallback((context = null) => {
    setBookingContext(context);
    setBookingOpen(true);
  }, []);
  const closeBooking = useCallback(() => {
    setBookingOpen(false);
    setBookingContext(null);
  }, []);

  const value = useMemo(
    () => ({
      openCart,
      notifyCart,
      cartNotice,
      dismissCartNotice,
      isBookingOpen,
      openBooking,
      closeBooking,
      bookingContext,
    }),
    [
      isBookingOpen,
      openCart,
      notifyCart,
      cartNotice,
      dismissCartNotice,
      openBooking,
      closeBooking,
      bookingContext,
    ],
  );

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) throw new Error("useModal must be used within ModalProvider");
  return context;
}
