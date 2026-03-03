export const POS_SALE_STATUSES = Object.freeze({
  COMPLETED: "completed",
  PARTIALLY_VOIDED: "partially-voided",
  VOIDED: "voided",
});

const PARTIAL_EDIT_TYPES = new Set(["product", "pos-product"]);
const FULL_LINE_ONLY_TYPES = new Set([
  "event",
  "workshop",
  "class",
  "workshop-booking",
  "cut-flower-booking",
]);

export const parsePosDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const roundPosCurrency = (value) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
};

export const clampPosQuantity = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

export const formatPosDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const normalizePosSaleStatus = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === POS_SALE_STATUSES.VOIDED) return POS_SALE_STATUSES.VOIDED;
  if (normalized === POS_SALE_STATUSES.PARTIALLY_VOIDED) {
    return POS_SALE_STATUSES.PARTIALLY_VOIDED;
  }
  return POS_SALE_STATUSES.COMPLETED;
};

export const formatPosSaleStatusLabel = (value = "") => {
  const status = normalizePosSaleStatus(value);
  if (status === POS_SALE_STATUSES.PARTIALLY_VOIDED) return "Partially voided";
  if (status === POS_SALE_STATUSES.VOIDED) return "Voided";
  return "Completed";
};

export const getPosSaleStatusBadgeClass = (value = "") => {
  const status = normalizePosSaleStatus(value);
  if (status === POS_SALE_STATUSES.PARTIALLY_VOIDED) return "badge--stock-pending";
  if (status === POS_SALE_STATUSES.VOIDED) return "badge--muted";
  return "badge--success";
};

export const getPosSaleDateKey = (sale = {}) => {
  const explicit = (sale?.dateKey || "").toString().trim();
  if (explicit) return explicit;
  return formatPosDateKey(parsePosDateValue(sale?.createdAt || sale?.updatedAt));
};

export const getPosSaleOriginalSubtotal = (sale = {}) => {
  const explicit = Number(sale?.subtotal);
  if (Number.isFinite(explicit) && explicit >= 0) return roundPosCurrency(explicit);
  return roundPosCurrency(
    (Array.isArray(sale?.items) ? sale.items : []).reduce((sum, item) => {
      const quantity = Math.max(1, clampPosQuantity(item?.quantity, 1));
      return sum + roundPosCurrency(item?.price) * quantity;
    }, 0),
  );
};

export const getPosSaleDiscountAmount = (sale = {}) =>
  roundPosCurrency(sale?.discount?.amount ?? sale?.netDiscountAmount ?? 0);

export const getPosSaleGiftCardApplied = (sale = {}) =>
  roundPosCurrency(sale?.giftCardApplied ?? sale?.netGiftCardApplied ?? 0);

export const getPosSaleNetSubtotal = (sale = {}) =>
  roundPosCurrency(sale?.netSubtotal ?? getPosSaleOriginalSubtotal(sale));

export const getPosSaleNetDiscountAmount = (sale = {}) =>
  roundPosCurrency(sale?.netDiscountAmount ?? getPosSaleDiscountAmount(sale));

export const getPosSaleNetGiftCardApplied = (sale = {}) =>
  roundPosCurrency(sale?.netGiftCardApplied ?? getPosSaleGiftCardApplied(sale));

export const getPosSaleNetTotal = (sale = {}) => {
  const explicit = Number(sale?.netTotal);
  if (Number.isFinite(explicit) && explicit >= 0) return roundPosCurrency(explicit);
  const total = Number(sale?.total);
  if (Number.isFinite(total) && total >= 0) return roundPosCurrency(total);
  return roundPosCurrency(
    getPosSaleNetSubtotal(sale) -
      getPosSaleNetDiscountAmount(sale) -
      getPosSaleNetGiftCardApplied(sale),
  );
};

export const isGiftCardPosSale = (sale = {}) => {
  if (getPosSaleGiftCardApplied(sale) > 0) return true;
  if (Array.isArray(sale?.giftCardMatches) && sale.giftCardMatches.length > 0) return true;
  return (Array.isArray(sale?.items) ? sale.items : []).some((item) =>
    Boolean(item?.metadata?.giftCardLinked || item?.metadata?.giftCardId),
  );
};

export const normalizePosSaleItem = (item = {}, index = 0) => {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const quantity = Math.max(1, clampPosQuantity(item?.quantity, 1));
  const voidedQuantity = Math.min(quantity, Math.max(0, clampPosQuantity(item?.voidedQuantity, 0)));
  const lineId =
    (item?.lineId || "").toString().trim() ||
    `legacy-line-${index + 1}`;
  return {
    ...item,
    metadata,
    lineId,
    sourceId: (item?.sourceId || item?.id || "").toString().trim(),
    name: (item?.name || "Item").toString().trim() || "Item",
    type: (item?.type || metadata?.type || "").toString().trim().toLowerCase(),
    price: roundPosCurrency(item?.price ?? 0),
    quantity,
    voidedQuantity,
    netQuantity: Math.max(0, quantity - voidedQuantity),
  };
};

export const getNormalizedPosSaleItems = (sale = {}) =>
  (Array.isArray(sale?.items) ? sale.items : []).map((item, index) =>
    normalizePosSaleItem(item, index),
  );

export const canPosSaleLinePartialVoid = (item = {}) => {
  const normalized = normalizePosSaleItem(item);
  return PARTIAL_EDIT_TYPES.has(normalized.type) && normalized.netQuantity > 0;
};

export const canPosSaleLineWholeVoidOnly = (item = {}) => {
  const normalized = normalizePosSaleItem(item);
  return FULL_LINE_ONLY_TYPES.has(normalized.type) && normalized.netQuantity > 0;
};

export const canPosSaleLineBeVoided = (item = {}) =>
  canPosSaleLinePartialVoid(item) || canPosSaleLineWholeVoidOnly(item);

export const getPosSaleVoidSummary = (sale = {}) => {
  const summary = sale?.voidSummary && typeof sale.voidSummary === "object" ? sale.voidSummary : {};
  return {
    count: clampPosQuantity(summary.count, 0),
    status: normalizePosSaleStatus(summary.status || sale?.status),
    voidedSubtotal: roundPosCurrency(summary.voidedSubtotal ?? 0),
    voidedDiscountAmount: roundPosCurrency(summary.voidedDiscountAmount ?? 0),
    voidedGiftCardApplied: roundPosCurrency(summary.voidedGiftCardApplied ?? 0),
    voidedTotal: roundPosCurrency(summary.voidedTotal ?? 0),
    lastVoidedAt: parsePosDateValue(summary.lastVoidedAt),
    lastVoidedByUid: (summary.lastVoidedByUid || "").toString().trim(),
    lastVoidedByEmail: (summary.lastVoidedByEmail || "").toString().trim(),
  };
};
