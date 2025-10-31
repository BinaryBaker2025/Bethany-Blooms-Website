import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import heroBackground from "../assets/hero-flowers.svg";

function ContactPage() {
  usePageMetadata({
    title: "Contact Bethany Blooms | Enquiries & Custom Floral Art",
    description: "Get in touch with Bethany Blooms for workshop enquiries, custom pressed floral art, or DIY kit support.",
  });

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
          <Reveal as="div">
            <span className="badge">Get in Touch</span>
            <h2>Send Us a Note</h2>
            <p>
              Share a little about what you’re dreaming up—from pressed flower artwork to fresh cut flower deliveries—and
              we’ll guide the next steps.
            </p>
          </Reveal>
          <div>
            <form className="contact-form" action="#" method="post">
              <label className="sr-only" htmlFor="contact-name">
                Name
              </label>
              <input className="input" type="text" id="contact-name" name="name" placeholder="Your name" required />

              <label className="sr-only" htmlFor="contact-email">
                Email
              </label>
              <input className="input" type="email" id="contact-email" name="email" placeholder="Your email" required />

              <label className="sr-only" htmlFor="contact-message">
                Message
              </label>
              <textarea
                className="input textarea"
                id="contact-message"
                name="message"
                placeholder="Tell us about your project or enquiry"
                required
              ></textarea>
              <button className="btn btn--primary" type="submit">
                Send Message (Demo)
              </button>
            </form>
            <a className="whatsapp-cta" href="https://wa.me/27744555590" target="_blank" rel="noopener">
              <span aria-hidden="true">💬</span>
              Chat via WhatsApp
            </a>
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
                <a href="tel:+27744555590">+27 74 455 5590</a>
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
