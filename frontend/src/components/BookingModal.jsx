import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { getFirebaseDb, getFirebaseFunctions } from "../lib/firebase.js";

const DEFAULT_FRAME_OPTIONS = [
  { value: "A5", label: "A5 - R350", price: 350 },
  { value: "A4", label: "A4 - R550", price: 550 },
  { value: "A3", label: "A3 - R650", price: 650 },
];

const formatOptionLabel = (label, price) => {
  if (typeof label !== "string" || !label.trim()) return "Option";
  if (Number.isFinite(price)) return `${label} · R${price}`;
  return label;
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
  const match = normalized.match(/(\d+)\s*\+|(\d+)\s*(?:or|and)\s*more|minimum\s*(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1] || match[2] || match[3]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseIsExtra = (option, label) => {
  if (option?.isExtra || option?.extra || option?.isAddOn) return true;
  if (!label) return false;
  return /extra|add[- ]?on|addon/.test(label.toLowerCase());
};

const buildAttendeeSelections = (count, selections, optionValues, fallbackValue) => {
  const normalized = [];
  for (let i = 0; i < count; i += 1) {
    const value = selections?.[i];
    normalized.push(optionValues.has(value) ? value : fallbackValue);
  }
  return normalized;
};

const normalizeAttendeeSelectionValues = (selections) => {
  if (!Array.isArray(selections)) return [];
  return selections
    .map((selection) => {
      if (typeof selection === "string") return selection;
      if (selection && typeof selection === "object") {
        return (
          selection.optionValue ||
          selection.optionId ||
          selection.value ||
          selection.optionLabel ||
          selection.label ||
          ""
        );
      }
      return "";
    })
    .filter((value) => typeof value === "string" && value.trim().length > 0);
};

const selectionsMatch = (left = [], right = []) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const INITIAL_BOOKING_FORM = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  attendeeCount: "1",
  framePreference: "A5",
  attendeeSelections: [],
  notes: "",
};
const WORKSHOP_REQUEST_TIME_SLOTS = Object.freeze([
  {
    value: "08:00 - 11:00",
    label: "08:00 - 11:00",
    startTime: "08:00",
    durationHours: 3,
  },
  {
    value: "12:00 - 15:00",
    label: "12:00 - 15:00",
    startTime: "12:00",
    durationHours: 3,
  },
]);
const workshopRequestDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "long",
});

const REQUIRED_FIELDS = ["fullName", "email", "phone"];
const REQUIRED_FIELD_LABELS = {
  fullName: "Full name",
  email: "Email",
  phone: "Phone",
};

const parseDateInputValue = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const formatDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getWorkshopRequestMinimumDate = () => {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
};

const getWorkshopRequestDateError = (value) => {
  if (!value) return "Please choose a preferred workshop date.";
  const parsed = parseDateInputValue(value);
  if (!parsed) return "Please choose a valid workshop date.";
  const minimumDate = getWorkshopRequestMinimumDate();
  if (parsed.getTime() < minimumDate.getTime()) {
    return "Workshop requests must be booked from tomorrow onward.";
  }
  if (parsed.getDay() === 0) {
    return "Workshop requests are available Monday to Saturday only.";
  }
  return "";
};

const formatWorkshopRequestDateLabel = (value) => {
  const parsed = parseDateInputValue(value);
  return parsed ? workshopRequestDateFormatter.format(parsed) : "";
};

const buildWorkshopRequestSessionStart = (dateValue, timeValue) => {
  const parsedDate = parseDateInputValue(dateValue);
  if (!parsedDate || typeof timeValue !== "string") return null;
  const [hours, minutes] = timeValue.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  parsedDate.setHours(hours, minutes, 0, 0);
  return parsedDate.toISOString();
};

function BookingModal() {
  const { isBookingOpen, closeBooking, notifyCart, bookingContext } = useModal();
  const { addItem } = useCart();
  const closeButtonRef = useRef(null);
  const [formState, setFormState] = useState(INITIAL_BOOKING_FORM);
  const [formStatus, setFormStatus] = useState("idle");
  const [submitError, setSubmitError] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedSlotValue, setRequestedSlotValue] = useState("");
  const [showExtraOptions, setShowExtraOptions] = useState(false);
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

  const workshop = bookingContext?.workshop ?? null;
  const bookingType = bookingContext?.type ?? "workshop";
  const isCutFlower = bookingType === "cut-flower";
  const daySlotLabel = isCutFlower ? "time slot" : "slot";
  const bookingCopy =
    bookingType === "cut-flower"
      ? {
          heading: "Reserve Your Cut Flower Session",
          nounLower: "class",
          detailsUnavailable: "Class details unavailable. Close the dialog and try again.",
          unavailable: "This class is not currently accepting bookings. Please check back soon.",
          selectSession: "Please choose a class day and time slot before continuing.",
          addLabel: "Reserve Spot",
          itemLabel: "Cut Flower Session",
          daySelectorLabel: "Class Day",
          noSessionsCta: "No Sessions Available",
          optionLabel: "Cut Flower Options",
        }
      : {
          heading: "Secure Your Workshop Seat",
          nounLower: "workshop",
          detailsUnavailable: "Workshop details unavailable. Close the dialog and try again.",
          unavailable: "This workshop is not currently accepting bookings. Please check back soon.",
          selectSession: "Please choose a workshop day and time slot before continuing.",
          addLabel: "Make Booking",
          itemLabel: "Workshop",
          daySelectorLabel: "Workshop Day",
          noSessionsCta: "No Sessions Available",
          optionLabel: "Frame Selection",
        };
  const sessions = useMemo(
    () => (Array.isArray(workshop?.sessions) ? workshop.sessions : []),
    [workshop],
  );
  const hasActiveSession = sessions.some((session) => !session.isPast);
  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;

  const sessionDays = useMemo(() => {
    if (!sessions.length) return [];
    const dayFormatter = new Intl.DateTimeFormat("en-ZA", { dateStyle: "long" });
    const map = new Map();
    sessions.forEach((session) => {
      const dateKey = session.date || (typeof session.start === "string" ? session.start.slice(0, 10) : "");
      if (!dateKey) return;
      if (!map.has(dateKey)) {
        const startDate =
          session.startDate instanceof Date && !Number.isNaN(session.startDate.getTime())
            ? session.startDate
            : typeof session.start === "string"
              ? new Date(session.start)
              : null;
        const label = startDate instanceof Date && !Number.isNaN(startDate.getTime())
          ? dayFormatter.format(startDate)
          : dateKey;
        map.set(dateKey, { date: dateKey, label, sessions: [] });
      }
      map.get(dateKey).sessions.push(session);
    });
    const grouped = Array.from(map.values()).map((group) => ({
      ...group,
      sessions: group.sessions.sort((a, b) => {
        const aTime = typeof a.start === "string" ? new Date(a.start).getTime() : Number.POSITIVE_INFINITY;
        const bTime = typeof b.start === "string" ? new Date(b.start).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      }),
    }));
    grouped.sort((a, b) => {
      const aTime = typeof a.sessions[0]?.start === "string" ? new Date(a.sessions[0].start).getTime() : Number.POSITIVE_INFINITY;
      const bTime = typeof b.sessions[0]?.start === "string" ? new Date(b.sessions[0].start).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
    return grouped;
  }, [sessions]);
  const isWorkshopRequestMode = !isCutFlower && sessionDays.length === 0;
  const requestMinimumDate = useMemo(
    () => formatDateInputValue(getWorkshopRequestMinimumDate()),
    [],
  );
  const selectedRequestSlot =
    WORKSHOP_REQUEST_TIME_SLOTS.find((slot) => slot.value === requestedSlotValue) ?? null;
  const requestedDateLabel = useMemo(
    () => formatWorkshopRequestDateLabel(requestedDate),
    [requestedDate],
  );
  const requestDateValidationMessage =
    isWorkshopRequestMode && requestedDate ? getWorkshopRequestDateError(requestedDate) : "";

  const selectedDayData = sessionDays.find((day) => day.date === selectedDay) ?? sessionDays[0] ?? null;
  const selectedDaySlots = useMemo(
    () => selectedDayData?.sessions ?? [],
    [selectedDayData],
  );
  const dayHasActiveSlots = selectedDaySlots.some((slot) => !slot.isPast);
  const selectedDayLabel = selectedDayData?.label ?? null;

  useEffect(() => {
    if (!isBookingOpen) return;
    if (!sessionDays.length) {
      setSelectedDay(null);
      setSelectedSessionId(null);
      return;
    }
    if (!selectedDayData) {
      setSelectedDay(sessionDays[0].date);
      return;
    }
    const slots = selectedDaySlots;
    if (slots.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSession || selectedSession.date !== selectedDayData.date) {
      const nextSlot = slots.find((slot) => !slot.isPast) ?? slots[0];
      setSelectedSessionId(nextSlot?.id ?? null);
    }
  }, [isBookingOpen, selectedDayData, selectedDaySlots, selectedSession, sessionDays]);

  const selectionOptions = useMemo(() => {
    const rawOptions = Array.isArray(workshop?.options) ? workshop.options : [];
    const normalizedOptions = rawOptions
      .map((option, index) => {
        if (typeof option !== "object" || option === null) return null;
        const value = option.value ?? option.id ?? option.label ?? `option-${index}`;
        const label = option.label ?? option.name ?? option.value ?? `Option ${index + 1}`;
        const price = parseOptionalNumber(option.price ?? option.amount);
        return {
          value,
          label,
          displayLabel: formatOptionLabel(label, price),
          price,
          ...(isCutFlower
            ? {
                minAttendees: parseMinAttendees(option, label),
                isExtra: parseIsExtra(option, label),
              }
            : {}),
        };
      })
      .filter(Boolean);

    if (isCutFlower) {
      if (normalizedOptions.length > 0) {
        return normalizedOptions;
      }
      const rawFallbackPrice = parseOptionalNumber(workshop?.unitPrice ?? workshop?.price);
      return [
        {
          value: "standard",
          label: "Standard",
          displayLabel: formatOptionLabel("Standard", rawFallbackPrice),
          price: rawFallbackPrice,
          minAttendees: null,
          isExtra: false,
        },
      ];
    }

    if (normalizedOptions.length > 0) {
      return normalizedOptions;
    }

    if (Array.isArray(workshop?.frameOptions) && workshop.frameOptions.length > 0) {
      return workshop.frameOptions
        .map((option, index) => {
          if (typeof option !== "object" || option === null) return null;
          const value = option.value ?? option.size ?? option.label ?? `frame-${index}`;
          const label = option.label ?? option.name ?? value;
          const price = parseOptionalNumber(option.price);
          return {
            value,
            label,
            displayLabel: label,
            price,
          };
        })
        .filter(Boolean);
    }
    return DEFAULT_FRAME_OPTIONS.map((option) => ({
      ...option,
      displayLabel: option.label,
    }));
  }, [isCutFlower, workshop]);

  const requestedAttendeeCountNumber = useMemo(
    () => Math.max(1, Number.parseInt(formState.attendeeCount, 10) || 1),
    [formState.attendeeCount],
  );
  const sessionSeatLimit = useMemo(() => {
    if (isCutFlower || isWorkshopRequestMode) return null;
    const capacityValue = Number(selectedSession?.capacity);
    return Number.isFinite(capacityValue) && capacityValue > 0 ? capacityValue : null;
  }, [isCutFlower, isWorkshopRequestMode, selectedSession?.capacity]);
  const attendeeCountNumber = useMemo(() => {
    if (sessionSeatLimit === null) return requestedAttendeeCountNumber;
    return Math.min(requestedAttendeeCountNumber, sessionSeatLimit);
  }, [requestedAttendeeCountNumber, sessionSeatLimit]);
  const attendeeCountLimitMessage = useMemo(() => {
    if (sessionSeatLimit === null) return "";
    if (requestedAttendeeCountNumber > sessionSeatLimit) {
      return `This session has ${sessionSeatLimit} seat${sessionSeatLimit === 1 ? "" : "s"} available, so your booking has been capped at ${sessionSeatLimit} attendee${sessionSeatLimit === 1 ? "" : "s"}.`;
    }
    return `This session has ${sessionSeatLimit} seat${sessionSeatLimit === 1 ? "" : "s"} available.`;
  }, [requestedAttendeeCountNumber, sessionSeatLimit]);
  const defaultSelectionValue =
    selectionOptions[0]?.value ?? INITIAL_BOOKING_FORM.framePreference;
  const cutFlowerOptionGroups = useMemo(() => {
    if (!isCutFlower) return { base: selectionOptions, extra: [] };
    const base = selectionOptions.filter((option) => !option.isExtra);
    const extra = selectionOptions.filter((option) => option.isExtra);
    return { base, extra };
  }, [isCutFlower, selectionOptions]);
  const hasExtraOptions = cutFlowerOptionGroups.extra.length > 0;
  const visibleCutFlowerOptions = useMemo(() => {
    if (!isCutFlower) return selectionOptions;
    return showExtraOptions ? selectionOptions : cutFlowerOptionGroups.base;
  }, [cutFlowerOptionGroups.base, isCutFlower, selectionOptions, showExtraOptions]);
  const restrictedCutFlowerOptions = useMemo(() => {
    if (!isCutFlower) return [];
    return visibleCutFlowerOptions.filter(
      (option) => option.minAttendees && option.minAttendees > attendeeCountNumber,
    );
  }, [attendeeCountNumber, isCutFlower, visibleCutFlowerOptions]);
  const availableCutFlowerOptions = useMemo(() => {
    if (!isCutFlower) return selectionOptions;
    return visibleCutFlowerOptions.filter(
      (option) => !option.minAttendees || option.minAttendees <= attendeeCountNumber,
    );
  }, [attendeeCountNumber, isCutFlower, selectionOptions, visibleCutFlowerOptions]);
  const availableSelectionOptions = isCutFlower ? availableCutFlowerOptions : selectionOptions;
  const restrictedOptionsNote = useMemo(() => {
    if (!isCutFlower || restrictedCutFlowerOptions.length === 0) return "";
    const labels = restrictedCutFlowerOptions
      .map((option) => option.label)
      .filter((label) => typeof label === "string" && label.trim().length > 0);
    const minValues = Array.from(
      new Set(
        restrictedCutFlowerOptions
          .map((option) => option.minAttendees)
          .filter((value) => Number.isFinite(value)),
      ),
    );
    const minText =
      minValues.length === 1
        ? `at least ${minValues[0]} attendees`
        : "a minimum number of attendees";
    const labelText = labels.length > 0 ? `: ${labels.join(", ")}` : ".";
    return `Options requiring ${minText} are hidden${labelText}`;
  }, [isCutFlower, restrictedCutFlowerOptions]);
  const normalizedAttendeeSelections = useMemo(() => {
    const optionValues = new Set(availableSelectionOptions.map((option) => option.value));
    if (optionValues.size === 0 && selectionOptions[0]) {
      optionValues.add(selectionOptions[0].value);
    }
    const fallbackValue =
      availableSelectionOptions[0]?.value ?? selectionOptions[0]?.value ?? defaultSelectionValue;
    return buildAttendeeSelections(
      attendeeCountNumber,
      formState.attendeeSelections,
      optionValues,
      fallbackValue,
    );
  }, [
    attendeeCountNumber,
    availableSelectionOptions,
    defaultSelectionValue,
    formState.attendeeSelections,
    selectionOptions,
  ]);

  useEffect(() => {
    if (isBookingOpen) {
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [isBookingOpen]);

  useEffect(() => {
    if (!isBookingOpen) return;
    setFormState((prev) => {
      if (
        selectionsMatch(prev.attendeeSelections, normalizedAttendeeSelections) &&
        (!sessionSeatLimit || requestedAttendeeCountNumber <= sessionSeatLimit)
      ) {
        return prev;
      }
      return {
        ...prev,
        attendeeCount:
          sessionSeatLimit && requestedAttendeeCountNumber > sessionSeatLimit
            ? String(sessionSeatLimit)
            : prev.attendeeCount,
        attendeeSelections: normalizedAttendeeSelections,
      };
    });
  }, [isBookingOpen, normalizedAttendeeSelections, requestedAttendeeCountNumber, sessionSeatLimit]);

  useEffect(() => {
    if (!isBookingOpen) {
      setFormState(INITIAL_BOOKING_FORM);
      setFormStatus("idle");
      setSubmitError(null);
      setMissingFields([]);
      setSelectedSessionId(null);
      setRequestedDate("");
      setRequestedSlotValue("");
      setShowExtraOptions(false);
      return;
    }

    const customer = bookingContext?.customer ?? {};
    const attendeeCount =
      bookingContext?.attendeeCount !== undefined
        ? String(bookingContext.attendeeCount)
        : INITIAL_BOOKING_FORM.attendeeCount;
    const preferredSelection =
      bookingContext?.optionValue ??
      bookingContext?.optionId ??
      bookingContext?.selectedOption?.value ??
      bookingContext?.selectedOption?.id ??
      bookingContext?.framePreference ??
      INITIAL_BOOKING_FORM.framePreference;
    const defaultSelectionValue =
      selectionOptions.find((option) => option.value === preferredSelection)?.value ??
      selectionOptions[0]?.value ??
      INITIAL_BOOKING_FORM.framePreference;
    const optionValues = new Set(selectionOptions.map((option) => option.value));
    const normalizedAttendeeCount = Math.max(1, Number.parseInt(attendeeCount, 10) || 1);
    const initialAttendeeSelections = normalizeAttendeeSelectionValues(bookingContext?.attendeeSelections);
    const attendeeSelections = buildAttendeeSelections(
      normalizedAttendeeCount,
      initialAttendeeSelections,
      optionValues,
      defaultSelectionValue,
    );

    const preferredSessionIds = [
      bookingContext?.sessionId,
      bookingContext?.session?.id,
      workshop?.primarySessionId,
    ].filter((value) => typeof value === "string" && value.length > 0);
    const resolvedPreferredId =
      preferredSessionIds.find((sessionId) => sessions.some((session) => session.id === sessionId)) ?? null;
    const hasAnyActive = sessions.some((session) => !session.isPast);
    const preferredSession =
      resolvedPreferredId ? sessions.find((session) => session.id === resolvedPreferredId) : null;
    const normalizedPreferred =
      preferredSession && (!preferredSession.isPast || !hasAnyActive) ? preferredSession : null;
    const fallbackSession = sessions.find((session) => !session.isPast) ?? sessions[0] ?? null;

    setFormState({
      fullName: customer.fullName ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      attendeeCount,
      framePreference: defaultSelectionValue,
      attendeeSelections,
      notes: bookingContext?.notes ?? "",
    });
    if (isCutFlower) {
      const hasExtraSelection = attendeeSelections.some((value) =>
        selectionOptions.some((option) => option.value === value && option.isExtra),
      );
      setShowExtraOptions(hasExtraSelection);
    } else {
      setShowExtraOptions(false);
    }
    const preferredRequestedDate =
      bookingContext?.requestedDate ??
      bookingContext?.sessionDate ??
      "";
    const preferredRequestedSlot =
      bookingContext?.requestedSlotValue ??
      bookingContext?.sessionTimeRange ??
      bookingContext?.sessionLabel ??
      "";
    setRequestedDate(
      typeof preferredRequestedDate === "string" ? preferredRequestedDate : "",
    );
    setRequestedSlotValue(
      WORKSHOP_REQUEST_TIME_SLOTS.some((slot) => slot.value === preferredRequestedSlot)
        ? preferredRequestedSlot
        : "",
    );
    const initialSession = normalizedPreferred ?? fallbackSession ?? null;
    setSelectedSessionId(initialSession?.id ?? null);
    setSelectedDay(initialSession?.date ?? sessions[0]?.date ?? null);
    setFormStatus("idle");
    setSubmitError(null);
  }, [isBookingOpen, bookingContext, isCutFlower, selectionOptions, sessions, workshop]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && isBookingOpen) {
        closeBooking();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isBookingOpen, closeBooking]);

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value;
    setMissingFields((prev) => prev.filter((missingField) => missingField !== field));
    setFormState((prev) => ({
      ...prev,
      [field]: field === "attendeeCount" ? value.replace(/[^\d]/g, "") : value,
    }));
  };

  const handleAttendeeSelectionChange = (index) => (event) => {
    const value = event.target.value;
    setFormState((prev) => {
      const nextSelections = [...(prev.attendeeSelections || [])];
      nextSelections[index] = value;
      return {
        ...prev,
        framePreference: index === 0 ? value : prev.framePreference,
        attendeeSelections: nextSelections,
      };
    });
  };

  const pricingSummary = useMemo(() => {
    const rawFallbackPrice = parseOptionalNumber(workshop?.unitPrice ?? workshop?.price);
    const fallbackPrice = rawFallbackPrice ?? 0;
    const optionLookup = new Map(selectionOptions.map((option) => [option.value, option]));
    const attendeeItems = normalizedAttendeeSelections.map((value, index) => {
      const option = optionLookup.get(value) ?? selectionOptions[0];
      const price =
        option?.price !== undefined && Number.isFinite(option.price)
          ? option.price
          : fallbackPrice;
      const label = option?.label ?? option?.displayLabel ?? value ?? `Option ${index + 1}`;
      const displayLabel = option?.displayLabel ?? label;
      return {
        index: index + 1,
        value,
        label,
        displayLabel,
        isExtra: Boolean(option?.isExtra),
        minAttendees: option?.minAttendees ?? null,
        price,
      };
    });
    const total = attendeeItems.reduce(
      (sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0),
      0,
    );
    return {
      perAttendeePrice: attendeeItems.length ? total / attendeeItems.length : 0,
      attendeeCount: attendeeCountNumber,
      attendeeItems,
      total,
    };
  }, [
    attendeeCountNumber,
    normalizedAttendeeSelections,
    selectionOptions,
    workshop,
  ]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);
    setMissingFields([]);

    if (!workshop) {
      setFormStatus("error");
      setSubmitError(bookingCopy.detailsUnavailable);
      return;
    }

    if (isCutFlower || !isWorkshopRequestMode) {
      if (sessionDays.length === 0) {
        setFormStatus("error");
        setSubmitError(bookingCopy.unavailable);
        return;
      }

      if (!selectedDay || !selectedSession) {
        setFormStatus("error");
        setSubmitError(bookingCopy.selectSession);
        return;
      }

      if (selectedSession.isPast) {
        setFormStatus("error");
        setSubmitError("This session has already passed. Please choose another available date.");
        return;
      }
    } else {
      const requestedDateError = getWorkshopRequestDateError(requestedDate);
      if (requestedDateError) {
        setFormStatus("error");
        setSubmitError(requestedDateError);
        return;
      }

      if (!selectedRequestSlot) {
        setFormStatus("error");
        setSubmitError("Please choose a preferred workshop start window before continuing.");
        return;
      }
    }

    const trimmed = {
      fullName: formState.fullName.trim(),
      email: formState.email.trim(),
      phone: formState.phone.trim(),
      address: "",
      notes: formState.notes.trim(),
    };

    const requiredFields = REQUIRED_FIELDS;
    const missing = requiredFields.filter((field) => !trimmed[field]);
    if (missing.length > 0) {
      const missingLabels = missing
        .map((field) => REQUIRED_FIELD_LABELS[field] || field)
        .filter(Boolean);
      setFormStatus("error");
      setMissingFields(missing);
      setSubmitError(
        `Please complete the following field${missingLabels.length === 1 ? "" : "s"}: ${missingLabels.join(", ")}.`,
      );
      return;
    }

    setFormStatus("submitting");

    const attendeeCountNumber = pricingSummary.attendeeCount;
    const perAttendeePrice = pricingSummary.perAttendeePrice;
    const totalPrice = pricingSummary.total;
    const attendeeItems = pricingSummary.attendeeItems ?? [];
    const primaryAttendeeSelection = attendeeItems[0] ?? null;
    const selectionValue =
      primaryAttendeeSelection?.value ??
      selectionOptions[0]?.value ??
      INITIAL_BOOKING_FORM.framePreference;
    const selectionLabel = primaryAttendeeSelection?.label ?? selectionValue;
    const summarySelectionLabel =
      attendeeItems.length <= 1
        ? selectionLabel
        : isCutFlower
          ? "Multiple options"
          : "Multiple frame selections";
    const summarySelectionValue = selectionValue;
    const workshopSchedule = isWorkshopRequestMode
      ? {
          sessionSource: "customer-requested",
          scheduledFor: selectedRequestSlot
            ? buildWorkshopRequestSessionStart(requestedDate, selectedRequestSlot.startTime)
            : null,
          scheduledDateLabel: requestedDateLabel || null,
          sessionId: null,
          sessionLabel: selectedRequestSlot?.label ?? null,
          sessionStart: selectedRequestSlot
            ? buildWorkshopRequestSessionStart(requestedDate, selectedRequestSlot.startTime)
            : null,
          sessionDate: requestedDate || null,
          sessionTime: selectedRequestSlot?.startTime ?? null,
          sessionTimeRange: selectedRequestSlot?.label ?? null,
          sessionCapacity: null,
          sessionDay: requestedDate || null,
          sessionDayLabel: requestedDateLabel || null,
          session: null,
          requestedDurationHours: selectedRequestSlot?.durationHours ?? 3,
        }
      : {
          sessionSource: "admin-session",
          scheduledFor: selectedSession?.start ?? workshop.scheduledFor ?? null,
          scheduledDateLabel:
            summaryLabel || selectedSession?.formatted || workshop.scheduledDateLabel || null,
          sessionId: selectedSession?.id ?? null,
          sessionLabel: selectedSession?.label ?? selectedSession?.formatted ?? null,
          sessionStart: selectedSession?.start ?? null,
          sessionDate: selectedSession?.date ?? null,
          sessionTime: selectedSession?.time ?? null,
          sessionTimeRange: selectedSession?.timeRangeLabel ?? null,
          sessionCapacity:
            typeof selectedSession?.capacity === "number" ? selectedSession.capacity : null,
          sessionDay: selectedDay ?? null,
          sessionDayLabel: selectedDayLabel ?? null,
          session:
            selectedSession ?
              {
                id: selectedSession.id,
                label: selectedSession.label ?? null,
                formatted: selectedSession.formatted,
                start: selectedSession.start ?? null,
                date: selectedSession.date ?? null,
                time: selectedSession.time ?? null,
                capacity:
                  typeof selectedSession.capacity === "number"
                    ? selectedSession.capacity
                    : null,
              }
            : null,
          requestedDurationHours: null,
        };

    if (isCutFlower) {
      if (!db) {
        setFormStatus("error");
        setSubmitError("Booking is unavailable right now. Please try again shortly.");
        return;
      }

      const sessionLabel =
        selectedSession.label ??
        selectedSession.timeRangeLabel ??
        selectedSession.formatted ??
        "";
      const sessionDate = (() => {
        if (typeof selectedSession.start === "string") {
          const parsed = new Date(selectedSession.start);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        if (selectedSession.date) {
          const parsed = new Date(selectedSession.date);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        return null;
      })();
      const attendeeSelectionsSummary = attendeeItems.length
        ? attendeeItems
            .map((item) => {
              const priceLabel = Number.isFinite(item.price) ? ` R${item.price.toFixed(2)}` : "";
              return `Attendee ${item.index}: ${item.label}${priceLabel}`;
            })
            .join("; ")
        : null;
      const notesParts = [
        workshop.title ? `Class: ${workshop.title}` : null,
        sessionLabel ? `Session: ${sessionLabel}` : null,
        `Attendees: ${attendeeCountNumber}`,
        attendeeSelectionsSummary ? `Options: ${attendeeSelectionsSummary}` : null,
        `Estimate: R${totalPrice.toFixed(2)} (estimate only)`,
        trimmed.notes || null,
      ].filter(Boolean);
      const notesValue = notesParts.join(" · ").slice(0, 1000);
      const bookingPayload = {
        customerName: trimmed.fullName,
        email: trimmed.email,
        phone: trimmed.phone,
        occasion: workshop.title ?? "",
        location: workshop.location ?? "",
        status: "new",
        eventDate: sessionDate ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        classId: workshop.id,
        sessionId: selectedSession.id,
        sessionLabel: sessionLabel || null,
        attendeeCount: attendeeCountNumber,
        optionLabel: summarySelectionLabel || null,
        optionValue: summarySelectionValue || null,
        attendeeSelections: attendeeItems.map((item) => ({
          attendee: item.index,
          optionLabel: item.label,
          optionValue: item.value,
          estimatedPrice: Number.isFinite(item.price) ? item.price : null,
        })),
        estimatedTotal: totalPrice,
        estimatedPerAttendee: perAttendeePrice,
      };
      if (notesValue) bookingPayload.notes = notesValue;

      try {
        await addDoc(collection(db, "cutFlowerBookings"), bookingPayload);
        if (functionsInstance) {
          try {
            const sendBookingEmail = httpsCallable(functionsInstance, "sendBookingEmail");
            await sendBookingEmail({
              type: "cut-flower",
              fullName: trimmed.fullName,
              email: trimmed.email,
              phone: trimmed.phone,
              occasion: workshop.title ?? "",
              location: workshop.location ?? "",
              eventDate: sessionDate ?? null,
              sessionLabel: sessionLabel || null,
              attendeeCount: attendeeCountNumber,
              optionLabel: summarySelectionLabel || null,
              notes: notesValue || "",
              totalPrice,
            });
          } catch (error) {
            console.warn("Unable to send booking email", error);
          }
        }
        setFormStatus("success");
        setFormState(INITIAL_BOOKING_FORM);
        closeBooking();
      } catch (error) {
        setFormStatus("error");
        setSubmitError(error?.message || "We couldn't save your booking. Please try again.");
      }
      return;
    }

    const cartItemId = `${bookingType}-${workshop.id}-${
      workshopSchedule.sessionId ||
      `${workshopSchedule.sessionDate || "request"}-${workshopSchedule.sessionTime || "slot"}`
    }-${Date.now()}`;

    addItem({
      id: cartItemId,
      name: `${workshop.title} ${bookingCopy.itemLabel}`,
      price: totalPrice,
      quantity: 1,
      metadata: {
        type: bookingType,
        workshopId: workshop.id,
        workshopTitle: workshop.title,
        sessionSource: workshopSchedule.sessionSource,
        scheduledFor: workshopSchedule.scheduledFor,
        scheduledDateLabel: workshopSchedule.scheduledDateLabel,
        location: workshop.location ?? null,
        attendeeCount: attendeeCountNumber,
        framePreference: isCutFlower ? null : selectionValue,
        optionId: summarySelectionValue,
        optionLabel: summarySelectionLabel || null,
        optionValue: summarySelectionValue,
        attendeeSelections: attendeeItems.map((item) => ({
          attendee: item.index,
          optionLabel: item.label,
          optionValue: item.value,
          estimatedPrice: Number.isFinite(item.price) ? item.price : null,
        })),
        perAttendeePrice,
        notes: trimmed.notes,
        sessionId: workshopSchedule.sessionId,
        sessionLabel: workshopSchedule.sessionLabel,
        sessionStart: workshopSchedule.sessionStart,
        sessionDate: workshopSchedule.sessionDate,
        sessionTime: workshopSchedule.sessionTime,
        sessionTimeRange: workshopSchedule.sessionTimeRange,
        sessionCapacity: workshopSchedule.sessionCapacity,
        sessionDay: workshopSchedule.sessionDay,
        sessionDayLabel: workshopSchedule.sessionDayLabel,
        session: workshopSchedule.session,
        requestedDurationHours: workshopSchedule.requestedDurationHours,
        customer: {
          fullName: trimmed.fullName,
          email: trimmed.email,
          phone: trimmed.phone,
          address: trimmed.address,
        },
      },
    });

    if (functionsInstance) {
      try {
        const sendBookingEmail = httpsCallable(functionsInstance, "sendBookingEmail");
        await sendBookingEmail({
          type: bookingType,
          fullName: trimmed.fullName,
          email: trimmed.email,
          phone: trimmed.phone,
          workshopTitle: workshop.title,
          sessionSource: workshopSchedule.sessionSource,
          scheduledDateLabel: workshopSchedule.scheduledDateLabel,
          sessionDayLabel: workshopSchedule.sessionDayLabel,
          sessionDate: workshopSchedule.sessionDate,
          sessionDateLabel:
            workshopSchedule.sessionDayLabel || workshopSchedule.scheduledDateLabel,
          sessionLabel: workshopSchedule.sessionLabel,
          sessionTime: workshopSchedule.sessionTime,
          sessionTimeRange: workshopSchedule.sessionTimeRange,
          requestedDurationHours: workshopSchedule.requestedDurationHours,
          attendeeCount: attendeeCountNumber,
          optionLabel: summarySelectionLabel || null,
          optionId: summarySelectionValue,
          optionValue: summarySelectionValue,
          framePreference: isCutFlower ? null : selectionValue,
          notes: trimmed.notes,
          totalPrice,
        });
      } catch (error) {
        console.warn("Unable to send booking email", error);
      }
    }

    setFormStatus("success");
    setFormState(INITIAL_BOOKING_FORM);
    closeBooking();
    notifyCart("Added to cart");
  };

  const summaryLabel = (() => {
    if (!workshop) return "";
    if (isWorkshopRequestMode) {
      if (requestedDateLabel && selectedRequestSlot) {
        return `${requestedDateLabel} - ${selectedRequestSlot.label}`;
      }
      if (requestedDateLabel) return requestedDateLabel;
      if (selectedRequestSlot) return selectedRequestSlot.label;
      return "Choose your preferred date and start window";
    }
    if (selectedDayLabel && selectedSession) {
      const timeLabel = selectedSession.timeRangeLabel || selectedSession.formatted;
      return timeLabel ? `${selectedDayLabel} · ${timeLabel}` : selectedDayLabel;
    }
    if (selectedDayLabel) return selectedDayLabel;
    if (selectedSession) return selectedSession.timeRangeLabel || selectedSession.formatted;
    return workshop.scheduledDateLabel || "Date to be confirmed";
  })();

  const isSubmitting = formStatus === "submitting";
  const isAddDisabled =
    isSubmitting ||
    !workshop ||
    (isWorkshopRequestMode
      ? !requestedDate || !selectedRequestSlot || Boolean(requestDateValidationMessage)
      : sessionDays.length === 0 ||
        !selectedDay ||
        !selectedSession ||
        (selectedSession.isPast && hasActiveSession));
  const submitLabel = (() => {
    if (isSubmitting) return bookingType === "cut-flower" ? "Reserving..." : "Adding to cart...";
    if (!workshop) return bookingCopy.addLabel;
    if (isWorkshopRequestMode) {
      if (!requestedDate) return "Select Requested Date";
      if (requestDateValidationMessage) return "Choose Valid Date";
      if (!selectedRequestSlot) return "Select Time Window";
      return bookingCopy.addLabel;
    }
    if (sessionDays.length === 0) return bookingCopy.noSessionsCta;
    if (!selectedDay) return "Select a Day";
    if (!selectedSession) return "Select Time Slot";
    if (selectedSession.isPast && hasActiveSession) return "Select Available Session";
    return bookingCopy.addLabel;
  })();
  const hasExtraSelections =
    isCutFlower && pricingSummary.attendeeItems.some((item) => item.isExtra);

  return (
    <div
      className={`modal booking-modal ${isBookingOpen ? "is-active" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={isBookingOpen ? "false" : "true"}
      aria-labelledby="booking-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeBooking();
      }}
    >
      <div className="modal__content">
        <button
          ref={closeButtonRef}
          className="modal__close"
          type="button"
          onClick={closeBooking}
          aria-label="Close booking form"
        >
          &times;
        </button>
        <h2 className="modal__title" id="booking-title">
          {bookingCopy.heading}
        </h2>
        {workshop ? (
          <div className="booking-summary">
            <p>
              <strong>{workshop.title}</strong>
            </p>
            <p className="modal__meta">
              {summaryLabel || "Date to be confirmed"}
              {workshop.location ? ` · ${workshop.location}` : ""}
            </p>
            {!isWorkshopRequestMode && selectedSession?.capacity && (
              <p className="modal__meta">
                {selectedSession.capacity} seat{selectedSession.capacity === 1 ? "" : "s"} available
              </p>
            )}
            {isWorkshopRequestMode && (
              <p className="booking-summary__warning">
                This workshop is booked by request. Choose a Monday to Saturday date from tomorrow onward, then pick a
                3-hour start window below.
              </p>
            )}
            {!isWorkshopRequestMode && sessionDays.length === 0 && (
              <p className="booking-summary__warning">
                No upcoming sessions have been scheduled yet. Please contact the studio for availability.
              </p>
            )}
            {!hasActiveSession && sessions.length > 0 && (
              <p className="booking-summary__warning">
                All listed sessions have passed. New dates will be added soon.
              </p>
            )}
          </div>
        ) : (
          <p className="empty-state">{bookingCopy.detailsUnavailable}</p>
        )}
        <form className="booking-grid" onSubmit={handleSubmit} noValidate>
          {isWorkshopRequestMode && (
            <>
              <div className="booking-grid__full booking-day-picker">
                <label className="booking-picker__label" htmlFor="requested-workshop-date">
                  Requested Date
                </label>
                <input
                  className="input"
                  type="date"
                  id="requested-workshop-date"
                  min={requestMinimumDate}
                  value={requestedDate}
                  onChange={(event) => {
                    setRequestedDate(event.target.value);
                    setSubmitError(null);
                  }}
                />
                <p className="modal__meta">
                  Available from tomorrow onward. Requests are accepted Monday to Saturday only.
                </p>
                {requestedDate && requestDateValidationMessage && (
                  <p className="form-feedback__message form-feedback__message--warning">
                    {requestDateValidationMessage}
                  </p>
                )}
              </div>
              <div className="booking-grid__full booking-slot-picker">
                <span className="booking-picker__label">Preferred Start Window</span>
                <div className="booking-slot-picker__grid">
                  {WORKSHOP_REQUEST_TIME_SLOTS.map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      className={`booking-slot-chip ${
                        requestedSlotValue === slot.value ? "booking-slot-chip--active" : ""
                      }`}
                      onClick={() => {
                        setRequestedSlotValue(slot.value);
                        setSubmitError(null);
                      }}
                      aria-pressed={requestedSlotValue === slot.value}
                    >
                      <span className="booking-slot-chip__label">{slot.label}</span>
                      <span className="booking-slot-chip__meta">3-hour workshop window</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {!isWorkshopRequestMode && sessionDays.length > 0 && (
            <div className="booking-grid__full booking-day-picker">
              <span className="booking-picker__label">{bookingCopy.daySelectorLabel}</span>
              <div className="booking-day-picker__grid">
                {sessionDays.map((day) => {
                  const isActive = day.date === selectedDay;
                  const allPast = day.sessions.every((slot) => slot.isPast);
                  const anyFutureDay = sessionDays.some((entry) => entry.sessions.some((slot) => !slot.isPast));
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={`booking-day-chip ${isActive ? "booking-day-chip--active" : ""} ${
                        allPast ? "booking-day-chip--disabled" : ""
                      }`}
                      onClick={() => setSelectedDay(day.date)}
                      disabled={allPast && anyFutureDay}
                      aria-pressed={isActive}
                    >
                      <span className="booking-day-chip__label">{day.label}</span>
                      <span className="booking-day-chip__meta">
                        {day.sessions.length} {daySlotLabel}{day.sessions.length === 1 ? "" : "s"}
                      </span>
                      {allPast && (
                        <span className="booking-day-chip__meta booking-day-chip__meta--warning">Past day</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!isWorkshopRequestMode && selectedDaySlots.length > 0 && (
            <div className="booking-grid__full booking-slot-picker">
              <span className="booking-picker__label">Time Slot</span>
              <div className="booking-slot-picker__grid">
                {selectedDaySlots.map((slot) => {
                  const disabled = slot.isPast && dayHasActiveSlots;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`booking-slot-chip ${
                        selectedSessionId === slot.id ? "booking-slot-chip--active" : ""
                      } ${disabled ? "booking-slot-chip--disabled" : ""}`}
                      onClick={() => setSelectedSessionId(slot.id)}
                      disabled={disabled}
                      aria-pressed={selectedSessionId === slot.id}
                    >
                      <span className="booking-slot-chip__label">{slot.timeRangeLabel || slot.formatted}</span>
                      <span className="booking-slot-chip__meta">
                        {slot.capacity
                          ? `${slot.capacity} seat${slot.capacity === 1 ? "" : "s"}`
                          : "Open booking"}
                      </span>
                      {slot.isPast && (
                        <span className="booking-slot-chip__meta booking-slot-chip__meta--warning">Past session</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedSession?.isPast && (
                <p className="form-feedback__message form-feedback__message--warning">
                  This session has already passed. Please choose another available time.
                </p>
              )}
            </div>
          )}
          {!isWorkshopRequestMode && sessionDays.length === 0 && (
            <p className="form-feedback__message form-feedback__message--warning booking-grid__full">
              Booking isn't available until new dates are scheduled.
            </p>
          )}
          {!isWorkshopRequestMode && sessionDays.length > 0 && selectedDaySlots.length === 0 && (
            <p className="form-feedback__message form-feedback__message--warning booking-grid__full">
              No time slots remain for the selected day. Please choose another date.
            </p>
          )}
          <div className={`booking-field${missingFields.includes("fullName") ? " booking-field--error" : ""}`}>
            <label htmlFor="guest-fullName">Full Name</label>
            <input
              className="input"
              type="text"
              id="guest-fullName"
              name="fullName"
              placeholder="Full name"
              value={formState.fullName}
              onChange={handleFieldChange("fullName")}
              aria-invalid={missingFields.includes("fullName") ? "true" : "false"}
              required
            />
            {missingFields.includes("fullName") && <p className="booking-field__error">Full name is required.</p>}
          </div>
          <div className={`booking-field${missingFields.includes("email") ? " booking-field--error" : ""}`}>
            <label htmlFor="guest-email">Email</label>
            <input
              className="input"
              type="email"
              id="guest-email"
              name="email"
              placeholder="Email address"
              value={formState.email}
              onChange={handleFieldChange("email")}
              aria-invalid={missingFields.includes("email") ? "true" : "false"}
              required
            />
            {missingFields.includes("email") && <p className="booking-field__error">Email is required.</p>}
          </div>
          <div className={`booking-field${missingFields.includes("phone") ? " booking-field--error" : ""}`}>
            <label htmlFor="guest-phone">Phone</label>
            <input
              className="input"
              type="tel"
              id="guest-phone"
              name="phone"
              placeholder="Contact number"
              value={formState.phone}
              onChange={handleFieldChange("phone")}
              aria-invalid={missingFields.includes("phone") ? "true" : "false"}
              required
            />
            {missingFields.includes("phone") && <p className="booking-field__error">Phone is required.</p>}
          </div>
          <div>
            <label htmlFor="guest-attendees">Number of Attendees</label>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              id="guest-attendees"
              name="attendeeCount"
              placeholder="1"
              value={formState.attendeeCount}
              onChange={handleFieldChange("attendeeCount")}
              required
            />
            {attendeeCountLimitMessage && <p className="modal__meta">{attendeeCountLimitMessage}</p>}
          </div>
          <div className="booking-grid__full booking-attendee-options">
            <div className="booking-attendee-options__header">
              <span className="booking-attendee-options__title">{bookingCopy.optionLabel}</span>
              {hasExtraOptions && (
                <label className="booking-attendee-options__toggle">
                  <input
                    type="checkbox"
                    checked={showExtraOptions}
                    onChange={(event) => setShowExtraOptions(event.target.checked)}
                  />
                  <span>Show extra add-ons</span>
                </label>
              )}
            </div>
            <p className="modal__meta">
              {isCutFlower ? "Choose the option for each person." : "Choose the frame for each attendee."}
            </p>
            {hasExtraOptions && !showExtraOptions && (
              <p className="modal__meta booking-attendee-options__note">
                Extra add-ons are hidden unless you turn them on.
              </p>
            )}
            {restrictedOptionsNote && (
              <p className="modal__meta booking-attendee-options__note">
                {restrictedOptionsNote}
              </p>
            )}
            {hasExtraSelections && (
              <p className="form-feedback__message form-feedback__message--warning booking-attendee-options__note">
                Extra add-ons are estimates and may change on the day.
              </p>
            )}
            <div className="booking-attendee-options__grid">
              {normalizedAttendeeSelections.map((selection, index) => {
                const selectedOption =
                  selectionOptions.find((option) => option.value === selection) ?? null;
                return (
                  <div className="booking-attendee-options__row" key={`attendee-option-${index + 1}`}>
                    <label htmlFor={`attendee-option-${index}`}>
                      Attendee {index + 1}
                    </label>
                    <div className="booking-attendee-options__control">
                      <select
                        className="input"
                        id={`attendee-option-${index}`}
                        value={selection}
                        onChange={handleAttendeeSelectionChange(index)}
                      >
                        {availableSelectionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.displayLabel ?? option.label}
                          </option>
                        ))}
                      </select>
                      {selectedOption?.isExtra && (
                        <span className="booking-attendee-options__hint">
                          Extra add-on pricing is an estimate.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="booking-grid__full">
            <label htmlFor="guest-notes">Notes</label>
            <textarea
              className="input textarea"
              id="guest-notes"
              name="notes"
              placeholder="Share any special requests or details the team should know."
              value={formState.notes}
              onChange={handleFieldChange("notes")}
            ></textarea>
          </div>
          <div className="booking-grid__full booking-summary">
            <p>
              <strong>Estimated Total:</strong> R{pricingSummary.total.toFixed(2)}
            </p>
            {isCutFlower ? (
              <>
                <p className="modal__meta booking-summary__note">
                  Estimate only. Final total may change if extra stems are chosen on the day.
                </p>
                {pricingSummary.attendeeItems.map((item) => (
                  <p className="modal__meta booking-summary__line" key={`estimate-${item.index}`}>
                    Attendee {item.index}: {item.label} (R{item.price.toFixed(2)})
                  </p>
                ))}
              </>
            ) : (
              pricingSummary.attendeeItems.map((item) => (
                <p className="modal__meta booking-summary__line" key={`estimate-${item.index}`}>
                  Attendee {item.index}: {item.label} (R{item.price.toFixed(2)})
                </p>
              ))
            )}
          </div>
          {submitError && (
            <div className="booking-grid__full form-feedback" aria-live="assertive">
              <p className="form-feedback__message form-feedback__message--error">{submitError}</p>
            </div>
          )}
          <button className="btn btn--primary booking-grid__full" type="submit" disabled={isAddDisabled}>
            {submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;
