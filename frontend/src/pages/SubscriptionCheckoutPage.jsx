import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useCustomerProfile } from "../hooks/useCustomerProfile.js";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { buildWhatsAppLink } from "../lib/contactInfo.js";
import { getFirebaseDb, getFirebaseFunctions } from "../lib/firebase.js";
import { PAYMENT_METHODS, normalizePaymentMethod } from "../lib/paymentMethods.js";
import { formatShippingAddress } from "../lib/shipping.js";

const normalizeSubscriptionPlanStatus = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "live") return "live";
  if (normalized === "archived") return "archived";
  return "draft";
};

const normalizeSubscriptionTier = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "biweekly") return "bi-weekly";
  if (normalized === "weekly" || normalized === "bi-weekly" || normalized === "monthly") {
    return normalized;
  }
  return "";
};

const SUBSCRIPTION_MONDAY_SLOTS = Object.freeze([
  { value: "first", label: "1st Monday" },
  { value: "second", label: "2nd Monday" },
  { value: "third", label: "3rd Monday" },
  { value: "fourth", label: "4th Monday" },
  { value: "last", label: "Last Monday" },
]);

const SUBSCRIPTION_PAYMENT_METHOD_OPTIONS = Object.freeze([
  {
    value: PAYMENT_METHODS.PAYFAST,
    label: "PayFast",
    description: "Instant pay-now link by email.",
  },
  {
    value: PAYMENT_METHODS.EFT,
    label: "EFT",
    description: "Manual EFT invoice, then admin approval.",
  },
]);

const normalizeMondaySlot = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return SUBSCRIPTION_MONDAY_SLOTS.some((entry) => entry.value === normalized) ? normalized : "";
};

const resolveRequiredMondaySlotCount = (tier = "") => {
  const normalizedTier = normalizeSubscriptionTier(tier);
  if (normalizedTier === "weekly") return 5;
  if (normalizedTier === "bi-weekly") return 2;
  if (normalizedTier === "monthly") return 1;
  return 0;
};

const getDefaultMondaySlotsForTier = (tier = "") => {
  const normalizedTier = normalizeSubscriptionTier(tier);
  if (normalizedTier === "weekly") {
    return SUBSCRIPTION_MONDAY_SLOTS.map((entry) => entry.value);
  }
  if (normalizedTier === "bi-weekly") return ["first", "third"];
  if (normalizedTier === "monthly") return ["first"];
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
  if (normalized.length >= required) {
    return normalized.slice(0, required);
  }
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

const formatMondaySlotList = (slots = []) => {
  const labels = (Array.isArray(slots) ? slots : [])
    .map((entry) => formatMondaySlotLabel(entry))
    .filter(Boolean);
  return labels.join(", ");
};

const toPositivePrice = (value = "") => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(2));
};

const normalizeSubscriptionPlanRecord = (plan = {}) => {
  const id = (plan?.id || "").toString().trim();
  if (!id) return null;
  const tier = normalizeSubscriptionTier(plan?.tier);
  const monthlyAmount = toPositivePrice(plan?.monthlyAmount ?? plan?.monthly_amount);
  const description = (
    plan?.description ??
    plan?.short_description ??
    plan?.shortDescription ??
    ""
  )
    .toString()
    .trim();
  if (!tier || !monthlyAmount) return null;
  return {
    id,
    name: (plan?.name || plan?.title || "").toString().trim() || "Flower subscription",
    description,
    tier,
    monthlyAmount,
  };
};

const formatCurrency = (value) => `R${Number(value || 0).toFixed(2)}`;

const resolveMoneyValue = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    if (typeof candidate === "string" && candidate.trim() === "") continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Number(parsed.toFixed(2));
    }
  }
  return 0;
};

const resolvePositiveMoneyValue = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    if (typeof candidate === "string" && candidate.trim() === "") continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Number(parsed.toFixed(2));
    }
  }
  return 0;
};

const formatTierLabel = (tier = "") => {
  const normalized = normalizeSubscriptionTier(tier);
  if (normalized === "weekly") return "Weekly";
  if (normalized === "bi-weekly") return "Bi-weekly";
  if (normalized === "monthly") return "Monthly";
  return "";
};

const normalizeMonthKey = (value = "") => {
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

const formatMonthKeyLabel = (monthKey = "") => {
  const normalized = normalizeMonthKey(monthKey);
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

const formatDeliveryDate = (value = "") => {
  const normalized = (value || "").toString().trim();
  if (!normalized) return "";
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatDeliveryDateList = (values = []) =>
  (Array.isArray(values) ? values : [])
    .map((entry) => formatDeliveryDate(entry))
    .filter(Boolean)
    .join(", ");

const getJohannesburgDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 0);
  const day = Number(parts.find((part) => part.type === "day")?.value || 0);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  return {
    year,
    month,
    day,
    monthKey: `${year}-${String(month).padStart(2, "0")}`,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
};

const getNextMonthKey = (monthKey = "") => {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return "";
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
};

const compareIsoDateKey = (left = "", right = "") => {
  if (!left || !right) return 0;
  if (left === right) return 0;
  return left > right ? 1 : -1;
};

const listMondaysForMonthKey = (monthKey = "") => {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return [];
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mondays = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const probeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Johannesburg",
      weekday: "long",
    })
      .format(probeDate)
      .toLowerCase();
    if (weekday === "monday") {
      mondays.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  return mondays;
};

const resolveCycleDeliveryDatesForMonth = (tier = "", slots = [], monthKey = "") => {
  const normalizedTier = normalizeSubscriptionTier(tier);
  const mondays = listMondaysForMonthKey(monthKey);
  if (!normalizedTier || !mondays.length) return [];
  if (normalizedTier === "weekly") return mondays;

  const mondayMap = {
    first: mondays[0] || "",
    second: mondays[1] || "",
    third: mondays[2] || "",
    fourth: mondays[3] || "",
    last: mondays[mondays.length - 1] || "",
  };
  const required = resolveRequiredMondaySlotCount(normalizedTier);
  const normalizedSlots = normalizeMondaySlotsForTier(normalizedTier, slots);
  const selectedDates = [];
  const seen = new Set();

  normalizedSlots.forEach((slot) => {
    const dateKey = mondayMap[slot];
    if (!dateKey || seen.has(dateKey)) return;
    seen.add(dateKey);
    selectedDates.push(dateKey);
  });

  for (const mondayDate of mondays) {
    if (selectedDates.length >= required) break;
    if (seen.has(mondayDate)) continue;
    seen.add(mondayDate);
    selectedDates.push(mondayDate);
  }

  return selectedDates.slice(0, required).sort((left, right) => compareIsoDateKey(left, right));
};

const calculateInvoicePreview = ({
  tier = "",
  perDeliveryAmount = 0,
  mondaySlots = [],
}) => {
  const normalizedTier = normalizeSubscriptionTier(tier);
  const deliveryAmount = Number(perDeliveryAmount || 0);
  if (!normalizedTier || !Number.isFinite(deliveryAmount) || deliveryAmount <= 0) return null;

  const nowParts = getJohannesburgDateParts(new Date());
  if (!nowParts?.monthKey || !nowParts?.dateKey) return null;

  const cycleDates = resolveCycleDeliveryDatesForMonth(normalizedTier, mondaySlots, nowParts.monthKey);
  const remainingDates = cycleDates.filter((dateKey) => compareIsoDateKey(dateKey, nowParts.dateKey) > 0);

  if (remainingDates.length > 0 && cycleDates.length > 0) {
    const invoiceAmount = Number((deliveryAmount * remainingDates.length).toFixed(2));
    const cycleAmount = Number((deliveryAmount * cycleDates.length).toFixed(2));
    return {
      cycleMonth: nowParts.monthKey,
      perDeliveryAmount: deliveryAmount,
      invoiceAmount,
      cycleAmount,
      totalDeliveries: cycleDates.length,
      chargedDeliveries: remainingDates.length,
      isProrated: remainingDates.length < cycleDates.length,
      deliveryDates: remainingDates,
    };
  }

  const nextMonthKey = getNextMonthKey(nowParts.monthKey);
  if (!nextMonthKey) return null;
  const nextCycleDates = resolveCycleDeliveryDatesForMonth(normalizedTier, mondaySlots, nextMonthKey);
  const invoiceAmount = Number((deliveryAmount * nextCycleDates.length).toFixed(2));
  return {
    cycleMonth: nextMonthKey,
    perDeliveryAmount: deliveryAmount,
    invoiceAmount,
    cycleAmount: invoiceAmount,
    totalDeliveries: nextCycleDates.length,
    chargedDeliveries: nextCycleDates.length,
    isProrated: false,
    deliveryDates: nextCycleDates,
    startsNextCycle: true,
  };
};

function SubscriptionCheckoutPage() {
  usePageMetadata({
    title: "Subscription Checkout | Bethany Blooms",
    description: "Review your details and create your flower subscription before payment.",
  });

  const { user, role, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, saveProfile, saving: profileSaving } = useCustomerProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPlanId = (searchParams.get("planId") || "").toString().trim();

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [mondaySlots, setMondaySlots] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS.PAYFAST);
  const [eftApproved, setEftApproved] = useState(false);
  const [eftSettingsLoading, setEftSettingsLoading] = useState(false);
  const [eftSettingsError, setEftSettingsError] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressId, setAddressId] = useState("");

  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [successDialog, setSuccessDialog] = useState(null);

  const db = useMemo(() => {
    try {
      return getFirebaseDb();
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

  const createCustomerSubscription = useMemo(
    () =>
      functionsInstance
        ? httpsCallable(functionsInstance, "createCustomerSubscription")
        : null,
    [functionsInstance],
  );

  const checkoutPath = useMemo(() => {
    const query = searchParams.toString();
    return `/subscriptions/checkout${query ? `?${query}` : ""}`;
  }, [searchParams]);

  const accountSignInUrl = `/account?next=${encodeURIComponent(checkoutPath)}`;
  const accountSignUpUrl = `/account?mode=signup&next=${encodeURIComponent(checkoutPath)}`;

  const addressOptions = useMemo(
    () =>
      (Array.isArray(profile?.addresses) ? profile.addresses : [])
        .map((entry) => ({
          id: (entry?.id || "").toString().trim(),
          label: (entry?.label || "Saved address").toString().trim() || "Saved address",
          value: formatShippingAddress(entry),
        }))
        .filter((entry) => entry.id && entry.value),
    [profile?.addresses],
  );

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId],
  );
  const selectedAddress = useMemo(
    () => addressOptions.find((entry) => entry.id === addressId) || null,
    [addressId, addressOptions],
  );
  const requiredMondaySlots = useMemo(
    () => resolveRequiredMondaySlotCount(selectedPlan?.tier || ""),
    [selectedPlan?.tier],
  );
  const selectedSlotLabel = useMemo(
    () => formatMondaySlotList(mondaySlots),
    [mondaySlots],
  );
  const selectedPaymentMethod = useMemo(
    () => normalizePaymentMethod(paymentMethod),
    [paymentMethod],
  );
  const eftApprovalWhatsappUrl = useMemo(
    () => buildWhatsAppLink("Hi Bethany Blooms, please approve my account for subscription EFT billing."),
    [],
  );
  const invoicePreview = useMemo(() => {
    if (!selectedPlan) return null;
    const normalizedTier = normalizeSubscriptionTier(selectedPlan.tier);
    if (!normalizedTier) return null;
    const normalizedMondaySlots = normalizeMondaySlotsForTier(normalizedTier, mondaySlots);
    return calculateInvoicePreview({
      tier: normalizedTier,
      perDeliveryAmount: selectedPlan.monthlyAmount,
      mondaySlots: normalizedMondaySlots,
    });
  }, [mondaySlots, selectedPlan]);

  useEffect(() => {
    if (!db) {
      setPlans([]);
      setPlansLoading(false);
      setPlansError("Firestore is not configured.");
      return undefined;
    }

    setPlansLoading(true);
    setPlansError("");
    const plansRef = collection(db, "subscriptionPlans");
    const unsubscribe = onSnapshot(
      plansRef,
      (snapshot) => {
        const nextPlans = snapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }))
          .filter((plan) => normalizeSubscriptionPlanStatus(plan?.status || "draft") === "live")
          .map((plan) => normalizeSubscriptionPlanRecord(plan))
          .filter(Boolean)
          .sort((left, right) => left.name.localeCompare(right.name));
        setPlans(nextPlans);
        setPlansLoading(false);
        setPlansError("");
      },
      (error) => {
        console.warn("Failed to load subscription plans", error);
        setPlans([]);
        setPlansLoading(false);
        setPlansError("Unable to load subscription plans right now.");
      },
    );
    return unsubscribe;
  }, [db]);

  useEffect(() => {
    if (!plans.length) {
      if (selectedPlanId) setSelectedPlanId("");
      return;
    }

    let nextPlanId = selectedPlanId;
    if (requestedPlanId && plans.some((entry) => entry.id === requestedPlanId)) {
      nextPlanId = requestedPlanId;
    }
    if (!nextPlanId || !plans.some((entry) => entry.id === nextPlanId)) {
      nextPlanId = plans[0].id;
    }
    if (nextPlanId !== selectedPlanId) {
      setSelectedPlanId(nextPlanId);
    }

    const currentPlanParam = (searchParams.get("planId") || "").toString().trim();
    if (nextPlanId && currentPlanParam !== nextPlanId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("planId", nextPlanId);
      setSearchParams(nextParams, { replace: true });
    }
  }, [plans, requestedPlanId, searchParams, selectedPlanId, setSearchParams]);

  useEffect(() => {
    const normalizedTier = normalizeSubscriptionTier(selectedPlan?.tier || "");
    if (!normalizedTier) {
      setMondaySlots([]);
      return;
    }
    setMondaySlots((prev) => normalizeMondaySlotsForTier(normalizedTier, prev));
  }, [selectedPlan?.id, selectedPlan?.tier]);

  useEffect(() => {
    if (!db || !user?.uid) {
      setEftApproved(false);
      setEftSettingsLoading(false);
      setEftSettingsError("");
      return undefined;
    }

    setEftSettingsLoading(true);
    setEftSettingsError("");
    const settingsRef = doc(db, "subscriptionCustomerSettings", user.uid);
    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        const data = snapshot.data() || {};
        setEftApproved(Boolean(data?.eftApproved));
        setEftSettingsLoading(false);
        setEftSettingsError("");
      },
      (error) => {
        console.warn("Failed to load subscription EFT settings", error);
        setEftApproved(false);
        setEftSettingsLoading(false);
        setEftSettingsError("Unable to verify EFT approval right now.");
      },
    );
    return unsubscribe;
  }, [db, user?.uid]);

  useEffect(() => {
    if (!eftApproved && selectedPaymentMethod === PAYMENT_METHODS.EFT) {
      setPaymentMethod(PAYMENT_METHODS.PAYFAST);
    }
  }, [eftApproved, selectedPaymentMethod]);

  useEffect(() => {
    if (!profile) return;
    setFullName((prev) => prev || (profile.fullName || "").toString().trim());
    setPhone((prev) => prev || (profile.phone || "").toString().trim());
    const defaultAddressId = (profile.defaultAddressId || "").toString().trim();
    const resolvedAddressId =
      (defaultAddressId &&
        addressOptions.some((entry) => entry.id === defaultAddressId) &&
        defaultAddressId) ||
      addressOptions[0]?.id ||
      "";
    setAddressId((prev) => {
      if (prev && addressOptions.some((entry) => entry.id === prev)) return prev;
      return resolvedAddressId;
    });
  }, [addressOptions, profile]);

  const handlePlanChange = (event) => {
    const nextId = (event.target.value || "").toString().trim();
    setSelectedPlanId(nextId);
    setSuccessDialog(null);
    const nextParams = new URLSearchParams(searchParams);
    if (nextId) {
      nextParams.set("planId", nextId);
    } else {
      nextParams.delete("planId");
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleToggleMondaySlot = (slotValue) => {
    if (!selectedPlan) return;
    const normalizedSlot = normalizeMondaySlot(slotValue);
    if (!normalizedSlot) return;
    const normalizedTier = normalizeSubscriptionTier(selectedPlan.tier);
    if (normalizedTier === "weekly") {
      setMondaySlots(getDefaultMondaySlotsForTier("weekly"));
      return;
    }
    const required = resolveRequiredMondaySlotCount(normalizedTier);
    if (!required) return;
    setMondaySlots((prev) => {
      const current = normalizeMondaySlotsForTier(normalizedTier, prev);
      if (current.includes(normalizedSlot)) {
        if (current.length <= 1) return current;
        return current.filter((entry) => entry !== normalizedSlot);
      }
      if (current.length >= required) {
        return [...current.slice(1), normalizedSlot];
      }
      return [...current, normalizedSlot];
    });
  };

  const handleCreateSubscription = async (event) => {
    event.preventDefault();
    if (checkoutBusy || profileSaving) return;
    if (!user) {
      setCheckoutError("Sign in before creating a subscription.");
      return;
    }
    if (role === "admin") {
      setCheckoutError("Subscriptions can only be created from customer accounts.");
      return;
    }
    if (!createCustomerSubscription) {
      setCheckoutError("Subscription checkout is not configured yet.");
      return;
    }
    if (!selectedPlan) {
      setCheckoutError("Select a subscription plan before continuing.");
      return;
    }
    const normalizedAddressId = (addressId || "").toString().trim();
    if (!normalizedAddressId) {
      setCheckoutError("Select a delivery address before continuing.");
      return;
    }
    const normalizedName = (fullName || "").toString().trim();
    const normalizedPhone = (phone || "").toString().trim();
    if (!normalizedName) {
      setCheckoutError("Add your full name before continuing.");
      return;
    }
    if (!normalizedPhone) {
      setCheckoutError("Add your phone number before continuing.");
      return;
    }
    if (selectedPaymentMethod === PAYMENT_METHODS.EFT && !eftApproved) {
      setCheckoutError(
        "EFT is admin-approved only for subscriptions. Please contact us on WhatsApp for approval.",
      );
      return;
    }

    try {
      setCheckoutBusy(true);
      setCheckoutStatus("");
      setCheckoutError("");
      setSuccessDialog(null);

      const normalizedTier = normalizeSubscriptionTier(selectedPlan.tier);
      const normalizedMondaySlots = normalizeMondaySlotsForTier(normalizedTier, mondaySlots);
      const requiredSlots = resolveRequiredMondaySlotCount(normalizedTier);
      if (
        normalizedTier !== "weekly" &&
        normalizedMondaySlots.length !== requiredSlots
      ) {
        throw new Error(
          normalizedTier === "bi-weekly"
            ? "Select exactly 2 Monday delivery slots."
            : "Select exactly 1 Monday delivery slot.",
        );
      }

      await saveProfile({
        ...(profile || {}),
        fullName: normalizedName,
        phone: normalizedPhone,
        addresses: Array.isArray(profile?.addresses) ? profile.addresses : [],
        defaultAddressId: normalizedAddressId,
        preferences: {
          marketingEmails: profile?.preferences?.marketingEmails !== false,
          orderUpdates: profile?.preferences?.orderUpdates !== false,
        },
      });

      const result = await createCustomerSubscription({
        planId: selectedPlan.id,
        addressId: normalizedAddressId,
        mondaySlots: normalizedMondaySlots,
        paymentMethod: selectedPaymentMethod,
      });
      const data = result?.data || {};
      const createdPlanLabel = (data.planName || selectedPlan.name || "Subscription").toString().trim();
      const resolvedPaymentMethod = normalizePaymentMethod(
        data.paymentMethod || selectedPaymentMethod,
      );
      const cycleMonth = normalizeMonthKey(data.cycleMonth || data.firstBillingMonth || "");
      const cycleLabel = formatMonthKeyLabel(cycleMonth) || "the current billing cycle";
      const nowMonthKey = getJohannesburgDateParts()?.monthKey || "";
      const invoiceTargetsNextMonth = Boolean(cycleMonth && nowMonthKey && cycleMonth !== nowMonthKey);
      const invoiceAmountValue = resolvePositiveMoneyValue(
        data.invoiceAmount,
        data?.invoice?.amount,
        invoicePreview?.invoiceAmount,
        data.cycleAmount,
        data?.invoice?.cycleAmount,
        invoicePreview?.cycleAmount,
      );
      const cycleAmountValue = resolveMoneyValue(
        data.cycleAmount,
        data?.invoice?.cycleAmount,
        invoicePreview?.cycleAmount,
        invoiceAmountValue || selectedPlan.monthlyAmount,
      );
      const perDeliveryAmountValue = resolveMoneyValue(
        data.perDeliveryAmount,
        data.monthlyAmount,
        data?.invoice?.perDeliveryAmount,
        selectedPlan.monthlyAmount,
      );
      const invoiceAmountLabel = formatCurrency(invoiceAmountValue);
      const perDeliveryAmountLabel = formatCurrency(
        perDeliveryAmountValue,
      );
      const cycleAmountLabel = formatCurrency(
        cycleAmountValue,
      );
      const isProrated = Boolean(data.isProrated);
      const deliveryDatesLabel = formatDeliveryDateList(data.deliveryDates || data.cycleDeliveryDates || []);
      const emailNote =
        resolvedPaymentMethod === PAYMENT_METHODS.EFT
          ? "EFT invoice email with bank details has been sent immediately."
          : "Pay-now link has been sent to your email immediately.";
      const pricingNote = isProrated ? "This invoice is prorated by remaining Mondays." : "This invoice is full cycle.";
      const timingNote = invoiceTargetsNextMonth
        ? "No eligible Mondays remain this month, so this invoice is for next month."
        : "Deliveries still remain this month, so billing starts immediately for this cycle.";
      const paymentMethodNote =
        resolvedPaymentMethod === PAYMENT_METHODS.EFT
          ? "Payment method: EFT (admin approval required after payment)."
          : "Payment method: PayFast.";
      const successMessage = `${createdPlanLabel} created. ${cycleLabel} amount due now: ${invoiceAmountLabel}. Price per delivery: ${perDeliveryAmountLabel}. Full cycle amount: ${cycleAmountLabel}. ${pricingNote}${deliveryDatesLabel ? ` Deliveries: ${deliveryDatesLabel}.` : ""} ${timingNote} ${paymentMethodNote} ${emailNote}`;
      setCheckoutStatus(successMessage);
      setSuccessDialog({
        title: "Subscription created",
        message: successMessage,
        planLabel: createdPlanLabel,
        cycleLabel,
        amountDueLabel: invoiceAmountLabel,
        paymentMethod: resolvedPaymentMethod,
      });
    } catch (error) {
      setCheckoutError(error?.message || "Unable to create subscription.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  if (authLoading) {
    return (
      <section className="section section--tight">
        <div className="section__inner">
          <p className="empty-state">Loading subscription checkout...</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="section section--tight subscription-checkout-page">
        <div className="section__inner">
          <article className="admin-panel subscription-checkout-locked">
            <span className="badge">Subscription checkout</span>
            <h1>Sign in to continue</h1>
            <p className="modal__meta">
              You must have a customer account to subscribe, manage billing, and track deliveries.
            </p>
            <div className="cta-group">
              <Link className="btn btn--primary" to={accountSignInUrl}>
                Sign in
              </Link>
              <Link className="btn btn--secondary" to={accountSignUpUrl}>
                Create account
              </Link>
            </div>
            <p className="modal__meta">
              Already signed in on another tab? <Link to={checkoutPath}>Refresh this page</Link>.
            </p>
          </article>
        </div>
      </section>
    );
  }

  if (role === "admin") {
    return (
      <section className="section section--tight subscription-checkout-page">
        <div className="section__inner">
          <article className="admin-panel subscription-checkout-locked">
            <span className="badge">Subscription checkout</span>
            <h1>Customer accounts only</h1>
            <p className="modal__meta">
              Subscription checkout is only available for customer logins.
            </p>
            <div className="cta-group">
              <Link className="btn btn--secondary" to="/admin">
                Back to admin
              </Link>
              <Link className="btn btn--secondary" to="/products">
                Browse products
              </Link>
            </div>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="section section--tight subscription-checkout-page">
      <div className="section__inner subscription-checkout">
        <div className="subscription-checkout__header">
          <span className="badge">Subscription checkout</span>
          <h1>Start your flower subscription</h1>
          <p className="modal__meta">
            Review your plan, choose Monday delivery slots, and create your first invoice.
            PayFast sends a pay-now link by email, while EFT sends manual bank details email after admin approval.
            Future recurring invoices are sent in the last 5 days of each month for the next cycle.
          </p>
        </div>

        <div className="subscription-checkout__grid">
          <form className="admin-panel subscription-checkout__panel" onSubmit={handleCreateSubscription}>
            <h2>1. Subscription plan</h2>
            <label>
              Plan
              <select
                className="input"
                value={selectedPlanId}
                onChange={handlePlanChange}
                disabled={plansLoading || checkoutBusy}
              >
                <option value="">
                  {plansLoading ? "Loading plans..." : plans.length ? "Select plan" : "No plans available"}
                </option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedPlan && (
              <div className="subscription-checkout__plan-meta">
                <p className="modal__meta">
                  {formatTierLabel(selectedPlan.tier)} | {formatCurrency(selectedPlan.monthlyAmount)} per delivery
                </p>
                {selectedPlan.description && (
                  <p className="subscription-checkout__plan-description">{selectedPlan.description}</p>
                )}
              </div>
            )}
            {plansError && <p className="admin-panel__error">{plansError}</p>}

            <h2>2. Delivery Mondays</h2>
            {selectedPlan ? (
              <div className="subscription-slot-picker">
                {normalizeSubscriptionTier(selectedPlan.tier) === "weekly" ? (
                  <p className="modal__meta">
                    Weekly subscriptions include all Mondays automatically.
                  </p>
                ) : (
                  <>
                    <p className="modal__meta">
                      {normalizeSubscriptionTier(selectedPlan.tier) === "bi-weekly"
                        ? "Select 2 Monday slots for each month."
                        : "Select 1 Monday slot for each month."}
                    </p>
                    <div className="subscription-slot-options">
                      {SUBSCRIPTION_MONDAY_SLOTS.map((slot) => {
                        const checked = mondaySlots.includes(slot.value);
                        return (
                          <label
                            key={slot.value}
                            className={`subscription-slot-option${checked ? " is-selected" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleMondaySlot(slot.value)}
                              disabled={checkoutBusy || profileSaving}
                            />
                            <span>{slot.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="modal__meta">Select a plan to configure Monday deliveries.</p>
            )}

            <h2>3. Contact details</h2>
            <div className="grid-form">
              <label>
                Full name
                <input
                  className="input"
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </label>
              <label>
                Phone
                <input
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
              </label>
            </div>

            <h2>4. Delivery address</h2>
            <label>
              Saved address
              <select
                className="input"
                value={addressId}
                onChange={(event) => setAddressId(event.target.value)}
                disabled={checkoutBusy}
                required
              >
                <option value="">
                  {profileLoading ? "Loading addresses..." : addressOptions.length ? "Select saved address" : "No saved addresses"}
                </option>
                {addressOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} - {option.value}
                  </option>
                ))}
              </select>
            </label>
            {addressOptions.length === 0 && (
              <p className="admin-panel__error">
                Add a delivery address in <Link to="/account">your account</Link> before continuing.
              </p>
            )}

            <h2>5. Payment method</h2>
            <div className="subscription-payment-options">
              {SUBSCRIPTION_PAYMENT_METHOD_OPTIONS.map((option) => {
                const isSelected = selectedPaymentMethod === option.value;
                const isDisabled =
                  checkoutBusy ||
                  profileSaving ||
                  (option.value === PAYMENT_METHODS.EFT && !eftApproved);
                return (
                  <label
                    key={option.value}
                    className={`subscription-payment-option${isSelected ? " is-selected" : ""}${isDisabled ? " is-disabled" : ""}`}
                  >
                    <input
                      type="radio"
                      name="subscription-payment-method"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => setPaymentMethod(option.value)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="subscription-checkout__eft-guidance">
              <p>
                EFT is admin-approved only. Contact us on{" "}
                <a href={eftApprovalWhatsappUrl} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>{" "}
                to enable EFT for your account.
              </p>
              {!eftApproved && (
                <p className="modal__meta">
                  EFT is currently disabled for this account.
                </p>
              )}
              {eftSettingsLoading && <p className="modal__meta">Checking EFT approval...</p>}
              {eftSettingsError && <p className="admin-panel__error">{eftSettingsError}</p>}
            </div>

            <h2>6. Confirm subscription</h2>
            <p className="modal__meta">
              Your invoice is created immediately. If eligible Mondays remain this month, the invoice is prorated by
              remaining deliveries; if not, the first invoice is for next month. Ongoing invoices are emailed in the
              last 5 days of each month. EFT invoices require admin payment approval before delivery eligibility.
            </p>
            <button
              className="btn btn--primary"
              type="submit"
              disabled={
                checkoutBusy ||
                profileSaving ||
                plansLoading ||
                !selectedPlan ||
                !addressId ||
                (selectedPaymentMethod === PAYMENT_METHODS.EFT && !eftApproved) ||
                (normalizeSubscriptionTier(selectedPlan?.tier) !== "weekly" &&
                  mondaySlots.length !== requiredMondaySlots) ||
                !addressOptions.length
              }
            >
              {checkoutBusy ? "Subscribing..." : "Subscribe"}
            </button>

            {checkoutError && <p className="admin-panel__error">{checkoutError}</p>}
            {checkoutStatus && <p className="admin-panel__status">{checkoutStatus}</p>}
          </form>

          <aside className="admin-panel subscription-checkout__summary">
            <h2>Order summary</h2>
            {selectedPlan ? (
              <div className="subscription-checkout__summary-list">
                <p>
                  <strong>{selectedPlan.name}</strong>
                </p>
                {selectedPlan.description && (
                  <p className="subscription-checkout__plan-description">{selectedPlan.description}</p>
                )}
                <p>{formatTierLabel(selectedPlan.tier)} deliveries</p>
                <p>Monday slots: {selectedSlotLabel || "Not selected yet"}</p>
                <p>
                  Price per delivery: <strong>{formatCurrency(selectedPlan.monthlyAmount)}</strong>
                </p>
                <p>
                  Payment method:{" "}
                  <strong>{selectedPaymentMethod === PAYMENT_METHODS.EFT ? "EFT (admin approval)" : "PayFast"}</strong>
                </p>
                {invoicePreview && (
                  <>
                    <div className="subscription-checkout__due-now">
                      <span className="subscription-checkout__due-now-label">Amount due now</span>
                      <strong>{formatCurrency(invoicePreview.invoiceAmount)}</strong>
                      <p className="modal__meta">This is the amount on your first invoice and pay-now email.</p>
                    </div>
                    <p>
                      Invoice month:{" "}
                      <strong>{formatMonthKeyLabel(invoicePreview.cycleMonth) || invoicePreview.cycleMonth}</strong>
                    </p>
                    <p>
                      First invoice amount:{" "}
                      <strong>{formatCurrency(invoicePreview.invoiceAmount)}</strong>
                    </p>
                    <p>
                      Charged deliveries:{" "}
                      <strong>
                        {invoicePreview.chargedDeliveries} x {formatCurrency(invoicePreview.perDeliveryAmount)}
                      </strong>
                    </p>
                    {invoicePreview.isProrated && (
                      <p className="modal__meta">
                        Prorated this cycle: {invoicePreview.chargedDeliveries} of{" "}
                        {invoicePreview.totalDeliveries} scheduled deliveries remain.
                      </p>
                    )}
                    {invoicePreview.startsNextCycle && (
                      <p className="modal__meta">
                        No eligible Monday deliveries remain this month. First invoice is for the next cycle.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="modal__meta">Select a plan to view pricing.</p>
            )}

            <h3>Account</h3>
            <p className="modal__meta">{user?.email || "No email found"}</p>

            <h3>Delivery</h3>
            {selectedAddress ? (
              <p className="modal__meta">{selectedAddress.value}</p>
            ) : (
              <p className="modal__meta">Select a saved address.</p>
            )}

            <div className="cta-group subscription-checkout__actions">
              <Link className="btn btn--secondary" to="/account">
                Manage profile
              </Link>
              <Link className="btn btn--secondary" to="/products">
                Back to products
              </Link>
            </div>
          </aside>
        </div>
      </div>

      <div
        className={`modal${successDialog ? " is-active" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSuccessDialog(null);
          }
        }}
      >
        <article className="modal__content" role="dialog" aria-modal="true" aria-labelledby="subscription-success-title">
          <button className="modal__close" type="button" onClick={() => setSuccessDialog(null)} aria-label="Close success dialog">
            x
          </button>
          <span className="badge badge--success">Success</span>
          <h2 id="subscription-success-title">Subscription successful</h2>
          <p className="modal__meta">
            {successDialog?.paymentMethod === PAYMENT_METHODS.EFT
              ? "Your subscription is active and an EFT invoice email has been sent. Upload proof (optional) from your account and wait for admin approval."
              : "Your subscription is active and the PayFast pay-now link has been sent to your email. You can manage it from your account page."}
          </p>
          {successDialog && (
            <div className="subscription-checkout__summary-list">
              <p>
                <strong>{successDialog.planLabel}</strong>
              </p>
              <p>
                Invoice cycle: <strong>{successDialog.cycleLabel}</strong>
              </p>
              <p>
                Payment method:{" "}
                <strong>
                  {successDialog.paymentMethod === PAYMENT_METHODS.EFT ? "EFT" : "PayFast"}
                </strong>
              </p>
              <p>
                Amount due now: <strong>{successDialog.amountDueLabel}</strong>
              </p>
            </div>
          )}
          <p className="modal__meta">{successDialog?.message || ""}</p>
          <div className="cta-group">
            <Link className="btn btn--primary" to="/account" onClick={() => setSuccessDialog(null)}>
              Go to account
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

export default SubscriptionCheckoutPage;

