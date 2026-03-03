import { Link } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata.js";

function NotFoundPage() {
  usePageMetadata({
    title: "Page Not Found (404) | Bethany Blooms",
    description: "The page you are looking for could not be found.",
    noIndex: true,
  });

  return (
    <section className="section section--tight payment-status-page payment-status-page--cancelled">
      <div className="section__inner payment-status-page__inner">
        <article className="payment-status-card">
          <header className="payment-status-card__header">
            <span className="badge">404</span>
            <span className="payment-status-card__icon payment-status-card__icon--warn" aria-hidden="true">
              404
            </span>
          </header>
          <h1>Page not found</h1>
          <p className="payment-status-card__lead">
            We couldn&apos;t find the page you were looking for. It may have moved, or the URL may be incorrect.
          </p>
          <ul className="payment-status-card__list">
            <li>Check the link for typing mistakes.</li>
            <li>Use one of these links to keep browsing.</li>
          </ul>
          <div className="cta-group payment-status-card__actions">
            <Link className="btn btn--primary" to="/">
              Go to home
            </Link>
            <Link className="btn btn--secondary" to="/products">
              Browse products
            </Link>
            <Link className="btn btn--secondary" to="/contact">
              Contact us
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

export default NotFoundPage;
