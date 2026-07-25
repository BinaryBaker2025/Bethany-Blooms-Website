const isGiftCardItem = (item = {}) =>
  Boolean(item.metadata?.giftCard?.isGiftCard || item.metadata?.isGiftCard);

const isPreorderItem = (item = {}) => {
  if (isGiftCardItem(item)) return false;
  const status = (
    item.metadata?.stockStatus ||
    item.metadata?.stock_status ||
    item.stockStatus ||
    item.stock_status ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    status === "preorder" ||
    Boolean(
      item.metadata?.preorderSendMonth ||
        item.metadata?.preorder_send_month ||
        item.preorderSendMonth ||
        item.preorder_send_month,
    )
  );
};

const getItemType = (item = {}) =>
  item.metadata?.type === "workshop" || item.itemType === "workshop"
    ? "workshop"
    : "product";

export function getBuyNowCartConflict(
  items = [],
  { incomingType = "product", incomingPreorder = false, incomingGiftCard = false } = {},
) {
  if (!items.length) return "";
  const existingType = getItemType(items[0]);
  if (existingType !== incomingType) {
    return "You can only have workshops or products in your cart at one time. Clear your cart to switch.";
  }

  if (incomingType !== "product" || incomingGiftCard) return "";
  const comparableItems = items.filter(
    (item) => getItemType(item) === "product" && !isGiftCardItem(item),
  );
  if (!comparableItems.length) return "";

  const hasPreorder = comparableItems.some(isPreorderItem);
  const hasInStock = comparableItems.some((item) => !isPreorderItem(item));
  if ((incomingPreorder && hasInStock) || (!incomingPreorder && hasPreorder)) {
    return "Pre-order plants and in-stock products need separate orders so their dispatch dates stay accurate.";
  }
  return "";
}
