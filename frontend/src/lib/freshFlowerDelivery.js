export const FRESH_FLOWER_DELIVERY_NOTE =
  "A Bethany Blooms team member will contact you after checkout to confirm delivery details for fresh flowers and blooming stems.";
export const FRESH_FLOWER_DELIVERY_WHATSAPP_NOTE =
  "For a faster response, you can also WhatsApp Bethany Blooms and include your order number and full name.";
export const FRESH_FLOWER_DELIVERY_WHATSAPP_PREFILL =
  "Hi Bethany Blooms, I need help with delivery. Order number: [ORDER NUMBER]. Full name: [FULL NAME].";

const FRESH_FLOWER_INCLUDE_TOKENS = Object.freeze([
  "cutflower",
  "cutflowers",
  "bloomingstem",
  "bloomingstems",
  "freshflower",
  "freshflowers",
]);

const SUBSCRIPTION_TOKEN = "subscription";

export const normalizeFreshFlowerCategoryToken = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const flattenCategoryValues = (input = []) => {
  const values = Array.isArray(input) ? input : [input];
  return values.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
};

export const collectFreshFlowerCategoryTokens = (values = []) => {
  const seen = new Set();
  const tokens = [];
  flattenCategoryValues(values).forEach((value) => {
    const token = normalizeFreshFlowerCategoryToken(value);
    if (!token || seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  });
  return tokens;
};

const hasSubscriptionCategoryToken = (tokens = []) =>
  (Array.isArray(tokens) ? tokens : []).some((token) => token.includes(SUBSCRIPTION_TOKEN));

export const requiresFreshFlowerDeliveryContactForCategoryTokens = (tokens = []) => {
  const normalizedTokens = collectFreshFlowerCategoryTokens(tokens);
  if (!normalizedTokens.length) return false;
  if (hasSubscriptionCategoryToken(normalizedTokens)) return false;
  return normalizedTokens.some((token) =>
    FRESH_FLOWER_INCLUDE_TOKENS.some((includedToken) => token.includes(includedToken)),
  );
};

export const getProductFreshFlowerCategoryTokens = (product = {}) => {
  if (!product || typeof product !== "object") return [];
  const values = [];
  if (Array.isArray(product.categoryTokens)) values.push(...product.categoryTokens);
  if (Array.isArray(product.categoryKeys)) values.push(...product.categoryKeys);
  if (Array.isArray(product.category_ids)) values.push(...product.category_ids);
  if (Array.isArray(product.categoryIds)) values.push(...product.categoryIds);
  if (Array.isArray(product.categoryLabels)) values.push(...product.categoryLabels);
  if (product.categoryId) values.push(product.categoryId);
  if (product.categorySlug) values.push(product.categorySlug);
  if (product.categoryName) values.push(product.categoryName);
  if (product.category) values.push(product.category);
  return collectFreshFlowerCategoryTokens(values);
};

export const requiresFreshFlowerDeliveryContactForProduct = (product = {}) => {
  if (!product || typeof product !== "object") return false;
  if (product.isGiftCard || product.is_gift_card) return false;
  return requiresFreshFlowerDeliveryContactForCategoryTokens(
    getProductFreshFlowerCategoryTokens(product),
  );
};

export const getCartItemFreshFlowerCategoryTokens = (item = {}, fallbackProduct = null) => {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const values = [];
  if (Array.isArray(metadata.categoryTokens)) values.push(...metadata.categoryTokens);
  if (metadata.categoryId) values.push(metadata.categoryId);
  if (metadata.categoryLabel) values.push(metadata.categoryLabel);
  if (metadata.category) values.push(metadata.category);
  if (metadata.categorySlug) values.push(metadata.categorySlug);
  if (metadata.productCategory) values.push(metadata.productCategory);
  if (fallbackProduct && typeof fallbackProduct === "object") {
    values.push(...getProductFreshFlowerCategoryTokens(fallbackProduct));
  }
  return collectFreshFlowerCategoryTokens(values);
};

export const requiresFreshFlowerDeliveryContactForCartItem = (
  item = {},
  fallbackProduct = null,
) => {
  if (!item || item?.metadata?.type !== "product") return false;
  if (item?.metadata?.giftCard?.isGiftCard || item?.metadata?.isGiftCard) return false;
  if (item?.metadata?.deliveryContactCandidate === true) return true;
  return requiresFreshFlowerDeliveryContactForCategoryTokens(
    getCartItemFreshFlowerCategoryTokens(item, fallbackProduct),
  );
};
