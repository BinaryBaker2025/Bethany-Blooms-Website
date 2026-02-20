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

const normalizeStockStatus = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase();

const normalizeStockQuantity = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
};

const getOutOfStockMessage = (item = {}) => {
  const variantLabel = (item.metadata?.variantLabel || "").toString().trim();
  if (variantLabel) return `${variantLabel} is out of stock.`;
  const itemName = (item.name || "").toString().trim();
  if (itemName) return `${itemName} is out of stock.`;
  return "This item is out of stock.";
};

const publishCartNotice = (message) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cart-notice", {
      detail: {
        message: (message || "").toString().trim() || "Cart updated.",
      },
    }),
  );
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
        publishCartNotice(
          "You can only have workshops or products in your cart at one time. Clear your cart to switch.",
        );
        return prev;
      }

      if (incomingType === "product") {
        const isGiftCard = Boolean(item.metadata?.giftCard?.isGiftCard || item.metadata?.isGiftCard);
        if (!isGiftCard) {
          const stockStatus = normalizeStockStatus(
            item.metadata?.stockStatus || item.metadata?.stock_status || item.stockStatus || item.stock_status || "",
          );
          const stockQuantity = normalizeStockQuantity(
            item.metadata?.stockQuantity ??
              item.metadata?.stock_quantity ??
              item.stockQuantity ??
              item.stock_quantity,
          );
          const isOutOfStock =
            stockStatus === "out" ||
            stockStatus === "out_of_stock" ||
            (stockQuantity !== null && stockQuantity <= 0);

          if (isOutOfStock) {
            publishCartNotice(getOutOfStockMessage(item));
            return prev;
          }

          const existing = prev.find((entry) => entry.id === item.id);
          if (existing && stockQuantity !== null) {
            const nextQuantity = (Number(existing.quantity) || 0) + (item.quantity ?? 1);
            if (nextQuantity > stockQuantity) {
              publishCartNotice(
                stockQuantity <= 0
                  ? getOutOfStockMessage(item)
                  : `Only ${stockQuantity} available for this item.`,
              );
              return prev;
            }
          }
        }
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

  const updateItemQuantity = (id, quantity) => {
    const normalized = Number(quantity);
    if (!Number.isFinite(normalized)) return;
    const nextQuantity = Math.max(0, Math.floor(normalized));
    setItems((prev) =>
      nextQuantity <= 0
        ? prev.filter((item) => item.id !== id)
        : prev.map((item) =>
            item.id === id ? { ...item, quantity: nextQuantity } : item,
          ),
    );
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
      updateItemQuantity,
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
