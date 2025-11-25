import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";

const DEFAULT_FRAME_OPTIONS = [
  { value: "A5", label: "A5 – R350", price: 350 },
  { value: "A4", label: "A4 – R550", price: 550 },
  { value: "A3", label: "A3 – R650", price: 650 },
];

const INITIAL_BOOKING_FORM = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  attendeeCount: "1",
  framePreference: "A5",
  notes: "",
};

const REQUIRED_FIELDS = ["fullName", "email", "phone", "address"];

function BookingModal() {
  const { isBookingOpen, closeBooking, openCart, bookingContext } = useModal();
  const { addItem } = useCart();
  const closeButtonRef = useRef(null);
  const [formState, setFormState] = useState(INITIAL_BOOKING_FORM);
  const [formStatus, setFormStatus] = useState("idle");
  const [submitError, setSubmitError] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  const workshop = bookingContext?.workshop ?? null;
  const bookingType = bookingContext?.type ?? "workshop";
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
        }
      : {
          heading: "Secure Your Workshop Seat",
          nounLower: "workshop",
          detailsUnavailable: "Workshop details unavailable. Close the dialog and try again.",
          unavailable: "This workshop is not currently accepting bookings. Please check back soon.",
          selectSession: "Please choose a workshop day and time slot before continuing.",
          addLabel: "Add to Cart",
          itemLabel: "Workshop",
          daySelectorLabel: "Workshop Day",
          noSessionsCta: "No Sessions Available",
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

  const frameOptions = useMemo(() => {
    if (Array.isArray(workshop?.frameOptions) && workshop.frameOptions.length > 0) {
      return workshop.frameOptions
        .map((option, index) => {
          if (typeof option !== "object" || option === null) return null;
          const value = option.value ?? option.size ?? option.label ?? `frame-${index}`;
          const label = option.label ?? option.name ?? value;
          const priceValue = Number(option.price);
          return {
            value,
            label,
            price: Number.isFinite(priceValue) ? priceValue : undefined,
          };
        })
        .filter(Boolean);
    }
    return DEFAULT_FRAME_OPTIONS;
  }, [workshop]);

  useEffect(() => {
    if (isBookingOpen) {
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [isBookingOpen]);

  useEffect(() => {
    if (!isBookingOpen) {
      setFormState(INITIAL_BOOKING_FORM);
      setFormStatus("idle");
      setSubmitError(null);
      setSelectedSessionId(null);
      return;
    }

    const customer = bookingContext?.customer ?? {};
    const attendeeCount =
      bookingContext?.attendeeCount !== undefined
        ? String(bookingContext.attendeeCount)
        : INITIAL_BOOKING_FORM.attendeeCount;
    const preferredFrame = bookingContext?.framePreference ?? INITIAL_BOOKING_FORM.framePreference;
    const defaultFrameValue =
      frameOptions.find((option) => option.value === preferredFrame)?.value ??
      frameOptions[0]?.value ??
      INITIAL_BOOKING_FORM.framePreference;

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
      framePreference: defaultFrameValue,
      notes: bookingContext?.notes ?? "",
    });
    const initialSession = normalizedPreferred ?? fallbackSession ?? null;
    setSelectedSessionId(initialSession?.id ?? null);
    setSelectedDay(initialSession?.date ?? sessions[0]?.date ?? null);
    setFormStatus("idle");
    setSubmitError(null);
  }, [isBookingOpen, bookingContext, frameOptions, sessions, workshop]);

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
    setFormState((prev) => ({
      ...prev,
      [field]: field === "attendeeCount" ? value.replace(/[^\d]/g, "") : value,
    }));
  };

  const pricingSummary = useMemo(() => {
    const fallbackPrice =
      workshop?.unitPrice ??
      (typeof workshop?.price === "number" ? workshop.price : Number(workshop?.price) || 0);
    const selectedOption =
      frameOptions.find((option) => option.value === formState.framePreference) ?? frameOptions[0];
    const perAttendeePrice =
      selectedOption?.price !== undefined && Number.isFinite(selectedOption.price)
        ? selectedOption.price
        : fallbackPrice;
    const attendeeCountNumber = Math.max(1, Number.parseInt(formState.attendeeCount, 10) || 1);
    const total = perAttendeePrice * attendeeCountNumber;
    return {
      perAttendeePrice,
      attendeeCount: attendeeCountNumber,
      total,
    };
  }, [formState.attendeeCount, formState.framePreference, frameOptions, workshop]);

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitError(null);

    if (!workshop) {
      setFormStatus("error");
      setSubmitError(bookingCopy.detailsUnavailable);
      return;
    }

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

    const trimmed = {
      fullName: formState.fullName.trim(),
      email: formState.email.trim(),
      phone: formState.phone.trim(),
      address: formState.address.trim(),
      notes: formState.notes.trim(),
    };

    const missing = REQUIRED_FIELDS.filter((field) => !trimmed[field]);
    if (missing.length > 0) {
      setFormStatus("error");
      setSubmitError("Please complete all contact fields before continuing.");
      return;
    }

    setFormStatus("submitting");

    const attendeeCountNumber = pricingSummary.attendeeCount;
    const perAttendeePrice = pricingSummary.perAttendeePrice;
    const totalPrice = pricingSummary.total;

    const framePreference =
      frameOptions.find((option) => option.value === formState.framePreference)?.value ??
      frameOptions[0]?.value ??
      INITIAL_BOOKING_FORM.framePreference;

    const cartItemId = `${bookingType}-${workshop.id}-${selectedSession.id}-${Date.now()}`;

    addItem({
      id: cartItemId,
      name: `${workshop.title} ${bookingCopy.itemLabel}`,
      price: totalPrice,
      quantity: 1,
      metadata: {
        type: bookingType,
        workshopId: workshop.id,
        workshopTitle: workshop.title,
        scheduledFor: selectedSession.start ?? workshop.scheduledFor ?? null,
        scheduledDateLabel: summaryLabel || selectedSession.formatted || workshop.scheduledDateLabel || null,
        location: workshop.location ?? null,
        attendeeCount: attendeeCountNumber,
        framePreference,
        perAttendeePrice,
        notes: trimmed.notes,
        sessionId: selectedSession.id,
        sessionLabel: selectedSession.label ?? selectedSession.formatted,
        sessionStart: selectedSession.start ?? null,
        sessionDate: selectedSession.date ?? null,
        sessionTime: selectedSession.time ?? null,
        sessionTimeRange: selectedSession.timeRangeLabel ?? null,
        sessionCapacity:
          typeof selectedSession.capacity === "number" ? selectedSession.capacity : null,
        sessionDay: selectedDay ?? null,
        sessionDayLabel: selectedDayLabel ?? null,
        session: {
          id: selectedSession.id,
          label: selectedSession.label ?? null,
          formatted: selectedSession.formatted,
          start: selectedSession.start ?? null,
          date: selectedSession.date ?? null,
          time: selectedSession.time ?? null,
          capacity:
            typeof selectedSession.capacity === "number" ? selectedSession.capacity : null,
        },
        customer: {
          fullName: trimmed.fullName,
          email: trimmed.email,
          phone: trimmed.phone,
          address: trimmed.address,
        },
      },
    });

    setFormStatus("success");
    setFormState(INITIAL_BOOKING_FORM);
    closeBooking();
    openCart();
  };

  const summaryLabel = (() => {
    if (!workshop) return "";
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
    sessionDays.length === 0 ||
    !selectedDay ||
    !selectedSession ||
    (selectedSession.isPast && hasActiveSession);
  const submitLabel = (() => {
    if (isSubmitting) return bookingType === "cut-flower" ? "Reserving…" : "Adding to cart…";
    if (!workshop) return bookingCopy.addLabel;
    if (sessionDays.length === 0) return bookingCopy.noSessionsCta;
    if (!selectedDay) return "Select a Day";
    if (!selectedSession) return "Select Time Slot";
    if (selectedSession.isPast && hasActiveSession) return "Select Available Session";
    return bookingCopy.addLabel;
  })();

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
            {selectedSession?.capacity && (
              <p className="modal__meta">
                {selectedSession.capacity} seat{selectedSession.capacity === 1 ? "" : "s"} available
              </p>
            )}
            {sessionDays.length === 0 && (
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
          {sessionDays.length > 0 && (
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
                        {day.sessions.length} slot{day.sessions.length === 1 ? "" : "s"}
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
          {selectedDaySlots.length > 0 && (
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
          {sessionDays.length === 0 && (
            <p className="form-feedback__message form-feedback__message--warning booking-grid__full">
              Booking isn’t available until new dates are scheduled.
            </p>
          )}
          {sessionDays.length > 0 && selectedDaySlots.length === 0 && (
            <p className="form-feedback__message form-feedback__message--warning booking-grid__full">
              No time slots remain for the selected day. Please choose another date.
            </p>
          )}
          <div>
            <label htmlFor="guest-fullName">Full Name</label>
            <input
              className="input"
              type="text"
              id="guest-fullName"
              name="fullName"
              placeholder="Full name"
              value={formState.fullName}
              onChange={handleFieldChange("fullName")}
              required
            />
          </div>
          <div>
            <label htmlFor="guest-email">Email</label>
            <input
              className="input"
              type="email"
              id="guest-email"
              name="email"
              placeholder="Email address"
              value={formState.email}
              onChange={handleFieldChange("email")}
              required
            />
          </div>
          <div>
            <label htmlFor="guest-phone">Phone</label>
            <input
              className="input"
              type="tel"
              id="guest-phone"
              name="phone"
              placeholder="Contact number"
              value={formState.phone}
              onChange={handleFieldChange("phone")}
              required
            />
          </div>
          <div>
            <label htmlFor="guest-address">Address</label>
            <textarea
              className="input textarea"
              id="guest-address"
              name="address"
              placeholder="Delivery or correspondence address"
              value={formState.address}
              onChange={handleFieldChange("address")}
              required
            />
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
          </div>
          <div>
            <label htmlFor="guest-frame">Preferred Frame Size</label>
            <select
              className="input"
              id="guest-frame"
              name="framePreference"
              value={formState.framePreference}
              onChange={handleFieldChange("framePreference")}
            >
              {frameOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            <p className="modal__meta">
              {pricingSummary.attendeeCount} attendee(s) · R{pricingSummary.perAttendeePrice.toFixed(2)} per person
            </p>
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
