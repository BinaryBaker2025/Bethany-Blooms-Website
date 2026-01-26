const STOCK_LOW_THRESHOLD = 10;

const normalizeQuantity = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : null;
};

export const getStockStatus = ({ quantity, forceOutOfStock } = {}) => {
  const normalizedQuantity = normalizeQuantity(quantity);
  const isForcedOut = Boolean(forceOutOfStock);

  if (isForcedOut) {
    return {
      state: "out",
      label: "Out of stock",
      quantity: normalizedQuantity ?? 0,
      isForced: true,
    };
  }

  if (normalizedQuantity === null) {
    return {
      state: "in",
      label: "In stock",
      quantity: null,
      isForced: false,
      isEstimated: true,
    };
  }

  if (normalizedQuantity <= 0) {
    return {
      state: "out",
      label: "Out of stock",
      quantity: normalizedQuantity,
      isForced: false,
    };
  }

  if (normalizedQuantity < STOCK_LOW_THRESHOLD) {
    return {
      state: "low",
      label: "Low stock",
      quantity: normalizedQuantity,
      isForced: false,
    };
  }

  return {
    state: "in",
    label: "In stock",
    quantity: normalizedQuantity,
    isForced: false,
  };
};

export const getStockBadgeLabel = (stockStatus) => {
  if (!stockStatus) return "";
  if (stockStatus.state === "out") return "Out of stock";
  if (stockStatus.state === "low") return "Low stock — order now";
  return "In stock";
};

export { STOCK_LOW_THRESHOLD };
