  import { useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  addDoc,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { getFirebaseDb, getFirebaseFunctions } from "../lib/firebase.js";

const currency = (value) => `R${value.toFixed(2)}`;

function CartModal() {
  const { items, removeItem, clearCart, totalPrice } = useCart();
  const { isCartOpen, closeCart } = useModal();
  const closeButtonRef = useRef(null);
  const [checkoutDetails, setCheckoutDetails] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
  });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);
  const functions = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const cartTypeLabel = useMemo(() => {
    if (!items.length) return null;
    return items[0]?.metadata?.type === "workshop" ? "workshop bookings" : "products";
  }, [items]);

  const getNextOrderNumber = async () => {
    if (!db) return 1000;
    const counterRef = doc(db, "config", "orderCounter");
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      const currentValue = snapshot.exists() ? snapshot.data().value : 999;
      const safeValue = Number.isFinite(currentValue) ? Number(currentValue) : 999;
      const nextValue = safeValue + 1;
      transaction.set(counterRef, { value: nextValue }, { merge: true });
      return nextValue;
    });
  };

  useEffect(() => {
    if (isCartOpen) {
      closeButtonRef.current?.focus({ preventScroll: true });
      const metadataCustomer = items.find((item) => item.metadata?.customer)?.metadata?.customer;
      if (metadataCustomer) {
        setCheckoutDetails((prev) => ({ ...prev, ...metadataCustomer }));
      }
    }
  }, [isCartOpen, items]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && isCartOpen) {
        closeCart();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isCartOpen, closeCart]);

  useEffect(() => {
    if (orderSuccess) {
      const timeout = setTimeout(() => {
        setOrderSuccess(null);
        closeCart();
      }, 2200);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [orderSuccess, closeCart]);

  const handleCheckoutChange = (field) => (event) => {
    const value = event.target.value;
    setCheckoutDetails((prev) => ({ ...prev, [field]: value }));
  };

  const submitPayfastForm = (url, fields) => {
    if (typeof document === "undefined") return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    form.style.display = "none";

    Object.entries(fields || {}).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  };

  const handlePlaceOrder = async () => {
    if (!items.length || !db) return;

    const metadataCustomer = items.find((item) => item.metadata?.customer)?.metadata?.customer;
    const customer = {
      fullName: checkoutDetails.fullName || metadataCustomer?.fullName || "",
      email: checkoutDetails.email || metadataCustomer?.email || "",
      phone: checkoutDetails.phone || metadataCustomer?.phone || "",
      address: checkoutDetails.address || metadataCustomer?.address || "",
    };

    const requiredFields = ["fullName", "email", "phone", "address"];
    const missing = requiredFields.filter((field) => !customer[field]?.trim());
    if (missing.length) {
      setOrderError("Please complete your contact details before placing the order.");
      return;
    }

    setOrderError(null);
    setPlacingOrder(true);

    const orderItems = items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: typeof item.price === "number" ? item.price : Number(item.price) || 0,
      metadata: item.metadata ?? null,
    }));

    const orderTotal = orderItems.reduce((sum, entry) => sum + entry.price * entry.quantity, 0);

    try {
      const nextOrderNumber = await getNextOrderNumber();
      const orderRef = await addDoc(collection(db, "orders"), {
        orderNumber: nextOrderNumber,
        customer: {
          fullName: customer.fullName.trim(),
          email: customer.email.trim(),
          phone: customer.phone.trim(),
          address: customer.address.trim(),
        },
        items: orderItems,
        totalPrice: orderTotal,
        status: "pending",
        paymentStatus: "awaiting",
        trackingLink: null,
        createdAt: serverTimestamp(),
      });

      const workshopItems = orderItems.filter(
        (item) => item.metadata?.type === "workshop",
      );
      if (workshopItems.length > 0) {
        await Promise.all(
          workshopItems.map((item) => {
            const frameValue =
              (item.metadata?.framePreference || "Workshop")
                .toString()
                .slice(0, 20) || "Workshop";
            const notesParts = [
              item.metadata?.sessionDayLabel ||
                item.metadata?.scheduledDateLabel ||
                null,
              item.metadata?.sessionLabel ||
                item.metadata?.sessionTimeRange ||
                item.metadata?.sessionTime ||
                null,
              item.metadata?.location || null,
              item.metadata?.attendeeCount
                ? `${item.metadata.attendeeCount} attendee(s)`
                : null,
            ].filter(Boolean);
            const notesValue = [
              ...notesParts,
              item.metadata?.notes || "",
            ]
              .filter(Boolean)
              .join(" · ")
              .slice(0, 1000);

            const sessionDateValue =
              item.metadata?.sessionDate ||
              item.metadata?.session?.date ||
              null;
            const sessionLabelValue =
              item.metadata?.sessionLabel ||
              item.metadata?.sessionTimeRange ||
              item.metadata?.sessionTime ||
              null;

            return addDoc(collection(db, "bookings"), {
              name:
                item.metadata?.customer?.fullName ||
                customer.fullName ||
                "Guest",
              email:
                item.metadata?.customer?.email ||
                customer.email ||
                "no-reply@bethanyblooms.co.za",
              frame: frameValue,
              notes: notesValue,
              sessionDate: sessionDateValue,
              sessionLabel: sessionLabelValue,
              workshopId: item.metadata?.workshopId || null,
              orderId: orderRef.id,
              paid: false,
              createdAt: serverTimestamp(),
            });
          }),
        );
      }

      // Temporarily disable PayFast redirect while we gather account details
      const shouldRequestPayment = false;
      let payfastPayload = null;

      if (shouldRequestPayment) {
        try {
          const createPayfastPayment = httpsCallable(functions, "createPayfastPayment");
          const { data: payfastData } = await createPayfastPayment({
            orderId: orderRef.id,
            orderNumber: nextOrderNumber,
            amount: orderTotal,
            returnUrl: `${window.location.origin}/payment/success`,
            cancelUrl: `${window.location.origin}/payment/cancel`,
            customerName: customer.fullName,
            customerEmail: customer.email,
          });
          payfastPayload = payfastData;
        } catch (error) {
          console.error("PayFast payload failed", error);
        }
      }

      clearCart();
      setOrderSuccess(payfastPayload ? "Redirecting to PayFast…" : "Thank you! Your order has been received.");

      if (payfastPayload?.url && payfastPayload?.fields) {
        submitPayfastForm(payfastPayload.url, payfastPayload.fields);
      }
    } catch (error) {
      setOrderError(error.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div
      className={`modal ${isCartOpen ? "is-active" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={isCartOpen ? "false" : "true"}
      aria-labelledby="cart-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeCart();
      }}
    >
      <div className="modal__content">
        <button
          ref={closeButtonRef}
          className="modal__close"
          type="button"
          onClick={closeCart}
          aria-label="Close cart"
        >
          &times;
        </button>
        <h2 className="modal__title" id="cart-title">
          Your Cart
        </h2>
        {cartTypeLabel && (
          <p className="modal__meta">
            Your cart currently contains {cartTypeLabel}. Clear it before switching between workshops and products.
          </p>
        )}
        {items.length === 0 ? (
          <p className="empty-state">Your cart is currently empty. Add a product or workshop booking to begin.</p>
        ) : (
          <ul className="modal__list cart-list">
            {items.map((item) => {
              const unitPrice = typeof item.price === "number" ? item.price : Number(item.price) || 0;
              const total = unitPrice * item.quantity;
              return (
                <li key={item.id} className="cart-list__item">
                  <div className="cart-list__header">
                    <span className="cart-list__title">
                      {item.name}
                      <span className="badge">x{item.quantity}</span>
                    </span>
                    <span className="cart-list__price">{currency(total)}</span>
                  </div>
                  {item.metadata?.type === "workshop" && (
                    <div className="cart-list__meta">
                      <p>
                        <strong>Workshop:</strong> {item.metadata.workshopTitle}
                      </p>
                      <p>
                        <strong>Day:</strong>{" "}
                        {item.metadata.sessionDayLabel || item.metadata.sessionLabel || item.metadata.scheduledDateLabel || "Date to be confirmed"}
                      </p>
                      {(item.metadata.sessionTimeRange || item.metadata.sessionTime) && (
                        <p>
                          <strong>Time:</strong> {item.metadata.sessionTimeRange || item.metadata.sessionTime}
                        </p>
                      )}
                      <p>
                        <strong>Location:</strong> {item.metadata.location || "Vereeniging Studio"}
                      </p>
                      <p>
                        <strong>Attendees:</strong> {item.metadata.attendeeCount}
                      </p>
                      {typeof item.metadata.sessionCapacity === "number" && (
                        <p>
                          <strong>Session Capacity:</strong> {item.metadata.sessionCapacity}
                        </p>
                      )}
                      {typeof item.metadata.perAttendeePrice === "number" && (
                        <p>
                          <strong>Per Attendee:</strong> R{item.metadata.perAttendeePrice.toFixed(2)}
                        </p>
                      )}
                      {item.metadata.framePreference && (
                        <p>
                          <strong>Frame:</strong> {item.metadata.framePreference}
                        </p>
                      )}
                      {item.metadata.notes && (
                        <p>
                          <strong>Notes:</strong> {item.metadata.notes}
                        </p>
                      )}
                      <p>
                        <strong>Booked by:</strong> {item.metadata.customer?.fullName} ({item.metadata.customer?.email})
                      </p>
                      {item.metadata.customer?.phone && (
                        <p>
                          <strong>Phone:</strong> {item.metadata.customer.phone}
                        </p>
                      )}
                      {item.metadata.customer?.address && (
                        <p>
                          <strong>Address:</strong> {item.metadata.customer.address}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="cart-list__actions">
                    <button
                      className="remove-btn"
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p>
          <strong>Total:</strong> <span>{currency(totalPrice)}</span>
        </p>
        {items.length > 0 && (
          <div className="checkout-form">
            <h3>Checkout Details</h3>
            <p className="modal__meta">
              We’ll use these details to confirm your order and share collection information.
            </p>
            <label>
              Full Name
              <input
                className="input"
                type="text"
                value={checkoutDetails.fullName}
                onChange={handleCheckoutChange("fullName")}
                placeholder="Full name"
                required
              />
            </label>
            <label>
              Email
              <input
                className="input"
                type="email"
                value={checkoutDetails.email}
                onChange={handleCheckoutChange("email")}
                placeholder="Email address"
                required
              />
            </label>
            <label>
              Phone
              <input
                className="input"
                type="tel"
                value={checkoutDetails.phone}
                onChange={handleCheckoutChange("phone")}
                placeholder="Phone number"
                required
              />
            </label>
            <label>
              Address
              <textarea
                className="input textarea"
                value={checkoutDetails.address}
                onChange={handleCheckoutChange("address")}
                placeholder="Delivery or correspondence address"
                required
              />
            </label>
          </div>
        )}
        {orderError && <p className="admin-panel__error">{orderError}</p>}
        {orderSuccess && <p className="admin-save-indicator">{orderSuccess}</p>}
        <button
          className="btn btn--primary"
          type="button"
          onClick={handlePlaceOrder}
          disabled={placingOrder || items.length === 0}
        >
          {placingOrder ? "Placing Order…" : "Place Order"}
        </button>
      </div>
    </div>
  );
}

export default CartModal;
