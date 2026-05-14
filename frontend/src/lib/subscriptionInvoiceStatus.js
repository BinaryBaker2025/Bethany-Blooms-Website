import {
  PAYMENT_APPROVAL_STATUSES,
  PAYMENT_METHODS,
  normalizePaymentApprovalStatus,
  normalizePaymentMethod,
} from "./paymentMethods.js";

export const SUBSCRIPTION_INVOICE_STATUSES = Object.freeze({
  PENDING: "pending-payment",
  PAID: "paid",
  CANCELLED: "cancelled",
});

export function normalizeSubscriptionInvoiceStatus(value = "") {
  const normalized = (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (normalized === "paid" || normalized === "complete" || normalized === "completed") {
    return SUBSCRIPTION_INVOICE_STATUSES.PAID;
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return SUBSCRIPTION_INVOICE_STATUSES.CANCELLED;
  }
  return SUBSCRIPTION_INVOICE_STATUSES.PENDING;
}

export function isSubscriptionInvoiceSettled(
  invoice = {},
  { paymentMethod = "", paymentApprovalStatus = "" } = {},
) {
  const normalizedStatus = normalizeSubscriptionInvoiceStatus(invoice?.status || "");
  if (normalizedStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID) return true;
  if (normalizedStatus === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED) return false;

  const normalizedPaymentMethod = normalizePaymentMethod(
    paymentMethod || invoice?.paymentMethod || PAYMENT_METHODS.PAYFAST,
  );
  if (normalizedPaymentMethod !== PAYMENT_METHODS.EFT) return false;

  const normalizedApprovalStatus = normalizePaymentApprovalStatus({
    paymentMethod: normalizedPaymentMethod,
    paymentApprovalStatus:
      paymentApprovalStatus ||
      invoice?.paymentApprovalStatus ||
      invoice?.paymentApproval?.decision ||
      "",
    paymentApproval: invoice?.paymentApproval || null,
  });
  return normalizedApprovalStatus === PAYMENT_APPROVAL_STATUSES.APPROVED;
}
