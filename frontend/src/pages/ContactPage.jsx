import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import heroBackground from "../assets/hero-flowers.svg";
import { getFirebaseFunctions } from "../lib/firebase.js";
import {
  COMPANY_PHONE_LOCAL_DISPLAY,
  COMPANY_PHONE_TEL_HREF,
  buildWhatsAppLink,
} from "../lib/contactInfo.js";

const INITIAL_FORM = {
  name: "",
  email: "",
  phone: "",
  topic: "General enquiry",
  timeline: "",
  message: "",
};

function ContactPage() {
  usePageMetadata({
    title: "Contact Bethany Blooms | Enquiries & Custom Floral Art",
    description: "Get in touch with Bethany Blooms for workshop enquiries, custom pressed floral art, or DIY kit support.",
  });

  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [formState, setFormState] = useState({ state: "idle", message: "" });

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (formState.state === "loading") return;

    if (!functionsInstance) {
      setFormState({
        state: "error",
        message: "Firebase Functions are not configured. Please add your credentials and try again.",
      });
      return;
    }

    setFormState({ state: "loading", message: "Sending your note…" });
    try {
      const sendContactEmail = httpsCallable(functionsInstance, "sendContactEmail");
      await sendContactEmail({ ...formData });
      setFormState({
        state: "success",
        message: "Thank you! Your message is on its way—expect a reply within two business days.",
      });
      setFormData(INITIAL_FORM);
    } catch (error) {
      setFormState({
        state: "error",
        message: error?.message || "Something went wrong while sending your message.",
      });
    }
  };

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero variant="contact" background={heroBackground}>
            <h1>We’d Love to Hear From You</h1>
            <p>
              Reach out about workshops, bespoke commissions, or simply to say hello. We respond within two business
              days with warmth and detail.
            </p>
          </Hero>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div" className="contact-intro">
            <span className="badge">Get in Touch</span>
            <h2>Tell us what you’re dreaming up</h2>
            <p>
              Whether you need help booking a workshop, designing bespoke pressed florals, or sourcing seasonal blooms,
              we’ll guide the next steps from start to finish.
            </p>
          </Reveal>

          <div className="contact-grid">
            <Reveal as="section" className="contact-panel contact-panel--form">
              <h3>Send a detailed enquiry</h3>
              <p className="contact-panel__subtitle">
                Share your details and we’ll respond from{" "}
                <a href="mailto:hello@bethanyblooms.co.za">hello@bethanyblooms.co.za</a>.
              </p>
              <form className="contact-form contact-form--card" onSubmit={handleSubmit}>
                <div className="contact-form__row">
                  <div className="contact-form__field">
                    <label htmlFor="contact-name">Full name</label>
                    <input
                      className="input"
                      id="contact-name"
                      type="text"
                      value={formData.name}
                      onChange={updateField("name")}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <div className="contact-form__field">
                    <label htmlFor="contact-email">Email address</label>
                    <input
                      className="input"
                      id="contact-email"
                      type="email"
                      value={formData.email}
                      onChange={updateField("email")}
                      placeholder="you@email.com"
                      required
                    />
                  </div>
                </div>

                <div className="contact-form__row">
                  <div className="contact-form__field">
                    <label htmlFor="contact-phone">Phone number (optional)</label>
                    <input
                      className="input"
                      id="contact-phone"
                      type="tel"
                      value={formData.phone}
                      onChange={updateField("phone")}
                      placeholder={COMPANY_PHONE_LOCAL_DISPLAY}
                    />
                  </div>
                  <div className="contact-form__field">
                    <label htmlFor="contact-topic">Reason for reaching out</label>
                    <select
                      className="input"
                      id="contact-topic"
                      value={formData.topic}
                      onChange={updateField("topic")}
                    >
                      <option value="General enquiry">General enquiry</option>
                      <option value="Workshop booking">Workshop booking</option>
                      <option value="Custom pressed art">Custom pressed art</option>
                      <option value="Cut flowers & gifting">Cut flowers & gifting</option>
                      <option value="Collaboration / media">Collaboration / media</option>
                    </select>
                  </div>
                </div>

                <div className="contact-form__field">
                  <label htmlFor="contact-timeline">Ideal date or timeline</label>
                  <input
                    className="input"
                    id="contact-timeline"
                    type="text"
                    value={formData.timeline}
                    onChange={updateField("timeline")}
                    placeholder="e.g. Mother's Day weekend, 12 October workshop"
                  />
                </div>

                <div className="contact-form__field">
                  <label htmlFor="contact-message">How can we help?</label>
                  <textarea
                    className="input textarea"
                    id="contact-message"
                    value={formData.message}
                    onChange={updateField("message")}
                    placeholder="Tell us about your story, budget, or any inspiration you'd like us to know."
                    required
                  ></textarea>
                </div>

                <div className="form-feedback" aria-live="polite">
                  {formState.message ? (
                    <p
                      className={`form-feedback__message ${
                        formState.state === "error"
                          ? "form-feedback__message--error"
                          : formState.state === "success"
                          ? "form-feedback__message--success"
                          : ""
                      }`}
                    >
                      {formState.message}
                    </p>
                  ) : (
                    <p className="form-feedback__message">
                      You’ll receive a confirmation email and personal reply shortly.
                    </p>
                  )}
                </div>

                <button className="btn btn--primary" type="submit" disabled={formState.state === "loading"}>
                  {formState.state === "loading" ? "Sending…" : "Send message"}
                </button>
              </form>
            </Reveal>

            <Reveal as="aside" className="contact-panel contact-panel--details" delay={120}>
              <div className="contact-detail-card">
                <p className="contact-detail-card__label">Email</p>
                <a className="contact-detail-card__value" href="mailto:hello@bethanyblooms.co.za">
                  hello@bethanyblooms.co.za
                </a>
                <p className="contact-detail-card__meta">We respond within two business days.</p>
              </div>
              <div className="contact-detail-card">
                <p className="contact-detail-card__label">Phone</p>
                <a className="contact-detail-card__value" href={COMPANY_PHONE_TEL_HREF}>
                  {COMPANY_PHONE_LOCAL_DISPLAY}
                </a>
                <p className="contact-detail-card__meta">Tuesday – Saturday, 09:00 – 16:00 (SAST)</p>
              </div>
              <div className="contact-detail-card">
                <p className="contact-detail-card__label">Studio</p>
                <p className="contact-detail-card__value">Vereeniging, South Africa</p>
                <p className="contact-detail-card__meta">Visits by appointment so we can prep blooms just for you.</p>
              </div>
              <a
                className="contact-panel__cta"
                href={buildWhatsAppLink("Hi Bethany Blooms, I would like help with an enquiry.")}
                target="_blank"
                rel="noopener"
              >
                Chat via WhatsApp
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Visit Us</span>
            <h2>Studio Hours</h2>
            <p>
              By appointment only in Vereeniging, South Africa. We prepare the studio with refreshments, so please book
              ahead.
            </p>
          </Reveal>
          <div className="cards-grid">
            <Reveal as="article" className="card">
              <h3 className="card__title">Email</h3>
              <p>
                <a href="mailto:hello@bethanyblooms.co.za">hello@bethanyblooms.co.za</a>
              </p>
            </Reveal>
            <Reveal as="article" className="card" delay={120}>
              <h3 className="card__title">Phone</h3>
              <p>
                <a href={COMPANY_PHONE_TEL_HREF}>{COMPANY_PHONE_LOCAL_DISPLAY}</a>
              </p>
            </Reveal>
            <Reveal as="article" className="card" delay={240}>
              <h3 className="card__title">Hours</h3>
              <p>Tuesday – Saturday, 09:00 – 16:00</p>
            </Reveal>
            <Reveal as="article" className="card" delay={360}>
              <h3 className="card__title">Cut Flower Desk</h3>
              <p>Orders for bouquets, event florals, and subscriptions close every Wednesday at 16:00.</p>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}

export default ContactPage;
