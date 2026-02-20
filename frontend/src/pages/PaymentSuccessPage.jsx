import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import {
  clearPayfastPendingSession,
  getPayfastPendingSession,
} from "../lib/payfastSession.js";

function PaymentSuccessPage() {
  const { clearCart } = useCart();
  const location = useLocation();
  const [containsGiftCards, setContainsGiftCards] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  usePageMetadata({
    title: "Payment Successful | Bethany Blooms",
    description: "Your PayFast payment was received and your order is being prepared.",
    noIndex: true,
  });

  useEffect(() => {
    const pendingSession = getPayfastPendingSession();
    if (!pendingSession) return;
    if (pendingSession.containsGiftCards) {
      setContainsGiftCards(true);
    }
    if (pendingSession.paymentReference) {
      setPaymentReference((pendingSession.paymentReference || "").toString().trim());
    }
    const searchParams = new URLSearchParams(location.search);
    const paymentStatus = (searchParams.get("payment_status") || "").toString().trim().toUpperCase();
    if (paymentStatus !== "COMPLETE") return;
    clearCart();
    clearPayfastPendingSession();
  }, [clearCart, location.search]);

  return (
    <section className="section section--tight payment-status-page payment-status-page--success">
      <div className="section__inner payment-status-page__inner">
        <article className="payment-status-card">
          <header className="payment-status-card__header">
            <span className="badge badge--success">Payment confirmed</span>
            <span className="payment-status-card__icon" aria-hidden="true">
              OK
            </span>
          </header>
          <h1>Thank you, your payment was successful</h1>
          <p className="payment-status-card__lead">
            Your PayFast transaction has been received and your order is now being prepared.
          </p>
          <ul className="payment-status-card__list">
            <li>You will receive an email confirmation shortly.</li>
            <li>Our team will keep you updated as your order moves to fulfilment.</li>
          </ul>
          {paymentReference && (
            <p className="payment-status-card__meta">
              Payment reference: <strong>{paymentReference}</strong>
            </p>
          )}
          {containsGiftCards && (
            <div className="payment-status-card__notice">
              Gift card links and printable PDFs will be emailed to you.
            </div>
          )}
          <div className="cta-group payment-status-card__actions">
            <Link className="btn btn--primary" to="/account">
              View my account
            </Link>
            <Link className="btn btn--secondary" to="/products">
              Continue shopping
            </Link>
            <Link className="btn btn--secondary" to="/contact">
              Contact support
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

export default PaymentSuccessPage;
