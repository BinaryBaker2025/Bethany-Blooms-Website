import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [isCartOpen, setCartOpen] = useState(false);
  const [isBookingOpen, setBookingOpen] = useState(false);
  const [bookingContext, setBookingContext] = useState(null);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
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
      isCartOpen,
      openCart,
      closeCart,
      isBookingOpen,
      openBooking,
      closeBooking,
      bookingContext,
    }),
    [isCartOpen, isBookingOpen, openCart, closeCart, openBooking, closeBooking, bookingContext],
  );

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) throw new Error("useModal must be used within ModalProvider");
  return context;
}
