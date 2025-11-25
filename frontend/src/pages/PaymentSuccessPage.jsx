import { Link } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata.js";

function PaymentSuccessPage() {
  usePageMetadata({
    title: "Payment Successful | Bethany Blooms",
    description: "Your Bethany Blooms payment was received. We’ll confirm your order details shortly.",
  });

  return (
    <section className="section section--tight">
      <div className="section__inner">
        <span className="badge">Payment</span>
        <h1>Payment received</h1>
        <p>Thank you—your payment has been captured. We’re preparing your order and will email the details soon.</p>
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
