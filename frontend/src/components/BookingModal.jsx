import { useEffect, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useModal } from "../context/ModalContext.jsx";
import { getFirebaseDb } from "../lib/firebase.js";

const INITIAL_BOOKING_FORM = {
  name: "",
  email: "",
  frame: "A5",
  notes: "",
};

function BookingModal() {
  const { isBookingOpen, closeBooking } = useModal();
  const closeButtonRef = useRef(null);
  const [formState, setFormState] = useState(INITIAL_BOOKING_FORM);
  const [formStatus, setFormStatus] = useState("idle");
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    if (isBookingOpen) {
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [isBookingOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && isBookingOpen) {
        closeBooking();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isBookingOpen, closeBooking]);

  useEffect(() => {
    if (!isBookingOpen) {
      setFormState(INITIAL_BOOKING_FORM);
      setFormStatus("idle");
      setSubmitError(null);
    }
  }, [isBookingOpen]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError(null);

    if (!formState.name.trim() || !formState.email.trim()) {
      setSubmitError("Name and email are required.");
      return;
    }

    setFormStatus("submitting");

    try {
      const db = getFirebaseDb();
      await addDoc(collection(db, "bookings"), {
        name: formState.name.trim(),
        email: formState.email.trim(),
        frame: formState.frame,
        notes: formState.notes.trim(),
        createdAt: serverTimestamp(),
      });
      setFormState(INITIAL_BOOKING_FORM);
      setFormStatus("success");
    } catch (error) {
      console.warn("Booking submission failed", error);
      setSubmitError(
        "We couldn’t send your booking right now. Please try again later or contact us directly.",
      );
      setFormStatus("error");
    }
  };

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
          Reserve Your Workshop Seat
        </h2>
        <form className="booking-grid" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="guest-name">Name</label>
            <input
              className="input"
              type="text"
              id="guest-name"
              name="name"
              placeholder="Full name"
              value={formState.name}
              onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
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
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
          <div>
            <label htmlFor="guest-frame">Preferred Frame Size</label>
            <select
              className="input"
              id="guest-frame"
              name="frame"
              value={formState.frame}
              onChange={(event) => setFormState((prev) => ({ ...prev, frame: event.target.value }))}
            >
              <option value="A5">A5 – R350</option>
              <option value="A4">A4 – R550</option>
              <option value="A3">A3 – R650</option>
            </select>
          </div>
          <div>
            <label htmlFor="guest-notes">Notes</label>
            <textarea
              className="input"
              id="guest-notes"
              name="notes"
              placeholder="Dietary needs or special requests"
              value={formState.notes}
              onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
            ></textarea>
          </div>
          <button className="btn btn--primary" type="submit" disabled={formStatus === "submitting"}>
            {formStatus === "submitting" ? "Submitting booking…" : "Submit Booking"}
          </button>
          <div className="form-feedback" aria-live="polite">
            {formStatus === "success" && <p className="form-feedback__message">Thank you! We’ll confirm your seat shortly.</p>}
            {submitError && <p className="form-feedback__message form-feedback__message--error">{submitError}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;
