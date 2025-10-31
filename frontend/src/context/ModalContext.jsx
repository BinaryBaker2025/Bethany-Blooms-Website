import { createContext, useContext, useMemo, useState } from "react";

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [isCartOpen, setCartOpen] = useState(false);
  const [isBookingOpen, setBookingOpen] = useState(false);

  const value = useMemo(
    () => ({
      isCartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      isBookingOpen,
      openBooking: () => setBookingOpen(true),
      closeBooking: () => setBookingOpen(false),
    }),
    [isCartOpen, isBookingOpen],
  );

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) throw new Error("useModal must be used within ModalProvider");
  return context;
}
