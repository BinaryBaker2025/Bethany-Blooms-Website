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

function DisclaimerPage() {
  usePageMetadata({
    title: "Disclaimer | Bethany Blooms",
    description:
      "Read important operational notices about product availability, delivery coordination, and limitations of liability at Bethany Blooms.",
    canonicalPath: "/disclaimer",
    noIndex: false,
  });

  return (
    <section className="section section--tight">
      <div className="section__inner">
        <span className="badge">Legal</span>
        <h1>Disclaimer</h1>
        <p className="modal__meta">Last updated: 25 February 2026</p>
        <p>
          This website and related communications are provided for general product and service information. Details may
          change based on seasonality, supply, and operational needs.
        </p>

        <div className="cards-grid">
          <article className="card">
            <h2 className="card__title">Product And Availability</h2>
            <p>
              Fresh flowers, stems, and related products are seasonal and may vary in color, size, and exact variety.
              Images are representative and may not always match final delivered stems exactly.
            </p>
          </article>

          <article className="card">
            <h2 className="card__title">Delivery Coordination</h2>
            <p>{FRESH_FLOWER_DELIVERY_NOTE}</p>
            <p>
              {FRESH_FLOWER_DELIVERY_WHATSAPP_NOTE}{" "}
              <a href={buildWhatsAppLink(FRESH_FLOWER_DELIVERY_WHATSAPP_PREFILL)}>
                WhatsApp Bethany Blooms
              </a>
              .
            </p>
            <p>Subscriptions are handled through a separate subscription delivery process.</p>
          </article>

          <article className="card">
            <h2 className="card__title">Third-Party Services</h2>
            <p>
              Payment, email, and platform services may be provided by third parties. Bethany Blooms is not responsible
              for third-party downtime, delays, or service interruptions outside our direct control.
            </p>
          </article>

          <article className="card">
            <h2 className="card__title">Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Bethany Blooms is not liable for indirect,
              consequential, or incidental losses resulting from use of this site or purchase workflows.
            </p>
            <p>
              For urgent support, contact <a href="mailto:admin@bethanyblooms.co.za">admin@bethanyblooms.co.za</a> or{" "}
              <a href={COMPANY_PHONE_TEL_HREF}>{COMPANY_PHONE_LOCAL_DISPLAY}</a>, or{" "}
              <a href={buildWhatsAppLink("Hello Bethany Blooms, I need support with an order/disclaimer question.")}>
                WhatsApp
              </a>.
            </p>
            <p className="modal__meta">
              You can also reach us via the <Link to="/contact">contact page</Link>.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

export default DisclaimerPage;
