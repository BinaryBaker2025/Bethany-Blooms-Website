import { getStockStatus } from "./stockStatus.js";

export const PREORDER_MIXED_CART_GUIDANCE =
  "Pre-order plants ship on a dispatch schedule. In-stock plants ship sooner. Checkout each group separately so we can fulfil and invoice correctly.";

const isGiftCardCartItem = (item) =>
  Boolean(item?.metadata?.giftCard?.isGiftCard || item?.metadata?.isGiftCard);

const normalizeStockStatusValue = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** Same dual-key indexing as CartPage productLookup */
export function buildProductCatalogLookup(products = []) {
  const map = new Map();
  (Array.isArray(products) ? products : []).forEach((product) => {
    if (!product || typeof product !== "object") return;
    if (product.id) map.set(product.id, product);
    if (product.slug) map.set(product.slug, product);
  });
  return map;
}

export function resolveCartLineStockAgainstCatalog(item, productLookup = new Map()) {
  if (!item || item.metadata?.type !== "product") return null;
  if (isGiftCardCartItem(item)) {
    return {
      status: getStockStatus({ quantity: null, status: "in_stock" }),
      product: null,
    };
  }
  const productId =
    item.metadata?.productId || item.metadata?.productID || item.metadata?.product;
  const product = productLookup.get(productId) || null;
  if (!product) return null;
  const variantId = (item.metadata?.variantId || "").toString().trim();
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  const variant =
    variantId && hasVariants
      ? product.variants.find((entry) => (entry?.id || "").toString().trim() === variantId)
      : null;
  if (hasVariants && (!variantId || !variant)) {
    const productStatusValue = (
      product.stock_status ||
      product.stockStatus ||
      product.stockState ||
      product.stock_state ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();
    const isProductPreorder =
      normalizeStockStatusValue(productStatusValue) === "preorder" ||
      Boolean(
        product.preorderSendMonth ||
          product.preorder_send_month ||
          product.preorderSendMonthLabel,
      );
    if (isProductPreorder) {
      return {
        status: getStockStatus({ quantity: null, status: "preorder" }),
        product,
      };
    }
    return {
      status: getStockStatus({
        quantity: 0,
        forceOutOfStock: true,
        status: "out_of_stock",
      }),
      product,
    };
  }
  const rawQuantity = hasVariants
    ? variant?.stock_quantity ?? variant?.stockQuantity ?? variant?.quantity
    : product.stock_quantity ?? product.stockQuantity ?? product.quantity;
  const statusValue = (
    variant?.stock_status ||
      variant?.stockStatus ||
      product.stock_status ||
      ""
  )
    .toString()
    .trim()
    .toLowerCase();
  const isVariantQuantityMissing =
    hasVariants &&
    (rawQuantity === undefined || rawQuantity === null || rawQuantity === "");
  const stockStatus = getStockStatus({
    quantity: rawQuantity,
    forceOutOfStock:
      product.forceOutOfStock ||
      product.stock_status === "out_of_stock" ||
      variant?.forceOutOfStock ||
      variant?.stock_status === "out_of_stock" ||
      (isVariantQuantityMissing && statusValue !== "preorder"),
    status: statusValue,
    isGiftCard: false,
  });
  return {
    status: stockStatus,
    product,
    variantId,
    variant: variant || null,
  };
}

export function isPreorderCartLineForMixedRules(item, productLookup = new Map()) {
  return Boolean(isPreorderCartItemFromCatalogMerge(item, productLookup));
}

function isPreorderCartItemFromCatalogMerge(item, productLookup) {
  if (!item || item?.metadata?.type !== "product" || isGiftCardCartItem(item)) return false;
  const stockInfo = resolveCartLineStockAgainstCatalog(item, productLookup);
  if (stockInfo?.product && stockInfo?.status?.state) {
    const state = normalizeStockStatusValue(stockInfo.status.state || "");
    if (state === "preorder") return true;
    if (
      stockInfo.variant &&
      (stockInfo.variant.stock_quantity === undefined ||
        stockInfo.variant.stock_quantity === null)
    ) {
      const pv = normalizeStockStatusValue(
        stockInfo.variant.stock_status || stockInfo.variant.stockStatus || "",
      );
      if (pv === "preorder") return true;
    }
    // Known product with a resolved non-pre-order state — ignore stale pre-order labels on old lines.
    return false;
  }

  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const fallbackFlags = [
    metadata.stockStatus,
    metadata.stock_status,
    metadata.stockState,
    metadata.stock_state,
    item.stockStatus,
    item.stock_status,
    item.stockState,
    item.stock_state,
  ];
  if (fallbackFlags.some((value) => normalizeStockStatusValue(value) === "preorder")) return true;
  return Boolean(
    metadata.preorderSendMonth ||
      metadata.preorder_send_month ||
      metadata.preorderSendMonthLabel ||
      item.preorderSendMonth ||
      item.preorder_send_month,
  );
}

/**
 * Rewrite product-line metadata using the catalog so preorder flags match storefront stock rules.
 */
export function hydrateCartProductLinesFromCatalog(items = [], catalogProducts = []) {
  const productLookup = buildProductCatalogLookup(catalogProducts);
  return items.map((item) => hydrateSingleCartLine(item, productLookup));
}

function hydrateSingleCartLine(item, productLookup) {
  if (!item || item.metadata?.type !== "product" || isGiftCardCartItem(item)) {
    return item;
  }
  const merged = structuredCloneCompatible(item);
  const stockInfo = resolveCartLineStockAgainstCatalog(merged, productLookup);
  if (!stockInfo || !merged.metadata || typeof merged.metadata !== "object") return merged;

  const { status, product } = stockInfo;
  const stateSlug = normalizeStockStatusValue(status?.state || "");
  const preorderActive = stateSlug === "preorder";
  const monthRaw =
    preorderActive &&
    ((product.preorderSendMonth || product.preorder_send_month || "").toString().trim() ||
      (merged.metadata.preorderSendMonth || merged.metadata.preorder_send_month || "")
        .toString()
        .trim());
  const label =
    preorderActive &&
    (
      product.preorderSendMonthLabel ||
      merged.metadata.preorderSendMonthLabel ||
      ""
    )
      .toString()
      .trim();

  merged.metadata = { ...merged.metadata };
  merged.metadata.stockStatus = status?.state ?? merged.metadata.stockStatus ?? null;
  merged.metadata.stock_status = status?.state ?? merged.metadata.stock_status ?? null;
  if (Number.isFinite(status?.quantity)) {
    merged.metadata.stockQuantity = status.quantity;
    merged.metadata.stock_quantity = status.quantity;
  }

  if (preorderActive) {
    if (monthRaw) {
      merged.metadata.preorderSendMonth = monthRaw;
      merged.metadata.preorder_send_month = monthRaw;
    }
    if (label) merged.metadata.preorderSendMonthLabel = label;
    else merged.metadata.preorderSendMonthLabel = merged.metadata.preorderSendMonthLabel || "";
  } else {
    merged.metadata.preorderSendMonth = null;
    merged.metadata.preorder_send_month = null;
    merged.metadata.preorderSendMonthLabel = "";
  }

  return merged;
}

function structuredCloneCompatible(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
