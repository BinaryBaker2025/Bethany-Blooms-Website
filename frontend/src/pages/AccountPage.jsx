import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Reveal from "../components/Reveal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useCustomerProfile } from "../hooks/useCustomerProfile.js";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { getFirebaseDb, getFirebaseFunctions, getFirebaseStorage } from "../lib/firebase.js";
import {
  EFT_PROOF_ACCEPT,
  EFT_PROOF_MAX_SIZE_BYTES,
  PAYMENT_APPROVAL_STATUSES,
  PAYMENT_METHODS,
  normalizePaymentMethod,
} from "../lib/paymentMethods.js";
import { SA_PROVINCES, formatShippingAddress } from "../lib/shipping.js";
import logo from "../assets/BethanyBloomsLogo.png";

const emptyAddressDraft = {
  label: "",
  street: "",
  suburb: "",
  city: "",
  province: "",
  postalCode: "",
};

const emptyProfileForm = {
  fullName: "",
  phone: "",
  addresses: [],
  defaultAddressId: "",
  preferences: {
    marketingEmails: true,
    orderUpdates: true,
  },
};

const SUBSCRIPTION_STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

const SUBSCRIPTION_INVOICE_STATUS_LABELS = {
  "pending-payment": "Pending payment",
  paid: "Paid",
  cancelled: "Cancelled",
};
const SUBSCRIPTION_INVOICE_TYPES = {
  cycle: "cycle",
  topup: "topup",
};

const normalizeSubscriptionInvoiceStatus = (value = "") => {
  const normalized = (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (normalized === "paid" || normalized === "complete" || normalized === "completed") {
    return "paid";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }
  return "pending-payment";
};

const normalizeSubscriptionInvoiceType = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_INVOICE_TYPES.topup) return SUBSCRIPTION_INVOICE_TYPES.topup;
  return SUBSCRIPTION_INVOICE_TYPES.cycle;
};

const formatSubscriptionInvoiceTypeLabel = (value = "") =>
  normalizeSubscriptionInvoiceType(value) === SUBSCRIPTION_INVOICE_TYPES.topup ? "Top-up" : "Cycle";

const resolveSubscriptionInvoiceFinancials = (invoice = {}) => {
  const amount = Number(invoice?.amount || 0);
  const baseAmountRaw = Number(invoice?.baseAmount);
  const baseAmount = Number.isFinite(baseAmountRaw) ? baseAmountRaw : amount;
  const adjustmentsTotalRaw = Number(invoice?.adjustmentsTotal);
  const adjustmentsTotal = Number.isFinite(adjustmentsTotalRaw) ? adjustmentsTotalRaw : Math.max(0, amount - baseAmount);
  const adjustments = Array.isArray(invoice?.adjustments) ? invoice.adjustments : [];
  return {
    amount: Number(amount.toFixed(2)),
    baseAmount: Number(baseAmount.toFixed(2)),
    adjustmentsTotal: Number(adjustmentsTotal.toFixed(2)),
    adjustments,
    invoiceType: normalizeSubscriptionInvoiceType(invoice?.invoiceType || ""),
  };
};

const normalizeSubscriptionPaymentMethod = (value = "") =>
  normalizePaymentMethod(value || PAYMENT_METHODS.PAYFAST);

const normalizeSubscriptionPaymentApprovalStatus = (value = "", paymentMethod = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === PAYMENT_APPROVAL_STATUSES.PENDING) return PAYMENT_APPROVAL_STATUSES.PENDING;
  if (normalized === PAYMENT_APPROVAL_STATUSES.APPROVED) return PAYMENT_APPROVAL_STATUSES.APPROVED;
  if (normalized === PAYMENT_APPROVAL_STATUSES.REJECTED) return PAYMENT_APPROVAL_STATUSES.REJECTED;
  return normalizeSubscriptionPaymentMethod(paymentMethod) === PAYMENT_METHODS.EFT
    ? PAYMENT_APPROVAL_STATUSES.PENDING
    : PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED;
};

const formatSubscriptionPaymentMethodLabel = (paymentMethod = "") =>
  normalizeSubscriptionPaymentMethod(paymentMethod) === PAYMENT_METHODS.EFT ? "EFT" : "PayFast";

const formatSubscriptionPaymentApprovalLabel = (status = "") => {
  const normalized = (status || "").toString().trim().toLowerCase();
  if (normalized === PAYMENT_APPROVAL_STATUSES.APPROVED) return "Approved";
  if (normalized === PAYMENT_APPROVAL_STATUSES.REJECTED) return "Rejected";
  if (normalized === PAYMENT_APPROVAL_STATUSES.PENDING) return "Pending admin approval";
  return "Not required";
};

const SUBSCRIPTION_MONDAY_SLOTS = Object.freeze([
  { value: "first", label: "1st Monday" },
  { value: "second", label: "2nd Monday" },
  { value: "third", label: "3rd Monday" },
  { value: "fourth", label: "4th Monday" },
  { value: "last", label: "Last Monday" },
]);

const normalizeSubscriptionStatus = (value = "") =>
  (value || "").toString().trim().toLowerCase() || "active";

const normalizeSubscriptionTier = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "biweekly") return "bi-weekly";
  if (normalized === "weekly" || normalized === "bi-weekly" || normalized === "monthly") {
    return normalized;
  }
  return "";
};

const normalizeMondaySlot = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return SUBSCRIPTION_MONDAY_SLOTS.some((entry) => entry.value === normalized) ? normalized : "";
};

const resolveRequiredMondaySlotCount = (tier = "") => {
  const normalized = normalizeSubscriptionTier(tier);
  if (normalized === "weekly") return 5;
  if (normalized === "bi-weekly") return 2;
  if (normalized === "monthly") return 1;
  return 0;
};

const getDefaultMondaySlotsForTier = (tier = "") => {
  const normalized = normalizeSubscriptionTier(tier);
  if (normalized === "weekly") {
    return SUBSCRIPTION_MONDAY_SLOTS.map((entry) => entry.value);
  }
  if (normalized === "bi-weekly") return ["first", "third"];
  if (normalized === "monthly") return ["first"];
  return [];
};

const normalizeMondaySlotsForTier = (tier = "", values = []) => {
  const normalizedTier = normalizeSubscriptionTier(tier);
  if (!normalizedTier) return [];
  if (normalizedTier === "weekly") {
    return SUBSCRIPTION_MONDAY_SLOTS.map((entry) => entry.value);
  }
  const seen = new Set();
  const normalized = (Array.isArray(values) ? values : [])
    .map((entry) => normalizeMondaySlot(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
  const required = resolveRequiredMondaySlotCount(normalizedTier);
  const defaults = getDefaultMondaySlotsForTier(normalizedTier);
  defaults.forEach((entry) => {
    if (normalized.length >= required) return;
    if (!seen.has(entry)) {
      seen.add(entry);
      normalized.push(entry);
    }
  });
  return normalized.slice(0, required);
};

const formatMondaySlotLabel = (slot = "") =>
  SUBSCRIPTION_MONDAY_SLOTS.find((entry) => entry.value === normalizeMondaySlot(slot))?.label || "";

const formatMondaySlotList = (slots = []) =>
  (Array.isArray(slots) ? slots : [])
    .map((entry) => formatMondaySlotLabel(entry))
    .filter(Boolean)
    .join(", ");

const createAddressId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `addr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatOrderDate = (value) => {
  const date = toDate(value);
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const orderSortValue = (order) => {
  const created = toDate(order.createdAt)?.getTime() || 0;
  const updated = toDate(order.updatedAt)?.getTime() || 0;
  return Math.max(created, updated, 0);
};

const subscriptionSortValue = (subscription) => {
  const updated = toDate(subscription.updatedAt)?.getTime() || 0;
  const created = toDate(subscription.createdAt)?.getTime() || 0;
  return Math.max(updated, created, 0);
};

const invoiceSortValue = (invoice) => {
  const updated = toDate(invoice.updatedAt)?.getTime() || 0;
  const created = toDate(invoice.createdAt)?.getTime() || 0;
  return Math.max(updated, created, 0);
};

const formatCurrency = (value) => `R${Number(value || 0).toFixed(2)}`;

const formatTierLabel = (tier) => {
  const normalized = normalizeSubscriptionTier(tier);
  if (normalized === "bi-weekly") return "Bi-weekly";
  if (normalized === "weekly") return "Weekly";
  if (normalized === "monthly") return "Monthly";
  return "";
};

const normalizeBillingMonthKey = (value = "") => {
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

const billingMonthToIndex = (monthKey = "") => {
  const normalized = normalizeBillingMonthKey(monthKey);
  if (!normalized) return null;
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return year * 12 + month;
};

const compareBillingMonthKeys = (leftMonth = "", rightMonth = "") => {
  const left = billingMonthToIndex(leftMonth);
  const right = billingMonthToIndex(rightMonth);
  if (left == null || right == null) return 0;
  return left - right;
};

const getCurrentBillingMonthKey = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const normalized = normalizeBillingMonthKey(`${year}-${month}`);
  if (normalized) return normalized;
  const fallbackDate = new Date();
  return `${fallbackDate.getUTCFullYear()}-${String(fallbackDate.getUTCMonth() + 1).padStart(2, "0")}`;
};

const formatBillingMonthLabel = (monthKey = "") => {
  const normalized = normalizeBillingMonthKey(monthKey);
  if (!normalized) return "";
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
  });
};

const getPreviousBillingMonthKey = (monthKey = "") => {
  const normalized = normalizeBillingMonthKey(monthKey);
  if (!normalized) return "";
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return normalizeBillingMonthKey(`${prevYear}-${String(prevMonth).padStart(2, "0")}`);
};

const getBillingMonthDays = (monthKey = "") => {
  const normalized = normalizeBillingMonthKey(monthKey);
  if (!normalized) return 30;
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const formatBillingWindowLabel = (monthKey = "") => {
  const normalized = normalizeBillingMonthKey(monthKey);
  if (!normalized) return "last 5 days of the month";
  const monthLabel = formatBillingMonthLabel(normalized);
  const totalDays = getBillingMonthDays(normalized);
  const startDay = Math.max(1, totalDays - 4);
  return `${String(startDay).padStart(2, "0")} - ${String(totalDays).padStart(2, "0")} ${monthLabel}`;
};

const formatSubscriptionPlanLabel = (entry = {}) => {
  const explicitPlanName = (entry.planName || "").toString().trim();
  if (explicitPlanName) return explicitPlanName;
  const snapshotPlanName = (entry?.subscriptionPlan?.name || "").toString().trim();
  if (snapshotPlanName) return snapshotPlanName;
  const productName = (entry?.subscriptionProduct?.productName || "").toString().trim();
  const variantLabel = (entry?.subscriptionProduct?.variantLabel || "").toString().trim();
  if (productName && variantLabel) return `${productName} - ${variantLabel}`;
  if (productName) return productName;

  const tierLabel = formatTierLabel(entry.tier);
  if (tierLabel) return `${tierLabel} plan`;
  return "Flower subscription";
};

const getInvoiceDownloadUrl = (invoice = {}) => {
  const documentDownloadUrl = (invoice?.document?.downloadUrl || "").toString().trim();
  if (documentDownloadUrl) return documentDownloadUrl;
  return (invoice?.downloadUrl || "").toString().trim();
};

const formatAuthErrorMessage = (error, fallback = "Unable to sign in.") => {
  const code = (error?.code || "").toString().trim().toLowerCase();
  if (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") {
    return "Incorrect email/password, or this account does not exist in Firebase Authentication yet.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (code === "auth/user-disabled") {
    return "This account has been disabled. Contact support.";
  }
  return error?.message || fallback;
};

const parseSafeLocalPath = (value = "") => {
  const normalized = (value || "").toString().trim();
  if (!normalized) return "";
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return "";
  return normalized;
};

const sanitizeProofFileName = (fileName = "") => {
  const normalized = (fileName || "").toString().trim();
  if (!normalized) return "proof";
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "proof";
};

const EyeIcon = ({ open = false }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    {!open && (
      <path
        d="M4 20 20 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

function AccountPage() {
  usePageMetadata({
    title: "Account | Bethany Blooms",
    description: "Manage your profile, saved addresses, subscriptions, and order history.",
    noIndex: true,
  });

  const { user, loading: authLoading, role, initError, signIn, signUp, signOut, resetPassword } = useAuth();
  const { profile, loading: profileLoading, saving: profileSaving, saveProfile } = useCustomerProfile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedAuthMode = (searchParams.get("mode") || "").toString().trim().toLowerCase();
  const nextPath = parseSafeLocalPath(searchParams.get("next"));

  const [authMode, setAuthMode] = useState("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [signInForm, setSignInForm] = useState({ email: "", password: "" });
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [signUpForm, setSignUpForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [showSignUpConfirmPassword, setShowSignUpConfirmPassword] = useState(false);

  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [addressDraft, setAddressDraft] = useState(emptyAddressDraft);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [addressDialogMode, setAddressDialogMode] = useState("add");
  const [editingAddressId, setEditingAddressId] = useState("");
  const [subscriptionHistoryOpen, setSubscriptionHistoryOpen] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionsError, setSubscriptionsError] = useState("");
  const [subscriptionInvoices, setSubscriptionInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState("");
  const [subscriptionActionBusyId, setSubscriptionActionBusyId] = useState("");
  const [invoiceActionBusyId, setInvoiceActionBusyId] = useState("");
  const [invoicePreviewBusyId, setInvoicePreviewBusyId] = useState("");
  const [subscriptionProofBusyId, setSubscriptionProofBusyId] = useState("");
  const [subscriptionProofFiles, setSubscriptionProofFiles] = useState({});
  const [subscriptionPreferenceBusyId, setSubscriptionPreferenceBusyId] = useState("");
  const [subscriptionMondaySlotDrafts, setSubscriptionMondaySlotDrafts] = useState({});
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");

  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);

  const storage = useMemo(() => {
    try {
      return getFirebaseStorage();
    } catch {
      return null;
    }
  }, []);

  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const updateCustomerSubscriptionStatus = useMemo(
    () =>
      functionsInstance
        ? httpsCallable(functionsInstance, "updateCustomerSubscriptionStatus")
        : null,
    [functionsInstance],
  );
  const sendSubscriptionInvoiceEmailNow = useMemo(
    () =>
      functionsInstance
        ? httpsCallable(functionsInstance, "sendSubscriptionInvoiceEmailNow")
        : null,
    [functionsInstance],
  );
  const updateCustomerSubscriptionDeliveryPreferences = useMemo(
    () =>
      functionsInstance
        ? httpsCallable(functionsInstance, "updateCustomerSubscriptionDeliveryPreferences")
        : null,
    [functionsInstance],
  );
  const attachSubscriptionEftPaymentProof = useMemo(
    () =>
      functionsInstance
        ? httpsCallable(functionsInstance, "attachSubscriptionEftPaymentProof")
        : null,
    [functionsInstance],
  );
  const generateSubscriptionInvoiceDocumentNow = useMemo(
    () =>
      functionsInstance
        ? httpsCallable(functionsInstance, "generateSubscriptionInvoiceDocumentNow")
        : null,
    [functionsInstance],
  );

  useEffect(() => {
    if (!user || role !== "admin") return;
    navigate("/admin", { replace: true });
  }, [navigate, role, user]);

  useEffect(() => {
    if (!user) {
      setProfileForm(emptyProfileForm);
      setAddressDraft(emptyAddressDraft);
      setSubscriptionHistoryOpen(false);
      setSubscriptionProofFiles({});
      return;
    }
    setProfileForm({
      fullName: profile?.fullName || "",
      phone: profile?.phone || "",
      addresses: Array.isArray(profile?.addresses) ? profile.addresses : [],
      defaultAddressId: (profile?.defaultAddressId || "").toString().trim(),
      preferences: {
        marketingEmails: profile?.preferences?.marketingEmails !== false,
        orderUpdates: profile?.preferences?.orderUpdates !== false,
      },
    });
  }, [profile, user]);

  useEffect(() => {
    if (!user?.uid || !db) {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersError("");
      return undefined;
    }

    const normalizedUid = (user.uid || "").toString().trim();
    const normalizedEmail = (user.email || "").toString().trim();
    if (!normalizedUid) {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersError("");
      return undefined;
    }

    let uidRows = [];
    let emailRows = [];
    let uidLoaded = false;
    let emailLoaded = !normalizedEmail;

    const mapSnapshotRows = (snapshot) =>
      snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }));
    const publishOrders = () => {
      const merged = new Map();
      [...uidRows, ...emailRows].forEach((row) => {
        if (!row?.id) return;
        merged.set(row.id, row);
      });
      const rows = Array.from(merged.values()).sort(
        (left, right) => orderSortValue(right) - orderSortValue(left),
      );
      setOrders(rows);
      if (uidLoaded && emailLoaded) {
        setOrdersLoading(false);
      }
    };

    setOrdersLoading(true);
    setOrdersError("");

    const ordersByUidRef = query(
      collection(db, "orders"),
      where("customerUid", "==", normalizedUid),
    );
    const unsubscribeUid = onSnapshot(
      ordersByUidRef,
      (snapshot) => {
        uidRows = mapSnapshotRows(snapshot);
        uidLoaded = true;
        setOrdersError("");
        publishOrders();
      },
      (error) => {
        console.warn("Failed to load customer orders by UID", error);
        setOrders([]);
        setOrdersLoading(false);
        setOrdersError("Unable to load your orders right now.");
      },
    );

    let unsubscribeEmail = () => {};
    if (normalizedEmail) {
      const ordersByEmailRef = query(
        collection(db, "orders"),
        where("customer.email", "==", normalizedEmail),
      );
      unsubscribeEmail = onSnapshot(
        ordersByEmailRef,
        (snapshot) => {
          emailRows = mapSnapshotRows(snapshot);
          emailLoaded = true;
          publishOrders();
        },
        (error) => {
          console.warn("Failed to load legacy customer orders by email", error);
          emailRows = [];
          emailLoaded = true;
          publishOrders();
        },
      );
    }

    return () => {
      unsubscribeUid();
      unsubscribeEmail();
    };
  }, [db, user?.uid, user?.email]);

  useEffect(() => {
    const normalizedUid = (user?.uid || "").toString().trim();
    if (!normalizedUid || !db) {
      setSubscriptions([]);
      setSubscriptionsLoading(false);
      setSubscriptionsError("");
      return undefined;
    }

    setSubscriptionsLoading(true);
    setSubscriptionsError("");
    const subscriptionsRef = query(
      collection(db, "subscriptions"),
      where("customerUid", "==", normalizedUid),
    );

    const unsubscribe = onSnapshot(
      subscriptionsRef,
      (snapshot) => {
        const rows = snapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }))
          .sort((left, right) => subscriptionSortValue(right) - subscriptionSortValue(left));
        setSubscriptions(rows);
        setSubscriptionsLoading(false);
        setSubscriptionsError("");
      },
      (error) => {
        console.warn("Failed to load subscriptions", error);
        setSubscriptions([]);
        setSubscriptionsLoading(false);
        setSubscriptionsError("Unable to load subscriptions right now.");
      },
    );

    return unsubscribe;
  }, [db, user?.uid]);

  useEffect(() => {
    const normalizedUid = (user?.uid || "").toString().trim();
    if (!normalizedUid || !db) {
      setSubscriptionInvoices([]);
      setInvoicesLoading(false);
      setInvoicesError("");
      return undefined;
    }

    setInvoicesLoading(true);
    setInvoicesError("");
    const invoicesRef = query(
      collection(db, "subscriptionInvoices"),
      where("customerUid", "==", normalizedUid),
    );

    const unsubscribe = onSnapshot(
      invoicesRef,
      (snapshot) => {
        const rows = snapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }))
          .sort((left, right) => invoiceSortValue(right) - invoiceSortValue(left));
        setSubscriptionInvoices(rows);
        setInvoicesLoading(false);
        setInvoicesError("");
      },
      (error) => {
        console.warn("Failed to load subscription invoices", error);
        setSubscriptionInvoices([]);
        setInvoicesLoading(false);
        setInvoicesError("Unable to load subscription invoices right now.");
      },
    );

    return unsubscribe;
  }, [db, user?.uid]);

  useEffect(() => {
    setSubscriptionMondaySlotDrafts((prev) => {
      const next = {};
      (Array.isArray(subscriptions) ? subscriptions : []).forEach((subscription) => {
        const subscriptionId = (subscription?.id || "").toString().trim();
        if (!subscriptionId) return;
        const tier = normalizeSubscriptionTier(
          subscription?.tier || subscription?.subscriptionPlan?.tier,
        );
        if (!tier) return;
        const existing = Array.isArray(prev[subscriptionId]) ? prev[subscriptionId] : null;
        const sourceSlots = Array.isArray(subscription?.deliveryPreference?.slots)
          ? subscription.deliveryPreference.slots
          : [];
        next[subscriptionId] = normalizeMondaySlotsForTier(
          tier,
          existing && existing.length ? existing : sourceSlots,
        );
      });
      return next;
    });
  }, [subscriptions]);

  useEffect(() => {
    if (requestedAuthMode === "signin" || requestedAuthMode === "signup") {
      setAuthMode(requestedAuthMode);
    }
  }, [requestedAuthMode]);

  useEffect(() => {
    if (!nextPath || user || authBusy) return;
    setAuthMessage((prev) => prev || "Sign in or create your account to continue.");
  }, [authBusy, nextPath, user]);

  const handleSignIn = async (event) => {
    event.preventDefault();
    if (authBusy) return;

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const credentials = await signIn(signInForm.email.trim(), signInForm.password);
      const resolvedRole = (credentials?.resolvedRole || "").toString().trim().toLowerCase();
      setAuthMessage("Signed in.");
      setSignInForm({ email: "", password: "" });
      setShowSignInPassword(false);
      if (resolvedRole === "admin") {
        navigate("/admin", { replace: true });
        return;
      }
      if (nextPath) {
        navigate(nextPath, { replace: true });
        return;
      }
    } catch (error) {
      setAuthError(formatAuthErrorMessage(error, "Unable to sign in."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignUp = async (event) => {
    event.preventDefault();
    if (authBusy) return;

    const email = signUpForm.email.trim();
    const password = signUpForm.password;
    const confirmPassword = signUpForm.confirmPassword;

    if (!email || !password) {
      setAuthError("Email and password are required.");
      return;
    }
    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      await signUp(email, password);
      setAuthMessage("Account created. You are now signed in.");
      setSignUpForm({ email: "", password: "", confirmPassword: "" });
      setShowSignUpPassword(false);
      setShowSignUpConfirmPassword(false);
      setAuthMode("signin");
      if (nextPath) {
        navigate(nextPath, { replace: true });
        return;
      }
    } catch (error) {
      setAuthError(formatAuthErrorMessage(error, "Unable to create account."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (authBusy) return;
    const email = (authMode === "signup" ? signUpForm.email : signInForm.email).trim();
    if (!email) {
      setAuthError("Enter your email first, then click Forgot password.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      await resetPassword(email);
      setAuthMessage("Password reset email sent. Check your inbox.");
    } catch (error) {
      setAuthError(formatAuthErrorMessage(error, "Unable to send password reset email."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    if (!user) return;

    setProfileStatus("");
    setProfileError("");

    try {
      await saveProfile(profileForm);
      setProfileStatus("Profile saved.");
    } catch (error) {
      setProfileError(error?.message || "Unable to save profile.");
    }
  };

  const navigateToSubscriptionPayLink = (payLinkUrl = "") => {
    const normalizedUrl = (payLinkUrl || "").toString().trim();
    if (!normalizedUrl) return false;
    try {
      const parsedUrl = new URL(normalizedUrl, window.location.origin);
      navigate(`${parsedUrl.pathname}${parsedUrl.search}`);
      return true;
    } catch {
      window.location.assign(normalizedUrl);
      return true;
    }
  };

  const openUrlInNewTab = (url) => {
    const normalizedUrl = (url || "").toString().trim();
    if (!normalizedUrl) return false;
    const opened = window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    if (opened) return true;
    window.location.assign(normalizedUrl);
    return true;
  };

  const handleSubscriptionAction = async (subscriptionId, action) => {
    const normalizedId = (subscriptionId || "").toString().trim();
    if (!normalizedId || !updateCustomerSubscriptionStatus) {
      setSubscriptionError("Unable to update subscription status right now.");
      return;
    }
    try {
      setSubscriptionActionBusyId(normalizedId);
      setSubscriptionStatus("");
      setSubscriptionError("");
      const result = await updateCustomerSubscriptionStatus({
        subscriptionId: normalizedId,
        action,
      });
      const data = result?.data || {};
      const statusLabel = SUBSCRIPTION_STATUS_LABELS[(data.status || "").toString().toLowerCase()] || "Updated";
      setSubscriptionStatus(`Subscription ${normalizedId.slice(0, 8)} status: ${statusLabel}.`);
    } catch (error) {
      setSubscriptionError(error?.message || "Unable to update subscription status.");
    } finally {
      setSubscriptionActionBusyId("");
    }
  };

  const sendInvoicePayLink = async (subscriptionId, { redirectToPay = false } = {}) => {
    const normalizedId = (subscriptionId || "").toString().trim();
    if (!normalizedId || !sendSubscriptionInvoiceEmailNow) {
      setSubscriptionError("Unable to send a pay link right now.");
      return;
    }
    try {
      setInvoiceActionBusyId(normalizedId);
      setSubscriptionStatus("");
      setSubscriptionError("");
      const result = await sendSubscriptionInvoiceEmailNow({
        subscriptionId: normalizedId,
      });
      const data = result?.data || {};
      const paymentMethod = normalizeSubscriptionPaymentMethod(data.paymentMethod || "");
      const invoiceLabel = (data.invoiceId || "").toString().slice(0, 8);
      const sentLabel =
        paymentMethod === PAYMENT_METHODS.EFT ? "EFT invoice email sent" : "Pay link sent";
      const warningLabel =
        paymentMethod === PAYMENT_METHODS.EFT
          ? "EFT invoice email refreshed, but delivery needs attention."
          : "Pay link refreshed, but email delivery needs attention.";
      if (data.emailStatus === "sent") {
        setSubscriptionStatus(`${sentLabel} for invoice ${invoiceLabel || "update"}.`);
      } else {
        setSubscriptionStatus(warningLabel);
      }
      if (redirectToPay && paymentMethod === PAYMENT_METHODS.PAYFAST && data.payLinkUrl) {
        navigateToSubscriptionPayLink(data.payLinkUrl);
      }
    } catch (error) {
      setSubscriptionError(error?.message || "Unable to send a subscription pay link.");
    } finally {
      setInvoiceActionBusyId("");
    }
  };

  const handleSubscriptionProofFileChange = (invoiceId, file) => {
    const normalizedInvoiceId = (invoiceId || "").toString().trim();
    if (!normalizedInvoiceId) return;
    setSubscriptionProofFiles((prev) => ({
      ...prev,
      [normalizedInvoiceId]: file || null,
    }));
  };

  const uploadSubscriptionEftProof = async (invoice) => {
    const invoiceId = (invoice?.id || "").toString().trim();
    if (!invoiceId) return;
    if (!storage || !attachSubscriptionEftPaymentProof) {
      setSubscriptionError("Subscription proof upload is unavailable right now.");
      return;
    }
    const invoiceStatus = normalizeSubscriptionInvoiceStatus(invoice?.status || "");
    const invoicePaymentMethod = normalizeSubscriptionPaymentMethod(invoice?.paymentMethod || "");
    if (invoiceStatus !== "pending-payment" || invoicePaymentMethod !== PAYMENT_METHODS.EFT) {
      setSubscriptionError("Proof can only be uploaded for pending EFT invoices.");
      return;
    }
    const selectedFile = subscriptionProofFiles[invoiceId];
    if (!selectedFile) {
      setSubscriptionError("Select a proof file before uploading.");
      return;
    }
    if (selectedFile.size > EFT_PROOF_MAX_SIZE_BYTES) {
      setSubscriptionError("Proof file is too large. Maximum size is 10 MB.");
      return;
    }
    const contentType = (selectedFile.type || "").toLowerCase();
    const acceptedContent =
      contentType === "application/pdf" ||
      contentType.startsWith("image/");
    if (!acceptedContent) {
      setSubscriptionError("Proof must be a PDF or image file.");
      return;
    }

    try {
      setSubscriptionProofBusyId(invoiceId);
      setSubscriptionStatus("");
      setSubscriptionError("");
      const safeFileName = sanitizeProofFileName(selectedFile.name || "proof");
      const storagePath = `eftProofs/subscriptions/${invoiceId}/${Date.now()}-${safeFileName}`;
      await uploadBytes(ref(storage, storagePath), selectedFile, {
        contentType: selectedFile.type || "application/octet-stream",
      });
      await attachSubscriptionEftPaymentProof({
        invoiceId,
        paymentProof: {
          storagePath,
          fileName: selectedFile.name || safeFileName,
          contentType: selectedFile.type || "application/octet-stream",
          size: selectedFile.size,
        },
      });
      setSubscriptionProofFiles((prev) => ({
        ...prev,
        [invoiceId]: null,
      }));
      setSubscriptionStatus("EFT proof uploaded. Admin will review payment approval.");
    } catch (error) {
      setSubscriptionError(error?.message || "Unable to upload subscription payment proof.");
    } finally {
      setSubscriptionProofBusyId("");
    }
  };

  const handleToggleSubscriptionMondaySlot = (subscription, slotValue) => {
    const subscriptionId = (subscription?.id || "").toString().trim();
    if (!subscriptionId) return;
    const normalizedSlot = normalizeMondaySlot(slotValue);
    if (!normalizedSlot) return;
    const tier = normalizeSubscriptionTier(
      subscription?.tier || subscription?.subscriptionPlan?.tier,
    );
    if (!tier || tier === "weekly") {
      setSubscriptionMondaySlotDrafts((prev) => ({
        ...prev,
        [subscriptionId]: getDefaultMondaySlotsForTier("weekly"),
      }));
      return;
    }
    const required = resolveRequiredMondaySlotCount(tier);
    setSubscriptionMondaySlotDrafts((prev) => {
      const current = normalizeMondaySlotsForTier(tier, prev[subscriptionId] || []);
      if (current.includes(normalizedSlot)) {
        if (current.length <= 1) return prev;
        return {
          ...prev,
          [subscriptionId]: current.filter((entry) => entry !== normalizedSlot),
        };
      }
      if (current.length >= required) {
        return {
          ...prev,
          [subscriptionId]: [...current.slice(1), normalizedSlot],
        };
      }
      return {
        ...prev,
        [subscriptionId]: [...current, normalizedSlot],
      };
    });
  };

  const saveSubscriptionMondaySlots = async (subscription) => {
    const subscriptionId = (subscription?.id || "").toString().trim();
    if (!subscriptionId || !updateCustomerSubscriptionDeliveryPreferences) {
      setSubscriptionError("Unable to update delivery preferences right now.");
      return;
    }
    const tier = normalizeSubscriptionTier(
      subscription?.tier || subscription?.subscriptionPlan?.tier,
    );
    if (!tier) {
      setSubscriptionError("Subscription tier is invalid.");
      return;
    }
    const selectedSlots = normalizeMondaySlotsForTier(
      tier,
      subscriptionMondaySlotDrafts[subscriptionId] || [],
    );
    const required = resolveRequiredMondaySlotCount(tier);
    if (tier !== "weekly" && selectedSlots.length !== required) {
      setSubscriptionError(
        tier === "bi-weekly"
          ? "Select exactly 2 Monday slots."
          : "Select exactly 1 Monday slot.",
      );
      return;
    }
    try {
      setSubscriptionPreferenceBusyId(subscriptionId);
      setSubscriptionStatus("");
      setSubscriptionError("");
      const result = await updateCustomerSubscriptionDeliveryPreferences({
        subscriptionId,
        mondaySlots: selectedSlots,
      });
      const data = result?.data || {};
      const effectiveMonth = normalizeBillingMonthKey(data.effectiveFromCycleMonth || "");
      const effectiveLabel = effectiveMonth ? formatBillingMonthLabel(effectiveMonth) : "the next cycle";
      const slotsLabel = formatMondaySlotList(data.mondaySlots || selectedSlots);
      setSubscriptionStatus(
        `Delivery Mondays updated to ${slotsLabel || "selected slots"} (effective from ${effectiveLabel}).`,
      );
      setSubscriptionMondaySlotDrafts((prev) => ({
        ...prev,
        [subscriptionId]: normalizeMondaySlotsForTier(tier, data.mondaySlots || selectedSlots),
      }));
    } catch (error) {
      setSubscriptionError(error?.message || "Unable to update delivery preferences.");
    } finally {
      setSubscriptionPreferenceBusyId("");
    }
  };

  const previewSubscriptionInvoice = async (invoiceId) => {
    const normalizedInvoiceId = (invoiceId || "").toString().trim();
    if (!normalizedInvoiceId || !generateSubscriptionInvoiceDocumentNow) {
      setSubscriptionError("Unable to generate invoice preview right now.");
      return;
    }

    try {
      setInvoicePreviewBusyId(normalizedInvoiceId);
      setSubscriptionStatus("");
      setSubscriptionError("");
      const result = await generateSubscriptionInvoiceDocumentNow({
        invoiceId: normalizedInvoiceId,
      });
      const data = result?.data || {};
      const invoiceDownloadUrl = (data.invoiceDownloadUrl || "").toString().trim();
      if (!invoiceDownloadUrl) {
        throw new Error("Invoice preview URL is unavailable.");
      }
      openUrlInNewTab(invoiceDownloadUrl);
      setSubscriptionStatus("Invoice preview opened in a new tab.");
    } catch (error) {
      setSubscriptionError(error?.message || "Unable to preview this invoice right now.");
    } finally {
      setInvoicePreviewBusyId("");
    }
  };

  const handleAddressDraftChange = (field) => (event) => {
    const value = event.target.value;
    setAddressDraft((prev) => ({ ...prev, [field]: value }));
  };

  const closeAddressDialog = () => {
    setAddressDialogOpen(false);
    setAddressDialogMode("add");
    setEditingAddressId("");
    setAddressDraft(emptyAddressDraft);
  };

  const openAddAddressDialog = () => {
    if (profileForm.addresses.length >= 10) {
      setProfileError("You can save up to 10 addresses.");
      return;
    }
    setProfileError("");
    setProfileStatus("");
    setAddressDialogMode("add");
    setEditingAddressId("");
    setAddressDraft(emptyAddressDraft);
    setAddressDialogOpen(true);
  };

  const openEditAddressDialog = (address) => {
    if (!address?.id) return;
    setProfileError("");
    setProfileStatus("");
    setAddressDialogMode("edit");
    setEditingAddressId(address.id);
    setAddressDraft({
      label: (address.label || "").toString(),
      street: (address.street || "").toString(),
      suburb: (address.suburb || "").toString(),
      city: (address.city || "").toString(),
      province: (address.province || "").toString(),
      postalCode: (address.postalCode || "").toString(),
    });
    setAddressDialogOpen(true);
  };

  const commitAddressDraft = ({ mode = "add", addressId = "" } = {}) => {
    const label = addressDraft.label.trim();
    const street = addressDraft.street.trim();
    const suburb = addressDraft.suburb.trim();
    const city = addressDraft.city.trim();
    const province = addressDraft.province.trim();
    const postalCode = addressDraft.postalCode.trim();

    if (!street || !suburb || !city || !province || !postalCode) {
      setProfileError("Complete all address fields before saving.");
      return false;
    }
    if (!/^\d{4}$/.test(postalCode)) {
      setProfileError("Postal code should be 4 digits.");
      return false;
    }
    if (mode === "add" && profileForm.addresses.length >= 10) {
      setProfileError("You can save up to 10 addresses.");
      return false;
    }

    setProfileError("");
    setProfileStatus("");

    if (mode === "edit") {
      const targetId = (addressId || "").toString().trim();
      const addressExists = profileForm.addresses.some((entry) => entry.id === targetId);
      if (!targetId || !addressExists) {
        setProfileError("This address could not be found. Please try again.");
        return false;
      }

      setProfileForm((prev) => ({
        ...prev,
        addresses: prev.addresses.map((entry) =>
          entry.id === targetId
            ? {
                ...entry,
                label: label || "Saved address",
                street,
                suburb,
                city,
                province,
                postalCode,
              }
            : entry,
        ),
      }));
      return true;
    }

    const nextAddress = {
      id: createAddressId(),
      label: label || "Saved address",
      street,
      suburb,
      city,
      province,
      postalCode,
    };

    setProfileForm((prev) => {
      const nextAddresses = [...prev.addresses, nextAddress];
      return {
        ...prev,
        addresses: nextAddresses,
        defaultAddressId: prev.defaultAddressId || nextAddress.id,
      };
    });
    return true;
  };

  const handleAddAddress = () => {
    const added = commitAddressDraft({ mode: "add" });
    if (added) {
      setAddressDraft(emptyAddressDraft);
    }
  };

  const handleAddressDialogSubmit = (event) => {
    event.preventDefault();
    const saved = commitAddressDraft({
      mode: addressDialogMode === "edit" ? "edit" : "add",
      addressId: editingAddressId,
    });
    if (saved) {
      closeAddressDialog();
    }
  };

  const handleRemoveAddress = (addressId) => {
    setProfileError("");
    setProfileStatus("");
    setProfileForm((prev) => {
      const nextAddresses = prev.addresses.filter((entry) => entry.id !== addressId);
      const nextDefault =
        prev.defaultAddressId === addressId ? nextAddresses[0]?.id || "" : prev.defaultAddressId;
      return {
        ...prev,
        addresses: nextAddresses,
        defaultAddressId: nextDefault,
      };
    });
  };

  const handleSetDefaultAddress = (addressId) => {
    setProfileError("");
    setProfileStatus("");
    setProfileForm((prev) => ({
      ...prev,
      defaultAddressId: addressId,
    }));
  };

  const renderAddressDraftFields = (idPrefix = "account-address") => (
    <div className="checkout-address-grid">
      <label htmlFor={`${idPrefix}-label`}>
        Address label
        <input
          className="input"
          id={`${idPrefix}-label`}
          type="text"
          value={addressDraft.label}
          onChange={handleAddressDraftChange("label")}
          placeholder="Home, Work, Farm..."
        />
      </label>
      <label htmlFor={`${idPrefix}-street`}>
        Street address
        <input
          className="input"
          id={`${idPrefix}-street`}
          type="text"
          value={addressDraft.street}
          onChange={handleAddressDraftChange("street")}
          required
        />
      </label>
      <label htmlFor={`${idPrefix}-suburb`}>
        Suburb
        <input
          className="input"
          id={`${idPrefix}-suburb`}
          type="text"
          value={addressDraft.suburb}
          onChange={handleAddressDraftChange("suburb")}
          required
        />
      </label>
      <label htmlFor={`${idPrefix}-city`}>
        City
        <input
          className="input"
          id={`${idPrefix}-city`}
          type="text"
          value={addressDraft.city}
          onChange={handleAddressDraftChange("city")}
          required
        />
      </label>
      <label htmlFor={`${idPrefix}-province`}>
        Province
        <select
          className="input"
          id={`${idPrefix}-province`}
          value={addressDraft.province}
          onChange={handleAddressDraftChange("province")}
          required
        >
          <option value="">Select province</option>
          {SA_PROVINCES.map((province) => (
            <option key={province.value} value={province.value}>
              {province.label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-postal-code`}>
        Postal code
        <input
          className="input"
          id={`${idPrefix}-postal-code`}
          type="text"
          value={addressDraft.postalCode}
          onChange={handleAddressDraftChange("postalCode")}
          placeholder="0000"
          pattern="\\d{4}"
          required
        />
      </label>
    </div>
  );

  const handleSignOut = async () => {
    setAuthError("");
    setAuthMessage("");
    await signOut();
  };

  const disablePage = authLoading || authBusy;
  const showAuth = !user || authBusy || (Boolean(user) && authLoading && role === "guest");
  const latestInvoiceBySubscription = useMemo(() => {
    const nextMap = new Map();
    subscriptionInvoices.forEach((invoice) => {
      const subscriptionId = (invoice.subscriptionId || "").toString().trim();
      if (!subscriptionId) return;
      const current = nextMap.get(subscriptionId);
      if (!current || invoiceSortValue(invoice) > invoiceSortValue(current)) {
        nextMap.set(subscriptionId, invoice);
      }
    });
    return nextMap;
  }, [subscriptionInvoices]);
  const { latestPendingInvoiceBySubscription, pendingInvoiceCountBySubscription } = useMemo(() => {
    const latestPending = new Map();
    const pendingCount = new Map();
    subscriptionInvoices.forEach((invoice) => {
      const subscriptionId = (invoice.subscriptionId || "").toString().trim();
      if (!subscriptionId) return;
      if (normalizeSubscriptionInvoiceStatus(invoice?.status) !== "pending-payment") return;
      pendingCount.set(subscriptionId, (pendingCount.get(subscriptionId) || 0) + 1);
      const current = latestPending.get(subscriptionId);
      if (!current || invoiceSortValue(invoice) > invoiceSortValue(current)) {
        latestPending.set(subscriptionId, invoice);
      }
    });
    return {
      latestPendingInvoiceBySubscription: latestPending,
      pendingInvoiceCountBySubscription: pendingCount,
    };
  }, [subscriptionInvoices]);
  const currentSubscriptions = useMemo(
    () =>
      subscriptions.filter(
        (subscription) => normalizeSubscriptionStatus(subscription.status) !== "cancelled",
      ),
    [subscriptions],
  );
  const cancelledSubscriptions = useMemo(
    () =>
      subscriptions.filter(
        (subscription) => normalizeSubscriptionStatus(subscription.status) === "cancelled",
      ),
    [subscriptions],
  );
  const currentSubscriptionIds = useMemo(
    () => new Set(currentSubscriptions.map((subscription) => (subscription.id || "").toString().trim()).filter(Boolean)),
    [currentSubscriptions],
  );
  const cancelledSubscriptionIds = useMemo(
    () =>
      new Set(
        cancelledSubscriptions.map((subscription) => (subscription.id || "").toString().trim()).filter(Boolean),
      ),
    [cancelledSubscriptions],
  );
  const currentSubscriptionInvoices = useMemo(
    () =>
      subscriptionInvoices.filter((invoice) => {
        const subscriptionId = (invoice.subscriptionId || "").toString().trim();
        if (subscriptionId) return currentSubscriptionIds.has(subscriptionId);
        const invoiceStatus = normalizeSubscriptionInvoiceStatus(invoice.status);
        return invoiceStatus !== "cancelled";
      }),
    [currentSubscriptionIds, subscriptionInvoices],
  );
  const cancelledSubscriptionInvoices = useMemo(
    () =>
      subscriptionInvoices.filter((invoice) => {
        const subscriptionId = (invoice.subscriptionId || "").toString().trim();
        if (subscriptionId && cancelledSubscriptionIds.has(subscriptionId)) return true;
        const invoiceStatus = normalizeSubscriptionInvoiceStatus(invoice.status);
        return invoiceStatus === "cancelled";
      }),
    [cancelledSubscriptionIds, subscriptionInvoices],
  );
  const hasSubscriptionHistory = cancelledSubscriptions.length > 0 || cancelledSubscriptionInvoices.length > 0;
  const currentBillingMonthKey = useMemo(() => getCurrentBillingMonthKey(), []);

  if (showAuth) {
    return (
      <section className="section section--tight admin-auth">
        <div className="section__inner admin-auth__inner">
          <Reveal as="div" className="admin-auth__card">
            <div className="admin-auth__header">
              <img className="admin-auth__logo" src={logo} alt="Bethany Blooms logo" loading="lazy" decoding="async" />
              <h2>{authMode === "signin" ? "Sign In" : "Create Account"}</h2>
              <p>Secure access to your orders, saved addresses, and checkout details.</p>
            </div>

            {initError && (
              <p className="admin-auth__notice" role="alert">
                Firebase credentials missing. Add them to <code>.env</code> to activate account login.
              </p>
            )}

            {authMode === "signin" ? (
              <form className="admin-auth__form" onSubmit={handleSignIn}>
                <label className="admin-auth__field" htmlFor="account-signin-email">
                  <span>Email</span>
                  <input
                    className="input"
                    id="account-signin-email"
                    type="email"
                    value={signInForm.email}
                    onChange={(event) =>
                      setSignInForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="admin-auth__field" htmlFor="account-signin-password">
                  <span>Password</span>
                  <div className="admin-auth__password-wrap">
                    <input
                      className="input"
                      id="account-signin-password"
                      type={showSignInPassword ? "text" : "password"}
                      value={signInForm.password}
                      onChange={(event) =>
                        setSignInForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      autoComplete="current-password"
                      required
                    />
                    <button
                      className="admin-auth__password-toggle"
                      type="button"
                      onClick={() => setShowSignInPassword((prev) => !prev)}
                      aria-label={showSignInPassword ? "Hide password" : "Show password"}
                    >
                      <EyeIcon open={showSignInPassword} />
                    </button>
                  </div>
                </label>
                <button className="btn btn--primary admin-auth__submit" type="submit" disabled={disablePage}>
                  {disablePage ? "Checking..." : "Sign In"}
                </button>
                {authError && (
                  <p className="admin-panel__error" role="alert">
                    {authError}
                  </p>
                )}
                {authMessage && <p className="admin-panel__status">{authMessage}</p>}
                <p className="admin-auth__helper">
                  New here?{" "}
                  <button
                    className="account-auth__link"
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError("");
                      setAuthMessage("");
                      setShowSignInPassword(false);
                    }}
                  >
                    Create account
                  </button>
                </p>
                <p className="admin-auth__helper">
                  Having trouble?{" "}
                  <button className="account-auth__link" type="button" onClick={handleForgotPassword}>
                    Forgot password
                  </button>
                </p>
              </form>
            ) : (
              <form className="admin-auth__form" onSubmit={handleSignUp}>
                <label className="admin-auth__field" htmlFor="account-signup-email">
                  <span>Email</span>
                  <input
                    className="input"
                    id="account-signup-email"
                    type="email"
                    value={signUpForm.email}
                    onChange={(event) =>
                      setSignUpForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="admin-auth__field" htmlFor="account-signup-password">
                  <span>Password</span>
                  <div className="admin-auth__password-wrap">
                    <input
                      className="input"
                      id="account-signup-password"
                      type={showSignUpPassword ? "text" : "password"}
                      value={signUpForm.password}
                      onChange={(event) =>
                        setSignUpForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                    <button
                      className="admin-auth__password-toggle"
                      type="button"
                      onClick={() => setShowSignUpPassword((prev) => !prev)}
                      aria-label={showSignUpPassword ? "Hide password" : "Show password"}
                    >
                      <EyeIcon open={showSignUpPassword} />
                    </button>
                  </div>
                </label>
                <label className="admin-auth__field" htmlFor="account-signup-confirm-password">
                  <span>Confirm password</span>
                  <div className="admin-auth__password-wrap">
                    <input
                      className="input"
                      id="account-signup-confirm-password"
                      type={showSignUpConfirmPassword ? "text" : "password"}
                      value={signUpForm.confirmPassword}
                      onChange={(event) =>
                        setSignUpForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                      }
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                    <button
                      className="admin-auth__password-toggle"
                      type="button"
                      onClick={() => setShowSignUpConfirmPassword((prev) => !prev)}
                      aria-label={showSignUpConfirmPassword ? "Hide password" : "Show password"}
                    >
                      <EyeIcon open={showSignUpConfirmPassword} />
                    </button>
                  </div>
                </label>
                <button className="btn btn--primary admin-auth__submit" type="submit" disabled={disablePage}>
                  {disablePage ? "Creating account..." : "Create account"}
                </button>
                {authError && (
                  <p className="admin-panel__error" role="alert">
                    {authError}
                  </p>
                )}
                {authMessage && <p className="admin-panel__status">{authMessage}</p>}
                <p className="admin-auth__helper">
                  Already have an account?{" "}
                  <button
                    className="account-auth__link"
                    type="button"
                    onClick={() => {
                      setAuthMode("signin");
                      setAuthError("");
                      setAuthMessage("");
                      setShowSignUpPassword(false);
                      setShowSignUpConfirmPassword(false);
                    }}
                  >
                    Sign in
                  </button>
                </p>
                <p className="admin-auth__helper">
                  Having trouble?{" "}
                  <button className="account-auth__link" type="button" onClick={handleForgotPassword}>
                    Forgot password
                  </button>
                </p>
              </form>
            )}
          </Reveal>
        </div>
      </section>
    );
  }

  return (
    <section className="section section--tight account-page">
      <div className="section__inner account-page__inner">
        <div className="account-page__header">
          <span className="badge">Account</span>
          <h1>Your account</h1>
          <p className="modal__meta">
            Save your delivery details once, track your orders, and manage subscription preferences.
          </p>
        </div>
        <div className="account-grid">
            <form className="admin-panel account-panel" onSubmit={handleProfileSave}>
              <div className="admin-panel__header">
                <h2>Profile details</h2>
                <button className="btn btn--secondary" type="button" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
              <div className="account-panel__content">
                <label>
                  Full name
                  <input
                    className="input"
                    type="text"
                    value={profileForm.fullName}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, fullName: event.target.value }))
                    }
                    autoComplete="name"
                    required
                  />
                </label>
                <label>
                  Email
                  <input className="input" type="email" value={user.email || ""} readOnly />
                </label>
                <label>
                  Phone
                  <input
                    className="input"
                    type="tel"
                    value={profileForm.phone}
                    onChange={(event) =>
                      setProfileForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                    autoComplete="tel"
                    required
                  />
                </label>
                <div className="account-subscriptions">
                  <h3>Subscriptions</h3>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={profileForm.preferences.marketingEmails}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          preferences: {
                            ...prev.preferences,
                            marketingEmails: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Receive seasonal email updates and promotions</span>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={profileForm.preferences.orderUpdates}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          preferences: {
                            ...prev.preferences,
                            orderUpdates: event.target.checked,
                          },
                        }))
                      }
                    />
                    <span>Receive order and workshop subscription updates</span>
                  </label>
                </div>
                <button className="btn btn--primary" type="submit" disabled={profileSaving || profileLoading}>
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>
                {profileError && <p className="admin-panel__error">{profileError}</p>}
                {profileStatus && <p className="admin-panel__status">{profileStatus}</p>}
              </div>
            </form>

            <section className="admin-panel account-panel">
              <div className="admin-panel__header">
                <h2>Saved delivery addresses</h2>
              </div>
              <div className="account-panel__content">
                {profileForm.addresses.length === 0 ? (
                  <>
                    {renderAddressDraftFields("account-address-inline")}
                    <button className="btn btn--secondary" type="button" onClick={handleAddAddress}>
                      Add address
                    </button>
                  </>
                ) : (
                  <div className="account-address-toolbar">
                    <button className="btn btn--secondary" type="button" onClick={openAddAddressDialog}>
                      Add another address
                    </button>
                  </div>
                )}

                {profileForm.addresses.length === 0 ? (
                  <p className="modal__meta">No saved addresses yet.</p>
                ) : (
                  <div className="account-addresses">
                    {profileForm.addresses.map((address) => {
                      const isDefault = profileForm.defaultAddressId === address.id;
                      return (
                        <article className="account-address-card" key={address.id}>
                          <p className="account-address-card__title">
                            {address.label}
                            {isDefault ? " (Default)" : ""}
                          </p>
                          <p className="modal__meta">{formatShippingAddress(address)}</p>
                          <div className="account-address-card__actions">
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => openEditAddressDialog(address)}
                            >
                              Edit
                            </button>
                            {!isDefault && (
                              <button
                                className="btn btn--secondary"
                                type="button"
                                onClick={() => handleSetDefaultAddress(address.id)}
                              >
                                Set default
                              </button>
                            )}
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => handleRemoveAddress(address.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                <p className="modal__meta">
                  Save profile after editing addresses so checkout can auto-fill delivery details.
                </p>
              </div>
            </section>

            <section className="admin-panel account-panel account-panel--subscriptions">
              <div className="admin-panel__header">
                <h2>Flower subscriptions</h2>
                <div className="account-subscription-toolbar">
                  {hasSubscriptionHistory && (
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => setSubscriptionHistoryOpen(true)}
                    >
                      View history
                    </button>
                  )}
                  <Link className="btn btn--secondary" to="/subscriptions/checkout">
                    Start new subscription
                  </Link>
                </div>
              </div>
              <div className="account-panel__content account-subscription-panel">
                <p className="modal__meta">
                  Manage your current active and paused subscriptions here. Start new subscriptions from the
                  dedicated checkout page, and use history for cancelled records.
                </p>

                {subscriptionsLoading && <p className="modal__meta">Loading subscriptions...</p>}
                {subscriptionsError && <p className="admin-panel__error">{subscriptionsError}</p>}
                {!subscriptionsLoading && !subscriptionsError && currentSubscriptions.length === 0 && (
                  <p className="modal__meta">
                    No current flower subscriptions.{" "}
                    <Link to="/subscriptions/checkout">Start a subscription checkout.</Link>
                  </p>
                )}
                {!subscriptionsLoading && !subscriptionsError && currentSubscriptions.length > 0 && (
                  <div className="account-subscription-list">
                    {currentSubscriptions.map((subscription) => {
                      const normalizedStatus = normalizeSubscriptionStatus(subscription.status);
                      const statusLabel =
                        SUBSCRIPTION_STATUS_LABELS[normalizedStatus] || normalizedStatus || "Active";
                      const latestInvoice = latestInvoiceBySubscription.get(subscription.id) || null;
                      const pendingInvoice = latestPendingInvoiceBySubscription.get(subscription.id) || null;
                      const latestInvoiceFinancials = latestInvoice
                        ? resolveSubscriptionInvoiceFinancials(latestInvoice)
                        : null;
                      const pendingInvoicePaymentMethod = normalizeSubscriptionPaymentMethod(
                        pendingInvoice?.paymentMethod || "",
                      );
                      const effectivePaymentMethod = normalizeSubscriptionPaymentMethod(
                        pendingInvoice?.paymentMethod ||
                          latestInvoice?.paymentMethod ||
                          subscription?.paymentMethod ||
                          "",
                      );
                      const paymentMethodLabel = formatSubscriptionPaymentMethodLabel(
                        effectivePaymentMethod,
                      );
                      const paymentApprovalStatus = normalizeSubscriptionPaymentApprovalStatus(
                        pendingInvoice?.paymentApprovalStatus ||
                          pendingInvoice?.paymentApproval?.decision ||
                          latestInvoice?.paymentApprovalStatus ||
                          latestInvoice?.paymentApproval?.decision ||
                          subscription?.paymentApprovalStatus ||
                          "",
                        effectivePaymentMethod,
                      );
                      const paymentApprovalLabel = formatSubscriptionPaymentApprovalLabel(
                        paymentApprovalStatus,
                      );
                      const isPendingEftInvoice =
                        Boolean(pendingInvoice) && pendingInvoicePaymentMethod === PAYMENT_METHODS.EFT;
                      const pendingInvoiceCount = pendingInvoiceCountBySubscription.get(subscription.id) || 0;
                      const pendingInvoiceTypeLabel = formatSubscriptionInvoiceTypeLabel(
                        pendingInvoice?.invoiceType || "",
                      );
                      const isActionBusy = subscriptionActionBusyId === subscription.id;
                      const isInvoiceBusy = invoiceActionBusyId === subscription.id;
                      const isPreferenceBusy = subscriptionPreferenceBusyId === subscription.id;
                      const canPause = normalizedStatus === "active";
                      const canResume = normalizedStatus === "paused";
                      const canCancel = normalizedStatus !== "cancelled";
                      const canEditDeliveryPreferences =
                        normalizedStatus === "active" || normalizedStatus === "paused";
                      const subscriptionTier = normalizeSubscriptionTier(
                        subscription?.tier || subscription?.subscriptionPlan?.tier,
                      );
                      const savedMondaySlots = normalizeMondaySlotsForTier(
                        subscriptionTier,
                        subscription?.deliveryPreference?.slots || [],
                      );
                      const draftMondaySlots = normalizeMondaySlotsForTier(
                        subscriptionTier,
                        subscriptionMondaySlotDrafts[subscription.id] || savedMondaySlots,
                      );
                      const mondaySlotsChanged =
                        JSON.stringify(draftMondaySlots) !== JSON.stringify(savedMondaySlots);
                      const isPendingInvoice = Boolean(pendingInvoice);
                      const nextBillingMonth = normalizeBillingMonthKey(subscription?.nextBillingMonth || "");
                      const payLinkBlockedUntilBillingMonth =
                        !isPendingInvoice &&
                        Boolean(nextBillingMonth) &&
                        compareBillingMonthKeys(currentBillingMonthKey, nextBillingMonth) < 0;
                      const nextInvoiceWindowMonth = payLinkBlockedUntilBillingMonth
                        ? getPreviousBillingMonthKey(nextBillingMonth) || currentBillingMonthKey
                        : "";
                      const nextInvoiceWindowLabel = nextInvoiceWindowMonth
                        ? formatBillingWindowLabel(nextInvoiceWindowMonth)
                        : "last 5 days of the month";
                      const nextBillingCycleLabel = formatBillingMonthLabel(nextBillingMonth);
                      const latestInvoiceStatus = normalizeSubscriptionInvoiceStatus(latestInvoice?.status);
                      const latestInvoiceTypeLabel = formatSubscriptionInvoiceTypeLabel(
                        latestInvoiceFinancials?.invoiceType || "",
                      );
                      const latestInvoiceStatusLabel =
                        SUBSCRIPTION_INVOICE_STATUS_LABELS[latestInvoiceStatus] ||
                        "Pending payment";
                      const pendingInvoiceAmount = Number(pendingInvoice?.amount || 0);
                      const amountDueNow =
                        isPendingInvoice && Number.isFinite(pendingInvoiceAmount) ? pendingInvoiceAmount : 0;
                      const amountDueNowLabel = formatCurrency(amountDueNow);
                      const paymentStateLabel = isPendingInvoice
                        ? isPendingEftInvoice
                          ? "Awaiting admin approval"
                          : "Payment required"
                        : latestInvoice
                          ? latestInvoiceStatus === "paid"
                            ? "Paid"
                            : "No invoice yet"
                          : "No invoice yet";
                      const amountDueMeta = isPendingInvoice
                        ? isPendingEftInvoice
                          ? `Pending ${pendingInvoiceTypeLabel.toLowerCase()} EFT invoice ${pendingInvoice?.cycleMonth || "current cycle"} (${paymentApprovalLabel.toLowerCase()}).`
                          : `Pending ${pendingInvoiceTypeLabel.toLowerCase()} PayFast invoice ${pendingInvoice?.cycleMonth || "current cycle"}.`
                        : payLinkBlockedUntilBillingMonth
                          ? `No invoice payable right now. Next invoice window: ${nextInvoiceWindowLabel}.`
                          : latestInvoice
                            ? `Latest invoice is ${latestInvoiceStatusLabel.toLowerCase()}.`
                            : "No invoice due right now.";
                      const amountDueExtraMeta = isPendingInvoice && pendingInvoiceCount > 1
                        ? `${pendingInvoiceCount} unpaid invoices on this subscription.`
                        : "";
                      const payActionLabel = isInvoiceBusy
                        ? "Preparing..."
                        : isPendingInvoice
                          ? isPendingEftInvoice
                            ? "Awaiting admin approval"
                            : "Pay now"
                          : effectivePaymentMethod === PAYMENT_METHODS.EFT
                            ? "Request EFT invoice"
                            : "Request pay link";

                      return (
                        <article key={subscription.id} className="account-subscription-card">
                          <div className="account-subscription-card__head">
                            <p>
                              <strong>{formatSubscriptionPlanLabel(subscription)}</strong>
                            </p>
                            <span className={`badge badge--stock-${normalizedStatus === "active" ? "in" : "out"}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="account-subscription-card__amount">
                            <span className="account-subscription-card__amount-label">Amount due now</span>
                            <strong>{amountDueNowLabel}</strong>
                            <span
                              className={`account-subscription-card__payment-state${isPendingInvoice ? " is-pending" : ""}`}
                            >
                              {paymentStateLabel}
                            </span>
                            <p className="modal__meta">{amountDueMeta}</p>
                            {amountDueExtraMeta && <p className="modal__meta">{amountDueExtraMeta}</p>}
                          </div>

                          <div className="account-subscription-card__facts">
                            <div className="account-subscription-fact">
                              <span>Price per delivery</span>
                              <strong>{formatCurrency(subscription.monthlyAmount)}</strong>
                            </div>
                            <div className="account-subscription-fact">
                              <span>Payment method</span>
                              <strong>{paymentMethodLabel}</strong>
                              <p className="modal__meta">{paymentApprovalLabel}</p>
                            </div>
                            <div className="account-subscription-fact">
                              <span>Billing schedule</span>
                              <strong>Last 5 days of each month</strong>
                              <p className="modal__meta">
                                {effectivePaymentMethod === PAYMENT_METHODS.EFT
                                  ? "Manual EFT invoice email for the next cycle"
                                  : "Manual PayFast payment link by email for the next cycle"}
                              </p>
                            </div>
                            {payLinkBlockedUntilBillingMonth && (
                              <div className="account-subscription-fact account-subscription-fact--notice">
                                <span>Next invoice window</span>
                                <strong>{nextInvoiceWindowLabel}</strong>
                                {!latestInvoice && (
                                  <p className="modal__meta">
                                    {nextBillingCycleLabel
                                      ? `Your first payable cycle is ${nextBillingCycleLabel}.`
                                      : "If no Mondays remained in your signup month, this is your first payable cycle."}
                                  </p>
                                )}
                              </div>
                            )}
                            {subscription?.address && (
                              <div className="account-subscription-fact account-subscription-fact--wide">
                                <span>Delivery address</span>
                                <strong>{formatShippingAddress(subscription.address)}</strong>
                              </div>
                            )}
                          </div>

                          <div className="account-subscription-delivery-preference">
                            <p className="account-subscription-delivery-preference__title">
                              Delivery Mondays
                            </p>
                            <p className="modal__meta">
                              {formatMondaySlotList(draftMondaySlots) || "Not set"}
                            </p>
                            {canEditDeliveryPreferences && subscriptionTier !== "weekly" && (
                              <>
                                <p className="modal__meta">
                                  Select {resolveRequiredMondaySlotCount(subscriptionTier)} Monday
                                  {resolveRequiredMondaySlotCount(subscriptionTier) > 1 ? "s" : ""}.
                                </p>
                                <div className="account-subscription-slot-options">
                                  {SUBSCRIPTION_MONDAY_SLOTS.map((slot) => {
                                    const checked = draftMondaySlots.includes(slot.value);
                                    return (
                                      <label
                                        key={`${subscription.id}-${slot.value}`}
                                        className={`account-subscription-slot-option${checked ? " is-selected" : ""}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={isPreferenceBusy}
                                          onChange={() => handleToggleSubscriptionMondaySlot(subscription, slot.value)}
                                        />
                                        <span>{slot.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                                <button
                                  className="btn btn--secondary"
                                  type="button"
                                  disabled={isPreferenceBusy || !mondaySlotsChanged}
                                  onClick={() => saveSubscriptionMondaySlots(subscription)}
                                >
                                  {isPreferenceBusy ? "Saving..." : "Save delivery Mondays"}
                                </button>
                              </>
                            )}
                            {subscriptionTier === "weekly" && (
                              <p className="modal__meta">Weekly plans always deliver on all Mondays.</p>
                            )}
                          </div>
                          {latestInvoice && (
                            <div className="account-subscription-card__invoice">
                              <p className="modal__meta">Latest invoice</p>
                              <strong>
                                {latestInvoice.cycleMonth || "current"} - {formatCurrency(latestInvoiceFinancials?.amount || latestInvoice.amount)}
                              </strong>
                              <p className="modal__meta">
                                {latestInvoiceTypeLabel} | Base {formatCurrency(latestInvoiceFinancials?.baseAmount || 0)} | Adjustments {formatCurrency(latestInvoiceFinancials?.adjustmentsTotal || 0)}
                              </p>
                              <span className="badge badge--stock-out">
                                {latestInvoiceStatusLabel}
                              </span>
                            </div>
                          )}
                          {isPendingEftInvoice && pendingInvoice && (
                            <div className="account-subscription-proof">
                              <p className="modal__meta">
                                EFT payment is pending admin approval. Upload proof of payment (optional) to speed up review.
                              </p>
                              <div className="account-subscription-proof__actions">
                                <input
                                  className="input"
                                  type="file"
                                  accept={EFT_PROOF_ACCEPT}
                                  onChange={(event) =>
                                    handleSubscriptionProofFileChange(
                                      pendingInvoice.id,
                                      event.target.files?.[0] || null,
                                    )
                                  }
                                />
                                <button
                                  className="btn btn--secondary"
                                  type="button"
                                  disabled={
                                    subscriptionProofBusyId === pendingInvoice.id ||
                                    !subscriptionProofFiles[pendingInvoice.id]
                                  }
                                  onClick={() => uploadSubscriptionEftProof(pendingInvoice)}
                                >
                                  {subscriptionProofBusyId === pendingInvoice.id ? "Uploading..." : "Upload proof"}
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="account-subscription-card__actions">
                            {canPause && (
                              <button
                                className="btn btn--secondary"
                                type="button"
                                disabled={isActionBusy}
                                onClick={() => handleSubscriptionAction(subscription.id, "pause")}
                              >
                                {isActionBusy ? "Updating..." : "Pause"}
                              </button>
                            )}
                            {canResume && (
                              <button
                                className="btn btn--secondary"
                                type="button"
                                disabled={isActionBusy}
                                onClick={() => handleSubscriptionAction(subscription.id, "resume")}
                              >
                                {isActionBusy ? "Updating..." : "Resume"}
                              </button>
                            )}
                            {canCancel && (
                              <button
                                className="btn btn--secondary"
                                type="button"
                                disabled={isActionBusy}
                                onClick={() => handleSubscriptionAction(subscription.id, "cancel")}
                              >
                                {isActionBusy ? "Updating..." : "Cancel"}
                              </button>
                            )}
                            <button
                              className={`btn ${isPendingInvoice ? "btn--primary" : "btn--secondary"}`}
                              type="button"
                              disabled={
                                isInvoiceBusy ||
                                payLinkBlockedUntilBillingMonth ||
                                isPendingEftInvoice
                              }
                              onClick={() =>
                                sendInvoicePayLink(subscription.id, { redirectToPay: isPendingInvoice })
                              }
                            >
                              {payActionLabel}
                            </button>
                            <button
                              className="btn btn--secondary"
                              type="button"
                              disabled={isInvoiceBusy || payLinkBlockedUntilBillingMonth}
                              onClick={() => sendInvoicePayLink(subscription.id)}
                            >
                              {isInvoiceBusy
                                ? "Sending..."
                                : effectivePaymentMethod === PAYMENT_METHODS.EFT
                                  ? "Resend EFT invoice"
                                  : "Resend pay link"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="account-subscription-invoices">
                  <h3>Current subscription invoices</h3>
                  {invoicesLoading && <p className="modal__meta">Loading invoices...</p>}
                  {invoicesError && <p className="admin-panel__error">{invoicesError}</p>}
                  {!invoicesLoading && !invoicesError && currentSubscriptionInvoices.length === 0 && (
                    <p className="modal__meta">No invoices for current subscriptions yet.</p>
                  )}
                  {!invoicesLoading && !invoicesError && currentSubscriptionInvoices.length > 0 && (
                    <div className="account-order-items">
                      {currentSubscriptionInvoices.map((invoice) => {
                        const invoiceStatus = normalizeSubscriptionInvoiceStatus(invoice.status);
                        const invoiceFinancials = resolveSubscriptionInvoiceFinancials(invoice);
                        const invoiceTypeLabel = formatSubscriptionInvoiceTypeLabel(
                          invoiceFinancials.invoiceType,
                        );
                        const invoicePaymentMethod = normalizeSubscriptionPaymentMethod(
                          invoice?.paymentMethod || "",
                        );
                        const invoicePaymentApprovalStatus = normalizeSubscriptionPaymentApprovalStatus(
                          invoice?.paymentApprovalStatus || invoice?.paymentApproval?.decision || "",
                          invoicePaymentMethod,
                        );
                        const invoicePaymentApprovalLabel = formatSubscriptionPaymentApprovalLabel(
                          invoicePaymentApprovalStatus,
                        );
                        const invoiceDownloadUrl = getInvoiceDownloadUrl(invoice);
                        const isPreviewBusy = invoicePreviewBusyId === invoice.id;
                        const isProofBusy = subscriptionProofBusyId === invoice.id;
                        const proofFile = subscriptionProofFiles[invoice.id];
                        const canUploadProof =
                          invoicePaymentMethod === PAYMENT_METHODS.EFT &&
                          invoiceStatus === "pending-payment";
                        return (
                          <article key={invoice.id} className="account-order-item-card">
                            <div className="account-order-item-card__head">
                              <p className="account-order-item-card__name">
                                {invoice.cycleMonth || "Cycle"} - {formatCurrency(invoiceFinancials.amount)}
                              </p>
                              <span className={`badge badge--stock-${invoiceStatus === "paid" ? "in" : "out"}`}>
                                {SUBSCRIPTION_INVOICE_STATUS_LABELS[invoiceStatus] || "Pending payment"}
                              </span>
                            </div>
                            <p className="modal__meta">
                              {formatSubscriptionPlanLabel(invoice)}
                            </p>
                            <p className="modal__meta">
                              {invoiceTypeLabel} invoice | Base {formatCurrency(invoiceFinancials.baseAmount)} | Adjustments {formatCurrency(invoiceFinancials.adjustmentsTotal)}
                            </p>
                            {invoiceFinancials.adjustments.length > 0 && (
                              <p className="modal__meta">
                                {invoiceFinancials.adjustments
                                  .map((entry) => `${entry?.label || "Adjustment"}: ${formatCurrency(entry?.amount || 0)}`)
                                  .join(" | ")}
                              </p>
                            )}
                            <p className="modal__meta">
                              Payment: {formatSubscriptionPaymentMethodLabel(invoicePaymentMethod)} |{" "}
                              {invoicePaymentApprovalLabel}
                            </p>
                            <p className="modal__meta">
                              Updated: {formatOrderDate(invoice.updatedAt || invoice.createdAt)}
                            </p>
                            <div className="account-subscription-card__actions">
                              <button
                                className="btn btn--secondary"
                                type="button"
                                onClick={() => previewSubscriptionInvoice(invoice.id)}
                                disabled={isPreviewBusy}
                              >
                                {isPreviewBusy ? "Preparing..." : "Preview invoice"}
                              </button>
                              {invoiceDownloadUrl && (
                                <a
                                  className="btn btn--secondary"
                                  href={invoiceDownloadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Download invoice
                                </a>
                              )}
                              {canUploadProof && (
                                <button
                                  className="btn btn--secondary"
                                  type="button"
                                  disabled={isProofBusy || !proofFile}
                                  onClick={() => uploadSubscriptionEftProof(invoice)}
                                >
                                  {isProofBusy ? "Uploading..." : "Upload proof"}
                                </button>
                              )}
                            </div>
                            {canUploadProof && (
                              <label className="account-subscription-proof__field">
                                Proof of payment (optional)
                                <input
                                  className="input"
                                  type="file"
                                  accept={EFT_PROOF_ACCEPT}
                                  onChange={(event) =>
                                    handleSubscriptionProofFileChange(
                                      invoice.id,
                                      event.target.files?.[0] || null,
                                    )
                                  }
                                />
                              </label>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                {subscriptionError && <p className="admin-panel__error">{subscriptionError}</p>}
                {subscriptionStatus && <p className="admin-panel__status">{subscriptionStatus}</p>}
              </div>
            </section>

            <section className="admin-panel account-panel account-panel--orders">
              <div className="admin-panel__header">
                <h2>Your orders</h2>
                <Link className="btn btn--secondary" to="/cart">
                  Go to checkout
                </Link>
              </div>
              <div className="account-panel__content">
                {ordersLoading && <p className="modal__meta">Loading your orders...</p>}
                {ordersError && <p className="admin-panel__error">{ordersError}</p>}
                {!ordersLoading && !ordersError && orders.length === 0 && (
                  <p className="modal__meta">No orders yet. Place your first order from the cart.</p>
                )}
                {!ordersLoading && !ordersError && orders.length > 0 && (
                  <div className="account-orders">
                    {orders.map((order) => (
                      <Link className="account-order-card account-order-card--link" key={order.id} to={`/account/orders/${order.id}`}>
                        <div className="account-order-card__head">
                          <p>
                            <strong>Order #{order.orderNumber || order.id.slice(0, 8)}</strong>
                          </p>
                          <span className={`badge badge--stock-${order.paymentStatus === "paid" ? "in" : "out"}`}>
                            {order.paymentStatus || "pending"}
                          </span>
                        </div>
                        <p className="modal__meta">{formatOrderDate(order.createdAt)}</p>
                        <p className="modal__meta">Status: {(order.status || "pending").toString()}</p>
                        <p className="modal__meta">Total: R{Number(order.totalPrice || 0).toFixed(2)}</p>
                        <p className="account-order-card__cta">View full order details</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
      </div>

      {addressDialogOpen && (
        <div
          className="modal is-active"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-address-dialog-title"
          onClick={closeAddressDialog}
        >
          <div className="modal__content account-address-dialog" onClick={(event) => event.stopPropagation()}>
            <button className="modal__close" type="button" onClick={closeAddressDialog} aria-label="Close address form">
              X
            </button>
            <h3 className="modal__title" id="account-address-dialog-title">
              {addressDialogMode === "edit" ? "Edit address" : "Add another address"}
            </h3>
            <form className="account-address-dialog__form" onSubmit={handleAddressDialogSubmit}>
              {renderAddressDraftFields("account-address-dialog")}
              <div className="account-address-dialog__actions">
                <button className="btn btn--secondary" type="button" onClick={closeAddressDialog}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="submit">
                  {addressDialogMode === "edit" ? "Save address" : "Add address"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {subscriptionHistoryOpen && (
        <div
          className="modal is-active"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-subscription-history-title"
          onClick={() => setSubscriptionHistoryOpen(false)}
        >
          <div
            className="modal__content account-subscription-history-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal__close"
              type="button"
              onClick={() => setSubscriptionHistoryOpen(false)}
              aria-label="Close subscription history"
            >
              X
            </button>
            <h3 className="modal__title" id="account-subscription-history-title">
              Cancelled subscription history
            </h3>
            <p className="modal__meta">
              Archived records for cancelled subscriptions and their related invoices.
            </p>

            <div className="account-subscription-history">
              <section className="account-subscription-history__section">
                <h4>Cancelled subscriptions</h4>
                {cancelledSubscriptions.length === 0 ? (
                  <p className="modal__meta">No cancelled subscriptions in history.</p>
                ) : (
                  <div className="account-subscription-list">
                    {cancelledSubscriptions.map((subscription) => {
                      const normalizedStatus = normalizeSubscriptionStatus(subscription.status);
                      const latestInvoice = latestInvoiceBySubscription.get(subscription.id) || null;
                      return (
                        <article key={subscription.id} className="account-subscription-card">
                          <div className="account-subscription-card__head">
                            <p>
                              <strong>{formatSubscriptionPlanLabel(subscription)}</strong>
                            </p>
                            <span className="badge badge--stock-out">
                              {SUBSCRIPTION_STATUS_LABELS[normalizedStatus] || "Cancelled"}
                            </span>
                          </div>
                          <p className="modal__meta">Price per delivery: {formatCurrency(subscription.monthlyAmount)}</p>
                          <p className="modal__meta">
                            Closed: {formatOrderDate(subscription.cancelledAt || subscription.updatedAt || subscription.createdAt)}
                          </p>
                          {subscription?.address && (
                            <p className="modal__meta">
                              Delivery: {formatShippingAddress(subscription.address)}
                            </p>
                          )}
                          {latestInvoice && (
                            <p className="modal__meta">
                              Latest invoice ({latestInvoice.cycleMonth || "current"}):{" "}
                              {formatCurrency(latestInvoice.amount)} -{" "}
                              {SUBSCRIPTION_INVOICE_STATUS_LABELS[
                                normalizeSubscriptionInvoiceStatus(latestInvoice.status)
                              ] || "Pending payment"}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="account-subscription-history__section">
                <h4>Related invoices</h4>
                {cancelledSubscriptionInvoices.length === 0 ? (
                  <p className="modal__meta">No cancelled invoices in history.</p>
                ) : (
                  <div className="account-order-items">
                    {cancelledSubscriptionInvoices.map((invoice) => {
                      const invoiceStatus = normalizeSubscriptionInvoiceStatus(invoice.status);
                      const invoiceFinancials = resolveSubscriptionInvoiceFinancials(invoice);
                      const invoiceTypeLabel = formatSubscriptionInvoiceTypeLabel(
                        invoiceFinancials.invoiceType,
                      );
                      const invoiceDownloadUrl = getInvoiceDownloadUrl(invoice);
                      const isPreviewBusy = invoicePreviewBusyId === invoice.id;
                      return (
                        <article key={invoice.id} className="account-order-item-card">
                          <div className="account-order-item-card__head">
                            <p className="account-order-item-card__name">
                              {invoice.cycleMonth || "Cycle"} - {formatCurrency(invoiceFinancials.amount)}
                            </p>
                            <span className={`badge badge--stock-${invoiceStatus === "paid" ? "in" : "out"}`}>
                              {SUBSCRIPTION_INVOICE_STATUS_LABELS[invoiceStatus] || "Pending payment"}
                            </span>
                          </div>
                          <p className="modal__meta">{formatSubscriptionPlanLabel(invoice)}</p>
                          <p className="modal__meta">
                            {invoiceTypeLabel} invoice | Base {formatCurrency(invoiceFinancials.baseAmount)} | Adjustments {formatCurrency(invoiceFinancials.adjustmentsTotal)}
                          </p>
                          <p className="modal__meta">
                            Updated: {formatOrderDate(invoice.updatedAt || invoice.createdAt)}
                          </p>
                          <div className="account-subscription-card__actions">
                            <button
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => previewSubscriptionInvoice(invoice.id)}
                              disabled={isPreviewBusy}
                            >
                              {isPreviewBusy ? "Preparing..." : "Preview invoice"}
                            </button>
                            {invoiceDownloadUrl && (
                              <a
                                className="btn btn--secondary"
                                href={invoiceDownloadUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download invoice
                              </a>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AccountPage;


