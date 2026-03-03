import { Link } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import {
  FRESH_FLOWER_DELIVERY_NOTE,
  FRESH_FLOWER_DELIVERY_WHATSAPP_NOTE,
  FRESH_FLOWER_DELIVERY_WHATSAPP_PREFILL,
} from "../lib/freshFlowerDelivery.js";
import {
  COMPANY_PHONE_LOCAL_DISPLAY,
  COMPANY_PHONE_TEL_HREF,
  buildWhatsAppLink,
} from "../lib/contactInfo.js";

function PrivacyPolicyPage() {
  usePageMetadata({
    title: "Privacy Policy | Bethany Blooms",
    description:
      "Read how Bethany Blooms collects, uses, and protects your personal information for orders, delivery coordination, and customer support.",
    canonicalPath: "/privacy-policy",
    noIndex: false,
  });

  return (
    <section className="section section--tight">
      <div className="section__inner">
        <span className="badge">Legal</span>
        <h1>Privacy Policy</h1>
        <p className="modal__meta">Last updated: 25 February 2026</p>
        <p>
          Bethany Blooms collects only the personal information needed to process orders, coordinate delivery, and
          support customers.
        </p>

        <div className="cards-grid">
          <article className="card">
            <h2 className="card__title">Information We Collect</h2>
            <p>
              We may collect your name, email address, phone number, delivery address, order details, and payment
              status information required to complete your purchase.
            </p>
          </article>

          <article className="card">
            <h2 className="card__title">How We Use Information</h2>
            <p>
              We use your data to process orders, send confirmations and updates, provide support, and coordinate
              fulfilment.
            </p>
            <p>
              {FRESH_FLOWER_DELIVERY_NOTE}
            </p>
            <p>
              {FRESH_FLOWER_DELIVERY_WHATSAPP_NOTE}{" "}
              <a href={buildWhatsAppLink(FRESH_FLOWER_DELIVERY_WHATSAPP_PREFILL)}>
                WhatsApp Bethany Blooms
              </a>
              .
            </p>
            <p>
              Subscriptions are managed through a separate operational process.
            </p>
          </article>

          <article className="card">
            <h2 className="card__title">Sharing And Retention</h2>
            <p>
              We do not sell your personal information. Data may be shared only with service providers needed to run
              checkout, payment, email notifications, hosting, and delivery coordination.
            </p>
            <p>
              We retain records for operational, accounting, fraud-prevention, and legal compliance purposes as
              required.
            </p>
          </article>

          <article className="card">
            <h2 className="card__title">Your Rights And Contact</h2>
            <p>
              To request updates or deletion of personal data where applicable, contact us at{" "}
              <a href="mailto:admin@bethanyblooms.co.za">admin@bethanyblooms.co.za</a> or{" "}
              <a href={COMPANY_PHONE_TEL_HREF}>{COMPANY_PHONE_LOCAL_DISPLAY}</a>, or{" "}
              <a href={buildWhatsAppLink("Hello Bethany Blooms, I have a privacy policy question.")}>
                WhatsApp
              </a>.
            </p>
            <p className="modal__meta">
              You can also use our <Link to="/contact">contact page</Link> for privacy-related enquiries.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export default PrivacyPolicyPage;
