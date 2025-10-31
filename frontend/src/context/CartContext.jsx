import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "bethany-blooms-cart";

const readStorage = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn("Unable to parse cart", error);
    return [];
  }
};

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => readStorage());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setItems(readStorage());
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, isReady]);

  const addItem = (item) => {
    setItems((prev) => {
      const existing = prev.find((entry) => entry.id === item.id);
      if (existing) {
        return prev.map((entry) =>
          entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const value = useMemo(() => {
    const totalCount = items.reduce((count, item) => count + item.quantity, 0);
    const totalPrice = items.reduce((total, item) => total + item.price * item.quantity, 0);
    return {
      items,
      addItem,
      removeItem,
      totalCount,
      totalPrice,
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
