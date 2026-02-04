import { useEffect } from "react";
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
  usePageMetadata({
    title: "Payment Successful | Bethany Blooms",
    description: "Your PayFast payment was received and your order is being prepared.",
  });

  useEffect(() => {
    const pendingSession = getPayfastPendingSession();
    if (!pendingSession) return;
    const searchParams = new URLSearchParams(location.search);
    const paymentStatus = (searchParams.get("payment_status") || "").toString().trim().toUpperCase();
    if (paymentStatus !== "COMPLETE") return;
    clearCart();
    clearPayfastPendingSession();
  }, [clearCart, location.search]);

  return (
    <section className="section section--tight">
      <div className="section__inner">
        <span className="badge">Payment</span>
        <h1>PayFast payment received</h1>
        <p>Thank you. Your card or instant EFT payment was captured, and we are preparing your order.</p>
        <div className="cta-group">
          <Link className="btn btn--primary" to="/products">
            Continue shopping
          </Link>
          <Link className="btn btn--secondary" to="/contact">
            Need help? Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

export default PaymentSuccessPage;
