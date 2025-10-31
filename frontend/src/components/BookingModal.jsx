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

  const workshop = bookingContext?.workshop ?? null;

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

    setFormState({
      fullName: customer.fullName ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      attendeeCount,
      framePreference: defaultFrameValue,
      notes: bookingContext?.notes ?? "",
    });
    setFormStatus("idle");
    setSubmitError(null);
  }, [isBookingOpen, bookingContext, frameOptions]);

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
      setSubmitError("We couldn’t load the workshop details. Please close and try again.");
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

    const cartItemId = `workshop-${workshop.id}-${Date.now()}`;

    addItem({
      id: cartItemId,
      name: `${workshop.title} Workshop`,
      price: totalPrice,
      quantity: 1,
      metadata: {
        type: "workshop",
        workshopId: workshop.id,
        workshopTitle: workshop.title,
        scheduledFor: workshop.scheduledFor ?? null,
        scheduledDateLabel: workshop.scheduledDateLabel ?? null,
        location: workshop.location ?? null,
        attendeeCount: attendeeCountNumber,
        framePreference,
        perAttendeePrice,
        notes: trimmed.notes,
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

  const isSubmitting = formStatus === "submitting";

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
          Secure Your Workshop Seat
        </h2>
        {workshop ? (
          <div className="booking-summary">
            <p>
              <strong>{workshop.title}</strong>
            </p>
            <p className="modal__meta">
              {workshop.scheduledDateLabel || "Date to be confirmed"} · {workshop.location || "Vereeniging Studio"}
            </p>
          </div>
        ) : (
          <p className="empty-state">Workshop details unavailable. Close the dialog and try again.</p>
        )}
        <form className="booking-grid" onSubmit={handleSubmit} noValidate>
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
          <button className="btn btn--primary booking-grid__full" type="submit" disabled={isSubmitting || !workshop}>
            {isSubmitting ? "Adding to cart…" : "Add to Cart"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;
