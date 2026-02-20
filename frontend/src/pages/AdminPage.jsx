import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import Reveal from "../components/Reveal.jsx";
import { read, utils, writeFile } from "xlsx";
import { useAdminData } from "../context/AdminDataContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { getFirebaseFunctions } from "../lib/firebase.js";
import { getFirebaseDb } from "../lib/firebase.js";
import {
  formatPreorderSendMonth,
  getProductPreorderSendMonth,
  normalizePreorderSendMonth,
} from "../lib/preorder.js";
import {
  PAYMENT_APPROVAL_STATUSES,
  PAYMENT_METHODS,
  normalizePaymentApprovalStatus as normalizeOrderPaymentApprovalStatus,
  normalizePaymentMethod as normalizeOrderPaymentMethod,
} from "../lib/paymentMethods.js";
import { SA_PROVINCES, formatShippingAddress } from "../lib/shipping.js";
import { getStockStatus, STOCK_LOW_THRESHOLD } from "../lib/stockStatus.js";
import {
  DEFAULT_SLOT_CAPACITY,
  AUTO_REPEAT_DAYS,
  createDateGroup,
  createTimeSlot,
} from "./admin/constants.js";
export { AdminUsersView } from "./admin/AdminUsersView.jsx";

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div className="modal is-active admin-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal__content">
        <button className="modal__close" type="button" onClick={onCancel} aria-label="Close">
          Ã—
        </button>
        <h3 className="modal__title" id="confirm-title">
          {title}
        </h3>
        <p>{message}</p>
        <div className="admin-form__actions" style={{ marginTop: "1.5rem" }}>
          <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn--primary" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Workingâ€¦" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const INITIAL_PRODUCT_FORM = {
  title: "",
  sku: "",
  price: "",
  salePrice: "",
  slug: "",
  stockStatus: "in_stock",
  preorderSendMonth: "",
  stockQuantity: "",
  categoryIds: [],
  tagIds: [],
  shortDescription: "",
  longDescription: "",
  mainImage: "",
  galleryImages: [],
  videoEmbed: "",
  sunlight: "",
  soilType: "",
  watering: "",
  climate: "",
  plantingDepth: "",
  plantingSpacing: "",
  bestPlantingTime: "",
  bloomPeriod: "",
  flowerColor: "",
  matureHeight: "",
  pestIssues: "",
  diseaseInfo: "",
  propagation: "",
  companions: "",
  metaTitle: "",
  metaDescription: "",
  metaKeywords: "",
  shippingWeight: "",
  dimensions: {
    width: "",
    height: "",
    depth: "",
  },
  countryOfOrigin: "",
  deliveryInfo: "",
  relatedProductIds: [],
  upsellProductIds: [],
  crossSellProductIds: [],
  status: "live",
  hasVariants: false,
  variants: [],
  featured: false,
  isGiftCard: false,
  giftCardExpiryDays: "365",
  giftCardTerms:
    "Gift card is redeemable for selected Bethany Blooms services or products. Non-refundable and not exchangeable for cash. Valid only until the expiry date shown.",
  giftCardOptions: [],
};

const SUBSCRIPTION_PLAN_TIERS = Object.freeze([
  { value: "weekly", label: "Weekly" },
  { value: "bi-weekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
]);

const SUBSCRIPTION_PLAN_STEM_OPTIONS = Object.freeze([16, 32]);

const INITIAL_SUBSCRIPTION_PLAN_FORM = {
  name: "",
  description: "",
  categoryId: "",
  tier: "weekly",
  stems: "16",
  monthlyAmount: "",
  status: "live",
  image: "",
};

const INITIAL_WORKSHOP_FORM = {
  title: "",
  description: "",
  scheduledFor: "",
  price: "",
  location: "",
  image: "",
  status: "live",
  whatToExpect: "",
  bookingPricing: "",
  goodToKnow: "",
  cancellations: "",
  groupsInfo: "",
  careInfo: "",
  whyPeopleLove: "",
  ctaNote: "",
  dateGroups: [createDateGroup()],
  repeatWeekdays: false,
};

const createEventTimeSlot = () => ({
  id: `event-time-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  time: "",
  endTime: "",
  label: "",
});

const createCutFlowerOption = () => ({
  id: `class-option-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  label: "",
  price: "",
  minAttendees: "",
  isExtra: false,
});

const createProductVariant = () => ({
  id: `product-variant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  label: "",
  price: "",
  quantity: "",
});

const EVENT_REPEAT_WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const INITIAL_EVENT_FORM = {
  title: "",
  description: "",
  location: "",
  date: "",
  timeSlots: [createEventTimeSlot()],
  image: "",
  workshopId: "",
  status: "live",
  repeatWeekly: false,
  repeatDays: [],
};

const INITIAL_CUT_FLOWER_BOOKING = {
  customerName: "",
  email: "",
  phone: "",
  attendeeCount: "1",
  attendeeSelections: [],
  occasion: "",
  location: "",
  budget: "",
  date: "",
  time: "",
  status: "new",
  notes: "",
};

const CUT_FLOWER_STATUS_OPTIONS = ["new", "proposal-sent", "confirmed", "in-progress", "fulfilled", "cancelled"];

const INITIAL_CUT_FLOWER_CLASS_FORM = {
  title: "",
  description: "",
  location: "",
  price: "",
  capacity: "",
  capacityLimited: false,
  image: "",
  date: "",
  timeSlots: [createEventTimeSlot()],
  options: [createCutFlowerOption()],
  status: "live",
  repeatWeekly: false,
  repeatDays: [],
};
const ORDER_STATUSES = [
  "pending-payment-approval",
  "payment-rejected",
  "order-placed",
  "packing-order",
  "order-ready-for-shipping",
  "shipped",
  "completed",
  "cancelled",
];
const CREATE_ORDER_FILTER_DEFAULTS = Object.freeze({
  categoryId: "all",
  stock: "all",
  minPrice: "",
  maxPrice: "",
  sort: "name-asc",
});

const parseNumber = (value, fallback = null) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSubscriptionCategoryToken = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const looksLikeSubscriptionCategory = (value = "") => {
  const token = normalizeSubscriptionCategoryToken(value);
  return Boolean(token && token.includes("subscription"));
};

const normalizeGiftCardExpiryDays = (value, fallback = 365) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(1825, Math.floor(parsed)));
};

const buildAdminOrderCartKey = ({ sourceId, variantId }) =>
  ["admin-order", sourceId, variantId || "base"].join(":");

const normalizeOrderStatus = (status) => {
  const normalized = (status || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (!normalized) return "order-placed";
  const legacyMap = {
    pending: "order-placed",
    processing: "packing-order",
    ready: "order-ready-for-shipping",
    fulfilled: "completed",
    "pending-payment": "pending-payment-approval",
  };
  return legacyMap[normalized] || normalized;
};

const formatOrderStatusLabel = (status) =>
  (status || "")
    .toString()
    .trim()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const DELIVERY_METHODS = ["company", "courier"];
const ORDER_DETAIL_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "customer-info", label: "Customer Info" },
  { id: "order-info", label: "Order Info" },
  { id: "delivery", label: "Delivery" },
  { id: "communication", label: "Communication" },
]);
const EMPTY_SHIPPING_ADDRESS = Object.freeze({
  street: "",
  suburb: "",
  city: "",
  province: "",
  postalCode: "",
});
const ADMIN_PAGE_SIZE = 100;
const MAX_FEATURED_PRODUCTS = 4;
const MAX_PRODUCT_IMAGES = 6;
const bookingDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});
const timeOnlyFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeStyle: "short",
});
const moneyFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

const normalizeShippingAddressDraft = (value = {}) => ({
  street: (value?.street || value?.streetAddress || "").toString().trim(),
  suburb: (value?.suburb || "").toString().trim(),
  city: (value?.city || "").toString().trim(),
  province: (value?.province || "").toString().trim(),
  postalCode: (value?.postalCode || value?.postcode || "").toString().trim(),
});

const parseShippingAddressFromString = (value = "") => {
  const normalized = (value || "").toString().trim();
  if (!normalized) return { ...EMPTY_SHIPPING_ADDRESS };

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return { ...EMPTY_SHIPPING_ADDRESS };
  if (parts.length >= 5) {
    return normalizeShippingAddressDraft({
      street: parts[0],
      suburb: parts[1],
      city: parts[2],
      province: parts[3],
      postalCode: parts.slice(4).join(", "),
    });
  }

  const [street = "", suburb = "", city = "", provinceAndPostal = ""] = parts;
  let province = provinceAndPostal;
  let postalCode = "";
  const provinceMatch = provinceAndPostal.match(/^(.*?)(?:\s+|,\s*)(\d{4})$/);
  if (provinceMatch) {
    province = (provinceMatch[1] || "").toString().trim();
    postalCode = (provinceMatch[2] || "").toString().trim();
  }
  return normalizeShippingAddressDraft({
    street,
    suburb,
    city,
    province,
    postalCode,
  });
};

const resolveOrderDeliveryAddressDraft = (order = {}) => {
  const structured = normalizeShippingAddressDraft(order?.shippingAddress || {});
  const hasStructuredValue = Object.values(structured).some((value) => value);
  if (hasStructuredValue) return structured;
  return parseShippingAddressFromString(order?.customer?.address || "");
};

const isShippingAddressComplete = (address = {}) => {
  const normalized = normalizeShippingAddressDraft(address);
  return Boolean(
    normalized.street &&
    normalized.suburb &&
    normalized.city &&
    normalized.province &&
    /^\d{4}$/.test(normalized.postalCode),
  );
};

const resolveOrderSubtotalAmount = (order = {}) => {
  const explicitSubtotal = Number(order?.subtotal);
  if (Number.isFinite(explicitSubtotal) && explicitSubtotal >= 0) {
    return explicitSubtotal;
  }
  return (Array.isArray(order?.items) ? order.items : []).reduce((sum, item) => {
    const price = Number(item?.price ?? 0);
    const quantity = Number(item?.quantity ?? 1);
    if (!Number.isFinite(price)) return sum;
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    return sum + price * safeQuantity;
  }, 0);
};

const IconPlus = ({ title = "Add", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IconEdit = ({ title = "Edit", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M12.5 6.5l5 5" />
    <path d="M5 17.5l1.5-5 8-8a1.5 1.5 0 0 1 2.1 0l1.9 1.9a1.5 1.5 0 0 1 0 2.1l-8 8-5 1.5Z" />
  </svg>
);

const IconTrash = ({ title = "Delete", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconCopy = ({ title = "Copy link", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <rect x="9" y="9" width="11" height="11" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconImage = ({ title = "Image", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-4-4-4 5-3-3-5 6" />
  </svg>
);

const IconStar = ({ title = "Featured", filled = false, ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.9l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8Z" />
  </svg>
);

const IconCheck = ({ title = "Success", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value.toDate === "function") {
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

const parseOptionalNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseMinAttendees = (option, label) => {
  const raw =
    option?.minAttendees ??
    option?.minimumAttendees ??
    option?.minPeople ??
    option?.minGuests;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  if (!label) return null;
  const normalized = label.toLowerCase();
  const match = normalized.match(/(\d+)\s*\+|(\d+)\s*(:or|and)\s*more|minimum\s*(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1] || match[2] || match[3]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseIsExtra = (option, label) => {
  if (option.isExtra || option.extra || option.isAddOn) return true;
  if (!label) return false;
  return /extra|add[- ]on|addon/.test(label.toLowerCase());
};

const formatOptionLabel = (label, price) => {
  if (typeof label !== "string" || !label.trim()) return "Option";
  if (Number.isFinite(price)) return `${label} Â· R${price}`;
  return label;
};

const buildAttendeeSelections = (count, selections, optionValues, fallbackValue) => {
  const normalized = [];
  for (let i = 0; i < count; i += 1) {
    const value = selections?.[i];
    normalized.push(optionValues.has(value) ? value : fallbackValue);
  }
  return normalized;
};

const selectionsMatch = (left = [], right = []) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const formatDateInput = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatTimeInput = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

const combineDateAndTime = (dateInput, timeInput) => {
  if (!dateInput) return null;
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return null;
  if (timeInput) {
    const [hours, minutes] = timeInput.split(":").map(Number);
    if (Number.isFinite(hours)) base.setHours(hours);
    if (Number.isFinite(minutes)) base.setMinutes(minutes);
    base.setSeconds(0, 0);
  }
  return base;
};

const formatTimeValue = (value) => {
  if (!value) return "";
  if (value instanceof Date) return timeOnlyFormatter.format(value);
  if (typeof value !== "string") return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours)) return value;
  const date = new Date();
  date.setHours(hours);
  date.setMinutes(Number.isFinite(minutes) ? minutes : 0);
  date.setSeconds(0, 0);
  return timeOnlyFormatter.format(date);
};

const formatTimeRange = (startTime, endTime) => {
  const startLabel = formatTimeValue(startTime);
  if (!startLabel) return "";
  const endLabel = formatTimeValue(endTime);
  if (!endLabel) return startLabel;
  return `${startLabel} â€“ ${endLabel}`;
};

const formatRepeatLabel = (repeatDays) => {
  const days = Array.isArray(repeatDays) ? repeatDays : [];
  const normalized = days.map((day) => Number(day)).filter((day) => Number.isFinite(day));
  const labels = normalized
    .map((day) => EVENT_REPEAT_WEEKDAYS.find((entry) => entry.value === day).label)
    .filter(Boolean);
  if (!labels.length) return "";
  return `Every ${labels.join(", ")}`;
};

const buildTimeSummary = (timeSlots) => {
  const slots = Array.isArray(timeSlots) ? timeSlots : [];
  const labels = slots
    .filter((slot) => slot.time)
    .map((slot) => {
      const formattedTime = formatTimeRange(slot.time, slot.endTime);
      if (!formattedTime) return "";
      return slot.label ? `${slot.label} (${formattedTime})` : formattedTime;
    })
    .filter(Boolean);
  return labels.length ? labels.join(" Â· ") : "";
};

const formatPriceLabel = (value) => {
  if (value === undefined || value === null) return "-";
  if (typeof value === "number") return moneyFormatter.format(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return moneyFormatter.format(numeric);
  return value;
};

const normalizeSubscriptionPlanTierValue = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "biweekly") return "bi-weekly";
  return SUBSCRIPTION_PLAN_TIERS.some((entry) => entry.value === normalized) ? normalized : "";
};

const normalizeSubscriptionPlanStemsValue = (value = "") => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return SUBSCRIPTION_PLAN_STEM_OPTIONS.includes(parsed) ? parsed : 0;
};

const resolveSubscriptionPlanMonthlyAmount = (value = "") => {
  if (value === undefined || value === null || value === "") return null;
  const normalizedValue =
    typeof value === "number" ?
       value
      : Number(String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, "."));
  const numericAmount = Number(normalizedValue);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
  return Number(numericAmount.toFixed(2));
};

const formatSubscriptionPlanTierLabel = (tier = "") => {
  const normalizedTier = normalizeSubscriptionPlanTierValue(tier);
  const matched = SUBSCRIPTION_PLAN_TIERS.find((entry) => entry.value === normalizedTier);
  return matched?.label || "Monthly";
};

const SUBSCRIPTION_STATUS_OPTIONS = Object.freeze([
  "active",
  "paused",
  "cancelled",
]);

const SUBSCRIPTION_INVOICE_STATUS_OPTIONS = Object.freeze([
  "pending-payment",
  "paid",
  "cancelled",
]);

const SUBSCRIPTION_PAYMENT_METHOD_OPTIONS = Object.freeze([
  PAYMENT_METHODS.PAYFAST,
  PAYMENT_METHODS.EFT,
]);
const SUBSCRIPTION_INVOICE_TYPES = Object.freeze({
  CYCLE: "cycle",
  TOPUP: "topup",
});
const SUBSCRIPTION_CHARGE_MODES = Object.freeze([
  { value: "one-time", label: "One-time" },
  { value: "recurring", label: "Recurring" },
]);
const SUBSCRIPTION_CHARGE_BASES = Object.freeze([
  { value: "flat", label: "Flat" },
  { value: "per-delivery", label: "Per delivery" },
]);
const SUBSCRIPTION_OPS_MANAGE_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "billing", label: "Billing" },
  { id: "plan-charges", label: "Plan & charges" },
]);
const SUBSCRIPTION_OPS_MANAGE_DEFAULT_TAB = SUBSCRIPTION_OPS_MANAGE_TABS[0].id;

const SUBSCRIPTION_EXPECTED_DELIVERIES_BY_TIER = Object.freeze({
  weekly: 4,
  "bi-weekly": 2,
  monthly: 1,
});

const normalizeSubscriptionOpsStatus = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return SUBSCRIPTION_STATUS_OPTIONS.includes(normalized) ? normalized : "active";
};

const normalizeSubscriptionOpsInvoiceStatus = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return SUBSCRIPTION_INVOICE_STATUS_OPTIONS.includes(normalized) ? normalized : "pending-payment";
};

const normalizeSubscriptionInvoiceType = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_INVOICE_TYPES.TOPUP) return SUBSCRIPTION_INVOICE_TYPES.TOPUP;
  return SUBSCRIPTION_INVOICE_TYPES.CYCLE;
};

const formatSubscriptionInvoiceTypeLabel = (value = "") =>
  normalizeSubscriptionInvoiceType(value) === SUBSCRIPTION_INVOICE_TYPES.TOPUP ? "Top-up" : "Cycle";

const normalizeSubscriptionChargeMode = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return normalized === "recurring" ? "recurring" : "one-time";
};

const normalizeSubscriptionChargeBasis = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return normalized === "per-delivery" ? "per-delivery" : "flat";
};

const normalizeSubscriptionOpsPaymentMethod = (value = "") =>
  normalizeOrderPaymentMethod(value || PAYMENT_METHODS.PAYFAST);

const formatSubscriptionPaymentMethodLabel = (value = "") =>
  normalizeSubscriptionOpsPaymentMethod(value) === PAYMENT_METHODS.EFT ? "EFT" : "PayFast";

const normalizeSubscriptionOpsPaymentApprovalStatus = (value = "", paymentMethod = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === PAYMENT_APPROVAL_STATUSES.PENDING) return PAYMENT_APPROVAL_STATUSES.PENDING;
  if (normalized === PAYMENT_APPROVAL_STATUSES.APPROVED) return PAYMENT_APPROVAL_STATUSES.APPROVED;
  if (normalized === PAYMENT_APPROVAL_STATUSES.REJECTED) return PAYMENT_APPROVAL_STATUSES.REJECTED;
  return normalizeSubscriptionOpsPaymentMethod(paymentMethod) === PAYMENT_METHODS.EFT
    ? PAYMENT_APPROVAL_STATUSES.PENDING
    : PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED;
};

const formatSubscriptionPaymentApprovalLabel = (value = "", paymentMethod = "") => {
  const normalized = normalizeSubscriptionOpsPaymentApprovalStatus(value, paymentMethod);
  if (normalized === PAYMENT_APPROVAL_STATUSES.APPROVED) return "Approved";
  if (normalized === PAYMENT_APPROVAL_STATUSES.REJECTED) return "Rejected";
  if (normalized === PAYMENT_APPROVAL_STATUSES.PENDING) return "Pending admin approval";
  return "Not required";
};

const normalizeCycleMonthValue = (value = "") => {
  const normalized = (value || "").toString().trim();
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}`;
};

const getCurrentJohannesburgCycleMonth = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const normalized = normalizeCycleMonthValue(`${year}-${month}`);
  if (normalized) return normalized;
  const fallback = new Date();
  return `${fallback.getUTCFullYear()}-${String(fallback.getUTCMonth() + 1).padStart(2, "0")}`;
};

const formatCycleMonthLabel = (monthKey = "") => {
  const normalized = normalizeCycleMonthValue(monthKey);
  if (!normalized) return monthKey || "Unknown cycle";
  const [yearText, monthText] = normalized.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
  return date.toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatSubscriptionStatusLabel = (status = "") => {
  const normalized = normalizeSubscriptionOpsStatus(status);
  return normalized.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatSubscriptionInvoiceStatusLabel = (status = "") => {
  const normalized = normalizeSubscriptionOpsInvoiceStatus(status);
  return normalized.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const resolveExpectedCycleDeliveries = (tier = "") => {
  const normalized = normalizeSubscriptionPlanTierValue(tier);
  return SUBSCRIPTION_EXPECTED_DELIVERIES_BY_TIER[normalized] || 0;
};

const normalizeSubscriptionMondaySlotValue = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return ["first", "second", "third", "fourth", "last"].includes(normalized) ? normalized : "";
};

const formatSubscriptionMondaySlotLabel = (slot = "") => {
  const normalized = normalizeSubscriptionMondaySlotValue(slot);
  if (normalized === "first") return "1st Monday";
  if (normalized === "second") return "2nd Monday";
  if (normalized === "third") return "3rd Monday";
  if (normalized === "fourth") return "4th Monday";
  if (normalized === "last") return "Last Monday";
  return "";
};

const normalizeSubscriptionMondaySlotsForTier = (tier = "", values = []) => {
  const normalizedTier = normalizeSubscriptionPlanTierValue(tier);
  if (!normalizedTier) return [];
  if (normalizedTier === "weekly") return ["first", "second", "third", "fourth", "last"];
  const required = normalizedTier === "bi-weekly" ? 2 : 1;
  const seen = new Set();
  const slots = (Array.isArray(values) ? values : [])
    .map((entry) => normalizeSubscriptionMondaySlotValue(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
  const defaults = normalizedTier === "bi-weekly" ? ["first", "third"] : ["first"];
  defaults.forEach((entry) => {
    if (slots.length >= required) return;
    if (!seen.has(entry)) {
      seen.add(entry);
      slots.push(entry);
    }
  });
  return slots.slice(0, required);
};

const normalizeIsoDateValue = (value = "") => {
  const normalized = (value || "").toString().trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const compareIsoDateValues = (left = "", right = "") => {
  const leftValue = normalizeIsoDateValue(left);
  const rightValue = normalizeIsoDateValue(right);
  if (!leftValue && !rightValue) return 0;
  if (!leftValue) return 1;
  if (!rightValue) return -1;
  return leftValue.localeCompare(rightValue);
};

const formatSubscriptionDeliveryDateLabel = (value = "") => {
  const normalized = normalizeIsoDateValue(value);
  if (!normalized) return "";
  const [yearText, monthText, dayText] = normalized.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), 12, 0, 0));
  return date.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatSubscriptionDeliveryDateList = (values = []) =>
  (Array.isArray(values) ? values : [])
    .map((entry) => formatSubscriptionDeliveryDateLabel(entry))
    .filter(Boolean)
    .join(", ");

const listSubscriptionMondaysForCycle = (cycleMonth = "") => {
  const normalizedCycle = normalizeCycleMonthValue(cycleMonth);
  if (!normalizedCycle) return [];
  const [yearText, monthText] = normalizedCycle.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mondays = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (date.getUTCDay() !== 1) continue;
    mondays.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return mondays;
};

const resolveSubscriptionCycleDeliveryDates = ({ tier = "", slots = [], cycleMonth = "" } = {}) => {
  const normalizedTier = normalizeSubscriptionPlanTierValue(tier);
  const mondays = listSubscriptionMondaysForCycle(cycleMonth);
  if (!normalizedTier || !mondays.length) return [];
  if (normalizedTier === "weekly") return mondays;
  const mondayMap = {
    first: mondays[0] || "",
    second: mondays[1] || "",
    third: mondays[2] || "",
    fourth: mondays[3] || "",
    last: mondays[mondays.length - 1] || "",
  };
  return Array.from(
    new Set(
      normalizeSubscriptionMondaySlotsForTier(normalizedTier, slots)
        .map((slot) => normalizeIsoDateValue(mondayMap[slot] || ""))
        .filter(Boolean),
    ),
  ).sort((a, b) => compareIsoDateValues(a, b));
};

const resolveSubscriptionDisplayPlanName = (entry = {}) => {
  const direct = (entry?.planName || "").toString().trim();
  if (direct) return direct;
  const planName = (entry?.subscriptionPlan?.name || "").toString().trim();
  if (planName) return planName;
  const productName = (entry?.subscriptionProduct?.productName || "").toString().trim();
  const variantLabel = (entry?.subscriptionProduct?.variantLabel || "").toString().trim();
  if (productName && variantLabel) return `${productName} - ${variantLabel}`;
  if (productName) return productName;
  return "Subscription";
};

const csvEscape = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
};

const downloadCsvFile = (rows = [], fileName = "export.csv") => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!Array.isArray(rows) || rows.length === 0) return;
  const csv = rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const slugifyId = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const normalizeCreateOrderCategoryToken = (value = "") =>
  value.toString().trim().toLowerCase();

const buildCreateOrderCategoryTokens = (value = "") => {
  const normalized = normalizeCreateOrderCategoryToken(value);
  if (!normalized) return [];
  const slug = slugifyId(normalized);
  return Array.from(new Set([normalized, slug].filter(Boolean)));
};

const generateSku = (title = "", slug = "") => {
  const base = slugifyId(title || slug);
  if (base) return base.toUpperCase();
  return `PROD-${Date.now().toString(36).toUpperCase()}`;
};

const stripSheetLinkLabel = (value = "") =>
  value.toString().replace(/\s+link\s*$/i, "").trim();

const stripHtml = (value = "") =>
  value
    .toString()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sanitizePlainText = (value = "") => {
  const raw = value.toString();
  if (!raw) return "";
  const withLineBreaks = raw
    .replace(/<\s*br\s*\/>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");
  return withLineBreaks.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};

const parseSheetPriceValue = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  const cleaned = String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  if (!cleaned) return "";
  const parsed = Number(cleaned);
  if (Number.isFinite(parsed)) {
    return Math.round(parsed * 100) / 100;
  }
  return String(value).trim();
};

const parseSheetQuantityValue = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned) return "";
  const parsed = Number(cleaned);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.floor(parsed));
  }
  return "";
};

const getPrimarySession = (workshop) => {
  if (!Array.isArray(workshop.sessions)) return null;
  if (workshop.primarySessionId) {
    return (
      workshop.sessions.find(
        (session) => session.id === workshop.primarySessionId
      ) || null
    );
  }
  return workshop.sessions[0] || null;
};

const getSessionLabel = (session) => {
  if (!session) return "No session";
  if (session.label) return session.label;
  const dateTime = combineDateAndTime(session.date, session.time);
  if (!dateTime) return session.time || "Session";
  return bookingDateFormatter.format(dateTime);
};

function useUploadAsset(storage) {
  return async function uploadAsset(file, folder) {
    if (!storage) throw new Error("Firebase Storage is not configured.");
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
    const objectPath = `${folder}/${Date.now()}-${sanitizedName}`;
    const storageRef = ref(storage, objectPath);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  };
}

export function AdminDashboardView() {
  usePageMetadata({
    title: "Admin Â· Dashboard",
    description:
      "Quick stats for Bethany Blooms inventory, workshops, and orders.",
  });
  const { user } = useAuth();
  const {
    products,
    workshops,
    bookings,
    orders,
    inventoryLoading,
    inventoryError,
  } = useAdminData();

  const stats = useMemo(() => {
    const upcomingWorkshops = workshops.filter((workshop) => {
      const primary = getPrimarySession(workshop);
      if (!primary) return false;
      const parsed =
        combineDateAndTime(primary.date, primary.time) ||
        parseDateValue(primary.start);
      return parsed ? parsed >= new Date() : false;
    }).length;

    const confirmedBookings = bookings.length;
    const openOrders = orders.filter(
      (order) =>
        normalizeOrderStatus(order.status) !== "completed" &&
        normalizeOrderStatus(order.status) !== "cancelled"
    ).length;
    const totalProducts = products.length;

    return [
      {
        id: "products",
        label: "Products",
        value: totalProducts,
        hint: "Live items",
      },
      {
        id: "workshops",
        label: "Workshops",
        value: upcomingWorkshops,
        hint: "Upcoming",
      },
      {
        id: "bookings",
        label: "Bookings",
        value: confirmedBookings,
        hint: "Latest 30 days",
      },
      {
        id: "orders",
        label: "Open Orders",
        value: openOrders,
        hint: "Needs attention",
      },
    ];
  }, [bookings.length, orders, products.length, workshops]);

  const quickLinks = [
    { to: "/admin/orders", title: "Orders", body: "Manage payments" },
    {
      to: "/admin/products",
      title: "Products",
      body: "Upload imagery & pricing",
    },
    {
      to: "/admin/users",
      title: "Users",
      body: "Roles, profiles & addresses",
    },
    {
      to: "/admin/subscription-ops",
      title: "Subscription Ops",
      body: "Delivery-ready roster",
    },
    {
      to: "/admin/subscriptions",
      title: "Subscription Plans",
      body: "Manage plan catalogue",
    },
    {
      to: "/admin/workshops",
      title: "Workshops",
      body: "Session slots & bookings",
    },
    {
      to: "/admin/pos",
      title: "POS",
      body: "In-store checkout & cash-up",
    },
    { to: "/admin/reports", title: "Reports", body: "Sales and performance" },
    { to: "/admin/profile", title: "Profile", body: "Account & sign out" },
  ];

  const upcomingSessions = useMemo(() => {
    const sessions = [];
    workshops.forEach((workshop) => {
      (workshop.sessions || []).forEach((session) => {
        const parsed =
          combineDateAndTime(session.date, session.time) ||
          parseDateValue(session.start);
        if (!parsed) return;
        sessions.push({
          id: `${workshop.id}-${session.id}`,
          workshop,
          session,
          date: parsed,
        });
      });
    });
    return sessions
      .filter((entry) => entry.date >= new Date())
      .sort((a, b) => a.date - b.date)
      .slice(0, 4);
  }, [workshops]);

  const recentOrders = useMemo(() => orders.slice(0, 4), [orders]);

  return (
    <div className="admin-dashboard">
      <Reveal as="section" className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <h2>Hi {user.email || "admin"}</h2>
            <p className="admin-panel__note">
              Monitor what is live before jumping into edits.
            </p>
          </div>
        </div>
        <div className="admin-stats-grid">
          {stats.map((stat) => (
            <div key={stat.id} className="admin-stat-card">
              <p className="admin-stat-card__label">{stat.label}</p>
              <p className="admin-stat-card__value">{stat.value}</p>
              <p className="admin-stat-card__hint">{stat.hint}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className="admin-panel" delay={60}>
        <h3>Quick Links</h3>
        <div className="admin-quick-links">
          {quickLinks.map((link) => (
            <Link key={link.to} className="admin-quick-card" to={link.to}>
              <span>{link.title}</span>
              <p>{link.body}</p>
            </Link>
          ))}
        </div>
      </Reveal>

      <div className="admin-panel__content">
        <Reveal as="section" className="admin-panel" delay={90}>
          <div className="admin-panel__header">
            <h3>Upcoming sessions</h3>
            {inventoryLoading && (
              <span className="badge badge--muted">Syncingâ€¦</span>
            )}
          </div>
          {upcomingSessions.length > 0 ? (
            <ul className="admin-panel__list">
              {upcomingSessions.map((entry) => (
                <li key={entry.id} className="admin-session-card">
                  <p>
                    <strong>{entry.workshop.title}</strong>
                    <span className="modal__meta">
                      {bookingDateFormatter.format(entry.date)}
                    </span>
                  </p>
                  <p className="modal__meta">
                    Capacity {entry.session.capacity || DEFAULT_SLOT_CAPACITY} Â·{" "}
                    {entry.workshop.location || "Studio"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-panel__notice">No sessions scheduled yet.</p>
          )}
        </Reveal>

        <Reveal as="section" className="admin-panel" delay={120}>
          <div className="admin-panel__header">
            <h3>Recent orders</h3>
            {inventoryLoading && (
              <span className="badge badge--muted">Syncingâ€¦</span>
            )}
          </div>
          {recentOrders.length > 0 ? (
            <ul className="admin-panel__list">
              {recentOrders.map((order) => (
                <li key={order.id} className="admin-order-card">
                  <div>
                    <p>
                      <strong>{order.customer.fullName || "Guest"}</strong>
                    </p>
                    <p className="modal__meta">
                      {order.customer.email || "â€”"}
                    </p>
                  </div>
                  <div>
                    <p className="modal__meta">
                      {order.items.length || 0} item(s)
                    </p>
                    <p className="modal__meta">
                      {formatPriceLabel(order.totalPrice)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-panel__notice">No orders just yet.</p>
          )}
        </Reveal>
      </div>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
    </div>
  );
}

export function AdminProductsView() {
  const {
    db,
    storage,
    products,
    productCategories,
    productTags,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const location = useLocation();
  const isSubscriptionsTab = location.pathname.includes("/admin/subscriptions");
  const isCategoriesTab =
    !isSubscriptionsTab && location.pathname.includes("/admin/products/categories");
  const activeTab = isSubscriptionsTab
    ? "subscriptions"
    : isCategoriesTab
      ? "categories"
      : "products";
  const headerNote =
    activeTab === "categories"
      ? "Manage the categories shown across the storefront."
      : activeTab === "subscriptions"
        ? "Manage subscription plans separately from standard products."
        : "Build your storefront inventory directly from Firestore.";
  usePageMetadata({
    title: activeTab === "subscriptions" ? "Admin Â· Subscriptions" : "Admin Â· Products",
    description:
      activeTab === "subscriptions"
        ? "Manage subscription plan products shown to customers."
        : "Manage Bethany Blooms product listings stored in Firebase.",
  });
  const [statusMessage, setStatusMessage] = useState(null);
  const [productForm, setProductForm] = useState(INITIAL_PRODUCT_FORM);
  const [editingProductId, setEditingProductId] = useState(null);
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [productMainImageFile, setProductMainImageFile] = useState(null);
  const [productMainImagePreview, setProductMainImagePreview] = useState("");
  const [productGalleryFiles, setProductGalleryFiles] = useState([]);
  const [productGalleryPreviews, setProductGalleryPreviews] = useState([]);
  const [productError, setProductError] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    subHeading: "",
    productDescription: "",
    coverImage: "",
  });
  const [categoryError, setCategoryError] = useState(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryStatusMessage, setCategoryStatusMessage] = useState(null);
  const [categoryCoverFile, setCategoryCoverFile] = useState(null);
  const [categoryCoverPreview, setCategoryCoverPreview] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const categoryCoverPreviewUrlRef = useRef(null);
  const [tagForm, setTagForm] = useState({ name: "" });
  const [tagError, setTagError] = useState(null);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagStatusMessage, setTagStatusMessage] = useState(null);
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState(null);
  const [productSaving, setProductSaving] = useState(false);
  const [productPage, setProductPage] = useState(0);
  const productMainPreviewUrlRef = useRef(null);
  const productGalleryPreviewUrlRef = useRef([]);
  const productMainImageInputRef = useRef(null);
  const productGalleryImageInputRef = useRef(null);
  const productImportInputRef = useRef(null);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [mediaLibraryMode, setMediaLibraryMode] = useState("main");
  const [mediaLibrarySelection, setMediaLibrarySelection] = useState([]);
  const [productImporting, setProductImporting] = useState(false);
  const [productImportMessage, setProductImportMessage] = useState(null);
  const [productImportError, setProductImportError] = useState(null);
  const [featuredUpdatingId, setFeaturedUpdatingId] = useState(null);
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);
  const [testGiftCardEmail, setTestGiftCardEmail] = useState("admin@bethanyblooms.co.za");
  const [testGiftCardPurchaserName, setTestGiftCardPurchaserName] = useState("");
  const [testGiftCardRecipientName, setTestGiftCardRecipientName] = useState("");
  const [testGiftCardMessage, setTestGiftCardMessage] = useState("");
  const [testGiftCardSending, setTestGiftCardSending] = useState(false);
  const [testGiftCardResult, setTestGiftCardResult] = useState(null);
  const [testGiftCardError, setTestGiftCardError] = useState(null);
  const {
    items: mediaItems,
    status: mediaStatus,
    error: mediaItemsError,
  } = useFirestoreCollection("productMedia", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });
  const categoryOptions = useMemo(
    () =>
      productCategories
        .map((category) => {
          const name = (category.name || category.title || category.label || category.id || "")
            .toString()
            .trim();
          if (!name) return null;
          const slug = (category.slug || category.id || name).toString().trim();
          const id = (category.id || slug).toString().trim();
          const description = (category.description || category.short_description || "")
            .toString()
            .trim();
          const subHeading = (category.subHeading || category.subheading || "").toString().trim();
          const productDescription = (
            category.productDescription ||
            category.collectionDescription ||
            ""
          )
            .toString()
            .trim();
          const coverImage = (category.coverImage || category.cover_image || "")
            .toString()
            .trim();
          return { id, name, slug, description, subHeading, productDescription, coverImage };
        })
        .filter(Boolean),
    [productCategories],
  );
  const tagOptions = useMemo(
    () =>
      productTags
        .map((tag) => {
          const name = (tag.name || tag.title || tag.label || tag.id || "").toString().trim();
          if (!name) return null;
          const slug = (tag.slug || tag.id || name).toString().trim();
          const id = (tag.id || slug).toString().trim();
          return { id, name, slug };
        })
        .filter(Boolean),
    [productTags],
  );
  const categoryLookup = useMemo(() => {
    const map = new Map();
    categoryOptions.forEach((category) => {
      const idKey = (category.id || "").toString().trim().toLowerCase();
      const slugKey = (category.slug || "").toString().trim().toLowerCase();
      const nameKey = (category.name || "").toString().trim().toLowerCase();
      if (idKey) map.set(idKey, category);
      if (slugKey) map.set(slugKey, category);
      if (nameKey) map.set(nameKey, category);
    });
    return map;
  }, [categoryOptions]);
  const resolveCategory = (value) => {
    if (!value) return null;
    const key = value.toString().trim().toLowerCase();
    if (!key) return null;
    return categoryLookup.get(key) || null;
  };
  const defaultSubscriptionCategoryId = useMemo(() => {
    const matched = categoryOptions.find((category) =>
      [category.id, category.slug, category.name].some((value) =>
        looksLikeSubscriptionCategory(value),
      ),
    );
    return (matched?.id || "").toString().trim();
  }, [categoryOptions]);
  const subscriptionProducts = useMemo(
    () =>
      products.filter((product) => {
        if (!product || typeof product !== "object") return false;
        if (product.isSubscription === true || product.subscriptionEnabled === true) return true;
        if (looksLikeSubscriptionCategory(product.productType || product.type || product.kind || "")) {
          return true;
        }
        const rawCategoryValues = [];
        if (Array.isArray(product.category_ids)) rawCategoryValues.push(...product.category_ids);
        if (Array.isArray(product.categoryIds)) rawCategoryValues.push(...product.categoryIds);
        if (product.categoryId) rawCategoryValues.push(product.categoryId);
        if (product.categorySlug) rawCategoryValues.push(product.categorySlug);
        if (product.category) rawCategoryValues.push(product.category);
        if (product.categoryName) rawCategoryValues.push(product.categoryName);

        return rawCategoryValues.some((value) => {
          const normalized = (value || "").toString().trim();
          if (!normalized) return false;
          if (looksLikeSubscriptionCategory(normalized)) return true;
          const resolved = categoryLookup.get(normalized.toLowerCase()) || null;
          return Boolean(
            resolved &&
              [resolved.id, resolved.slug, resolved.name].some((entry) =>
                looksLikeSubscriptionCategory(entry),
              ),
          );
        });
      }),
    [products, categoryLookup],
  );
  const managedProducts =
    activeTab === "subscriptions" ? subscriptionProducts : products;
  const categoryUsage = useMemo(() => {
    const usage = new Map();
    products.forEach((product) => {
      const categoryIds = Array.isArray(product.category_ids) ?
         product.category_ids
        : Array.isArray(product.categoryIds) ?
         product.categoryIds
        : product.categoryId ?
         [product.categoryId]
        : product.category ?
         [product.category]
        : [];
      categoryIds.forEach((id) => {
        const key = (id || "").toString().trim().toLowerCase();
        const resolved = key ? categoryLookup.get(key) || null : null;
        const resolvedId = resolved?.id || null;
        if (!resolvedId) return;
        usage.set(resolvedId, (usage.get(resolvedId) || 0) + 1);
      });
    });
    return usage;
  }, [products, categoryLookup]);
  const featuredProductCount = useMemo(
    () => products.filter((product) => product.featured).length,
    [products]
  );
  const currentStockStatus = getStockStatus({
    quantity: productForm.stockQuantity,
    forceOutOfStock: productForm.stockStatus === "out_of_stock",
    status: productForm.stockStatus,
  });
  const getProductGalleryUrls = (source = productForm.galleryImages) =>
    (Array.isArray(source) ? source : [])
      .map((value) => (value || "").toString().trim())
      .filter(Boolean);
  const syncProductGalleryPreviews = (
    galleryUrls = productForm.galleryImages,
    filePreviewUrls = productGalleryPreviewUrlRef.current
  ) => {
    const normalizedGalleryUrls = getProductGalleryUrls(galleryUrls);
    const normalizedFilePreviews = Array.isArray(filePreviewUrls) ? filePreviewUrls.filter(Boolean) : [];
    setProductGalleryPreviews([...normalizedGalleryUrls, ...normalizedFilePreviews]);
  };

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (!categoryStatusMessage) return undefined;
    const timeout = setTimeout(() => setCategoryStatusMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [categoryStatusMessage]);

  useEffect(() => {
    if (!tagStatusMessage) return undefined;
    const timeout = setTimeout(() => setTagStatusMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [tagStatusMessage]);

  useEffect(
    () => () => {
      if (productMainPreviewUrlRef.current) {
        URL.revokeObjectURL(productMainPreviewUrlRef.current);
        productMainPreviewUrlRef.current = null;
      }
      if (Array.isArray(productGalleryPreviewUrlRef.current)) {
        productGalleryPreviewUrlRef.current.forEach((url) => {
          URL.revokeObjectURL(url);
        });
        productGalleryPreviewUrlRef.current = [];
      }
    },
    []
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(managedProducts.length / ADMIN_PAGE_SIZE) - 1);
    setProductPage((prev) => Math.min(prev, maxPage));
  }, [managedProducts.length]);

  const paginatedProducts = useMemo(() => {
    const start = productPage * ADMIN_PAGE_SIZE;
    return managedProducts.slice(start, start + ADMIN_PAGE_SIZE);
  }, [managedProducts, productPage]);

  const openProductModal = () => {
    const initialForm = {
      ...INITIAL_PRODUCT_FORM,
    };
    if (activeTab === "subscriptions" && defaultSubscriptionCategoryId) {
      initialForm.categoryIds = [defaultSubscriptionCategoryId];
    }
    setProductForm(initialForm);
    setProductMainImageFile(null);
    setProductMainImagePreview("");
    setProductGalleryFiles([]);
    setProductGalleryPreviews([]);
    setEditingProductId(null);
    setProductError(null);
    setTestGiftCardEmail("admin@bethanyblooms.co.za");
    setTestGiftCardResult(null);
    setTestGiftCardError(null);
    if (productMainImageInputRef.current) {
      productMainImageInputRef.current.value = "";
    }
    if (productGalleryImageInputRef.current) {
      productGalleryImageInputRef.current.value = "";
    }
    setProductModalOpen(true);
  };

  const closeProductModal = () => {
    setProductModalOpen(false);
    if (productMainPreviewUrlRef.current) {
      URL.revokeObjectURL(productMainPreviewUrlRef.current);
      productMainPreviewUrlRef.current = null;
    }
    if (Array.isArray(productGalleryPreviewUrlRef.current)) {
      productGalleryPreviewUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
      productGalleryPreviewUrlRef.current = [];
    }
    setProductMainImageFile(null);
    setProductMainImagePreview("");
    setProductGalleryFiles([]);
    setProductGalleryPreviews([]);
    setEditingProductId(null);
    setProductError(null);
    setProductSaving(false);
    setTestGiftCardSending(false);
    setTestGiftCardResult(null);
    setTestGiftCardError(null);
    if (productMainImageInputRef.current) {
      productMainImageInputRef.current.value = "";
    }
    if (productGalleryImageInputRef.current) {
      productGalleryImageInputRef.current.value = "";
    }
  };

  const handleMainImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (productMainPreviewUrlRef.current) {
      URL.revokeObjectURL(productMainPreviewUrlRef.current);
      productMainPreviewUrlRef.current = null;
    }
    if (!file) {
      setProductMainImageFile(null);
      setProductMainImagePreview(productForm.mainImage || "");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setProductError("Please choose an image smaller than 3MB.");
      event.target.value = "";
      return;
    }
    const preview = URL.createObjectURL(file);
    productMainPreviewUrlRef.current = preview;
    setProductMainImageFile(file);
    setProductMainImagePreview(preview);
    setProductForm((prev) => ({ ...prev, mainImage: "" }));
  };

  const handleRemoveMainImage = () => {
    if (productMainPreviewUrlRef.current) {
      URL.revokeObjectURL(productMainPreviewUrlRef.current);
      productMainPreviewUrlRef.current = null;
    }
    setProductMainImageFile(null);
    setProductMainImagePreview("");
    setProductForm((prev) => ({ ...prev, mainImage: "" }));
    if (productMainImageInputRef.current) {
      productMainImageInputRef.current.value = "";
    }
  };

  const handleGalleryImagesChange = (event) => {
    const files = Array.from(event.target.files ?? []);
    if (Array.isArray(productGalleryPreviewUrlRef.current)) {
      productGalleryPreviewUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
      productGalleryPreviewUrlRef.current = [];
    }
    setProductGalleryFiles([]);

    const existingUrls = getProductGalleryUrls();
    if (existingUrls.length + files.length > MAX_PRODUCT_IMAGES) {
      setProductError(`Please select up to ${MAX_PRODUCT_IMAGES} images total.`);
      event.target.value = "";
      syncProductGalleryPreviews(existingUrls, []);
      return;
    }

    const oversized = files.find((file) => file.size > 3 * 1024 * 1024);
    if (oversized) {
      setProductError("Please choose images smaller than 3MB.");
      event.target.value = "";
      syncProductGalleryPreviews(existingUrls, []);
      return;
    }

    if (files.length) {
      const previews = files.map((file) => URL.createObjectURL(file));
      productGalleryPreviewUrlRef.current = previews;
      setProductGalleryFiles(files);
      syncProductGalleryPreviews(existingUrls, previews);
    } else {
      setProductGalleryFiles([]);
      syncProductGalleryPreviews(existingUrls, []);
      if (productGalleryImageInputRef.current) {
        productGalleryImageInputRef.current.value = "";
      }
    }
  };

  const handleRemoveGalleryImage = (index) => {
    if (!Number.isInteger(index) || index < 0) return;
    const galleryUrls = getProductGalleryUrls();
    const localPreviewUrls = Array.isArray(productGalleryPreviewUrlRef.current) ?
       productGalleryPreviewUrlRef.current.filter(Boolean)
      : [];

    if (index < galleryUrls.length) {
      const nextGalleryUrls = galleryUrls.filter((_, galleryIndex) => galleryIndex !== index);
      setProductForm((prev) => ({ ...prev, galleryImages: nextGalleryUrls }));
      syncProductGalleryPreviews(nextGalleryUrls, localPreviewUrls);
      return;
    }

    const fileIndex = index - galleryUrls.length;
    if (fileIndex < 0 || fileIndex >= localPreviewUrls.length) return;
    const removedPreview = localPreviewUrls[fileIndex];
    if (removedPreview) {
      URL.revokeObjectURL(removedPreview);
    }
    const nextLocalPreviewUrls = localPreviewUrls.filter((_, previewIndex) => previewIndex !== fileIndex);
    productGalleryPreviewUrlRef.current = nextLocalPreviewUrls;
    setProductGalleryFiles((prev) => prev.filter((_, galleryFileIndex) => galleryFileIndex !== fileIndex));
    syncProductGalleryPreviews(galleryUrls, nextLocalPreviewUrls);
    if (productGalleryImageInputRef.current) {
      productGalleryImageInputRef.current.value = "";
    }
  };

  const handleCategoryCoverChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (categoryCoverPreviewUrlRef.current) {
      URL.revokeObjectURL(categoryCoverPreviewUrlRef.current);
      categoryCoverPreviewUrlRef.current = null;
    }
    if (!file) {
      setCategoryCoverFile(null);
      setCategoryCoverPreview(categoryForm.coverImage || "");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setCategoryError("Please choose an image smaller than 3MB.");
      event.target.value = "";
      return;
    }
    const preview = URL.createObjectURL(file);
    categoryCoverPreviewUrlRef.current = preview;
    setCategoryCoverFile(file);
    setCategoryCoverPreview(preview);
    setCategoryForm((prev) => ({ ...prev, coverImage: "" }));
  };

  const resetCategoryForm = () => {
    if (categoryCoverPreviewUrlRef.current) {
      URL.revokeObjectURL(categoryCoverPreviewUrlRef.current);
      categoryCoverPreviewUrlRef.current = null;
    }
    setCategoryForm({
      name: "",
      description: "",
      subHeading: "",
      productDescription: "",
      coverImage: "",
    });
    setCategoryCoverFile(null);
    setCategoryCoverPreview("");
    setEditingCategory(null);
  };

  const handleEditCategory = (category) => {
    if (!category) return;
    if (categoryCoverPreviewUrlRef.current) {
      URL.revokeObjectURL(categoryCoverPreviewUrlRef.current);
      categoryCoverPreviewUrlRef.current = null;
    }
    setCategoryForm({
      name: category.name || "",
      description: category.description || "",
      subHeading: category.subHeading || "",
      productDescription: category.productDescription || "",
      coverImage: category.coverImage || "",
    });
    setCategoryCoverFile(null);
    setCategoryCoverPreview(category.coverImage || "");
    setEditingCategory(category);
    setCategoryError(null);
    setCategoryStatusMessage(null);
  };

  const uploadProductMedia = async (file) => {
    if (!storage) throw new Error("Firebase Storage is not configured.");
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
    const storagePath = `product-media/${Date.now()}-${sanitizedName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);
    if (db) {
      try {
        await addDoc(collection(db, "productMedia"), {
          name: file.name,
          url,
          storagePath,
          size: file.size,
          contentType: file.type,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn("Unable to add image to library", error);
      }
    }
    return url;
  };

  const openMediaLibrary = (mode) => {
    setMediaLibraryMode(mode);
    if (mode === "gallery") {
      const existingUrls = getProductGalleryUrls();
      setMediaLibrarySelection(existingUrls);
    } else if (mode === "category") {
      setMediaLibrarySelection(categoryForm.coverImage ? [categoryForm.coverImage] : []);
    } else {
      setMediaLibrarySelection(productForm.mainImage ? [productForm.mainImage] : []);
    }
    setMediaLibraryOpen(true);
  };

  const closeMediaLibrary = () => {
    setMediaLibraryOpen(false);
  };

  const handleMediaLibrarySelect = (url) => {
    if (!url) return;
    if (mediaLibraryMode === "main") {
      if (productMainPreviewUrlRef.current) {
        URL.revokeObjectURL(productMainPreviewUrlRef.current);
        productMainPreviewUrlRef.current = null;
      }
      setProductMainImageFile(null);
      setProductMainImagePreview(url);
      setProductForm((prev) => ({ ...prev, mainImage: url }));
      setMediaLibraryOpen(false);
      return;
    }
    if (mediaLibraryMode === "category") {
      if (categoryCoverPreviewUrlRef.current) {
        URL.revokeObjectURL(categoryCoverPreviewUrlRef.current);
        categoryCoverPreviewUrlRef.current = null;
      }
      setCategoryCoverFile(null);
      setCategoryCoverPreview(url);
      setCategoryForm((prev) => ({ ...prev, coverImage: url }));
      setMediaLibraryOpen(false);
      return;
    }

    setMediaLibrarySelection((prev) => {
      if (prev.includes(url)) {
        return prev.filter((item) => item !== url);
      }
      return [...prev, url];
    });
  };

  const applyMediaLibrarySelection = () => {
    if (mediaLibraryMode !== "gallery") {
      setMediaLibraryOpen(false);
      return;
    }
    const selectedUrls = Array.from(
      new Set(
        (Array.isArray(mediaLibrarySelection) ? mediaLibrarySelection : [])
          .map((value) => (value || "").toString().trim())
          .filter(Boolean)
      )
    );
    const maxUrls = Math.max(0, MAX_PRODUCT_IMAGES - productGalleryFiles.length);
    const limited = selectedUrls.slice(0, maxUrls);
    if (selectedUrls.length > maxUrls) {
      setProductError(`You can add up to ${MAX_PRODUCT_IMAGES} images total.`);
    }
    setProductForm((prev) => ({ ...prev, galleryImages: limited }));
    syncProductGalleryPreviews(limited);
    setMediaLibraryOpen(false);
  };

  const handleToggleHasVariants = (checked) => {
    setProductForm((prev) => {
      if (prev.isGiftCard) {
        return { ...prev, hasVariants: false, variants: [] };
      }
      if (!checked) {
        return { ...prev, hasVariants: false, variants: [] };
      }
      const nextVariants =
        prev.variants && prev.variants.length > 0 ? prev.variants : [createProductVariant()];
      return { ...prev, hasVariants: true, variants: nextVariants, stockQuantity: "" };
    });
  };

  const handleAddProductVariant = () => {
    setProductForm((prev) => ({
      ...prev,
      hasVariants: true,
      variants: [...(prev.variants || []), createProductVariant()],
    }));
  };

  const handleProductVariantChange = (variantId, field, value) => {
    setProductForm((prev) => ({
      ...prev,
      variants: (prev.variants || []).map((variant) =>
        variant.id === variantId ? { ...variant, [field]: value } : variant,
      ),
    }));
  };

  const handleRemoveProductVariant = (variantId) => {
    setProductForm((prev) => ({
      ...prev,
      variants: (prev.variants || []).filter((variant) => variant.id !== variantId),
    }));
  };

  const handleToggleGiftCardProduct = (enabled) => {
    setTestGiftCardResult(null);
    setTestGiftCardError(null);
    setProductForm((prev) => {
      if (!enabled) {
        return {
          ...prev,
          isGiftCard: false,
        };
      }
      return {
        ...prev,
        isGiftCard: true,
        hasVariants: false,
        variants: [],
        stockStatus: "in_stock",
        preorderSendMonth: "",
        stockQuantity: "",
        videoEmbed: "",
        galleryImages: [],
        sunlight: "",
        soilType: "",
        watering: "",
        climate: "",
        plantingDepth: "",
        plantingSpacing: "",
        bestPlantingTime: "",
        bloomPeriod: "",
        flowerColor: "",
        matureHeight: "",
        pestIssues: "",
        diseaseInfo: "",
        propagation: "",
        companions: "",
        relatedProductIds: [],
        upsellProductIds: [],
        crossSellProductIds: [],
      };
    });
    if (enabled) {
      if (Array.isArray(productGalleryPreviewUrlRef.current)) {
        productGalleryPreviewUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
        productGalleryPreviewUrlRef.current = [];
      }
      setProductGalleryFiles([]);
      setProductGalleryPreviews([]);
      if (productGalleryImageInputRef.current) {
        productGalleryImageInputRef.current.value = "";
      }
    }
  };

  const handleSendTestGiftCard = async () => {
    if (!functionsInstance) {
      setTestGiftCardError("Gift card test function is not available.");
      return;
    }
    if (!inventoryEnabled) {
      setTestGiftCardError("Admin access is required to send a test gift card.");
      return;
    }
    const recipientEmail = (testGiftCardEmail || "").toString().trim();
    const purchaserName = (testGiftCardPurchaserName || "").toString().trim();
    const recipientName = (testGiftCardRecipientName || "").toString().trim();
    const message = (testGiftCardMessage || "").toString().trim();
    if (!recipientEmail) {
      setTestGiftCardError("Enter the email address that should receive the test gift card.");
      return;
    }
    if (!productForm.title.trim()) {
      setTestGiftCardError("Add a title first so the test gift card uses the right product name.");
      return;
    }

    setTestGiftCardSending(true);
    setTestGiftCardError(null);
    setTestGiftCardResult(null);
    try {
      const sendTestGiftCard = httpsCallable(functionsInstance, "sendTestGiftCard");
      const payload = {
        recipientEmail,
        productId: editingProductId || null,
        productTitle: productForm.title.trim(),
      };
      if (purchaserName) payload.purchaserName = purchaserName;
      if (recipientName) payload.recipientName = recipientName;
      if (message) payload.message = message;
      const response = await sendTestGiftCard(payload);
      setTestGiftCardResult(response?.data || {});
    } catch (error) {
      setTestGiftCardError(error.message || "Unable to send the test gift card.");
    } finally {
      setTestGiftCardSending(false);
    }
  };

  const handleSingleSelectChange = (field, event) => {
    const value = event.target.value;
    setProductForm((prev) => ({
      ...prev,
      [field]: value ? [value] : [],
    }));
  };

  const handleEditProduct = (product) => {
    try {
    const resolvedCategoryIds = Array.isArray(product.category_ids) ?
       product.category_ids
      : Array.isArray(product.categoryIds) ?
       product.categoryIds
      : product.categoryId ?
       [product.categoryId]
      : product.category ?
       [product.category]
      : [];
    const normalizedCategoryIds = resolvedCategoryIds
      .map((value) => resolveCategory(value)?.id || value)
      .filter(Boolean)
      .map((value) => value.toString());
    const normalizedTagIds = Array.isArray(product.tag_ids) ?
       product.tag_ids
      : Array.isArray(product.tagIds) ?
       product.tagIds
      : [];
    const existingGallery = Array.isArray(product.gallery_images) ?
       product.gallery_images
      : Array.isArray(product.galleryImages) ?
       product.galleryImages
      : Array.isArray(product.images) ?
       product.images
      : [];
    const fallbackGallery = product.image ? [product.image] : [];
    const galleryImages = (existingGallery.length ? existingGallery : fallbackGallery)
      .filter(Boolean)
      .slice(0, MAX_PRODUCT_IMAGES);
    const mainImage =
      product.main_image ||
      product.mainImage ||
      galleryImages[0] ||
      product.image ||
      "";
    const priceValue =
      product.price === undefined || product.price === null ? "" : String(product.price);
    const salePriceValue =
      product.sale_price === undefined || product.sale_price === null
        ? product.salePrice === undefined || product.salePrice === null
          ? ""
          : String(product.salePrice)
        : String(product.sale_price);
    const stockStatusValue =
      product.stock_status ||
      product.stockStatus ||
      (product.forceOutOfStock ? "out_of_stock" : "in_stock");
    const stockQuantityValue =
      product.stock_quantity === undefined || product.stock_quantity === null
        ? product.stockQuantity === undefined || product.stockQuantity === null
          ? product.quantity === undefined || product.quantity === null
            ? ""
            : String(product.quantity)
          : String(product.stockQuantity)
        : String(product.stock_quantity);
    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const dimensionsSource =
      product.dimensions && typeof product.dimensions === "object" ? product.dimensions : {};
    setProductForm({
      title: product.title || product.name || "",
      sku: product.sku || "",
      price: priceValue,
      salePrice: salePriceValue,
      slug: product.slug || slugifyId(product.title || product.name || ""),
      stockStatus: stockStatusValue,
      preorderSendMonth: getProductPreorderSendMonth(product),
      stockQuantity: hasVariants ? "" : stockQuantityValue,
      categoryIds: normalizedCategoryIds.slice(0, 1),
      tagIds: normalizedTagIds.map((value) => value.toString()).slice(0, 1),
      shortDescription: product.short_description || product.shortDescription || product.description || "",
      longDescription: product.long_description || product.longDescription || "",
      mainImage,
      galleryImages,
      videoEmbed: product.video_embed || product.videoEmbed || "",
      sunlight: product.sunlight || "",
      soilType: product.soil_type || product.soilType || "",
      watering: product.watering || "",
      climate: product.climate || "",
      plantingDepth: product.planting_depth || product.plantingDepth || "",
      plantingSpacing: product.planting_spacing || product.plantingSpacing || "",
      bestPlantingTime: product.best_planting_time || product.bestPlantingTime || "",
      bloomPeriod: product.bloom_period || product.bloomPeriod || "",
      flowerColor: product.flower_color || product.flowerColor || "",
      matureHeight: product.mature_height || product.matureHeight || "",
      pestIssues: product.pest_issues || product.pestIssues || "",
      diseaseInfo: product.disease_info || product.diseaseInfo || "",
      propagation: product.propagation || "",
      companions: product.companions || "",
      metaTitle: product.meta_title || product.metaTitle || "",
      metaDescription: product.meta_description || product.metaDescription || "",
      metaKeywords: product.meta_keywords || product.metaKeywords || "",
      shippingWeight: product.shipping_weight || product.shippingWeight || "",
      dimensions: {
        width: dimensionsSource.width || "",
        height: dimensionsSource.height || "",
        depth: dimensionsSource.depth || "",
      },
      countryOfOrigin: product.country_of_origin || product.countryOfOrigin || "",
      deliveryInfo: product.delivery_info || product.deliveryInfo || "",
      relatedProductIds: (
        Array.isArray(product.related_product_ids) ?
           product.related_product_ids
          : Array.isArray(product.relatedProductIds) ?
           product.relatedProductIds
          : []
      ).slice(0, 1),
      upsellProductIds: (
        Array.isArray(product.upsell_product_ids) ?
           product.upsell_product_ids
          : Array.isArray(product.upsellProductIds) ?
           product.upsellProductIds
          : []
      ).slice(0, 1),
      crossSellProductIds: (
        Array.isArray(product.cross_sell_product_ids) ?
           product.cross_sell_product_ids
          : Array.isArray(product.crossSellProductIds) ?
           product.crossSellProductIds
          : []
      ).slice(0, 1),
      status: product.status || "draft",
      hasVariants,
      variants: Array.isArray(product.variants)
        ? product.variants.filter(Boolean).map((variant) => ({
            id:
              variant.id ||
              `product-variant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            label: (variant.label || variant.name || "").toString(),
            price:
              variant.price === undefined || variant.price === null
                ? ""
                : String(variant.price),
            quantity:
              variant.stock_quantity === undefined || variant.stock_quantity === null
                ? variant.stockQuantity === undefined || variant.stockQuantity === null
                  ? variant.quantity === undefined || variant.quantity === null
                    ? ""
                    : String(variant.quantity)
                  : String(variant.stockQuantity)
                : String(variant.stock_quantity),
          }))
        : [],
      featured: Boolean(product.featured),
      isGiftCard: Boolean(product.isGiftCard || product.is_gift_card),
      giftCardExpiryDays: String(
        normalizeGiftCardExpiryDays(
          product.giftCardExpiryDays || product.gift_card_expiry_days || 365,
          365,
        ),
      ),
      giftCardTerms: (
        product.giftCardTerms ||
        product.gift_card_terms ||
        INITIAL_PRODUCT_FORM.giftCardTerms
      )
        .toString()
        .trim(),
      giftCardOptions: (
        Array.isArray(product.giftCardOptions)
          ? product.giftCardOptions
          : Array.isArray(product.gift_card_options)
          ? product.gift_card_options
          : []
      )
        .filter(Boolean)
        .map((option, index) => ({
          id:
            (option.id || "").toString().trim() ||
            `gift-card-option-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 6)}`,
          label: (option.label || option.name || "").toString().trim(),
          amount:
            option.amount === undefined || option.amount === null
              ? option.price === undefined || option.price === null
                ? ""
                : String(option.price)
              : String(option.amount),
        }))
        .filter((option) => option.label),
    });
    if (productMainPreviewUrlRef.current) {
      URL.revokeObjectURL(productMainPreviewUrlRef.current);
      productMainPreviewUrlRef.current = null;
    }
    if (Array.isArray(productGalleryPreviewUrlRef.current)) {
      productGalleryPreviewUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
      productGalleryPreviewUrlRef.current = [];
    }
    setProductMainImageFile(null);
    setProductMainImagePreview(mainImage);
    setProductGalleryFiles([]);
    syncProductGalleryPreviews(galleryImages, []);
    if (productMainImageInputRef.current) {
      productMainImageInputRef.current.value = "";
    }
    if (productGalleryImageInputRef.current) {
      productGalleryImageInputRef.current.value = "";
    }
    setEditingProductId(product.id);
    setProductError(null);
    setTestGiftCardResult(null);
    setTestGiftCardError(null);
    setProductModalOpen(true);
    } catch (error) {
      console.error("Unable to load product for editing", error);
      setProductError("We could not load this product for editing. Please refresh and try again.");
      setStatusMessage("We could not load this product for editing.");
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!db || !inventoryEnabled) return;
    await deleteDoc(doc(db, "products", productId));
    setStatusMessage("Product removed");
  };

  const handleProductImport = async (event) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    event.target.value = "";
    if (!db || !inventoryEnabled) {
      setProductImportError("You do not have permission to import products.");
      return;
    }
    setProductImporting(true);
    setProductImportError(null);
    setProductImportMessage("Importing products...");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: "array" });
      if (!workbook.SheetNames.length) {
        throw new Error("No sheets were found in that spreadsheet.");
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = utils.sheet_to_json(sheet, { defval: "", raw: false });
      if (!rows.length) {
        throw new Error("No product rows detected. Check that the sheet has a header row followed by products.");
      }
      const usedIds = new Set();
      const categoryCache = new Map();
      const tagCache = new Map();
      const existingCategorySlugs = new Set(
        categoryOptions
          .map((category) => (category.id || "").toString().toLowerCase())
          .filter(Boolean),
      );
      const existingCategoryNames = new Set(
        categoryOptions
          .map((category) => (category.name || "").toString().toLowerCase())
          .filter(Boolean),
      );
      const existingTagSlugs = new Set(
        tagOptions.map((tag) => (tag.id || "").toString().toLowerCase()).filter(Boolean),
      );
      const existingTagNames = new Set(
        tagOptions.map((tag) => (tag.name || "").toString().toLowerCase()).filter(Boolean),
      );
      const getCellValue = (row, keys) => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
        }
        return "";
      };
      const parseListValue = (value) =>
        value
          .toString()
          .split(/[,;]+/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      const ensureCategory = async (rawValue) => {
        const cleaned = (rawValue || "").toString().trim();
        if (!cleaned) return null;
        const cacheKey = cleaned.toLowerCase();
        if (categoryCache.has(cacheKey)) return categoryCache.get(cacheKey);
        const existing = resolveCategory(cleaned);
        if (existing) {
          categoryCache.set(cacheKey, existing);
          return existing;
        }
        const slug = slugifyId(cleaned);
        if (slug) {
          const slugKey = slug.toLowerCase();
          if (!existingCategorySlugs.has(slugKey) && !existingCategoryNames.has(cacheKey)) {
            await setDoc(
              doc(collection(db, "productCategories"), slug),
              {
                name: cleaned,
                slug,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
            existingCategorySlugs.add(slugKey);
            existingCategoryNames.add(cacheKey);
          }
          const createdCategory = { id: slug, name: cleaned, slug };
          categoryCache.set(cacheKey, createdCategory);
          return createdCategory;
        }
        return null;
      };
      const ensureTag = async (rawValue) => {
        const cleaned = (rawValue || "").toString().trim();
        if (!cleaned) return null;
        const cacheKey = cleaned.toLowerCase();
        if (tagCache.has(cacheKey)) return tagCache.get(cacheKey);
        const existing = tagOptions.find(
          (tag) =>
            tag.id.toString().toLowerCase() === cacheKey ||
            tag.slug.toString().toLowerCase() === cacheKey ||
            tag.name.toString().toLowerCase() === cacheKey,
        );
        if (existing) {
          tagCache.set(cacheKey, existing);
          return existing;
        }
        const slug = slugifyId(cleaned);
        if (slug) {
          const slugKey = slug.toLowerCase();
          if (!existingTagSlugs.has(slugKey) && !existingTagNames.has(cacheKey)) {
            await setDoc(
              doc(collection(db, "productTags"), slug),
              {
                name: cleaned,
                slug,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
            existingTagSlugs.add(slugKey);
            existingTagNames.add(cacheKey);
          }
          const createdTag = { id: slug, name: cleaned, slug };
          tagCache.set(cacheKey, createdTag);
          return createdTag;
        }
        return null;
      };
      let importedCount = 0;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rawTitle =
          getCellValue(row, ["Title", "Name", "Product Name", "title", "name"]) || row[0] || "";
        const cleanedTitle = stripSheetLinkLabel(rawTitle);
        if (!cleanedTitle) continue;
        const lowerTitle = cleanedTitle.toLowerCase();
        const rawPriceValue = parseSheetPriceValue(getCellValue(row, ["Price", "price"]) ?? "");
        if ((lowerTitle === "notes" || lowerTitle === "notes:") && rawPriceValue === "") {
          continue;
        }
        const rawBarcode = (getCellValue(row, ["Barcode", "barcode"]) || "").toString().trim();
        const barcodeId = slugifyId(rawBarcode);
        const baseId =
          barcodeId ? `sku-${barcodeId}` : slugifyId(cleanedTitle) || `imported-${index + 1}`;
        let docId = baseId;
        if (usedIds.has(docId)) {
          let suffix = 2;
          while (usedIds.has(`${baseId}-${suffix}`)) {
            suffix += 1;
          }
          docId = `${baseId}-${suffix}`;
        }
        usedIds.add(docId);

        const qtyRaw =
          getCellValue(row, ["Stock Quantity", "Stock Qty", "QTY", "Qty", "qty"]) ?? 0;
        const qtyNumber = Number(qtyRaw);
        const quantity = Number.isFinite(qtyNumber) ? Math.max(0, Math.floor(qtyNumber)) : null;
        const statusInput = (getCellValue(row, ["Status", "status"]) || "live")
          .toString()
          .trim()
          .toLowerCase();
        const status = ["draft", "live", "archived"].includes(statusInput) ?
           statusInput
          : "live";
        const shortDescription = sanitizePlainText(
          getCellValue(row, ["Short Description", "Description", "short_description", "description"]) ||
            cleanedTitle,
        );
        const longDescription = sanitizePlainText(
          getCellValue(row, ["Long Description", "long_description", "Long description"]) || "",
        );
        const categoryInput = (getCellValue(row, ["Category", "category"]) || "").toString().trim();
        const fallbackCategory = categoryOptions[0].name || "Product";
        const categoryLabel = categoryInput || fallbackCategory;
        const categoryRecord = await ensureCategory(categoryLabel);
        const categoryName = categoryRecord.name || categoryLabel;
        const categoryId = categoryRecord.id || slugifyId(categoryName) || "product";
        const categorySlug = categoryRecord.slug || slugifyId(categoryName) || categoryId;
        const tagInput = (getCellValue(row, ["Tag", "tag"]) || "").toString().trim();
        const tagRecord = tagInput ? await ensureTag(tagInput) : null;
        const tagId = tagRecord.id || (tagInput ? slugifyId(tagInput) : "");
        const priceValue = rawPriceValue;
        const normalizedPrice = priceValue === "" ? null : priceValue;
        const salePriceValue = parseSheetPriceValue(getCellValue(row, ["Sale Price", "sale_price", "Sale"]) ?? "");
        const normalizedSalePrice = salePriceValue === "" ? null : salePriceValue;
        const stockStatusInput = (getCellValue(row, ["Stock Status", "stock_status"]) || "")
          .toString()
          .trim()
          .toLowerCase();
        const normalizedStockStatus = ["in_stock", "out_of_stock", "preorder"].includes(stockStatusInput) ?
           stockStatusInput
          : quantity === null ?
           "in_stock"
          : quantity <= 0 ?
           "out_of_stock"
          : "in_stock";
        const preorderSendMonthInput = (
          getCellValue(row, [
            "Preorder Send Month",
            "Preorder send month",
            "preorder_send_month",
            "preorderSendMonth",
          ]) || ""
        )
          .toString()
          .trim();
        const preorderSendMonthValue = normalizePreorderSendMonth(preorderSendMonthInput);
        const preorderSendMonth = normalizedStockStatus === "preorder" ? preorderSendMonthValue : "";
        const resolvedQuantity =
          quantity === null
            ? normalizedStockStatus === "out_of_stock"
              ? 0
              : null
            : quantity;
        const slugInput = (getCellValue(row, ["Slug", "slug"]) || "").toString().trim();
        const slugValue = slugInput || slugifyId(cleanedTitle) || docId;
        const mainImageValue = (getCellValue(row, ["Main Image URL", "Main Image", "main_image"]) || "")
          .toString()
          .trim();
        const galleryInput = getCellValue(row, ["Gallery Images", "gallery_images"]) || "";
        const galleryImages = parseListValue(galleryInput)
          .map((value) => value.toString().trim())
          .filter(Boolean)
          .slice(0, MAX_PRODUCT_IMAGES);
        const videoValue = (getCellValue(row, ["Video URL", "Video", "video_embed"]) || "")
          .toString()
          .trim();
        const sunlightValue = (getCellValue(row, ["Sunlight", "sunlight"]) || "").toString().trim();
        const soilTypeValue = (getCellValue(row, ["Soil Type", "soil_type"]) || "").toString().trim();
        const wateringValue = (getCellValue(row, ["Watering", "watering"]) || "").toString().trim();
        const climateValue = (getCellValue(row, ["Climate", "climate"]) || "").toString().trim();
        const plantingDepthValue = (getCellValue(row, ["Planting Depth", "planting_depth"]) || "")
          .toString()
          .trim();
        const plantingSpacingValue = (getCellValue(row, ["Planting Spacing", "planting_spacing"]) || "")
          .toString()
          .trim();
        const bestPlantingTimeValue = (getCellValue(row, ["Best Planting Time", "best_planting_time"]) || "")
          .toString()
          .trim();
        const bloomPeriodValue = (getCellValue(row, ["Bloom Period", "bloom_period"]) || "")
          .toString()
          .trim();
        const flowerColorValue = (getCellValue(row, ["Flower Color", "flower_color"]) || "")
          .toString()
          .trim();
        const matureHeightValue = (getCellValue(row, ["Mature Height", "mature_height"]) || "")
          .toString()
          .trim();
        const pestIssuesValue = (getCellValue(row, ["Pest Issues", "pest_issues"]) || "")
          .toString()
          .trim();
        const diseaseInfoValue = (getCellValue(row, ["Disease Info", "disease_info"]) || "")
          .toString()
          .trim();
        const propagationValue = (getCellValue(row, ["Propagation", "propagation"]) || "")
          .toString()
          .trim();
        const companionsValue = (getCellValue(row, ["Companions", "companions"]) || "")
          .toString()
          .trim();
        const featuredInput = (getCellValue(row, ["Featured", "featured"]) || "")
          .toString()
          .trim()
          .toLowerCase();
        const featured = ["yes", "true", "1"].includes(featuredInput);

        const variantLabels = parseListValue(getCellValue(row, ["Variant Labels", "Variants"]) || "");
        const variantPrices = parseListValue(getCellValue(row, ["Variant Prices", "Variant Price"]) || "");
        const variantQuantities = parseListValue(
          getCellValue(row, ["Variant Quantities", "Variant Quantity", "Variant Qty"]) || "",
        );
        let variants = variantLabels
          .map((label, idx) => {
            const cleanedLabel = label.toString().trim();
            if (!cleanedLabel) return null;
            const rawPrice = variantPrices[idx] ?? "";
            const parsedPrice = parseSheetPriceValue(rawPrice);
            const rawQuantity = variantQuantities[idx] ?? "";
            const parsedQuantity = parseSheetQuantityValue(rawQuantity);
            const variantQuantity = parsedQuantity === "" ? resolvedQuantity : parsedQuantity;
            return {
              id: slugifyId(cleanedLabel) || `variant-${idx + 1}`,
              label: cleanedLabel,
              price: parsedPrice === "" ? null : parsedPrice,
              quantity: variantQuantity,
              stock_quantity: variantQuantity,
            };
          })
          .filter(Boolean);

        if (!variants.length) {
          const fallbackVariants = [];
          for (let i = 1; i <= 5; i += 1) {
            const label = getCellValue(row, [`Variant ${i} Label`, `Variant ${i}`]);
            const price = getCellValue(row, [`Variant ${i} Price`]);
            const quantityValue = getCellValue(row, [`Variant ${i} Quantity`, `Variant ${i} Qty`]);
            if (!label) continue;
            const parsedPrice = parseSheetPriceValue(price);
            const parsedQuantity = parseSheetQuantityValue(quantityValue);
            const variantQuantity = parsedQuantity === "" ? resolvedQuantity : parsedQuantity;
            fallbackVariants.push({
              id: slugifyId(label) || `variant-${i}`,
              label: label.toString().trim(),
              price: parsedPrice === "" ? null : parsedPrice,
              quantity: variantQuantity,
              stock_quantity: variantQuantity,
            });
          }
          variants = fallbackVariants;
        }

        const seoDescriptionSource = shortDescription || longDescription;
        const metaTitle = cleanedTitle;
        const metaDescription = seoDescriptionSource ? seoDescriptionSource.slice(0, 160) : "";
        const keywordTokens = `${cleanedTitle} ${tagRecord.name || ""}`.split(/\s+/).filter(Boolean);
        const metaKeywords = Array.from(new Set(keywordTokens)).join(", ");
        const skuValue = generateSku(cleanedTitle, slugValue);
        const primaryImage = mainImageValue || galleryImages[0] || "";
        const hasVariantInventory = Array.isArray(variants) && variants.length > 0;
        const baseStockQuantity = hasVariantInventory ? null : resolvedQuantity;

        const docRef = doc(collection(db, "products"), docId);
        let docExists = false;
        try {
          const existing = await getDoc(docRef);
          docExists = existing.exists();
        } catch (lookupError) {
          console.warn("Unable to check existing product", docId, lookupError);
        }
        const payload = {
          name: cleanedTitle,
          title: cleanedTitle,
          slug: slugValue,
          sku: skuValue,
          description: shortDescription || longDescription,
          short_description: shortDescription,
          long_description: longDescription,
          price: normalizedPrice,
          sale_price: normalizedSalePrice,
          category: categoryName,
          categoryId,
          categorySlug,
          category_ids: categoryId ? [categoryId] : [],
          tag_ids: tagId ? [tagId] : [],
          main_image: primaryImage,
          gallery_images: galleryImages,
          video_embed: videoValue,
          sunlight: sunlightValue,
          soil_type: soilTypeValue,
          watering: wateringValue,
          climate: climateValue,
          planting_depth: plantingDepthValue,
          planting_spacing: plantingSpacingValue,
          best_planting_time: bestPlantingTimeValue,
          bloom_period: bloomPeriodValue,
          flower_color: flowerColorValue,
          mature_height: matureHeightValue,
          pest_issues: pestIssuesValue,
          disease_info: diseaseInfoValue,
          propagation: propagationValue,
          companions: companionsValue,
          meta_title: metaTitle,
          meta_description: metaDescription,
          meta_keywords: metaKeywords,
          stock_status: normalizedStockStatus,
          preorder_send_month: preorderSendMonth,
          preorderSendMonth: preorderSendMonth,
          stock_quantity: baseStockQuantity,
          quantity: baseStockQuantity,
          status,
          barcode: rawBarcode || null,
          forceOutOfStock: normalizedStockStatus === "out_of_stock",
          variants,
          featured,
          image: primaryImage,
          images: galleryImages,
          updatedAt: serverTimestamp(),
        };
        if (!docExists) {
          payload.createdAt = serverTimestamp();
        }
        await setDoc(docRef, payload, { merge: true });
        importedCount += 1;
      }
      setStatusMessage(
        `Imported ${importedCount} product${importedCount === 1 ? "" : "s"} from spreadsheet.`,
      );
      setProductImportMessage(
        `Imported ${importedCount} product${importedCount === 1 ? "" : "s"} successfully.`,
      );
    } catch (importError) {
      console.error(importError);
      setProductImportError(
        importError.message || "We couldnâ€™t import products from the selected spreadsheet.",
      );
      setProductImportMessage(null);
    } finally {
      setProductImporting(false);
    }
  };

  const handleDownloadProductTemplate = () => {
    const header = [
      "Title",
      "Slug",
      "Price",
      "Sale Price",
      "Stock Status",
      "Preorder Send Month",
      "Stock Quantity",
      "Category",
      "Tag",
      "Short Description",
      "Long Description",
      "Main Image URL",
      "Gallery Images",
      "Video URL",
      "Sunlight",
      "Soil Type",
      "Watering",
      "Climate",
      "Planting Depth",
      "Planting Spacing",
      "Best Planting Time",
      "Bloom Period",
      "Flower Color",
      "Mature Height",
      "Pest Issues",
      "Disease Info",
      "Propagation",
      "Companions",
      "Status",
      "Featured",
      "Variant Labels",
      "Variant Prices",
      "Variant Quantities",
      "Barcode",
    ];
    const sample = [
      "Allium Winter Fairy Bulbs",
      "allium-winter-fairy-bulbs",
      "150",
      "120",
      "in_stock",
      "",
      "25",
      "Cut flower",
      "Gift",
      "Short description goes here.",
      "Longer description goes here.",
      "https://example.com/main.jpg",
      "https://example.com/gallery-1.jpg, https://example.com/gallery-2.jpg",
      "https://www.youtube.com/watchv=abcdef",
      "full_sun",
      "Well-drained",
      "Weekly",
      "Temperate",
      "5 cm",
      "10 cm",
      "Autumn",
      "Spring",
      "White",
      "35 cm",
      "Aphids",
      "None",
      "Offsets",
      "Tulips",
      "live",
      "no",
      "Small, Medium, Large",
      "0, 20, 40",
      "10, 8, 4",
      "",
    ];
    const notes = [
      "Notes:",
      "Title and Price are required. Slug is optional.",
      "Stock Status: in_stock, out_of_stock, preorder.",
      "Preorder Send Month: YYYY-MM (only used for preorder items).",
      "Category and Tag are single values.",
      "Featured: yes or no.",
      "Stock Quantity is for non-variant products only.",
      "Variant Labels/Prices/Quantities: comma-separated (prices optional, quantities required for variants).",
      "Use the admin Image Library to upload and copy image links.",
    ];

    const sheet = utils.aoa_to_sheet([header, sample, [], notes]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, "Products");
    writeFile(workbook, "bethany-blooms-product-template.xlsx");
  };

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setCategoryError("You do not have permission to update categories.");
      return;
    }
    const name = (categoryForm.name || "").toString().trim();
    const description = sanitizePlainText((categoryForm.description || "").toString().trim());
    const subHeading = sanitizePlainText((categoryForm.subHeading || "").toString().trim());
    const productDescription = sanitizePlainText(
      (categoryForm.productDescription || "").toString().trim(),
    );
    if (!name) {
      setCategoryError("Category name is required.");
      return;
    }
    const editingCategoryId = (editingCategory?.id || "").toString().trim();
    const isEditing = Boolean(editingCategoryId);
    const slug = isEditing ? editingCategoryId : slugifyId(name);
    if (!slug) {
      setCategoryError("Please enter a category name with letters or numbers.");
      return;
    }
    if (!isEditing) {
      if (resolveCategory(slug) || resolveCategory(name)) {
        setCategoryError("That category already exists.");
        return;
      }
    } else {
      const existing = resolveCategory(name);
      if (existing && existing.id !== editingCategoryId) {
        setCategoryError("That category already exists.");
        return;
      }
    }
    try {
      setCategorySaving(true);
      setCategoryError(null);
      let coverImageUrl = (categoryForm.coverImage || "").toString().trim();
      if (categoryCoverFile) {
        coverImageUrl = await uploadProductMedia(categoryCoverFile);
      }
      const payload = {
        name,
        description,
        subHeading,
        productDescription,
        coverImage: coverImageUrl || "",
        updatedAt: serverTimestamp(),
      };
      if (isEditing) {
        await updateDoc(doc(db, "productCategories", slug), payload);
      } else {
        await setDoc(doc(db, "productCategories", slug), {
          ...payload,
          slug,
          createdAt: serverTimestamp(),
        });
      }
      resetCategoryForm();
      setCategoryStatusMessage(isEditing ? "Category updated" : "Category saved");
    } catch (error) {
      setCategoryError(error.message || "Unable to save the category.");
    } finally {
      setCategorySaving(false);
    }
  };

  const handleSeedCategoriesFromProducts = async () => {
    if (!inventoryEnabled || !db) {
      setCategoryError("You do not have permission to update categories.");
      return;
    }
    const existingSlugs = new Set(
      categoryOptions
        .map((category) => (category.id || "").toString().toLowerCase())
        .filter(Boolean),
    );
    const existingNames = new Set(
      categoryOptions
        .map((category) => (category.name || "").toString().toLowerCase())
        .filter(Boolean),
    );
    const toCreate = [];
    products.forEach((product) => {
      const rawValues = [];
      if (Array.isArray(product.category_ids)) {
        rawValues.push(...product.category_ids);
      } else if (Array.isArray(product.categoryIds)) {
        rawValues.push(...product.categoryIds);
      } else if (product.categoryId) {
        rawValues.push(product.categoryId);
      }
      if (product.category) rawValues.push(product.category);
      rawValues
        .map((value) => (value ?? "").toString().trim())
        .filter(Boolean)
        .forEach((raw) => {
          if (resolveCategory(raw)) return;
          const slug = slugifyId(raw);
          const nameKey = raw.toLowerCase();
          const slugKey = slug.toLowerCase();
          if (!slug || existingSlugs.has(slugKey) || existingNames.has(nameKey)) return;
          existingSlugs.add(slugKey);
          existingNames.add(nameKey);
          toCreate.push({ name: raw, slug });
        });
    });

    if (!toCreate.length) {
      setCategoryStatusMessage("All product categories already exist.");
      return;
    }

    try {
      setCategorySaving(true);
      setCategoryError(null);
      await Promise.all(
        toCreate.map((category) =>
          setDoc(doc(db, "productCategories", category.slug), {
            ...category,
            description: "",
            coverImage: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ),
      );
      setCategoryStatusMessage(
        `Added ${toCreate.length} categor${toCreate.length === 1 ? "y" : "ies"} from products.`,
      );
    } catch (error) {
      setCategoryError(error.message || "Unable to seed categories.");
    } finally {
      setCategorySaving(false);
    }
  };


  const handleConfirmDeleteCategory = async () => {
    if (!pendingCategoryDelete) return;
    if (!inventoryEnabled || !db) {
      setCategoryError("You do not have permission to update categories.");
      setPendingCategoryDelete(null);
      return;
    }
    try {
      setCategorySaving(true);
      setCategoryError(null);
      const normalizedTargetValues = new Set(
        [pendingCategoryDelete.id, pendingCategoryDelete.slug, pendingCategoryDelete.name]
          .filter(Boolean)
          .map((value) => value.toString().trim().toLowerCase()),
      );

      const updates = [];
      products.forEach((product) => {
        const payload = { updatedAt: serverTimestamp() };
        let changed = false;

        if (Array.isArray(product.category_ids)) {
          const nextCategoryIds = product.category_ids.filter(
            (value) => !normalizedTargetValues.has((value ?? "").toString().trim().toLowerCase()),
          );
          if (nextCategoryIds.length !== product.category_ids.length) {
            payload.category_ids = nextCategoryIds;
            changed = true;
          }
        }

        if (Array.isArray(product.categoryIds)) {
          const nextCategoryIds = product.categoryIds.filter(
            (value) => !normalizedTargetValues.has((value ?? "").toString().trim().toLowerCase()),
          );
          if (nextCategoryIds.length !== product.categoryIds.length) {
            payload.categoryIds = nextCategoryIds;
            changed = true;
          }
        }

        if (
          product.categoryId &&
          normalizedTargetValues.has(product.categoryId.toString().trim().toLowerCase())
        ) {
          payload.categoryId = deleteField();
          changed = true;
        }

        if (
          product.categorySlug &&
          normalizedTargetValues.has(product.categorySlug.toString().trim().toLowerCase())
        ) {
          payload.categorySlug = deleteField();
          changed = true;
        }

        if (
          product.category &&
          normalizedTargetValues.has(product.category.toString().trim().toLowerCase())
        ) {
          payload.category = deleteField();
          changed = true;
        }

        if (changed) {
          updates.push({ id: product.id, payload });
        }
      });

      if (updates.length) {
        for (let i = 0; i < updates.length; i += 450) {
          const batch = writeBatch(db);
          updates.slice(i, i + 450).forEach((update) => {
            batch.update(doc(db, "products", update.id), update.payload);
          });
          await batch.commit();
        }
      }

      await deleteDoc(doc(db, "productCategories", pendingCategoryDelete.id));
      setCategoryStatusMessage("Category deleted and removed from products.");
    } catch (error) {
      setCategoryError(error.message || "Unable to delete the category.");
    } finally {
      setCategorySaving(false);
      setPendingCategoryDelete(null);
    }
  };

  const handleCreateTag = async (event) => {
    event.preventDefault?.();
    if (!inventoryEnabled || !db) {
      setTagError("You do not have permission to update tags.");
      return;
    }
    const name = tagForm.name.trim();
    if (!name) {
      setTagError("Tag name is required.");
      return;
    }
    const slug = slugifyId(name);
    if (!slug) {
      setTagError("Please enter a valid tag name.");
      return;
    }
    try {
      setTagSaving(true);
      setTagError(null);
      await setDoc(doc(db, "productTags", slug), {
        name,
        slug,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTagForm({ name: "" });
      setTagStatusMessage("Tag saved");
    } catch (error) {
      setTagError(error.message || "Unable to save the tag.");
    } finally {
      setTagSaving(false);
    }
  };

  const handleToggleFeaturedProduct = async (product) => {
    if (!db || !inventoryEnabled || !product.id) return;
    const isFeatured = Boolean(product.featured);
    const currentFeaturedCount = products.filter((entry) => entry.featured).length;
    if (!isFeatured && currentFeaturedCount >= MAX_FEATURED_PRODUCTS) {
      setProductError(
        `Only ${MAX_FEATURED_PRODUCTS} products can be featured. Unfeature one to continue.`
      );
      return;
    }
    setFeaturedUpdatingId(product.id);
    setProductError(null);
    try {
      await updateDoc(doc(db, "products", product.id), {
        featured: !isFeatured,
        updatedAt: serverTimestamp(),
      });
      setStatusMessage(
        !isFeatured ?
           "Product featured on the home page."
          : "Product removed from the featured list."
      );
    } catch (toggleError) {
      setProductError(toggleError.message);
    } finally {
      setFeaturedUpdatingId(null);
    }
  };

  const handleCreateProduct = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setProductError("You do not have permission to update products.");
      return;
    }

    const title = productForm.title.trim();
    const slug = productForm.slug.trim();
    const sku = productForm.sku.trim();
    const isGiftCardProduct = Boolean(productForm.isGiftCard);
    const shortDescriptionText = sanitizePlainText(productForm.shortDescription);
    const longDescriptionText = sanitizePlainText(productForm.longDescription);
    const priceNumber = isGiftCardProduct ? 0 : Number(productForm.price);
    const salePriceNumber =
      isGiftCardProduct ? null : productForm.salePrice === "" ? null : Number(productForm.salePrice);
    const stockQuantityInput =
      isGiftCardProduct ? null : productForm.stockQuantity === "" ? null : Number(productForm.stockQuantity);
    const derivedStatus = productForm.status || "draft";

    if (!title) {
      setProductError("Product title is required.");
      return;
    }
    if (!slug) {
      setProductError("Product slug is required.");
      return;
    }
    if (!isGiftCardProduct && !Number.isFinite(priceNumber)) {
      setProductError("Please enter a valid price.");
      return;
    }
    if (!isGiftCardProduct && salePriceNumber !== null && !Number.isFinite(salePriceNumber)) {
      setProductError("Please enter a valid sale price.");
      return;
    }
    if (
      !isGiftCardProduct &&
      !productForm.hasVariants &&
      stockQuantityInput !== null &&
      !Number.isFinite(stockQuantityInput)
    ) {
      setProductError("Please enter a valid stock quantity.");
      return;
    }

    const normalizedCategoryIds = Array.isArray(productForm.categoryIds) ?
       productForm.categoryIds.filter(Boolean)
      : [];
    const normalizedTagIds = Array.isArray(productForm.tagIds) ?
       productForm.tagIds.filter(Boolean)
      : [];
    const tagLabels = normalizedTagIds
      .map((tagId) => tagOptions.find((tag) => tag.id === tagId).name)
      .filter(Boolean);
    const seoDescriptionSource = shortDescriptionText || longDescriptionText;
    const metaTitle = title;
    const metaDescription = seoDescriptionSource ? seoDescriptionSource.slice(0, 160) : "";
    const keywordTokens = `${title} ${tagLabels.join(" ")}`.split(/\s+/).filter(Boolean);
    const metaKeywords = Array.from(new Set(keywordTokens)).join(", ");
    const skuValue = sku || generateSku(title, slug);
    const giftCardExpiryDays = normalizeGiftCardExpiryDays(productForm.giftCardExpiryDays, 365);
    const giftCardTerms = (productForm.giftCardTerms || "").toString().trim();
    const effectiveGiftCardTerms = giftCardTerms || INITIAL_PRODUCT_FORM.giftCardTerms;
    const sanitizedGiftCardOptions = (Array.isArray(productForm.giftCardOptions)
      ? productForm.giftCardOptions
      : []
    )
      .map((option, index) => {
        const label = (option?.label || "").toString().trim();
        const amountNumber = Number(option?.amount);
        if (!label) return null;
        if (!Number.isFinite(amountNumber) || amountNumber < 0) return null;
        return {
          id:
            (option?.id || "").toString().trim() ||
            `gift-card-option-${index + 1}-${Date.now().toString(36)}`,
          label,
          amount: Math.max(0, Number(amountNumber.toFixed(2))),
        };
      })
      .filter(Boolean);

    const rawVariants = Array.isArray(productForm.variants) ? productForm.variants : [];
    const invalidVariantQuantities = [];
    const sanitizedVariants = rawVariants
      .map((variant, index) => {
        const label = (variant.label || "").toString().trim();
        if (!label) return null;
        const priceNumber = Number(variant.price);
        const quantityInput = (variant.quantity ?? "").toString().trim();
        const quantityNumber = Number(quantityInput);
        const hasQuantity = quantityInput !== "";
        if (productForm.hasVariants && (!hasQuantity || !Number.isFinite(quantityNumber) || quantityNumber < 0)) {
          invalidVariantQuantities.push(label || `Variant ${index + 1}`);
          return null;
        }
        const normalizedQuantity =
          hasQuantity && Number.isFinite(quantityNumber) ? Math.max(0, Math.floor(quantityNumber)) : null;
        return {
          id: variant.id || slugifyId(label) || `variant-${index + 1}`,
          label,
          price: Number.isFinite(priceNumber) ? priceNumber : null,
          quantity: normalizedQuantity,
          stock_quantity: normalizedQuantity,
        };
      })
      .filter(Boolean);
    if (!isGiftCardProduct && productForm.hasVariants && invalidVariantQuantities.length > 0) {
      setProductError("Enter a valid stock quantity for every variant.");
      return;
    }
    if (!isGiftCardProduct && productForm.hasVariants && sanitizedVariants.length === 0) {
      setProductError("Add at least one variant before saving.");
      return;
    }
    const normalizedVariants = isGiftCardProduct
      ? []
      : productForm.hasVariants
      ? sanitizedVariants
      : [];
    const hasVariantInventory = normalizedVariants.length > 0;
    const baseStockQuantity =
      isGiftCardProduct
        ? null
        : hasVariantInventory
        ? null
        : stockQuantityInput === null
          ? productForm.stockStatus === "out_of_stock"
            ? 0
            : null
          : Math.max(0, Math.floor(stockQuantityInput));

    try {
      setProductSaving(true);
      setStatusMessage(
        editingProductId ? "Updating product..." : "Saving product..."
      );
      let mainImageUrl = productForm.mainImage.trim();
      if (productMainImageFile) {
        const uploaded = await uploadProductMedia(productMainImageFile);
        if (uploaded) mainImageUrl = uploaded;
      }

      let galleryUrls = isGiftCardProduct
        ? []
        : Array.isArray(productForm.galleryImages)
        ? productForm.galleryImages.filter(Boolean)
        : [];
      if (!isGiftCardProduct && productGalleryFiles.length > 0) {
        for (const file of productGalleryFiles) {
          const uploaded = await uploadProductMedia(file);
          if (uploaded) galleryUrls.push(uploaded);
        }
      }
      const limitedGallery = galleryUrls.slice(0, MAX_PRODUCT_IMAGES);
      const primaryImage = mainImageUrl || limitedGallery[0] || "";
      const finalGallery = isGiftCardProduct ? (primaryImage ? [primaryImage] : []) : limitedGallery;
      const finalVideoEmbed = isGiftCardProduct ? "" : productForm.videoEmbed.trim();

      const primaryCategory = normalizedCategoryIds.length ?
         resolveCategory(normalizedCategoryIds[0])
        : null;
      const primaryCategoryLabel = primaryCategory.name || "";
      const primaryCategoryId = primaryCategory.id || normalizedCategoryIds[0] || "";
      const primaryCategorySlug = primaryCategory.slug || "";

      const dimensionsPayload = {
        width: productForm.dimensions.width || "",
        height: productForm.dimensions.height || "",
        depth: productForm.dimensions.depth || "",
      };
      const preorderSendMonthValue = normalizePreorderSendMonth(productForm.preorderSendMonth);
      const preorderSendMonthPayload =
        !isGiftCardProduct && productForm.stockStatus === "preorder" ? preorderSendMonthValue : "";

      const payload = {
        title,
        sku: skuValue,
        price: priceNumber,
        sale_price: salePriceNumber,
        slug,
        stock_status: isGiftCardProduct ? "in_stock" : productForm.stockStatus,
        preorder_send_month: preorderSendMonthPayload,
        preorderSendMonth: preorderSendMonthPayload,
        stock_quantity: baseStockQuantity,
        category_ids: normalizedCategoryIds,
        tag_ids: normalizedTagIds,
        short_description: shortDescriptionText,
        long_description: longDescriptionText,
        main_image: primaryImage,
        gallery_images: finalGallery,
        video_embed: finalVideoEmbed,
        sunlight: isGiftCardProduct ? "" : productForm.sunlight || "",
        soil_type: isGiftCardProduct ? "" : productForm.soilType || "",
        watering: isGiftCardProduct ? "" : productForm.watering || "",
        climate: isGiftCardProduct ? "" : productForm.climate || "",
        planting_depth: isGiftCardProduct ? "" : productForm.plantingDepth || "",
        planting_spacing: isGiftCardProduct ? "" : productForm.plantingSpacing || "",
        best_planting_time: isGiftCardProduct ? "" : productForm.bestPlantingTime || "",
        bloom_period: isGiftCardProduct ? "" : productForm.bloomPeriod || "",
        flower_color: isGiftCardProduct ? "" : productForm.flowerColor || "",
        mature_height: isGiftCardProduct ? "" : productForm.matureHeight || "",
        pest_issues: isGiftCardProduct ? "" : productForm.pestIssues || "",
        disease_info: isGiftCardProduct ? "" : productForm.diseaseInfo || "",
        propagation: isGiftCardProduct ? "" : productForm.propagation || "",
        companions: isGiftCardProduct ? "" : productForm.companions || "",
        meta_title: metaTitle,
        meta_description: metaDescription,
        meta_keywords: metaKeywords,
        shipping_weight: productForm.shippingWeight || "",
        dimensions: dimensionsPayload,
        country_of_origin: productForm.countryOfOrigin.trim(),
        delivery_info: productForm.deliveryInfo.trim(),
        related_product_ids: Array.isArray(productForm.relatedProductIds) ?
           isGiftCardProduct
            ? []
            : productForm.relatedProductIds.filter(Boolean)
          : [],
        upsell_product_ids: Array.isArray(productForm.upsellProductIds) ?
           isGiftCardProduct
            ? []
            : productForm.upsellProductIds.filter(Boolean)
          : [],
        cross_sell_product_ids: Array.isArray(productForm.crossSellProductIds) ?
           isGiftCardProduct
            ? []
            : productForm.crossSellProductIds.filter(Boolean)
          : [],
        name: title,
        description: shortDescriptionText || longDescriptionText,
        image: primaryImage,
        images: finalGallery,
        category: primaryCategoryLabel,
        categoryId: primaryCategoryId,
        categorySlug: primaryCategorySlug,
        status: derivedStatus,
        quantity: baseStockQuantity,
        forceOutOfStock: isGiftCardProduct ? false : productForm.stockStatus === "out_of_stock",
        variants: normalizedVariants,
        featured: Boolean(productForm.featured),
        isGiftCard: isGiftCardProduct,
        gift_card_expiry_days: isGiftCardProduct ? giftCardExpiryDays : null,
        giftCardExpiryDays: isGiftCardProduct ? giftCardExpiryDays : null,
        gift_card_terms: isGiftCardProduct ? effectiveGiftCardTerms : "",
        giftCardTerms: isGiftCardProduct ? effectiveGiftCardTerms : "",
        gift_card_options: isGiftCardProduct ? sanitizedGiftCardOptions : [],
        giftCardOptions: isGiftCardProduct ? sanitizedGiftCardOptions : [],
        updatedAt: serverTimestamp(),
      };

      if (editingProductId) {
        await updateDoc(doc(db, "products", editingProductId), payload);
        setStatusMessage("Product updated");
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatusMessage("Product saved");
      }

      closeProductModal();
    } catch (error) {
      setProductError(error.message);
    } finally {
      setProductSaving(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <div className="admin-panel__header">
        <div>
          <h2>{activeTab === "subscriptions" ? "Subscriptions" : "Products"}</h2>
          <p className="admin-panel__note">
            {headerNote}
          </p>
        </div>
        {activeTab === "products" && (
          <div>
            <div className="admin-panel__header-actions">
              <input
                ref={productImportInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleProductImport}
                style={{ display: "none" }}
              />
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => productImportInputRef.current.click()}
                disabled={!inventoryEnabled || productImporting}
              >
                {productImporting ? "Importing..." : "Import Spreadsheet"}
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={handleDownloadProductTemplate}
                disabled={!inventoryEnabled}
              >
                Download template
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={openProductModal}
                disabled={!inventoryEnabled}
              >
                <IconPlus className="btn__icon" aria-hidden="true" />
                Add Product
              </button>
            </div>
            {productImportError && <p className="admin-panel__error">{productImportError}</p>}
            {productImportMessage && !productImportError && (
              <p className={productImporting ? "admin-panel__notice" : "admin-panel__status"}>
                {productImportMessage}
              </p>
            )}
          </div>
        )}
        {activeTab === "subscriptions" && (
          <div className="admin-panel__header-actions">
            <button
              className="btn btn--primary"
              type="button"
              onClick={openProductModal}
              disabled={!inventoryEnabled}
            >
              <IconPlus className="btn__icon" aria-hidden="true" />
              Add Subscription Plan
            </button>
          </div>
        )}
      </div>

      {!isSubscriptionsTab && (
        <div className="admin-tabs">
          <NavLink
            to="/admin/products"
            end
            className={({ isActive }) => `admin-tab${isActive ? " is-active" : ""}`}
          >
            Products
          </NavLink>
          <NavLink
            to="/admin/products/categories"
            className={({ isActive }) => `admin-tab${isActive ? " is-active" : ""}`}
          >
            Categories
          </NavLink>
        </div>
      )}

      {activeTab === "categories" && (
        <div className="admin-panel__content admin-panel__content--split">
          <div>
            <h3>{editingCategory ? "Edit category" : "Create category"}</h3>
            <form className="admin-form" onSubmit={handleCreateCategory}>
              <input
                className="input"
                placeholder="Category name"
                value={categoryForm.name}
                onChange={(event) =>
                  setCategoryForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
              />
              <textarea
                className="input textarea"
                rows="3"
                placeholder="Short category description"
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
              <input
                className="input"
                placeholder="Collection sub heading"
                value={categoryForm.subHeading}
                onChange={(event) =>
                  setCategoryForm((prev) => ({
                    ...prev,
                    subHeading: event.target.value,
                  }))
                }
              />
              <textarea
                className="input textarea"
                rows="3"
                placeholder="Collection product description"
                value={categoryForm.productDescription}
                onChange={(event) =>
                  setCategoryForm((prev) => ({
                    ...prev,
                    productDescription: event.target.value,
                  }))
                }
              />
              <label className="admin-form__field admin-form__full">
                Category cover image
                <input
                  className="input input--file"
                  type="file"
                  accept="image/*"
                  onChange={handleCategoryCoverChange}
                />
                <div className="admin-media-picker">
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => openMediaLibrary("category")}
                  >
                    Choose from library
                  </button>
                </div>
                {categoryCoverPreview && (
                  <div className="admin-preview-grid">
                    <img src={categoryCoverPreview} alt="Category cover preview" className="admin-preview" loading="lazy" decoding="async"/>
                  </div>
                )}
              </label>
              <p className="modal__meta">
                Categories appear in the Shop dropdown and power the category hero on the products page.
              </p>
              <div className="admin-form__actions">
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={categorySaving || !inventoryEnabled}
                >
                  {categorySaving
                    ? editingCategory
                      ? "Updating..."
                      : "Saving..."
                    : editingCategory
                      ? "Update Category"
                      : "Save Category"}
                </button>
                {editingCategory && (
                  <button
                    className="btn btn--secondary"
                    type="button"
                    disabled={categorySaving}
                    onClick={resetCategoryForm}
                  >
                    Cancel
                  </button>
                )}
              </div>
              {categoryError && (
                <p className="admin-panel__error">{categoryError}</p>
              )}
              {categoryStatusMessage && (
                <p className="admin-panel__status">{categoryStatusMessage}</p>
              )}
            </form>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={handleSeedCategoriesFromProducts}
              disabled={categorySaving || !inventoryEnabled || products.length === 0}
            >
              {categorySaving ? "Working..." : "Seed from existing products"}
            </button>
            <p className="modal__meta">
              Use this to create categories from products you already imported.
            </p>
          </div>
          <div>
            <h3>Existing categories</h3>
            <div className="admin-panel__list">
              {categoryOptions.length ? (
                categoryOptions.map((category) => {
                  const usageCount = categoryUsage.get(category.id) || 0;
                  return (
                    <div className="admin-category-card" key={category.id}>
                      <div>
                        <strong>{category.name}</strong>
                        <p className="modal__meta">
                          {usageCount}
                          {usageCount === 1 ? " product" : " products"}
                        </p>
                      </div>
                      <div className="admin-category-card__actions">
                        <button
                          className="icon-btn"
                          type="button"
                          disabled={categorySaving || !inventoryEnabled}
                          onClick={() => handleEditCategory(category)}
                          title="Edit category"
                        >
                          <IconEdit aria-hidden="true" />
                        </button>
                        <button
                          className="icon-btn icon-btn--danger"
                          type="button"
                          disabled={categorySaving || !inventoryEnabled}
                          onClick={() => setPendingCategoryDelete(category)}
                          title={
                            usageCount > 0 ?
                               "Delete category (will be removed from products)"
                              : "Delete category"
                          }
                        >
                          <IconTrash aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="admin-panel__notice">No categories yet.</p>
              )}
            </div>
            {inventoryError && (
              <p className="admin-panel__error">{inventoryError}</p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingCategoryDelete)}
        title="Delete category"
        message={
          pendingCategoryDelete
            ? `${pendingCategoryDelete.name} will be removed from ${
                categoryUsage.get(pendingCategoryDelete.id) || 0
              } product(s). This cannot be undone.`
            : "This cannot be undone."
        }
        confirmLabel="Delete category"
        busy={categorySaving}
        onCancel={() => setPendingCategoryDelete(null)}
        onConfirm={handleConfirmDeleteCategory}
      />

      {(activeTab === "products" || activeTab === "subscriptions") && (
        <div className="admin-panel__content">
          <div className="admin-table__wrapper">
            {!categoryOptions.length && (
              <p className="admin-panel__notice">
                No categories yet. Add one to help customers browse products.
              </p>
            )}
            {activeTab === "subscriptions" && !defaultSubscriptionCategoryId && (
              <p className="admin-panel__notice">
                Create a category named <strong>Subscriptions</strong>, then assign plans to that
                category.
              </p>
            )}
            {managedProducts.length > 0 ? (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col">Category</th>
                    <th scope="col">Price</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Featured</th>
                    <th scope="col">Updated</th>
                    <th scope="col" className="admin-table__actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product) => {
                    const updatedAt = product.updatedAt?.toDate?.()
                      ? bookingDateFormatter.format(product.updatedAt.toDate())
                      : "â€”";
                    const stockStatus = getStockStatus({
                      quantity: product.stock_quantity ?? product.quantity,
                      forceOutOfStock: product.forceOutOfStock || product.stock_status === "out_of_stock",
                      status: product.stock_status,
                    });
                    const stockLabel =
                      stockStatus.state === "preorder" ?
                         "Preorder"
                        : stockStatus.isForced ?
                         "Out of stock (manual)"
                        : stockStatus.label;
                    const preorderSendMonth = getProductPreorderSendMonth(product);
                    const preorderSendMonthLabel = formatPreorderSendMonth(preorderSendMonth);
                    const imageCandidates = [
                      product.main_image,
                      ...(Array.isArray(product.gallery_images) ? product.gallery_images : []),
                      product.image,
                      ...(Array.isArray(product.images) ? product.images : []),
                    ]
                      .map((value) => (value || "").toString().trim())
                      .filter(Boolean);
                    const image = imageCandidates[0] || "";
                    const rawCategoryValues = [];
                    if (Array.isArray(product.category_ids)) {
                      rawCategoryValues.push(...product.category_ids);
                    } else if (Array.isArray(product.categoryIds)) {
                      rawCategoryValues.push(...product.categoryIds);
                    } else if (product.categoryId) {
                      rawCategoryValues.push(product.categoryId);
                    }
                    if (product.category) rawCategoryValues.push(product.category);
                    const categoryLabels = [];
                    rawCategoryValues
                      .map((value) => (value ?? "").toString().trim())
                      .filter(Boolean)
                      .forEach((value) => {
                        const resolved = resolveCategory(value);
                        const label = resolved?.name || value;
                        if (!categoryLabels.includes(label)) categoryLabels.push(label);
                      });
                    const primaryCategory = categoryLabels[0] || "â€”";
                    const extraCategoryCount = Math.max(0, categoryLabels.length - 1);
                    const descriptionText = stripHtml(
                      product.short_description ||
                        product.shortDescription ||
                        product.description ||
                        "",
                    );
                    const salePriceValue = product.sale_price ?? product.salePrice ?? null;
                    const hasSalePrice =
                      salePriceValue !== null && salePriceValue !== undefined && salePriceValue !== "";
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="admin-table__product">
                            {image ? (
                              <img
                                src={image}
                                alt={product.title || product.name}
                                className="admin-table__thumb" loading="lazy" decoding="async"/>
                            ) : (
                              <span className="admin-table__thumb admin-table__thumb--placeholder">
                                <IconImage aria-hidden="true" />
                              </span>
                            )}
                            <div>
                              <strong>{product.title || product.name}</strong>
                              {descriptionText && (
                                <p className="modal__meta">{descriptionText}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span>{primaryCategory}</span>
                          {extraCategoryCount > 0 && (
                            <p className="modal__meta">+{extraCategoryCount} more</p>
                          )}
                        </td>
                        <td>
                          {hasSalePrice ? (
                            <>
                              <strong>{formatPriceLabel(salePriceValue)}</strong>
                              <p className="modal__meta">Was {formatPriceLabel(product.price)}</p>
                            </>
                          ) : (
                            formatPriceLabel(product.price)
                          )}
                        </td>
                        <td>
                          <span className={`admin-status admin-status--stock-${stockStatus.state}`}>
                            {stockLabel}
                          </span>
                          <p className="modal__meta">
                            Qty: {stockStatus.quantity ?? "â€”"}
                          </p>
                          {stockStatus.state === "preorder" && preorderSendMonthLabel && (
                            <p className="modal__meta">Send month: {preorderSendMonthLabel}</p>
                          )}
                        </td>
                        <td>
                          <button
                            className={`icon-btn icon-btn--featured${
                              product.featured ? " is-active" : ""
                            }`}
                            type="button"
                            aria-pressed={product.featured ? "true" : "false"}
                            onClick={() => handleToggleFeaturedProduct(product)}
                            disabled={!inventoryEnabled || featuredUpdatingId === product.id}
                            title={
                              product.featured ?
                                 "Remove from home page features"
                                : "Feature on home page"
                            }
                          >
                            <IconStar filled={Boolean(product.featured)} aria-hidden="true" />
                          </button>
                        </td>
                        <td>{updatedAt}</td>
                        <td className="admin-table__actions">
                          <button
                            className="icon-btn"
                            type="button"
                            onClick={() => handleEditProduct(product)}
                          >
                            <IconEdit aria-hidden="true" />
                          </button>
                          <button
                            className="icon-btn icon-btn--danger"
                            type="button"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
                            <IconTrash aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="admin-panel__notice">
                {activeTab === "subscriptions"
                  ? "No subscription plans found. Add your first subscription plan."
                  : "No products found. Add your first item."}
              </p>
            )}
            {activeTab === "products" && (
              <p className="modal__meta">
                {featuredProductCount}/{MAX_FEATURED_PRODUCTS} products featured on the home page.
              </p>
            )}
            <AdminPagination page={productPage} total={managedProducts.length} onPageChange={setProductPage} />
            {inventoryLoading && (
              <p className="modal__meta">Syncing latest products...</p>
            )}
            {inventoryError && (
              <p className="admin-panel__error">{inventoryError}</p>
            )}
            {statusMessage && (
              <p className="admin-panel__status">{statusMessage}</p>
            )}
          </div>
        </div>
      )}

      <div
        className={`modal admin-modal ${isProductModalOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isProductModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeProductModal();
        }}
      >
        <div className="modal__content admin-modal__content">
          <button
            className="modal__close"
            type="button"
            aria-label="Close"
            onClick={closeProductModal}
          >
            &times;
          </button>
          <h3 className="modal__title">
            {editingProductId
              ? activeTab === "subscriptions"
                ? "Edit Subscription Plan"
                : "Edit Product"
              : activeTab === "subscriptions"
                ? "Add Subscription Plan"
                : "Add Product"}
          </h3>
          <form className="admin-form" onSubmit={handleCreateProduct}>
            <div className="admin-form__section admin-form__full">
              <div className="admin-form__section-header">
                <h4>General</h4>
                <span className={`badge badge--stock-${currentStockStatus.state || "in"}`}>
                  {currentStockStatus.label}
                </span>
              </div>
              <div className="admin-form__section-grid">
                <label className="admin-form__field">
                  Title *
                  <input
                    className="input"
                    value={productForm.title}
                    onChange={(event) =>
                      setProductForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="admin-form__field admin-form__field--inline">
                  Slug *
                  <div className="admin-form__inline">
                    <input
                      className="input"
                      value={productForm.slug}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, slug: event.target.value }))
                      }
                      required
                    />
                    <button
                      className="btn btn--secondary btn--small"
                      type="button"
                      onClick={() =>
                        setProductForm((prev) => ({
                          ...prev,
                          slug: slugifyId(prev.title || prev.slug || ""),
                        }))
                      }
                    >
                      Use title
                    </button>
                  </div>
                </label>
                <label className="admin-form__field">
                  Gift card product
                  <select
                    className="input"
                    value={productForm.isGiftCard ? "yes" : "no"}
                    onChange={(event) => handleToggleGiftCardProduct(event.target.value === "yes")}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
                {!productForm.isGiftCard && (
                  <>
                    <label className="admin-form__field">
                      Price *
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={productForm.price}
                        onChange={(event) =>
                          setProductForm((prev) => ({ ...prev, price: event.target.value }))
                        }
                        required
                      />
                    </label>
                    <label className="admin-form__field">
                      Sale price
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={productForm.salePrice}
                        onChange={(event) =>
                          setProductForm((prev) => ({ ...prev, salePrice: event.target.value }))
                        }
                      />
                    </label>
                  </>
                )}
                <label className="admin-form__field">
                  Stock status
                  <select
                    className="input"
                    value={productForm.stockStatus}
                    onChange={(event) =>
                      setProductForm((prev) => ({ ...prev, stockStatus: event.target.value }))
                    }
                    disabled={productForm.isGiftCard}
                  >
                    <option value="in_stock">In stock</option>
                    <option value="out_of_stock">Out of stock</option>
                    <option value="preorder">Preorder</option>
                  </select>
                </label>
                {!productForm.isGiftCard && (
                  <label className="admin-form__field">
                    Preorder send month
                    <input
                      className="input"
                      type="month"
                      value={productForm.preorderSendMonth}
                      onChange={(event) =>
                        setProductForm((prev) => ({
                          ...prev,
                          preorderSendMonth: normalizePreorderSendMonth(event.target.value),
                        }))
                      }
                      disabled={productForm.stockStatus !== "preorder"}
                    />
                  </label>
                )}
                {productForm.isGiftCard ? (
                  <div className="admin-form__field">
                    <span className="admin-panel__note">
                      Stock quantity is unlimited for digital gift card products.
                    </span>
                  </div>
                ) : productForm.hasVariants ? (
                  <div className="admin-form__field">
                    <span className="admin-panel__note">
                      Base stock quantity is disabled for variant products and will be saved as null.
                    </span>
                  </div>
                ) : (
                  <label className="admin-form__field">
                    Stock quantity
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stockQuantity}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, stockQuantity: event.target.value }))
                      }
                    />
                  </label>
                )}
                <label className="admin-form__field">
                  Status
                  <select
                    className="input"
                    value={productForm.status}
                    onChange={(event) =>
                      setProductForm((prev) => ({ ...prev, status: event.target.value }))
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="live">Live</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="admin-form__field">
                  Featured on home page
                  <select
                    className="input"
                    value={productForm.featured ? "yes" : "no"}
                    onChange={(event) =>
                      setProductForm((prev) => ({ ...prev, featured: event.target.value === "yes" }))
                    }
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
                <div className="admin-form__field admin-form__full">
                  <label>Categories</label>
                  {categoryOptions.length ? (
                    <>
                      <select
                        className="input"
                        value={productForm.categoryIds[0] || ""}
                        onChange={(event) => handleSingleSelectChange("categoryIds", event)}
                      >
                        <option value="">Select a category</option>
                        {categoryOptions.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <p className="admin-panel__note">Create a category to organize products.</p>
                  )}
                </div>
                <div className="admin-form__field admin-form__full">
                  <label>Tags</label>
                  {tagOptions.length ? (
                    <select
                      className="input"
                      value={productForm.tagIds[0] || ""}
                      onChange={(event) => handleSingleSelectChange("tagIds", event)}
                    >
                      <option value="">Select a tag (optional)</option>
                      {tagOptions.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="admin-panel__note">No tags yet. Add one below.</p>
                  )}
                  <div className="admin-inline-form">
                    <input
                      className="input"
                      placeholder="New tag"
                      value={tagForm.name}
                      onChange={(event) => setTagForm({ name: event.target.value })}
                    />
                    <button
                      className="btn btn--secondary btn--small"
                      type="button"
                      onClick={handleCreateTag}
                      disabled={tagSaving || !inventoryEnabled}
                    >
                      {tagSaving ? "Saving..." : "Add tag"}
                    </button>
                  </div>
                  {tagError && <p className="admin-panel__error">{tagError}</p>}
                  {tagStatusMessage && <p className="admin-panel__status">{tagStatusMessage}</p>}
                </div>
              </div>
            </div>

            {productForm.isGiftCard && (
              <div className="admin-form__section admin-form__full">
                <div className="admin-form__section-header">
                  <h4>Gift Card Test</h4>
                </div>
                <div className="admin-form__section-grid">
                  <label className="admin-form__field admin-form__full">
                    Test recipient email
                    <input
                      className="input"
                      type="email"
                      value={testGiftCardEmail}
                      onChange={(event) => setTestGiftCardEmail(event.target.value)}
                      placeholder="admin@bethanyblooms.co.za"
                    />
                  </label>
                  <label className="admin-form__field admin-form__full">
                    Purchaser name (optional)
                    <input
                      className="input"
                      type="text"
                      maxLength={120}
                      value={testGiftCardPurchaserName}
                      onChange={(event) => setTestGiftCardPurchaserName(event.target.value)}
                      placeholder="Name of purchaser"
                    />
                  </label>
                  <label className="admin-form__field admin-form__full">
                    Recipient name (optional)
                    <input
                      className="input"
                      type="text"
                      maxLength={120}
                      value={testGiftCardRecipientName}
                      onChange={(event) => setTestGiftCardRecipientName(event.target.value)}
                      placeholder="Name on the gift card"
                    />
                  </label>
                  <label className="admin-form__field admin-form__full">
                    Test message (optional)
                    <textarea
                      className="input textarea"
                      rows="3"
                      maxLength={320}
                      value={testGiftCardMessage}
                      onChange={(event) => setTestGiftCardMessage(event.target.value)}
                      placeholder="Short message for the card"
                    />
                  </label>
                  <div className="admin-form__field admin-form__full">
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={handleSendTestGiftCard}
                      disabled={testGiftCardSending || !inventoryEnabled || !functionsInstance}
                    >
                      {testGiftCardSending ? "Sending test..." : "Send test gift card"}
                    </button>
                    <p className="admin-panel__note">
                      This sends a test gift card email and generates a live gift card page + PDF without using PayFast
                      or EFT checkout.
                    </p>
                  </div>
                  {testGiftCardResult?.giftCard?.accessUrl && (
                    <div className="admin-form__field admin-form__full">
                      <p className="admin-panel__status">
                        Test gift card created.
                        {testGiftCardResult.emailStatus === "sent" ?
                           ` Email sent to ${testGiftCardResult.recipientEmail || testGiftCardEmail}.`
                          : testGiftCardResult.emailStatus === "failed" ?
                           ` Email failed: ${testGiftCardResult.emailError || "Unknown error"}.`
                          : " Email was not sent, but preview links are ready."}
                      </p>
                      {testGiftCardResult?.giftCard?.code && (
                        <p className="admin-panel__note">
                          <strong>Card code:</strong> {testGiftCardResult.giftCard.code}
                        </p>
                      )}
                      <div className="admin-form__actions">
                        <a
                          className="btn btn--secondary btn--small"
                          href={testGiftCardResult.giftCard.accessUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open gift card page
                        </a>
                        <a
                          className="btn btn--secondary btn--small"
                          href={testGiftCardResult.giftCard.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download test PDF
                        </a>
                        <a
                          className="btn btn--secondary btn--small"
                          href={testGiftCardResult.giftCard.printUrl || testGiftCardResult.giftCard.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open print view
                        </a>
                      </div>
                    </div>
                  )}
                  {testGiftCardError && (
                    <p className="admin-panel__error admin-form__full">{testGiftCardError}</p>
                  )}
                </div>
              </div>
            )}

            <div className="admin-form__section admin-form__full">
              <div className="admin-form__section-header">
                <h4>Descriptions</h4>
              </div>
              <div className="admin-form__section-grid">
                <label className="admin-form__field admin-form__full">
                  Short description
                  <textarea
                    className="input textarea"
                    rows="4"
                    value={productForm.shortDescription}
                    onChange={(event) =>
                      setProductForm((prev) => ({ ...prev, shortDescription: event.target.value }))
                    }
                  />
                </label>
                <label className="admin-form__field admin-form__full">
                  Long description
                  <textarea
                    className="input textarea"
                    rows="6"
                    value={productForm.longDescription}
                    onChange={(event) =>
                      setProductForm((prev) => ({ ...prev, longDescription: event.target.value }))
                    }
                  />
                </label>
                <p className="admin-panel__note admin-form__full">
                  Plain text only. Line breaks will be preserved on the product page. SEO metadata is generated from the
                  title and short description.
                </p>
              </div>
            </div>

            <div className="admin-form__section admin-form__full">
              <div className="admin-form__section-header">
                <h4>Media</h4>
              </div>
              <div className="admin-form__section-grid">
                <div className="admin-form__field admin-form__full">
                  <label htmlFor="product-main-image">Main image</label>
                  <input
                    className="input input--file"
                    id="product-main-image"
                    type="file"
                    accept="image/*"
                    ref={productMainImageInputRef}
                    onChange={handleMainImageChange}
                  />
                  <div className="admin-media-picker">
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => openMediaLibrary("main")}
                    >
                      Choose from library
                    </button>
                  </div>
                  {productMainImagePreview && (
                    <div className="admin-preview-grid">
                      <div className="admin-preview-card">
                        <img src={productMainImagePreview} alt="Main product preview" className="admin-preview" loading="lazy" decoding="async"/>
                        <button
                          className="icon-btn icon-btn--danger admin-preview-remove"
                          type="button"
                          onClick={handleRemoveMainImage}
                          aria-label="Remove main image"
                        >
                          <IconTrash aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {productForm.isGiftCard ? (
                  <p className="admin-panel__note admin-form__full">
                    Gift cards use a single main image only.
                  </p>
                ) : (
                  <>
                    <div className="admin-form__field admin-form__full">
                      <label htmlFor="product-gallery-images">Gallery images</label>
                      <input
                        key={editingProductId ?? "new-product-gallery"}
                        className="input input--file"
                        id="product-gallery-images"
                        type="file"
                        accept="image/*"
                        multiple
                        ref={productGalleryImageInputRef}
                        onChange={handleGalleryImagesChange}
                      />
                      <div className="admin-media-picker">
                        <button
                          className="btn btn--secondary"
                          type="button"
                          onClick={() => openMediaLibrary("gallery")}
                        >
                          Choose from library
                        </button>
                      </div>
                      <p className="admin-panel__note">
                        Upload up to {MAX_PRODUCT_IMAGES} JPG or PNG files (max 3MB each).
                      </p>
                      {productGalleryPreviews.length > 0 && (
                        <div className="admin-preview-grid">
                          {productGalleryPreviews.map((preview, index) => (
                            <div className="admin-preview-card" key={`${preview}-${index}`}>
                              <img
                                src={preview}
                                alt={`Product gallery preview ${index + 1}`}
                                className="admin-preview" loading="lazy" decoding="async"/>
                              <button
                                className="icon-btn icon-btn--danger admin-preview-remove"
                                type="button"
                                onClick={() => handleRemoveGalleryImage(index)}
                                aria-label={`Remove gallery image ${index + 1}`}
                              >
                                <IconTrash aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <label className="admin-form__field admin-form__full">
                      Video from YouTube
                      <textarea
                        className="input textarea"
                        rows="3"
                        value={productForm.videoEmbed}
                        onChange={(event) =>
                          setProductForm((prev) => ({ ...prev, videoEmbed: event.target.value }))
                        }
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </label>
                  </>
                )}
              </div>
            </div>

            {!productForm.isGiftCard && (
              <div className="admin-form__section admin-form__full">
                <div className="admin-form__section-header">
                  <h4>Attributes</h4>
                </div>
                <div className="admin-form__section-grid">
                  <label className="admin-form__field">
                    Sunlight
                    <select
                      className="input"
                      value={productForm.sunlight}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, sunlight: event.target.value }))
                      }
                    >
                      <option value="">Select sunlight</option>
                      <option value="full_sun">Full sun</option>
                      <option value="partial_shade">Partial shade</option>
                      <option value="shade">Shade</option>
                    </select>
                  </label>
                  <label className="admin-form__field">
                    Soil type
                    <input
                      className="input"
                      value={productForm.soilType}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, soilType: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field">
                    Watering
                    <input
                      className="input"
                      value={productForm.watering}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, watering: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field">
                    Climate
                    <input
                      className="input"
                      value={productForm.climate}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, climate: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field">
                    Planting depth
                    <input
                      className="input"
                      value={productForm.plantingDepth}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, plantingDepth: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field">
                    Planting spacing
                    <input
                      className="input"
                      value={productForm.plantingSpacing}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, plantingSpacing: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field">
                    Best planting time
                    <input
                      className="input"
                      value={productForm.bestPlantingTime}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, bestPlantingTime: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field">
                    Bloom period
                    <input
                      className="input"
                      value={productForm.bloomPeriod}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, bloomPeriod: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field">
                    Flower color
                    <input
                      className="input"
                      value={productForm.flowerColor}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, flowerColor: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field">
                    Mature height
                    <input
                      className="input"
                      value={productForm.matureHeight}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, matureHeight: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field admin-form__full">
                    Pest issues
                    <textarea
                      className="input textarea"
                      rows="2"
                      value={productForm.pestIssues}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, pestIssues: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field admin-form__full">
                    Disease info
                    <textarea
                      className="input textarea"
                      rows="2"
                      value={productForm.diseaseInfo}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, diseaseInfo: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field admin-form__full">
                    Propagation
                    <textarea
                      className="input textarea"
                      rows="2"
                      value={productForm.propagation}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, propagation: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field admin-form__full">
                    Companions
                    <textarea
                      className="input textarea"
                      rows="2"
                      value={productForm.companions}
                      onChange={(event) =>
                        setProductForm((prev) => ({ ...prev, companions: event.target.value }))
                      }
                    />
                  </label>
                </div>
              </div>
            )}

            {!productForm.isGiftCard && (
              <div className="admin-form__section admin-form__full">
                <div className="admin-form__section-header">
                  <h4>Variants</h4>
                </div>
                <div className="admin-form__section-grid">
                  <label className="admin-form__field">
                    Has variants
                    <select
                      className="input"
                      value={productForm.hasVariants ? "yes" : "no"}
                      onChange={(event) => handleToggleHasVariants(event.target.value === "yes")}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </label>
                  <p className="admin-panel__note admin-form__full">
                    Add size, colour, shape, or other variants when enabled. Leave price blank to use the base price
                    and set stock per variant.
                  </p>
                  {productForm.hasVariants ? (
                    <>
                      {(productForm.variants || []).map((variant, index) => (
                        <div className="admin-session-row" key={variant.id}>
                          <div className="admin-session-field admin-session-field--label">
                            <label
                              className="admin-session-label"
                              htmlFor={`product-variant-label-${variant.id}`}
                            >
                              Variant #{index + 1}
                            </label>
                            <input
                              className="input"
                              id={`product-variant-label-${variant.id}`}
                              value={variant.label}
                              onChange={(event) =>
                                handleProductVariantChange(variant.id, "label", event.target.value)
                              }
                              placeholder="Small, Red, Round, etc."
                            />
                          </div>
                          <div className="admin-session-field">
                            <label
                              className="admin-session-label"
                              htmlFor={`product-variant-price-${variant.id}`}
                            >
                              Price (optional)
                            </label>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="0.01"
                              id={`product-variant-price-${variant.id}`}
                              value={variant.price}
                              onChange={(event) =>
                                handleProductVariantChange(variant.id, "price", event.target.value)
                              }
                              placeholder="0.00"
                            />
                          </div>
                          <div className="admin-session-field">
                            <label
                              className="admin-session-label"
                              htmlFor={`product-variant-quantity-${variant.id}`}
                            >
                              Quantity
                            </label>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="1"
                              id={`product-variant-quantity-${variant.id}`}
                              value={variant.quantity ?? ""}
                              onChange={(event) =>
                                handleProductVariantChange(variant.id, "quantity", event.target.value)
                              }
                              placeholder="0"
                            />
                          </div>
                          <button
                            className="icon-btn icon-btn--danger admin-session-remove"
                            type="button"
                            onClick={() => handleRemoveProductVariant(variant.id)}
                            aria-label={`Remove variant ${index + 1}`}
                          >
                            <IconTrash aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      <button className="btn btn--secondary" type="button" onClick={handleAddProductVariant}>
                        Add variant
                      </button>
                    </>
                  ) : (
                    <p className="modal__meta admin-form__full">No variants added.</p>
                  )}
                </div>
              </div>
            )}

            {!productForm.isGiftCard && (
              <div className="admin-form__section admin-form__full">
                <div className="admin-form__section-header">
                  <h4>Related products</h4>
                </div>
                <div className="admin-form__section-grid">
                  <div className="admin-form__field admin-form__full">
                    <label>Related products</label>
                    <select
                      className="input"
                      value={productForm.relatedProductIds[0] || ""}
                      onChange={(event) => handleSingleSelectChange("relatedProductIds", event)}
                    >
                      <option value="">Select a related product</option>
                      {products
                        .filter((product) => product.id !== editingProductId)
                        .map((product) => (
                          <option key={`related-${product.id}`} value={product.id}>
                            {product.title || product.name || "Product"}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="admin-form__field admin-form__full">
                    <label>Upsell products</label>
                    <select
                      className="input"
                      value={productForm.upsellProductIds[0] || ""}
                      onChange={(event) => handleSingleSelectChange("upsellProductIds", event)}
                    >
                      <option value="">Select an upsell product</option>
                      {products
                        .filter((product) => product.id !== editingProductId)
                        .map((product) => (
                          <option key={`upsell-${product.id}`} value={product.id}>
                            {product.title || product.name || "Product"}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="admin-form__field admin-form__full">
                    <label>Cross-sell products</label>
                    <select
                      className="input"
                      value={productForm.crossSellProductIds[0] || ""}
                      onChange={(event) => handleSingleSelectChange("crossSellProductIds", event)}
                    >
                      <option value="">Select a cross-sell product</option>
                      {products
                        .filter((product) => product.id !== editingProductId)
                        .map((product) => (
                          <option key={`cross-${product.id}`} value={product.id}>
                            {product.title || product.name || "Product"}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="admin-modal__actions admin-form__actions">
              <button
                className="btn btn--secondary"
                type="button"
                onClick={closeProductModal}
                disabled={productSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                type="submit"
                disabled={productSaving || !inventoryEnabled}
              >
                {productSaving ?
                   "Saving..."
                  : editingProductId ?
                   "Update Product"
                  : "Save Product"}
              </button>
            </div>
            {productError && (
              <p className="admin-panel__error">{productError}</p>
            )}
          </form>
        </div>
      </div>

      {mediaLibraryOpen && (
        <div
          className="modal is-active admin-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="media-library-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeMediaLibrary();
          }}
        >
          <div className="modal__content admin-modal__content admin-media-modal">
            <button className="modal__close" type="button" onClick={closeMediaLibrary} aria-label="Close">
              &times;
            </button>
            <h3 className="modal__title" id="media-library-title">
              {mediaLibraryMode === "main" ?
                 "Select main image"
                : mediaLibraryMode === "category" ?
                 "Select category cover"
                : "Select gallery images"}
            </h3>
            <p className="modal__meta">
              {mediaLibraryMode === "main" ?
                 "Tap an image to use it as the main product image."
                : mediaLibraryMode === "category" ?
                 "Tap an image to use it as the category cover."
                : `Select up to ${MAX_PRODUCT_IMAGES} images for the gallery.`}
            </p>
            {mediaItemsError && (
              <p className="admin-panel__error">Unable to load the image library.</p>
            )}
            {mediaStatus === "loading" && (
              <p className="admin-panel__notice">Loading images...</p>
            )}
            {mediaItems.length > 0 ? (
              <div className="admin-media__grid admin-media__grid--compact">
                {mediaItems.map((item) => {
                  const imageUrl = (item.url || "").toString().trim();
                  const label = (item.name || item.filename || item.id || "Image").toString();
                  const isSelected =
                    mediaLibraryMode === "main" ?
                       imageUrl && productForm.mainImage === imageUrl
                      : imageUrl && mediaLibrarySelection.includes(imageUrl);
                  return (
                    <button
                      key={item.id}
                      className={`admin-media__card admin-media__card--select${isSelected ? " is-selected" : ""}`}
                      type="button"
                      onClick={() => handleMediaLibrarySelect(imageUrl)}
                      title={label}
                    >
                      {imageUrl ? (
                        <img
                          className="admin-media__thumb"
                          src={imageUrl}
                          alt={label}
                          loading="lazy" decoding="async"/>
                      ) : (
                        <div className="admin-media__thumb admin-media__thumb--empty">
                          <IconImage aria-hidden="true" />
                        </div>
                      )}
                      <div className="admin-media__body">
                        <strong className="admin-media__filename">{label}</strong>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="admin-panel__notice">No images in the library yet.</p>
            )}
            {mediaLibraryMode === "gallery" && (
              <div className="admin-form__actions">
                <button className="btn btn--secondary" type="button" onClick={closeMediaLibrary}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="button" onClick={applyMediaLibrarySelection}>
                  Use selection
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminSubscriptionsView() {
  usePageMetadata({
    title: "Admin Â· Subscriptions",
    description: "Create and manage flower subscription plans.",
  });

  const {
    db,
    user,
    productCategories,
    inventoryEnabled,
    inventoryError,
  } = useAdminData();
  const {
    items: subscriptionPlans,
    status: plansStatus,
    error: plansError,
  } = useFirestoreCollection("subscriptionPlans", {
    orderByField: "updatedAt",
    orderDirection: "desc",
  });

  const [planForm, setPlanForm] = useState(INITIAL_SUBSCRIPTION_PLAN_FORM);
  const [isPlanModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [planDeleting, setPlanDeleting] = useState(false);
  const [planError, setPlanError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [pendingDeletePlan, setPendingDeletePlan] = useState(null);

  const categoryOptions = useMemo(
    () =>
      (Array.isArray(productCategories) ? productCategories : [])
        .map((category) => {
          const id = (category?.id || "").toString().trim();
          if (!id) return null;
          return {
            id,
            name: (category?.name || category?.title || id).toString().trim(),
          };
        })
        .filter(Boolean),
    [productCategories],
  );

  const categoryLookup = useMemo(() => {
    const map = new Map();
    categoryOptions.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categoryOptions]);

  const resolvedMonthlyAmount = useMemo(
    () => resolveSubscriptionPlanMonthlyAmount(planForm.monthlyAmount),
    [planForm.monthlyAmount],
  );

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (isPlanModalOpen || editingPlanId || planForm.categoryId || !categoryOptions.length) return;
    setPlanForm((prev) => ({
      ...prev,
      categoryId: categoryOptions[0].id,
    }));
  }, [categoryOptions, editingPlanId, isPlanModalOpen, planForm.categoryId]);

  const resetPlanForm = () => {
    setPlanForm({
      ...INITIAL_SUBSCRIPTION_PLAN_FORM,
      categoryId: categoryOptions[0]?.id || "",
    });
  };

  const openCreatePlanModal = () => {
    resetPlanForm();
    setEditingPlanId(null);
    setPlanError(null);
    setPlanModalOpen(true);
  };

  const closePlanModal = () => {
    setPlanModalOpen(false);
    setEditingPlanId(null);
    setPlanSaving(false);
    setPlanError(null);
  };

  const handleEditPlan = (plan) => {
    if (!plan) return;
    const normalizedTier = normalizeSubscriptionPlanTierValue(plan.tier) || "weekly";
    const normalizedStems = normalizeSubscriptionPlanStemsValue(plan.stems) || 16;
    const normalizedStatus = ["live", "draft", "archived"].includes(
      (plan?.status || "").toString().trim().toLowerCase(),
    )
      ? plan.status.toString().trim().toLowerCase()
      : "draft";
    setPlanForm({
      name: (plan?.name || "").toString().trim(),
      description: (plan?.description || "").toString(),
      categoryId: (plan?.categoryId || "").toString().trim(),
      tier: normalizedTier,
      stems: String(normalizedStems),
      monthlyAmount:
        plan?.monthlyAmount === undefined || plan?.monthlyAmount === null ?
           ""
          : String(plan.monthlyAmount),
      status: normalizedStatus,
      image: (plan?.image || "").toString().trim(),
    });
    setEditingPlanId(plan.id);
    setPlanError(null);
    setPlanModalOpen(true);
  };

  const handleSavePlan = async (event) => {
    event.preventDefault();
    if (!db || !inventoryEnabled) {
      setPlanError("You do not have permission to update subscription plans.");
      return;
    }

    const name = (planForm.name || "").toString().trim();
    const description = sanitizePlainText((planForm.description || "").toString().trim());
    const categoryId = (planForm.categoryId || "").toString().trim();
    const tier = normalizeSubscriptionPlanTierValue(planForm.tier);
    const stems = normalizeSubscriptionPlanStemsValue(planForm.stems);
    const monthlyAmount = resolveSubscriptionPlanMonthlyAmount(planForm.monthlyAmount);
    const image = (planForm.image || "").toString().trim();
    const statusValue = (planForm.status || "").toString().trim().toLowerCase();
    const status = ["live", "draft", "archived"].includes(statusValue) ? statusValue : "draft";
    const category = categoryLookup.get(categoryId) || null;

    if (!name) {
      setPlanError("Plan name is required.");
      return;
    }
    if (!categoryId || !category) {
      setPlanError("Choose a valid category.");
      return;
    }
    if (!tier || !stems) {
      setPlanError("Select a valid tier and stems option.");
      return;
    }
    if (!monthlyAmount) {
      setPlanError("Enter a valid per-delivery price.");
      return;
    }

    try {
      setPlanSaving(true);
      setPlanError(null);
      const payload = {
        name,
        description,
        categoryId: category.id,
        categoryName: category.name || category.id,
        tier,
        stems,
        monthlyAmount,
        currency: "ZAR",
        status,
        image,
        updatedAt: serverTimestamp(),
        updatedByUid: (user?.uid || "").toString().trim() || null,
      };

      if (editingPlanId) {
        await updateDoc(doc(db, "subscriptionPlans", editingPlanId), payload);
        setStatusMessage("Subscription plan updated.");
      } else {
        await addDoc(collection(db, "subscriptionPlans"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdByUid: (user?.uid || "").toString().trim() || null,
        });
        setStatusMessage("Subscription plan saved.");
      }
      closePlanModal();
    } catch (error) {
      setPlanError(error.message || "Unable to save subscription plan.");
    } finally {
      setPlanSaving(false);
    }
  };

  const handleDeletePlan = async () => {
    const planId = (pendingDeletePlan?.id || "").toString().trim();
    if (!planId || !db || !inventoryEnabled) {
      setPendingDeletePlan(null);
      return;
    }
    try {
      setPlanDeleting(true);
      await deleteDoc(doc(db, "subscriptionPlans", planId));
      setStatusMessage("Subscription plan removed.");
      setPendingDeletePlan(null);
    } catch (error) {
      setPlanError(error.message || "Unable to remove subscription plan.");
    } finally {
      setPlanDeleting(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <div className="admin-panel__header">
        <div>
          <h2>Subscriptions</h2>
          <p className="admin-panel__note">
            Create standalone subscription plans and set per-delivery pricing manually.
          </p>
        </div>
        <div className="admin-panel__header-actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={openCreatePlanModal}
            disabled={!inventoryEnabled}
          >
            <IconPlus className="btn__icon" aria-hidden="true" />
            Add Subscription Plan
          </button>
        </div>
      </div>

      <div className="admin-panel__content">
        <div className="admin-table__wrapper">
          {plansStatus === "loading" && (
            <p className="modal__meta">Syncing latest subscription plans...</p>
          )}
          {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
          {plansError && <p className="admin-panel__error">{plansError.message || "Unable to load plans."}</p>}
          {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
          {planError && <p className="admin-panel__error">{planError}</p>}
          {subscriptionPlans.length > 0 ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col">Category</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Stems</th>
                  <th scope="col">Per delivery</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col" className="admin-table__actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {subscriptionPlans.map((plan) => {
                  const updatedAt = plan.updatedAt?.toDate?.()
                    ? bookingDateFormatter.format(plan.updatedAt.toDate())
                    : "â€”";
                  const categoryName =
                    (plan?.categoryName || categoryLookup.get((plan?.categoryId || "").toString().trim())?.name || "â€”")
                      .toString()
                      .trim();
                  const tierLabel = formatSubscriptionPlanTierLabel(plan?.tier);
                  const stemsValue = normalizeSubscriptionPlanStemsValue(plan?.stems);
                  const monthlyAmount = resolveSubscriptionPlanMonthlyAmount(plan?.monthlyAmount);
                  const status = (plan?.status || "draft").toString().trim().toLowerCase();
                  const statusLabel = status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : "Draft";
                  return (
                    <tr key={plan.id}>
                      <td>
                        <div className="admin-table__product">
                          {(plan?.image || "").toString().trim() ? (
                            <img
                              src={plan.image}
                              alt={plan.name || "Subscription plan"}
                              className="admin-table__thumb"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="admin-table__thumb admin-table__thumb--placeholder">
                              <IconImage aria-hidden="true" />
                            </span>
                          )}
                          <div>
                            <strong>{plan.name || "Subscription plan"}</strong>
                            {plan.description && <p className="modal__meta">{plan.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td>{categoryName || "â€”"}</td>
                      <td>{tierLabel}</td>
                      <td>{stemsValue || "â€”"}</td>
                      <td>{formatPriceLabel(monthlyAmount)}</td>
                      <td>
                        <span className="admin-status">
                          {statusLabel.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>{updatedAt}</td>
                      <td className="admin-table__actions">
                        <button
                          className="icon-btn"
                          type="button"
                          onClick={() => handleEditPlan(plan)}
                          disabled={!inventoryEnabled}
                          title="Edit plan"
                        >
                          <IconEdit aria-hidden="true" />
                        </button>
                        <button
                          className="icon-btn icon-btn--danger"
                          type="button"
                          onClick={() => setPendingDeletePlan(plan)}
                          disabled={!inventoryEnabled}
                          title="Delete plan"
                        >
                          <IconTrash aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="admin-panel__notice">
              No subscription plans found. Add your first subscription plan.
            </p>
          )}
        </div>
      </div>

      <div
        className={`modal admin-modal ${isPlanModalOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isPlanModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePlanModal();
        }}
      >
        <div className="modal__content admin-modal__content">
          <button className="modal__close" type="button" aria-label="Close" onClick={closePlanModal}>
            &times;
          </button>
          <h3 className="modal__title">{editingPlanId ? "Edit Subscription Plan" : "Add Subscription Plan"}</h3>
          <form className="admin-form" onSubmit={handleSavePlan}>
            <div className="admin-form__section admin-form__full">
              <div className="admin-form__section-header">
                <h4>Plan details</h4>
                <span className="badge">
                  {resolvedMonthlyAmount ? formatPriceLabel(resolvedMonthlyAmount) : "Set per-delivery price"}
                </span>
              </div>
              <div className="admin-form__section-grid">
                <label className="admin-form__field admin-form__full">
                  Plan name *
                  <input
                    className="input"
                    value={planForm.name}
                    onChange={(event) =>
                      setPlanForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="admin-form__field admin-form__full">
                  Description
                  <textarea
                    className="input textarea"
                    rows="4"
                    value={planForm.description}
                    onChange={(event) =>
                      setPlanForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </label>
                <label className="admin-form__field">
                  Category *
                  <select
                    className="input"
                    value={planForm.categoryId}
                    onChange={(event) =>
                      setPlanForm((prev) => ({ ...prev, categoryId: event.target.value }))
                    }
                    required
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-form__field">
                  Tier *
                  <select
                    className="input"
                    value={planForm.tier}
                    onChange={(event) =>
                      setPlanForm((prev) => ({ ...prev, tier: event.target.value }))
                    }
                    required
                  >
                    {SUBSCRIPTION_PLAN_TIERS.map((tierOption) => (
                      <option key={tierOption.value} value={tierOption.value}>
                        {tierOption.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-form__field">
                  Stems per delivery *
                  <select
                    className="input"
                    value={planForm.stems}
                    onChange={(event) =>
                      setPlanForm((prev) => ({ ...prev, stems: event.target.value }))
                    }
                    required
                  >
                    {SUBSCRIPTION_PLAN_STEM_OPTIONS.map((stemsOption) => (
                      <option key={stemsOption} value={stemsOption}>
                        {stemsOption}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-form__field">
                  Per-delivery price (ZAR) *
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={planForm.monthlyAmount}
                    onChange={(event) =>
                      setPlanForm((prev) => ({ ...prev, monthlyAmount: event.target.value }))
                    }
                    placeholder="0.00"
                    required
                  />
                </label>
                <label className="admin-form__field">
                  Status
                  <select
                    className="input"
                    value={planForm.status}
                    onChange={(event) =>
                      setPlanForm((prev) => ({ ...prev, status: event.target.value }))
                    }
                  >
                    <option value="live">Live</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="admin-form__field admin-form__full">
                  Image URL (optional)
                  <input
                    className="input"
                    value={planForm.image}
                    onChange={(event) =>
                      setPlanForm((prev) => ({ ...prev, image: event.target.value }))
                    }
                    placeholder="https://..."
                  />
                </label>
                <p className="admin-panel__note admin-form__full">
                  Per-delivery pricing is set manually by admin and can be changed any time.
                </p>
              </div>
            </div>

            <div className="admin-modal__actions admin-form__actions">
              <button
                className="btn btn--secondary"
                type="button"
                onClick={closePlanModal}
                disabled={planSaving}
              >
                Cancel
              </button>
              <button className="btn btn--primary" type="submit" disabled={planSaving || !inventoryEnabled}>
                {planSaving ? "Saving..." : editingPlanId ? "Update Plan" : "Save Plan"}
              </button>
            </div>
            {planError && <p className="admin-panel__error">{planError}</p>}
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeletePlan)}
        title="Delete subscription plan"
        message={
          pendingDeletePlan
            ? `${pendingDeletePlan.name || "This plan"} will be removed and no longer available for new subscriptions.`
            : "This cannot be undone."
        }
        confirmLabel="Delete plan"
        busy={planDeleting}
        onCancel={() => setPendingDeletePlan(null)}
        onConfirm={handleDeletePlan}
      />
    </div>
  );
}

export function AdminSubscriptionOpsView() {
  usePageMetadata({
    title: "Admin - Subscription Ops",
    description: "Track customer subscriptions, payment status, and delivery-ready roster.",
  });

  const { inventoryEnabled } = useAdminData();
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const {
    items: subscriptions,
    status: subscriptionsStatus,
    error: subscriptionsError,
  } = useFirestoreCollection("subscriptions", {
    orderByField: "updatedAt",
    orderDirection: "desc",
  });
  const {
    items: subscriptionInvoices,
    status: invoicesStatus,
    error: invoicesError,
  } = useFirestoreCollection("subscriptionInvoices", {
    orderByField: "updatedAt",
    orderDirection: "desc",
  });
  const {
    items: subscriptionPlans,
    status: plansStatus,
    error: plansError,
  } = useFirestoreCollection("subscriptionPlans", {
    orderByField: "updatedAt",
    orderDirection: "desc",
  });

  const [selectedCycleMonth, setSelectedCycleMonth] = useState(() =>
    getCurrentJohannesburgCycleMonth(),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [deliveryReadinessFilter, setDeliveryReadinessFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [actionDrafts, setActionDrafts] = useState({});
  const [busySubscriptionId, setBusySubscriptionId] = useState("");
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [manageSubscriptionId, setManageSubscriptionId] = useState("");
  const [activeManageTab, setActiveManageTab] = useState(
    SUBSCRIPTION_OPS_MANAGE_DEFAULT_TAB,
  );

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 4200);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  const selectedCycleLabel = useMemo(
    () => formatCycleMonthLabel(selectedCycleMonth),
    [selectedCycleMonth],
  );

  const liveSubscriptionPlans = useMemo(
    () =>
      (Array.isArray(subscriptionPlans) ? subscriptionPlans : [])
        .filter((plan) => ((plan?.status || "").toString().trim().toLowerCase() || "draft") === "live")
        .sort((left, right) => {
          const leftName = (left?.name || "").toString().toLowerCase();
          const rightName = (right?.name || "").toString().toLowerCase();
          if (leftName !== rightName) return leftName.localeCompare(rightName);
          return (left?.id || "").toString().localeCompare((right?.id || "").toString());
        }),
    [subscriptionPlans],
  );

  const cycleInvoicesBySubscription = useMemo(() => {
    const map = new Map();
    (Array.isArray(subscriptionInvoices) ? subscriptionInvoices : []).forEach((invoice) => {
      const subscriptionId = (invoice?.subscriptionId || "").toString().trim();
      if (!subscriptionId) return;
      const invoiceCycle = normalizeCycleMonthValue(invoice?.cycleMonth || "");
      if (!invoiceCycle || invoiceCycle !== selectedCycleMonth) return;
      const existingRows = map.get(subscriptionId) || [];
      map.set(subscriptionId, [...existingRows, invoice]);
    });
    map.forEach((rows, subscriptionId) => {
      map.set(
        subscriptionId,
        [...rows].sort((left, right) => {
          const leftTime = parseDateValue(left?.updatedAt || left?.createdAt)?.getTime() || 0;
          const rightTime = parseDateValue(right?.updatedAt || right?.createdAt)?.getTime() || 0;
          return rightTime - leftTime;
        }),
      );
    });
    return map;
  }, [selectedCycleMonth, subscriptionInvoices]);

  const baseInvoiceBySubscription = useMemo(() => {
    const map = new Map();
    cycleInvoicesBySubscription.forEach((rows, subscriptionId) => {
      const list = Array.isArray(rows) ? rows : [];
      const explicitCycle = list.find(
        (invoice) => normalizeSubscriptionInvoiceType(invoice?.invoiceType || "") === SUBSCRIPTION_INVOICE_TYPES.CYCLE,
      );
      if (explicitCycle) {
        map.set(subscriptionId, explicitCycle);
        return;
      }
      const legacyDefault = list.find((invoice) => {
        const type = (invoice?.invoiceType || "").toString().trim().toLowerCase();
        return !type || type === "cycle";
      });
      if (legacyDefault) {
        map.set(subscriptionId, legacyDefault);
      }
    });
    return map;
  }, [cycleInvoicesBySubscription, selectedCycleMonth]);

  const allRows = useMemo(() => {
    return (Array.isArray(subscriptions) ? subscriptions : [])
      .map((subscription) => {
        const subscriptionId = (subscription?.id || "").toString().trim();
        if (!subscriptionId) return null;

        const cycleInvoices = cycleInvoicesBySubscription.get(subscriptionId) || [];
        const invoice = baseInvoiceBySubscription.get(subscriptionId) || null;
        const topupInvoices = cycleInvoices.filter(
          (entry) =>
            normalizeSubscriptionInvoiceType(entry?.invoiceType || "") === SUBSCRIPTION_INVOICE_TYPES.TOPUP,
        );
        const subscriptionStatus = normalizeSubscriptionOpsStatus(subscription?.status);
        const invoiceStatus = invoice
          ? normalizeSubscriptionOpsInvoiceStatus(invoice?.status)
          : "missing";
        const invoiceType = invoice ? normalizeSubscriptionInvoiceType(invoice?.invoiceType || "") : "missing";
        const paymentMethod = normalizeSubscriptionOpsPaymentMethod(
          invoice?.paymentMethod || subscription?.paymentMethod || PAYMENT_METHODS.PAYFAST,
        );
        const paymentApprovalStatus = normalizeSubscriptionOpsPaymentApprovalStatus(
          invoice?.paymentApprovalStatus ||
            invoice?.paymentApproval?.decision ||
            subscription?.paymentApprovalStatus ||
            subscription?.paymentApproval?.decision ||
            "",
          paymentMethod,
        );
        const tier = normalizeSubscriptionPlanTierValue(
          subscription?.tier || subscription?.subscriptionPlan?.tier,
        );
        const stems = normalizeSubscriptionPlanStemsValue(
          subscription?.stems || subscription?.subscriptionPlan?.stems,
        );
        const planName = resolveSubscriptionDisplayPlanName(subscription);
        const customerName = (subscription?.customer?.fullName || "").toString().trim();
        const customerEmail = (subscription?.customer?.email || "").toString().trim();
        const customerPhone = (subscription?.customer?.phone || "").toString().trim();
        const address = subscription?.address || {};
        const city = (address?.city || "").toString().trim();
        const province = (address?.province || "").toString().trim();
        const addressLabel = formatShippingAddress(address);
        const invoiceAmount = Number(invoice?.amount || 0);
        const invoiceBaseAmount = Number(invoice?.baseAmount || invoice?.amount || 0);
        const invoiceAdjustmentsTotal = Number(invoice?.adjustmentsTotal || 0);
        const invoiceNumber =
          Number.isFinite(Number(invoice?.invoiceNumber))
            ? Number(invoice.invoiceNumber)
            : null;
        const invoiceId = (invoice?.id || invoice?.invoiceId || "").toString().trim();
        const topupPendingAmount = topupInvoices.reduce((sum, topupInvoice) => {
          const topupStatus = normalizeSubscriptionOpsInvoiceStatus(topupInvoice?.status || "");
          if (topupStatus !== "pending-payment") return sum;
          return sum + Number(topupInvoice?.amount || 0);
        }, 0);
        const topupCount = topupInvoices.length;
        const recurringCharges = Array.isArray(subscription?.billingCharges?.recurring)
          ? subscription.billingCharges.recurring.filter(
              (entry) => ((entry?.status || "").toString().trim().toLowerCase() || "active") === "active",
            )
          : [];
        const subscriptionPlanId = (
          subscription?.subscriptionPlan?.planId ||
          subscription?.subscriptionProduct?.productId ||
          ""
        ).toString().trim();
        const lastPaymentAt = parseDateValue(subscription?.lastPaymentAt);
        const paidAt = parseDateValue(invoice?.paidAt);
        const readyToSend = subscriptionStatus === "active" && invoiceStatus === "paid";
        const mondaySlots = normalizeSubscriptionMondaySlotsForTier(
          tier,
          invoice?.deliverySchedule?.slots || subscription?.deliveryPreference?.slots || [],
        );
        const cycleDeliveryDates =
          Array.isArray(invoice?.deliverySchedule?.cycleDeliveryDates) &&
          invoice.deliverySchedule.cycleDeliveryDates.length
            ? Array.from(
                new Set(
                  invoice.deliverySchedule.cycleDeliveryDates
                    .map((entry) => normalizeIsoDateValue(entry))
                    .filter(Boolean),
                ),
              ).sort((leftDate, rightDate) => compareIsoDateValues(leftDate, rightDate))
            : resolveSubscriptionCycleDeliveryDates({
                tier,
                slots: mondaySlots,
                cycleMonth: selectedCycleMonth,
              });
        const includedDeliveryDates =
          Array.isArray(invoice?.deliverySchedule?.includedDeliveryDates) &&
          invoice.deliverySchedule.includedDeliveryDates.length
            ? Array.from(
                new Set(
                  invoice.deliverySchedule.includedDeliveryDates
                    .map((entry) => normalizeIsoDateValue(entry))
                    .filter(Boolean),
                ),
              ).sort((leftDate, rightDate) => compareIsoDateValues(leftDate, rightDate))
            : cycleDeliveryDates;
        const mondaySlotLabel = mondaySlots
          .map((slot) => formatSubscriptionMondaySlotLabel(slot))
          .filter(Boolean)
          .join(", ");
        const cycleDeliveryLabel = formatSubscriptionDeliveryDateList(cycleDeliveryDates);
        const includedDeliveryLabel = formatSubscriptionDeliveryDateList(includedDeliveryDates);
        const expectedDeliveries =
          cycleDeliveryDates.length || resolveExpectedCycleDeliveries(tier);

        const searchText = [
          subscriptionId,
          customerName,
          customerEmail,
          customerPhone,
          planName,
          tier,
          stems ? `${stems}` : "",
          city,
          province,
          addressLabel,
          invoiceId,
          invoiceNumber ? `INV-${invoiceNumber}` : "",
          invoiceType,
          invoiceStatus,
          paymentMethod,
          paymentApprovalStatus,
          subscriptionStatus,
          subscriptionPlanId,
          topupCount ? `topups ${topupCount}` : "",
          topupPendingAmount ? `${topupPendingAmount}` : "",
          recurringCharges.map((entry) => entry?.label || "").join(" "),
          mondaySlotLabel,
          cycleDeliveryLabel,
          includedDeliveryLabel,
        ]
          .join(" ")
          .toLowerCase();

        return {
          subscriptionId,
          subscription,
          invoice,
          invoiceType,
          cycleInvoices,
          topupInvoices,
          topupCount,
          topupPendingAmount,
          invoiceId,
          invoiceNumber,
          invoiceStatus,
          paymentMethod,
          paymentApprovalStatus,
          subscriptionPlanId,
          recurringCharges,
          subscriptionStatus,
          tier,
          stems,
          planName,
          customerName,
          customerEmail,
          customerPhone,
          city,
          province,
          addressLabel,
          expectedDeliveries,
          invoiceAmount,
          invoiceBaseAmount,
          invoiceAdjustmentsTotal,
          lastPaymentAt,
          paidAt,
          mondaySlots,
          mondaySlotLabel,
          cycleDeliveryDates,
          cycleDeliveryLabel,
          includedDeliveryDates,
          includedDeliveryLabel,
          readyToSend,
          isMissingInvoice: !invoice,
          searchText,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.readyToSend !== right.readyToSend) {
          return left.readyToSend ? -1 : 1;
        }
        const leftName = (left.customerName || "").toLowerCase();
        const rightName = (right.customerName || "").toLowerCase();
        if (leftName !== rightName) return leftName.localeCompare(rightName);
        return left.subscriptionId.localeCompare(right.subscriptionId);
      });
  }, [baseInvoiceBySubscription, cycleInvoicesBySubscription, selectedCycleMonth, subscriptions]);

  const manageRow = useMemo(
    () =>
      allRows.find((row) => row.subscriptionId === manageSubscriptionId) || null,
    [allRows, manageSubscriptionId],
  );

  useEffect(() => {
    if (!manageSubscriptionId) return;
    if (!manageRow) {
      setManageSubscriptionId("");
      setActiveManageTab(SUBSCRIPTION_OPS_MANAGE_DEFAULT_TAB);
    }
  }, [manageRow, manageSubscriptionId]);

  const cityOptions = useMemo(() => {
    return Array.from(
      new Set(
        allRows
          .map((row) => (row.city || "").toString().trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }, [allRows]);

  const visibleRows = useMemo(() => {
    const normalizedSearch = searchTerm.toString().trim().toLowerCase();
    return allRows.filter((row) => {
      if (normalizedSearch && !row.searchText.includes(normalizedSearch)) return false;
      if (subscriptionStatusFilter !== "all" && row.subscriptionStatus !== subscriptionStatusFilter) {
        return false;
      }
      if (invoiceStatusFilter !== "all" && row.invoiceStatus !== invoiceStatusFilter) {
        return false;
      }
      if (paymentMethodFilter !== "all" && row.paymentMethod !== paymentMethodFilter) {
        return false;
      }
      if (deliveryReadinessFilter === "ready" && !row.readyToSend) {
        return false;
      }
      if (
        deliveryReadinessFilter === "payment-required" &&
        row.invoiceStatus !== "pending-payment" &&
        row.invoiceStatus !== "missing"
      ) {
        return false;
      }
      if (tierFilter !== "all" && row.tier !== tierFilter) return false;
      if (cityFilter !== "all" && row.city !== cityFilter) return false;
      if (provinceFilter !== "all" && row.province !== provinceFilter) return false;
      return true;
    });
  }, [
    allRows,
    cityFilter,
    deliveryReadinessFilter,
    invoiceStatusFilter,
    paymentMethodFilter,
    provinceFilter,
    searchTerm,
    subscriptionStatusFilter,
    tierFilter,
  ]);

  const readyToSendRows = useMemo(
    () => visibleRows.filter((row) => row.readyToSend),
    [visibleRows],
  );

  const metrics = useMemo(() => {
    const activeCount = allRows.filter((row) => row.subscriptionStatus === "active").length;
    const paidThisCycle = allRows.filter((row) => row.invoiceStatus === "paid").length;
    const pendingOrUnpaid = allRows.filter(
      (row) => row.invoiceStatus === "pending-payment" || row.invoiceStatus === "missing",
    ).length;
    const readyToSend = allRows.filter((row) => row.readyToSend).length;
    return [
      { id: "active", label: "Active subscriptions", value: activeCount },
      { id: "paid", label: "Paid this cycle", value: paidThisCycle },
      { id: "unpaid", label: "Pending / unpaid", value: pendingOrUnpaid },
      { id: "ready", label: "Ready to send", value: readyToSend },
    ];
  }, [allRows]);

  const getDraft = (subscriptionId, row) => {
    const draft = actionDrafts[subscriptionId];
    return {
      subscriptionStatus:
        draft?.subscriptionStatus || row.subscriptionStatus || "active",
      invoiceStatus:
        draft?.invoiceStatus || (row.invoiceStatus === "missing" ? "pending-payment" : row.invoiceStatus),
      paymentMethod: draft?.paymentMethod || row.paymentMethod || PAYMENT_METHODS.PAYFAST,
      applyToPendingInvoice: draft?.applyToPendingInvoice !== false,
      planId: (draft?.planId || row.subscriptionPlanId || "").toString(),
      chargeAmount: (draft?.chargeAmount || "").toString(),
      chargeLabel: (draft?.chargeLabel || "").toString(),
      chargeMode: normalizeSubscriptionChargeMode(draft?.chargeMode || "one-time"),
      chargeBasis: normalizeSubscriptionChargeBasis(draft?.chargeBasis || "flat"),
      reason: draft?.reason || "",
    };
  };

  const setDraftValue = (subscriptionId, key, value) => {
    setActionDrafts((prev) => ({
      ...prev,
      [subscriptionId]: {
        ...(prev[subscriptionId] || {}),
        [key]: value,
      },
    }));
  };

  const handleOpenManageSubscription = (row) => {
    if (!row?.subscriptionId) return;
    setManageSubscriptionId(row.subscriptionId);
    setActiveManageTab(SUBSCRIPTION_OPS_MANAGE_DEFAULT_TAB);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const handleManageTabKeyDown = (event) => {
    const key = event.key;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
    event.preventDefault();
    const currentIndex = Math.max(
      0,
      SUBSCRIPTION_OPS_MANAGE_TABS.findIndex((tab) => tab.id === activeManageTab),
    );
    if (key === "Home") {
      setActiveManageTab(SUBSCRIPTION_OPS_MANAGE_TABS[0].id);
      return;
    }
    if (key === "End") {
      setActiveManageTab(SUBSCRIPTION_OPS_MANAGE_TABS[SUBSCRIPTION_OPS_MANAGE_TABS.length - 1].id);
      return;
    }
    const direction = key === "ArrowLeft" ? -1 : 1;
    const nextIndex =
      (currentIndex + direction + SUBSCRIPTION_OPS_MANAGE_TABS.length) %
      SUBSCRIPTION_OPS_MANAGE_TABS.length;
    setActiveManageTab(SUBSCRIPTION_OPS_MANAGE_TABS[nextIndex].id);
  };

  const buildExportRows = (rows) => {
    const header = [
      "Cycle",
      "Subscription ID",
      "Customer",
      "Email",
      "Phone",
      "Plan",
      "Tier",
      "Stems",
      "Monday Slots",
      "Expected Deliveries",
      "Cycle Delivery Dates",
      "Included Delivery Dates",
      "Subscription Status",
      "Invoice Status",
      "Invoice Type",
      "Payment Method",
      "Payment Approval",
      "Paid for Cycle",
      "Delivery Eligible",
      "Invoice Number",
      "Invoice Amount",
      "Invoice Base Amount",
      "Invoice Adjustments",
      "Pending Top-up Amount",
      "Top-up Count",
      "Recurring Charges",
      "Ready To Send",
      "Address",
      "City",
      "Province",
      "Paid At",
      "Last Payment At",
    ];
    const body = rows.map((row) => [
      selectedCycleMonth,
      row.subscriptionId,
      row.customerName || "",
      row.customerEmail || "",
      row.customerPhone || "",
      row.planName || "",
      formatSubscriptionPlanTierLabel(row.tier),
      row.stems || "",
      row.mondaySlotLabel || "",
      row.expectedDeliveries || 0,
      row.cycleDeliveryLabel || "",
      row.includedDeliveryLabel || "",
      formatSubscriptionStatusLabel(row.subscriptionStatus),
      row.invoiceStatus === "missing" ? "Missing" : formatSubscriptionInvoiceStatusLabel(row.invoiceStatus),
      row.invoice ? formatSubscriptionInvoiceTypeLabel(row.invoiceType) : "",
      formatSubscriptionPaymentMethodLabel(row.paymentMethod),
      formatSubscriptionPaymentApprovalLabel(row.paymentApprovalStatus, row.paymentMethod),
      row.invoiceStatus === "paid" ? "Yes" : "No",
      row.readyToSend ? "Yes" : "No",
      row.invoiceNumber ? `INV-${row.invoiceNumber}` : "",
      row.invoice ? Number(row.invoiceAmount || 0).toFixed(2) : "",
      row.invoice ? Number(row.invoiceBaseAmount || 0).toFixed(2) : "",
      row.invoice ? Number(row.invoiceAdjustmentsTotal || 0).toFixed(2) : "",
      Number(row.topupPendingAmount || 0).toFixed(2),
      row.topupCount || 0,
      Array.isArray(row.recurringCharges) ? row.recurringCharges.map((entry) => entry?.label || "").filter(Boolean).join(" | ") : "",
      row.readyToSend ? "Yes" : "No",
      row.addressLabel || "",
      row.city || "",
      row.province || "",
      row.paidAt ? bookingDateFormatter.format(row.paidAt) : "",
      row.lastPaymentAt ? bookingDateFormatter.format(row.lastPaymentAt) : "",
    ]);
    return [header, ...body];
  };

  const handleExportFiltered = () => {
    if (!visibleRows.length) {
      setErrorMessage("No rows to export for current filters.");
      return;
    }
    setErrorMessage(null);
    const rows = buildExportRows(visibleRows);
    downloadCsvFile(rows, `subscription-ops-filtered-${selectedCycleMonth}.csv`);
  };

  const handleExportReadyToSend = () => {
    if (!readyToSendRows.length) {
      setErrorMessage("No delivery-ready subscriptions for this cycle.");
      return;
    }
    setErrorMessage(null);
    const rows = buildExportRows(readyToSendRows);
    downloadCsvFile(rows, `subscription-ops-ready-to-send-${selectedCycleMonth}.csv`);
  };

  const executeSubscriptionStatusOverride = async ({ row, nextStatus, reason }) => {
    if (!functionsInstance) {
      throw new Error("Cloud Functions are not available.");
    }
    const callable = httpsCallable(functionsInstance, "adminUpdateSubscriptionStatus");
    await callable({
      subscriptionId: row.subscriptionId,
      status: nextStatus,
      reason,
    });
  };

  const executeInvoiceStatusOverride = async ({
    row,
    nextStatus,
    reason,
    createIfMissing = true,
  }) => {
    if (!functionsInstance) {
      throw new Error("Cloud Functions are not available.");
    }
    const callable = httpsCallable(functionsInstance, "adminUpsertSubscriptionInvoiceStatus");
    await callable({
      subscriptionId: row.subscriptionId,
      cycleMonth: selectedCycleMonth,
      status: nextStatus,
      reason,
      createIfMissing,
    });
  };

  const executeSubscriptionPaymentMethodOverride = async ({
    row,
    paymentMethod,
    reason,
    applyToPendingInvoice = true,
  }) => {
    if (!functionsInstance) {
      throw new Error("Cloud Functions are not available.");
    }
    const callable = httpsCallable(functionsInstance, "adminUpdateSubscriptionPaymentMethod");
    await callable({
      subscriptionId: row.subscriptionId,
      paymentMethod,
      reason,
      applyToPendingInvoice,
    });
  };

  const executeSubscriptionPlanAssignment = async ({
    row,
    planId,
    reason,
  }) => {
    if (!functionsInstance) {
      throw new Error("Cloud Functions are not available.");
    }
    const callable = httpsCallable(functionsInstance, "adminUpdateSubscriptionPlanAssignment");
    await callable({
      subscriptionId: row.subscriptionId,
      planId,
      cycleMonth: selectedCycleMonth,
      reason,
      applyToCurrentCycle: true,
      sendUpdatedInvoiceEmail: true,
    });
  };

  const executeSubscriptionInvoiceCharge = async ({
    row,
    amount,
    label,
    reason,
    chargeMode,
    chargeBasis,
  }) => {
    if (!functionsInstance) {
      throw new Error("Cloud Functions are not available.");
    }
    const callable = httpsCallable(functionsInstance, "adminAddSubscriptionInvoiceCharge");
    await callable({
      subscriptionId: row.subscriptionId,
      cycleMonth: selectedCycleMonth,
      amount,
      label,
      reason,
      chargeMode,
      chargeBasis,
      createInvoiceIfMissing: true,
      sendUpdatedInvoiceEmail: true,
    });
  };

  const executeSubscriptionRecurringChargeRemoval = async ({
    row,
    chargeId,
    reason,
  }) => {
    if (!functionsInstance) {
      throw new Error("Cloud Functions are not available.");
    }
    const callable = httpsCallable(functionsInstance, "adminRemoveSubscriptionRecurringCharge");
    await callable({
      subscriptionId: row.subscriptionId,
      chargeId,
      cycleMonth: selectedCycleMonth,
      reason,
      sendUpdatedInvoiceEmail: true,
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmState) return;
    const {
      row,
      actionType,
      nextStatus,
      nextPaymentMethod,
      applyToPendingInvoice,
      nextPlanId,
      chargeAmount,
      chargeLabel,
      chargeMode,
      chargeBasis,
      chargeId,
      reason,
    } = confirmState;
    setBusySubscriptionId(row.subscriptionId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      if (actionType === "subscription-status") {
        await executeSubscriptionStatusOverride({
          row,
          nextStatus,
          reason,
        });
        setStatusMessage(
          `${row.customerName || "Subscription"} updated to ${formatSubscriptionStatusLabel(nextStatus)}.`,
        );
      } else if (actionType === "invoice-status") {
        await executeInvoiceStatusOverride({
          row,
          nextStatus,
          reason,
          createIfMissing: true,
        });
        setStatusMessage(
          `Invoice for ${row.customerName || "subscription"} set to ${formatSubscriptionInvoiceStatusLabel(nextStatus)}.`,
        );
      } else if (actionType === "create-invoice") {
        await executeInvoiceStatusOverride({
          row,
          nextStatus: "pending-payment",
          reason,
          createIfMissing: true,
        });
        setStatusMessage(`Cycle invoice created for ${row.customerName || row.subscriptionId}.`);
      } else if (actionType === "payment-method") {
        await executeSubscriptionPaymentMethodOverride({
          row,
          paymentMethod: nextPaymentMethod,
          reason,
          applyToPendingInvoice,
        });
        setStatusMessage(
          `${row.customerName || "Subscription"} payment method set to ${formatSubscriptionPaymentMethodLabel(
            nextPaymentMethod,
          )}.`,
        );
      } else if (actionType === "plan-assignment") {
        await executeSubscriptionPlanAssignment({
          row,
          planId: nextPlanId,
          reason,
        });
        const selectedPlan = liveSubscriptionPlans.find(
          (plan) => (plan?.id || "").toString().trim() === (nextPlanId || "").toString().trim(),
        );
        setStatusMessage(
          `${row.customerName || "Subscription"} switched to ${selectedPlan?.name || "selected plan"}.`,
        );
      } else if (actionType === "invoice-charge-add") {
        await executeSubscriptionInvoiceCharge({
          row,
          amount: chargeAmount,
          label: chargeLabel,
          reason,
          chargeMode,
          chargeBasis,
        });
        setStatusMessage(
          `${row.customerName || "Subscription"} invoice updated with ${formatPriceLabel(
            chargeAmount,
          )} ${chargeMode === "recurring" ? "recurring" : "one-time"} charge.`,
        );
      } else if (actionType === "recurring-charge-remove") {
        await executeSubscriptionRecurringChargeRemoval({
          row,
          chargeId,
          reason,
        });
        setStatusMessage(`${row.customerName || "Subscription"} recurring charge removed.`);
      }
    } catch (error) {
      setErrorMessage(error?.message || "Unable to update subscription operations state.");
    } finally {
      setBusySubscriptionId("");
      setConfirmState(null);
    }
  };

  const requestActionConfirmation = ({
    row,
    actionType,
    title,
    message,
    confirmLabel,
    ...rest
  }) => {
    setConfirmState({
      row,
      actionType,
      title,
      message,
      confirmLabel,
      ...rest,
    });
  };

  const handleApplySubscriptionStatus = (row) => {
    const draft = getDraft(row.subscriptionId, row);
    const reason = (draft.reason || "").toString().trim();
    const nextStatus = normalizeSubscriptionOpsStatus(draft.subscriptionStatus);
    if (!reason) {
      setErrorMessage("A reason is required before applying subscription status changes.");
      return;
    }
    if (nextStatus === row.subscriptionStatus) {
      setErrorMessage("Choose a different subscription status before applying.");
      return;
    }
    requestActionConfirmation({
      row,
      actionType: "subscription-status",
      nextStatus,
      reason,
      title: "Confirm subscription status change",
      message: `Update ${row.customerName || row.subscriptionId} from ${formatSubscriptionStatusLabel(
        row.subscriptionStatus,
      )} to ${formatSubscriptionStatusLabel(nextStatus)}?`,
      confirmLabel: "Apply status",
    });
  };

  const handleApplyInvoiceStatus = (row) => {
    const draft = getDraft(row.subscriptionId, row);
    const reason = (draft.reason || "").toString().trim();
    const nextStatus = normalizeSubscriptionOpsInvoiceStatus(draft.invoiceStatus);
    if (!reason) {
      setErrorMessage("A reason is required before applying invoice status changes.");
      return;
    }
    if (row.isMissingInvoice) {
      setErrorMessage("Create a cycle invoice first before overriding invoice status.");
      return;
    }
    if (nextStatus === row.invoiceStatus) {
      setErrorMessage("Choose a different invoice status before applying.");
      return;
    }
    requestActionConfirmation({
      row,
      actionType: "invoice-status",
      nextStatus,
      reason,
      title: "Confirm invoice status override",
      message: `Set ${row.customerName || row.subscriptionId} invoice from ${formatSubscriptionInvoiceStatusLabel(
        row.invoiceStatus,
      )} to ${formatSubscriptionInvoiceStatusLabel(nextStatus)} for ${selectedCycleLabel}?`,
      confirmLabel: "Apply invoice status",
    });
  };

  const handleApplyPaymentMethod = (row) => {
    const draft = getDraft(row.subscriptionId, row);
    const reason = (draft.reason || "").toString().trim();
    const nextPaymentMethod = normalizeSubscriptionOpsPaymentMethod(draft.paymentMethod);
    if (!reason) {
      setErrorMessage("A reason is required before switching payment method.");
      return;
    }
    if (nextPaymentMethod === row.paymentMethod) {
      setErrorMessage("Choose a different payment method before applying.");
      return;
    }
    requestActionConfirmation({
      row,
      actionType: "payment-method",
      nextPaymentMethod,
      applyToPendingInvoice: draft.applyToPendingInvoice !== false,
      reason,
      title: "Confirm payment method switch",
      message: `Switch ${row.customerName || row.subscriptionId} from ${formatSubscriptionPaymentMethodLabel(
        row.paymentMethod,
      )} to ${formatSubscriptionPaymentMethodLabel(nextPaymentMethod)}?`,
      confirmLabel: "Apply payment method",
    });
  };

  const handleCreateMissingInvoice = (row) => {
    const draft = getDraft(row.subscriptionId, row);
    const reason = (draft.reason || "").toString().trim();
    if (!reason) {
      setErrorMessage("A reason is required before creating a cycle invoice.");
      return;
    }
    requestActionConfirmation({
      row,
      actionType: "create-invoice",
      nextStatus: "pending-payment",
      reason,
      title: "Create missing cycle invoice",
      message: `Create a ${selectedCycleLabel} invoice for ${row.customerName || row.subscriptionId}?`,
      confirmLabel: "Create invoice",
    });
  };

  const handleApplyPlanAssignment = (row) => {
    const draft = getDraft(row.subscriptionId, row);
    const reason = (draft.reason || "").toString().trim();
    const nextPlanId = (draft.planId || "").toString().trim();
    if (!reason) {
      setErrorMessage("A reason is required before applying plan changes.");
      return;
    }
    if (!nextPlanId) {
      setErrorMessage("Select a subscription plan before applying.");
      return;
    }
    if (nextPlanId === row.subscriptionPlanId) {
      setErrorMessage("Choose a different plan before applying.");
      return;
    }
    const selectedPlan = liveSubscriptionPlans.find(
      (plan) => (plan?.id || "").toString().trim() === nextPlanId,
    );
    requestActionConfirmation({
      row,
      actionType: "plan-assignment",
      nextPlanId,
      reason,
      title: "Confirm plan reassignment",
      message: `Switch ${row.customerName || row.subscriptionId} to ${
        selectedPlan?.name || "the selected plan"
      } for ${selectedCycleLabel}?`,
      confirmLabel: "Apply plan",
    });
  };

  const handleApplyInvoiceCharge = (row) => {
    const draft = getDraft(row.subscriptionId, row);
    const reason = (draft.reason || "").toString().trim();
    const chargeAmount = Number(draft.chargeAmount);
    const chargeLabel = (draft.chargeLabel || "").toString().trim() || "Admin charge";
    const chargeMode = normalizeSubscriptionChargeMode(draft.chargeMode);
    const chargeBasis = normalizeSubscriptionChargeBasis(draft.chargeBasis);
    if (!reason) {
      setErrorMessage("A reason is required before adding invoice charges.");
      return;
    }
    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
      setErrorMessage("Charge amount must be greater than 0.");
      return;
    }
    requestActionConfirmation({
      row,
      actionType: "invoice-charge-add",
      chargeAmount,
      chargeLabel,
      chargeMode,
      chargeBasis,
      reason,
      title: "Confirm invoice charge",
      message: `Add ${formatPriceLabel(chargeAmount)} (${chargeMode}, ${chargeBasis}) to ${row.customerName || row.subscriptionId} for ${selectedCycleLabel}?`,
      confirmLabel: "Apply charge",
    });
  };

  const handleRemoveRecurringCharge = (row, charge) => {
    const draft = getDraft(row.subscriptionId, row);
    const reason = (draft.reason || "").toString().trim();
    const chargeId = (charge?.chargeId || "").toString().trim();
    if (!reason) {
      setErrorMessage("A reason is required before removing recurring charges.");
      return;
    }
    if (!chargeId) {
      setErrorMessage("Recurring charge ID is missing.");
      return;
    }
    requestActionConfirmation({
      row,
      actionType: "recurring-charge-remove",
      chargeId,
      reason,
      title: "Remove recurring charge",
      message: `Remove recurring charge "${charge?.label || "Recurring charge"}" for ${row.customerName || row.subscriptionId}?`,
      confirmLabel: "Remove charge",
    });
  };

  return (
    <div className="admin-panel admin-panel--full admin-subscription-ops">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Subscription Ops</h2>
          <p className="admin-panel__note">
            Track paid active subscriptions and export your delivery-ready roster for {selectedCycleLabel}.
          </p>
        </div>
        <div className="admin-panel__header-actions">
          <button className="btn btn--secondary" type="button" onClick={handleExportReadyToSend}>
            Export ready to send
          </button>
          <button className="btn btn--secondary" type="button" onClick={handleExportFiltered}>
            Export filtered
          </button>
          <Link className="btn btn--secondary" to="/admin/subscriptions">
            Manage plans
          </Link>
        </div>
      </Reveal>

      <div className="admin-subscription-ops__kpis">
        {metrics.map((metric) => (
          <article key={metric.id} className="admin-stat-card">
            <p className="admin-stat-card__label">{metric.label}</p>
            <p className="admin-stat-card__value">{metric.value}</p>
            <p className="admin-stat-card__hint">{selectedCycleLabel}</p>
          </article>
        ))}
      </div>

      <div className="admin-subscription-ops__filters">
        <label className="admin-form__field">
          Cycle month
          <input
            className="input"
            type="month"
            value={selectedCycleMonth}
            onChange={(event) => {
              const nextMonth = normalizeCycleMonthValue(event.target.value);
              if (!nextMonth) return;
              setSelectedCycleMonth(nextMonth);
            }}
          />
        </label>
        <label className="admin-form__field">
          Search
          <input
            className="input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Name, email, plan, address..."
          />
        </label>
        <label className="admin-form__field">
          Subscription status
          <select
            className="input"
            value={subscriptionStatusFilter}
            onChange={(event) => setSubscriptionStatusFilter(event.target.value)}
          >
            <option value="all">All</option>
            {SUBSCRIPTION_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatSubscriptionStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-form__field">
          Invoice status
          <select
            className="input"
            value={invoiceStatusFilter}
            onChange={(event) => setInvoiceStatusFilter(event.target.value)}
          >
            <option value="all">All</option>
            <option value="missing">Missing invoice</option>
            {SUBSCRIPTION_INVOICE_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatSubscriptionInvoiceStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-form__field">
          Delivery readiness
          <select
            className="input"
            value={deliveryReadinessFilter}
            onChange={(event) => setDeliveryReadinessFilter(event.target.value)}
          >
            <option value="all">All</option>
            <option value="ready">Delivery-ready only</option>
            <option value="payment-required">Payment required</option>
          </select>
        </label>
        <label className="admin-form__field">
          Payment method
          <select
            className="input"
            value={paymentMethodFilter}
            onChange={(event) => setPaymentMethodFilter(event.target.value)}
          >
            <option value="all">All</option>
            {SUBSCRIPTION_PAYMENT_METHOD_OPTIONS.map((method) => (
              <option key={method} value={method}>
                {formatSubscriptionPaymentMethodLabel(method)}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-form__field">
          Tier
          <select
            className="input"
            value={tierFilter}
            onChange={(event) => setTierFilter(event.target.value)}
          >
            <option value="all">All</option>
            {SUBSCRIPTION_PLAN_TIERS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-form__field">
          Province
          <select
            className="input"
            value={provinceFilter}
            onChange={(event) => setProvinceFilter(event.target.value)}
          >
            <option value="all">All</option>
            {SA_PROVINCES.map((province) => (
              <option key={province.value} value={province.value}>
                {province.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-form__field">
          City
          <select
            className="input"
            value={cityFilter}
            onChange={(event) => setCityFilter(event.target.value)}
          >
            <option value="all">All</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
      </div>

      {subscriptionsStatus === "loading" && <p className="modal__meta">Loading subscriptions...</p>}
      {invoicesStatus === "loading" && <p className="modal__meta">Loading cycle invoices...</p>}
      {plansStatus === "loading" && <p className="modal__meta">Loading subscription plans...</p>}
      {!inventoryEnabled && (
        <p className="admin-panel__error">Admin access is required for subscription operations.</p>
      )}
      {subscriptionsError && (
        <p className="admin-panel__error">{subscriptionsError.message || "Unable to load subscriptions."}</p>
      )}
      {invoicesError && (
        <p className="admin-panel__error">{invoicesError.message || "Unable to load subscription invoices."}</p>
      )}
      {plansError && (
        <p className="admin-panel__error">{plansError.message || "Unable to load subscription plans."}</p>
      )}
      {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
      {errorMessage && <p className="admin-panel__error">{errorMessage}</p>}

      <div className="admin-table__wrapper">
        {visibleRows.length > 0 ? (
          <table className="admin-table admin-table--compact admin-subscription-ops__table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Delivery</th>
                <th scope="col">Plan</th>
                <th scope="col">Cycle invoice</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const invoiceStatusLabel = row.isMissingInvoice
                  ? "Missing"
                  : formatSubscriptionInvoiceStatusLabel(row.invoiceStatus);
                return (
                  <tr
                    key={row.subscriptionId}
                    className="admin-subscription-ops__row admin-table__row--clickable"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open subscription details for ${row.customerName || row.subscriptionId}`}
                    onClick={() => handleOpenManageSubscription(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleOpenManageSubscription(row);
                      }
                    }}
                  >
                    <td data-label="Customer">
                      <strong>{row.customerName || "Customer"}</strong>
                      <p className="modal__meta">{row.customerEmail || "No email"}</p>
                      <p className="modal__meta">{row.customerPhone || "No phone"}</p>
                    </td>
                    <td data-label="Delivery">
                      <p className="modal__meta">
                        {row.city || "-"} | {row.province || "-"}
                      </p>
                      <p className="modal__meta">
                        Mondays: {row.includedDeliveryLabel || row.cycleDeliveryLabel || "None"}
                      </p>
                    </td>
                    <td data-label="Plan">
                      <strong>{row.planName}</strong>
                      <p className="modal__meta">
                        {formatSubscriptionPlanTierLabel(row.tier)} | {row.expectedDeliveries} deliveries
                      </p>
                      <p className="modal__meta">Recurring charges: {row.recurringCharges.length || 0}</p>
                    </td>
                    <td data-label="Cycle invoice">
                      <p className="modal__meta">
                        Invoice: {row.invoiceNumber ? `INV-${row.invoiceNumber}` : "-"}
                      </p>
                      <p className="modal__meta">
                        Status: {invoiceStatusLabel}
                      </p>
                      <p className="modal__meta">
                        Total: {row.invoice ? formatPriceLabel(row.invoiceAmount) : "-"}
                      </p>
                      {row.topupPendingAmount > 0 && (
                        <p className="modal__meta">
                          Pending top-up: {formatPriceLabel(row.topupPendingAmount)}
                        </p>
                      )}
                    </td>
                    <td data-label="Status">
                      <span className={`badge badge--stock-${row.readyToSend ? "in" : "out"}`} style={{ marginBottom: "0.45rem" }}>
                        {row.readyToSend ? "Ready to send" : "Not ready"}
                      </span>
                      <span className={`badge badge--stock-${row.invoiceStatus === "paid" ? "in" : "out"}`} style={{ marginBottom: "0.45rem" }}>
                        Paid for {selectedCycleLabel}: {row.invoiceStatus === "paid" ? "Yes" : "No"}
                      </span>
                      <p className="modal__meta">Subscription: {formatSubscriptionStatusLabel(row.subscriptionStatus)}</p>
                      <p className="modal__meta">Method: {formatSubscriptionPaymentMethodLabel(row.paymentMethod)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="admin-panel__notice">
            No subscriptions match the current cycle and filters.
          </p>
        )}
      </div>

      {manageRow && (() => {
        const draft = getDraft(manageRow.subscriptionId, manageRow);
        const rowBusy = busySubscriptionId === manageRow.subscriptionId;
        const invoiceStatusLabel = manageRow.isMissingInvoice
          ? "Missing"
          : formatSubscriptionInvoiceStatusLabel(manageRow.invoiceStatus);
        return (
          <div
            className="modal is-active admin-modal admin-subscription-ops-manage"
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-ops-manage-title"
          >
            <div className="modal__content admin-subscription-ops-manage__content">
              <button
                className="modal__close"
                type="button"
                onClick={() => {
                  if (rowBusy) return;
                  setManageSubscriptionId("");
                  setActiveManageTab(SUBSCRIPTION_OPS_MANAGE_DEFAULT_TAB);
                }}
                aria-label="Close"
              >
                ×
              </button>

              <header className="admin-subscription-ops-manage__header">
                <h3 className="modal__title" id="subscription-ops-manage-title">
                  Manage {manageRow.customerName || "subscription"}
                </h3>
                <p className="modal__meta">
                  {selectedCycleLabel} · {manageRow.subscriptionId}
                </p>
                <div className="admin-subscription-ops-manage__badges">
                  <span className={`badge badge--stock-${manageRow.readyToSend ? "in" : "out"}`}>
                    {manageRow.readyToSend ? "Ready to send" : "Not ready"}
                  </span>
                  <span className={`badge badge--stock-${manageRow.invoiceStatus === "paid" ? "in" : "out"}`}>
                    Paid for {selectedCycleLabel}: {manageRow.invoiceStatus === "paid" ? "Yes" : "No"}
                  </span>
                  <span className="badge badge--stock-in">
                    {formatSubscriptionPaymentMethodLabel(manageRow.paymentMethod)}
                  </span>
                </div>
              </header>

              <div
                className="admin-subscription-ops-manage__tabs"
                role="tablist"
                aria-label="Subscription management sections"
                onKeyDown={handleManageTabKeyDown}
              >
                {SUBSCRIPTION_OPS_MANAGE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    id={`admin-subscription-ops-manage-tab-${tab.id}`}
                    className={`admin-subscription-ops-manage__tab ${activeManageTab === tab.id ? "is-active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activeManageTab === tab.id ? "true" : "false"}
                    aria-controls={`admin-subscription-ops-manage-panel-${tab.id}`}
                    onClick={() => setActiveManageTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="admin-subscription-ops-manage__layout">
                {activeManageTab === "overview" && (
                <section
                  className="admin-subscription-ops-manage__summary"
                  id="admin-subscription-ops-manage-panel-overview"
                  role="tabpanel"
                  aria-labelledby="admin-subscription-ops-manage-tab-overview"
                >
                  <article className="admin-subscription-ops-manage__card">
                    <h4>Customer</h4>
                    <p className="modal__meta"><strong>{manageRow.customerName || "Customer"}</strong></p>
                    <p className="modal__meta">{manageRow.customerEmail || "No email"}</p>
                    <p className="modal__meta">{manageRow.customerPhone || "No phone"}</p>
                  </article>

                  <article className="admin-subscription-ops-manage__card">
                    <h4>Delivery</h4>
                    <p className="modal__meta">{manageRow.addressLabel || "No delivery address"}</p>
                    <p className="modal__meta">{manageRow.city || "-"} | {manageRow.province || "-"}</p>
                    <p className="modal__meta">Mondays this cycle: {manageRow.cycleDeliveryLabel || "None"}</p>
                    <p className="modal__meta">Included in invoice: {manageRow.includedDeliveryLabel || "None"}</p>
                  </article>

                  <article className="admin-subscription-ops-manage__card">
                    <h4>Plan</h4>
                    <p className="modal__meta"><strong>{manageRow.planName}</strong></p>
                    <p className="modal__meta">
                      {formatSubscriptionPlanTierLabel(manageRow.tier)} | {manageRow.expectedDeliveries} deliveries
                    </p>
                    <p className="modal__meta">Monday slots: {manageRow.mondaySlotLabel || "-"}</p>
                    <p className="modal__meta">Recurring charges: {manageRow.recurringCharges.length || 0}</p>
                  </article>

                  <article className="admin-subscription-ops-manage__card">
                    <h4>Cycle invoice</h4>
                    <p className="modal__meta">Invoice: {manageRow.invoiceNumber ? `INV-${manageRow.invoiceNumber}` : "-"}</p>
                    <p className="modal__meta">Status: {invoiceStatusLabel}</p>
                    <p className="modal__meta">Type: {manageRow.invoice ? formatSubscriptionInvoiceTypeLabel(manageRow.invoiceType) : "-"}</p>
                    <p className="modal__meta">Amount: {manageRow.invoice ? formatPriceLabel(manageRow.invoiceAmount) : "-"}</p>
                    <p className="modal__meta">
                      Base {manageRow.invoice ? formatPriceLabel(manageRow.invoiceBaseAmount) : "-"} | Adjustments{" "}
                      {manageRow.invoice ? formatPriceLabel(manageRow.invoiceAdjustmentsTotal) : "-"}
                    </p>
                    <p className="modal__meta">
                      Top-ups: {manageRow.topupCount} | Pending {formatPriceLabel(manageRow.topupPendingAmount)}
                    </p>
                    <p className="modal__meta">
                      Approval: {formatSubscriptionPaymentApprovalLabel(manageRow.paymentApprovalStatus, manageRow.paymentMethod)}
                    </p>
                  </article>
                </section>
                )}

                {activeManageTab !== "overview" && (
                <section
                  className="admin-subscription-ops-manage__actions"
                  id={`admin-subscription-ops-manage-panel-${activeManageTab}`}
                  role="tabpanel"
                  aria-labelledby={`admin-subscription-ops-manage-tab-${activeManageTab}`}
                >
                  <div className="admin-subscription-ops__actions">
                    {activeManageTab === "billing" && (
                      <>
                        <p className="modal__meta"><strong>Billing controls</strong></p>
                        <p className="modal__meta">Manage status, invoice state, and payment method for this cycle.</p>
                        <label className="admin-form__field">
                          Subscription status
                          <select
                            className="input"
                            value={draft.subscriptionStatus}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDraftValue(manageRow.subscriptionId, "subscriptionStatus", event.target.value)
                            }
                          >
                            {SUBSCRIPTION_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {formatSubscriptionStatusLabel(status)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-form__field">
                          Invoice status
                          <select
                            className="input"
                            value={draft.invoiceStatus}
                            disabled={rowBusy || manageRow.isMissingInvoice}
                            onChange={(event) =>
                              setDraftValue(manageRow.subscriptionId, "invoiceStatus", event.target.value)
                            }
                          >
                            {SUBSCRIPTION_INVOICE_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {formatSubscriptionInvoiceStatusLabel(status)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-form__field">
                          Payment method
                          <select
                            className="input"
                            value={draft.paymentMethod}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDraftValue(manageRow.subscriptionId, "paymentMethod", event.target.value)
                            }
                          >
                            {SUBSCRIPTION_PAYMENT_METHOD_OPTIONS.map((method) => (
                              <option key={method} value={method}>
                                {formatSubscriptionPaymentMethodLabel(method)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-users-checkbox">
                          <input
                            type="checkbox"
                            checked={draft.applyToPendingInvoice !== false}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDraftValue(
                                manageRow.subscriptionId,
                                "applyToPendingInvoice",
                                event.target.checked,
                              )
                            }
                          />
                          Apply to pending invoice when available
                        </label>
                        <label className="admin-form__field">
                          Reason (required)
                          <textarea
                            className="input textarea"
                            rows="3"
                            value={draft.reason}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDraftValue(manageRow.subscriptionId, "reason", event.target.value)
                            }
                          />
                        </label>
                        <div className="admin-subscription-ops-manage__action-grid">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            disabled={rowBusy || !inventoryEnabled}
                            onClick={() => handleApplySubscriptionStatus(manageRow)}
                          >
                            {rowBusy ? "Working..." : "Update subscription status"}
                          </button>
                          {manageRow.isMissingInvoice ? (
                            <button
                              className="btn btn--secondary"
                              type="button"
                              disabled={rowBusy || !inventoryEnabled}
                              onClick={() => handleCreateMissingInvoice(manageRow)}
                            >
                              {rowBusy ? "Working..." : "Create cycle invoice"}
                            </button>
                          ) : (
                            <button
                              className="btn btn--secondary"
                              type="button"
                              disabled={rowBusy || !inventoryEnabled}
                              onClick={() => handleApplyInvoiceStatus(manageRow)}
                            >
                              {rowBusy ? "Working..." : "Update invoice status"}
                            </button>
                          )}
                          <button
                            className="btn btn--secondary"
                            type="button"
                            disabled={rowBusy || !inventoryEnabled}
                            onClick={() => handleApplyPaymentMethod(manageRow)}
                          >
                            {rowBusy ? "Working..." : "Update payment method"}
                          </button>
                        </div>
                      </>
                    )}

                    {activeManageTab === "plan-charges" && (
                      <>
                        <p className="modal__meta"><strong>Plan and charge controls</strong></p>
                        <p className="modal__meta">Use this section for plan reassignment and invoice surcharges.</p>
                        <label className="admin-form__field">
                          Reassign plan
                          <select
                            className="input"
                            value={draft.planId}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDraftValue(manageRow.subscriptionId, "planId", event.target.value)
                            }
                          >
                            <option value="">Select plan</option>
                            {liveSubscriptionPlans.map((plan) => (
                              <option key={plan.id} value={plan.id}>
                                {plan.name || "Plan"} ({formatSubscriptionPlanTierLabel(plan.tier)})
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="admin-subscription-ops__charge-grid">
                          <label className="admin-form__field">
                            Charge amount
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.chargeAmount}
                              disabled={rowBusy}
                              onChange={(event) =>
                                setDraftValue(manageRow.subscriptionId, "chargeAmount", event.target.value)
                              }
                            />
                          </label>
                          <label className="admin-form__field">
                            Charge label
                            <input
                              className="input"
                              value={draft.chargeLabel}
                              disabled={rowBusy}
                              onChange={(event) =>
                                setDraftValue(manageRow.subscriptionId, "chargeLabel", event.target.value)
                              }
                              placeholder="Extra delivery labour"
                            />
                          </label>
                          <label className="admin-form__field">
                            Charge mode
                            <select
                              className="input"
                              value={draft.chargeMode}
                              disabled={rowBusy}
                              onChange={(event) =>
                                setDraftValue(manageRow.subscriptionId, "chargeMode", event.target.value)
                              }
                            >
                              {SUBSCRIPTION_CHARGE_MODES.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                  {entry.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="admin-form__field">
                            Charge basis
                            <select
                              className="input"
                              value={draft.chargeBasis}
                              disabled={rowBusy}
                              onChange={(event) =>
                                setDraftValue(manageRow.subscriptionId, "chargeBasis", event.target.value)
                              }
                            >
                              {SUBSCRIPTION_CHARGE_BASES.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                  {entry.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {manageRow.recurringCharges.length > 0 && (
                          <div className="admin-subscription-ops__recurring-list">
                            <p className="modal__meta"><strong>Recurring charges</strong></p>
                            {manageRow.recurringCharges.map((charge) => (
                              <div
                                key={charge.chargeId || `${manageRow.subscriptionId}-${charge.label}`}
                                className="admin-subscription-ops__recurring-item"
                              >
                                <span>
                                  {(charge.label || "Recurring charge").toString()} - {formatPriceLabel(charge.amount)} ({(charge.basis || "flat").toString()})
                                </span>
                                <button
                                  className="btn btn--secondary"
                                  type="button"
                                  disabled={rowBusy || !inventoryEnabled}
                                  onClick={() => handleRemoveRecurringCharge(manageRow, charge)}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <label className="admin-form__field">
                          Reason (required)
                          <textarea
                            className="input textarea"
                            rows="3"
                            value={draft.reason}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDraftValue(manageRow.subscriptionId, "reason", event.target.value)
                            }
                          />
                        </label>

                        <div className="admin-subscription-ops-manage__action-grid">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            disabled={rowBusy || !inventoryEnabled || !draft.planId}
                            onClick={() => handleApplyPlanAssignment(manageRow)}
                          >
                            {rowBusy ? "Working..." : "Apply plan reassignment"}
                          </button>
                          <button
                            className="btn btn--secondary"
                            type="button"
                            disabled={rowBusy || !inventoryEnabled}
                            onClick={() => handleApplyInvoiceCharge(manageRow)}
                          >
                            {rowBusy ? "Working..." : "Add invoice charge"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </section>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || "Confirm action"}
        message={confirmState?.message || "Are you sure you want to proceed?"}
        confirmLabel={confirmState?.confirmLabel || "Confirm"}
        busy={Boolean(busySubscriptionId)}
        onCancel={() => {
          if (busySubscriptionId) return;
          setConfirmState(null);
        }}
        onConfirm={runConfirmedAction}
      />
    </div>
  );
}

export function AdminMediaLibraryView() {
  usePageMetadata({
    title: "Admin Â· Image Library",
    description: "Upload and manage product images for bulk imports.",
  });
  const { db, storage, inventoryEnabled, inventoryError } = useAdminData();
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState(null);
  const [mediaUploadMessage, setMediaUploadMessage] = useState(null);
  const [mediaDeleting, setMediaDeleting] = useState(false);
  const [mediaDeleteDialog, setMediaDeleteDialog] = useState({ open: false, item: null });
  const [copiedMediaId, setCopiedMediaId] = useState(null);
  const mediaUploadInputRef = useRef(null);
  const {
    items: mediaItems,
    status: mediaStatus,
    error: mediaItemsError,
  } = useFirestoreCollection("productMedia", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const uploadMediaAsset = async (file) => {
    if (!storage) throw new Error("Storage is not configured.");
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
    const storagePath = `product-media/${Date.now()}-${sanitizedName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);
    return { url, storagePath };
  };

  const handleMediaUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    if (!storage || !db || !inventoryEnabled) {
      setMediaUploadError("You do not have permission to upload images.");
      return;
    }
    setMediaUploading(true);
    setMediaUploadError(null);
    setMediaUploadMessage(null);
    try {
      let uploadedCount = 0;
      for (const file of files) {
        const { url, storagePath } = await uploadMediaAsset(file);
        await addDoc(collection(db, "productMedia"), {
          name: file.name,
          url,
          storagePath,
          size: file.size,
          contentType: file.type,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        uploadedCount += 1;
      }
      setMediaUploadMessage(
        `Uploaded ${uploadedCount} image${uploadedCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setMediaUploadError(error.message || "Unable to upload images.");
    } finally {
      setMediaUploading(false);
    }
  };

  const handleConfirmDeleteMedia = async () => {
    const item = mediaDeleteDialog.item;
    if (!item || !db) {
      setMediaDeleteDialog({ open: false, item: null });
      return;
    }
    setMediaDeleting(true);
    setMediaUploadError(null);
    setMediaUploadMessage(null);
    try {
      if (storage) {
        const storagePath = (item.storagePath || item.path || "").toString().trim();
        const url = (item.url || "").toString().trim();
        if (storagePath) {
          await deleteObject(ref(storage, storagePath));
        } else if (url) {
          await deleteObject(ref(storage, url));
        }
      }
      await deleteDoc(doc(db, "productMedia", item.id));
      setMediaUploadMessage("Image deleted.");
      setMediaDeleteDialog({ open: false, item: null });
    } catch (error) {
      setMediaUploadError(error.message || "Unable to delete image.");
    } finally {
      setMediaDeleting(false);
    }
  };

  const handleCopyMediaUrl = async (url, id) => {
    if (!url) return;
    try {
      if (navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedMediaId(id);
      setTimeout(() => setCopiedMediaId(null), 1500);
    } catch (error) {
      console.warn("Unable to copy media URL", error);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <div className="admin-panel__header">
        <div>
          <h2>Image Library</h2>
          <p className="admin-panel__note">
            Upload product images in bulk and copy direct links for the spreadsheet (Main Image URL
            or Gallery Images columns).
          </p>
        </div>
        <div className="admin-panel__header-actions">
          <input
            ref={mediaUploadInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleMediaUpload}
            style={{ display: "none" }}
          />
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => mediaUploadInputRef.current.click()}
            disabled={!inventoryEnabled || mediaUploading}
          >
            {mediaUploading ? "Uploading..." : "Upload images"}
          </button>
        </div>
      </div>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}

      <div className="admin-panel__content">
        <section className="admin-media">
          {mediaUploadError && <p className="admin-panel__error">{mediaUploadError}</p>}
          {mediaUploadMessage && (
            <p className="admin-panel__status">{mediaUploadMessage}</p>
          )}
          {mediaItemsError && (
            <p className="admin-panel__error">Unable to load image library.</p>
          )}
          {mediaStatus === "loading" && (
            <p className="admin-panel__notice">Loading image library...</p>
          )}
          {mediaItems.length > 0 ? (
            <div className="admin-media__grid">
              {mediaItems.map((item) => {
                const imageUrl = (item.url || "").toString().trim();
                const label = (item.name || item.filename || item.id || "Image").toString();
                return (
                  <article className="admin-media__card" key={item.id}>
                    {imageUrl ? (
                      <img
                        className="admin-media__thumb"
                        src={imageUrl}
                        alt={label}
                        loading="lazy" decoding="async"/>
                    ) : (
                      <div className="admin-media__thumb admin-media__thumb--empty">
                        <IconImage aria-hidden="true" />
                      </div>
                    )}
                    <div className="admin-media__body">
                      <strong className="admin-media__filename">{label}</strong>
                      <div className="admin-media__buttons">
                        <button
                          className="icon-btn"
                          type="button"
                          disabled={!imageUrl}
                          onClick={() => handleCopyMediaUrl(imageUrl, item.id)}
                          aria-label={copiedMediaId === item.id ? "Link copied" : "Copy link"}
                        >
                          {copiedMediaId === item.id ? (
                            <IconCheck aria-hidden="true" title="Copied" />
                          ) : (
                            <IconCopy aria-hidden="true" />
                          )}
                        </button>
                        <button
                          className="icon-btn icon-btn--danger"
                          type="button"
                          onClick={() => setMediaDeleteDialog({ open: true, item })}
                          aria-label={`Delete ${label}`}
                        >
                          <IconTrash aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="admin-panel__notice">
              No images yet. Upload files to generate links for the product spreadsheet.
            </p>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={mediaDeleteDialog.open}
        title="Delete image"
        message="This will remove the image from the library. Products using this link will no longer display the image."
        confirmLabel="Delete image"
        busy={mediaDeleting}
        onCancel={() => setMediaDeleteDialog({ open: false, item: null })}
        onConfirm={handleConfirmDeleteMedia}
      />
    </div>
  );
}

export function AdminWorkshopsView() {
  usePageMetadata({
    title: "Admin Â· Workshops",
    description: "Manage Bethany Blooms workshops, sessions, and bookings.",
  });
  const {
    db,
    storage,
    workshops,
    bookings,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const uploadAsset = useUploadAsset(storage);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isWorkshopModalOpen, setWorkshopModalOpen] = useState(false);
  const [workshopForm, setWorkshopForm] = useState(INITIAL_WORKSHOP_FORM);
  const [editingWorkshopId, setEditingWorkshopId] = useState(null);
  const [workshopImageFile, setWorkshopImageFile] = useState(null);
  const [workshopImagePreview, setWorkshopImagePreview] = useState("");
  const [workshopSaving, setWorkshopSaving] = useState(false);
  const [workshopError, setWorkshopError] = useState(null);
  const workshopPreviewUrlRef = useRef(null);
  const [workshopPage, setWorkshopPage] = useState(0);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(
    () => () => {
      if (workshopPreviewUrlRef.current) {
        URL.revokeObjectURL(workshopPreviewUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(workshops.length / ADMIN_PAGE_SIZE) - 1);
    setWorkshopPage((prev) => Math.min(prev, maxPage));
  }, [workshops.length]);

  const paginatedWorkshops = useMemo(() => {
    const start = workshopPage * ADMIN_PAGE_SIZE;
    return workshops.slice(start, start + ADMIN_PAGE_SIZE);
  }, [workshops, workshopPage]);

  const openWorkshopModal = () => {
    setWorkshopForm({
      ...INITIAL_WORKSHOP_FORM,
    });
    setEditingWorkshopId(null);
    setWorkshopImageFile(null);
    setWorkshopImagePreview("");
    setWorkshopError(null);
    setWorkshopModalOpen(true);
  };

  const closeWorkshopModal = () => {
    setWorkshopModalOpen(false);
    setWorkshopImageFile(null);
    setWorkshopImagePreview("");
    setWorkshopError(null);
    setWorkshopSaving(false);
  };

  const handleWorkshopImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (workshopPreviewUrlRef.current) {
      URL.revokeObjectURL(workshopPreviewUrlRef.current);
      workshopPreviewUrlRef.current = null;
    }
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        setWorkshopError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(file);
      workshopPreviewUrlRef.current = preview;
      setWorkshopImageFile(file);
      setWorkshopImagePreview(preview);
    } else {
      setWorkshopImageFile(null);
      setWorkshopImagePreview(workshopForm.image || "");
    }
  };

  const handleDateGroupChange = (groupId, value) => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: (prev.dateGroups || []).map((group) =>
        group.id === groupId ? { ...group, date: value } : group
      ),
    }));
  };

  const handleAddDateGroup = () => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: [...(prev.dateGroups || []), createDateGroup()],
    }));
  };

  const handleRemoveDateGroup = (groupId) => {
    setWorkshopForm((prev) => {
      const remaining = (prev.dateGroups || []).filter(
        (group) => group.id !== groupId
      );
      return {
        ...prev,
        dateGroups: remaining.length > 0 ? remaining : [createDateGroup()],
      };
    });
  };

  const handleAddTimeSlot = (groupId) => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: (prev.dateGroups || []).map((group) =>
        group.id === groupId ?
           { ...group, times: [...(group.times || []), createTimeSlot()] }
          : group
      ),
    }));
  };

  const handleTimeSlotChange = (groupId, slotId, field, value) => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: (prev.dateGroups || []).map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          times: (group.times || []).map((slot) =>
            slot.id === slotId ? { ...slot, [field]: value } : slot
          ),
        };
      }),
    }));
  };

  const handleRemoveTimeSlot = (groupId, slotId) => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: (prev.dateGroups || []).map((group) => {
        if (group.id !== groupId) return group;
        const remainingSlots = (group.times || []).filter(
          (slot) => slot.id !== slotId
        );
        return {
          ...group,
          times:
            remainingSlots.length > 0 ? remainingSlots : [createTimeSlot()],
        };
      }),
    }));
  };

  const handleEditWorkshop = (workshop) => {
    setEditingWorkshopId(workshop.id);
    setWorkshopForm({
      title: workshop.title || workshop.name || "",
      description: workshop.description || "",
      scheduledFor: workshop.scheduledFor || "",
      price:
        workshop.price === undefined || workshop.price === null ?
           ""
          : String(workshop.price),
      location: workshop.location || "",
      image: workshop.image || "",
      status: workshop.status || "live",
      whatToExpect: workshop.whatToExpect || "",
      bookingPricing: workshop.bookingPricing || "",
      goodToKnow: workshop.goodToKnow || "",
      cancellations: workshop.cancellations || "",
      groupsInfo: workshop.groupsInfo || "",
      careInfo: workshop.careInfo || "",
      whyPeopleLove: workshop.whyPeopleLove || "",
      ctaNote: workshop.ctaNote || "",
      repeatWeekdays: false,
      dateGroups: (() => {
        const rawSessions = Array.isArray(workshop.sessions) ?
           workshop.sessions
          : [];
        if (rawSessions.length === 0) return [createDateGroup()];
        const grouped = new Map();
        rawSessions.forEach((session, index) => {
          const startDate = parseDateValue(
            session.start || session.startDate || workshop.scheduledFor
          );
          const dateValue =
            session.date || (startDate ? formatDateInput(startDate) : "");
          const timeValue =
            session.time || (startDate ? formatTimeInput(startDate) : "");
          const slot = {
            id: session.id || `session-${index}-${workshop.id}`,
            time: timeValue,
            label: session.label || session.name || "",
            capacity:
              session.capacity === undefined || session.capacity === null ?
                 String(DEFAULT_SLOT_CAPACITY)
                : String(session.capacity),
          };
          const dateKey = dateValue || `unscheduled-${index}`;
          if (!grouped.has(dateKey)) {
            grouped.set(dateKey, {
              id: `date-${dateKey}-${index}`,
              date: dateValue,
              times: [],
            });
          }
          grouped.get(dateKey).times.push(slot);
        });
        return Array.from(grouped.values())
          .sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date.localeCompare(b.date);
          })
          .map((group) => ({
            ...group,
            times: group.times.length > 0 ? group.times : [createTimeSlot()],
          }));
      })(),
    });
    setWorkshopImagePreview(workshop.image || "");
    setWorkshopImageFile(null);
    setWorkshopError(null);
    setWorkshopModalOpen(true);
  };

  const handleDeleteWorkshop = async (workshopId) => {
    if (!db || !inventoryEnabled) return;
    await deleteDoc(doc(db, "workshops", workshopId));
    setStatusMessage("Workshop removed");
  };

  const handleCreateWorkshop = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setWorkshopError("You do not have permission to manage workshops.");
      return;
    }

    if (!workshopForm.title.trim()) {
      setWorkshopError("Workshop title is required.");
      return;
    }

    if (!workshopImageFile && !workshopForm.image.trim()) {
      setWorkshopError("Please upload a workshop image.");
      return;
    }

    const addSessionFromSlot = (collection, dateValue, slot) => {
      const trimmedDate = dateValue.trim();
      const trimmedTime = slot.time.trim();
      if (!trimmedDate || !trimmedTime) {
        return;
      }
      const combinedDate = combineDateAndTime(trimmedDate, trimmedTime);
      if (!combinedDate) return;
      const capacityNumber = Number(slot.capacity || DEFAULT_SLOT_CAPACITY);
      collection.push({
        id:
          slot.id ||
          `session-${trimmedDate}-${trimmedTime}-${Math.random()
            .toString(16)
            .slice(2, 8)}`,
        start: combinedDate.toISOString(),
        date: trimmedDate,
        time: trimmedTime,
        label: slot.label.trim() || bookingDateFormatter.format(combinedDate),
        capacity:
          Number.isFinite(capacityNumber) && capacityNumber > 0 ?
             capacityNumber
            : DEFAULT_SLOT_CAPACITY,
      });
    };

    const dateGroups = Array.isArray(workshopForm.dateGroups) ?
       workshopForm.dateGroups
      : [];
    const sanitizedSessions = [];
    const manualDates = new Set();

    dateGroups.forEach((group) => {
      const dateValue = group.date.trim();
      if (dateValue) manualDates.add(dateValue);
      (group.times || []).forEach((slot) =>
        addSessionFromSlot(sanitizedSessions, dateValue, slot)
      );
    });

    if (workshopForm.repeatWeekdays) {
      const sortedGroups = dateGroups
        .filter((group) => group.date.trim())
        .sort((a, b) => a.date.localeCompare(b.date));
      if (sortedGroups.length > 0) {
        const templateGroup = sortedGroups[0];
        const templateDate = templateGroup.date;
        const templateTimes = templateGroup.times || [];
        const startDateLiteral = new Date(templateDate);
        if (!Number.isNaN(startDateLiteral.getTime())) {
          for (let offset = 1; offset <= AUTO_REPEAT_DAYS; offset += 1) {
            const nextDate = new Date(startDateLiteral);
            nextDate.setDate(nextDate.getDate() + offset);
            if (nextDate.getDay() === 0) continue; // skip Sundays
            const isoDate = formatDateInput(nextDate);
            if (manualDates.has(isoDate)) continue;
            manualDates.add(isoDate);
            templateTimes.forEach((slot) =>
              addSessionFromSlot(sanitizedSessions, isoDate, slot)
            );
          }
        }
      }
    }

    sanitizedSessions.sort((a, b) => {
      const aTime = new Date(a.start).getTime();
      const bTime = new Date(b.start).getTime();
      return aTime - bTime;
    });

    if (sanitizedSessions.length === 0) {
      setWorkshopError("Please add at least one session (date & time).");
      return;
    }

    const primarySession = sanitizedSessions[0];
    const priceNumber = Number(workshopForm.price);
    const priceValue = Number.isFinite(priceNumber) ?
       priceNumber
      : workshopForm.price.trim();

    try {
      setWorkshopSaving(true);
      setStatusMessage(
        editingWorkshopId ? "Updating workshopâ€¦" : "Saving workshopâ€¦"
      );
      let imageUrl = workshopForm.image.trim();
      if (workshopImageFile) {
        imageUrl = await uploadAsset(workshopImageFile, "workshops");
      }

      const payload = {
        title: workshopForm.title.trim(),
        description: workshopForm.description.trim(),
        scheduledFor: primarySession.start,
        primarySessionId: primarySession.id,
        price: priceValue,
        location: workshopForm.location.trim(),
        image: imageUrl,
        updatedAt: serverTimestamp(),
        whatToExpect: workshopForm.whatToExpect.trim(),
        bookingPricing: workshopForm.bookingPricing.trim(),
        goodToKnow: workshopForm.goodToKnow.trim(),
        cancellations: workshopForm.cancellations.trim(),
        groupsInfo: workshopForm.groupsInfo.trim(),
        careInfo: workshopForm.careInfo.trim(),
        whyPeopleLove: workshopForm.whyPeopleLove.trim(),
        ctaNote: workshopForm.ctaNote.trim(),
        sessions: sanitizedSessions,
        status: workshopForm.status || "draft",
      };

      if (editingWorkshopId) {
        await updateDoc(doc(db, "workshops", editingWorkshopId), payload);
        setStatusMessage("Workshop updated");
      } else {
        await addDoc(collection(db, "workshops"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatusMessage("Workshop saved");
      }

      closeWorkshopModal();
    } catch (error) {
      setWorkshopError(error.message);
    } finally {
      setWorkshopSaving(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Workshops & Bookings</h2>
          <p className="admin-panel__note">
            Create immersive experiences with custom slots and booking rules.
          </p>
        </div>
        <div className="admin-panel__header-actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={openWorkshopModal}
            disabled={!inventoryEnabled}
          >
            <IconPlus className="btn__icon" aria-hidden="true" />
            Add Workshop
          </button>
        </div>
      </Reveal>

      <div className="admin-stack">
        <Reveal as="section" className="admin-panel" delay={60}>
          <div className="admin-panel__header">
            <h3>Workshops</h3>
            {inventoryLoading && (
              <span className="badge badge--muted">Syncingâ€¦</span>
            )}
          </div>
          {workshops.length > 0 ? (
            <div className="admin-table__wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Listing</th>
                    <th scope="col">Next Session</th>
                    <th scope="col">Price</th>
                    <th scope="col" className="admin-table__actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedWorkshops.map((workshop) => {
                    const primarySession = getPrimarySession(workshop);
                    const sessionLabel = getSessionLabel(primarySession);
                    return (
                      <tr key={workshop.id}>
                        <td>
                          <div className="admin-table__product">
                            {workshop.image ? (
                              <img
                                src={workshop.image}
                                alt={workshop.title}
                                className="admin-table__thumb" loading="lazy" decoding="async"/>
                            ) : (
                              <span className="admin-table__thumb admin-table__thumb--placeholder">
                                <IconImage aria-hidden="true" />
                              </span>
                            )}
                            <div>
                              <strong>{workshop.title}</strong>
                              {workshop.location && (
                                <p className="modal__meta">
                                  {workshop.location}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <p>{sessionLabel}</p>
                          {primarySession.time && (
                            <p className="modal__meta">{primarySession.time}</p>
                          )}
                        </td>
                        <td>{formatPriceLabel(workshop.price)}</td>
                        <td className="admin-table__actions">
                          <button
                            className="icon-btn"
                            type="button"
                            onClick={() => handleEditWorkshop(workshop)}
                          >
                            <IconEdit aria-hidden="true" />
                          </button>
                          <button
                            className="icon-btn icon-btn--danger"
                            type="button"
                            onClick={() => handleDeleteWorkshop(workshop.id)}
                          >
                            <IconTrash aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-panel__notice">
              No workshops yet. Create one to start selling seats.
            </p>
          )}
          <AdminPagination page={workshopPage} total={workshops.length} onPageChange={setWorkshopPage} />
          {statusMessage && (
            <p className="admin-panel__status">{statusMessage}</p>
          )}
        </Reveal>

        <Reveal as="section" className="admin-panel" delay={90}>
          <div className="admin-panel__header">
            <h3>Bookings</h3>
            {inventoryLoading && (
              <span className="badge badge--muted">Syncingâ€¦</span>
            )}
          </div>
          {bookings.length > 0 ? (
            <div className="admin-table__wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Guest</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Details</th>
                    <th scope="col">Received</th>
                    <th scope="col" className="admin-table__actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((bookingEntry) => {
                    const submittedAt = bookingEntry.createdAt?.toDate?.()
                      ? bookingDateFormatter.format(
                          bookingEntry.createdAt.toDate()
                        )
                      : "Pending";
                    return (
                      <tr key={bookingEntry.id}>
                        <td>{bookingEntry.name || "â€”"}</td>
                        <td>
                          {bookingEntry.email ? (
                            <a href={`mailto:${bookingEntry.email}`}>
                              {bookingEntry.email}
                            </a>
                          ) : (
                            "â€”"
                          )}
                          {bookingEntry.phone && (
                            <p className="modal__meta">{bookingEntry.phone}</p>
                          )}
                        </td>
                        <td>
                          {bookingEntry.frame && (
                            <p className="modal__meta">
                              Frame: {bookingEntry.frame}
                            </p>
                          )}
                          {bookingEntry.notes && (
                            <p className="modal__meta">
                              Notes: {bookingEntry.notes}
                            </p>
                          )}
                        </td>
                        <td>{submittedAt}</td>
                        <td className="admin-table__actions">
                          <button
                            className="icon-btn icon-btn--danger"
                            type="button"
                            onClick={() => {
                              if (!db) return;
                              deleteDoc(doc(db, "bookings", bookingEntry.id));
                            }}
                          >
                            <IconTrash aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-panel__notice">
              Bookings will appear here once submitted.
            </p>
          )}
        </Reveal>
      </div>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}

      <div
        className={`modal admin-modal ${
          isWorkshopModalOpen ? "is-active" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isWorkshopModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeWorkshopModal();
        }}
      >
        <div className="modal__content admin-modal__content">
          <button
            className="modal__close"
            type="button"
            aria-label="Close"
            onClick={closeWorkshopModal}
          >
            &times;
          </button>
          <h3 className="modal__title">
            {editingWorkshopId ? "Edit Workshop" : "Add Workshop"}
          </h3>
          <form className="admin-form" onSubmit={handleCreateWorkshop}>
            <div className="admin-file-input admin-form__full">
              <label htmlFor="workshop-image-upload" className="sr-only">
                Workshop image
              </label>
              <input
                key={editingWorkshopId ?? "new-workshop"}
                className="input input--file"
                id="workshop-image-upload"
                type="file"
                accept="image/*"
                onChange={handleWorkshopImageChange}
              />
              <p className="admin-panel__note">
                Upload JPG or PNG (max 3MB). A preview appears below.
              </p>
              {workshopImagePreview && (
                <img
                  src={workshopImagePreview}
                  alt="Workshop preview"
                  className="admin-preview" loading="lazy" decoding="async"/>
                )}
            </div>
            <input
              className="input"
              placeholder="Workshop title"
              value={workshopForm.title}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
              required
            />
            <input
              className="input"
              placeholder="Price (numbers or text)"
              value={workshopForm.price}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  price: event.target.value,
                }))
              }
            />
            <input
              className="input"
              placeholder="Location"
              value={workshopForm.location}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  location: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Description"
              value={workshopForm.description}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
            <select
              className="input"
              value={workshopForm.status}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  status: event.target.value,
                }))
              }
            >
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="archived">Archived</option>
            </select>

            <div className="admin-session-panel admin-form__full">
              <div className="admin-session-panel__header">
                <h4>Workshop sessions</h4>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={handleAddDateGroup}
                  aria-label="Add date"
                >
                  <IconPlus aria-hidden="true" />
                </button>
              </div>
              <p className="admin-panel__note">
                Add one or more dates, then include every time slot offered on
                each day.
              </p>
              {(workshopForm.dateGroups || []).map((group, index) => (
                <div className="admin-session-date-group" key={group.id}>
                  <div className="admin-session-row admin-session-row--date">
                    <div className="admin-session-field admin-session-field--label">
                      <label
                        className="admin-session-label"
                        htmlFor={`session-date-${group.id}`}
                      >
                        Date #{index + 1}
                      </label>
                      <input
                        className="input"
                        type="date"
                        id={`session-date-${group.id}`}
                        value={group.date}
                        onChange={(event) =>
                          handleDateGroupChange(group.id, event.target.value)
                        }
                      />
                    </div>
                    {(workshopForm.dateGroups || []).length > 1 && (
                      <button
                        className="icon-btn icon-btn--danger admin-session-remove"
                        type="button"
                        onClick={() => handleRemoveDateGroup(group.id)}
                        aria-label={`Remove date ${index + 1}`}
                      >
                        <IconTrash aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="admin-session-panel__header admin-session-panel__header--sub">
                    <h5>Time slots</h5>
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={() => handleAddTimeSlot(group.id)}
                      aria-label="Add time slot"
                    >
                      <IconPlus aria-hidden="true" />
                    </button>
                  </div>
                  {(group.times || []).map((slot) => (
                    <div
                      className="admin-session-row admin-session-row--nested"
                      key={slot.id}
                    >
                      <div className="admin-session-field">
                        <label
                          className="admin-session-label"
                          htmlFor={`session-time-${slot.id}`}
                        >
                          Time
                        </label>
                        <input
                          className="input"
                          type="time"
                          id={`session-time-${slot.id}`}
                          value={slot.time}
                          onChange={(event) =>
                            handleTimeSlotChange(
                              group.id,
                              slot.id,
                              "time",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div className="admin-session-field">
                        <label
                          className="admin-session-label"
                          htmlFor={`session-label-${slot.id}`}
                        >
                          Label
                        </label>
                        <input
                          className="input"
                          id={`session-label-${slot.id}`}
                          value={slot.label}
                          onChange={(event) =>
                            handleTimeSlotChange(
                              group.id,
                              slot.id,
                              "label",
                              event.target.value
                            )
                          }
                          placeholder="Morning, Afternoon, etc."
                        />
                      </div>
                      <div className="admin-session-field">
                        <label
                          className="admin-session-label"
                          htmlFor={`session-capacity-${slot.id}`}
                        >
                          Capacity
                        </label>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          id={`session-capacity-${slot.id}`}
                          value={slot.capacity}
                          onChange={(event) =>
                            handleTimeSlotChange(
                              group.id,
                              slot.id,
                              "capacity",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <button
                        className="icon-btn icon-btn--danger admin-session-remove"
                        type="button"
                        onClick={() => handleRemoveTimeSlot(group.id, slot.id)}
                        aria-label="Remove time slot"
                      >
                        <IconTrash aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={workshopForm.repeatWeekdays}
                  onChange={(event) =>
                    setWorkshopForm((prev) => ({
                      ...prev,
                      repeatWeekdays: event.target.checked,
                    }))
                  }
                />
                <span>Auto-schedule future dates (Monâ€“Sat)</span>
              </label>
              <p className="admin-panel__note">
                When enabled, the first dateâ€™s time slots repeat for the next 90
                days, skipping Sundays.
              </p>
            </div>

            <textarea
              className="input textarea admin-form__full"
              placeholder="What to Expect"
              value={workshopForm.whatToExpect}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  whatToExpect: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Booking & Pricing details"
              value={workshopForm.bookingPricing}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  bookingPricing: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Good to Know"
              value={workshopForm.goodToKnow}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  goodToKnow: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Cancellations & Policies"
              value={workshopForm.cancellations}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  cancellations: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Groups & Private Events"
              value={workshopForm.groupsInfo}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  groupsInfo: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Caring for Your Art"
              value={workshopForm.careInfo}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  careInfo: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Why people love our workshops"
              value={workshopForm.whyPeopleLove}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  whyPeopleLove: event.target.value,
                }))
              }
            />
            <input
              className="input admin-form__full"
              placeholder="CTA note (e.g. 'Book today to reserve your seat!')"
              value={workshopForm.ctaNote}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  ctaNote: event.target.value,
                }))
              }
            />
            <div className="admin-modal__actions admin-form__actions">
              <button
                className="btn btn--secondary"
                type="button"
                onClick={closeWorkshopModal}
                disabled={workshopSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                type="submit"
                disabled={!inventoryEnabled || workshopSaving}
              >
                {workshopSaving ?
                   "Savingâ€¦"
                  : editingWorkshopId ?
                   "Update Workshop"
                  : "Save Workshop"}
              </button>
            </div>
            {workshopError && (
              <p className="admin-panel__error">{workshopError}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export function AdminWorkshopsCalendarView() {
  usePageMetadata({
    title: "Admin Â· Calendar",
    description: "Overview of scheduled workshops, bookings, and events by date.",
  });
  const {
    db,
    bookings,
    events,
    cutFlowerBookings,
    inventoryLoading,
    inventoryError,
    inventoryEnabled,
  } = useAdminData();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    today.setDate(1);
    return today;
  });
  const [selectedDate, setSelectedDate] = useState(() =>
    formatDateInput(new Date())
  );
  const [quickEventOpen, setQuickEventOpen] = useState(false);
  const [quickEventForm, setQuickEventForm] = useState(() => ({
    title: "",
    location: "",
    date: formatDateInput(new Date()),
    time: "",
    notes: "",
  }));
  const [quickEventError, setQuickEventError] = useState(null);
  const [quickEventStatus, setQuickEventStatus] = useState(null);
  const [quickEventSaving, setQuickEventSaving] = useState(false);

  const handleMonthChange = (offset) => {
    setVisibleMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + offset);
      return next;
    });
  };

  const workshopBookingsByDate = useMemo(() => {
    const map = new Map();
    bookings.forEach((booking) => {
      const sessionDate = parseDateValue(booking.sessionDate);
      if (!sessionDate) return;
      const dateValue = formatDateInput(sessionDate);
      if (!map.has(dateValue)) {
        map.set(dateValue, []);
      }
      map.get(dateValue).push(booking);
    });
    return map;
  }, [bookings]);

  const undatedBookings = useMemo(
    () => bookings.filter((booking) => !parseDateValue(booking.sessionDate)),
    [bookings],
  );

  const cutFlowerBookingsByDate = useMemo(() => {
    const map = new Map();
    cutFlowerBookings.forEach((booking) => {
      const eventDate = parseDateValue(booking.eventDate);
      if (!eventDate) return;
      const dateValue = formatDateInput(eventDate);
      if (!map.has(dateValue)) {
        map.set(dateValue, []);
      }
      map.get(dateValue).push(booking);
    });
    return map;
  }, [cutFlowerBookings]);

  const undatedCutFlowerBookings = useMemo(
    () => cutFlowerBookings.filter((booking) => !parseDateValue(booking.eventDate)),
    [cutFlowerBookings],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map();
    events.forEach((eventDoc) => {
      const eventDate = parseDateValue(eventDoc.eventDate);
      if (!eventDate) return;
      const iso = formatDateInput(eventDate);
      if (!map.has(iso)) {
        map.set(iso, []);
      }
      map.get(iso).push(eventDoc);
    });
    return map;
  }, [events]);

  const undatedEvents = useMemo(
    () => events.filter((eventDoc) => !parseDateValue(eventDoc.eventDate)),
    [events],
  );

  const monthMatrix = useMemo(() => {
    const matrix = [];
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = firstDay.getDay(); // Sunday start
    const startDate = new Date(year, month, 1 - offset);
    for (let week = 0; week < 6; week += 1) {
      const weekRow = [];
      for (let day = 0; day < 7; day += 1) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + week * 7 + day);
        const iso = formatDateInput(cellDate);
        weekRow.push({
          iso,
          label: cellDate.getDate(),
          isCurrentMonth: cellDate.getMonth() === month,
          isToday: iso === formatDateInput(new Date()),
          hasBookings: workshopBookingsByDate.has(iso) || cutFlowerBookingsByDate.has(iso),
          hasEvents: eventsByDate.has(iso),
        });
      }
      matrix.push(weekRow);
    }
    return matrix;
  }, [visibleMonth, workshopBookingsByDate, cutFlowerBookingsByDate, eventsByDate]);

  const activeWorkshopBookings = workshopBookingsByDate.get(selectedDate) || [];
  const activeCutFlowerBookings = cutFlowerBookingsByDate.get(selectedDate) || [];
  const activeEvents = eventsByDate.get(selectedDate) || [];
  const workshopBookingCount = activeWorkshopBookings.length;
  const cutFlowerBookingCount = activeCutFlowerBookings.length;

  const monthLabel = visibleMonth.toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
  });

  const selectedDateLabel = useMemo(() => {
    const parsed = new Date(selectedDate);
    if (Number.isNaN(parsed.getTime())) return selectedDate;
    return parsed.toLocaleString("en-ZA", { dateStyle: "long" });
  }, [selectedDate]);

  useEffect(() => {
    if (!quickEventStatus) return undefined;
    const timeout = setTimeout(() => setQuickEventStatus(null), 3200);
    return () => clearTimeout(timeout);
  }, [quickEventStatus]);

  const openQuickEventForm = () => {
    setQuickEventForm({
      title: "",
      location: "",
      date: selectedDate || formatDateInput(new Date()),
      time: "",
      notes: "",
    });
    setQuickEventError(null);
    setQuickEventOpen(true);
  };

  const closeQuickEventForm = () => {
    setQuickEventOpen(false);
    setQuickEventError(null);
  };

  const handleQuickEventSave = async (event) => {
    event.preventDefault();
    if (!db || !inventoryEnabled) {
      setQuickEventError("You do not have permission to manage events.");
      return;
    }

    const title = quickEventForm.title.trim();
    if (!title) {
      setQuickEventError("Event title is required.");
      return;
    }

    if (!quickEventForm.date.trim()) {
      setQuickEventError("Event date is required.");
      return;
    }

    setQuickEventSaving(true);
    setQuickEventError(null);

    try {
      const timeValue = quickEventForm.time.trim();
      const combinedDate = combineDateAndTime(quickEventForm.date, timeValue);
      const timeSlots = timeValue
        ? [
            {
              id: createEventTimeSlot().id,
              time: timeValue,
              endTime: "",
              label: "",
            },
          ]
        : [];
      const payload = {
        title,
        description: quickEventForm.notes.trim(),
        location: quickEventForm.location.trim(),
        eventDate: combinedDate ?? null,
        timeSlots,
        repeatWeekly: false,
        repeatDays: [],
        image: "",
        workshopId: null,
        workshopTitle: null,
        status: "draft",
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "events"), {
        ...payload,
        createdAt: serverTimestamp(),
      });

      setQuickEventStatus("Event added to calendar.");
      setQuickEventForm((prev) => ({
        ...prev,
        title: "",
        location: "",
        time: "",
        notes: "",
        date: selectedDate || prev.date,
      }));
    } catch (saveError) {
      console.error(saveError);
      const errorCode = String(saveError?.code || saveError?.message || "");
      if (errorCode.includes("permission-denied") || errorCode.includes("unauthenticated")) {
        setQuickEventError(
          'Permission denied. Confirm this user is signed in and has role "admin" in users/{uid}.'
        );
      } else {
        setQuickEventError(saveError?.message || "We couldn't save the event. Please try again.");
      }
    } finally {
      setQuickEventSaving(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Studio Calendar</h2>
          <p className="admin-panel__note">
            Track workshops, private bookings, and cut flower installs in a single glance.
          </p>
        </div>
      </Reveal>

      {inventoryLoading && (
        <p className="modal__meta">Syncing latest workshopsâ€¦</p>
      )}

      <div className="admin-calendar">
        <div className="card admin-calendar__panel">
          <div className="admin-calendar__header">
            <button
              className="btn btn--secondary admin-calendar__nav"
              type="button"
              onClick={() => handleMonthChange(-1)}
              aria-label="Previous month"
            >
              â€¹
            </button>
            <div>
              <h3>{monthLabel}</h3>
              <p className="modal__meta">Showing workshop + cut flower bookings and events for this month</p>
            </div>
            <button
              className="btn btn--secondary admin-calendar__nav"
              type="button"
              onClick={() => handleMonthChange(1)}
              aria-label="Next month"
            >
              â€º
            </button>
          </div>

          <div className="admin-calendar__legend">
            <span>
              <span className="legend-dot legend-dot--booked" /> Booking days (workshops + cut flowers)
            </span>
            <span>
              <span className="legend-dot legend-dot--event" /> Event days
            </span>
            <span>
              <span className="legend-dot legend-dot--today" /> Today
            </span>
            <span>
              <span className="legend-dot legend-dot--selected" /> Selected date
            </span>
          </div>

          <div className="admin-calendar__grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="admin-calendar__weekday">
                {label}
              </div>
            ))}
            {monthMatrix.flat().map((day) => (
              <button
                key={day.iso}
                type="button"
                className={`admin-calendar__cell ${
                  day.isCurrentMonth ? "" : "is-muted"
                } ${day.hasBookings ? "has-bookings" : ""} ${
                  day.hasEvents ? "has-events" : ""
                } ${
                  selectedDate === day.iso ? "is-selected" : ""
                } ${day.isToday ? "is-today" : ""}`}
                onClick={() => setSelectedDate(day.iso)}
              >
                <span>{day.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card admin-calendar__details">
          <div className="admin-calendar__details-header">
            <div>
              <h4>{selectedDateLabel}</h4>
              <p className="modal__meta">
                Workshops: {workshopBookingCount} | Cut flowers: {cutFlowerBookingCount} | Events: {activeEvents.length}
              </p>
            </div>
            <button
              className="btn btn--secondary btn--small"
              type="button"
              onClick={quickEventOpen ? closeQuickEventForm : openQuickEventForm}
              disabled={!inventoryEnabled}
            >
              {quickEventOpen ? "Close" : "Add calendar event"}
            </button>
          </div>
          <div className="admin-calendar__details-group">
            <h5>Workshop bookings</h5>
            {activeWorkshopBookings.length > 0 ? (
              <ul>
                {activeWorkshopBookings.map((booking) => (
                  <li key={booking.id}>
                    <div>
                      <strong>{booking.name}</strong>
                      <p className="modal__meta">
                        {booking.sessionLabel || "Session"} Â·{" "}
                        {booking.frame || "Workshop"}
                      </p>
                    </div>
                    <div className="admin-calendar__details-actions">
                      <a href={`mailto:${booking.email}`}>{booking.email}</a>
                      {booking.notes && (
                        <p className="modal__meta">{booking.notes}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="modal__meta">
                No workshop bookings recorded for this date yet.
              </p>
            )}
          </div>
          <div className="admin-calendar__details-group">
            <h5>Cut flower bookings</h5>
            {activeCutFlowerBookings.length > 0 ? (
              <ul>
                {activeCutFlowerBookings.map((booking) => {
                  const eventDate = parseDateValue(booking.eventDate);
                  const timeLabel = eventDate ? formatTimeValue(eventDate) : "";
                  return (
                    <li key={booking.id}>
                      <div>
                        <strong>{booking.customerName || "Cut flower booking"}</strong>
                        <p className="modal__meta">
                          {timeLabel ? `${timeLabel} - ` : ""}{booking.location || "Location tbc"}
                        </p>
                        {booking.occasion && (
                          <p className="modal__meta">Occasion: {booking.occasion}</p>
                        )}
                      </div>
                      <div className="admin-calendar__details-actions">
                        {booking.email && (
                          <a href={`mailto:${booking.email}`}>{booking.email}</a>
                        )}
                        {booking.phone && (
                          <p className="modal__meta">{booking.phone}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="modal__meta">
                No cut flower bookings recorded for this date yet.
              </p>
            )}
          </div>
          <div className="admin-calendar__details-group">
            <h5>Events</h5>
            {activeEvents.length > 0 ? (
              <ul>
                {activeEvents.map((eventDoc) => (
                  <li key={eventDoc.id}>
                    <div>
                      <strong>{eventDoc.title}</strong>
                      {eventDoc.location && (
                        <p className="modal__meta">{eventDoc.location}</p>
                      )}
                      {eventDoc.workshopTitle && (
                        <p className="modal__meta">
                          Linked workshop: {eventDoc.workshopTitle}
                        </p>
                      )}
                    </div>
                    <div className="admin-calendar__details-actions">
                      {eventDoc.workshopId && (
                        <Link to={`/workshops/${eventDoc.workshopId}`}>
                          View workshop
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="modal__meta">No events scheduled for this date.</p>
            )}
          </div>
          {(undatedBookings.length > 0 ||
            undatedCutFlowerBookings.length > 0 ||
            undatedEvents.length > 0) && (
            <div className="admin-calendar__details-group">
              <h5>Needs a date</h5>
              <ul>
                {undatedBookings.map((booking) => {
                  const receivedAt = booking.createdAt?.toDate?.()
                    ? bookingDateFormatter.format(booking.createdAt.toDate())
                    : null;
                  const bookingLabel =
                    booking.name || booking.email || "Workshop booking";
                  return (
                    <li key={`undated-booking-${booking.id}`}>
                      <div>
                        <strong>{bookingLabel}</strong>
                        <p className="modal__meta">Workshop booking</p>
                      </div>
                      <div className="admin-calendar__details-actions">
                        {booking.email && (
                          <a href={`mailto:${booking.email}`}>
                            {booking.email}
                          </a>
                        )}
                        {receivedAt && (
                          <p className="modal__meta">
                            Received {receivedAt}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
                {undatedCutFlowerBookings.map((booking) => (
                  <li key={`undated-cut-flower-${booking.id}`}>
                    <div>
                      <strong>{booking.customerName || "Cut flower booking"}</strong>
                      <p className="modal__meta">Cut flower booking</p>
                    </div>
                    <div className="admin-calendar__details-actions">
                      {booking.email && (
                        <a href={`mailto:${booking.email}`}>{booking.email}</a>
                      )}
                      {booking.phone && <p className="modal__meta">{booking.phone}</p>}
                    </div>
                  </li>
                ))}
                {undatedEvents.map((eventDoc) => (
                  <li key={`undated-event-${eventDoc.id}`}>
                    <div>
                      <strong>{eventDoc.title || "Event"}</strong>
                      {eventDoc.location && (
                        <p className="modal__meta">{eventDoc.location}</p>
                      )}
                    </div>
                    <div className="admin-calendar__details-actions">
                      <p className="modal__meta">Date required</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </div>

      {quickEventOpen && (
        <div
          className="modal is-active admin-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeQuickEventForm();
            }
          }}
        >
          <div className="modal__content">
            <button
              className="modal__close"
              type="button"
              aria-label="Close"
              onClick={closeQuickEventForm}
            >
              Ã—
            </button>
            <h3>Add calendar event</h3>
            <p className="admin-panel__note">
              Schedule quick events, reminders, or custom studio days without creating a full workshop listing.
            </p>
            <form className="admin-form" onSubmit={handleQuickEventSave}>
              <div className="admin-form__field">
                <label htmlFor="quick-event-title">Event title</label>
                <input
                  className="input"
                  id="quick-event-title"
                  placeholder="Event title"
                  value={quickEventForm.title}
                  onChange={(event) =>
                    setQuickEventForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="admin-form__field">
                <label htmlFor="quick-event-location">Location (optional)</label>
                <input
                  className="input"
                  id="quick-event-location"
                  placeholder="Location (optional)"
                  value={quickEventForm.location}
                  onChange={(event) =>
                    setQuickEventForm((prev) => ({ ...prev, location: event.target.value }))
                  }
                />
              </div>
              <div className="admin-form__field">
                <label htmlFor="quick-event-date">Date</label>
                <input
                  className="input"
                  id="quick-event-date"
                  type="date"
                  value={quickEventForm.date}
                  onChange={(event) =>
                    setQuickEventForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="admin-form__field">
                <label htmlFor="quick-event-time">Time (optional)</label>
                <input
                  className="input"
                  id="quick-event-time"
                  type="time"
                  value={quickEventForm.time}
                  onChange={(event) =>
                    setQuickEventForm((prev) => ({ ...prev, time: event.target.value }))
                  }
                />
              </div>
              <div className="admin-form__field admin-form__field--description">
                <label htmlFor="quick-event-notes">Notes (optional)</label>
                <textarea
                  className="input textarea admin-form__full"
                  id="quick-event-notes"
                  placeholder="Notes (optional)"
                  value={quickEventForm.notes}
                  onChange={(event) =>
                    setQuickEventForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </div>
              <div className="admin-form__actions">
                <button className="btn btn--secondary" type="button" onClick={closeQuickEventForm}>
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={quickEventSaving || !inventoryEnabled}
                >
                  {quickEventSaving ? "Saving..." : "Save event"}
                </button>
              </div>
              {quickEventError && <p className="admin-panel__error">{quickEventError}</p>}
            </form>
          </div>
        </div>
      )}

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
    </div>
  );
}

export function AdminEventsView() {
  usePageMetadata({
    title: "Admin Â· Events",
    description: "Publish Bethany Blooms events and connect them to workshops.",
  });
  const {
    db,
    storage,
    events,
    workshops,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const uploadAsset = useUploadAsset(storage);
  const [eventForm, setEventForm] = useState(INITIAL_EVENT_FORM);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventImageFile, setEventImageFile] = useState(null);
  const [eventImagePreview, setEventImagePreview] = useState("");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState(null);
  const [eventStatus, setEventStatus] = useState(null);
  const eventPreviewUrlRef = useRef(null);
  const [eventPage, setEventPage] = useState(0);
  const blocked = !inventoryEnabled;
  const [deleteDialog, setDeleteDialog] = useState({ open: false, targetId: null, label: "" });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const normalizedEvents = useMemo(() => {
    return events
      .map((eventDoc) => {
        const eventDate = parseDateValue(eventDoc.eventDate);
        const repeatLabel = eventDoc.repeatWeekly ? formatRepeatLabel(eventDoc.repeatDays) : "";
        const timeSummary = buildTimeSummary(eventDoc.timeSlots);
        return {
          ...eventDoc,
          eventDate,
          displayDate: repeatLabel || (eventDate ? bookingDateFormatter.format(eventDate) : "Date to be confirmed"),
          timeSummary,
        };
      })
      .sort((a, b) => {
        if (!a.eventDate && !b.eventDate) return 0;
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return a.eventDate - b.eventDate;
      });
  }, [events]);

  useEffect(() => {
    if (!eventStatus) return undefined;
    const timeout = setTimeout(() => setEventStatus(null), 3200);
    return () => clearTimeout(timeout);
  }, [eventStatus]);

  useEffect(
    () => () => {
      if (eventPreviewUrlRef.current) {
        URL.revokeObjectURL(eventPreviewUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(normalizedEvents.length / ADMIN_PAGE_SIZE) - 1);
    setEventPage((prev) => Math.min(prev, maxPage));
  }, [normalizedEvents.length]);

  const workshopOptions = useMemo(
    () =>
      workshops.map((workshop) => ({
        id: workshop.id,
        title: workshop.title || workshop.name || "Untitled Workshop",
      })),
    [workshops]
  );

  const paginatedEvents = useMemo(() => {
    const start = eventPage * ADMIN_PAGE_SIZE;
    return normalizedEvents.slice(start, start + ADMIN_PAGE_SIZE);
  }, [normalizedEvents, eventPage]);

  const resetEventForm = () => {
    setEventForm(INITIAL_EVENT_FORM);
    setEditingEventId(null);
    setEventImageFile(null);
    setEventImagePreview("");
    setEventError(null);
  };

  const handleEventDateChange = (value) => {
    setEventForm((prev) => {
      const next = { ...prev, date: value };
      if (prev.repeatWeekly && (!prev.repeatDays || prev.repeatDays.length === 0) && value) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          next.repeatDays = [parsed.getDay()];
        }
      }
      return next;
    });
  };

  const handleAddEventTimeSlot = () => {
    setEventForm((prev) => ({
      ...prev,
      timeSlots: [...(prev.timeSlots || []), createEventTimeSlot()],
    }));
  };

  const handleEventTimeSlotChange = (slotId, field, value) => {
    setEventForm((prev) => ({
      ...prev,
      timeSlots: (prev.timeSlots || []).map((slot) =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      ),
    }));
  };

  const handleRemoveEventTimeSlot = (slotId) => {
    setEventForm((prev) => {
      const remaining = (prev.timeSlots || []).filter((slot) => slot.id !== slotId);
      return {
        ...prev,
        timeSlots: remaining.length > 0 ? remaining : [createEventTimeSlot()],
      };
    });
  };

  const handleToggleRepeatWeekly = (checked) => {
    setEventForm((prev) => {
      const next = { ...prev, repeatWeekly: checked };
      if (!checked) {
        next.repeatDays = [];
      } else if ((!prev.repeatDays || prev.repeatDays.length === 0) && prev.date) {
        const parsed = new Date(prev.date);
        if (!Number.isNaN(parsed.getTime())) {
          next.repeatDays = [parsed.getDay()];
        }
      }
      return next;
    });
  };

  const handleToggleRepeatDay = (dayValue) => {
    setEventForm((prev) => {
      const existing = Array.isArray(prev.repeatDays) ? prev.repeatDays : [];
      const normalized = existing.includes(dayValue) ?
         existing.filter((day) => day !== dayValue)
        : [...existing, dayValue];
      return {
        ...prev,
        repeatDays: normalized,
      };
    });
  };

  const handleEventImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (eventPreviewUrlRef.current) {
      URL.revokeObjectURL(eventPreviewUrlRef.current);
      eventPreviewUrlRef.current = null;
    }
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        setEventError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(file);
      eventPreviewUrlRef.current = preview;
      setEventImageFile(file);
      setEventImagePreview(preview);
    } else {
      setEventImageFile(null);
      setEventImagePreview(eventForm.image || "");
    }
  };

  const handleEditEvent = (eventDoc) => {
    const eventDate = parseDateValue(eventDoc.eventDate);
    const fallbackTime =
      eventDate && (eventDate.getHours() || eventDate.getMinutes()) ?
         formatTimeInput(eventDate)
        : "";
    const rawTimeSlots = Array.isArray(eventDoc.timeSlots) ? eventDoc.timeSlots : [];
    const normalizedSlots =
      rawTimeSlots.length > 0
        ? rawTimeSlots.map((slot, index) => ({
            id: slot.id || `event-time-${index}-${eventDoc.id}`,
            time: slot.time || "",
            endTime: slot.endTime || "",
            label: slot.label || "",
          }))
        : [
            {
              ...createEventTimeSlot(),
              time: fallbackTime,
            },
          ];
    setEventForm({
      title: eventDoc.title || "",
      description: eventDoc.description || "",
      location: eventDoc.location || "",
      date: eventDate ? formatDateInput(eventDate) : "",
      timeSlots: normalizedSlots,
      image: eventDoc.image || "",
      workshopId: eventDoc.workshopId || "",
      status: eventDoc.status || "live",
      repeatWeekly: Boolean(eventDoc.repeatWeekly),
      repeatDays: Array.isArray(eventDoc.repeatDays)
        ? eventDoc.repeatDays
            .map((day) => Number(day))
            .filter((day) => Number.isFinite(day))
        : [],
    });
    setEventImagePreview(eventDoc.image || "");
    setEventImageFile(null);
    setEditingEventId(eventDoc.id);
    setEventError(null);
  };

  const handleDeleteEvent = async (eventId) => {
    if (!db || !inventoryEnabled) return;
    setDeleteDialog({ open: true, targetId: eventId, label: "event" });
  };

  const handleSaveEvent = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setEventError("You do not have permission to manage events.");
      return;
    }

    const title = eventForm.title.trim();
    if (!title) {
      setEventError("Event title is required.");
      return;
    }

    if (!eventForm.date.trim()) {
      setEventError("Event date is required.");
      return;
    }

    let imageUrl = eventForm.image.trim();
    setEventSaving(true);
    setEventError(null);

    try {
      if (eventImageFile) {
        imageUrl = await uploadAsset(eventImageFile, "events");
      }

      if (!imageUrl) {
        setEventError("Please upload an event image.");
        setEventSaving(false);
        return;
      }

      const sanitizedSlots = (eventForm.timeSlots || [])
        .map((slot) => ({
          id: slot.id || createEventTimeSlot().id,
          time: slot.time.trim() || "",
          endTime: slot.endTime.trim() || "",
          label: slot.label.trim() || "",
        }))
        .filter((slot) => slot.time);
      sanitizedSlots.sort((a, b) => a.time.localeCompare(b.time));
      const primaryTime = sanitizedSlots[0]?.time ?? "";
      const combinedDate = combineDateAndTime(eventForm.date, primaryTime);
      const linkedWorkshop =
        workshops.find((workshop) => workshop.id === eventForm.workshopId) || null;
      const repeatDays = eventForm.repeatWeekly
        ? Array.isArray(eventForm.repeatDays)
          ? eventForm.repeatDays
              .map((day) => Number(day))
              .filter((day) => Number.isFinite(day))
          : []
        : [];

      const payload = {
        title,
        description: eventForm.description.trim(),
        location: eventForm.location.trim(),
        eventDate: combinedDate ?? null,
        timeSlots: sanitizedSlots,
        repeatWeekly: Boolean(eventForm.repeatWeekly),
        repeatDays,
        image: imageUrl,
        workshopId: linkedWorkshop?.id || null,
        workshopTitle: linkedWorkshop?.title || linkedWorkshop?.name || null,
        status: eventForm.status || "draft",
        updatedAt: serverTimestamp(),
      };

      if (editingEventId) {
        await updateDoc(doc(db, "events", editingEventId), payload);
        setEventStatus("Event updated");
      } else {
        await addDoc(collection(db, "events"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setEventStatus("Event added");
      }

      resetEventForm();
    } catch (saveError) {
      console.error(saveError);
      const errorCode = String(saveError?.code || saveError?.message || "");
      if (errorCode.includes("permission-denied") || errorCode.includes("unauthenticated")) {
        setEventError(
          'Permission denied. Confirm this user is signed in and has role "admin" in users/{uid}.'
        );
      } else {
        setEventError(saveError?.message || "We couldn't save the event. Please try again.");
      }
    } finally {
      setEventSaving(false);
    }
  };

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <div className="admin-panel">
            <div className="admin-panel__header">
              <div>
                <h2>Events</h2>
              <p className="admin-panel__note">
                Share pop-ups, markets, and studio open days, then link a workshop so guests can book in one click.
              </p>
            </div>
            {eventStatus && <span className="badge badge--muted">{eventStatus}</span>}
          </div>
            {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
          {blocked && !inventoryError && (
            <p className="admin-panel__error">
              Admin permissions or Firestore connection not detected. Ensure your account has role "admin" in
              users/{`{uid}`} and that Firestore is configured for this project.
            </p>
          )}
          <div className="admin-panel__content">
            <div>
              <h3>{editingEventId ? "Edit Event" : "Create Event"}</h3>
              <form className="admin-form" onSubmit={handleSaveEvent}>
                <input
                  className="input"
                  placeholder="Event title"
                  value={eventForm.title}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  required
                />
                <input
                  className="input"
                  placeholder="Location"
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                />
                <select
                  className="input"
                  value={eventForm.status}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="archived">Archived</option>
                </select>
                <input
                  className="input"
                  type="date"
                  value={eventForm.date}
                  onChange={(e) =>
                    handleEventDateChange(e.target.value)
                  }
                  required
                />
                <div className="admin-session-panel admin-form__full">
                  <div className="admin-session-panel__header">
                    <h4>Event times</h4>
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={handleAddEventTimeSlot}
                      aria-label="Add time slot"
                    >
                      <IconPlus aria-hidden="true" />
                    </button>
                  </div>
                  <p className="admin-panel__note">
                    Add one or more time slots for this event day.
                  </p>
                  {(eventForm.timeSlots || []).map((slot) => (
                    <div className="admin-session-row" key={slot.id}>
                      <div className="admin-session-field">
                        <label
                          className="admin-session-label"
                          htmlFor={`event-time-${slot.id}`}
                        >
                          Start
                        </label>
                        <input
                          className="input"
                          type="time"
                          id={`event-time-${slot.id}`}
                          value={slot.time}
                          onChange={(event) =>
                            handleEventTimeSlotChange(
                              slot.id,
                              "time",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div className="admin-session-field">
                        <label
                          className="admin-session-label"
                          htmlFor={`event-end-${slot.id}`}
                        >
                          End
                        </label>
                        <input
                          className="input"
                          type="time"
                          id={`event-end-${slot.id}`}
                          value={slot.endTime || ""}
                          onChange={(event) =>
                            handleEventTimeSlotChange(
                              slot.id,
                              "endTime",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div className="admin-session-field admin-session-field--label">
                        <label
                          className="admin-session-label"
                          htmlFor={`event-label-${slot.id}`}
                        >
                          Label (optional)
                        </label>
                        <input
                          className="input"
                          id={`event-label-${slot.id}`}
                          value={slot.label}
                          onChange={(event) =>
                            handleEventTimeSlotChange(
                              slot.id,
                              "label",
                              event.target.value
                            )
                          }
                          placeholder="Morning, Afternoon, etc."
                        />
                      </div>
                      <button
                        className="icon-btn icon-btn--danger admin-session-remove"
                        type="button"
                        onClick={() => handleRemoveEventTimeSlot(slot.id)}
                        aria-label="Remove time slot"
                      >
                        <IconTrash aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="admin-session-panel admin-form__full">
                  <div className="admin-session-panel__header">
                    <h4>Repeat weekly</h4>
                  </div>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={eventForm.repeatWeekly}
                      onChange={(event) =>
                        handleToggleRepeatWeekly(event.target.checked)
                      }
                    />
                    <span>Repeat this event on selected weekdays</span>
                  </label>
                  {eventForm.repeatWeekly && (
                    <div className="admin-repeat-days">
                      {EVENT_REPEAT_WEEKDAYS.map((day) => (
                        <label className="admin-repeat-day" key={day.value}>
                          <input
                            type="checkbox"
                            checked={
                              Array.isArray(eventForm.repeatDays) &&
                              eventForm.repeatDays.includes(day.value)
                            }
                            onChange={() => handleToggleRepeatDay(day.value)}
                          />
                          <span>{day.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="admin-panel__note">
                    Use this for recurring events like every Saturday.
                  </p>
                </div>
                <select
                  className="input"
                  value={eventForm.workshopId}
                  onChange={(e) =>
                    setEventForm((prev) => ({
                      ...prev,
                      workshopId: e.target.value,
                    }))
                  }
                >
                  <option value="">Link a workshop (optional)</option>
                  {workshopOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
                <textarea
                  className="input textarea admin-form__full"
                  placeholder="Event description"
                  value={eventForm.description}
                  onChange={(e) =>
                    setEventForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
                <div className="admin-file-input admin-form__full">
                  <label htmlFor="event-image-upload" className="sr-only">
                    Event image
                  </label>
                  <input
                    key={editingEventId ?? "new-event"}
                    className="input input--file"
                    id="event-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleEventImageChange}
                  />
                  <p className="admin-panel__note">Upload JPG or PNG (max 3MB).</p>
                  {(eventImagePreview || eventForm.image) && (
                    <img
                      src={eventImagePreview || eventForm.image}
                      alt="Event preview"
                      className="admin-preview" loading="lazy" decoding="async"/>
                  )}
                </div>
                <div className="admin-form__actions">
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={resetEventForm}
                    disabled={eventSaving}
                  >
                    Reset
                  </button>
                  <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={eventSaving || !inventoryEnabled}
                  >
                    {eventSaving ?
                       "Savingâ€¦"
                      : editingEventId ?
                       "Update Event"
                      : "Create Event"}
                  </button>
                </div>
                {eventError && <p className="admin-panel__error">{eventError}</p>}
              </form>
            </div>
            <div>
              <h3>Scheduled Events</h3>
              {inventoryLoading && !events.length ? (
                <p className="admin-panel__note">Loading eventsâ€¦</p>
                ) : (
                <div className="admin-panel__list">
                  {normalizedEvents.length === 0 ? (
                    <p className="admin-panel__note">No events yet.</p>
                  ) : (
                    paginatedEvents.map((eventDoc) => (
                      <article className="admin-event-card" key={eventDoc.id}>
                        <div className="admin-event-card__info">
                          <p className="admin-event-card__date">{eventDoc.displayDate}</p>
                          <h4>{eventDoc.title}</h4>
                          {eventDoc.location && (
                            <p className="admin-event-card__meta">{eventDoc.location}</p>
                          )}
                          {eventDoc.timeSummary && (
                            <p className="admin-event-card__meta">
                              Times: {eventDoc.timeSummary}
                            </p>
                          )}
                          {eventDoc.workshopTitle && (
                            <p className="admin-event-card__meta">
                              Linked workshop: {eventDoc.workshopTitle}
                            </p>
                          )}
                        </div>
                        <div className="admin-event-card__actions">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            onClick={() => handleEditEvent(eventDoc)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn--primary"
                            type="button"
                            onClick={() => handleDeleteEvent(eventDoc.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
                )}
              <AdminPagination page={eventPage} total={normalizedEvents.length} onPageChange={setEventPage} />
            </div>
          </div>
        </div>
      </div>
      </section>
      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete Event"
        message="Are you sure you want to delete this event This cannot be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onCancel={() => setDeleteDialog({ open: false, targetId: null, label: "" })}
        onConfirm={async () => {
          if (!db || !deleteDialog.targetId) return;
          setDeleteBusy(true);
          setEventError(null);
          try {
            await deleteDoc(doc(db, "events", deleteDialog.targetId));
            setEventStatus("Event removed");
            if (editingEventId === deleteDialog.targetId) {
              resetEventForm();
            }
          } catch (err) {
            setEventError(err.message);
          } finally {
            setDeleteBusy(false);
            setDeleteDialog({ open: false, targetId: null, label: "" });
          }
        }}
      />
    </>
  );
}

export function AdminEmailTestView() {
  usePageMetadata({
    title: "Admin Â· Email preview",
    description: "Preview email HTML with dummy data without sending any emails.",
  });
  const { inventoryEnabled } = useAdminData();
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const [formState, setFormState] = useState({
    templateType: "eft-pending-customer",
    subject: "Bethany Blooms test email",
    html: "<p>Hello from Bethany Blooms. This is a test email preview.</p>",
  });
  const [previewData, setPreviewData] = useState({
    subject: "",
    html: "",
    generatedAt: "",
  });
  const [statusMessage, setStatusMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showRawHtml, setShowRawHtml] = useState(false);

  const isCustomTemplate = formState.templateType === "custom";

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  const requestPreview = async (payloadOverride = null) => {
    if (!functionsInstance) {
      setError("Email functions are not available.");
      return;
    }
    if (!inventoryEnabled) {
      setError("Admin access is required to preview emails.");
      return;
    }

    const payload = payloadOverride || {
      templateType: formState.templateType || "custom",
      subject: formState.subject,
      html: formState.html,
    };

    setLoadingPreview(true);
    setError(null);
    try {
      const callable = httpsCallable(functionsInstance, "previewTestEmailTemplate");
      const response = await callable({
        templateType: payload.templateType || "custom",
        subject: (payload.subject || "").toString(),
        html: (payload.html || "").toString(),
      });
      const nextPreview = {
        subject: (response?.data?.subject || "").toString(),
        html: (response?.data?.html || "").toString(),
        generatedAt: (response?.data?.generatedAt || "").toString(),
      };
      setPreviewData(nextPreview);
      const generatedLabel = nextPreview.generatedAt ?
        new Date(nextPreview.generatedAt).toLocaleString("en-ZA") :
        "";
      setStatusMessage(generatedLabel ? `Preview refreshed at ${generatedLabel}.` : "Preview refreshed.");
    } catch (previewError) {
      setError(previewError.message || "Unable to load email preview.");
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (!functionsInstance || !inventoryEnabled) return;
    requestPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionsInstance, inventoryEnabled]);

  const handleRefreshPreview = async (event) => {
    if (event) event.preventDefault();
    await requestPreview();
  };

  return (
    <div className="admin-panel admin-panel--full admin-email-preview">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Email Preview</h2>
          <p className="admin-panel__note">
            Preview real email templates with dummy data. No emails are sent from this page.
          </p>
        </div>
      </Reveal>

      <div className="admin-email-preview__layout">
        <form className="admin-email-preview__controls" onSubmit={handleRefreshPreview}>
          <label className="admin-form__field" htmlFor="email-preview-template">
            <span>Template</span>
            <select
              className="input"
              id="email-preview-template"
              value={formState.templateType}
              onChange={(event) => {
                const nextTemplateType = event.target.value;
                setFormState((prev) => ({ ...prev, templateType: nextTemplateType }));
                if (nextTemplateType !== "custom") {
                  requestPreview({
                    templateType: nextTemplateType,
                    subject: formState.subject,
                    html: formState.html,
                  });
                }
              }}
            >
              <option value="eft-pending-customer">EFT pending (customer)</option>
              <option value="eft-pending-admin">EFT pending (admin)</option>
              <option value="eft-approved-customer">EFT approved (customer)</option>
              <option value="eft-approved-admin">EFT approved (admin)</option>
              <option value="eft-rejected-customer">EFT rejected (customer)</option>
              <option value="eft-rejected-admin">EFT rejected (admin)</option>
              <option value="order-confirmation">Order confirmation (customer)</option>
              <option value="order-admin">Order notification (admin)</option>
              <option value="order-status">Order status update (customer)</option>
              <option value="order-delivery-update">Order delivery update (customer)</option>
              <option value="account-welcome">Account welcome (customer)</option>
              <option value="pos-receipt">POS receipt (customer)</option>
              <option value="pos-admin">POS receipt (admin copy)</option>
              <option value="contact-admin">Contact enquiry (admin)</option>
              <option value="contact-confirm">Contact confirmation (customer)</option>
              <option value="cut-flower-admin">Cut flower booking (admin)</option>
              <option value="cut-flower-customer">Cut flower booking (customer)</option>
              <option value="workshop-admin">Workshop booking (admin)</option>
              <option value="workshop-customer">Workshop booking (customer)</option>
              <option value="custom">Custom HTML</option>
            </select>
          </label>

          {isCustomTemplate && (
            <>
              <label className="admin-form__field" htmlFor="email-preview-subject">
                <span>Custom subject</span>
                <input
                  className="input"
                  id="email-preview-subject"
                  value={formState.subject}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, subject: event.target.value }))
                  }
                />
              </label>
              <label className="admin-form__field" htmlFor="email-preview-html">
                <span>Custom HTML body</span>
                <textarea
                  className="input textarea"
                  id="email-preview-html"
                  rows="9"
                  value={formState.html}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, html: event.target.value }))
                  }
                />
              </label>
            </>
          )}

          {!isCustomTemplate && (
            <p className="admin-panel__note">
              This template uses backend-rendered email HTML and dummy data from Cloud Functions.
            </p>
          )}

          <div className="admin-form__actions">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={loadingPreview || !inventoryEnabled || !functionsInstance}
            >
              {loadingPreview ? "Refreshing..." : "Refresh Preview"}
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => setShowRawHtml((prev) => !prev)}
              disabled={!previewData.html}
            >
              {showRawHtml ? "Hide Raw HTML" : "Show Raw HTML"}
            </button>
          </div>
          {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
          {error && <p className="admin-panel__error">{error}</p>}
        </form>

        <div className="admin-email-preview__panel">
          <div className="admin-email-preview__meta">
            <p className="modal__meta">
              <strong>Subject:</strong> {previewData.subject || "â€”"}
            </p>
            {previewData.generatedAt && (
              <p className="modal__meta">
                Generated: {new Date(previewData.generatedAt).toLocaleString("en-ZA")}
              </p>
            )}
          </div>
          <div className="admin-email-preview__frame-wrap">
            <iframe
              className="admin-email-preview__frame"
              title="Email HTML preview"
              srcDoc={previewData.html || "<p style='padding:1rem;'>No preview available yet.</p>"}
            />
          </div>
          {showRawHtml && (
            <div className="admin-email-preview__raw">
              <p className="modal__meta"><strong>Raw HTML</strong></p>
              <pre>{previewData.html || "No HTML available."}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminInvoicePreviewView() {
  usePageMetadata({
    title: "Admin Â· Invoice preview",
    description:
      "Preview subscription invoice PDF design without sending customer emails.",
  });
  const { inventoryEnabled } = useAdminData();
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);
  const {
    items: subscriptionInvoices,
    status: invoiceSourceStatus,
    error: subscriptionInvoicesError,
  } = useFirestoreCollection("subscriptionInvoices", {
    orderByField: "updatedAt",
    orderDirection: "desc",
  });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [previewState, setPreviewState] = useState({
    previewUrl: "",
    fileName: "",
    generatedAt: "",
    invoiceNumber: "",
    planName: "",
    cycleMonth: "",
    amount: null,
  });
  const previewUrlRef = useRef("");
  const [statusMessage, setStatusMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const localPreviewHelpMessage =
    "Invoice preview function is unreachable. Deploy `previewSubscriptionInvoiceTemplate` " +
    "(`firebase deploy --only functions:previewSubscriptionInvoiceTemplate`) or run the " +
    "Functions emulator (`firebase emulators:start --only functions`) with " +
    "`VITE_USE_LOCAL_FUNCTIONS=true` in `frontend/.env.local`.";

  const invoiceOptions = useMemo(() => {
    return subscriptionInvoices
      .map((entry) => {
        const id = (entry.id || "").toString().trim();
        if (!id) return null;
        const cycleMonth = (entry.cycleMonth || "cycle").toString().trim();
        const amount = Number(entry.amount || 0);
        const planName = (
          entry.planName ||
          entry?.subscriptionPlan?.name ||
          entry?.subscriptionProduct?.productName ||
          "Subscription"
        )
          .toString()
          .trim();
        return {
          id,
          label: `${cycleMonth} Â· ${formatPriceLabel(amount)} Â· ${planName}`,
        };
      })
      .filter(Boolean)
      .slice(0, 120);
  }, [subscriptionInvoices]);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  }, []);

  useEffect(() => {
    if (selectedInvoiceId) return;
    if (!invoiceOptions.length) return;
    setSelectedInvoiceId(invoiceOptions[0].id);
  }, [selectedInvoiceId, invoiceOptions]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
    },
    [],
  );

  const refreshPreview = async (event) => {
    if (event) event.preventDefault();
    if (!functionsInstance) {
      setError("Invoice preview functions are not available.");
      return;
    }
    if (!inventoryEnabled) {
      setError("Admin access is required to preview invoices.");
      return;
    }
    if (!selectedInvoiceId) {
      setError("Select an invoice to preview.");
      return;
    }

    setLoadingPreview(true);
    setError(null);
    setStatusMessage(null);
    try {
      const callable = httpsCallable(functionsInstance, "previewSubscriptionInvoiceTemplate");
      const response = await callable({
        invoiceId: selectedInvoiceId,
      });
      const data = response?.data || {};
      const encodedPdf = (data.pdfBase64 || "").toString().trim();
      if (!encodedPdf) {
        throw new Error("Invoice preview payload was empty.");
      }

      const binary = window.atob(encodedPdf);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const blob = new Blob([bytes], {
        type: (data.mimeType || "application/pdf").toString(),
      });
      const nextPreviewUrl = URL.createObjectURL(blob);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = nextPreviewUrl;

      const generatedAt = (data.generatedAt || "").toString();
      setPreviewState({
        previewUrl: nextPreviewUrl,
        fileName: (data.fileName || "subscription-invoice-preview.pdf").toString(),
        generatedAt,
        invoiceNumber: (data.invoiceNumber || "").toString(),
        planName: (data.planName || "").toString(),
        cycleMonth: (data.cycleMonth || "").toString(),
        amount: Number.isFinite(Number(data.amount)) ? Number(data.amount) : null,
      });
      const generatedLabel = generatedAt ? new Date(generatedAt).toLocaleString("en-ZA") : "";
      setStatusMessage(generatedLabel ? `Preview generated at ${generatedLabel}.` : "Preview generated.");
    } catch (previewError) {
      const rawMessage = (previewError?.message || "").toString();
      const normalizedMessage = rawMessage.trim().toLowerCase();
      const isLocalHost =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");
      const likelyUnreachableCallable =
        normalizedMessage.includes("failed to fetch") ||
        normalizedMessage.includes("network") ||
        normalizedMessage.includes("cors");
      if (isLocalHost && likelyUnreachableCallable) {
        setError(localPreviewHelpMessage);
      } else {
        setError(rawMessage || "Unable to generate invoice preview.");
      }
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (!functionsInstance || !inventoryEnabled) return;
    if (!selectedInvoiceId) return;
    refreshPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [functionsInstance, inventoryEnabled, selectedInvoiceId]);

  return (
    <div className="admin-panel admin-panel--full admin-email-preview admin-invoice-preview">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Invoice Preview</h2>
          <p className="admin-panel__note">
            Preview subscription invoice PDF design without sending any emails.
          </p>
        </div>
      </Reveal>

      <div className="admin-email-preview__layout">
        <form className="admin-email-preview__controls" onSubmit={refreshPreview}>
          <label className="admin-form__field" htmlFor="invoice-preview-id">
            <span>Invoice</span>
            <select
              className="input"
              id="invoice-preview-id"
              value={selectedInvoiceId}
              onChange={(event) => setSelectedInvoiceId(event.target.value)}
            >
              {!invoiceOptions.length && <option value="">No invoices available</option>}
              {invoiceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <p className="admin-panel__note">
            Uses live subscription invoice data from Firestore.
          </p>

          {invoiceSourceStatus === "loading" && (
            <p className="modal__meta">Loading subscription invoices...</p>
          )}
          {subscriptionInvoicesError && (
            <p className="admin-panel__error">
              {subscriptionInvoicesError.message || "Unable to load subscription invoices."}
            </p>
          )}

          <div className="admin-form__actions">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={loadingPreview || !inventoryEnabled || !functionsInstance || !selectedInvoiceId}
            >
              {loadingPreview ? "Generating..." : "Refresh Preview"}
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => {
                if (!previewState.previewUrl) return;
                window.open(previewState.previewUrl, "_blank", "noopener,noreferrer");
              }}
              disabled={!previewState.previewUrl}
            >
              Open in new tab
            </button>
            <a
              className={`btn btn--secondary ${previewState.previewUrl ? "" : "is-disabled"}`}
              href={previewState.previewUrl || "#"}
              download={previewState.fileName || "subscription-invoice-preview.pdf"}
              onClick={(event) => {
                if (!previewState.previewUrl) event.preventDefault();
              }}
            >
              Download PDF
            </a>
          </div>

          {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
          {error && <p className="admin-panel__error">{error}</p>}
        </form>

        <div className="admin-email-preview__panel">
          <div className="admin-email-preview__meta">
            {previewState.invoiceNumber && (
              <p className="modal__meta">
                <strong>Invoice:</strong> {previewState.invoiceNumber}
              </p>
            )}
            {previewState.cycleMonth && (
              <p className="modal__meta">
                <strong>Cycle:</strong> {previewState.cycleMonth}
              </p>
            )}
            {previewState.planName && (
              <p className="modal__meta">
                <strong>Plan:</strong> {previewState.planName}
              </p>
            )}
            {previewState.amount != null && (
              <p className="modal__meta">
                <strong>Amount:</strong> {formatPriceLabel(previewState.amount)}
              </p>
            )}
            {previewState.generatedAt && (
              <p className="modal__meta">
                Generated: {new Date(previewState.generatedAt).toLocaleString("en-ZA")}
              </p>
            )}
          </div>

          <p className="modal__meta">
            <strong>Generated PDF output</strong>
          </p>
          <div className="admin-email-preview__frame-wrap">
            {previewState.previewUrl ? (
              <iframe
                className="admin-email-preview__frame"
                title="Invoice PDF preview"
                src={previewState.previewUrl}
              />
            ) : (
              <p className="modal__meta" style={{ padding: "1rem" }}>
                No PDF generated yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminCutFlowerClassesView() {
  usePageMetadata({
    title: "Admin Â· Cut Flower Classes",
    description: "Create bookable cut flower sessions for customers.",
  });
  const {
    db,
    storage,
    cutFlowerClasses,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const uploadAsset = useUploadAsset(storage);
  const [classForm, setClassForm] = useState(INITIAL_CUT_FLOWER_CLASS_FORM);
  const [classImageFile, setClassImageFile] = useState(null);
  const [classImagePreview, setClassImagePreview] = useState("");
  const [editingClassId, setEditingClassId] = useState(null);
  const [classSaving, setClassSaving] = useState(false);
  const [isClassModalOpen, setClassModalOpen] = useState(false);
  const [classError, setClassError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const classPreviewUrlRef = useRef(null);
  const [classPage, setClassPage] = useState(0);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, targetId: null });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const normalizedClasses = useMemo(() => {
    return cutFlowerClasses
      .map((doc) => {
        const eventDate = parseDateValue(doc.eventDate);
        const repeatLabel = doc.repeatWeekly ? formatRepeatLabel(doc.repeatDays) : "";
        const timeSummary = buildTimeSummary(doc.timeSlots);
        return {
          ...doc,
          eventDate,
          displayDate: repeatLabel || (eventDate ? bookingDateFormatter.format(eventDate) : "Date to be confirmed"),
          timeSummary,
          priceLabel: formatPriceLabel(doc.price),
        };
      })
      .sort((a, b) => {
        if (!a.eventDate && !b.eventDate) return 0;
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return a.eventDate - b.eventDate;
      });
  }, [cutFlowerClasses]);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3200);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(
    () => () => {
      if (classPreviewUrlRef.current) {
        URL.revokeObjectURL(classPreviewUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(normalizedClasses.length / ADMIN_PAGE_SIZE) - 1);
    setClassPage((prev) => Math.min(prev, maxPage));
  }, [normalizedClasses.length]);

  const paginatedClasses = useMemo(() => {
    const start = classPage * ADMIN_PAGE_SIZE;
    return normalizedClasses.slice(start, start + ADMIN_PAGE_SIZE);
  }, [normalizedClasses, classPage]);

  const resetClassForm = () => {
    setClassForm(INITIAL_CUT_FLOWER_CLASS_FORM);
    setClassImageFile(null);
    setClassImagePreview("");
    setEditingClassId(null);
    setClassError(null);
    setClassSaving(false);
  };

  const openCreateClassModal = () => {
    resetClassForm();
    setClassModalOpen(true);
  };

  const closeClassModal = () => {
    setClassModalOpen(false);
    resetClassForm();
  };

  const handleClassDateChange = (value) => {
    setClassForm((prev) => {
      const next = { ...prev, date: value };
      if (prev.repeatWeekly && (!prev.repeatDays || prev.repeatDays.length === 0) && value) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          next.repeatDays = [parsed.getDay()];
        }
      }
      return next;
    });
  };

  const handleAddClassTimeSlot = () => {
    setClassForm((prev) => ({
      ...prev,
      timeSlots: [...(prev.timeSlots || []), createEventTimeSlot()],
    }));
  };

  const handleClassTimeSlotChange = (slotId, field, value) => {
    setClassForm((prev) => ({
      ...prev,
      timeSlots: (prev.timeSlots || []).map((slot) =>
        slot.id === slotId ? { ...slot, [field]: value } : slot
      ),
    }));
  };

  const handleRemoveClassTimeSlot = (slotId) => {
    setClassForm((prev) => {
      const remaining = (prev.timeSlots || []).filter((slot) => slot.id !== slotId);
      return {
        ...prev,
        timeSlots: remaining.length > 0 ? remaining : [createEventTimeSlot()],
      };
    });
  };

  const handleAddClassOption = () => {
    setClassForm((prev) => ({
      ...prev,
      options: [...(prev.options || []), createCutFlowerOption()],
    }));
  };

  const handleClassOptionChange = (optionId, field, value) => {
    setClassForm((prev) => ({
      ...prev,
      options: (prev.options || []).map((option) =>
        option.id === optionId ? { ...option, [field]: value } : option
      ),
    }));
  };

  const handleRemoveClassOption = (optionId) => {
    setClassForm((prev) => {
      const remaining = (prev.options || []).filter((option) => option.id !== optionId);
      return {
        ...prev,
        options: remaining.length > 0 ? remaining : [createCutFlowerOption()],
      };
    });
  };

  const handleToggleClassCapacity = (checked) => {
    setClassForm((prev) => ({
      ...prev,
      capacityLimited: checked,
      capacity: checked ? prev.capacity : "",
    }));
  };

  const handleToggleClassRepeatWeekly = (checked) => {
    setClassForm((prev) => {
      const next = { ...prev, repeatWeekly: checked };
      if (!checked) {
        next.repeatDays = [];
      } else if ((!prev.repeatDays || prev.repeatDays.length === 0) && prev.date) {
        const parsed = new Date(prev.date);
        if (!Number.isNaN(parsed.getTime())) {
          next.repeatDays = [parsed.getDay()];
        }
      }
      return next;
    });
  };

  const handleToggleClassRepeatDay = (dayValue) => {
    setClassForm((prev) => {
      const existing = Array.isArray(prev.repeatDays) ? prev.repeatDays : [];
      const normalized = existing.includes(dayValue) ?
         existing.filter((day) => day !== dayValue)
        : [...existing, dayValue];
      return {
        ...prev,
        repeatDays: normalized,
      };
    });
  };

  const handleClassImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (classPreviewUrlRef.current) {
      URL.revokeObjectURL(classPreviewUrlRef.current);
      classPreviewUrlRef.current = null;
    }
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        setClassError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(file);
      classPreviewUrlRef.current = preview;
      setClassImageFile(file);
      setClassImagePreview(preview);
    } else {
      setClassImageFile(null);
      setClassImagePreview(classForm.image || "");
    }
  };

  const handleEditClass = (classDoc) => {
    const eventDate = parseDateValue(classDoc.eventDate);
    const fallbackTime =
      eventDate && (eventDate.getHours() || eventDate.getMinutes()) ?
         formatTimeInput(eventDate)
        : "";
    const rawTimeSlots = Array.isArray(classDoc.timeSlots) ? classDoc.timeSlots : [];
    const normalizedSlots =
      rawTimeSlots.length > 0
        ? rawTimeSlots.map((slot, index) => ({
            id: slot.id || `class-time-${index}-${classDoc.id}`,
            time: slot.time || "",
            endTime: slot.endTime || "",
            label: slot.label || "",
          }))
        : [
            {
              ...createEventTimeSlot(),
              time: fallbackTime,
            },
          ];
    const rawOptions = Array.isArray(classDoc.options) ? classDoc.options : [];
    const normalizedOptions =
      rawOptions.length > 0
        ? rawOptions.map((option, index) => ({
            id: option.id || `class-option-${index}-${classDoc.id}`,
            label: option.label || option.name || "",
            price:
              option.price === undefined || option.price === null ?
                 ""
                : String(option.price),
            minAttendees:
              option.minAttendees === undefined || option.minAttendees === null ?
                 ""
                : String(option.minAttendees),
            isExtra: Boolean(option.isExtra),
          }))
        : [createCutFlowerOption()];
    const rawCapacity = classDoc.capacity;
    const hasCapacityValue =
      rawCapacity !== undefined &&
      rawCapacity !== null &&
      String(rawCapacity).trim() !== "";
    const capacityLimited =
      classDoc.capacityLimited !== undefined ?
         Boolean(classDoc.capacityLimited)
        : hasCapacityValue;
    setClassForm({
      title: classDoc.title || "",
      description: classDoc.description || "",
      location: classDoc.location || "",
      price: classDoc.price === undefined || classDoc.price === null ? "" : String(classDoc.price),
      capacity:
        classDoc.capacity === undefined || classDoc.capacity === null ? "" : String(classDoc.capacity),
      capacityLimited,
      image: classDoc.image || "",
      date: eventDate ? formatDateInput(eventDate) : "",
      timeSlots: normalizedSlots,
      options: normalizedOptions,
      status: classDoc.status || "live",
      repeatWeekly: Boolean(classDoc.repeatWeekly),
      repeatDays: Array.isArray(classDoc.repeatDays)
        ? classDoc.repeatDays
            .map((day) => Number(day))
            .filter((day) => Number.isFinite(day))
        : [],
    });
    setClassImagePreview(classDoc.image || "");
    setClassImageFile(null);
    setEditingClassId(classDoc.id);
    setClassError(null);
  };

  const openEditClassModal = (classDoc) => {
    handleEditClass(classDoc);
    setClassModalOpen(true);
  };

  const handleDeleteClass = async (classId) => {
    if (!db || !inventoryEnabled) return;
    setDeleteDialog({ open: true, targetId: classId });
  };

  const handleSaveClass = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setClassError("You do not have permission to manage cut flower classes.");
      return;
    }

    if (!classForm.title.trim()) {
      setClassError("Class title is required.");
      return;
    }

    if (!classForm.date.trim()) {
      setClassError("Event date is required.");
      return;
    }

    if (classForm.capacityLimited) {
      const capacityValue = Number.parseInt(classForm.capacity, 10);
      if (!Number.isFinite(capacityValue) || capacityValue <= 0) {
        setClassError("Seats per time slot must be a positive number.");
        return;
      }
    }

    let imageUrl = classForm.image.trim();
    setClassSaving(true);
    setClassError(null);

    try {
      if (classImageFile) {
        imageUrl = await uploadAsset(classImageFile, "cut-flower-classes");
      }

      if (!imageUrl) {
        setClassError("Please upload an image for this class.");
        setClassSaving(false);
        return;
      }

      const sanitizedSlots = (classForm.timeSlots || [])
        .map((slot) => ({
          id: slot.id || createEventTimeSlot().id,
          time: slot.time.trim() || "",
          endTime: slot.endTime.trim() || "",
          label: slot.label.trim() || "",
        }))
        .filter((slot) => slot.time);
      sanitizedSlots.sort((a, b) => a.time.localeCompare(b.time));
      const primaryTime = sanitizedSlots[0]?.time ?? "";
      const eventDate = combineDateAndTime(classForm.date, primaryTime);
      const repeatDays = classForm.repeatWeekly
        ? Array.isArray(classForm.repeatDays)
          ? classForm.repeatDays
              .map((day) => Number(day))
              .filter((day) => Number.isFinite(day))
          : []
        : [];
      const sanitizedOptions = (classForm.options || [])
        .map((option) => {
          const label = option.label.trim() || "";
          if (!label) return null;
          const rawPrice = option.price;
          const priceNumber =
            rawPrice === "" || rawPrice === null || rawPrice === undefined ?
               null
              : Number(rawPrice);
          const minAttendeesValue = Number.parseInt(option.minAttendees, 10);
          const minAttendees =
            Number.isFinite(minAttendeesValue) && minAttendeesValue > 0 ?
               minAttendeesValue
              : null;
          return {
            id: option.id || createCutFlowerOption().id,
            label,
            price: Number.isFinite(priceNumber) ? priceNumber : null,
            minAttendees,
            isExtra: Boolean(option.isExtra),
          };
        })
        .filter(Boolean);
      const capacityValue = classForm.capacityLimited
        ? Number.isFinite(Number(classForm.capacity))
          ? Number(classForm.capacity)
          : classForm.capacity
        : null;
      const payload = {
        title: classForm.title.trim(),
        description: classForm.description.trim(),
        location: classForm.location.trim(),
        price:
          classForm.price === "" ? null : Number.isFinite(Number(classForm.price)) ? Number(classForm.price) : classForm.price,
        capacity: capacityValue,
        capacityLimited: Boolean(classForm.capacityLimited),
        image: imageUrl,
        eventDate: eventDate ?? null,
        timeSlots: sanitizedSlots,
        repeatWeekly: Boolean(classForm.repeatWeekly),
        repeatDays,
        options: sanitizedOptions,
        status: classForm.status || "draft",
        updatedAt: serverTimestamp(),
      };

      if (editingClassId) {
        await updateDoc(doc(db, "cutFlowerClasses", editingClassId), payload);
        setStatusMessage("Class updated");
      } else {
        await addDoc(collection(db, "cutFlowerClasses"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatusMessage("Class created");
      }

      closeClassModal();
    } catch (saveError) {
      console.error(saveError);
      const detail =
        typeof saveError?.message === "string" && saveError.message.trim()
          ? saveError.message.trim()
          : "";
      setClassError(
        detail
          ? `We couldn't save the class. ${detail}`
          : "We couldn't save the class. Please try again.",
      );
    } finally {
      setClassSaving(false);
    }
  };

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <div className="admin-panel">
            <div className="admin-panel__header">
              <div>
                <h2>Cut Flower Classes</h2>
                <p className="admin-panel__note">
                  Publish bookable sessions for bouquets, styling experiences, and private floral classes.
                </p>
              </div>
              <div className="admin-panel__header-actions">
                {inventoryLoading && <span className="badge badge--muted">Syncing...</span>}
                {statusMessage && <span className="badge badge--muted">{statusMessage}</span>}
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={openCreateClassModal}
                  disabled={!inventoryEnabled}
                >
                  <IconPlus className="btn__icon" aria-hidden="true" />
                  Create Class
                </button>
              </div>
            </div>
            {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
            <div className="admin-panel__content">
              <div>
                <h3>Scheduled Classes</h3>
                {inventoryLoading && !normalizedClasses.length ? (
                  <p className="admin-panel__note">Loading cut flower classes...</p>
                ) : (
                  <div className="admin-panel__list">
                    {normalizedClasses.length === 0 ? (
                      <p className="admin-panel__note">No cut flower classes yet.</p>
                    ) : (
                      paginatedClasses.map((classDoc) => (
                        <article className="admin-event-card" key={classDoc.id}>
                          <div className="admin-event-card__info">
                            <p className="admin-event-card__date">{classDoc.displayDate}</p>
                            <h4>{classDoc.title}</h4>
                            {classDoc.location && (
                              <p className="admin-event-card__meta">{classDoc.location}</p>
                            )}
                            {classDoc.timeSummary && (
                              <p className="admin-event-card__meta">Times: {classDoc.timeSummary}</p>
                            )}
                            {classDoc.priceLabel && (
                              <p className="admin-event-card__meta">Fee: {classDoc.priceLabel}</p>
                            )}
                            {classDoc.capacity && (
                              <p className="admin-event-card__meta">Capacity: {classDoc.capacity}</p>
                            )}
                          </div>
                          <div className="admin-event-card__actions">
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => openEditClassModal(classDoc)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn--primary"
                              type="button"
                              onClick={() => handleDeleteClass(classDoc.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                )}
                <AdminPagination page={classPage} total={normalizedClasses.length} onPageChange={setClassPage} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <div
        className={`modal admin-modal ${isClassModalOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isClassModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeClassModal();
        }}
      >
        <div className="modal__content admin-modal__content">
          <button className="modal__close" type="button" aria-label="Close" onClick={closeClassModal}>
            &times;
          </button>
          <h3 className="modal__title">{editingClassId ? "Edit Class" : "Create Class"}</h3>
          <form className="admin-form" onSubmit={handleSaveClass}>
            <input
              className="input"
              placeholder="Class title"
              value={classForm.title}
              onChange={(e) =>
                setClassForm((prev) => ({
                  ...prev,
                  title: e.target.value,
                }))
              }
              required
            />
            <input
              className="input"
              placeholder="Location"
              value={classForm.location}
              onChange={(e) =>
                setClassForm((prev) => ({
                  ...prev,
                  location: e.target.value,
                }))
              }
            />
            <input
              className="input"
              placeholder="Base price (optional)"
              value={classForm.price}
              onChange={(e) =>
                setClassForm((prev) => ({
                  ...prev,
                  price: e.target.value,
                }))
              }
            />
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={classForm.capacityLimited}
                onChange={(event) => handleToggleClassCapacity(event.target.checked)}
              />
              <span>Limit seats per time slot</span>
            </label>
            {classForm.capacityLimited && (
              <input
                className="input"
                placeholder="Seats per time slot"
                value={classForm.capacity}
                onChange={(event) =>
                  setClassForm((prev) => ({
                    ...prev,
                    capacity: event.target.value.replace(/[^\d]/g, ""),
                  }))
                }
              />
            )}
            <div className="admin-session-panel admin-form__full">
              <div className="admin-session-panel__header">
                <h4>Cut flower options</h4>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={handleAddClassOption}
                  aria-label="Add option"
                >
                  <IconPlus aria-hidden="true" />
                </button>
              </div>
              <p className="admin-panel__note">
                Add the options shown in the booking dropdown. Leave blank to use the base price only.
              </p>
              {(classForm.options || []).map((option, index) => (
                <div className="admin-session-row" key={option.id}>
                  <div className="admin-session-field admin-session-field--label">
                    <label className="admin-session-label" htmlFor={`class-option-label-${option.id}`}>
                      Option #{index + 1}
                    </label>
                    <input
                      className="input"
                      id={`class-option-label-${option.id}`}
                      value={option.label}
                      onChange={(event) =>
                        handleClassOptionChange(option.id, "label", event.target.value)
                      }
                      placeholder="Small bouquet, Garden mix, etc."
                    />
                  </div>
                  <div className="admin-session-field">
                    <label className="admin-session-label" htmlFor={`class-option-price-${option.id}`}>
                      Price (optional)
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      id={`class-option-price-${option.id}`}
                      value={option.price}
                      onChange={(event) =>
                        handleClassOptionChange(option.id, "price", event.target.value)
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="admin-session-field">
                    <label className="admin-session-label" htmlFor={`class-option-min-${option.id}`}>
                      Min attendees (optional)
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      step="1"
                      id={`class-option-min-${option.id}`}
                      value={option.minAttendees}
                      onChange={(event) =>
                        handleClassOptionChange(option.id, "minAttendees", event.target.value)
                      }
                      placeholder="0"
                    />
                  </div>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(option.isExtra)}
                      onChange={(event) =>
                        handleClassOptionChange(option.id, "isExtra", event.target.checked)
                      }
                    />
                    <span>Extra add-on</span>
                  </label>
                  <button
                    className="icon-btn icon-btn--danger admin-session-remove"
                    type="button"
                    onClick={() => handleRemoveClassOption(option.id)}
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <IconTrash aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <select
              className="input"
              value={classForm.status}
              onChange={(e) =>
                setClassForm((prev) => ({
                  ...prev,
                  status: e.target.value,
                }))
              }
            >
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="archived">Archived</option>
            </select>
            <input
              className="input"
              type="date"
              value={classForm.date}
              onChange={(e) => handleClassDateChange(e.target.value)}
              required
            />
            <div className="admin-session-panel admin-form__full">
              <div className="admin-session-panel__header">
                <h4>Class times</h4>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={handleAddClassTimeSlot}
                  aria-label="Add time slot"
                >
                  <IconPlus aria-hidden="true" />
                </button>
              </div>
              <p className="admin-panel__note">Add one or more time slots for this class day.</p>
              {(classForm.timeSlots || []).map((slot) => (
                <div className="admin-session-row" key={slot.id}>
                  <div className="admin-session-field">
                    <label className="admin-session-label" htmlFor={`class-time-${slot.id}`}>
                      Start
                    </label>
                    <input
                      className="input"
                      type="time"
                      id={`class-time-${slot.id}`}
                      value={slot.time}
                      onChange={(event) =>
                        handleClassTimeSlotChange(slot.id, "time", event.target.value)
                      }
                    />
                  </div>
                  <div className="admin-session-field">
                    <label className="admin-session-label" htmlFor={`class-end-${slot.id}`}>
                      End
                    </label>
                    <input
                      className="input"
                      type="time"
                      id={`class-end-${slot.id}`}
                      value={slot.endTime || ""}
                      onChange={(event) =>
                        handleClassTimeSlotChange(slot.id, "endTime", event.target.value)
                      }
                    />
                  </div>
                  <div className="admin-session-field admin-session-field--label">
                    <label className="admin-session-label" htmlFor={`class-label-${slot.id}`}>
                      Label (optional)
                    </label>
                    <input
                      className="input"
                      id={`class-label-${slot.id}`}
                      value={slot.label}
                      onChange={(event) =>
                        handleClassTimeSlotChange(slot.id, "label", event.target.value)
                      }
                      placeholder="Morning, Afternoon, etc."
                    />
                  </div>
                  <button
                    className="icon-btn icon-btn--danger admin-session-remove"
                    type="button"
                    onClick={() => handleRemoveClassTimeSlot(slot.id)}
                    aria-label="Remove time slot"
                  >
                    <IconTrash aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            <div className="admin-session-panel admin-form__full">
              <div className="admin-session-panel__header">
                <h4>Repeat weekly</h4>
              </div>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={classForm.repeatWeekly}
                  onChange={(event) => handleToggleClassRepeatWeekly(event.target.checked)}
                />
                <span>Repeat this class on selected weekdays</span>
              </label>
              {classForm.repeatWeekly && (
                <div className="admin-repeat-days">
                  {EVENT_REPEAT_WEEKDAYS.map((day) => (
                    <label className="admin-repeat-day" key={day.value}>
                      <input
                        type="checkbox"
                        checked={
                          Array.isArray(classForm.repeatDays) &&
                          classForm.repeatDays.includes(day.value)
                        }
                        onChange={() => handleToggleClassRepeatDay(day.value)}
                      />
                      <span>{day.label}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="admin-panel__note">Use this for recurring classes like every Saturday.</p>
            </div>
            <textarea
              className="input textarea admin-form__full"
              placeholder="Description"
              value={classForm.description}
              onChange={(e) =>
                setClassForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
            />
            <div className="admin-file-input admin-form__full">
              <label htmlFor="cutflower-class-image" className="sr-only">
                Class image
              </label>
              <input
                key={editingClassId ?? "new-class"}
                className="input input--file"
                id="cutflower-class-image"
                type="file"
                accept="image/*"
                onChange={handleClassImageChange}
              />
              <p className="admin-panel__note">Upload JPG or PNG (max 3MB).</p>
              {(classImagePreview || classForm.image) && (
                <img
                  src={classImagePreview || classForm.image}
                  alt="Cut flower class preview"
                  className="admin-preview" loading="lazy" decoding="async"/>
              )}
            </div>
            <div className="admin-modal__actions admin-form__actions">
              <button className="btn btn--secondary" type="button" onClick={closeClassModal} disabled={classSaving}>
                Cancel
              </button>
              <button className="btn btn--primary" type="submit" disabled={classSaving || !inventoryEnabled}>
                {classSaving ? "Saving..." : editingClassId ? "Update Class" : "Create Class"}
              </button>
            </div>
            {classError && <p className="admin-panel__error">{classError}</p>}
          </form>
        </div>
      </div>
      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete Cut Flower Class"
        message="Are you sure you want to delete this class This cannot be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onCancel={() => setDeleteDialog({ open: false, targetId: null })}
        onConfirm={async () => {
          if (!db || !deleteDialog.targetId) return;
          setDeleteBusy(true);
          setClassError(null);
          try {
            await deleteDoc(doc(db, "cutFlowerClasses", deleteDialog.targetId));
            setStatusMessage("Class removed");
            if (editingClassId === deleteDialog.targetId) {
              closeClassModal();
            }
          } catch (err) {
            setClassError(err.message);
          } finally {
            setDeleteBusy(false);
            setDeleteDialog({ open: false, targetId: null });
          }
        }}
      />
    </>
  );
}

export function AdminCutFlowerBookingsView() {
  usePageMetadata({
    title: "Admin Â· Cut Flowers",
    description: "Track bespoke cut flower bookings separately from workshops.",
  });
  const {
    db,
    cutFlowerBookings,
    cutFlowerClasses,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const [formState, setFormState] = useState(INITIAL_CUT_FLOWER_BOOKING);
  const [editingId, setEditingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isBookingModalOpen, setBookingModalOpen] = useState(false);
  const [activeBooking, setActiveBooking] = useState(null);
  const [dateFilter, setDateFilter] = useState("today");
  const [sortOrder, setSortOrder] = useState("event-asc");
  const [showExtraOptions, setShowExtraOptions] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, targetId: null });
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3200);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  const normalizedBookings = useMemo(() => {
    return cutFlowerBookings
      .map((booking) => {
        const eventDate = parseDateValue(booking.eventDate);
        return {
          ...booking,
          eventDate,
          displayDate: eventDate ? bookingDateFormatter.format(eventDate) : "Date to be confirmed",
        };
      })
      .sort((a, b) => {
        if (!a.eventDate && !b.eventDate) return 0;
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return a.eventDate - b.eventDate;
      });
  }, [cutFlowerBookings]);

  const filteredBookings = useMemo(() => {
    if (!normalizedBookings.length) return [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return normalizedBookings.filter((booking) => {
      if (!booking.eventDate) return dateFilter === "all";
      const eventTime = booking.eventDate.getTime();
      if (dateFilter === "today") {
        return eventTime >= startOfDay.getTime() && eventTime <= endOfDay.getTime();
      }
      if (dateFilter === "upcoming") return eventTime > endOfDay.getTime();
      if (dateFilter === "past") return eventTime < startOfDay.getTime();
      return true;
    });
  }, [normalizedBookings, dateFilter]);

  const sortedBookings = useMemo(() => {
    const bookings = [...filteredBookings];
    const compareByDate = (first, second) => {
      const firstTime = first.eventDate ? first.eventDate.getTime() : null;
      const secondTime = second.eventDate ? second.eventDate.getTime() : null;
      if (firstTime === null && secondTime === null) return 0;
      if (firstTime === null) return 1;
      if (secondTime === null) return -1;
      return firstTime - secondTime;
    };
    const compareByName = (first, second) =>
      (first.customerName || "").localeCompare(second.customerName || "", undefined, {
        sensitivity: "base",
      });

    bookings.sort((a, b) => {
      if (sortOrder === "event-desc") return compareByDate(b, a);
      if (sortOrder === "name-asc") return compareByName(a, b);
      if (sortOrder === "name-desc") return compareByName(b, a);
      return compareByDate(a, b);
    });

    return bookings;
  }, [filteredBookings, sortOrder]);

  const selectionOptions = useMemo(() => {
    const rawOptions = (cutFlowerClasses || [])
      .flatMap((classItem) => (Array.isArray(classItem.options) ? classItem.options : []))
      .filter(Boolean);
    const normalized = rawOptions
      .map((option, index) => {
        if (typeof option !== "object" || option === null) return null;
        const value = option.value ?? option.id ?? option.label ?? `option-${index}`;
        const label = option.label ?? option.name ?? option.value ?? `Option ${index + 1}`;
        const price = parseOptionalNumber(option.price);
        const minAttendees = parseMinAttendees(option, label);
        const isExtra = parseIsExtra(option, label);
        return {
          value,
          label,
          displayLabel: formatOptionLabel(label, price),
          price,
          minAttendees,
          isExtra,
        };
      })
      .filter(Boolean);
    const unique = [];
    const seen = new Set();
    normalized.forEach((option) => {
      const key = String(option.value);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(option);
    });
    if (unique.length > 0) return unique;
    return [
      {
        value: "standard",
        label: "Standard",
        displayLabel: "Standard",
        price: undefined,
        minAttendees: null,
        isExtra: false,
      },
    ];
  }, [cutFlowerClasses]);

  const attendeeCountNumber = useMemo(
    () => Math.max(1, Number.parseInt(formState.attendeeCount, 10) || 1),
    [formState.attendeeCount],
  );
  const defaultSelectionValue = selectionOptions[0].value ?? "standard";
  const cutFlowerOptionGroups = useMemo(() => {
    const base = selectionOptions.filter((option) => !option.isExtra);
    const extra = selectionOptions.filter((option) => option.isExtra);
    return { base, extra };
  }, [selectionOptions]);
  const hasExtraOptions = cutFlowerOptionGroups.extra.length > 0;
  const visibleCutFlowerOptions = useMemo(
    () => (showExtraOptions ? selectionOptions : cutFlowerOptionGroups.base),
    [cutFlowerOptionGroups.base, selectionOptions, showExtraOptions],
  );
  const restrictedCutFlowerOptions = useMemo(
    () =>
      visibleCutFlowerOptions.filter(
        (option) => option.minAttendees && option.minAttendees > attendeeCountNumber,
      ),
    [attendeeCountNumber, visibleCutFlowerOptions],
  );
  const availableCutFlowerOptions = useMemo(
    () =>
      visibleCutFlowerOptions.filter(
        (option) => !option.minAttendees || option.minAttendees <= attendeeCountNumber,
      ),
    [attendeeCountNumber, visibleCutFlowerOptions],
  );
  const restrictedOptionsNote = useMemo(() => {
    if (restrictedCutFlowerOptions.length === 0) return "";
    const labels = restrictedCutFlowerOptions
      .map((option) => option.label)
      .filter((label) => typeof label === "string" && label.trim().length > 0);
    const minValues = Array.from(
      new Set(
        restrictedCutFlowerOptions
          .map((option) => option.minAttendees)
          .filter((value) => Number.isFinite(value)),
      ),
    ).sort((a, b) => a - b);
    const minText =
      minValues.length === 1 ? `at least ${minValues[0]} attendees` : "a minimum number of attendees";
    const labelText = labels.length > 0 ? `: ${labels.join(", ")}` : ".";
    return `Options requiring ${minText} are hidden${labelText}`;
  }, [restrictedCutFlowerOptions]);

  const normalizedAttendeeSelections = useMemo(() => {
    const optionValues = new Set(availableCutFlowerOptions.map((option) => option.value));
    if (optionValues.size === 0 && selectionOptions[0]) {
      optionValues.add(selectionOptions[0].value);
    }
    const fallbackValue =
      availableCutFlowerOptions[0].value ?? selectionOptions[0].value ?? defaultSelectionValue;
    return buildAttendeeSelections(
      attendeeCountNumber,
      formState.attendeeSelections,
      optionValues,
      fallbackValue,
    );
  }, [
    attendeeCountNumber,
    availableCutFlowerOptions,
    defaultSelectionValue,
    formState.attendeeSelections,
    selectionOptions,
  ]);

  useEffect(() => {
    if (selectionsMatch(formState.attendeeSelections, normalizedAttendeeSelections)) {
      return;
    }
    setFormState((prev) => ({
      ...prev,
      attendeeSelections: normalizedAttendeeSelections,
    }));
  }, [formState.attendeeSelections, normalizedAttendeeSelections]);

  const resetForm = () => {
    setFormState(INITIAL_CUT_FLOWER_BOOKING);
    setEditingId(null);
    setFormError(null);
    setShowExtraOptions(false);
  };

  const openCreateModal = () => {
    resetForm();
    setBookingModalOpen(true);
  };

  const closeBookingModal = () => {
    setBookingModalOpen(false);
    resetForm();
  };

  const handleEdit = (booking) => {
    const eventDate = parseDateValue(booking.eventDate);
    const attendeeSelections = Array.isArray(booking.attendeeSelections)
      ? booking.attendeeSelections
          .map((selection) => selection.optionValue || selection.optionLabel || selection.value || "")
          .filter((value) => value)
      : [];
    const attendeeCountValue = Number.parseInt(booking.attendeeCount, 10);
    const attendeeCount = Number.isFinite(attendeeCountValue) ?
       attendeeCountValue
      : attendeeSelections.length || 1;
    setFormState({
      customerName: booking.customerName || "",
      email: booking.email || "",
      phone: booking.phone || "",
      attendeeCount: String(attendeeCount),
      attendeeSelections,
      occasion: booking.occasion || "",
      location: booking.location || "",
      budget: booking.budget || "",
      notes: booking.notes || "",
      status: booking.status || "new",
      date: eventDate ? formatDateInput(eventDate) : "",
      time: eventDate ? formatTimeInput(eventDate) : "",
    });
    setEditingId(booking.id);
    setFormError(null);
    const hasExtraSelection = attendeeSelections.some((value) =>
      selectionOptions.some((option) => option.value === value && option.isExtra),
    );
    setShowExtraOptions(hasExtraSelection);
  };

  const openEditModal = (booking) => {
    handleEdit(booking);
    setBookingModalOpen(true);
  };

  const openBookingDetails = (booking) => setActiveBooking(booking);

  const closeBookingDetails = () => setActiveBooking(null);

  const handleRowKeyDown = (event, booking) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openBookingDetails(booking);
    }
  };

  const getBookingSummary = (booking) => {
    const attendeeSelections = Array.isArray(booking.attendeeSelections) ?
       booking.attendeeSelections
      : [];
    const attendeeCountValue = Number.parseInt(booking.attendeeCount, 10);
    const attendeeCount = Number.isFinite(attendeeCountValue) ?
       attendeeCountValue
      : attendeeSelections.length || null;
    const hasEstimatedTotal =
      booking.estimatedTotal !== undefined &&
      booking.estimatedTotal !== null &&
      booking.estimatedTotal !== "";
    const estimatedTotalValue = hasEstimatedTotal ? Number(booking.estimatedTotal) : NaN;
    const estimatedTotalLabel = Number.isFinite(estimatedTotalValue) ?
       moneyFormatter.format(estimatedTotalValue)
      : null;
    const optionSummary = booking.optionLabel || booking.optionValue || "";
    let optionSummaryLabel = "Option: -";

    if (attendeeSelections.length > 1) {
      optionSummaryLabel = "Options: Multiple";
    } else if (attendeeSelections.length === 1) {
      const selection = attendeeSelections[0];
      const selectionLabel = selection.optionLabel || selection.optionValue || "Option";
      const selectionPriceValue = Number(selection.estimatedPrice);
      const selectionPriceLabel = Number.isFinite(selectionPriceValue) ?
         ` (est. ${moneyFormatter.format(selectionPriceValue)})`
        : "";
      optionSummaryLabel = `Option: ${selectionLabel}${selectionPriceLabel}`;
    } else if (optionSummary) {
      optionSummaryLabel = `Option: ${optionSummary}`;
    }

    const optionLines =
      attendeeSelections.length > 0
        ? attendeeSelections.map((selection, index) => {
            const selectionLabel = selection.optionLabel || selection.optionValue || "Option";
            const selectionIndexValue = Number.parseInt(selection.attendee, 10);
            const selectionIndex = Number.isFinite(selectionIndexValue) ?
               selectionIndexValue
              : index + 1;
            const selectionPriceValue = Number(selection.estimatedPrice);
            const selectionPriceLabel = Number.isFinite(selectionPriceValue) ?
               ` (est. ${moneyFormatter.format(selectionPriceValue)})`
              : "";
            return {
              key: `attendee-${booking.id}-${selectionIndex}-${selectionLabel}`,
              text: `Attendee ${selectionIndex}: ${selectionLabel}${selectionPriceLabel}`,
            };
          })
        : [
            {
              key: `option-${booking.id}`,
              text: optionSummaryLabel,
            },
          ];

    return {
      attendeeCount,
      estimatedTotalLabel,
      optionLines,
      optionSummaryLabel,
    };
  };

  const handleDelete = async (bookingId) => {
    if (!db || !inventoryEnabled) return;
    setDeleteDialog({ open: true, targetId: bookingId });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!db || !inventoryEnabled) {
      setFormError("You do not have permission to manage cut flower bookings.");
      return;
    }

    if (!formState.customerName.trim()) {
      setFormError("Customer name is required.");
      return;
    }

    if (!formState.phone.trim()) {
      setFormError("Customer phone number is required.");
      return;
    }

    if (!formState.date.trim()) {
      setFormError("Please select an event date.");
      return;
    }

    if (!formState.time.trim()) {
      setFormError("Please select an event time.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const eventDate = combineDateAndTime(formState.date, formState.time);
      const optionLookup = new Map(selectionOptions.map((option) => [option.value, option]));
      const attendeeItems = normalizedAttendeeSelections.map((value, index) => {
        const option = optionLookup.get(value);
        return {
          attendee: index + 1,
          optionValue: option?.value ?? value,
          optionLabel: option?.label ?? value,
          estimatedPrice: option?.price ?? null,
          isExtra: option?.isExtra ?? false,
        };
      });
      const hasEstimatedTotal = attendeeItems.some((item) =>
        Number.isFinite(Number(item.estimatedPrice)),
      );
      const estimatedTotal = hasEstimatedTotal ?
         attendeeItems.reduce((sum, item) => sum + (Number(item.estimatedPrice) || 0), 0)
        : null;
      const firstSelection = attendeeItems[0] || null;
      const payload = {
        customerName: formState.customerName.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim(),
        attendeeCount: attendeeCountNumber,
        attendeeSelections: attendeeItems,
        optionValue: firstSelection?.optionValue ?? "",
        optionLabel: firstSelection?.optionLabel ?? "",
        estimatedTotal,
        occasion: formState.occasion.trim(),
        location: formState.location.trim(),
        budget: formState.budget.trim(),
        notes: formState.notes.trim(),
        status: formState.status || "new",
        eventDate: eventDate ?? null,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "cutFlowerBookings", editingId), payload);
        setStatusMessage("Booking updated");
      } else {
        await addDoc(collection(db, "cutFlowerBookings"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatusMessage("Booking added");
      }

      closeBookingModal();
    } catch (saveError) {
      console.error(saveError);
      setFormError("We couldn't save the booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const detailsSummary = activeBooking ? getBookingSummary(activeBooking) : null;
  const detailsStatusLabel = activeBooking?.status
    ? activeBooking.status.replace(/-/g, " ")
    : "new";
  const createdAtLabel = activeBooking?.createdAt?.toDate?.()
    ? bookingDateFormatter.format(activeBooking.createdAt.toDate())
    : null;
  const emptyFilterLabel =
    dateFilter === "today" ?
       "No cut flower bookings scheduled for today."
      : dateFilter === "upcoming" ?
       "No upcoming cut flower bookings."
      : dateFilter === "past" ?
       "No past cut flower bookings."
      : "No cut flower bookings match this view.";

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <div className="admin-panel">
            <div className="admin-panel__header">
              <div>
                <h2>Cut Flower Bookings</h2>
                <p className="admin-panel__note">
                  Manage requests for installations, weekly drops, and bespoke bouquets without mixing them into
                  workshop bookings.
                </p>
              </div>
              <div className="admin-panel__header-actions">
                {inventoryLoading && <span className="badge badge--muted">Syncing...</span>}
                {statusMessage && <span className="badge badge--muted">{statusMessage}</span>}
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={openCreateModal}
                  disabled={!inventoryEnabled}
                >
                  <IconPlus className="btn__icon" aria-hidden="true" />
                  Make Booking
                </button>
              </div>
            </div>
            {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
            <div className="admin-panel__content">
              {inventoryLoading && !normalizedBookings.length ? (
                <p className="admin-panel__note">Loading cut flower bookings...</p>
              ) : normalizedBookings.length > 0 ? (
                <>
                  <div className="admin-filters">
                    <div className="admin-filters__left">
                      <label className="admin-filters__field">
                        <span>Date range</span>
                        <select
                          className="input"
                          value={dateFilter}
                          onChange={(event) => setDateFilter(event.target.value)}
                        >
                          <option value="today">Today</option>
                          <option value="upcoming">Upcoming</option>
                          <option value="past">Past</option>
                          <option value="all">All</option>
                        </select>
                      </label>
                      <label className="admin-filters__field">
                        <span>Sort by</span>
                        <select
                          className="input"
                          value={sortOrder}
                          onChange={(event) => setSortOrder(event.target.value)}
                        >
                          <option value="event-asc">Date (soonest)</option>
                          <option value="event-desc">Date (latest)</option>
                          <option value="name-asc">Customer (A-Z)</option>
                          <option value="name-desc">Customer (Z-A)</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  {sortedBookings.length > 0 ? (
                    <>
                      <div className="admin-bookings-table">
                        <div className="admin-table__wrapper">
                          <table className="admin-table admin-table--compact">
                            <thead>
                              <tr>
                                <th scope="col">Customer</th>
                                <th scope="col">Contact</th>
                                <th scope="col">Event</th>
                                <th scope="col">Options</th>
                                <th scope="col">Status</th>
                                <th scope="col" className="admin-table__actions">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedBookings.map((booking) => {
                                const summary = getBookingSummary(booking);
                                const statusLabel = booking.status ?
                                   booking.status.replace(/-/g, " ")
                                  : "new";
                                const rowLabel = booking.customerName || "Booking";
                                return (
                                  <tr
                                    key={booking.id}
                                    className="admin-table__row admin-table__row--clickable"
                                    onClick={() => openBookingDetails(booking)}
                                    onKeyDown={(event) => handleRowKeyDown(event, booking)}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`View booking for ${rowLabel}`}
                                  >
                                    <td>
                                      <strong>{booking.customerName || "-"}</strong>
                                      {booking.occasion && (
                                        <p className="modal__meta">Occasion: {booking.occasion}</p>
                                      )}
                                      {booking.budget && (
                                        <p className="modal__meta">Budget: {booking.budget}</p>
                                      )}
                                    </td>
                                    <td>
                                      {booking.email ? (
                                        <a
                                          href={`mailto:${booking.email}`}
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          {booking.email}
                                        </a>
                                      ) : (
                                        "-"
                                      )}
                                      {booking.phone && <p className="modal__meta">{booking.phone}</p>}
                                    </td>
                                    <td>
                                      <p className="modal__meta">{booking.displayDate}</p>
                                      {booking.sessionLabel && (
                                        <p className="modal__meta">{booking.sessionLabel}</p>
                                      )}
                                      {booking.location && <p className="modal__meta">{booking.location}</p>}
                                    </td>
                                    <td>
                                      {Number.isFinite(summary.attendeeCount) &&
                                        summary.attendeeCount > 0 && (
                                          <p className="modal__meta">
                                            Attendees: {summary.attendeeCount}
                                          </p>
                                        )}
                                      <p className="modal__meta">{summary.optionSummaryLabel}</p>
                                      {summary.estimatedTotalLabel && (
                                        <p className="modal__meta">
                                          Estimate: {summary.estimatedTotalLabel}
                                        </p>
                                      )}
                                    </td>
                                    <td>
                                      <span className="badge badge--muted">{statusLabel}</span>
                                    </td>
                                    <td className="admin-table__actions">
                                      <button
                                        className="icon-btn"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openEditModal(booking);
                                        }}
                                        aria-label="Edit booking"
                                      >
                                        <IconEdit aria-hidden="true" />
                                      </button>
                                      <button
                                        className="icon-btn icon-btn--danger"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleDelete(booking.id);
                                        }}
                                        aria-label="Delete booking"
                                      >
                                        <IconTrash aria-hidden="true" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="admin-bookings-cards">
                        {sortedBookings.map((booking) => {
                          const summary = getBookingSummary(booking);
                          const statusLabel = booking.status ?
                             booking.status.replace(/-/g, " ")
                            : "new";
                          const cardLabel = booking.customerName || "Booking";
                          return (
                            <article
                              className="admin-event-card admin-booking-card"
                              key={`card-${booking.id}`}
                              onClick={() => openBookingDetails(booking)}
                              onKeyDown={(event) => handleRowKeyDown(event, booking)}
                              tabIndex={0}
                              role="button"
                              aria-label={`View booking for ${cardLabel}`}
                            >
                              <div className="admin-event-card__info">
                                <p className="admin-event-card__date">{booking.displayDate}</p>
                                <h4>{booking.customerName || "-"}</h4>
                                {booking.location && (
                                  <p className="admin-event-card__meta">{booking.location}</p>
                                )}
                                {booking.email && (
                                  <p className="admin-event-card__meta">{booking.email}</p>
                                )}
                                {booking.phone && (
                                  <p className="admin-event-card__meta">{booking.phone}</p>
                                )}
                                {Number.isFinite(summary.attendeeCount) &&
                                  summary.attendeeCount > 0 && (
                                    <p className="admin-event-card__meta">
                                      Attendees: {summary.attendeeCount}
                                    </p>
                                  )}
                                <p className="admin-event-card__meta">{summary.optionSummaryLabel}</p>
                                {summary.estimatedTotalLabel && (
                                  <p className="admin-event-card__meta">
                                    Estimate: {summary.estimatedTotalLabel}
                                  </p>
                                )}
                                <p className="admin-event-card__meta">Status: {statusLabel}</p>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="admin-panel__note">{emptyFilterLabel}</p>
                  )}
                </>
              ) : (
                <p className="admin-panel__note">No cut flower bookings yet.</p>
              )}
            </div>
        </div>
      </div>
      </section>
      <div
        className={`modal admin-modal ${isBookingModalOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isBookingModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeBookingModal();
        }}
      >
        <div className="modal__content admin-modal__content">
          <button className="modal__close" type="button" aria-label="Close" onClick={closeBookingModal}>
            &times;
          </button>
          <h3 className="modal__title">{editingId ? "Edit Booking" : "Make Booking"}</h3>
          <form className="admin-form" onSubmit={handleSave}>
            <input
              className="input"
              placeholder="Customer name"
              value={formState.customerName}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  customerName: e.target.value,
                }))
              }
              required
            />
            <input
              className="input"
              placeholder="Email"
              value={formState.email}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  email: e.target.value,
                }))
              }
            />
            <input
              className="input"
              placeholder="Phone"
              value={formState.phone}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  phone: e.target.value,
                }))
              }
              required
            />
            <input
              className="input"
              type="number"
              min="1"
              placeholder="Attendee count"
              value={formState.attendeeCount}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  attendeeCount: e.target.value,
                }))
              }
            />
            <input
              className="input"
              placeholder="Occasion / brief"
              value={formState.occasion}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  occasion: e.target.value,
                }))
              }
            />
            <input
              className="input"
              placeholder="Location"
              value={formState.location}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  location: e.target.value,
                }))
              }
            />
            <input
              className="input"
              placeholder="Budget (optional)"
              value={formState.budget}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  budget: e.target.value,
                }))
              }
            />
            <input
              className="input"
              type="date"
              value={formState.date}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  date: e.target.value,
                }))
              }
              required
            />
            <input
              className="input"
              type="time"
              value={formState.time}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  time: e.target.value,
                }))
              }
              required
            />
            <div className="admin-form__section admin-form__full">
              <div className="admin-form__section-header">
                <h4>Cut flower options</h4>
                {hasExtraOptions && (
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={showExtraOptions}
                      onChange={(e) => setShowExtraOptions(e.target.checked)}
                    />
                    <span>Show extra options</span>
                  </label>
                )}
              </div>
              {restrictedOptionsNote && <p className="admin-panel__note">{restrictedOptionsNote}</p>}
              <div className="admin-form__section-grid">
                {normalizedAttendeeSelections.map((selection, index) => (
                  <label className="admin-form__field" key={`attendee-option-${index + 1}`}>
                    Attendee {index + 1} option
                    <select
                      className="input"
                      value={selection}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFormState((prev) => {
                          const nextSelections = [...(prev.attendeeSelections || [])];
                          nextSelections[index] = value;
                          return {
                            ...prev,
                            attendeeSelections: nextSelections,
                          };
                        });
                      }}
                    >
                      {availableCutFlowerOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.displayLabel || option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <select
              className="input"
              value={formState.status}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  status: e.target.value,
                }))
              }
            >
              {CUT_FLOWER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/-/g, " ")}
                </option>
              ))}
            </select>
            <textarea
              className="input textarea admin-form__full"
              placeholder="Notes"
              value={formState.notes}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
            />
            <div className="admin-modal__actions admin-form__actions">
              <button className="btn btn--secondary" type="button" onClick={closeBookingModal} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn--primary" type="submit" disabled={saving || !inventoryEnabled}>
                {saving ? "Saving..." : editingId ? "Update Booking" : "Create Booking"}
              </button>
            </div>
            {formError && <p className="admin-panel__error">{formError}</p>}
          </form>
        </div>
      </div>
      {activeBooking && (
        <div
          className={`modal admin-modal ${activeBooking ? "is-active" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-hidden={activeBooking ? "false" : "true"}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeBookingDetails();
          }}
        >
          <div className="modal__content admin-modal__content">
            <button
              className="modal__close"
              type="button"
              aria-label="Close"
              onClick={closeBookingDetails}
            >
              &times;
            </button>
            <h3 className="modal__title">{activeBooking.customerName || "Booking Details"}</h3>
            <div className="admin-detail-grid">
              <div className="admin-detail-card">
                <h4>Customer</h4>
                <p className="modal__meta">{activeBooking.customerName || "-"}</p>
                {activeBooking.email && <p className="modal__meta">{activeBooking.email}</p>}
                {activeBooking.phone && <p className="modal__meta">{activeBooking.phone}</p>}
                {activeBooking.occasion && (
                  <p className="modal__meta">Occasion: {activeBooking.occasion}</p>
                )}
                {activeBooking.budget && (
                  <p className="modal__meta">Budget: {activeBooking.budget}</p>
                )}
              </div>
              <div className="admin-detail-card">
                <h4>Event</h4>
                <p className="modal__meta">{activeBooking.displayDate}</p>
                {activeBooking.sessionLabel && (
                  <p className="modal__meta">{activeBooking.sessionLabel}</p>
                )}
                {activeBooking.location && (
                  <p className="modal__meta">{activeBooking.location}</p>
                )}
              </div>
              <div className="admin-detail-card">
                <h4>Options</h4>
                {Number.isFinite(detailsSummary.attendeeCount) &&
                  detailsSummary.attendeeCount > 0 && (
                    <p className="modal__meta">Attendees: {detailsSummary.attendeeCount}</p>
                  )}
                {detailsSummary.optionLines.map((line) => (
                  <p className="modal__meta" key={line.key}>
                    {line.text}
                  </p>
                ))}
                {detailsSummary.estimatedTotalLabel && (
                  <p className="modal__meta">
                    Estimate: {detailsSummary.estimatedTotalLabel} (estimate only)
                  </p>
                )}
              </div>
              <div className="admin-detail-card">
                <h4>Status</h4>
                <p className="modal__meta">Status: {detailsStatusLabel}</p>
                {createdAtLabel && <p className="modal__meta">Submitted: {createdAtLabel}</p>}
                {activeBooking.notes && <p className="modal__meta">Notes: {activeBooking.notes}</p>}
              </div>
            </div>
            <div className="admin-modal__actions">
              <button className="btn btn--secondary" type="button" onClick={closeBookingDetails}>
                Close
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => {
                  closeBookingDetails();
                  openEditModal(activeBooking);
                }}
                disabled={!inventoryEnabled}
              >
                Edit Booking
              </button>
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  closeBookingDetails();
                  handleDelete(activeBooking.id);
                }}
                disabled={!inventoryEnabled}
              >
                Delete Booking
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete Booking"
        message="Are you sure you want to delete this cut flower booking This cannot be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onCancel={() => setDeleteDialog({ open: false, targetId: null })}
        onConfirm={async () => {
          if (!db || !deleteDialog.targetId) return;
          setDeleteBusy(true);
          setFormError(null);
          try {
            await deleteDoc(doc(db, "cutFlowerBookings", deleteDialog.targetId));
            setStatusMessage("Cut flower booking removed");
            if (editingId === deleteDialog.targetId) {
              closeBookingModal();
            }
          } catch (err) {
            setFormError(err.message);
          } finally {
            setDeleteBusy(false);
            setDeleteDialog({ open: false, targetId: null });
          }
        }}
      />
    </>
  );
}
export function AdminOrdersView() {
  usePageMetadata({
    title: "Admin Â· Orders",
    description: "Review cart checkouts and fulfilment status.",
  });
  const { db, storage, orders, products, productCategories, inventoryLoading, inventoryError } = useAdminData();
  const [statusMessage, setStatusMessage] = useState(null);
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);
  const [trackingInput, setTrackingInput] = useState("");
  const trackingInputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [activeOrderDetailTab, setActiveOrderDetailTab] = useState(ORDER_DETAIL_TABS[0].id);
  const [paymentUpdating, setPaymentUpdating] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState("company");
  const [deliveryAddressForm, setDeliveryAddressForm] = useState({ ...EMPTY_SHIPPING_ADDRESS });
  const [deliveryCourierId, setDeliveryCourierId] = useState("");
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliveryUpdateEmailSending, setDeliveryUpdateEmailSending] = useState(false);
  const [resendOrderEmailSending, setResendOrderEmailSending] = useState(false);
  const [preorderNoticeMonth, setPreorderNoticeMonth] = useState("");
  const [preorderNoticeSending, setPreorderNoticeSending] = useState(false);
  const [eftReviewLoading, setEftReviewLoading] = useState(false);
  const [paymentProofUrl, setPaymentProofUrl] = useState("");
  const [paymentProofUrlLoading, setPaymentProofUrlLoading] = useState(false);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [createOrderSaving, setCreateOrderSaving] = useState(false);
  const [createOrderError, setCreateOrderError] = useState(null);
  const [createOrderProductSearch, setCreateOrderProductSearch] = useState("");
  const [createOrderFilters, setCreateOrderFilters] = useState(() => ({
    ...CREATE_ORDER_FILTER_DEFAULTS,
  }));
  const [createOrderVariantSelections, setCreateOrderVariantSelections] = useState({});
  const [createOrderSelectedCourierId, setCreateOrderSelectedCourierId] = useState("");
  const [createOrderForm, setCreateOrderForm] = useState({
    customer: {
      fullName: "",
      email: "",
      phone: "",
    },
    shippingAddress: {
      street: "",
      suburb: "",
      city: "",
      province: "",
      postalCode: "",
    },
    items: [],
  });
  const { items: createOrderCourierOptions = [], status: createOrderCourierStatus } =
    useFirestoreCollection("courierOptions", {
      orderByField: "createdAt",
      orderDirection: "desc",
      fallback: [],
    });
  const [ordersPage, setOrdersPage] = useState(0);
  const ordersPageSize = 5;

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (pendingStatusUpdate) {
      trackingInputRef.current.focus({ preventScroll: true });
    }
  }, [pendingStatusUpdate]);

  useEffect(() => {
    if (selectedOrderId) {
      setActiveOrderDetailTab(ORDER_DETAIL_TABS[0].id);
    }
  }, [selectedOrderId]);

  const needsTrackingLink = (status) => ["shipped"].includes(status);

  const normalizePaymentMethod = (order) =>
    normalizeOrderPaymentMethod(order?.paymentMethod || (order?.payfast ? PAYMENT_METHODS.PAYFAST : ""));

  const normalizePaymentApprovalStatus = (order) =>
    normalizeOrderPaymentApprovalStatus(order || {});

  const isEftOrder = (order) => normalizePaymentMethod(order) === PAYMENT_METHODS.EFT;
  const isEftApproved = (order) =>
    isEftOrder(order) &&
    normalizePaymentApprovalStatus(order) === PAYMENT_APPROVAL_STATUSES.APPROVED;
  const isEftRejected = (order) =>
    isEftOrder(order) &&
    normalizePaymentApprovalStatus(order) === PAYMENT_APPROVAL_STATUSES.REJECTED;
  const isEftBlocked = (order) => isEftOrder(order) && !isEftApproved(order);

  const normalizePaymentStatus = (order) => {
    const method = normalizePaymentMethod(order);
    if (method === PAYMENT_METHODS.EFT) {
      const approvalStatus = normalizePaymentApprovalStatus(order);
      if (approvalStatus === PAYMENT_APPROVAL_STATUSES.APPROVED) return "approved";
      if (approvalStatus === PAYMENT_APPROVAL_STATUSES.REJECTED) return "rejected";
      return (order?.paymentStatus || "awaiting-approval").toString().toLowerCase() || "awaiting-approval";
    }
    return (
      (order?.payfast?.paymentStatus || order?.paymentStatus || "").toString().toLowerCase() || "unknown"
    );
  };

  const getAllowedOrderStatuses = (order) => {
    if (!isEftOrder(order)) return ORDER_STATUSES.filter((status) => !["pending-payment-approval", "payment-rejected"].includes(status));
    if (isEftApproved(order)) return ORDER_STATUSES.filter((status) => !["pending-payment-approval", "payment-rejected"].includes(status));
    if (isEftRejected(order)) return ["payment-rejected", "cancelled"];
    return ["pending-payment-approval", "cancelled"];
  };

  const normalizeDeliveryStatus = (order) => {
    if (order.trackingLink) return "assigned";
    return "not-assigned";
  };

  const productLookup = useMemo(() => {
    const map = new Map();
    (products || []).forEach((product) => {
      if (!product) return;
      if (product.id) map.set(String(product.id), product);
      if (product.slug) map.set(String(product.slug), product);
    });
    return map;
  }, [products]);

  const isPreorderedOrder = (order) => {
    if (!Array.isArray(order?.items) || !order.items.length) return false;
    return order.items.some((item) => {
      if (!item || item.metadata?.type !== "product") return false;
      if (item.metadata?.preorderSendMonth || item.metadata?.preorder_send_month || item.metadata?.preorderSendMonthLabel) {
        return true;
      }
      const metadataStockStatus = (item.metadata?.stockStatus || item.metadata?.stock_status || "")
        .toString()
        .trim()
        .toLowerCase();
      if (metadataStockStatus === "preorder") return true;

      const productId =
        item.metadata?.productId ||
        item.metadata?.productID ||
        item.metadata?.product ||
        null;
      if (!productId) return false;
      const product = productLookup.get(String(productId));
      const productStockStatus = (product?.stock_status || product?.stockStatus || "")
        .toString()
        .trim()
        .toLowerCase();
      return productStockStatus === "preorder";
    });
  };

  const getOrderStatusLabel = (order, statusValue = order?.status) => {
    const normalized = normalizeOrderStatus(statusValue);
    if (normalized === "order-placed" && isPreorderedOrder(order)) {
      return "Preordered";
    }
    return formatOrderStatusLabel(normalized);
  };

  const handleSendPreorderNoticeEmail = async () => {
    if (!functionsInstance || !selectedOrder) return;
    if (!selectedOrder.customer?.email) {
      setStatusMessage("Customer email is missing.");
      return;
    }
    if (!isPreorderedOrder(selectedOrder)) {
      setStatusMessage("This order does not contain pre-order products.");
      return;
    }

    const normalizedMonth = normalizePreorderSendMonth(preorderNoticeMonth);
    if (!normalizedMonth) {
      setStatusMessage("Please select a send month before sending.");
      return;
    }

    setPreorderNoticeSending(true);
    try {
      const sendPreorderListEmail = httpsCallable(functionsInstance, "sendPreorderListEmail");
      await sendPreorderListEmail({
        customer: selectedOrder.customer,
        customerEmail: selectedOrder.customer?.email || "",
        orderNumber: selectedOrder.orderNumber ?? null,
        preorderSendMonth: normalizedMonth,
        items: selectedOrder.items || [],
      });
      setStatusMessage("Pre-order notice email sent.");
    } catch (error) {
      setStatusMessage(error.message || "Unable to send pre-order notice email.");
    } finally {
      setPreorderNoticeSending(false);
    }
  };

  const handleResendOrderConfirmationEmail = async () => {
    if (!functionsInstance || !selectedOrder) return;
    const customerEmail = (selectedOrder.customer?.email || "").toString().trim();
    if (!customerEmail) {
      setStatusMessage("Customer email is missing.");
      return;
    }

    setResendOrderEmailSending(true);
    try {
      const resendOrderConfirmationEmail = httpsCallable(functionsInstance, "resendOrderConfirmationEmail");
      const result = await resendOrderConfirmationEmail({
        orderId: selectedOrder.id,
        orderNumber: selectedOrder.orderNumber ?? null,
        customerEmail,
      });
      const templateUsed = (result?.data?.templateUsed || "").toString().trim().toLowerCase();
      if (templateUsed === "eft-pending") {
        setStatusMessage("EFT pending payment email resent to customer.");
      } else {
        setStatusMessage("Order confirmation resent to customer.");
      }
    } catch (error) {
      setStatusMessage(error.message || "Unable to resend order confirmation.");
    } finally {
      setResendOrderEmailSending(false);
    }
  };

  const handleMarkPaymentReceived = async (order) => {
    if (!db || !order.id) return;
    if (isEftOrder(order)) {
      setStatusMessage("Use Approve Payment or Reject Payment for EFT orders.");
      return;
    }
    setPaymentUpdating(true);
    try {
      await updateDoc(doc(db, "orders", order.id), {
        paymentStatus: "paid",
        status: normalizeOrderStatus(order.status) === "pending-payment-approval"
          ? "order-placed"
          : normalizeOrderStatus(order.status) || "order-placed",
        paymentMethod: PAYMENT_METHODS.PAYFAST,
        paymentApprovalStatus: PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED,
        paymentApproval: {
          required: false,
          decision: PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED,
          decidedAt: null,
          decidedByUid: null,
          decidedByEmail: null,
          note: null,
        },
        paidAt: serverTimestamp(),
      });

      // Mark any linked bookings as paid
      const bookingRefs = [];
      if (order.items.some((item) => item.metadata.type === "workshop")) {
        const { getDocs, query, where } = await import("firebase/firestore");
        const bookingsQuery = query(collection(db, "bookings"), where("orderId", "==", order.id));
        const snapshot = await getDocs(bookingsQuery);
        snapshot.forEach((docSnap) => bookingRefs.push(docSnap.ref));
        if (bookingRefs.length) {
          const { writeBatch } = await import("firebase/firestore");
          const batch = writeBatch(db);
          bookingRefs.forEach((ref) =>
            batch.set(
              ref,
              { paid: true, paymentStatus: "paid", paidAt: serverTimestamp() },
              { merge: true },
            ),
          );
          await batch.commit();
        }
      }

      setStatusMessage("Payment marked as received");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setPaymentUpdating(false);
    }
  };

  const handleReviewEftPayment = async (order, decision) => {
    if (!functionsInstance || !order?.id || !isEftOrder(order)) return;
    setEftReviewLoading(true);
    try {
      const reviewEftPayment = httpsCallable(functionsInstance, "reviewEftPayment");
      const result = await reviewEftPayment({
        orderId: order.id,
        decision,
      });
      const nextStatus = result?.data?.status || (decision === "approve" ? "order-placed" : "payment-rejected");
      setStatusMessage(
        decision === "approve"
          ? `EFT payment approved. Order moved to ${formatOrderStatusLabel(nextStatus)}.`
          : "EFT payment rejected. Order remains blocked from fulfilment.",
      );
    } catch (error) {
      setStatusMessage(error.message || "Unable to review EFT payment.");
    } finally {
      setEftReviewLoading(false);
    }
  };

  const resetCreateOrderFilters = () =>
    setCreateOrderFilters({
      ...CREATE_ORDER_FILTER_DEFAULTS,
    });

  const resetCreateOrderForm = () => {
    setCreateOrderForm({
      customer: {
        fullName: "",
        email: "",
        phone: "",
      },
      shippingAddress: {
        street: "",
        suburb: "",
        city: "",
        province: "",
        postalCode: "",
      },
      items: [],
    });
    setCreateOrderSelectedCourierId("");
    setCreateOrderProductSearch("");
    resetCreateOrderFilters();
    setCreateOrderVariantSelections({});
    setCreateOrderError(null);
  };

  const handleCreateOrderCustomerChange = (field) => (event) => {
    const value = event.target.value;
    setCreateOrderForm((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        [field]: value,
      },
    }));
  };

  const handleCreateOrderShippingAddressChange = (field) => (event) => {
    const value = event.target.value;
    setCreateOrderForm((prev) => ({
      ...prev,
      shippingAddress: {
        ...prev.shippingAddress,
        [field]: value,
      },
    }));
  };

  const handleCreateOrderFilterChange = (field) => (event) => {
    const value = event.target.value;
    setCreateOrderFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const createOrderPostalCode = (createOrderForm.shippingAddress?.postalCode || "").toString().trim();
  const createOrderPostalCodeValid = /^\d{4}$/.test(createOrderPostalCode);

  const createOrderAvailableCouriers = useMemo(() => {
    const province = (createOrderForm.shippingAddress?.province || "").toString().trim();
    if (!province) return [];
    return createOrderCourierOptions
      .filter((option) => option?.isActive !== false)
      .map((option) => {
        const provinceConfig = option?.provinces?.[province] || {};
        const price = Number(provinceConfig.price);
        return {
          id: option.id,
          name: option.name || "Courier",
          price,
          isAvailable: provinceConfig.isAvailable === true,
        };
      })
      .filter((option) => option.isAvailable && Number.isFinite(option.price))
      .sort((a, b) => a.price - b.price);
  }, [createOrderCourierOptions, createOrderForm.shippingAddress?.province]);

  const createOrderSelectedCourier =
    createOrderAvailableCouriers.find((option) => option.id === createOrderSelectedCourierId) || null;
  const createOrderShippingCost = createOrderSelectedCourier ? createOrderSelectedCourier.price : 0;

  useEffect(() => {
    const province = (createOrderForm.shippingAddress?.province || "").toString().trim();
    if (!province) {
      setCreateOrderSelectedCourierId("");
      return;
    }
    const stillAvailable = createOrderAvailableCouriers.some(
      (option) => option.id === createOrderSelectedCourierId,
    );
    if (stillAvailable) return;
    setCreateOrderSelectedCourierId(createOrderAvailableCouriers[0]?.id || "");
  }, [
    createOrderAvailableCouriers,
    createOrderForm.shippingAddress?.province,
    createOrderSelectedCourierId,
  ]);

  const createOrderCategoryLookup = useMemo(() => {
    const lookup = new Map();
    (productCategories || []).forEach((category, index) => {
      if (!category) return;
      const label = (category.name || category.title || category.label || "").toString().trim();
      const canonicalId =
        normalizeCreateOrderCategoryToken(category.id) ||
        normalizeCreateOrderCategoryToken(category.slug) ||
        normalizeCreateOrderCategoryToken(slugifyId(label)) ||
        `category-${index}`;
      const entry = {
        id: canonicalId,
        label: label || canonicalId,
      };
      const tokens = new Set([canonicalId]);
      [category.id, category.slug, label].forEach((value) => {
        buildCreateOrderCategoryTokens(value).forEach((token) => tokens.add(token));
      });
      tokens.forEach((token) => lookup.set(token, entry));
    });
    return lookup;
  }, [productCategories]);

  const createOrderCatalogProducts = useMemo(() => {
    return (products || [])
      .map((product) => {
        if (!product?.id) return null;
        const name = (product.name || product.title || "").toString().trim();
        if (!name) return null;

        const numericPrice = parseNumber(product.price, null);
        const variants = Array.isArray(product.variants)
          ? product.variants
              .map((variant, index) => {
                const label = (variant?.label || variant?.name || "").toString().trim();
                if (!label) return null;
                return {
                  id: variant.id || `${product.id}-variant-${index}`,
                  label,
                  price: parseNumber(variant.price, null),
                };
              })
              .filter(Boolean)
          : [];
        const variantPrices = variants
          .map((variant) => parseNumber(variant.price, null))
          .filter((price) => Number.isFinite(price));
        const filterPrice = variantPrices.length
          ? Math.min(...variantPrices)
          : Number.isFinite(numericPrice) ?
             numericPrice
            : null;
        const stockStatus = getStockStatus({
          quantity: product.stock_quantity ?? product.quantity,
          forceOutOfStock: product.forceOutOfStock || product.stock_status === "out_of_stock",
          status: product.stock_status,
        });
        const stockStatusKey = (product.stock_status || product.stockStatus || "")
          .toString()
          .trim()
          .toLowerCase();
        const preorderSendMonth = normalizePreorderSendMonth(
          product.preorder_send_month || product.preorderSendMonth || "",
        );
        const rawCategoryValues = [];
        if (Array.isArray(product.category_ids)) {
          rawCategoryValues.push(...product.category_ids);
        } else if (Array.isArray(product.categoryIds)) {
          rawCategoryValues.push(...product.categoryIds);
        } else if (product.categoryId) {
          rawCategoryValues.push(product.categoryId);
        }
        if (product.categorySlug) rawCategoryValues.push(product.categorySlug);
        if (product.category) rawCategoryValues.push(product.category);

        const categoryTokens = Array.from(
          new Set(
            rawCategoryValues
              .flatMap((value) => buildCreateOrderCategoryTokens(value))
              .filter(Boolean),
          ),
        );
        let resolvedCategory = null;
        for (const token of categoryTokens) {
          const matched = createOrderCategoryLookup.get(token);
          if (matched) {
            resolvedCategory = matched;
            break;
          }
        }

        const fallbackCategoryLabel = (product.category || product.categoryName || "")
          .toString()
          .trim();
        const categoryLabel = resolvedCategory?.label || fallbackCategoryLabel || "";
        const categoryId =
          resolvedCategory?.id ||
          normalizeCreateOrderCategoryToken(slugifyId(categoryLabel)) ||
          categoryTokens[0] ||
          "";
        if (categoryId && !categoryTokens.includes(categoryId)) {
          categoryTokens.push(categoryId);
        }

        return {
          id: product.id,
          slug: product.slug || "",
          sku: (product.sku || "").toString().trim(),
          name,
          numericPrice,
          displayPrice: Number.isFinite(numericPrice) ? formatPriceLabel(numericPrice) : "Price on request",
          variants,
          stockStatus,
          stockStatusKey,
          preorderSendMonth,
          filterPrice,
          categoryId,
          categoryLabel,
          categoryTokens,
        };
      })
      .filter(Boolean);
  }, [products, createOrderCategoryLookup]);

  const createOrderCategoryOptions = useMemo(() => {
    const options = new Map();
    (productCategories || []).forEach((category, index) => {
      const label = (category?.name || category?.title || category?.label || "")
        .toString()
        .trim();
      const id =
        normalizeCreateOrderCategoryToken(category?.id) ||
        normalizeCreateOrderCategoryToken(category?.slug) ||
        normalizeCreateOrderCategoryToken(slugifyId(label)) ||
        `category-${index}`;
      if (!options.has(id)) {
        options.set(id, {
          id,
          label: label || id,
        });
      }
    });
    createOrderCatalogProducts.forEach((product) => {
      const id =
        normalizeCreateOrderCategoryToken(product.categoryId) ||
        normalizeCreateOrderCategoryToken(slugifyId(product.categoryLabel || ""));
      if (!id) return;
      if (!options.has(id)) {
        options.set(id, {
          id,
          label: product.categoryLabel || id,
        });
      }
    });
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [productCategories, createOrderCatalogProducts]);

  const filteredCreateOrderProducts = useMemo(() => {
    const term = createOrderProductSearch.trim().toLowerCase();
    const selectedCategoryId = normalizeCreateOrderCategoryToken(createOrderFilters.categoryId);
    const selectedStock = normalizeCreateOrderCategoryToken(createOrderFilters.stock);
    const minPrice = parseOptionalNumber((createOrderFilters.minPrice || "").toString().trim());
    const maxPrice = parseOptionalNumber((createOrderFilters.maxPrice || "").toString().trim());
    const hasMinPrice = Number.isFinite(minPrice);
    const hasMaxPrice = Number.isFinite(maxPrice);

    let filtered = [...createOrderCatalogProducts];
    if (term) {
      filtered = filtered.filter((product) =>
        [product.name, product.sku, product.id, product.categoryLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    }
    if (selectedCategoryId && selectedCategoryId !== "all") {
      filtered = filtered.filter((product) => product.categoryTokens.includes(selectedCategoryId));
    }
    if (selectedStock && selectedStock !== "all") {
      filtered = filtered.filter((product) => (product.stockStatus?.state || "").toLowerCase() === selectedStock);
    }
    if (hasMinPrice || hasMaxPrice) {
      filtered = filtered.filter((product) => {
        const price = product.filterPrice;
        if (!Number.isFinite(price)) return false;
        if (hasMinPrice && price < minPrice) return false;
        if (hasMaxPrice && price > maxPrice) return false;
        return true;
      });
    }

    if (createOrderFilters.sort === "price-asc" || createOrderFilters.sort === "price-desc") {
      const priceDirection = createOrderFilters.sort === "price-asc" ? 1 : -1;
      filtered.sort((a, b) => {
        const aPrice = Number.isFinite(a.filterPrice) ? a.filterPrice : null;
        const bPrice = Number.isFinite(b.filterPrice) ? b.filterPrice : null;
        if (aPrice === null && bPrice === null) return a.name.localeCompare(b.name);
        if (aPrice === null) return 1;
        if (bPrice === null) return -1;
        const diff = (aPrice - bPrice) * priceDirection;
        return diff === 0 ? a.name.localeCompare(b.name) : diff;
      });
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    return filtered;
  }, [createOrderCatalogProducts, createOrderFilters, createOrderProductSearch]);

  const hasActiveCreateOrderFilters = useMemo(
    () =>
      createOrderFilters.categoryId !== CREATE_ORDER_FILTER_DEFAULTS.categoryId ||
      createOrderFilters.stock !== CREATE_ORDER_FILTER_DEFAULTS.stock ||
      (createOrderFilters.minPrice || "").toString().trim() !== CREATE_ORDER_FILTER_DEFAULTS.minPrice ||
      (createOrderFilters.maxPrice || "").toString().trim() !== CREATE_ORDER_FILTER_DEFAULTS.maxPrice ||
      createOrderFilters.sort !== CREATE_ORDER_FILTER_DEFAULTS.sort,
    [createOrderFilters],
  );
  const hasActiveCreateOrderSearch = createOrderProductSearch.trim().length > 0;
  const createOrderEmptyMessage = hasActiveCreateOrderFilters
    ? "No products match current filters."
    : hasActiveCreateOrderSearch ?
       "No products match this search."
      : "No products available in your catalog.";

  const handleAddCatalogProductToOrder = (product) => {
    const selectedVariantId = createOrderVariantSelections[product.id] || "";
    const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId) || null;
    if (product.variants.length > 0 && !selectedVariant) {
      setCreateOrderError(`Select a variant for ${product.name} before adding it.`);
      return;
    }

    const unitPrice = Number.isFinite(selectedVariant?.price) ? selectedVariant.price : product.numericPrice;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setCreateOrderError(`Unable to add ${product.name}. Please check that a valid price is set.`);
      return;
    }

    const itemKey = buildAdminOrderCartKey({
      sourceId: product.id,
      variantId: selectedVariant?.id || "",
    });
    const metadata = {
      type: "product",
      source: "admin-created-order",
      productId: product.id,
      productSlug: product.slug || null,
      variantId: selectedVariant?.id || null,
      variantLabel: selectedVariant?.label || null,
      stockStatus: product.stockStatusKey || null,
      preorderSendMonth: product.preorderSendMonth || null,
    };

    setCreateOrderForm((prev) => {
      const existingIndex = prev.items.findIndex((item) => item.key === itemKey);
      if (existingIndex === -1) {
        return {
          ...prev,
          items: [
            ...prev.items,
            {
              key: itemKey,
              id: itemKey,
              sourceId: product.id,
              name: product.name,
              price: unitPrice,
              quantity: 1,
              metadata,
            },
          ],
        };
      }

      const nextItems = [...prev.items];
      const existing = nextItems[existingIndex];
      nextItems[existingIndex] = {
        ...existing,
        quantity: Math.max(1, (Number(existing.quantity) || 1) + 1),
        price: unitPrice,
        metadata: {
          ...(existing.metadata || {}),
          ...metadata,
        },
      };
      return {
        ...prev,
        items: nextItems,
      };
    });

    setCreateOrderError(null);
  };

  const handleCreateOrderCartQuantityChange = (itemKey, value) => {
    const nextQuantity = Math.max(1, Number.parseInt(value, 10) || 1);
    setCreateOrderForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.key === itemKey
          ? { ...item, quantity: nextQuantity }
          : item,
      ),
    }));
  };

  const adjustCreateOrderCartQuantity = (itemKey, delta) => {
    setCreateOrderForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.key !== itemKey) return item;
        const nextQuantity = Math.max(1, (Number(item.quantity) || 1) + delta);
        return { ...item, quantity: nextQuantity };
      }),
    }));
  };

  const removeCreateOrderCartItem = (itemKey) => {
    setCreateOrderForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.key !== itemKey),
    }));
  };

  const createOrderPricing = useMemo(() => {
    const validItems = (createOrderForm.items || []).reduce((acc, item) => {
      const name = (item.name || "").toString().trim();
      const quantity = Number.parseInt(item.quantity, 10);
      const price = parseNumber(item.price, null);
      if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) {
        return acc;
      }
      acc.push({
        id: item.id || item.key,
        key: item.key || item.id || "",
        sourceId: item.sourceId || null,
        name,
        quantity: Math.floor(quantity),
        price,
        metadata: item.metadata || {
          type: "product",
          source: "admin-created-order",
        },
      });
      return acc;
    }, []);

    const subtotal = validItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingCost = Number.isFinite(createOrderShippingCost) && createOrderShippingCost >= 0
      ? createOrderShippingCost
      : 0;
    return {
      validItems,
      subtotal,
      shippingCost,
      totalPrice: subtotal + shippingCost,
    };
  }, [createOrderForm.items, createOrderShippingCost]);

  const handleCreateAdminOrder = async () => {
    if (!functionsInstance) return;
    const customer = {
      fullName: (createOrderForm.customer.fullName || "").toString().trim(),
      email: (createOrderForm.customer.email || "").toString().trim(),
      phone: (createOrderForm.customer.phone || "").toString().trim(),
      address: "",
    };
    const normalizedShippingAddress = {
      street: (createOrderForm.shippingAddress?.street || "").toString().trim(),
      suburb: (createOrderForm.shippingAddress?.suburb || "").toString().trim(),
      city: (createOrderForm.shippingAddress?.city || "").toString().trim(),
      province: (createOrderForm.shippingAddress?.province || "").toString().trim(),
      postalCode: createOrderPostalCode,
    };
    customer.address = formatShippingAddress(normalizedShippingAddress);

    const requiredCustomer = ["fullName", "email", "phone"];
    const missingCustomer = requiredCustomer.filter((field) => !customer[field]);
    if (missingCustomer.length) {
      setCreateOrderError("Please complete customer details before creating the order.");
      return;
    }

    const requiredShipping = ["street", "suburb", "city", "province", "postalCode"];
    const missingShipping = requiredShipping.filter((field) => !normalizedShippingAddress[field]);
    if (missingShipping.length) {
      setCreateOrderError("Please complete shipping address details before creating the order.");
      return;
    }
    if (!createOrderPostalCodeValid) {
      setCreateOrderError("Postal code should be 4 digits.");
      return;
    }
    if (normalizedShippingAddress.province && createOrderAvailableCouriers.length === 0) {
      setCreateOrderError(`No courier options are available for ${normalizedShippingAddress.province}.`);
      return;
    }
    if (!createOrderSelectedCourier) {
      setCreateOrderError("Please select a courier before creating the order.");
      return;
    }

    if (!createOrderPricing.validItems.length) {
      setCreateOrderError("Add at least one product to the order.");
      return;
    }

    setCreateOrderSaving(true);
    setCreateOrderError(null);
    try {
      const createAdminEftOrder = httpsCallable(functionsInstance, "createAdminEftOrder");
      const result = await createAdminEftOrder({
        customer,
        items: createOrderPricing.validItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          metadata: item.metadata || { type: "product", source: "admin-created-order" },
        })),
        subtotal: createOrderPricing.subtotal,
        shippingCost: createOrderPricing.shippingCost,
        totalPrice: createOrderPricing.totalPrice,
        shipping: {
          courierId: createOrderSelectedCourier.id,
          courierName: createOrderSelectedCourier.name,
          courierPrice: createOrderSelectedCourier.price,
          province: normalizedShippingAddress.province,
        },
        shippingAddress: normalizedShippingAddress,
      });

      const orderId = result?.data?.orderId || null;
      const orderNumber = result?.data?.orderNumber || null;
      setStatusMessage(
        orderNumber
          ? `Order #${orderNumber} created as EFT and awaiting admin payment approval.`
          : "Order created as EFT and awaiting admin payment approval.",
      );
      setCreateOrderOpen(false);
      resetCreateOrderForm();
      if (orderId) {
        setSelectedOrderId(orderId);
      }
    } catch (error) {
      setCreateOrderError(error.message || "Unable to create order.");
    } finally {
      setCreateOrderSaving(false);
    }
  };

  const handleDeliveryAddressChange = (field) => (event) => {
    const value = event.target.value;
    setDeliveryAddressForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveDelivery = async () => {
    if (!functionsInstance || !selectedOrder?.id) {
      setStatusMessage("Delivery update service is unavailable.");
      return;
    }
    const normalizedAddress = normalizeShippingAddressDraft(deliveryAddressForm);
    if (!isShippingAddressComplete(normalizedAddress)) {
      setStatusMessage("Complete street, suburb, city, province, and a 4-digit postal code before saving.");
      return;
    }
    if (deliveryMethod === "courier" && !deliveryCourierId) {
      setStatusMessage("Select a courier before saving.");
      return;
    }

    setDeliverySaving(true);
    try {
      const callable = httpsCallable(functionsInstance, "adminUpdateOrderDeliveryDetails");
      const response = await callable({
        orderId: selectedOrder.id,
        deliveryMethod,
        courierId: deliveryMethod === "courier" ? deliveryCourierId : "",
        courierName: deliveryMethod === "courier" ? selectedDeliveryCourier?.name || "" : "",
        trackingLink: trackingInput.trim(),
        shippingAddress: normalizedAddress,
      });
      const result = response?.data || {};
      const changedAmount =
        Number.isFinite(Number(result.paymentAdjustmentDelta)) ?
          Number(result.paymentAdjustmentDelta)
          : 0;
      if (result.paymentAdjustmentRequired) {
        setStatusMessage(
          `Delivery updated. Paid order total changed by ${formatPriceLabel(changedAmount)} and now needs payment review.`,
        );
      } else {
        setStatusMessage("Delivery updated.");
      }
    } catch (error) {
      setStatusMessage(error.message || "Unable to update delivery.");
    } finally {
      setDeliverySaving(false);
    }
  };

  const handleSendDeliveryUpdateEmail = async () => {
    if (!functionsInstance || !selectedOrder?.id) return;
    if (!selectedOrder.customer?.email) {
      setStatusMessage("Customer email is missing.");
      return;
    }
    setDeliveryUpdateEmailSending(true);
    try {
      const callable = httpsCallable(functionsInstance, "adminSendOrderDeliveryUpdateEmail");
      const response = await callable({
        orderId: selectedOrder.id,
      });
      const result = response?.data || {};
      if (result.emailStatus === "sent") {
        setStatusMessage("Delivery update email sent.");
      } else {
        setStatusMessage(result.emailError || "Unable to send delivery update email.");
      }
    } catch (error) {
      setStatusMessage(error.message || "Unable to send delivery update email.");
    } finally {
      setDeliveryUpdateEmailSending(false);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId,
    nextStatus,
    trackingLinkOverride = null
  ) => {
    if (!db) return;
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) return;
    const normalizedNextStatus = normalizeOrderStatus(nextStatus);
    const allowedStatuses = getAllowedOrderStatuses(targetOrder);

    if (!allowedStatuses.includes(normalizedNextStatus)) {
      setStatusMessage("EFT payment must be approved before fulfilment.");
      return;
    }

    if (needsTrackingLink(normalizedNextStatus) && trackingLinkOverride === null) {
      setPendingStatusUpdate({
        orderId,
        status: normalizedNextStatus,
        existingLink: targetOrder.trackingLink || "",
      });
      setTrackingInput(targetOrder.trackingLink || "");
      return;
    }

    const normalizedLink =
      typeof trackingLinkOverride === "string" ?
         trackingLinkOverride.trim()
        : targetOrder.trackingLink || "";
    const fallbackLink = normalizedLink || targetOrder.trackingLink || "";
    const finalTrackingLink = needsTrackingLink(normalizedNextStatus) ?
       fallbackLink || null
      : targetOrder.trackingLink || null;

    await updateDoc(doc(db, "orders", orderId), {
      status: normalizedNextStatus,
      updatedAt: serverTimestamp(),
      trackingLink: finalTrackingLink,
    });
    setStatusMessage("Order updated");

    if (functionsInstance && targetOrder.customer?.email) {
      try {
        const sendOrderStatusEmail = httpsCallable(
          functionsInstance,
          "sendOrderStatusEmail"
        );
        await sendOrderStatusEmail({
          status: getOrderStatusLabel(targetOrder, normalizedNextStatus),
          orderNumber: targetOrder.orderNumber ?? null,
          trackingLink: finalTrackingLink || "",
          customer: targetOrder.customer,
          customerEmail: targetOrder.customer?.email || "",
          items: targetOrder.items || [],
        });
      } catch (error) {
        console.warn("Failed to send order status email", error);
        setStatusMessage("Order updated, but customer email failed to send.");
      }
    }

    setPendingStatusUpdate(null);
    setTrackingInput("");
  };

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" ? true : normalizeOrderStatus(order.status) === statusFilter;
      if (!matchesStatus) return false;
      if (!term) return true;
      const haystack = [
        order.id,
        order.orderNumber ? String(order.orderNumber) : "",
        order.customer?.fullName || "",
        order.customer?.email || "",
        order.customer?.phone || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, searchTerm, statusFilter]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredOrders.length / ordersPageSize) - 1);
    setOrdersPage((prev) => Math.min(prev, maxPage));
  }, [filteredOrders.length, ordersPageSize]);

  const paginatedOrders = useMemo(() => {
    const start = ordersPage * ordersPageSize;
    return filteredOrders.slice(start, start + ordersPageSize);
  }, [filteredOrders, ordersPage, ordersPageSize]);

  const kpi = useMemo(() => {
    const today = new Date();
    const normalizePaymentStatusForKpi = (order) => {
      const method = normalizeOrderPaymentMethod(
        order?.paymentMethod || (order?.payfast ? PAYMENT_METHODS.PAYFAST : ""),
      );
      if (method === PAYMENT_METHODS.EFT) {
        const approvalStatus = normalizeOrderPaymentApprovalStatus(order || {});
        if (approvalStatus === PAYMENT_APPROVAL_STATUSES.APPROVED) return "approved";
        if (approvalStatus === PAYMENT_APPROVAL_STATUSES.REJECTED) return "rejected";
        return (order?.paymentStatus || "awaiting-approval").toString().toLowerCase() || "awaiting-approval";
      }
      return (
        (order?.payfast?.paymentStatus || order?.paymentStatus || "").toString().toLowerCase() || "unknown"
      );
    };
    const isPaidOrderForKpi = (order) => {
      const method = normalizeOrderPaymentMethod(
        order?.paymentMethod || (order?.payfast ? PAYMENT_METHODS.PAYFAST : ""),
      );
      if (method === PAYMENT_METHODS.EFT) {
        return normalizeOrderPaymentApprovalStatus(order || {}) === PAYMENT_APPROVAL_STATUSES.APPROVED;
      }
      return ["complete", "paid"].includes(normalizePaymentStatusForKpi(order));
    };
    const isToday = (ts) => {
      if (!ts.toDate) return false;
      const d = ts.toDate();
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    };
    const totalToday = orders.filter((o) => isToday(o.createdAt)).length;
    const statusCounts = orders.reduce(
      (acc, order) => {
        const status = normalizeOrderStatus(order.status);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { "order-placed": 0, "packing-order": 0, "order-ready-for-shipping": 0, shipped: 0, completed: 0, cancelled: 0 }
    );
    const paidCount = orders.filter((order) => isPaidOrderForKpi(order)).length;
    const failedPayments = orders.filter((order) => normalizePaymentStatusForKpi(order) === "failed").length;
    return { totalToday, statusCounts, paidCount, failedPayments };
  }, [orders]);

  const selectedOrder = selectedOrderId ?
     orders.find((order) => order.id === selectedOrderId) || null
    : null;
  const deliveryProvince = (deliveryAddressForm.province || "").toString().trim();
  const deliveryAvailableCouriers = useMemo(() => {
    if (deliveryMethod !== "courier" || !deliveryProvince) return [];
    return createOrderCourierOptions
      .filter((option) => option?.isActive !== false)
      .map((option) => {
        const provinceConfig = option?.provinces?.[deliveryProvince] || {};
        const price = Number(provinceConfig.price);
        return {
          id: option.id,
          name: option.name || "Courier",
          price,
          isAvailable: provinceConfig.isAvailable === true,
        };
      })
      .filter((option) => option.isAvailable && Number.isFinite(option.price) && option.price >= 0)
      .sort((left, right) => left.price - right.price);
  }, [createOrderCourierOptions, deliveryMethod, deliveryProvince]);
  const selectedDeliveryCourier = deliveryAvailableCouriers.find(
    (entry) => entry.id === deliveryCourierId,
  ) || null;
  const shippingAddressLabel = selectedOrder
    ? formatShippingAddress(selectedOrder.shippingAddress) ||
      selectedOrder.customer?.address ||
      ""
    : "";
  const selectedPaymentMethod = selectedOrder ? normalizePaymentMethod(selectedOrder) : PAYMENT_METHODS.PAYFAST;
  const selectedPaymentApprovalStatus = selectedOrder
    ? normalizePaymentApprovalStatus(selectedOrder)
    : PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED;
  const selectedPaymentStatus = selectedOrder ? normalizePaymentStatus(selectedOrder) : "unknown";
  const selectedPaymentAdjustment = selectedOrder?.paymentAdjustment || null;
  const selectedStatusOptions = selectedOrder ? getAllowedOrderStatuses(selectedOrder) : ORDER_STATUSES;
  const selectedStatusLocked = selectedOrder ? isEftBlocked(selectedOrder) : false;
  const selectedPayfast = selectedOrder?.payfast || {};
  const selectedShipping = selectedOrder?.shipping || {};
  const deliveryPreview = useMemo(() => {
    if (!selectedOrder) return null;
    const previousShippingCostRaw =
      Number(selectedOrder.shippingCost ?? selectedOrder.shipping?.courierPrice ?? 0);
    const previousShippingCost = Number.isFinite(previousShippingCostRaw) ?
       previousShippingCostRaw
      : 0;
    const subtotal = resolveOrderSubtotalAmount(selectedOrder);
    const previousTotalRaw = Number(selectedOrder.totalPrice);
    const previousTotal = Number.isFinite(previousTotalRaw) ?
       previousTotalRaw
      : subtotal + previousShippingCost;
    const nextShippingCost = deliveryMethod === "courier"
      ? Number(selectedDeliveryCourier?.price)
      : previousShippingCost;
    const canResolveNewShippingCost =
      deliveryMethod === "courier" ? Number.isFinite(nextShippingCost) : true;
    const resolvedShippingCost = canResolveNewShippingCost ? nextShippingCost : previousShippingCost;
    const nextTotal = subtotal + resolvedShippingCost;
    const totalsChanged = Math.abs(nextTotal - previousTotal) > 0.009;
    const isPaidOrder =
      normalizePaymentStatus(selectedOrder) === "paid" ||
      normalizePaymentStatus(selectedOrder) === "complete" ||
      (isEftOrder(selectedOrder) &&
        normalizePaymentApprovalStatus(selectedOrder) === PAYMENT_APPROVAL_STATUSES.APPROVED);
    const paymentAdjustmentRequired = isPaidOrder && totalsChanged;
    return {
      previousShippingCost,
      nextShippingCost: canResolveNewShippingCost ? resolvedShippingCost : null,
      previousTotal,
      nextTotal,
      canResolveNewShippingCost,
      paymentAdjustmentRequired,
      delta: nextTotal - previousTotal,
    };
  }, [
    deliveryMethod,
    isEftOrder,
    normalizePaymentApprovalStatus,
    selectedDeliveryCourier?.price,
    selectedOrder,
  ]);
  const selectedOrderEmailNotification = selectedOrder?.notifications?.orderCreated?.customer || null;
  const selectedOrderEmailStatusRaw = (selectedOrderEmailNotification?.status || "").toString().trim().toLowerCase();
  const selectedOrderEmailStatus = ["sent", "failed", "skipped"].includes(selectedOrderEmailStatusRaw)
    ? selectedOrderEmailStatusRaw
    : "unknown";
  const selectedOrderEmailStatusLabel = selectedOrderEmailStatus === "unknown"
    ? "No attempt recorded"
    : selectedOrderEmailStatus.charAt(0).toUpperCase() + selectedOrderEmailStatus.slice(1);
  const selectedOrderEmailTemplate = (selectedOrderEmailNotification?.template || "")
    .toString()
    .trim()
    .toLowerCase();
  const selectedOrderEmailTemplateLabel = selectedOrderEmailTemplate === "eft-pending"
    ? "EFT pending"
    : selectedOrderEmailTemplate === "standard"
      ? "Standard confirmation"
      : "N/A";
  const selectedOrderEmailAttemptedAtLabel = selectedOrderEmailNotification?.attemptedAt?.toDate?.()
    ? bookingDateFormatter.format(selectedOrderEmailNotification.attemptedAt.toDate())
    : "";
  const selectedOrderEmailLastAttemptSource = (selectedOrderEmailNotification?.lastAttemptSource || "")
    .toString()
    .trim()
    .toLowerCase();
  const selectedOrderEmailError = (selectedOrderEmailNotification?.error || "").toString().trim();
  const selectedOrderEmailNeedsRetry = selectedOrderEmailStatus === "failed" || selectedOrderEmailStatus === "skipped";
  const handleOrderDetailTabKeyDown = (event) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const tabIds = ORDER_DETAIL_TABS.map((tab) => tab.id);
    const currentIndex = tabIds.indexOf(activeOrderDetailTab);
    if (currentIndex < 0) return;
    event.preventDefault();
    if (event.key === "Home") {
      setActiveOrderDetailTab(tabIds[0]);
      return;
    }
    if (event.key === "End") {
      setActiveOrderDetailTab(tabIds[tabIds.length - 1]);
      return;
    }
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabIds.length) % tabIds.length;
    setActiveOrderDetailTab(tabIds[nextIndex]);
  };

  useEffect(() => {
    const resolvePreorderSendMonthFromOrder = (order) => {
      if (!Array.isArray(order?.items)) return "";
      for (const item of order.items) {
        if (!item || item.metadata?.type !== "product") continue;
        const fromMetadata = normalizePreorderSendMonth(
          item.metadata?.preorderSendMonth || item.metadata?.preorder_send_month || "",
        );
        if (fromMetadata) return fromMetadata;
        const productId =
          item.metadata?.productId ||
          item.metadata?.productID ||
          item.metadata?.product ||
          null;
        if (!productId) continue;
        const product = productLookup.get(String(productId));
        const fromProduct = normalizePreorderSendMonth(
          product?.preorder_send_month || product?.preorderSendMonth || "",
        );
        if (fromProduct) return fromProduct;
      }
      return "";
    };
    if (selectedOrder) {
      setDeliveryMethod((selectedOrder.deliveryMethod || "company").toString().toLowerCase() === "courier" ? "courier" : "company");
      setDeliveryAddressForm(resolveOrderDeliveryAddressDraft(selectedOrder));
      const selectedOrderCourierId = (selectedOrder.shipping?.courierId || "").toString().trim();
      const selectedOrderCourierName = (
        selectedOrder.shipping?.courierName ||
        selectedOrder.courierName ||
        ""
      ).toString().trim();
      if (selectedOrderCourierId) {
        setDeliveryCourierId(selectedOrderCourierId);
      } else if (selectedOrderCourierName) {
        const matchingCourier = createOrderCourierOptions.find(
          (entry) =>
            (entry?.name || "").toString().trim().toLowerCase() ===
            selectedOrderCourierName.toLowerCase(),
        );
        setDeliveryCourierId(matchingCourier?.id || "");
      } else {
        setDeliveryCourierId("");
      }
      setTrackingInput(selectedOrder.trackingLink || "");
      const fallbackMarchMonth = `${new Date().getFullYear()}-03`;
      setPreorderNoticeMonth(resolvePreorderSendMonthFromOrder(selectedOrder) || fallbackMarchMonth);
    } else {
      setDeliveryAddressForm({ ...EMPTY_SHIPPING_ADDRESS });
      setDeliveryCourierId("");
      setPreorderNoticeMonth("");
    }
  }, [createOrderCourierOptions, selectedOrder, productLookup]);

  useEffect(() => {
    if (!selectedOrder) return;
    if (deliveryMethod !== "courier") {
      setDeliveryCourierId("");
      return;
    }
    if (!deliveryProvince) {
      setDeliveryCourierId("");
      return;
    }
    const stillValid = deliveryAvailableCouriers.some((entry) => entry.id === deliveryCourierId);
    if (stillValid) return;
    const preferredCourierName = (
      selectedOrder.shipping?.courierName ||
      selectedOrder.courierName ||
      ""
    ).toString().trim().toLowerCase();
    const matchedByName = preferredCourierName
      ? deliveryAvailableCouriers.find(
          (entry) => entry.name.toString().trim().toLowerCase() === preferredCourierName,
        )
      : null;
    setDeliveryCourierId(matchedByName?.id || deliveryAvailableCouriers[0]?.id || "");
  }, [
    deliveryAvailableCouriers,
    deliveryCourierId,
    deliveryMethod,
    deliveryProvince,
    selectedOrder,
  ]);

  useEffect(() => {
    let cancelled = false;
    const proofPath = selectedOrder?.paymentProof?.storagePath || "";
    if (!proofPath || !storage) {
      setPaymentProofUrl("");
      setPaymentProofUrlLoading(false);
      return undefined;
    }

    setPaymentProofUrlLoading(true);
    getDownloadURL(ref(storage, proofPath))
      .then((url) => {
        if (cancelled) return;
        setPaymentProofUrl(url);
      })
      .catch(() => {
        if (cancelled) return;
        setPaymentProofUrl("");
      })
      .finally(() => {
        if (cancelled) return;
        setPaymentProofUrlLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrder?.id, selectedOrder?.paymentProof?.storagePath, storage]);

  return (
    <div className="admin-panel admin-panel--full admin-orders-view">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Orders</h2>
          <p className="admin-panel__note">
            Track everything added to cart, including workshop metadata.
          </p>
        </div>
        <button
          className="btn btn--primary"
          type="button"
          onClick={() => {
            setCreateOrderOpen(true);
            setCreateOrderError(null);
          }}
        >
          Create Order
        </button>
      </Reveal>

      <Reveal as="div" className="admin-kpi-grid" delay={20}>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Orders Today</p>
          <p className="admin-kpi__value">{kpi.totalToday}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Order placed</p>
          <p className="admin-kpi__value">{kpi.statusCounts["order-placed"] || 0}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Packing</p>
          <p className="admin-kpi__value">{kpi.statusCounts["packing-order"] || 0}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Ready / Completed</p>
          <p className="admin-kpi__value">{(kpi.statusCounts["order-ready-for-shipping"] || 0) + (kpi.statusCounts.completed || 0)}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Paid</p>
          <p className="admin-kpi__value">{kpi.paidCount}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Failed Payments</p>
          <p className="admin-kpi__value">{kpi.failedPayments}</p>
        </div>
      </Reveal>

      <Reveal as="div" className="admin-filters" delay={40}>
        <div className="admin-filters__left">
          <label className="admin-filters__field">
            <span>Search</span>
            <input
              className="input"
              type="search"
              placeholder="Order #, name, email, phone"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="admin-filters__field">
            <span>Status</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatOrderStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Reveal>

      <div className="admin-table__wrapper">
        {filteredOrders.length > 0 ? (
          <table className="admin-table admin-orders-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Amount</th>
                <th scope="col">Payment</th>
                <th scope="col">Order Status</th>
                <th scope="col">Delivery</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => {
                const createdAtLabel = order.createdAt?.toDate?.()
                  ? bookingDateFormatter.format(order.createdAt.toDate())
                  : "Pending";
                const total =
                  typeof order.totalPrice === "number" ?
                     order.totalPrice
                    : Number(order.totalPrice) || 0;
                const orderLabel = Number.isFinite(order.orderNumber) ?
                   `Order #${order.orderNumber}`
                  : "Order";
                const isPreordered = isPreorderedOrder(order);
                const paymentStatus = normalizePaymentStatus(order);
                const paymentMethod = normalizePaymentMethod(order);
                const paymentApprovalStatus = normalizePaymentApprovalStatus(order);
                const statusOptions = getAllowedOrderStatuses(order);
                const statusLocked = isEftBlocked(order);
                const deliveryStatus = normalizeDeliveryStatus(order);
                const deliveryLabel = deliveryStatus.replace(/-/g, " ");
                return (
                  <tr
                    key={order.id}
                    className={`admin-orders-table__row ${order.id === selectedOrderId ? "is-active" : ""}`}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <td className="admin-orders-table__order" data-label="Order">
                      <strong className="admin-orders-table__order-number">{orderLabel}</strong>
                      <p className="modal__meta">{createdAtLabel}</p>
                      <p className="modal__meta admin-orders-table__ref">Ref: {order.id}</p>
                      {order.trackingLink && (
                        <p className="modal__meta admin-orders-table__tracking">
                          <a
                            href={order.trackingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Tracking link
                          </a>
                        </p>
                      )}
                    </td>
                    <td className="admin-orders-table__customer" data-label="Customer">
                      <p>{order.customer?.fullName || "â€”"}</p>
                      <p className="modal__meta admin-orders-table__contact">
                        {order.customer?.email || "â€”"}
                      </p>
                      {order.customer?.phone && (
                        <p className="modal__meta admin-orders-table__contact">{order.customer.phone}</p>
                      )}
                    </td>
                    <td className="admin-orders-table__amount" data-label="Amount">
                      <strong>{formatPriceLabel(total)}</strong>
                    </td>
                    <td className="admin-orders-table__payment" data-label="Payment">
                      <div className="admin-orders-table__badges">
                        <span className={`admin-status admin-status--${paymentMethod}`}>
                          {paymentMethod}
                        </span>
                        <span className={`admin-status admin-status--${paymentStatus}`}>
                          {paymentStatus}
                        </span>
                      </div>
                      {paymentMethod === PAYMENT_METHODS.EFT && (
                        <div className="admin-orders-table__badges">
                          <span className={`admin-status admin-status--${paymentApprovalStatus}`}>
                            approval {paymentApprovalStatus}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="admin-orders-table__status" data-label="Order status">
                      <div className="admin-orders-table__status-wrap">
                        <select
                          className="input admin-orders-table__status-select"
                          value={normalizeOrderStatus(order.status)}
                          disabled={statusLocked}
                          onChange={(event) =>
                            handleUpdateOrderStatus(order.id, event.target.value)
                          }
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {formatOrderStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                        {statusLocked && (
                          <p className="modal__meta admin-orders-table__status-note">Awaiting EFT payment approval</p>
                        )}
                        {isPreordered && normalizeOrderStatus(order.status) === "order-placed" && (
                          <p className="modal__meta admin-orders-table__status-note">Preordered</p>
                        )}
                      </div>
                    </td>
                    <td className="admin-orders-table__delivery" data-label="Delivery">
                      <span className="modal__meta admin-orders-table__delivery-value">{deliveryLabel}</span>
                    </td>
                    <td className="admin-orders-table__actions-cell" data-label="Actions">
                      <button
                        className="btn btn--secondary"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedOrderId(order.id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="admin-panel__notice">No orders yet.</p>
        )}
        <AdminPagination
          page={ordersPage}
          total={filteredOrders.length}
          onPageChange={setOrdersPage}
          pageSize={ordersPageSize}
        />
        {inventoryLoading && <p className="modal__meta">Syncing ordersâ€¦</p>}
        {inventoryError && (
          <p className="admin-panel__error">{inventoryError}</p>
        )}
        {statusMessage && (
          <p className="admin-panel__status">{statusMessage}</p>
        )}
      </div>

      <div
        className={`modal admin-modal admin-create-order-modal ${createOrderOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={createOrderOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget && !createOrderSaving) {
            setCreateOrderOpen(false);
            resetCreateOrderForm();
          }
        }}
      >
        <div className="modal__content admin-order-create-modal">
          <button
            className="modal__close"
            type="button"
            aria-label="Close create order dialog"
            onClick={() => {
              if (createOrderSaving) return;
              setCreateOrderOpen(false);
              resetCreateOrderForm();
            }}
          >
            &times;
          </button>
          <h3 className="modal__title">Create Order On Behalf Of Customer</h3>
          <p className="modal__meta admin-order-create-lead">
            Admin-created orders default to EFT and remain pending until payment is approved by an admin.
          </p>

          <div className="admin-order-create-section">
            <div className="admin-order-create-section__head">
              <h4>Customer Details</h4>
              <p className="modal__meta">Who this order is for and where it should be delivered.</p>
            </div>
            <div className="admin-order-create-grid">
              <label>
                Full Name
                <input
                  className="input"
                  type="text"
                  autoComplete="name"
                  value={createOrderForm.customer.fullName}
                  onChange={handleCreateOrderCustomerChange("fullName")}
                  placeholder="Customer full name"
                />
              </label>
              <label>
                Email
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={createOrderForm.customer.email}
                  onChange={handleCreateOrderCustomerChange("email")}
                  placeholder="customer@email.com"
                />
              </label>
              <label>
                Phone
                <input
                  className="input"
                  type="tel"
                  autoComplete="tel"
                  value={createOrderForm.customer.phone}
                  onChange={handleCreateOrderCustomerChange("phone")}
                  placeholder="+27 ..."
                />
              </label>
              <label className="admin-order-create-grid__wide">
                Street Address
                <input
                  className="input"
                  type="text"
                  autoComplete="street-address"
                  value={createOrderForm.shippingAddress.street}
                  onChange={handleCreateOrderShippingAddressChange("street")}
                  placeholder="Street address"
                />
              </label>
              <div className="admin-order-create-grid__wide admin-order-create-address-grid checkout-address-grid">
                <label>
                  Suburb
                  <input
                    className="input"
                    type="text"
                    autoComplete="address-level3"
                    value={createOrderForm.shippingAddress.suburb}
                    onChange={handleCreateOrderShippingAddressChange("suburb")}
                    placeholder="Suburb"
                  />
                </label>
                <label>
                  City
                  <input
                    className="input"
                    type="text"
                    autoComplete="address-level2"
                    value={createOrderForm.shippingAddress.city}
                    onChange={handleCreateOrderShippingAddressChange("city")}
                    placeholder="City"
                  />
                </label>
                <label>
                  Province
                  <select
                    className="input"
                    autoComplete="address-level1"
                    value={createOrderForm.shippingAddress.province}
                    onChange={handleCreateOrderShippingAddressChange("province")}
                  >
                    <option value="">Select province</option>
                    {SA_PROVINCES.map((province) => (
                      <option key={province.value} value={province.value}>
                        {province.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Postal Code
                  <input
                    className="input"
                    type="text"
                    autoComplete="postal-code"
                    value={createOrderForm.shippingAddress.postalCode}
                    onChange={handleCreateOrderShippingAddressChange("postalCode")}
                    placeholder="0000"
                    pattern="\\d{4}"
                  />
                </label>
              </div>
              {!createOrderPostalCodeValid && createOrderForm.shippingAddress.postalCode && (
                <p className="admin-panel__error admin-order-create-grid__wide">Postal code should be 4 digits.</p>
              )}
              <div className="admin-order-create-grid__wide admin-order-create-courier">
                <h4>Courier options</h4>
                {!createOrderForm.shippingAddress.province && (
                  <p className="modal__meta">Select a province to view available couriers.</p>
                )}
                {createOrderForm.shippingAddress.province && createOrderCourierStatus === "loading" && (
                  <p className="modal__meta">Loading courier optionsâ€¦</p>
                )}
                {createOrderForm.shippingAddress.province &&
                  createOrderCourierStatus !== "loading" &&
                  createOrderAvailableCouriers.length === 0 && (
                  <p className="admin-panel__error">
                    No courier options are available for {createOrderForm.shippingAddress.province}.
                  </p>
                )}
                {createOrderAvailableCouriers.length > 0 && (
                  <div className="admin-order-create-courier-options checkout-courier-options">
                    {createOrderAvailableCouriers.map((option) => (
                      <label
                        key={option.id}
                        className={`admin-order-create-courier-option checkout-courier__option ${
                          createOrderSelectedCourierId === option.id ? "is-selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="admin-create-order-courier"
                          value={option.id}
                          checked={createOrderSelectedCourierId === option.id}
                          onChange={(event) => setCreateOrderSelectedCourierId(event.target.value)}
                        />
                        <span>{option.name}</span>
                        <strong>{formatPriceLabel(option.price)}</strong>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="admin-order-create-layout">
            <div className="admin-order-create-catalog">
              <div className="admin-order-create-toolbar">
                <div className="admin-order-create-toolbar__text">
                  <h4>Add Products</h4>
                  <p className="modal__meta">Search and add items from your product catalog.</p>
                </div>
                <span className="admin-order-create-count">
                  Showing {filteredCreateOrderProducts.length} of {createOrderCatalogProducts.length}
                </span>
              </div>
              <input
                className="input pos-search admin-order-create-search"
                type="search"
                placeholder="Search products by name, SKU, or ID"
                value={createOrderProductSearch}
                onChange={(event) => setCreateOrderProductSearch(event.target.value)}
              />
              <div className="admin-order-create-filters">
                <div className="admin-order-create-filters__grid">
                  <label className="admin-order-create-filter-field">
                    Category
                    <select
                      className="input"
                      value={createOrderFilters.categoryId}
                      onChange={handleCreateOrderFilterChange("categoryId")}
                    >
                      <option value="all">All categories</option>
                      {createOrderCategoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-order-create-filter-field">
                    Stock
                    <select
                      className="input"
                      value={createOrderFilters.stock}
                      onChange={handleCreateOrderFilterChange("stock")}
                    >
                      <option value="all">All stock</option>
                      <option value="in">In stock</option>
                      <option value="low">Low stock</option>
                      <option value="preorder">Preorder</option>
                      <option value="out">Out of stock</option>
                    </select>
                  </label>
                  <label className="admin-order-create-filter-field">
                    Min price
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={createOrderFilters.minPrice}
                      onChange={handleCreateOrderFilterChange("minPrice")}
                    />
                  </label>
                  <label className="admin-order-create-filter-field">
                    Max price
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="999.00"
                      value={createOrderFilters.maxPrice}
                      onChange={handleCreateOrderFilterChange("maxPrice")}
                    />
                  </label>
                  <label className="admin-order-create-filter-field">
                    Sort
                    <select
                      className="input"
                      value={createOrderFilters.sort}
                      onChange={handleCreateOrderFilterChange("sort")}
                    >
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="price-asc">Price (low-high)</option>
                      <option value="price-desc">Price (high-low)</option>
                    </select>
                  </label>
                </div>
                <div className="admin-order-create-filters__actions">
                  <button
                    className="btn btn--secondary btn--small"
                    type="button"
                    disabled={!hasActiveCreateOrderFilters}
                    onClick={resetCreateOrderFilters}
                  >
                    Clear filters
                  </button>
                </div>
              </div>
              {inventoryLoading && <p className="modal__meta">Loading inventory...</p>}
              {!inventoryLoading && filteredCreateOrderProducts.length === 0 && (
                <div className="empty-state admin-order-create-empty-state">
                  <p>{createOrderEmptyMessage}</p>
                  {hasActiveCreateOrderFilters && (
                    <button
                      className="btn btn--secondary btn--small"
                      type="button"
                      onClick={resetCreateOrderFilters}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
              {!inventoryLoading && filteredCreateOrderProducts.length > 0 && (
                <div className="pos-grid admin-order-create-products">
                  {filteredCreateOrderProducts.map((product) => {
                    const selection = createOrderVariantSelections[product.id] || "";
                    const selectedVariant = product.variants.find((variant) => variant.id === selection) || null;
                    const unitPrice = Number.isFinite(selectedVariant?.price) ? selectedVariant.price : product.numericPrice;
                    const priceLabel = Number.isFinite(unitPrice) ? formatPriceLabel(unitPrice) : "Price on request";
                    const isOutOfStock = product.stockStatus?.state === "out";
                    const requiresVariant = product.variants.length > 0;
                    const missingVariant = requiresVariant && !selection;
                    const addDisabled = isOutOfStock || missingVariant;
                    let disabledHint = null;
                    if (isOutOfStock) disabledHint = "Out of stock";
                    else if (missingVariant) disabledHint = "Select a variant first";
                    const cardClassName = addDisabled
                      ? "pos-item-card admin-order-create-product-card admin-order-create-product-card--disabled"
                      : "pos-item-card admin-order-create-product-card admin-order-create-product-card--interactive";
                    const isInteractiveCardTarget = (target) =>
                      !!target &&
                      typeof target.closest === "function" &&
                      Boolean(target.closest("button, input, select, textarea, label, a"));
                    return (
                      <article
                        className={cardClassName}
                        key={product.id}
                        onClick={(event) => {
                          if (addDisabled || isInteractiveCardTarget(event.target)) return;
                          handleAddCatalogProductToOrder(product);
                        }}
                        onKeyDown={(event) => {
                          if (addDisabled || isInteractiveCardTarget(event.target)) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleAddCatalogProductToOrder(product);
                          }
                        }}
                        role={addDisabled ? undefined : "button"}
                        tabIndex={addDisabled ? undefined : 0}
                        aria-disabled={addDisabled ? "true" : undefined}
                        aria-label={addDisabled ? undefined : `Add ${product.name} to order`}
                      >
                        <div>
                          <h4>{product.name}</h4>
                          <p className="modal__meta">{priceLabel}</p>
                          {product.sku && <p className="modal__meta">SKU: {product.sku}</p>}
                          {product.stockStatus && (
                            <span className={`badge badge--stock-${product.stockStatus.state}`}>
                              {product.stockStatus.label}
                            </span>
                          )}
                          {product.variants.length > 0 && (
                            <label className="modal__meta pos-item-card__field">
                              Variant
                              <select
                                className="input"
                                value={selection}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  setCreateOrderVariantSelections((prev) => ({
                                    ...prev,
                                    [product.id]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Select variant</option>
                                {product.variants.map((variant) => (
                                  <option key={variant.id} value={variant.id}>
                                    {variant.label}
                                    {Number.isFinite(variant.price) ? ` - ${formatPriceLabel(variant.price)}` : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                        <div className="admin-order-create-product-actions">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            disabled={addDisabled}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleAddCatalogProductToOrder(product);
                            }}
                          >
                            Add
                          </button>
                          {disabledHint && <p className="modal__meta admin-order-create-product-hint">{disabledHint}</p>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="admin-order-create-summary">
              <div className="pos-cart__panel admin-order-create-cart">
                <div className="admin-order-create-toolbar">
                  <div className="admin-order-create-toolbar__text">
                    <h4>Order Items</h4>
                    <p className="modal__meta">Review quantities before creating the order.</p>
                  </div>
                  <span className="admin-order-create-count">
                    {(createOrderForm.items || []).length} line
                    {(createOrderForm.items || []).length === 1 ? "" : "s"}
                  </span>
                </div>
                {(createOrderForm.items || []).length === 0 ? (
                  <p className="empty-state">Add products to start this order.</p>
                ) : (
                  <ul className="pos-cart__list admin-order-create-cart-list">
                    {(createOrderForm.items || []).map((item) => {
                      const itemKey = item.key || item.id;
                      return (
                        <li key={itemKey} className="pos-cart__item">
                          <div className="pos-cart__row">
                            <div className="pos-cart__info">
                              <p className="pos-cart__name">{item.name}</p>
                              <div className="pos-cart__meta">
                                {item.metadata?.variantLabel && (
                                  <span>Variant: {item.metadata.variantLabel}</span>
                                )}
                                <span>Unit: {formatPriceLabel(item.price)}</span>
                              </div>
                            </div>
                            <div className="pos-cart__line-total">
                              {formatPriceLabel((Number(item.price) || 0) * (Number(item.quantity) || 0))}
                            </div>
                          </div>
                          <div className="pos-cart__controls">
                            <div className="pos-cart__field">
                              <span className="pos-cart__label">Qty</span>
                              <div className="pos-cart__stepper">
                                <button
                                  className="pos-cart__stepper-btn"
                                  type="button"
                                  onClick={() => adjustCreateOrderCartQuantity(itemKey, -1)}
                                  aria-label={`Decrease ${item.name} quantity`}
                                >
                                  -
                                </button>
                                <input
                                  className="input pos-cart__input"
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(event) =>
                                    handleCreateOrderCartQuantityChange(itemKey, event.target.value)
                                  }
                                />
                                <button
                                  className="pos-cart__stepper-btn"
                                  type="button"
                                  onClick={() => adjustCreateOrderCartQuantity(itemKey, 1)}
                                  aria-label={`Increase ${item.name} quantity`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <button
                              className="btn btn--secondary btn--small"
                              type="button"
                              onClick={() => removeCreateOrderCartItem(itemKey)}
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="admin-order-create__totals">
                <p className="modal__meta admin-order-create-total-row">
                  <span>Courier</span>
                  <strong>{createOrderSelectedCourier ? createOrderSelectedCourier.name : "Select a courier"}</strong>
                </p>
                <p className="modal__meta admin-order-create-total-row">
                  <span>Subtotal</span>
                  <strong>{formatPriceLabel(createOrderPricing.subtotal)}</strong>
                </p>
                <p className="modal__meta admin-order-create-total-row">
                  <span>Shipping</span>
                  <strong>
                    {createOrderSelectedCourier ? formatPriceLabel(createOrderPricing.shippingCost) : "Select a courier"}
                  </strong>
                </p>
                <p className="modal__meta admin-order-create-total-row admin-order-create-total-row--final">
                  <span>Total</span>
                  <strong>{formatPriceLabel(createOrderPricing.totalPrice)}</strong>
                </p>
                <p className="modal__meta">Payment method: EFT (pending admin approval)</p>
              </div>

              {createOrderError && <p className="admin-panel__error">{createOrderError}</p>}

              <div className="admin-modal__actions admin-order-create-actions">
                <button
                  className="btn btn--secondary"
                  type="button"
                  disabled={createOrderSaving}
                  onClick={() => {
                    setCreateOrderOpen(false);
                    resetCreateOrderForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={createOrderSaving}
                  onClick={handleCreateAdminOrder}
                >
                  {createOrderSaving ? "Creating..." : "Create EFT Order"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`modal order-detail-modal ${selectedOrder ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={selectedOrder ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedOrderId(null);
          }
        }}
      >
        {selectedOrder && (
          <div className="modal__content admin-order-detail">
            <button
              className="modal__close"
              type="button"
              aria-label="Close order details"
              onClick={() => setSelectedOrderId(null)}
            >
              &times;
            </button>
            <div className="admin-order-detail__header">
              <div>
                <p className="modal__meta">Ref: {selectedOrder.id}</p>
                <h3>
                  {Number.isFinite(selectedOrder.orderNumber) ?
                     `Order #${selectedOrder.orderNumber}`
                    : "Order"}
                </h3>
                <p className="modal__meta">
                  {selectedOrder.createdAt?.toDate?.()
                    ? bookingDateFormatter.format(selectedOrder.createdAt.toDate())
                    : "Pending"}
                </p>
              </div>
              <div className="admin-order-detail__chips">
                <span className={`admin-status admin-status--${selectedPaymentMethod}`}>
                  Method: {selectedPaymentMethod}
                </span>
                <span className={`admin-status admin-status--${selectedPaymentStatus}`}>
                  Payment: {selectedPaymentStatus}
                </span>
                {selectedPaymentMethod === PAYMENT_METHODS.EFT && (
                  <span className={`admin-status admin-status--${selectedPaymentApprovalStatus}`}>
                    Approval: {selectedPaymentApprovalStatus}
                  </span>
                )}
                <span className="admin-status">
                  Delivery: {normalizeDeliveryStatus(selectedOrder).replace(/-/g, " ")}
                </span>
                <span className="admin-status">Status: {getOrderStatusLabel(selectedOrder)}</span>
              </div>
            </div>

            <div className="admin-order-detail__top-actions">
              <label className="admin-order-detail__top-action admin-order-detail__top-action--status">
                <span>Order status</span>
                <select
                  className="input"
                  value={normalizeOrderStatus(selectedOrder.status)}
                  disabled={selectedStatusLocked}
                  onChange={(event) =>
                    handleUpdateOrderStatus(selectedOrder.id, event.target.value)
                  }
                >
                  {selectedStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatOrderStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() =>
                  setPendingStatusUpdate({
                    orderId: selectedOrder.id,
                    status: normalizeOrderStatus(selectedOrder.status),
                    existingLink: selectedOrder.trackingLink || "",
                  })
                }
              >
                {selectedOrder.trackingLink ? "Update Tracking" : "Add Tracking"}
              </button>
              {selectedPaymentMethod === PAYMENT_METHODS.EFT ? (
                <>
                  {selectedPaymentApprovalStatus === PAYMENT_APPROVAL_STATUSES.PENDING && (
                    <>
                      <button
                        className="btn btn--primary"
                        type="button"
                        disabled={eftReviewLoading}
                        onClick={() => handleReviewEftPayment(selectedOrder, "approve")}
                      >
                        {eftReviewLoading ? "Working..." : "Approve Payment"}
                      </button>
                      <button
                        className="btn btn--secondary"
                        type="button"
                        disabled={eftReviewLoading}
                        onClick={() => handleReviewEftPayment(selectedOrder, "reject")}
                      >
                        {eftReviewLoading ? "Working..." : "Reject Payment"}
                      </button>
                    </>
                  )}
                  {selectedPaymentApprovalStatus === PAYMENT_APPROVAL_STATUSES.APPROVED && (
                    <span className="admin-status admin-status--approved">Payment approved</span>
                  )}
                  {selectedPaymentApprovalStatus === PAYMENT_APPROVAL_STATUSES.REJECTED && (
                    <span className="admin-status admin-status--rejected">Payment rejected</span>
                  )}
                </>
              ) : (
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={paymentUpdating}
                  onClick={() => handleMarkPaymentReceived(selectedOrder)}
                >
                  {paymentUpdating ? "Updating..." : "Mark Payment Received"}
                </button>
              )}
              <button
                className="btn btn--secondary"
                type="button"
                disabled={deliverySaving}
                onClick={handleSaveDelivery}
              >
                {deliverySaving ? "Saving..." : "Save Delivery"}
              </button>
            </div>
            {selectedStatusLocked && (
              <p className="modal__meta admin-order-detail__top-warning">
                EFT payment must be approved before fulfilment.
              </p>
            )}
            {deliveryPreview?.paymentAdjustmentRequired && (
              <p className="modal__meta admin-order-email-status__error">
                Paid order total will change by {formatPriceLabel(deliveryPreview.delta)} and require payment review.
              </p>
            )}

            <div
              className="admin-order-detail__tabs"
              role="tablist"
              aria-label="Order detail sections"
              onKeyDown={handleOrderDetailTabKeyDown}
            >
              {ORDER_DETAIL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`admin-order-detail-tab-${tab.id}`}
                  className={`admin-order-detail__tab ${activeOrderDetailTab === tab.id ? "is-active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={activeOrderDetailTab === tab.id ? "true" : "false"}
                  aria-controls={`admin-order-detail-panel-${tab.id}`}
                  onClick={() => setActiveOrderDetailTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeOrderDetailTab === "overview" && (
              <div
                id="admin-order-detail-panel-overview"
                role="tabpanel"
                aria-labelledby="admin-order-detail-tab-overview"
                className="admin-order-detail__tabpanel"
              >
                <section className="admin-order-detail__key-overview" aria-label="Important order details">
                  <h4>Important details</h4>
                  <div className="admin-order-detail__key-strip">
                    <article className="admin-order-detail__key-card admin-order-detail__key-card--total">
                      <p className="admin-order-detail__key-label">Total</p>
                      <p className="admin-order-detail__key-value admin-order-detail__key-value--total">
                        {formatPriceLabel(selectedOrder.totalPrice)}
                      </p>
                    </article>
                    <article className="admin-order-detail__key-card">
                      <p className="admin-order-detail__key-label">Customer</p>
                      <p className="admin-order-detail__key-value">
                        {selectedOrder.customer?.fullName || "-"}
                      </p>
                    </article>
                    <article className="admin-order-detail__key-card">
                      <p className="admin-order-detail__key-label">Email</p>
                      <p className="admin-order-detail__key-value">
                        {selectedOrder.customer?.email || "-"}
                      </p>
                    </article>
                    <article className="admin-order-detail__key-card">
                      <p className="admin-order-detail__key-label">Phone</p>
                      <p className="admin-order-detail__key-value">
                        {selectedOrder.customer?.phone || "-"}
                      </p>
                    </article>
                    <article className="admin-order-detail__key-card">
                      <p className="admin-order-detail__key-label">Order status</p>
                      <p className="admin-order-detail__key-value">
                        {getOrderStatusLabel(selectedOrder)}
                      </p>
                    </article>
                    <article className="admin-order-detail__key-card">
                      <p className="admin-order-detail__key-label">Payment status</p>
                      <p className="admin-order-detail__key-value">
                        {selectedPaymentStatus}
                      </p>
                    </article>
                  </div>
                </section>
                <div className="admin-order-detail__section-grid">
                  <section className="admin-order-detail__section-card">
                    <h4>Customer</h4>
                    <p>{selectedOrder.customer?.fullName || "-"}</p>
                    <p className="modal__meta">{selectedOrder.customer?.email || "-"}</p>
                    {selectedOrder.customer?.phone && <p className="modal__meta">{selectedOrder.customer.phone}</p>}
                    {shippingAddressLabel && <p className="modal__meta">{shippingAddressLabel}</p>}
                  </section>
                  <section className="admin-order-detail__section-card">
                    <h4>Payment</h4>
                    <p className="modal__meta">Method: {selectedPaymentMethod}</p>
                    <p className="modal__meta">Status: {selectedPaymentStatus}</p>
                    {Number.isFinite(selectedOrder.subtotal) && (
                      <p className="modal__meta">Subtotal: {formatPriceLabel(selectedOrder.subtotal)}</p>
                    )}
                    {Number.isFinite(selectedOrder.shippingCost) && (
                      <p className="modal__meta">Shipping: {formatPriceLabel(selectedOrder.shippingCost)}</p>
                    )}
                    <p className="modal__meta">Total: {formatPriceLabel(selectedOrder.totalPrice)}</p>
                    {selectedPayfast.paymentReference && (
                      <p className="modal__meta">Reference: {selectedPayfast.paymentReference}</p>
                    )}
                    {selectedPayfast.paymentId && (
                      <p className="modal__meta">PayFast ID: {selectedPayfast.paymentId}</p>
                    )}
                  </section>
                  <section className="admin-order-detail__section-card">
                    <h4>Delivery</h4>
                    <p className="modal__meta">
                      Method: {(selectedOrder.deliveryMethod || "company").toString().toLowerCase()}
                    </p>
                    {selectedShipping.courierName && (
                      <p className="modal__meta">Courier: {selectedShipping.courierName}</p>
                    )}
                    {selectedShipping.province && (
                      <p className="modal__meta">Province: {selectedShipping.province}</p>
                    )}
                    {selectedOrder.trackingLink ? (
                      <a
                        href={selectedOrder.trackingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="modal__meta"
                      >
                        Tracking link
                      </a>
                    ) : (
                      <p className="modal__meta">No tracking link yet</p>
                    )}
                    {shippingAddressLabel && (
                      <p className="modal__meta">Ship to: {shippingAddressLabel}</p>
                    )}
                  </section>
                </div>
                <section className="admin-order-detail__section-card">
                  <h4>Items</h4>
                  <ul className="order-items">
                    {(selectedOrder.items || []).map((item) => (
                      <li key={`${selectedOrder.id}-${item.id}`}>
                        <strong>{item.name}</strong> x{item.quantity || 1}
                        <span className="modal__meta">{formatPriceLabel(item.price)}</span>
                        {item.metadata?.type === "workshop" && (
                          <span className="modal__meta">
                            {item.metadata?.sessionDayLabel ||
                              item.metadata?.sessionLabel ||
                              "Session"}{" "}
                            - {item.metadata?.attendeeCount || 1} attendee(s)
                          </span>
                        )}
                        {item.metadata?.type === "product" && item.metadata?.variantLabel && (
                          <span className="modal__meta">
                            Variant: {item.metadata.variantLabel}
                          </span>
                        )}
                        {item.metadata?.type === "product" &&
                          (item.metadata?.preorderSendMonth || item.metadata?.preorderSendMonthLabel) && (
                            <span className="modal__meta">
                              Send month:{" "}
                              {item.metadata.preorderSendMonthLabel ||
                                formatPreorderSendMonth(item.metadata.preorderSendMonth) ||
                                item.metadata.preorderSendMonth}
                            </span>
                          )}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {activeOrderDetailTab === "customer-info" && (
              <div
                id="admin-order-detail-panel-customer-info"
                role="tabpanel"
                aria-labelledby="admin-order-detail-tab-customer-info"
                className="admin-order-detail__tabpanel"
              >
                <div className="admin-order-detail__section-grid admin-order-detail__section-grid--two">
                  <section className="admin-order-detail__section-card">
                    <h4>Customer details</h4>
                    <p>{selectedOrder.customer?.fullName || "-"}</p>
                    <p className="modal__meta">{selectedOrder.customer?.email || "-"}</p>
                    <p className="modal__meta">{selectedOrder.customer?.phone || "-"}</p>
                  </section>
                  <section className="admin-order-detail__section-card">
                    <h4>Address on order</h4>
                    {shippingAddressLabel ? (
                      <p className="modal__meta">{shippingAddressLabel}</p>
                    ) : (
                      <p className="modal__meta">No delivery address on file.</p>
                    )}
                    {selectedShipping.courierName && (
                      <p className="modal__meta">Courier: {selectedShipping.courierName}</p>
                    )}
                    {selectedShipping.province && (
                      <p className="modal__meta">Province: {selectedShipping.province}</p>
                    )}
                    <p className="modal__meta">
                      Delivery method: {(selectedOrder.deliveryMethod || "company").toString().toLowerCase()}
                    </p>
                  </section>
                </div>
              </div>
            )}

            {activeOrderDetailTab === "order-info" && (
              <div
                id="admin-order-detail-panel-order-info"
                role="tabpanel"
                aria-labelledby="admin-order-detail-tab-order-info"
                className="admin-order-detail__tabpanel"
              >
                <div className="admin-order-detail__section-grid">
                  <section className="admin-order-detail__section-card">
                    <h4>Order summary</h4>
                    <p className="modal__meta">
                      Order #:{" "}
                      {Number.isFinite(selectedOrder.orderNumber)
                        ? `#${selectedOrder.orderNumber}`
                        : selectedOrder.id}
                    </p>
                    <p className="modal__meta">
                      Placed:{" "}
                      {selectedOrder.createdAt?.toDate?.()
                        ? bookingDateFormatter.format(selectedOrder.createdAt.toDate())
                        : "Pending"}
                    </p>
                    <p className="modal__meta">Order status: {getOrderStatusLabel(selectedOrder)}</p>
                    <p className="modal__meta">Payment method: {selectedPaymentMethod}</p>
                    <p className="modal__meta">Payment status: {selectedPaymentStatus}</p>
                  </section>
                  <section className="admin-order-detail__section-card">
                    <h4>Payment</h4>
                    {Number.isFinite(selectedOrder.subtotal) && (
                      <p className="modal__meta">Subtotal: {formatPriceLabel(selectedOrder.subtotal)}</p>
                    )}
                    {Number.isFinite(selectedOrder.shippingCost) && (
                      <p className="modal__meta">Shipping: {formatPriceLabel(selectedOrder.shippingCost)}</p>
                    )}
                    <p className="modal__meta">Total: {formatPriceLabel(selectedOrder.totalPrice)}</p>
                    {selectedPayfast.paymentReference && (
                      <p className="modal__meta">Reference: {selectedPayfast.paymentReference}</p>
                    )}
                    {selectedPayfast.paymentId && (
                      <p className="modal__meta">PayFast ID: {selectedPayfast.paymentId}</p>
                    )}
                    {selectedOrder.paymentProof?.storagePath && (
                      <p className="modal__meta">
                        Proof:{" "}
                        {paymentProofUrlLoading ? (
                          "Loading..."
                        ) : paymentProofUrl ? (
                          <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer">
                            View proof
                          </a>
                        ) : (
                          "Unavailable"
                        )}
                      </p>
                    )}
                  </section>
                  <section className="admin-order-detail__section-card">
                    <h4>Delivery summary</h4>
                    {selectedShipping.courierName && (
                      <p className="modal__meta">Courier: {selectedShipping.courierName}</p>
                    )}
                    {selectedShipping.province && (
                      <p className="modal__meta">Province: {selectedShipping.province}</p>
                    )}
                    {selectedOrder.trackingLink ? (
                      <a
                        href={selectedOrder.trackingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="modal__meta"
                      >
                        Tracking link
                      </a>
                    ) : (
                      <p className="modal__meta">No tracking link yet</p>
                    )}
                    {shippingAddressLabel && (
                      <p className="modal__meta">Ship to: {shippingAddressLabel}</p>
                    )}
                  </section>
                </div>
                <section className="admin-order-detail__section-card">
                  <h4>Items</h4>
                  <ul className="order-items">
                    {(selectedOrder.items || []).map((item) => (
                      <li key={`${selectedOrder.id}-${item.id}`}>
                        <strong>{item.name}</strong> x{item.quantity || 1}
                        <span className="modal__meta">{formatPriceLabel(item.price)}</span>
                        {item.metadata?.type === "workshop" && (
                          <span className="modal__meta">
                            {item.metadata?.sessionDayLabel ||
                              item.metadata?.sessionLabel ||
                              "Session"}{" "}
                            - {item.metadata?.attendeeCount || 1} attendee(s)
                          </span>
                        )}
                        {item.metadata?.type === "product" && item.metadata?.variantLabel && (
                          <span className="modal__meta">
                            Variant: {item.metadata.variantLabel}
                          </span>
                        )}
                        {item.metadata?.type === "product" &&
                          (item.metadata?.preorderSendMonth || item.metadata?.preorderSendMonthLabel) && (
                            <span className="modal__meta">
                              Send month:{" "}
                              {item.metadata.preorderSendMonthLabel ||
                                formatPreorderSendMonth(item.metadata.preorderSendMonth) ||
                                item.metadata.preorderSendMonth}
                            </span>
                          )}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {activeOrderDetailTab === "delivery" && (
              <div
                id="admin-order-detail-panel-delivery"
                role="tabpanel"
                aria-labelledby="admin-order-detail-tab-delivery"
                className="admin-order-detail__tabpanel"
              >
              <section className="admin-order-detail__section-card">
                <h4>Delivery details</h4>
                <div className="admin-order-detail__actions-grid">
                  <label>
                    Delivery Method
                    <select
                      className="input"
                      value={deliveryMethod}
                      onChange={(event) => setDeliveryMethod(event.target.value)}
                    >
                      {DELIVERY_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </label>
                  {deliveryMethod === "courier" && (
                    <label>
                      Courier
                      <select
                        className="input"
                        value={deliveryCourierId}
                        onChange={(event) => setDeliveryCourierId(event.target.value)}
                      >
                        <option value="">Select courier</option>
                        {deliveryAvailableCouriers.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} ({formatPriceLabel(option.price)})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="admin-order-detail__wide">
                    Street address
                    <input
                      className="input"
                      type="text"
                      value={deliveryAddressForm.street}
                      onChange={handleDeliveryAddressChange("street")}
                      placeholder="Street address"
                    />
                  </label>
                  <label>
                    Suburb
                    <input
                      className="input"
                      type="text"
                      value={deliveryAddressForm.suburb}
                      onChange={handleDeliveryAddressChange("suburb")}
                      placeholder="Suburb"
                    />
                  </label>
                  <label>
                    City
                    <input
                      className="input"
                      type="text"
                      value={deliveryAddressForm.city}
                      onChange={handleDeliveryAddressChange("city")}
                      placeholder="City"
                    />
                  </label>
                  <label>
                    Province
                    <select
                      className="input"
                      value={deliveryAddressForm.province}
                      onChange={handleDeliveryAddressChange("province")}
                    >
                      <option value="">Select province</option>
                      {SA_PROVINCES.map((provinceOption) => (
                        <option key={provinceOption.value} value={provinceOption.value}>
                          {provinceOption.value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Postal code
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={deliveryAddressForm.postalCode}
                      onChange={handleDeliveryAddressChange("postalCode")}
                      placeholder="0000"
                    />
                  </label>
                  <label className="admin-order-detail__wide">
                    Tracking Link (optional)
                    <input
                      className="input"
                      type="url"
                      value={trackingInput}
                      onChange={(event) => setTrackingInput(event.target.value)}
                      placeholder="https://courier.example/track/123"
                    />
                  </label>
                </div>
                {deliveryPreview && (
                  <div className="admin-order-email-status">
                    <p className="modal__meta">
                      <strong>Delivery totals preview:</strong> Shipping {formatPriceLabel(deliveryPreview.previousShippingCost)} {"->"}{" "}
                      {deliveryPreview.canResolveNewShippingCost
                        ? formatPriceLabel(deliveryPreview.nextShippingCost)
                        : "Select courier"}{" "}
                      | Total {formatPriceLabel(deliveryPreview.previousTotal)} {"->"}{" "}
                      {formatPriceLabel(deliveryPreview.nextTotal)}
                    </p>
                    {deliveryMethod === "courier" &&
                      !deliveryPreview.canResolveNewShippingCost &&
                      deliveryProvince && (
                        <p className="modal__meta admin-order-email-status__warning">
                          No active courier pricing is available for {deliveryProvince}.
                        </p>
                      )}
                    {deliveryPreview.paymentAdjustmentRequired && (
                      <p className="modal__meta admin-order-email-status__error">
                        Paid order total will change by {formatPriceLabel(deliveryPreview.delta)} and require payment review.
                      </p>
                    )}
                  </div>
                )}
                <p className="modal__meta admin-order-detail__save-hint">
                  Use "Save Delivery" in the top action bar to apply delivery changes.
                </p>
              </section>
              </div>
            )}

            {activeOrderDetailTab === "communication" && (
              <div
                id="admin-order-detail-panel-communication"
                role="tabpanel"
                aria-labelledby="admin-order-detail-tab-communication"
                className="admin-order-detail__tabpanel"
              >
              <section className="admin-order-detail__section-card">
                <h4>Customer communication</h4>
                <div className="admin-order-detail__actions-row">
                  <button
                    className="btn btn--secondary"
                    type="button"
                    disabled={deliveryUpdateEmailSending || !selectedOrder?.customer?.email}
                    onClick={handleSendDeliveryUpdateEmail}
                  >
                    {deliveryUpdateEmailSending ? "Sending..." : "Send Delivery Update Email"}
                  </button>
                  <button
                    className="btn btn--secondary"
                    type="button"
                    disabled={resendOrderEmailSending}
                    onClick={handleResendOrderConfirmationEmail}
                  >
                    {resendOrderEmailSending ? "Sending..." : "Resend Order Email"}
                  </button>
                </div>
                <div className="admin-order-email-status">
                  <p className="modal__meta">
                    <strong>Order email:</strong>{" "}
                    {selectedOrderEmailStatusLabel}
                    {selectedOrderEmailStatus !== "unknown" ? ` (${selectedOrderEmailTemplateLabel})` : ""}
                  </p>
                  {selectedOrderEmailAttemptedAtLabel && (
                    <p className="modal__meta">
                      Last attempt: {selectedOrderEmailAttemptedAtLabel}
                      {selectedOrderEmailLastAttemptSource ? ` via ${selectedOrderEmailLastAttemptSource}` : ""}
                    </p>
                  )}
                  {selectedOrderEmailError && (
                    <p className="modal__meta admin-order-email-status__error">
                      Details: {selectedOrderEmailError}
                    </p>
                  )}
                  {selectedOrderEmailNeedsRetry && (
                    <p className="modal__meta admin-order-email-status__warning">
                      Customer may not have received the order email yet. Use "Resend Order Email".
                    </p>
                  )}
                  {selectedPaymentAdjustment?.required && (
                    <p className="modal__meta admin-order-email-status__warning">
                      Payment review needed: order total changed after delivery update.
                    </p>
                  )}
                </div>
                {isPreorderedOrder(selectedOrder) && (
                  <div className="admin-order-detail__actions-row">
                    <label>
                      Pre-order send month
                      <input
                        className="input"
                        type="month"
                        value={preorderNoticeMonth}
                        onChange={(event) => setPreorderNoticeMonth(event.target.value)}
                      />
                    </label>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={preorderNoticeSending}
                      onClick={handleSendPreorderNoticeEmail}
                    >
                      {preorderNoticeSending ? "Sending..." : "Send Pre-order Notice"}
                    </button>
                  </div>
                )}
                <details className="admin-order-detail__advanced">
                  <summary>Advanced diagnostics</summary>
                  <div className="admin-order-detail__advanced-body">
                    {selectedPayfast.gatewayResponse && (
                      <p className="modal__meta">
                        Gateway: {selectedPayfast.gatewayResponse} - Amount verified:{" "}
                        {selectedPayfast.validatedWithGateway ? "yes" : "no"}
                      </p>
                    )}
                    {selectedPayfast.paymentReference && (
                      <p className="modal__meta">Gateway reference: {selectedPayfast.paymentReference}</p>
                    )}
                    {selectedPayfast.paymentId && (
                      <p className="modal__meta">Gateway payment ID: {selectedPayfast.paymentId}</p>
                    )}
                    <p className="modal__meta">Internal order ID: {selectedOrder.id}</p>
                  </div>
                </details>
              </section>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className={`modal ${pendingStatusUpdate ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={pendingStatusUpdate ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setPendingStatusUpdate(null);
            setTrackingInput("");
          }
        }}
      >
        <div className="modal__content" style={{ maxWidth: "480px" }}>
          <button
            className="modal__close"
            type="button"
            onClick={() => {
              setPendingStatusUpdate(null);
              setTrackingInput("");
            }}
            aria-label="Close tracking dialog"
          >
            &times;
          </button>
          <h3 className="modal__title">Add Tracking Link</h3>
          <p className="modal__meta">
            Include a tracking link so your customer can follow their delivery.
            Leave blank if you will share it later.
          </p>
          <label>
            Tracking link
            <input
              ref={trackingInputRef}
              className="input"
              type="url"
              value={trackingInput}
              onChange={(event) => setTrackingInput(event.target.value)}
              placeholder="https://courier.example/track/123"
            />
          </label>
          <div className="admin-modal__actions">
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => {
                setPendingStatusUpdate(null);
                setTrackingInput("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                if (!pendingStatusUpdate) return;
                handleUpdateOrderStatus(
                  pendingStatusUpdate.orderId,
                  pendingStatusUpdate.status,
                  trackingInput
                );
              }}
            >
              Save Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminShippingView() {
  usePageMetadata({
    title: "Admin Â· Shipping & Courier",
    description: "Configure courier options and province-based delivery costs.",
  });
  const { inventoryEnabled } = useAdminData();
  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);
  const { items: courierOptions = [], status, error } = useFirestoreCollection("courierOptions", {
    orderByField: "createdAt",
    orderDirection: "desc",
    fallback: [],
  });
  const [drafts, setDrafts] = useState({});
  const [newCourier, setNewCourier] = useState({ name: "", isActive: true });
  const [isCreateCourierDialogOpen, setCreateCourierDialogOpen] = useState(false);
  const [expandedCourierIds, setExpandedCourierIds] = useState({});
  const [statusMessage, setStatusMessage] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      courierOptions.forEach((option) => {
        if (next[option.id]) return;
        const provinceDraft = {};
        SA_PROVINCES.forEach(({ value }) => {
          const config = option.provinces?.[value] || {};
          provinceDraft[value] = {
            isAvailable: Boolean(config.isAvailable),
            price: Number.isFinite(config.price) ? config.price.toString() : "",
          };
        });
        next[option.id] = {
          name: option.name || "",
          isActive: option.isActive ?? true,
          provinces: provinceDraft,
        };
      });

      Object.keys(next).forEach((key) => {
        if (!courierOptions.some((option) => option.id === key)) {
          delete next[key];
        }
      });
      return next;
    });
  }, [courierOptions]);

  useEffect(() => {
    setExpandedCourierIds((prev) => {
      const next = {};
      courierOptions.forEach((option, index) => {
        if (Object.prototype.hasOwnProperty.call(prev, option.id)) {
          next[option.id] = Boolean(prev[option.id]);
        } else {
          next[option.id] = index === 0;
        }
      });
      return next;
    });
  }, [courierOptions]);

  const handleDraftChange = (id, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleProvinceChange = (id, province, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        provinces: {
          ...(prev[id].provinces || {}),
          [province]: {
            ...(prev[id].provinces?.[province] || {}),
            [field]: value,
          },
        },
      },
    }));
  };

  const handleToggleCourierExpanded = (id) => {
    setExpandedCourierIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const buildProvincePayload = (draft) => {
    const payload = {};
    const errors = [];
    SA_PROVINCES.forEach(({ value }) => {
      const provinceDraft = draft.provinces?.[value] || {};
      const isAvailable = Boolean(provinceDraft.isAvailable);
      const priceValue = Number.parseFloat(provinceDraft.price);
      if (isAvailable && !Number.isFinite(priceValue)) {
        errors.push(`${value} requires a price.`);
      }
      payload[value] = {
        isAvailable,
        price: Number.isFinite(priceValue) ? priceValue : 0,
      };
    });
    return { payload, errors };
  };

  const handleSaveCourier = async (id) => {
    if (!db || !inventoryEnabled) return;
    const draft = drafts[id];
    if (!draft.name.trim()) {
      setStatusMessage("Courier name is required.");
      return;
    }
    const { payload, errors } = buildProvincePayload(draft);
    if (errors.length) {
      setStatusMessage(errors[0]);
      return;
    }
    setSavingId(id);
    try {
      await updateDoc(doc(db, "courierOptions", id), {
        name: draft.name.trim(),
        isActive: Boolean(draft.isActive),
        provinces: payload,
        updatedAt: serverTimestamp(),
      });
      setStatusMessage("Courier option updated.");
    } catch (saveError) {
      setStatusMessage(saveError.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateCourier = async (event) => {
    event?.preventDefault?.();
    if (!db || !inventoryEnabled) return;
    if (!newCourier.name.trim()) {
      setStatusMessage("Courier name is required.");
      return;
    }
    const payload = {};
    SA_PROVINCES.forEach(({ value }) => {
      payload[value] = { isAvailable: false, price: 0 };
    });
    setSavingId("new");
    try {
      await addDoc(collection(db, "courierOptions"), {
        name: newCourier.name.trim(),
        isActive: Boolean(newCourier.isActive),
        provinces: payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewCourier({ name: "", isActive: true });
      setStatusMessage("Courier option created.");
      setCreateCourierDialogOpen(false);
    } catch (saveError) {
      setStatusMessage(saveError.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteCourier = async () => {
    if (!db || !inventoryEnabled || !deleteTarget) return;
    setSavingId(deleteTarget);
    try {
      await deleteDoc(doc(db, "courierOptions", deleteTarget));
      setStatusMessage("Courier option removed.");
      setDeleteTarget(null);
    } catch (deleteError) {
      setStatusMessage(deleteError.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="admin-panel">
      <Reveal as="section" className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <h2>Shipping & Courier</h2>
            <p className="admin-panel__note">
              Configure courier options with province-specific pricing and availability.
            </p>
          </div>
          <div className="admin-panel__header-actions">
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                setNewCourier({ name: "", isActive: true });
                setCreateCourierDialogOpen(true);
              }}
              disabled={!inventoryEnabled || savingId === "new"}
            >
              Create new shipping method
            </button>
          </div>
        </div>

        <div className="admin-session-panel">
          <h3>Courier options</h3>
          {status === "loading" && <p className="modal__meta">Loading courier optionsâ€¦</p>}
          {error && <p className="admin-panel__error">{error.message}</p>}
          {courierOptions.length === 0 ? (
            <p className="admin-panel__notice">No courier options configured yet.</p>
          ) : (
            <div className="admin-shipping-grid">
              {courierOptions.map((option) => {
                const draft = drafts[option.id];
                if (!draft) return null;
                const isExpanded = expandedCourierIds[option.id] ?? true;
                const activeProvinceCount = SA_PROVINCES.filter(
                  (province) => draft.provinces?.[province.value]?.isAvailable
                ).length;
                return (
                  <div key={option.id} className="admin-detail-card">
                    <div className="admin-form__section-header admin-shipping-card__header">
                      <div>
                        <h4>{option.name || "Courier option"}</h4>
                        {!isExpanded && (
                          <p className="modal__meta admin-shipping-card__summary">
                            {activeProvinceCount} province{activeProvinceCount === 1 ? "" : "s"} available
                          </p>
                        )}
                      </div>
                      <div className="admin-shipping-card__header-actions">
                        <button
                          className="btn btn--secondary btn--small"
                          type="button"
                          onClick={() => handleToggleCourierExpanded(option.id)}
                        >
                          {isExpanded ? "Collapse" : "Expand"}
                        </button>
                        <label className="admin-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.isActive)}
                            onChange={(event) =>
                              handleDraftChange(option.id, "isActive", event.target.checked)
                            }
                          />
                          Active
                        </label>
                      </div>
                    </div>
                    {isExpanded && (
                      <>
                        <label className="admin-form__field">
                          Display name
                          <input
                            className="input"
                            type="text"
                            value={draft.name}
                            onChange={(event) =>
                              handleDraftChange(option.id, "name", event.target.value)
                            }
                          />
                        </label>
                        <div className="admin-shipping-provinces">
                          {SA_PROVINCES.map((province) => {
                            const provinceDraft = draft.provinces?.[province.value] || {};
                            return (
                              <div key={`${option.id}-${province.value}`} className="admin-shipping-row">
                                <span>{province.label}</span>
                                <label className="admin-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(provinceDraft.isAvailable)}
                                    onChange={(event) =>
                                      handleProvinceChange(
                                        option.id,
                                        province.value,
                                        "isAvailable",
                                        event.target.checked,
                                      )
                                    }
                                  />
                                  Available
                                </label>
                                <label className="admin-form__field admin-form__field--price">
                                  Price (ZAR)
                                  <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={provinceDraft.price}
                                    onChange={(event) =>
                                      handleProvinceChange(
                                        option.id,
                                        province.value,
                                        "price",
                                        event.target.value,
                                      )
                                    }
                                    placeholder="0.00"
                                  />
                                </label>
                              </div>
                            );
                          })}
                        </div>
                        <div className="admin-form__actions">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            onClick={() => setDeleteTarget(option.id)}
                            disabled={savingId === option.id}
                          >
                            Remove
                          </button>
                          <button
                            className="btn btn--primary"
                            type="button"
                            onClick={() => handleSaveCourier(option.id)}
                            disabled={savingId === option.id}
                          >
                            {savingId === option.id ? "Savingâ€¦" : "Save changes"}
                          </button>
                        </div>
                      </>
                    )}
                    {!isExpanded && (
                      <div className="admin-form__actions">
                        <button
                          className="btn btn--secondary"
                          type="button"
                          onClick={() => setDeleteTarget(option.id)}
                          disabled={savingId === option.id}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
      </Reveal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete courier option"
        message="This removes the courier option and all configured province rates."
        confirmLabel="Delete"
        busy={savingId === deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteCourier}
      />

      {isCreateCourierDialogOpen && (
        <div
          className="modal is-active admin-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-shipping-method-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && savingId !== "new") {
              setCreateCourierDialogOpen(false);
            }
          }}
        >
          <div className="modal__content" style={{ maxWidth: "520px" }}>
            <button
              className="modal__close"
              type="button"
              onClick={() => setCreateCourierDialogOpen(false)}
              aria-label="Close create shipping method dialog"
              disabled={savingId === "new"}
            >
              &times;
            </button>
            <h3 className="modal__title" id="create-shipping-method-title">
              Create new shipping method
            </h3>
            <p className="modal__meta">
              Add the method name here, then configure province pricing in the courier list.
            </p>
            <form className="admin-form" onSubmit={handleCreateCourier}>
              <label className="admin-form__field">
                Display name
                <input
                  className="input"
                  type="text"
                  value={newCourier.name}
                  onChange={(event) =>
                    setNewCourier((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Standard Delivery"
                  required
                />
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={newCourier.isActive}
                  onChange={(event) =>
                    setNewCourier((prev) => ({ ...prev, isActive: event.target.checked }))
                  }
                />
                Active for checkout
              </label>
              <div className="admin-modal__actions admin-form__actions">
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => setCreateCourierDialogOpen(false)}
                  disabled={savingId === "new"}
                >
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit" disabled={savingId === "new"}>
                  {savingId === "new" ? "Savingâ€¦" : "Create method"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminProfileView() {
  usePageMetadata({
    title: "Admin Â· Profile",
    description: "Manage your admin authentication info.",
  });
  const { user, role, signOut, refreshRole } = useAuth();
  const [statusMessage, setStatusMessage] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const navigate = useNavigate();

  const handleRefreshRole = async () => {
    setRoleLoading(true);
    try {
      await refreshRole();
      setStatusMessage("Role refreshed");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setRoleLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="admin-panel admin-panel--narrow">
      <Reveal as="section" className="admin-panel" delay={30}>
        <h2>Profile</h2>
        <p className="modal__meta">Signed in as {user.email}</p>
        <p className="modal__meta">
          <strong>Role:</strong> {role}
        </p>
        <p className="modal__meta">UID: {user.uid}</p>
        {user.metadata.lastSignInTime && (
          <p className="modal__meta">
            Last sign-in: {user.metadata.lastSignInTime}
          </p>
        )}
        <div className="admin-profile__actions">
          <button
            className="btn btn--secondary"
            type="button"
            onClick={handleRefreshRole}
            disabled={roleLoading}
          >
            {roleLoading ? "Refreshingâ€¦" : "Refresh Role"}
          </button>
          <button className="btn btn--primary" type="button" onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
        {statusMessage && (
          <p className="admin-panel__status">{statusMessage}</p>
        )}
      </Reveal>
    </div>
  );
}

export default AdminDashboardView;
function AdminPagination({ page, total, onPageChange, pageSize = ADMIN_PAGE_SIZE }) {
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="admin-pagination">
      <span className="admin-pagination__info">
        Showing {start}â€“{end} of {total}
      </span>
      <div className="admin-pagination__controls">
        <button
          className="admin-pagination__button"
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
        >
          Previous
        </button>
        <span className="admin-pagination__page">
          Page {page + 1} of {totalPages}
        </span>
        <button
          className="admin-pagination__button"
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}







