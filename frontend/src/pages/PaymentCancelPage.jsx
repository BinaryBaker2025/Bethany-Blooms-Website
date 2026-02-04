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
    <section className="section section--tight">
      <div className="section__inner">
        <span className="badge">Payment</span>
        <h1>PayFast payment cancelled</h1>
        <p>Your payment was not completed. You can retry PayFast or switch to EFT in checkout.</p>
        <div className="cta-group">
          <Link className="btn btn--primary" to="/cart">
            Back to cart
          </Link>
          <Link className="btn btn--secondary" to="/contact">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

export default PaymentCancelPage;
