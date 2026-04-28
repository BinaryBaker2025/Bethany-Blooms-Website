import {
  getProductFreshFlowerCategoryTokens,
  requiresFreshFlowerDeliveryContactForProduct,
} from "./freshFlowerDelivery.js";
import { getProductCardStockStatus } from "./stockStatus.js";

export const productHasVariants = (product = {}) =>
  Array.isArray(product?.variants) &&
  product.variants.some((variant) => {
    if (!variant || typeof variant !== "object") return false;
    return Boolean((variant.id || variant.label || variant.name || "").toString().trim());
  });

export const isGiftCardProduct = (product = {}) =>
  Boolean(product?.isGiftCard || product?.is_gift_card);

export const getDirectProductCartPrice = (product = {}) => {
  if (Number.isFinite(product?.numericPrice)) return product.numericPrice;
  const salePrice = Number(product?.sale_price ?? product?.salePrice);
  if (Number.isFinite(salePrice) && salePrice > 0) return salePrice;
  const price = Number(product?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
};

export const canDirectAddProductToCart = (product = {}) => {
  if (!product || typeof product !== "object") return false;
  if (!product.id) return false;
  if (product.isSubscriptionPlan || isGiftCardProduct(product)) return false;
  if (productHasVariants(product)) return false;
  const stockStatus = product.stockStatus || getProductCardStockStatus(product);
  if (product.isOutOfStock || stockStatus?.state === "out") return false;
  return Number.isFinite(getDirectProductCartPrice(product));
};

export const buildDirectProductCartItem = (product = {}) => {
  if (!canDirectAddProductToCart(product)) return null;
  const stockStatus = product.stockStatus || getProductCardStockStatus(product);
  const categoryTokens = getProductFreshFlowerCategoryTokens(product);
  const categoryLabel = (
    product.categoryLabels?.[0] ||
    product.categoryLabel ||
    product.categoryName ||
    product.category ||
    ""
  )
    .toString()
    .trim();

  return {
    id: product.id,
    name: product.name || product.title,
    price: getDirectProductCartPrice(product),
    itemType: "product",
    metadata: {
      type: "product",
      productId: product.id,
      productSlug: product.slug || null,
      variantId: null,
      variantLabel: null,
      variantPrice: null,
      categoryId: categoryTokens[0] || null,
      categoryLabel: categoryLabel || null,
      categoryTokens,
      stockStatus: stockStatus?.state || null,
      stockQuantity: Number.isFinite(stockStatus?.quantity)
        ? stockStatus.quantity
        : null,
      preorderSendMonth:
        stockStatus?.state === "preorder" ? product.preorderSendMonth || null : null,
      preorderSendMonthLabel:
        stockStatus?.state === "preorder"
          ? product.preorderSendMonthLabel || null
          : null,
      deliveryContactCandidate: requiresFreshFlowerDeliveryContactForProduct(product),
      isGiftCard: false,
    },
  };
};
