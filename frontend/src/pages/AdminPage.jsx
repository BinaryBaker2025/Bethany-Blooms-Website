import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
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
import { SA_PROVINCES, formatShippingAddress } from "../lib/shipping.js";
import { getStockStatus, STOCK_LOW_THRESHOLD } from "../lib/stockStatus.js";
import {
  DEFAULT_SLOT_CAPACITY,
  AUTO_REPEAT_DAYS,
  createDateGroup,
  createTimeSlot,
} from "./admin/constants.js";

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
          ×
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
            {busy ? "Working…" : confirmLabel}
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
  "order-placed",
  "packing-order",
  "order-ready-for-shipping",
  "shipped",
  "completed",
  "cancelled",
];

const normalizeOrderStatus = (status) => {
  const normalized = (status || "").toString().trim().toLowerCase();
  if (!normalized) return "order-placed";
  const legacyMap = {
    pending: "order-placed",
    processing: "packing-order",
    ready: "order-ready-for-shipping",
    fulfilled: "completed",
  };
  return legacyMap[normalized] || normalized;
};

const formatOrderStatusLabel = (status) =>
  (status || "")
    .toString()
    .trim()
    .replace(/-/g, " ")
    .replace(/\w/g, (char) => char.toUpperCase());

const DELIVERY_METHODS = ["company", "courier"];
const COURIER_OPTIONS = [
  "The Courier Guy",
  "DSV",
  "Fastway",
  "Aramex",
  "PUDO",
  "PostNet",
  "uAfrica/Skynet",
  "Other",
];
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
  if (Number.isFinite(price)) return `${label} · R${price}`;
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
  return `${startLabel} – ${endLabel}`;
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
  return labels.length ? labels.join(" · ") : "";
};

const formatPriceLabel = (value) => {
  if (value === undefined || value === null) return "—";
  if (typeof value === "number") return moneyFormatter.format(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return moneyFormatter.format(numeric);
  return value;
};

const slugifyId = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

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
    title: "Admin · Dashboard",
    description:
      "Quick stats for Bethany Blooms inventory, workshops, and orders.",
  });
  const { user } = useAuth();
  const {
    db,
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
    {
      to: "/admin/products",
      title: "Products",
      body: "Upload imagery & pricing",
    },
    {
      to: "/admin/workshops",
      title: "Workshops",
      body: "Session slots & bookings",
    },
    {
      to: "/admin/cut-flowers/classes",
      title: "Cut Flowers",
      body: "Custom blooms & installs",
    },
    {
      to: "/admin/events",
      title: "Events",
      body: "Pop-ups & launches",
    },
    { to: "/admin/orders", title: "Orders", body: "Manage payments" },
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
              <span className="badge badge--muted">Syncing…</span>
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
                    Capacity {entry.session.capacity || DEFAULT_SLOT_CAPACITY} ·{" "}
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
              <span className="badge badge--muted">Syncing…</span>
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
                      {order.customer.email || "—"}
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
  usePageMetadata({
    title: "Admin · Products",
    description: "Manage Bethany Blooms product listings stored in Firebase.",
  });
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
  const isCategoriesTab = location.pathname.includes("/admin/products/categories");
  const activeTab = isCategoriesTab ? "categories" : "products";
  const headerNote = isCategoriesTab ?
     "Manage the categories shown across the storefront."
    : "Build your storefront inventory directly from Firestore.";
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
  const productImportInputRef = useRef(null);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [mediaLibraryMode, setMediaLibraryMode] = useState("main");
  const [mediaLibrarySelection, setMediaLibrarySelection] = useState([]);
  const [productImporting, setProductImporting] = useState(false);
  const [productImportMessage, setProductImportMessage] = useState(null);
  const [productImportError, setProductImportError] = useState(null);
  const [featuredUpdatingId, setFeaturedUpdatingId] = useState(null);
  const uploadAsset = useUploadAsset(storage);
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
        const resolved = resolveCategory(id);
        if (!resolved.id) return;
        usage.set(resolved.id, (usage.get(resolved.id) || 0) + 1);
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
    const maxPage = Math.max(0, Math.ceil(products.length / ADMIN_PAGE_SIZE) - 1);
    setProductPage((prev) => Math.min(prev, maxPage));
  }, [products.length]);

  const paginatedProducts = useMemo(() => {
    const start = productPage * ADMIN_PAGE_SIZE;
    return products.slice(start, start + ADMIN_PAGE_SIZE);
  }, [products, productPage]);

  const openProductModal = () => {
    setProductForm({
      ...INITIAL_PRODUCT_FORM,
    });
    setProductMainImageFile(null);
    setProductMainImagePreview("");
    setProductGalleryFiles([]);
    setProductGalleryPreviews([]);
    setEditingProductId(null);
    setProductError(null);
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

  const handleGalleryImagesChange = (event) => {
    const files = Array.from(event.target.files ?? []);
    if (Array.isArray(productGalleryPreviewUrlRef.current)) {
      productGalleryPreviewUrlRef.current.forEach((url) => URL.revokeObjectURL(url));
      productGalleryPreviewUrlRef.current = [];
    }

    const existingUrls = Array.isArray(productForm.galleryImages) ?
       productForm.galleryImages.filter(Boolean)
      : [];
    if (existingUrls.length + files.length > MAX_PRODUCT_IMAGES) {
      setProductError(`Please select up to ${MAX_PRODUCT_IMAGES} images total.`);
      event.target.value = "";
      return;
    }

    const oversized = files.find((file) => file.size > 3 * 1024 * 1024);
    if (oversized) {
      setProductError("Please choose images smaller than 3MB.");
      event.target.value = "";
      return;
    }

    if (files.length) {
      const previews = files.map((file) => URL.createObjectURL(file));
      productGalleryPreviewUrlRef.current = previews;
      setProductGalleryFiles(files);
      setProductGalleryPreviews([...existingUrls, ...previews]);
    } else {
      setProductGalleryFiles([]);
      setProductGalleryPreviews(existingUrls);
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
      const existingUrls = Array.isArray(productForm.galleryImages) ?
         productForm.galleryImages.filter(Boolean)
        : [];
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
    const existingUrls = Array.isArray(productForm.galleryImages) ?
       productForm.galleryImages.filter(Boolean)
      : [];
    const merged = Array.from(new Set([...existingUrls, ...mediaLibrarySelection])).filter(Boolean);
    const maxUrls = Math.max(0, MAX_PRODUCT_IMAGES - productGalleryFiles.length);
    const limited = merged.slice(0, maxUrls);
    if (merged.length > maxUrls) {
      setProductError(`You can add up to ${MAX_PRODUCT_IMAGES} images total.`);
    }
    setProductForm((prev) => ({ ...prev, galleryImages: limited }));
    const filePreviews = Array.isArray(productGalleryPreviewUrlRef.current) ?
       productGalleryPreviewUrlRef.current
      : [];
    setProductGalleryPreviews([...limited, ...filePreviews]);
    setMediaLibraryOpen(false);
  };

  const handleToggleHasVariants = (checked) => {
    setProductForm((prev) => {
      if (!checked) {
        return { ...prev, hasVariants: false, variants: [] };
      }
      const nextVariants =
        prev.variants && prev.variants.length > 0 ? prev.variants : [createProductVariant()];
      return { ...prev, hasVariants: true, variants: nextVariants };
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
      stockQuantity: stockQuantityValue,
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
      hasVariants: Array.isArray(product.variants) && product.variants.length > 0,
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
          }))
        : [],
      featured: Boolean(product.featured),
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
    setProductGalleryPreviews(galleryImages);
    setEditingProductId(product.id);
    setProductError(null);
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
      /* eslint-disable no-await-in-loop */
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
        let variants = variantLabels
          .map((label, idx) => {
            const cleanedLabel = label.toString().trim();
            if (!cleanedLabel) return null;
            const rawPrice = variantPrices[idx] ?? "";
            const parsedPrice = parseSheetPriceValue(rawPrice);
            return {
              id: slugifyId(cleanedLabel) || `variant-${idx + 1}`,
              label: cleanedLabel,
              price: parsedPrice === "" ? null : parsedPrice,
            };
          })
          .filter(Boolean);

        if (!variants.length) {
          const fallbackVariants = [];
          for (let i = 1; i <= 5; i += 1) {
            const label = getCellValue(row, [`Variant ${i} Label`, `Variant ${i}`]);
            const price = getCellValue(row, [`Variant ${i} Price`]);
            if (!label) continue;
            const parsedPrice = parseSheetPriceValue(price);
            fallbackVariants.push({
              id: slugifyId(label) || `variant-${i}`,
              label: label.toString().trim(),
              price: parsedPrice === "" ? null : parsedPrice,
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
          stock_quantity: resolvedQuantity,
          quantity: resolvedQuantity,
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
      /* eslint-enable no-await-in-loop */
      setStatusMessage(
        `Imported ${importedCount} product${importedCount === 1 ? "" : "s"} from spreadsheet.`,
      );
      setProductImportMessage(
        `Imported ${importedCount} product${importedCount === 1 ? "" : "s"} successfully.`,
      );
    } catch (importError) {
      console.error(importError);
      setProductImportError(
        importError.message || "We couldn’t import products from the selected spreadsheet.",
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
      "",
    ];
    const notes = [
      "Notes:",
      "Title and Price are required. Slug is optional.",
      "Stock Status: in_stock, out_of_stock, preorder.",
      "Preorder Send Month: YYYY-MM (only used for preorder items).",
      "Category and Tag are single values.",
      "Featured: yes or no.",
      "Variant Labels/Prices: comma-separated (prices optional).",
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
    const isEditing = Boolean(editingCategory.id);
    const slug = isEditing ? editingCategory.id : slugifyId(name);
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
      if (existing && existing.id !== editingCategory.id) {
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
    const shortDescriptionText = sanitizePlainText(productForm.shortDescription);
    const longDescriptionText = sanitizePlainText(productForm.longDescription);
    const priceNumber = Number(productForm.price);
    const salePriceNumber =
      productForm.salePrice === "" ? null : Number(productForm.salePrice);
    const stockQuantityNumber =
      productForm.stockQuantity === "" ? null : Number(productForm.stockQuantity);
    const derivedStatus = productForm.status || "draft";

    if (!title) {
      setProductError("Product title is required.");
      return;
    }
    if (!slug) {
      setProductError("Product slug is required.");
      return;
    }
    if (!Number.isFinite(priceNumber)) {
      setProductError("Please enter a valid price.");
      return;
    }
    if (salePriceNumber !== null && !Number.isFinite(salePriceNumber)) {
      setProductError("Please enter a valid sale price.");
      return;
    }
    if (stockQuantityNumber !== null && !Number.isFinite(stockQuantityNumber)) {
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

    const rawVariants = Array.isArray(productForm.variants) ? productForm.variants : [];
    const sanitizedVariants = rawVariants
      .map((variant, index) => {
        const label = (variant.label || "").toString().trim();
        if (!label) return null;
        const priceNumber = Number(variant.price);
        return {
          id: variant.id || slugifyId(label) || `variant-${index + 1}`,
          label,
          price: Number.isFinite(priceNumber) ? priceNumber : null,
        };
      })
      .filter(Boolean);
    if (productForm.hasVariants && sanitizedVariants.length === 0) {
      setProductError("Add at least one variant before saving.");
      return;
    }
    const normalizedVariants = productForm.hasVariants ? sanitizedVariants : [];

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

      let galleryUrls = Array.isArray(productForm.galleryImages) ?
         productForm.galleryImages.filter(Boolean)
        : [];
      if (productGalleryFiles.length > 0) {
        for (const file of productGalleryFiles) {
          const uploaded = await uploadProductMedia(file);
          if (uploaded) galleryUrls.push(uploaded);
        }
      }
      const limitedGallery = galleryUrls.slice(0, MAX_PRODUCT_IMAGES);
      const primaryImage = mainImageUrl || limitedGallery[0] || "";

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
      const preorderSendMonthPayload = productForm.stockStatus === "preorder" ? preorderSendMonthValue : "";

      const payload = {
        title,
        sku: skuValue,
        price: priceNumber,
        sale_price: salePriceNumber,
        slug,
        stock_status: productForm.stockStatus,
        preorder_send_month: preorderSendMonthPayload,
        preorderSendMonth: preorderSendMonthPayload,
        stock_quantity:
          stockQuantityNumber === null
            ? productForm.stockStatus === "out_of_stock"
              ? 0
              : null
            : Math.max(0, Math.floor(stockQuantityNumber)),
        category_ids: normalizedCategoryIds,
        tag_ids: normalizedTagIds,
        short_description: shortDescriptionText,
        long_description: longDescriptionText,
        main_image: primaryImage,
        gallery_images: limitedGallery,
        video_embed: productForm.videoEmbed.trim(),
        sunlight: productForm.sunlight || "",
        soil_type: productForm.soilType || "",
        watering: productForm.watering || "",
        climate: productForm.climate || "",
        planting_depth: productForm.plantingDepth || "",
        planting_spacing: productForm.plantingSpacing || "",
        best_planting_time: productForm.bestPlantingTime || "",
        bloom_period: productForm.bloomPeriod || "",
        flower_color: productForm.flowerColor || "",
        mature_height: productForm.matureHeight || "",
        pest_issues: productForm.pestIssues || "",
        disease_info: productForm.diseaseInfo || "",
        propagation: productForm.propagation || "",
        companions: productForm.companions || "",
        meta_title: metaTitle,
        meta_description: metaDescription,
        meta_keywords: metaKeywords,
        shipping_weight: productForm.shippingWeight || "",
        dimensions: dimensionsPayload,
        country_of_origin: productForm.countryOfOrigin.trim(),
        delivery_info: productForm.deliveryInfo.trim(),
        related_product_ids: Array.isArray(productForm.relatedProductIds) ?
           productForm.relatedProductIds.filter(Boolean)
          : [],
        upsell_product_ids: Array.isArray(productForm.upsellProductIds) ?
           productForm.upsellProductIds.filter(Boolean)
          : [],
        cross_sell_product_ids: Array.isArray(productForm.crossSellProductIds) ?
           productForm.crossSellProductIds.filter(Boolean)
          : [],
        name: title,
        description: shortDescriptionText || longDescriptionText,
        image: primaryImage,
        images: limitedGallery,
        category: primaryCategoryLabel,
        categoryId: primaryCategoryId,
        categorySlug: primaryCategorySlug,
        status: derivedStatus,
        quantity:
          stockQuantityNumber === null
            ? productForm.stockStatus === "out_of_stock"
              ? 0
              : null
            : Math.max(0, Math.floor(stockQuantityNumber)),
        forceOutOfStock: productForm.stockStatus === "out_of_stock",
        variants: normalizedVariants,
        featured: Boolean(productForm.featured),
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
          <h2>Products</h2>
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
      </div>

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

      {activeTab === "products" && (
        <div className="admin-panel__content">
          <div className="admin-table__wrapper">
            {!categoryOptions.length && (
              <p className="admin-panel__notice">
                No categories yet. Add one to help customers browse products.
              </p>
            )}
            {products.length > 0 ? (
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
                      : "—";
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
                        const label = resolved.name || value;
                        if (!categoryLabels.includes(label)) categoryLabels.push(label);
                      });
                    const primaryCategory = categoryLabels[0] || "—";
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
                            Qty: {stockStatus.quantity ?? "—"}
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
                No products found. Add your first item.
              </p>
            )}
            <p className="modal__meta">
              {featuredProductCount}/{MAX_FEATURED_PRODUCTS} products featured on the home page.
            </p>
            <AdminPagination page={productPage} total={products.length} onPageChange={setProductPage} />
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
            {editingProductId ? "Edit Product" : "Add Product"}
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
                <label className="admin-form__field">
                  Stock status
                  <select
                    className="input"
                    value={productForm.stockStatus}
                    onChange={(event) =>
                      setProductForm((prev) => ({ ...prev, stockStatus: event.target.value }))
                    }
                  >
                    <option value="in_stock">In stock</option>
                    <option value="out_of_stock">Out of stock</option>
                    <option value="preorder">Preorder</option>
                  </select>
                </label>
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
                      <img src={productMainImagePreview} alt="Main product preview" className="admin-preview" loading="lazy" decoding="async"/>
                    </div>
                  )}
                </div>
                <div className="admin-form__field admin-form__full">
                  <label htmlFor="product-gallery-images">Gallery images</label>
                  <input
                    key={editingProductId ?? "new-product-gallery"}
                    className="input input--file"
                    id="product-gallery-images"
                    type="file"
                    accept="image/*"
                    multiple
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
                        <img
                          key={`${preview}-${index}`}
                          src={preview}
                          alt={`Product gallery preview ${index + 1}`}
                          className="admin-preview" loading="lazy" decoding="async"/>
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
                    placeholder="https://www.youtube.com/watchv=..."
                  />
                </label>
              </div>
            </div>

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
                  Add size, colour, shape, or other variants when enabled. Leave price blank to use the base price.
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
                  Add selected
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminMediaLibraryView() {
  usePageMetadata({
    title: "Admin · Image Library",
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
    title: "Admin · Workshops",
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
        editingWorkshopId ? "Updating workshop…" : "Saving workshop…"
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
              <span className="badge badge--muted">Syncing…</span>
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
              <span className="badge badge--muted">Syncing…</span>
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
                        <td>{bookingEntry.name || "—"}</td>
                        <td>
                          {bookingEntry.email ? (
                            <a href={`mailto:${bookingEntry.email}`}>
                              {bookingEntry.email}
                            </a>
                          ) : (
                            "—"
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
                <span>Auto-schedule future dates (Mon–Sat)</span>
              </label>
              <p className="admin-panel__note">
                When enabled, the first date’s time slots repeat for the next 90
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
                   "Saving…"
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
    title: "Admin · Calendar",
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
      setQuickEventError("We couldn't save the event. Please try again.");
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
        <p className="modal__meta">Syncing latest workshops…</p>
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
              ‹
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
              ›
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
                        {booking.sessionLabel || "Session"} ·{" "}
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
              ×
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

export function AdminUsersView() {
  usePageMetadata({
    title: "Admin · Users",
    description: "Manage user roles for the Bethany Blooms app.",
  });
  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);
  const { items: users, status, error: usersError } = useFirestoreCollection("users", {
    orderByField: null,
    orderDirection: null,
  });
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("customer");
  const [userSaving, setUserSaving] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [newUserPassword, setNewUserPassword] = useState("");
  const [deleteDialog, setDeleteDialog] = useState({ open: false, targetId: null });
  const [deleteBusy, setDeleteBusy] = useState(false);
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const handleSetRole = async (userId, nextRole) => {
    if (!db || !userId) return;
    setUpdatingId(userId);
    setError(null);
    setMessage(null);
    try {
      await updateDoc(doc(db, "users", userId), {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });
      setMessage(`Updated role to ${nextRole}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const friendlyStatus =
    status === "loading" ?
       "Loading users…"
      : status === "error" ?
       "Could not load users."
      : null;

  const resetUserForm = () => {
    setNewUserEmail("");
    setNewUserRole("customer");
    setError(null);
    setMessage(null);
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    if (!db) {
      setError("Firestore is not available.");
      return;
    }
    if (!functionsInstance) {
      setError("Cloud Functions not available.");
      return;
    }
    const email = newUserEmail.trim();
    const password = newUserPassword;
    const role = newUserRole.trim() || "customer";
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setUserSaving(true);
    setError(null);
    setMessage(null);
    try {
      const createUser = httpsCallable(functionsInstance, "createUserWithRole");
      await createUser({ email, password, role });
      setMessage("User created in Auth and Firestore.");
      resetUserForm();
      setUserModalOpen(false);
    } catch (err) {
      const code = err.code || err.message || "";
      if (code.includes("permission-denied") || code.includes("unauthenticated")) {
        setError("You need an admin account with a Firestore user record to create users.");
      } else if (code.includes("invalid-argument")) {
        setError(err.message || "Check email and password (min 6 chars).");
      } else {
        setError(err.message || "Failed to create user.");
      }
    } finally {
      setUserSaving(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <div className="admin-panel__header">
        <div>
          <h2>Users</h2>
          <p className="admin-panel__note">Manage account roles for admins and customers.</p>
        </div>
        <div className="admin-panel__header-actions">
          <button className="btn btn--primary" type="button" onClick={() => setUserModalOpen(true)}>
            Add User
          </button>
        </div>
      </div>

      <div className="admin-table__wrapper">
        {users.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Updated</th>
                <th scope="col" className="admin-table__actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((userDoc) => {
                const updated = userDoc.updatedAt?.toDate?.()
                  ? bookingDateFormatter.format(userDoc.updatedAt.toDate())
                  : "—";
                const role = userDoc.role || "customer";
                return (
                  <tr key={userDoc.id}>
                    <td>
                      <div className="admin-table__product">
                        <div>
                          <strong>{userDoc.email || "No email"}</strong>
                          <p className="modal__meta">UID: {userDoc.id}</p>
                        </div>
                      </div>
                    </td>
                    <td>{role}</td>
                    <td>{updated}</td>
                    <td className="admin-table__actions">
                      <div className="cta-group" style={{ gap: "0.35rem", flexWrap: "nowrap" }}>
                        <button
                          className="btn btn--secondary"
                          type="button"
                          onClick={() => handleSetRole(userDoc.id, "customer")}
                          disabled={updatingId === userDoc.id || role === "customer"}
                        >
                          Set Customer
                        </button>
                        <button
                          className="btn btn--primary"
                          type="button"
                          onClick={() => handleSetRole(userDoc.id, "admin")}
                          disabled={updatingId === userDoc.id || role === "admin"}
                        >
                          Set Admin
                        </button>
                        <button
                          className="btn btn--secondary"
                          type="button"
                          onClick={() => setDeleteDialog({ open: true, targetId: userDoc.id })}
                          disabled={updatingId === userDoc.id}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="admin-panel__notice">
            {friendlyStatus || "No users found."}
          </p>
        )}
        {message && <p className="admin-panel__status">{message}</p>}
        {(error || usersError) && <p className="admin-panel__error">{error || usersError.message}</p>}
      </div>
      <div
        className={`modal admin-modal ${userModalOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={userModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setUserModalOpen(false);
            resetUserForm();
          }
        }}
      >
        <div className="modal__content admin-modal__content">
          <button className="modal__close" type="button" aria-label="Close" onClick={() => {
            setUserModalOpen(false);
            resetUserForm();
          }}>
            ×
          </button>
          <h3 className="modal__title">Create / Update User</h3>
          <form className="admin-form" onSubmit={handleCreateUser}>
            <input
              className="input"
              type="email"
              placeholder="Email (required)"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
            />
            <select
              className="input"
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
            >
              <option value="customer">Customer</option>
              <option value="admin">Admin</option>
            </select>
            <input
              className="input"
              type="password"
              placeholder="Password (min 6 characters)"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
            />
            <div className="admin-form__actions">
              <button className="btn btn--secondary" type="button" onClick={resetUserForm}>
                Reset
              </button>
              <button className="btn btn--primary" type="submit" disabled={userSaving}>
                {userSaving ? "Saving…" : "Save User"}
              </button>
            </div>
            {error && <p className="admin-panel__error">{error}</p>}
            <p className="modal__meta">
              Note: This creates the Firebase Auth user and the matching Firestore user document.
            </p>
          </form>
        </div>
      </div>
      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete User"
        message="Are you sure you want to delete this user record This does not delete their auth account."
        confirmLabel="Delete"
        busy={deleteBusy}
        onCancel={() => setDeleteDialog({ open: false, targetId: null })}
        onConfirm={async () => {
          if (!db || !deleteDialog.targetId) return;
          setDeleteBusy(true);
          setError(null);
          try {
            await deleteDoc(doc(db, "users", deleteDialog.targetId));
            setMessage("User deleted. Remove the auth account separately if needed.");
          } catch (err) {
            setError(err.message);
          } finally {
            setDeleteBusy(false);
            setDeleteDialog({ open: false, targetId: null });
          }
        }}
      />
    </div>
  );
}

export function AdminEventsView() {
  usePageMetadata({
    title: "Admin · Events",
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
      const primaryTime = sanitizedSlots[0].time ?? "";
      const combinedDate = combineDateAndTime(eventForm.date, primaryTime);
      const linkedWorkshop = workshops.find(
        (workshop) => workshop.id === eventForm.workshopId
      );
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
        workshopId: linkedWorkshop.id || null,
        workshopTitle: linkedWorkshop.title || linkedWorkshop.name || null,
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
      setEventError("We couldn’t save the event. Please try again.");
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
              users/{{uid}} and that Firestore is configured for this project.
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
                       "Saving…"
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
                <p className="admin-panel__note">Loading events…</p>
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
    title: "Admin ? Email tests",
    description: "Send a Resend test email and confirm the content sent to customers.",
  });
  const { user, refreshRole } = useAuth();
  const { inventoryEnabled } = useAdminData();
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);
  const [formState, setFormState] = useState({
    email: "",
    templateType: "custom",
    subject: "Bethany Blooms test email",
    html: "<p>Hello from Bethany Blooms. This is a test email delivered via Resend.</p>",
  });
  const [statusMessage, setStatusMessage] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const isCustomTemplate = formState.templateType === "custom";

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  const handleSendTestEmail = async (event) => {
    event.preventDefault();
    if (!functionsInstance) {
      setError("Email functions are not available.");
      return;
    }
    if (!inventoryEnabled) {
      setError("Admin access is required to send emails.");
      return;
    }
    const recipient = (formState.email || "").toString().trim();
    if (!recipient) {
      setError("Recipient email is required.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const syncCallable = httpsCallable(functionsInstance, "syncUserClaims");
      const syncResponse = await syncCallable({});
      if (user.getIdToken) {
        await user.getIdToken(true);
      }
      if (refreshRole) {
        await refreshRole();
      }
      const syncedRole = syncResponse.data.role;
      if (syncedRole && syncedRole !== "admin") {
        throw new Error("Admin role required.");
      }

      const callable = httpsCallable(functionsInstance, "sendTestEmail");
      const payload = {
        email: recipient,
        templateType: formState.templateType || "custom",
      };
      if (payload.templateType === "custom") {
        payload.subject = (formState.subject || "").trim();
        payload.html = formState.html;
      }
      const response = await callable(payload);
      const preview = response.data.preview;
      setStatusMessage(
        `Test email sent.${preview ? ` Preview copy is also delivered to ${preview}.` : ""}`
      );
    } catch (sendError) {
      setError(sendError.message || "Unable to send the test email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--narrow">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Email tests</h2>
          <p className="admin-panel__note">
            Trigger a test email via Resend and verify the preview copy stored in the configured preview inbox.
          </p>
        </div>
      </Reveal>
      <form className="admin-form" onSubmit={handleSendTestEmail}>
        <div className="admin-form__field">
          <label htmlFor="test-email-recipient">Recipient email</label>
          <input
            className="input"
            id="test-email-recipient"
            type="email"
            placeholder="name@example.com"
            value={formState.email}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, email: event.target.value }))
            }
            required
          />
        </div>
        <div className="admin-form__field">
          <label htmlFor="test-email-template">Template</label>
          <select
            className="input"
            id="test-email-template"
            value={formState.templateType}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, templateType: event.target.value }))
            }
          >
            <option value="custom">Custom HTML</option>
            <option value="order-confirmation">Order confirmation (customer)</option>
            <option value="order-admin">Order notification (admin)</option>
            <option value="order-status">Order status update (customer)</option>
            <option value="pos-receipt">POS receipt (customer)</option>
            <option value="pos-admin">POS receipt (admin copy)</option>
            <option value="contact-admin">Contact enquiry (admin)</option>
            <option value="contact-confirm">Contact confirmation (customer)</option>
            <option value="cut-flower-admin">Cut flower booking (admin)</option>
            <option value="cut-flower-customer">Cut flower booking (customer)</option>
            <option value="workshop-admin">Workshop booking (admin)</option>
            <option value="workshop-customer">Workshop booking (customer)</option>
          </select>
        </div>
        <div className="admin-form__field">
          <label htmlFor="test-email-subject">Subject</label>
          <input
            className="input"
            id="test-email-subject"
            value={formState.subject}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, subject: event.target.value }))
            }
            disabled={!isCustomTemplate}
          />
        </div>
        <div className="admin-form__field admin-form__field--description">
          <label htmlFor="test-email-html">HTML content</label>
          <textarea
            className="input textarea admin-form__full"
            id="test-email-html"
            rows="5"
            placeholder="HTML body"
            value={formState.html}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, html: event.target.value }))
            }
            disabled={!isCustomTemplate}
          />
          {!isCustomTemplate && (
            <p className="admin-panel__note">This template uses the live email layout and sample data.</p>
          )}
        </div>
        <div className="admin-form__actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={sending || !inventoryEnabled || !functionsInstance}
          >
            {sending ? "Sending" : "Send test email"}
          </button>
        </div>
        <p className="admin-panel__note">
          Preview copies are delivered automatically to the preview inbox configured via <code>RESEND_PREVIEW_TO</code>.
        </p>
        {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
        {error && <p className="admin-panel__error">{error}</p>}
      </form>
    </div>
  );
}

export function AdminCutFlowerClassesView() {
  usePageMetadata({
    title: "Admin · Cut Flower Classes",
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
      const primaryTime = sanitizedSlots[0].time ?? "";
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
      setClassError("We couldn't save the class. Please try again.");
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
    title: "Admin · Cut Flowers",
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
    title: "Admin · Orders",
    description: "Review cart checkouts and fulfilment status.",
  });
  const { db, orders, products, inventoryLoading, inventoryError } = useAdminData();
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
  const [paymentUpdating, setPaymentUpdating] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState("company");
  const [courierName, setCourierName] = useState("");
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [resendOrderEmailSending, setResendOrderEmailSending] = useState(false);
  const [preorderNoticeMonth, setPreorderNoticeMonth] = useState("");
  const [preorderNoticeSending, setPreorderNoticeSending] = useState(false);
  const [ordersPage, setOrdersPage] = useState(0);

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

  const needsTrackingLink = (status) => ["shipped"].includes(status);

  const normalizePaymentStatus = (order) =>
    (order.payfast.paymentStatus || order.paymentStatus || "").toLowerCase() || "unknown";

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

  const resolvePreorderSendMonthForOrder = (order) => {
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
      await resendOrderConfirmationEmail({
        orderId: selectedOrder.id,
        orderNumber: selectedOrder.orderNumber ?? null,
        customerEmail,
      });
      setStatusMessage("Order confirmation resent to customer.");
    } catch (error) {
      setStatusMessage(error.message || "Unable to resend order confirmation.");
    } finally {
      setResendOrderEmailSending(false);
    }
  };

  const handleMarkPaymentReceived = async (order) => {
    if (!db || !order.id) return;
    setPaymentUpdating(true);
    try {
      await updateDoc(doc(db, "orders", order.id), {
        paymentStatus: "paid",
        status: order.status === "pending" ? "order-placed" : normalizeOrderStatus(order.status) || "order-placed",
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

  const handleSaveDelivery = async () => {
    if (!db || !selectedOrder) return;
    if (deliveryMethod === "courier" && !courierName.trim()) {
      setStatusMessage("Select a courier before saving.");
      return;
    }
    setDeliverySaving(true);
    try {
      await updateDoc(doc(db, "orders", selectedOrder.id), {
        deliveryMethod,
        courierName: deliveryMethod === "courier" ? courierName.trim() : "",
        trackingLink: trackingInput.trim() || null,
        updatedAt: serverTimestamp(),
      });

        if (functionsInstance && selectedOrder.customer.email) {
          const sendOrderStatusEmail = httpsCallable(functionsInstance, "sendOrderStatusEmail");
          await sendOrderStatusEmail({
            customer: selectedOrder.customer,
            customerEmail: selectedOrder.customer?.email || "",
            orderNumber: selectedOrder.orderNumber,
            status: getOrderStatusLabel(selectedOrder, normalizeOrderStatus(selectedOrder.status) || "order-placed"),
            trackingLink: trackingInput.trim(),
            items: selectedOrder.items || [],
          });
        }

      setStatusMessage("Delivery updated");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setDeliverySaving(false);
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

    if (needsTrackingLink(nextStatus) && trackingLinkOverride === null) {
      setPendingStatusUpdate({
        orderId,
        status: formatOrderStatusLabel(nextStatus),
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
    const finalTrackingLink = needsTrackingLink(nextStatus) ?
       fallbackLink || null
      : targetOrder.trackingLink || null;

    await updateDoc(doc(db, "orders", orderId), {
      status: formatOrderStatusLabel(nextStatus),
      updatedAt: serverTimestamp(),
      trackingLink: finalTrackingLink,
    });
    setStatusMessage("Order updated");

    if (functionsInstance && targetOrder.customer.email) {
      try {
        const sendOrderStatusEmail = httpsCallable(
          functionsInstance,
          "sendOrderStatusEmail"
        );
        await sendOrderStatusEmail({
          status: getOrderStatusLabel(targetOrder, nextStatus),
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
        order.customer.fullName || "",
        order.customer.email || "",
        order.customer.phone || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, searchTerm, statusFilter]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredOrders.length / ADMIN_PAGE_SIZE) - 1);
    setOrdersPage((prev) => Math.min(prev, maxPage));
  }, [filteredOrders.length]);

  const paginatedOrders = useMemo(() => {
    const start = ordersPage * ADMIN_PAGE_SIZE;
    return filteredOrders.slice(start, start + ADMIN_PAGE_SIZE);
  }, [filteredOrders, ordersPage]);

  const kpi = useMemo(() => {
    const today = new Date();
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
    const paidCount = orders.filter((o) => normalizePaymentStatus(o) === "complete" || normalizePaymentStatus(o) === "paid").length;
    const failedPayments = orders.filter((o) => normalizePaymentStatus(o) === "failed").length;
    return { totalToday, statusCounts, paidCount, failedPayments };
  }, [orders]);

  const selectedOrder = selectedOrderId ?
     filteredOrders.find((order) => order.id === selectedOrderId) || null
    : null;
  const shippingAddressLabel = selectedOrder
    ? formatShippingAddress(selectedOrder.shippingAddress) ||
      selectedOrder.customer.address ||
      ""
    : "";

  useEffect(() => {
    if (selectedOrder) {
      setDeliveryMethod(selectedOrder.deliveryMethod || "company");
      setCourierName(selectedOrder.courierName || "");
      setTrackingInput(selectedOrder.trackingLink || "");
      const fallbackMarchMonth = `${new Date().getFullYear()}-03`;
      setPreorderNoticeMonth(resolvePreorderSendMonthForOrder(selectedOrder) || fallbackMarchMonth);
    } else {
      setPreorderNoticeMonth("");
    }
  }, [selectedOrder]);

  return (
    <div className="admin-panel admin-panel--full">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Orders</h2>
          <p className="admin-panel__note">
            Track everything added to cart, including workshop metadata.
          </p>
        </div>
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

      <Reveal as="div" className="admin-table__wrapper" delay={60}>
        {filteredOrders.length > 0 ? (
          <table className="admin-table">
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
                const deliveryStatus = normalizeDeliveryStatus(order);
                return (
                  <tr
                    key={order.id}
                    className={order.id === selectedOrderId ? "is-active" : ""}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <td>
                      <strong>{orderLabel}</strong>
                      <p className="modal__meta">{createdAtLabel}</p>
                      <p className="modal__meta">Ref: {order.id}</p>
                      {order.trackingLink && (
                        <p className="modal__meta">
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
                    <td>
                      <p>{order.customer.fullName || "—"}</p>
                      <p className="modal__meta">
                        {order.customer.email || "—"}
                      </p>
                      {order.customer.phone && (
                        <p className="modal__meta">{order.customer.phone}</p>
                      )}
                    </td>
                    <td>{formatPriceLabel(total)}</td>
                    <td>
                      <span className={`admin-status admin-status--${paymentStatus}`}>
                        {paymentStatus}
                      </span>
                    </td>
                    <td>
                      <select
                        className="input"
                        value={normalizeOrderStatus(order.status)}
                        onChange={(event) =>
                          handleUpdateOrderStatus(order.id, event.target.value)
                        }
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      {isPreordered && normalizeOrderStatus(order.status) === "order-placed" && (
                        <p className="modal__meta">Preordered</p>
                      )}
                    </td>
                    <td>
                      <span className="modal__meta">{deliveryStatus.replace(/-/g, " ")}</span>
                    </td>
                    <td>
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
        <AdminPagination page={ordersPage} total={filteredOrders.length} onPageChange={setOrdersPage} />
        {inventoryLoading && <p className="modal__meta">Syncing orders…</p>}
        {inventoryError && (
          <p className="admin-panel__error">{inventoryError}</p>
        )}
        {statusMessage && (
          <p className="admin-panel__status">{statusMessage}</p>
        )}
      </Reveal>

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
                <span className={`admin-status admin-status--${normalizePaymentStatus(selectedOrder)}`}>
                  Payment: {normalizePaymentStatus(selectedOrder)}
                </span>
                <span className="admin-status">
                  Delivery: {normalizeDeliveryStatus(selectedOrder).replace(/-/g, " ")}
                </span>
                <span className="admin-status">Status: {getOrderStatusLabel(selectedOrder)}</span>
              </div>
            </div>

            <div className="admin-order-detail__split">
              <div className="admin-order-detail__left">
                <div className="admin-order-detail__grid">
                  <div>
                    <h4>Customer</h4>
                    <p>{selectedOrder.customer.fullName || "—"}</p>
                    <p className="modal__meta">{selectedOrder.customer.email || "—"}</p>
                    {selectedOrder.customer.phone && <p className="modal__meta">{selectedOrder.customer.phone}</p>}
                    {shippingAddressLabel && <p className="modal__meta">{shippingAddressLabel}</p>}
                  </div>
                  <div>
                    <h4>Payment</h4>
                    {Number.isFinite(selectedOrder.subtotal) && (
                      <p className="modal__meta">Subtotal: {formatPriceLabel(selectedOrder.subtotal)}</p>
                    )}
                    {Number.isFinite(selectedOrder.shippingCost) && (
                      <p className="modal__meta">Shipping: {formatPriceLabel(selectedOrder.shippingCost)}</p>
                    )}
                    <p className="modal__meta">Total: {formatPriceLabel(selectedOrder.totalPrice)}</p>
                    {selectedOrder.payfast.paymentReference && (
                      <p className="modal__meta">Ref: {selectedOrder.payfast.paymentReference}</p>
                    )}
                    {selectedOrder.payfast.paymentId && (
                      <p className="modal__meta">PayFast ID: {selectedOrder.payfast.paymentId}</p>
                    )}
                  </div>
                  <div>
                    <h4>Delivery</h4>
                    {selectedOrder.shipping.courierName && (
                      <p className="modal__meta">Courier: {selectedOrder.shipping.courierName}</p>
                    )}
                    {selectedOrder.shipping.province && (
                      <p className="modal__meta">Province: {selectedOrder.shipping.province}</p>
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
                  </div>
                </div>

                <div>
                  <h4>Items</h4>
                  <ul className="order-items">
                    {selectedOrder.items.map((item) => (
                      <li key={`${selectedOrder.id}-${item.id}`}>
                        <strong>{item.name}</strong> ×{item.quantity || 1}
                        <span className="modal__meta">{formatPriceLabel(item.price)}</span>
                        {item.metadata.type === "workshop" && (
                          <span className="modal__meta">
                            {item.metadata.sessionDayLabel ||
                              item.metadata.sessionLabel ||
                              "Session"}{" "}
                            · {item.metadata.attendeeCount || 1} attendee(s)
                          </span>
                        )}
                        {item.metadata.type === "product" && item.metadata.variantLabel && (
                          <span className="modal__meta">
                            Variant: {item.metadata.variantLabel}
                          </span>
                        )}
                        {item.metadata.type === "product" &&
                          (item.metadata.preorderSendMonth || item.metadata.preorderSendMonthLabel) && (
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
                </div>
              </div>

              <div className="admin-order-detail__right">
                <div className="admin-order-detail__actions">
                  <div className="admin-order-detail__actions-row">
                    <label>
                      Order Status
                      <select
                        className="input"
                        value={normalizeOrderStatus(selectedOrder.status)}
                        onChange={(event) =>
                          handleUpdateOrderStatus(selectedOrder.id, event.target.value)
                        }
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
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
                    <button
                      className="btn btn--primary"
                      type="button"
                      disabled={paymentUpdating}
                      onClick={() => handleMarkPaymentReceived(selectedOrder)}
                    >
                      {paymentUpdating ? "Updating…" : "Mark Payment Received"}
                    </button>
                  </div>
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
                      <>
                        <label>
                          Courier
                          <select
                            className="input"
                            value={courierName}
                            onChange={(event) => setCourierName(event.target.value)}
                          >
                            <option value="">Select courier</option>
                            {COURIER_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-order-detail__wide">
                          Tracking Link
                          <input
                            className="input"
                            type="url"
                            value={trackingInput}
                            onChange={(event) => setTrackingInput(event.target.value)}
                            placeholder="https://courier.example/track/123"
                          />
                        </label>
                      </>
                    )}
                    {deliveryMethod === "company" && (
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
                    )}
                  </div>
                  <div className="admin-order-detail__actions-row">
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={deliverySaving}
                      onClick={handleSaveDelivery}
                    >
                      {deliverySaving ? "Saving…" : "Save Delivery"}
                    </button>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={resendOrderEmailSending}
                      onClick={handleResendOrderConfirmationEmail}
                    >
                      {resendOrderEmailSending ? "Sending…" : "Resend Order Email"}
                    </button>
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
                        {preorderNoticeSending ? "Sending…" : "Send Pre-order Notice"}
                      </button>
                    </div>
                  )}
                  {selectedOrder.payfast.gatewayResponse && (
                    <p className="modal__meta">
                      Gateway: {selectedOrder.payfast.gatewayResponse} · Amount verified:{" "}
                      {selectedOrder.payfast.validatedWithGateway ? "yes" : "no"}
                    </p>
                  )}
                </div>
              </div>
            </div>
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
            Leave blank if you’ll share it later.
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
    title: "Admin · Shipping & Courier",
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
    event.preventDefault();
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
        </div>

        <form className="admin-form" onSubmit={handleCreateCourier}>
          <div className="admin-form__section">
            <div className="admin-form__section-header">
              <h4>Add courier option</h4>
            </div>
            <div className="admin-form__section-grid">
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
            </div>
            <div className="admin-form__actions">
              <button className="btn btn--primary" type="submit" disabled={savingId === "new"}>
                {savingId === "new" ? "Saving…" : "Create courier"}
              </button>
            </div>
          </div>
        </form>

        <div className="admin-session-panel">
          <h3>Courier options</h3>
          {status === "loading" && <p className="modal__meta">Loading courier options…</p>}
          {error && <p className="admin-panel__error">{error.message}</p>}
          {courierOptions.length === 0 ? (
            <p className="admin-panel__notice">No courier options configured yet.</p>
          ) : (
            <div className="admin-shipping-grid">
              {courierOptions.map((option) => {
                const draft = drafts[option.id];
                if (!draft) return null;
                return (
                  <div key={option.id} className="admin-detail-card">
                    <div className="admin-form__section-header">
                      <h4>{option.name || "Courier option"}</h4>
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
                        {savingId === option.id ? "Saving…" : "Save changes"}
                      </button>
                    </div>
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
    </div>
  );
}

export function AdminProfileView() {
  usePageMetadata({
    title: "Admin · Profile",
    description: "Manage your admin authentication info.",
  });
  const { user, role, signOut, refreshRole } = useAuth();
  const [statusMessage, setStatusMessage] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);

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
            {roleLoading ? "Refreshing…" : "Refresh Role"}
          </button>
          <button className="btn btn--primary" type="button" onClick={signOut}>
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
        Showing {start}–{end} of {total}
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
