import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import {
  EFT_BANK_DETAILS,
  PAYMENT_METHODS,
} from "../lib/paymentMethods.js";
import {
  clearPayfastPendingSession,
  setPayfastPendingSession,
} from "../lib/payfastSession.js";
import { SA_PROVINCES, formatShippingAddress } from "../lib/shipping.js";
import { getStockStatus } from "../lib/stockStatus.js";

const currency = (value) => `R${value.toFixed(2)}`;
const PAYFAST_FUNCTION_URL =
  "https://us-central1-bethanyblooms-89dcc.cloudfunctions.net/createPayfastPaymentHttp";
const EFT_FUNCTION_URL =
  "https://us-central1-bethanyblooms-89dcc.cloudfunctions.net/createEftOrderHttp";
const STEP_ORDER = ["contact", "shipping", "payment", "review"];
const STEP_LABELS = {
  contact: "Contact",
  shipping: "Shipping",
  payment: "Payment",
  review: "Review",
};

function CartPage() {
  const navigate = useNavigate();
  usePageMetadata({
    title: "Your Cart | Bethany Blooms",
    description: "Review your Bethany Blooms items, add your details, and complete checkout.",
  });

  const { items, removeItem, updateItemQuantity, clearCart, totalPrice, totalCount } = useCart();
  const { items: courierOptions = [], status: courierStatus } = useFirestoreCollection("courierOptions", {
    orderByField: "createdAt",
    orderDirection: "desc",
    fallback: [],
  });
  const { items: productInventory = [] } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
    fallback: [],
  });
  const [contactDetails, setContactDetails] = useState({
    fullName: "",
    email: "",
    phone: "",
  });
  const [shippingAddress, setShippingAddress] = useState({
    street: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
  });
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS.PAYFAST);
  const [payfastConsent, setPayfastConsent] = useState(false);
  const [activeStep, setActiveStep] = useState(STEP_ORDER[0]);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(null);

  const contactRef = useRef(null);
  const shippingRef = useRef(null);
  const paymentRef = useRef(null);
  const reviewRef = useRef(null);
  const contactFirstFieldRef = useRef(null);

  const cartTypeLabel = useMemo(() => {
    if (!items.length) return null;
    return items[0]?.metadata?.type === "workshop" ? "workshop bookings" : "products";
  }, [items]);

  const productLookup = useMemo(() => {
    const map = new Map();
    productInventory.forEach((product) => {
      if (!product) return;
      if (product.id) map.set(product.id, product);
      if (product.slug) map.set(product.slug, product);
    });
    return map;
  }, [productInventory]);

  const resolveStock = (item) => {
    if (!item || item.metadata?.type !== "product") return null;
    const productId = item.metadata?.productId || item.metadata?.productID || item.metadata?.product;
    const product = productLookup.get(productId) || null;
    if (!product) return null;
    const variantId = item.metadata?.variantId || null;
    const variant =
      variantId && Array.isArray(product.variants)
        ? product.variants.find((entry) => entry.id === variantId)
        : null;
    const rawQuantity =
      variant?.stock_quantity ??
      variant?.stockQuantity ??
      variant?.quantity ??
      product.stock_quantity ??
      product.stockQuantity ??
      product.quantity;
    const stockStatus = getStockStatus({
      quantity: rawQuantity,
      forceOutOfStock: product.forceOutOfStock || product.stock_status === "out_of_stock",
      status: product.stock_status,
    });
    const quantity = Number.isFinite(stockStatus.quantity) ? stockStatus.quantity : null;
    return {
      status: stockStatus,
      quantity,
    };
  };

  const TrashIcon = () => (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 7h14M9 7V5h6v2M8 7v12m4-12v12m4-12v12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const hasItems = items.length > 0;
  const isContactComplete = Boolean(
    contactDetails.fullName.trim() &&
      contactDetails.email.trim() &&
      contactDetails.phone.trim(),
  );
  const postalCodeValid = /^\d{4}$/.test(shippingAddress.postalCode.trim());
  const isShippingComplete = Boolean(
    shippingAddress.street.trim() &&
      shippingAddress.suburb.trim() &&
      shippingAddress.city.trim() &&
      shippingAddress.province.trim() &&
      postalCodeValid &&
      selectedCourierId,
  );
  const isPaymentComplete =
    paymentMethod === PAYMENT_METHODS.PAYFAST ? payfastConsent : true;
  const stepCompletion = {
    contact: isContactComplete,
    shipping: isShippingComplete,
    payment: isPaymentComplete,
    review: hasItems,
  };

  const availableCouriers = useMemo(() => {
    if (!shippingAddress.province) return [];
    return courierOptions
      .filter((option) => option.isActive !== false)
      .map((option) => {
        const provinceConfig = option.provinces?.[shippingAddress.province] || {};
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
  }, [courierOptions, shippingAddress.province]);

  const selectedCourier =
    availableCouriers.find((option) => option.id === selectedCourierId) || null;
  const shippingCost = selectedCourier ? selectedCourier.price : 0;
  const itemSubtotal = totalPrice;
  const orderTotal = itemSubtotal + shippingCost;

  const firstIncompleteIndex = STEP_ORDER.findIndex((step) => !stepCompletion[step]);
  const maxOpenIndex = firstIncompleteIndex === -1 ? STEP_ORDER.length - 1 : firstIncompleteIndex;
  const activeIndex = STEP_ORDER.indexOf(activeStep);
  const nextStep = STEP_ORDER[activeIndex + 1];
  const primaryActionLabel = (() => {
    if (activeStep === "review") {
      if (placingOrder) {
        return paymentMethod === PAYMENT_METHODS.EFT
          ? "Submitting EFT Order..."
          : "Placing Order...";
      }
      return "Place Order";
    }
    if (activeStep === "contact" && !isContactComplete) {
      return "Continue with checkout";
    }
    return `Continue to ${STEP_LABELS[nextStep]}`;
  })();

  useEffect(() => {
    if (activeIndex > maxOpenIndex) {
      setActiveStep(STEP_ORDER[maxOpenIndex]);
    }
  }, [activeIndex, maxOpenIndex]);

  useEffect(() => {
    if (!items.length) return;
    const metadataCustomer = items.find((item) => item.metadata?.customer)?.metadata?.customer;
    if (!metadataCustomer) return;
    setContactDetails((prev) => {
      const hasValues = Object.values(prev).some((value) => value?.trim());
      if (hasValues) return prev;
      return {
        ...prev,
        fullName: metadataCustomer.fullName || "",
        email: metadataCustomer.email || "",
        phone: metadataCustomer.phone || "",
      };
    });
    setShippingAddress((prev) => {
      const hasValues = Object.values(prev).some((value) => value?.trim());
      if (hasValues) return prev;
      return {
        ...prev,
        street: metadataCustomer.address || "",
      };
    });
  }, [items]);

  useEffect(() => {
    if (!orderSuccess) return undefined;
    const timeout = setTimeout(() => {
      setOrderSuccess(null);
    }, 2200);
    return () => clearTimeout(timeout);
  }, [orderSuccess]);

  useEffect(() => {
    if (!shippingAddress.province) {
      setSelectedCourierId("");
      return;
    }
    const stillAvailable = availableCouriers.some((option) => option.id === selectedCourierId);
    if (stillAvailable) return;
    setSelectedCourierId(availableCouriers[0]?.id || "");
  }, [availableCouriers, selectedCourierId, shippingAddress.province]);

  const handleContactChange = (field) => (event) => {
    const value = event.target.value;
    setContactDetails((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (field) => (event) => {
    const value = event.target.value;
    setShippingAddress((prev) => ({ ...prev, [field]: value }));
  };

  const scrollToStep = (step) => {
    const refMap = {
      contact: contactRef,
      shipping: shippingRef,
      payment: paymentRef,
      review: reviewRef,
    };
    const target = refMap[step]?.current;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const openStep = (step) => {
    const stepIndex = STEP_ORDER.indexOf(step);
    if (!hasItems || stepIndex > maxOpenIndex) return;
    setActiveStep(step);
    scrollToStep(step);
  };

  const validateStep = (step) => {
    if (!hasItems) {
      return { ok: false, message: "Add items to start checkout." };
    }
    if (step === "contact" && !isContactComplete) {
      return { ok: false, message: "Please complete your contact details to continue." };
    }
    if (step === "shipping" && !isShippingComplete) {
      return { ok: false, message: "Please complete your delivery address and courier selection to continue." };
    }
    if (step === "payment" && !isPaymentComplete) {
      return {
        ok: false,
        message:
          paymentMethod === PAYMENT_METHODS.PAYFAST
            ? "Please confirm the PayFast payment step to continue."
            : "Please choose your payment method to continue.",
      };
    }
    return { ok: true };
  };

  const handlePrimaryAction = () => {
    if (activeStep === "review") {
      handlePlaceOrder();
      return;
    }
    if (activeStep === "contact" && !isContactComplete) {
      setOrderError(null);
      setActiveStep("contact");
      scrollToStep("contact");
      contactFirstFieldRef.current?.focus({ preventScroll: true });
      return;
    }
    const validation = validateStep(activeStep);
    if (!validation.ok) {
      setOrderError(validation.message);
      return;
    }
    setOrderError(null);
    if (nextStep) {
      setActiveStep(nextStep);
      scrollToStep(nextStep);
    }
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
    if (!hasItems) return;

    const incompleteStep = (() => {
      if (!isContactComplete) {
        return { step: "contact", message: "Please complete your contact details before checkout." };
      }
      if (!isShippingComplete) {
        return {
          step: "shipping",
          message: "Please complete your delivery address and courier selection before checkout.",
        };
      }
      if (!isPaymentComplete) {
        return {
          step: "payment",
          message:
            paymentMethod === PAYMENT_METHODS.PAYFAST
              ? "Please confirm the PayFast payment step before checkout."
              : "Please choose your payment method before checkout.",
        };
      }
      return null;
    })();

    if (incompleteStep) {
      setOrderError(incompleteStep.message);
      setActiveStep(incompleteStep.step);
      scrollToStep(incompleteStep.step);
      return;
    }

    const metadataCustomer = items.find((item) => item.metadata?.customer)?.metadata?.customer;
    const normalizedShippingAddress = {
      street: shippingAddress.street.trim(),
      suburb: shippingAddress.suburb.trim(),
      city: shippingAddress.city.trim(),
      province: shippingAddress.province.trim(),
      postalCode: shippingAddress.postalCode.trim(),
    };
    const formattedAddress = formatShippingAddress(normalizedShippingAddress);
    const customer = {
      fullName: contactDetails.fullName || metadataCustomer?.fullName || "",
      email: contactDetails.email || metadataCustomer?.email || "",
      phone: contactDetails.phone || metadataCustomer?.phone || "",
      address: formattedAddress || metadataCustomer?.address || "",
    };

    const requiredFields = ["fullName", "email", "phone", "address"];
    const missing = requiredFields.filter((field) => !customer[field]?.trim());
    if (missing.length) {
      setOrderError("Please complete your contact and shipping details before placing the order.");
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
    const finalTotal = orderTotal + shippingCost;

    try {
      const checkoutPayload = {
        customer: {
          fullName: customer.fullName.trim(),
          email: customer.email.trim(),
          phone: customer.phone.trim(),
          address: customer.address.trim(),
        },
        items: orderItems,
        subtotal: orderTotal,
        shippingCost,
        shippingAddress: normalizedShippingAddress,
        shipping: selectedCourier
          ? {
              courierId: selectedCourier.id,
              courierName: selectedCourier.name,
              courierPrice: selectedCourier.price,
              province: normalizedShippingAddress.province,
            }
          : null,
        totalPrice: finalTotal,
      };

      if (paymentMethod === PAYMENT_METHODS.EFT) {
        const response = await fetch(EFT_FUNCTION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...checkoutPayload,
            paymentMethod: PAYMENT_METHODS.EFT,
          }),
        });

        const eftData = await response.json().catch(() => null);
        if (!response.ok || !eftData?.ok) {
          throw new Error(eftData?.error || "Unable to create EFT order.");
        }

        const orderNumber = eftData.orderNumber || null;
        const proofUploadToken = (eftData.proofUploadToken || "").toString().trim() || null;
        const proofUploadExpiresAt =
          (eftData.proofUploadExpiresAt || "").toString().trim() || null;
        const orderQuery = new URLSearchParams();
        if (eftData.orderId) orderQuery.set("orderId", eftData.orderId);
        if (Number.isFinite(Number(orderNumber))) {
          orderQuery.set("orderNumber", String(orderNumber));
        }
        if (proofUploadToken) orderQuery.set("proofUploadToken", proofUploadToken);
        if (proofUploadExpiresAt) orderQuery.set("proofUploadExpiresAt", proofUploadExpiresAt);
        const orderSearch = orderQuery.toString() ? `?${orderQuery.toString()}` : "";
        setOrderSuccess("EFT order submitted. Awaiting admin payment approval.");
        clearCart();
        navigate(`/payment/eft-submitted${orderSearch}`, {
          state: {
            orderId: eftData.orderId || null,
            orderNumber,
            status: eftData.status || "pending-payment-approval",
            paymentApprovalStatus: eftData.paymentApprovalStatus || "pending",
            bankDetails: eftData.bankDetails || EFT_BANK_DETAILS,
            proofUploadToken,
            proofUploadExpiresAt,
          },
        });
      } else {
        clearPayfastPendingSession();
        const response = await fetch(PAYFAST_FUNCTION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...checkoutPayload,
            paymentMethod: PAYMENT_METHODS.PAYFAST,
            returnUrl: `${window.location.origin}/payment/success`,
            cancelUrl: `${window.location.origin}/payment/cancel`,
          }),
        });

        const payfastData = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payfastData?.error || "Unable to reach PayFast gateway.");
        }

        if (!payfastData?.url || !payfastData?.fields) {
          throw new Error("PayFast gateway returned an invalid response.");
        }

        const paymentReference = (
          payfastData?.fields?.m_payment_id ||
          payfastData?.fields?.custom_str1 ||
          ""
        )
          .toString()
          .trim();
        setPayfastPendingSession({
          paymentReference: paymentReference || null,
          createdAt: new Date().toISOString(),
        });

        setOrderSuccess("Redirecting to PayFast...");
        submitPayfastForm(payfastData.url, payfastData.fields);
      }
    } catch (error) {
      setOrderError(error.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <section className="section cart-page">
      <div className="section__inner">
        <div className="cart-page__header">
          <span className="badge">Cart</span>
          <h1>Your cart</h1>
          <p className="cart-page__subtitle">Review your items and complete your checkout when you are ready.</p>
        </div>
        <div className="cart-page__grid">
          <div className="cart-page__panel cart-page__items">
            {cartTypeLabel && (
              <p className="cart-page__notice">
                Your cart currently contains {cartTypeLabel}. Clear it before switching between workshops and products.
              </p>
            )}
            {items.length === 0 ? (
              <div className="empty-state cart-page__empty">
                <p>Your cart is currently empty. Add a product or workshop booking to begin.</p>
                <div className="cta-group">
                  <Link className="btn btn--primary" to="/products">
                    Shop products
                  </Link>
                  <Link className="btn btn--secondary" to="/workshops">
                    Browse workshops
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="modal__list cart-list">
                {items.map((item) => {
                  const unitPrice = typeof item.price === "number" ? item.price : Number(item.price) || 0;
                  const total = unitPrice * item.quantity;
                  const isProduct = item.metadata?.type === "product";
                  const stockInfo = resolveStock(item);
                  const stockLimit = stockInfo?.quantity;
                  const maxQuantity = Number.isFinite(stockLimit) ? Math.max(stockLimit, item.quantity) : 99;
                  const canIncrease = Number.isFinite(stockLimit) ? item.quantity < stockLimit : true;
                  const productId =
                    item.metadata?.productId || item.metadata?.productID || item.metadata?.product || null;
                  const productRecord =
                    isProduct && productId ? productLookup.get(productId) || null : null;
                  const rawCategoryValue =
                    productRecord?.category ||
                    productRecord?.categoryLabel ||
                    productRecord?.categoryName ||
                    (Array.isArray(productRecord?.category_ids) ? productRecord.category_ids[0] : null) ||
                    (Array.isArray(productRecord?.categoryIds) ? productRecord.categoryIds[0] : null) ||
                    productRecord?.categoryId ||
                    productRecord?.categorySlug ||
                    item.metadata?.category ||
                    "";
                  const categorySeed = Array.isArray(rawCategoryValue)
                    ? rawCategoryValue.find(Boolean)
                    : rawCategoryValue;
                  const categoryLabel = categorySeed
                    ? categorySeed
                        .toString()
                        .trim()
                        .replace(/[-_]+/g, " ")
                        .replace(/\s+/g, " ")
                        .replace(/\b\w/g, (char) => char.toUpperCase())
                    : "";
                  const productInfoLabel =
                    categoryLabel || item.metadata?.attribute || item.metadata?.color || "Product";
                  const variantLabel = item.metadata?.variantLabel;
                  const variantDisplay = variantLabel ? `Variant: ${variantLabel}` : "Variant: Standard";

                  return (
                    <li key={item.id} className={`cart-list__item ${isProduct ? "cart-list__item--row" : ""}`}>
                      {isProduct ? (
                        <>
                          <div className="cart-list__product">
                            <span className="cart-list__title">{item.name}</span>
                            <span className="cart-list__meta-subtle">{productInfoLabel}</span>
                          </div>
                          <div className="cart-list__quantity">
                            <span className="cart-list__quantity-label">Qty</span>
                            <div className="cart-list__stepper">
                              <button
                                className="cart-list__stepper-btn"
                                type="button"
                                onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                                disabled={item.quantity <= 1}
                                aria-label={`Decrease quantity of ${item.name}`}
                              >
                                -
                              </button>
                              <input
                                className="input cart-list__stepper-input"
                                type="number"
                                min="1"
                                max={maxQuantity}
                                value={item.quantity}
                                onChange={(event) => {
                                  const nextValue = Number(event.target.value);
                                  if (!Number.isFinite(nextValue)) return;
                                  updateItemQuantity(item.id, Math.min(Math.max(nextValue, 1), maxQuantity));
                                }}
                                aria-label={`Quantity for ${item.name}`}
                              />
                              <button
                                className="cart-list__stepper-btn"
                                type="button"
                                onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                                disabled={!canIncrease}
                                aria-label={`Increase quantity of ${item.name}`}
                              >
                                +
                              </button>
                            </div>
                            {Number.isFinite(stockLimit) && (
                              <span className="cart-list__stock-note">
                                {stockLimit <= 0 ? "Out of stock" : `In stock: ${stockLimit}`}
                              </span>
                            )}
                          </div>
                          <div className="cart-list__variant">
                            <span className="cart-list__variant-label">{variantDisplay}</span>
                            <span className="cart-list__variant-price">{currency(unitPrice)}</span>
                          </div>
                          <div className="cart-list__total">
                            <span className="cart-list__total-label">Total</span>
                            <span className="cart-list__total-price">{currency(total)}</span>
                            <div className="cart-list__total-actions">
                              <button
                                className="cart-remove-btn"
                                type="button"
                                onClick={() => removeItem(item.id)}
                                aria-label={`Remove ${item.name} from cart`}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="cart-list__header">
                            <span className="cart-list__title">{item.name}</span>
                          </div>
                          {item.metadata?.type === "workshop" && (
                            <div className="cart-list__meta">
                              <p>
                                <strong>Workshop:</strong> {item.metadata.workshopTitle}
                              </p>
                              <p>
                                <strong>Day:</strong>{" "}
                                {item.metadata.sessionDayLabel ||
                                  item.metadata.sessionLabel ||
                                  item.metadata.scheduledDateLabel ||
                                  "Date to be confirmed"}
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
                              {(item.metadata.optionLabel || item.metadata.framePreference) && (
                                <p>
                                  <strong>{item.metadata.type === "cut-flower" ? "Option" : "Frame"}:</strong>{" "}
                                  {item.metadata.optionLabel || item.metadata.framePreference}
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
                              className="cart-remove-btn"
                              type="button"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Remove ${item.name} from cart`}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="checkout-accordion">
              <div className="checkout-accordion__header">
                <h2>Checkout</h2>
                <p className="modal__meta">
                  Complete each step in order. The next section opens when the previous one is complete.
                </p>
              </div>
              {!hasItems && (
                <p className="cart-page__notice">Add items to start the checkout flow.</p>
              )}
              {(activeStep === "review" ? STEP_ORDER : [activeStep]).map((step) => {
                const index = STEP_ORDER.indexOf(step);
                const isActive = activeStep === step;
                const isComplete = stepCompletion[step];
                const isLocked = !hasItems || index > maxOpenIndex;
                const statusLabel = isComplete ? "Complete" : isLocked ? "Locked" : "In progress";
                return (
                  <section
                    key={step}
                    ref={
                      step === "contact"
                        ? contactRef
                        : step === "shipping"
                          ? shippingRef
                          : step === "payment"
                            ? paymentRef
                            : reviewRef
                    }
                    className={`checkout-step ${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""} ${
                      isLocked ? "is-locked" : ""
                    }`}
                  >
                    <button
                      className="checkout-step__trigger"
                      type="button"
                      onClick={() => openStep(step)}
                      aria-expanded={activeStep === "review" ? true : isActive}
                      aria-controls={`checkout-${step}`}
                      disabled={isLocked}
                    >
                      <span className="checkout-step__index">{index + 1}</span>
                      <span className="checkout-step__title">{STEP_LABELS[step]}</span>
                      <span className="checkout-step__status">{statusLabel}</span>
                    </button>
                    <div
                      id={`checkout-${step}`}
                      className="checkout-step__content"
                      hidden={activeStep !== "review" && !isActive}
                    >
                      {step === "contact" && (
                        <div className="checkout-step__fields">
                          <p className="modal__meta">
                            Guest checkout is the default. We'll send confirmation updates to your email.
                          </p>
                          <label>
                            Full Name
                            <input
                              className="input"
                              type="text"
                              autoComplete="name"
                              ref={contactFirstFieldRef}
                              value={contactDetails.fullName}
                              onChange={handleContactChange("fullName")}
                              placeholder="Full name"
                              required
                            />
                          </label>
                          <label>
                            Email
                            <input
                              className="input"
                              type="email"
                              autoComplete="email"
                              value={contactDetails.email}
                              onChange={handleContactChange("email")}
                              placeholder="Email address"
                              required
                            />
                          </label>
                          <label>
                            Phone
                            <input
                              className="input"
                              type="tel"
                              autoComplete="tel"
                              value={contactDetails.phone}
                              onChange={handleContactChange("phone")}
                              placeholder="Phone number"
                              required
                            />
                          </label>
                        </div>
                      )}

                      {step === "shipping" && (
                        <div className="checkout-step__fields">
                          <p className="modal__meta">
                            Add your delivery or collection address so we can confirm fulfillment details.
                          </p>
                          <label>
                            Street Address
                            <input
                              className="input"
                              type="text"
                              autoComplete="street-address"
                              value={shippingAddress.street}
                              onChange={handleAddressChange("street")}
                              placeholder="Street address"
                              required
                            />
                          </label>
                          <div className="checkout-address-grid">
                            <label>
                              Suburb
                              <input
                                className="input"
                                type="text"
                                autoComplete="address-level3"
                                value={shippingAddress.suburb}
                                onChange={handleAddressChange("suburb")}
                                placeholder="Suburb"
                                required
                              />
                            </label>
                            <label>
                              City
                              <input
                                className="input"
                                type="text"
                                autoComplete="address-level2"
                                value={shippingAddress.city}
                                onChange={handleAddressChange("city")}
                                placeholder="City"
                                required
                              />
                            </label>
                            <label>
                              Province
                              <select
                                className="input"
                                autoComplete="address-level1"
                                value={shippingAddress.province}
                                onChange={handleAddressChange("province")}
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
                            <label>
                              Postal Code
                              <input
                                className="input"
                                type="text"
                                autoComplete="postal-code"
                                value={shippingAddress.postalCode}
                                onChange={handleAddressChange("postalCode")}
                                placeholder="0000"
                                pattern="\\d{4}"
                                required
                              />
                            </label>
                          </div>
                          {!postalCodeValid && shippingAddress.postalCode && (
                            <p className="admin-panel__error">Postal code should be 4 digits.</p>
                          )}
                          <div className="checkout-courier">
                            <h4>Courier options</h4>
                            {!shippingAddress.province && (
                              <p className="modal__meta">Select a province to view available couriers.</p>
                            )}
                            {shippingAddress.province && courierStatus === "loading" && (
                              <p className="modal__meta">Loading courier options…</p>
                            )}
                            {shippingAddress.province &&
                              courierStatus !== "loading" &&
                              availableCouriers.length === 0 && (
                              <p className="admin-panel__error">
                                No courier options are available for {shippingAddress.province}.
                              </p>
                            )}
                            {availableCouriers.length > 0 && (
                              <div className="checkout-courier-options">
                                {availableCouriers.map((option) => (
                                  <label
                                    key={option.id}
                                    className={`checkout-courier__option ${
                                      selectedCourierId === option.id ? "is-selected" : ""
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name="courier"
                                      value={option.id}
                                      checked={selectedCourierId === option.id}
                                      onChange={(event) => setSelectedCourierId(event.target.value)}
                                    />
                                    <span>{option.name}</span>
                                    <strong>{currency(option.price)}</strong>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          <p className="modal__meta">We will confirm delivery details after checkout.</p>
                        </div>
                      )}

                      {step === "payment" && (
                        <div className="checkout-step__fields">
                          <p className="modal__meta">Choose how you want to pay for this order.</p>
                          <div className="checkout-payment-methods">
                            <label
                              className={`checkout-payment-method ${
                                paymentMethod === PAYMENT_METHODS.PAYFAST ? "is-selected" : ""
                              }`}
                            >
                              <input
                                type="radio"
                                name="payment-method"
                                value={PAYMENT_METHODS.PAYFAST}
                                checked={paymentMethod === PAYMENT_METHODS.PAYFAST}
                                onChange={() => {
                                  setPaymentMethod(PAYMENT_METHODS.PAYFAST);
                                  setOrderError(null);
                                }}
                              />
                              <span>PayFast (Card / Instant EFT)</span>
                            </label>
                            <label
                              className={`checkout-payment-method ${
                                paymentMethod === PAYMENT_METHODS.EFT ? "is-selected" : ""
                              }`}
                            >
                              <input
                                type="radio"
                                name="payment-method"
                                value={PAYMENT_METHODS.EFT}
                                checked={paymentMethod === PAYMENT_METHODS.EFT}
                                onChange={() => {
                                  setPaymentMethod(PAYMENT_METHODS.EFT);
                                  setPayfastConsent(false);
                                  setOrderError(null);
                                }}
                              />
                              <span>EFT (Manual admin approval required)</span>
                            </label>
                          </div>

                          {paymentMethod === PAYMENT_METHODS.PAYFAST && (
                            <>
                              <p className="modal__meta">
                                Payments are securely processed by PayFast. You&apos;ll be redirected to complete
                                payment.
                              </p>
                              <label className="checkbox">
                                <input
                                  type="checkbox"
                                  checked={payfastConsent}
                                  onChange={(event) => setPayfastConsent(event.target.checked)}
                                />
                                <span>I understand I&apos;ll be redirected to PayFast to complete payment.</span>
                              </label>
                              <p className="modal__meta">
                                Supported cards and instant EFT options will appear on the PayFast screen.
                              </p>
                            </>
                          )}

                          {paymentMethod === PAYMENT_METHODS.EFT && (
                            <div className="checkout-eft">
                              <p className="modal__meta">
                                Admin must verify and approve EFT payment before your order can be fulfilled.
                              </p>
                              <p className="modal__meta">
                                Banking details and your exact order reference are shown after you place the EFT
                                order.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {step === "review" && (
                        <div className="checkout-step__fields">
                          <p className="modal__meta">
                            Confirm your details before placing the order. Your items are listed above.
                          </p>
                          <div className="checkout-review__grid">
                            <div className="checkout-review__card">
                              <h3>Contact</h3>
                              <p>{contactDetails.fullName || "Add contact details"}</p>
                              <p className="modal__meta">
                                {contactDetails.email || "Email address"}
                                {contactDetails.phone ? ` - ${contactDetails.phone}` : ""}
                              </p>
                            </div>
                            <div className="checkout-review__card">
                              <h3>Shipping</h3>
                              <p>{formatShippingAddress(shippingAddress) || "Add a delivery address"}</p>
                              <p className="modal__meta">
                                {selectedCourier
                                  ? `${selectedCourier.name} · ${currency(selectedCourier.price)}`
                                  : "Select a courier option"}
                              </p>
                            </div>
                            <div className="checkout-review__card">
                              <h3>Payment</h3>
                              <p>
                                {paymentMethod === PAYMENT_METHODS.EFT
                                  ? "EFT with admin approval"
                                  : payfastConsent
                                    ? "PayFast redirect confirmed"
                                    : "Confirm PayFast step"}
                              </p>
                              <p className="modal__meta">
                                {paymentMethod === PAYMENT_METHODS.EFT
                                  ? "After order placement, you will receive exact EFT transfer details and reference."
                                  : "Secure PayFast checkout."}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="cart-page__panel cart-page__summary">
            <h2>Order summary</h2>
            <div className="cart-page__totals">
              <div className="cart-page__total-row">
                <span>Items</span>
                <strong>{totalCount}</strong>
              </div>
              <div className="cart-page__total-row">
                <span>Subtotal</span>
                <strong>{currency(itemSubtotal)}</strong>
              </div>
              <div className="cart-page__total-row cart-page__total-row--muted">
                <span>Shipping</span>
                <span>
                  {selectedCourier ? currency(shippingCost) : "Select a courier"}
                </span>
              </div>
              <div className="cart-page__total-row cart-page__total-row--muted">
                <span>Taxes</span>
                <span>Included where applicable</span>
              </div>
              <div className="cart-page__total-row cart-page__grand-total">
                <span>Total</span>
                <strong>{currency(orderTotal)}</strong>
              </div>
            </div>
            <p className="cart-page__summary-note">
              Shipping is calculated based on the selected courier and province.
            </p>
            {orderError && <p className="admin-panel__error">{orderError}</p>}
            {orderSuccess && <p className="admin-save-indicator">{orderSuccess}</p>}
            <div className="cart-page__sticky-bar">
              <div className="cart-page__sticky-row">
                <span>Total</span>
                <strong>{currency(orderTotal)}</strong>
              </div>
              <button
                className="btn btn--primary"
                type="button"
                onClick={handlePrimaryAction}
                disabled={placingOrder || !hasItems}
              >
                {primaryActionLabel}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default CartPage;
