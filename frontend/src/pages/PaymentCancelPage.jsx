import { Link } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata.js";

function PaymentCancelPage() {
  usePageMetadata({
    title: "Payment Cancelled | Bethany Blooms",
    description: "Your payment was not completed. You can return to your cart or reach out for assistance.",
  });

  return (
    <section className="section section--tight">
      <div className="section__inner">
        <span className="badge">Payment</span>
        <h1>Payment cancelled</h1>
        <p>
          Your payment wasn’t completed. You can head back to your cart to try again or contact us if you need another
          payment method.
        </p>
        <div className="cta-group">
          <Link className="btn btn--primary" to="/">
            Return home
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
