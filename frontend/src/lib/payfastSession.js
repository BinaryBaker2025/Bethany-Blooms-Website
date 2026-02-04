export const PAYFAST_PENDING_KEY = "bethany-blooms-payfast-pending";

export function setPayfastPendingSession(payload = {}) {
  if (typeof window === "undefined") return;
  try {
    const nextPayload = {
      paymentReference: (payload.paymentReference || "").toString().trim() || null,
      createdAt: payload.createdAt || new Date().toISOString(),
    };
    window.sessionStorage.setItem(PAYFAST_PENDING_KEY, JSON.stringify(nextPayload));
  } catch (error) {
    console.warn("Unable to save PayFast session marker", error);
  }
}

export function getPayfastPendingSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PAYFAST_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("Unable to read PayFast session marker", error);
    return null;
  }
}

export function clearPayfastPendingSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PAYFAST_PENDING_KEY);
  } catch (error) {
    console.warn("Unable to clear PayFast session marker", error);
  }
}
