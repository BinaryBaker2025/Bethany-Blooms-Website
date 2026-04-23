export const ORDER_STATUSES = Object.freeze([
  "pending-payment-approval",
  "payment-rejected",
  "order-placed",
  "packing-order",
  "ready-to-collect-at-farm",
  "order-ready-for-shipping",
  "out-for-delivery",
  "delivered",
  "shipped",
  "completed",
  "cancelled",
]);

const ORDER_STATUS_LABELS = Object.freeze({
  "pending-payment-approval": "Pending Payment Approval",
  "payment-rejected": "Payment Rejected",
  "order-placed": "Order Placed",
  "packing-order": "Packing Order",
  "ready-to-collect-at-farm": "Ready to Collect at Farm",
  "order-ready-for-shipping": "Ready for Shipping",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
});

const ORDER_STATUS_ALIASES = Object.freeze({
  pending: "order-placed",
  processing: "packing-order",
  ready: "order-ready-for-shipping",
  fulfilled: "completed",
  "pending-payment": "pending-payment-approval",
  "ready-to-collect-at-farm": "ready-to-collect-at-farm",
});

export const normalizeOrderStatus = (status = "") => {
  const normalized = (status || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (!normalized) return "order-placed";

  const resolved = ORDER_STATUS_ALIASES[normalized] || normalized;

  return ORDER_STATUSES.includes(resolved) ? resolved : "order-placed";
};

export const formatOrderStatusLabel = (status = "") => {
  const normalized = normalizeOrderStatus(status);
  if (ORDER_STATUS_LABELS[normalized]) return ORDER_STATUS_LABELS[normalized];
  return normalized
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const isCollectionDeliveryMethod = (value = "") => {
  const normalized = (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  return [
    "collection",
    "pickup",
    "pick-up",
    "collect",
    "farm-collection",
    "farm-pickup",
  ].includes(normalized);
};
