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

const resolveItemType = (entry) => {
  if (!entry) return null;
  if (entry.metadata?.type === "workshop") return "workshop";
  if (entry.itemType === "workshop" || entry.itemType === "product") {
    return entry.itemType;
  }
  return "product";
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
      const incomingType = resolveItemType(item) ?? "product";
      const existingType = resolveItemType(prev[0]);

      if (existingType && incomingType && existingType !== incomingType) {
        if (typeof window !== "undefined") {
          window.alert(
            "You can only have workshops or products in your cart at one time. Please clear your cart to switch.",
          );
        }
        return prev;
      }

      const existing = prev.find((entry) => entry.id === item.id);
      if (existing) {
        return prev.map((entry) =>
          entry.id === item.id
            ? { ...entry, quantity: entry.quantity + (item.quantity ?? 1) }
            : entry,
        );
      }
      return [
        ...prev,
        { ...item, quantity: item.quantity ?? 1, itemType: incomingType },
      ];
    });
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setItems([]);
  };

  const value = useMemo(() => {
    const totalCount = items.reduce((count, item) => count + item.quantity, 0);
    const totalPrice = items.reduce((total, item) => {
      const unitPrice = typeof item.price === "number" ? item.price : Number(item.price);
      return total + (Number.isFinite(unitPrice) ? unitPrice : 0) * item.quantity;
    }, 0);
    return {
      items,
      addItem,
      removeItem,
      clearCart,
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
