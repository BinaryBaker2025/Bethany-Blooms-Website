const STOCK_LOW_THRESHOLD = 10;
const STOCK_COUNT_DISCLOSURE_THRESHOLD = 15;

const normalizeQuantity = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : null;
};

const normalizeStatus = (value) => (value || "").toString().trim().toLowerCase();

const hasUsableVariantIdentity = (variant) => {
  if (!variant || typeof variant !== "object") return false;
  const label = (variant.label || variant.name || "").toString().trim();
  const id = (variant.id || "").toString().trim();
  return Boolean(label || id);
};

export const getVariantStockStatus = (variant = {}, product = {}) => {
  const productStatus = normalizeStatus(product.stock_status || product.stockStatus);
  const explicitVariantStatus = normalizeStatus(variant.stock_status || variant.stockStatus);
  const stockQuantity = normalizeQuantity(
    variant.stock_quantity ?? variant.stockQuantity ?? variant.quantity,
  );
  // Only inherit product preorder when the variant has no explicit status and no tracked quantity.
  // If a variant has a concrete quantity (especially 0), quantity should decide availability.
  const inheritedStatus =
    !explicitVariantStatus && productStatus === "preorder" && stockQuantity === null
      ? "preorder"
      : "";
  const variantStatus = normalizeStatus(explicitVariantStatus || inheritedStatus);

  return getStockStatus({
    quantity: stockQuantity,
    forceOutOfStock:
      product.forceOutOfStock ||
      productStatus === "out_of_stock" ||
      variant.forceOutOfStock ||
      explicitVariantStatus === "out_of_stock" ||
      (variantStatus !== "preorder" && stockQuantity === null),
    status: variantStatus,
  });
};

export const getProductCardStockStatus = (product = {}) => {
  const baseQuantity = normalizeQuantity(
    product.stock_quantity ?? product.stockQuantity ?? product.quantity,
  );
  const baseStatus = getStockStatus({
    quantity: baseQuantity,
    forceOutOfStock:
      product.forceOutOfStock ||
      normalizeStatus(product.stock_status || product.stockStatus) === "out_of_stock",
    status: product.stock_status || product.stockStatus,
  });

  const variants = Array.isArray(product.variants)
    ? product.variants.filter((variant) => hasUsableVariantIdentity(variant))
    : [];
  const noVariantsAndZeroQuantity = !variants.length && baseQuantity === 0;
  if (noVariantsAndZeroQuantity) {
    return {
      ...baseStatus,
      state: "out",
      label: "Out of stock",
      quantity: 0,
      isForced: baseStatus.isForced || false,
    };
  }
  if (!variants.length) return baseStatus;

  const allVariantsQuantityZero = variants.every((variant) => {
    const quantity = normalizeQuantity(
      variant.stock_quantity ?? variant.stockQuantity ?? variant.quantity,
    );
    return quantity === 0;
  });
  if (allVariantsQuantityZero) {
    return {
      ...baseStatus,
      state: "out",
      label: "Out of stock",
      quantity: 0,
      isForced: baseStatus.isForced || false,
    };
  }

  const allVariantsOutOfStock = variants.every(
    (variant) => getVariantStockStatus(variant, product).state === "out",
  );
  if (!allVariantsOutOfStock) return baseStatus;

  return {
    ...baseStatus,
    state: "out",
    label: "Out of stock",
    quantity: 0,
    isForced: baseStatus.isForced || false,
  };
};

export const getStockStatus = ({ quantity, forceOutOfStock, status } = {}) => {
  const normalizedQuantity = normalizeQuantity(quantity);
  const isForcedOut = Boolean(forceOutOfStock);
  const normalizedStatus = status ? status.toString().toLowerCase() : "";

  if (normalizedStatus === "preorder") {
    return {
      state: "preorder",
      label: "Preorder",
      quantity: normalizedQuantity ?? null,
      isForced: false,
    };
  }

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
  if (stockStatus.state === "preorder") return "Preorder";
  if (stockStatus.state === "out") return "Out of stock";
  if (stockStatus.state === "low") return "Low stock - order now";
  return "In stock";
};

export const getCustomerStockLabel = (
  stockStatus,
  { threshold = STOCK_COUNT_DISCLOSURE_THRESHOLD } = {},
) => {
  if (!stockStatus) return "";
  const quantity = Number(stockStatus.quantity);
  if (Number.isFinite(quantity) && quantity <= 0) return "Out of stock";
  if (stockStatus.state === "preorder") return "Preorder";
  if (stockStatus.state === "out") return "Out of stock";

  const numericThreshold = Number(threshold);
  const disclosureLimit = Number.isFinite(numericThreshold)
    ? Math.max(0, Math.floor(numericThreshold))
    : STOCK_COUNT_DISCLOSURE_THRESHOLD;

  if (Number.isFinite(quantity) && quantity <= disclosureLimit) {
    return `${Math.max(0, Math.floor(quantity))} left`;
  }
  return "In stock";
};

export { STOCK_LOW_THRESHOLD, STOCK_COUNT_DISCLOSURE_THRESHOLD };
