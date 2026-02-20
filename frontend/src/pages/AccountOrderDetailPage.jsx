import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { getFirebaseDb } from "../lib/firebase.js";
import { formatShippingAddress } from "../lib/shipping.js";

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

const formatMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "R0.00";
  return `R${amount.toFixed(2)}`;
};

const normalizeText = (value, fallback = "Not provided") => {
  const normalized = (value || "").toString().trim();
  return normalized || fallback;
};

const getOrderLabel = (order = null) => {
  if (!order) return "Order details";
  if (order.orderNumber !== undefined && order.orderNumber !== null && `${order.orderNumber}`.trim()) {
    return `Order #${order.orderNumber}`;
  }
  return `Order #${(order.id || "").toString().slice(0, 8) || "unknown"}`;
};

const getNormalizedPaymentMethod = (order = null) => {
  const explicit = (order?.paymentMethod || "").toString().trim().toLowerCase();
  if (explicit) return explicit;
  if (order?.payfast) return "payfast";
  return "unknown";
};

const humanizeStatus = (value, fallback = "pending") => {
  const normalized = (value || "").toString().trim();
  const safeValue = normalized || fallback;
  return safeValue
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const getStatusTone = (value, fallback = "low") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (!normalized) return fallback;
  if (["paid", "approved", "complete", "completed", "success", "successful"].includes(normalized)) {
    return "in";
  }
  if (["preorder", "pre-order"].includes(normalized)) {
    return "preorder";
  }
  if (
    [
      "awaiting-approval",
      "pending",
      "pending-payment-approval",
      "order-placed",
      "processing",
      "authorized",
      "not-required",
    ].includes(normalized)
  ) {
    return "low";
  }
  if (["failed", "rejected", "cancelled", "canceled", "declined", "out"].includes(normalized)) {
    return "out";
  }
  return fallback;
};

const getOrderInvoiceDownloadUrl = (order = null) =>
  (order?.invoice?.downloadUrl || "").toString().trim();

const getOrderInvoiceLabel = (order = null) => {
  const explicitLabel = (order?.invoice?.invoiceNumberLabel || "").toString().trim();
  if (explicitLabel) return explicitLabel;
  const numericInvoice = Number(order?.invoiceNumber);
  if (Number.isFinite(numericInvoice) && numericInvoice > 0) {
    return `INV-${Math.floor(numericInvoice).toString().padStart(6, "0")}`;
  }
  return "Invoice not generated yet";
};

const isOrderOwnedByUser = (order = null, user = null) => {
  if (!order || !user) return false;
  const orderUid = (order.customerUid || "").toString().trim();
  const userUid = (user.uid || "").toString().trim();
  if (orderUid && userUid && orderUid === userUid) return true;

  const orderEmail = (order.customer?.email || "").toString().trim().toLowerCase();
  const userEmail = (user.email || "").toString().trim().toLowerCase();
  if (orderEmail && userEmail && orderEmail === userEmail) return true;

  return false;
};

function AccountOrderDetailPage() {
  const { orderId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState("");
  const [orderNotFound, setOrderNotFound] = useState(false);
  const [orderForbidden, setOrderForbidden] = useState(false);

  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);

  usePageMetadata({
    title: `${getOrderLabel(order)} | Bethany Blooms`,
    description: "View your order breakdown, payment details, and delivery information.",
    noIndex: true,
  });

  useEffect(() => {
    if (authLoading) return undefined;

    if (!user) {
      setOrder(null);
      setOrderLoading(false);
      setOrderError("");
      setOrderNotFound(false);
      setOrderForbidden(false);
      return undefined;
    }

    const normalizedOrderId = (orderId || "").toString().trim();
    if (!normalizedOrderId) {
      setOrder(null);
      setOrderLoading(false);
      setOrderError("Order ID is missing.");
      setOrderNotFound(false);
      setOrderForbidden(false);
      return undefined;
    }

    if (!db) {
      setOrder(null);
      setOrderLoading(false);
      setOrderError("Firestore is not configured.");
      setOrderNotFound(false);
      setOrderForbidden(false);
      return undefined;
    }

    setOrderLoading(true);
    setOrderError("");
    setOrderNotFound(false);
    setOrderForbidden(false);

    const orderRef = doc(db, "orders", normalizedOrderId);
    const unsubscribe = onSnapshot(
      orderRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setOrder(null);
          setOrderLoading(false);
          setOrderNotFound(true);
          setOrderForbidden(false);
          return;
        }

        const nextOrder = {
          id: snapshot.id,
          ...snapshot.data(),
        };

        if (!isOrderOwnedByUser(nextOrder, user)) {
          setOrder(null);
          setOrderLoading(false);
          setOrderNotFound(false);
          setOrderForbidden(true);
          return;
        }

        setOrder(nextOrder);
        setOrderLoading(false);
        setOrderNotFound(false);
        setOrderForbidden(false);
      },
      (error) => {
        console.warn("Failed to load account order", error);
        setOrder(null);
        setOrderLoading(false);
        setOrderNotFound(false);
        setOrderForbidden(false);
        setOrderError("Unable to load this order right now.");
      },
    );

    return unsubscribe;
  }, [authLoading, db, orderId, user]);

  if (authLoading || orderLoading) {
    return (
      <section className="section section--tight account-order-page">
        <div className="section__inner">
          <p className="modal__meta">Loading order details...</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="section section--tight account-order-page">
        <div className="section__inner">
          <span className="badge">Order</span>
          <h1>Sign in required</h1>
          <p className="modal__meta">Sign in to view your order details.</p>
          <div className="cta-group">
            <Link className="btn btn--primary" to="/account">
              Go to account
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (orderError || orderNotFound || orderForbidden || !order) {
    const title = orderForbidden ? "Order access denied" : orderNotFound ? "Order not found" : "Unable to load order";
    const message = orderForbidden
      ? "This order is not linked to your account."
      : orderNotFound
      ? "We could not find that order."
      : orderError || "Unable to load this order.";

    return (
      <section className="section section--tight account-order-page">
        <div className="section__inner">
          <Link className="breadcrumb-link account-order-page__back" to="/account">
            {"<- Back to account"}
          </Link>
          <h1>{title}</h1>
          <p className="admin-panel__error">{message}</p>
          <div className="cta-group">
            <Link className="btn btn--secondary" to="/account">
              Back to account
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const computedSubtotal = items.reduce((sum, item) => {
    const price = Number(item?.price);
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(price)) return sum;
    return sum + price * (Number.isFinite(quantity) ? quantity : 1);
  }, 0);
  const subtotal = Number.isFinite(Number(order.subtotal)) ? Number(order.subtotal) : computedSubtotal;
  const shippingCost = Number.isFinite(Number(order.shippingCost)) ? Number(order.shippingCost) : 0;
  const total = Number.isFinite(Number(order.totalPrice)) ? Number(order.totalPrice) : subtotal + shippingCost;
  const paymentMethod = getNormalizedPaymentMethod(order);
  const paymentStatus = normalizeText(order.paymentStatus, "pending");
  const paymentApprovalStatus = normalizeText(order.paymentApprovalStatus, "not-required");
  const statusLabel = normalizeText(order.status, "pending");
  const invoiceLabel = getOrderInvoiceLabel(order);
  const orderInvoiceDownloadUrl = getOrderInvoiceDownloadUrl(order);
  const paymentTone = getStatusTone(paymentStatus, "low");
  const orderTone = getStatusTone(statusLabel, "low");
  const shippingAddressLabel =
    formatShippingAddress(order.shippingAddress || {}) || normalizeText(order.customer?.address);

  return (
    <section className="section section--tight account-order-page">
      <div className="section__inner">
        <Link className="breadcrumb-link account-order-page__back" to="/account">
          {"<- Back to account"}
        </Link>

        <div className="admin-panel account-order-detail">
          <div className="account-order-detail__header">
            <div>
              <span className="badge account-order-detail__badge">Order details</span>
              <h1>{getOrderLabel(order)}</h1>
              <p className="modal__meta account-order-detail__placed-at">
                Placed on {formatOrderDate(order.createdAt || order.updatedAt)}
              </p>
            </div>
            <div className="account-order-detail__status">
              <span className={`badge account-order-detail__status-pill badge--stock-${paymentTone}`}>
                Payment: {humanizeStatus(paymentStatus)}
              </span>
              <span className={`badge account-order-detail__status-pill badge--stock-${orderTone}`}>
                Order: {humanizeStatus(statusLabel)}
              </span>
            </div>
          </div>

          <div className="account-order-detail__grid">
            <article className="account-order-detail__card">
              <h2>Customer</h2>
              <p>{normalizeText(order.customer?.fullName)}</p>
              <p className="modal__meta">{normalizeText(order.customer?.email)}</p>
              <p className="modal__meta">{normalizeText(order.customer?.phone)}</p>
            </article>

            <article className="account-order-detail__card">
              <h2>Delivery</h2>
              <p className="modal__meta">{shippingAddressLabel}</p>
              {order.shipping?.courierName && <p className="modal__meta">Courier: {order.shipping.courierName}</p>}
              {order.shipping?.province && <p className="modal__meta">Province: {order.shipping.province}</p>}
              {order.trackingLink ? (
                <p className="modal__meta">
                  Tracking:{" "}
                  <a href={order.trackingLink} target="_blank" rel="noopener noreferrer">
                    Open tracking link
                  </a>
                </p>
              ) : (
                <p className="modal__meta">Tracking: Not available yet</p>
              )}
            </article>

            <article className="account-order-detail__card">
              <h2>Payment</h2>
              <p className="modal__meta">Method: {humanizeStatus(paymentMethod, "unknown")}</p>
              <p className="modal__meta">Payment status: {humanizeStatus(paymentStatus)}</p>
              {paymentMethod === "eft" && (
                <p className="modal__meta">Approval status: {humanizeStatus(paymentApprovalStatus)}</p>
              )}
              {order.payfast?.paymentReference && (
                <p className="modal__meta">Reference: {order.payfast.paymentReference}</p>
              )}
              <p className="modal__meta">Invoice: {invoiceLabel}</p>
              {orderInvoiceDownloadUrl && (
                <p className="modal__meta">
                  <a href={orderInvoiceDownloadUrl} target="_blank" rel="noopener noreferrer">
                    Download invoice PDF
                  </a>
                </p>
              )}
            </article>

            <article className="account-order-detail__card">
              <h2>Totals</h2>
              <p className="modal__meta">Subtotal: {formatMoney(subtotal)}</p>
              <p className="modal__meta">Shipping: {formatMoney(shippingCost)}</p>
              <p>
                <strong>Total: {formatMoney(total)}</strong>
              </p>
            </article>
          </div>

          <div className="account-order-detail__items">
            <h2>Items</h2>
            {items.length === 0 ? (
              <p className="modal__meta">No items found for this order.</p>
            ) : (
              <div className="account-order-items">
                {items.map((item, index) => {
                  const quantity = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1;
                  const unitPrice = Number.isFinite(Number(item?.price)) ? Number(item.price) : 0;
                  const lineTotal = quantity * unitPrice;
                  const key = `${order.id}-${item?.id || item?.name || "item"}-${index}`;
                  const itemType = (item?.metadata?.type || "").toString().trim().toLowerCase();
                  const variantLabel = (item?.metadata?.variantLabel || "").toString().trim();
                  const sessionLabel = (
                    item?.metadata?.sessionDayLabel ||
                    item?.metadata?.sessionLabel ||
                    ""
                  )
                    .toString()
                    .trim();
                  const attendeeCount = Number(item?.metadata?.attendeeCount);
                  const preorderLabel = (
                    item?.metadata?.preorderSendMonthLabel ||
                    item?.metadata?.preorderSendMonth ||
                    ""
                  )
                    .toString()
                    .trim();

                  return (
                    <article className="account-order-item-card" key={key}>
                      <div className="account-order-item-card__head">
                        <p className="account-order-item-card__name">{normalizeText(item?.name, "Item")}</p>
                        <p className="account-order-item-card__total">{formatMoney(lineTotal)}</p>
                      </div>
                      <p className="modal__meta">Qty: {quantity} - Unit: {formatMoney(unitPrice)}</p>
                      <div className="account-order-item-card__chips">
                        {itemType && itemType !== "product" && (
                          <span className="badge badge--stock-preorder account-order-item-card__chip">
                            {humanizeStatus(itemType)}
                          </span>
                        )}
                        {variantLabel && (
                          <span className="badge account-order-item-card__chip">
                            Variant: {variantLabel}
                          </span>
                        )}
                      </div>
                      {itemType === "workshop" && sessionLabel && (
                        <p className="modal__meta">Session: {sessionLabel}</p>
                      )}
                      {itemType === "workshop" && Number.isFinite(attendeeCount) && (
                        <p className="modal__meta">Attendees: {attendeeCount}</p>
                      )}
                      {preorderLabel && <p className="modal__meta">Pre-order send month: {preorderLabel}</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AccountOrderDetailPage;


