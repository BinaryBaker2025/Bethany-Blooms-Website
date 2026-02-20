import { useEffect } from "react";
import { Link } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { clearPayfastPendingSession } from "../lib/payfastSession.js";

function PaymentCancelPage() {
  usePageMetadata({
    title: "Payment Cancelled | Bethany Blooms",
    description: "Your PayFast payment was not completed. You can retry or switch to EFT checkout.",
  });

  useEffect(() => {
    clearPayfastPendingSession();
  }, []);

  return (
    <section className="section section--tight payment-status-page payment-status-page--cancelled">
      <div className="section__inner payment-status-page__inner">
        <article className="payment-status-card">
          <header className="payment-status-card__header">
            <span className="badge">Payment not completed</span>
            <span className="payment-status-card__icon payment-status-card__icon--warn" aria-hidden="true">
              !
            </span>
          </header>
          <h1>Your PayFast payment was cancelled</h1>
          <p className="payment-status-card__lead">
            No charge was captured. You can safely return to checkout and try again.
          </p>
          <ul className="payment-status-card__list">
            <li>Retry PayFast with card or Instant EFT.</li>
            <li>Or choose EFT transfer with manual approval at checkout.</li>
          </ul>
          <div className="cta-group payment-status-card__actions">
            <Link className="btn btn--primary" to="/cart">
              Return to checkout
            </Link>
            <Link className="btn btn--secondary" to="/products">
              Keep browsing
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

export default PaymentCancelPage;
