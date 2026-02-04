export const PAYMENT_METHODS = Object.freeze({
  PAYFAST: "payfast",
  EFT: "eft",
});

export const PAYMENT_APPROVAL_STATUSES = Object.freeze({
  NOT_REQUIRED: "not-required",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

export const EFT_BANK_DETAILS = Object.freeze({
  accountName: "Bethany Blooms",
  bankName: "Capitec Business",
  accountType: "Business",
  accountNumber: "1053441444",
  branchCode: "450105",
  referenceFormat: "Order #<orderNumber>",
  supportEmail: "admin@bethanyblooms.co.za",
});

export const EFT_PROOF_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const EFT_PROOF_ACCEPT = "application/pdf,image/*";

export const normalizePaymentMethod = (value) => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return normalized === PAYMENT_METHODS.EFT ? PAYMENT_METHODS.EFT : PAYMENT_METHODS.PAYFAST;
};

export const normalizePaymentApprovalStatus = (order = {}) => {
  const direct = (
    order?.paymentApprovalStatus ||
    order?.paymentApproval?.decision ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();
  if (Object.values(PAYMENT_APPROVAL_STATUSES).includes(direct)) return direct;
  return normalizePaymentMethod(order?.paymentMethod) === PAYMENT_METHODS.EFT
    ? PAYMENT_APPROVAL_STATUSES.PENDING
    : PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED;
};

export const buildOrderReference = (orderNumber) =>
  Number.isFinite(Number(orderNumber)) ? `Order #${Number(orderNumber)}` : "Order #<orderNumber>";
