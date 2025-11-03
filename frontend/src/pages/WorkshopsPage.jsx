import { Link } from "react-router-dom";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/hero-flowers.svg";
import kitPurple from "../assets/kit-purple.svg";

function WorkshopsPage() {
  usePageMetadata({
    title: "Bethany Blooms Workshops | Pressed Flower Experiences in Vereeniging",
    description:
      "Reserve your seat at a Bethany Blooms pressed flower workshop. Explore dates, pricing, and what’s included.",
  });

  const eventFormatter = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const { items: remoteWorkshops, status } = useFirestoreCollection("workshops", {
    orderByField: "scheduledFor",
    orderDirection: "asc",
  });

  const workshops = remoteWorkshops;

  const normalizedWorkshops = workshops.map((workshop) => {
    const parsedDate = workshop.scheduledFor ? new Date(workshop.scheduledFor) : null;
    const hasValidDate = parsedDate instanceof Date && !Number.isNaN(parsedDate);
    const priceNumber = typeof workshop.price === "number" ? workshop.price : Number(workshop.price);
    return {
      ...workshop,
      title: workshop.title || workshop.name || "Bethany Blooms Workshop",
      description: workshop.description || "Details coming soon.",
      scheduledFor: workshop.scheduledFor ?? null,
      formattedDate: hasValidDate ? eventFormatter.format(parsedDate) : "Date to be confirmed",
      priceDisplay: Number.isFinite(priceNumber)
        ? `R${priceNumber}`
        : workshop.price ?? "Pricing on request",
      location: workshop.location || "Vereeniging Studio",
    };
  });

  const firstWorkshop = normalizedWorkshops[0];

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero variant="workshops" background={heroBackground} media={<img src={kitPurple} alt="Workshop table with pressed flower frames" />}>
            <h1>Bespoke Pressed Flower Workshops</h1>
            <p>
              Slow down with a day of making, guided by Bethany Blooms. Craft a framed arrangement, learn pressing
              techniques, and share a peaceful table with fellow creatives.
            </p>
            <div className="cta-group">
              {firstWorkshop ? (
                <Link className="btn btn--primary" to={`/workshops/${firstWorkshop.id}`}>
                  View Workshop Details
                </Link>
              ) : (
                <a className="btn btn--primary" href="#workshop-details">
                  View Workshop Details
                </a>
              )}
              <a href="#workshop-details" className="btn btn--secondary">
                Workshop Details
              </a>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section" id="workshop-details">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Upcoming</span>
            <h2>Upcoming Workshops</h2>
            <p>
              We gather at a light-filled studio in Vereeniging, with refreshments, blooms, and framing included. Explore
              the next available dates below.
            </p>
          </Reveal>
          <div className="cards-grid">
            {normalizedWorkshops.map((workshop, index) => (
              <Reveal as="article" className="card" key={workshop.id} delay={index * 120}>
                <h3 className="card__title">{workshop.title}</h3>
                <p className="card__price">{workshop.priceDisplay}</p>
                <p>{workshop.description}</p>
                <p className="modal__meta">When: {workshop.formattedDate}</p>
                <p className="modal__meta">Where: {workshop.location}</p>
                <div className="card__actions">
                  <Link className="btn btn--primary" to={`/workshops/${workshop.id}`}>
                    View Details
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          {normalizedWorkshops.length === 0 && status !== "loading" && (
            <p className="empty-state">No workshops scheduled just yet.</p>
          )}
          {status === "loading" && <p className="empty-state">Loading workshop schedule…</p>}
          {status === "empty" && <p className="empty-state">No workshops scheduled just yet.</p>}
          {status === "error" && (
            <p className="empty-state">We couldn’t load workshops right now. Please refresh to try again.</p>
          )}
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">What to Expect</span>
            <h2>A Day in Bloom</h2>
          </Reveal>
          <div className="cards-grid">
            <Reveal as="article" className="card">
              <h3 className="card__title">Guided Creative Flow</h3>
              <p>
                Learn foundational techniques for pressing, arranging, and preserving florals while crafting a frame that
                reflects your unique style.
              </p>
            </Reveal>
            <Reveal as="article" className="card" delay={120}>
              <h3 className="card__title">All Materials Included</h3>
              <p>We provide tools, florals, frames, and refreshments. Simply arrive, breathe deeply, and create.</p>
            </Reveal>
            <Reveal as="article" className="card" delay={240}>
              <h3 className="card__title">Take-Home Keepsakes</h3>
              <p>
                Leave with your completed framed art, a curated mini bloom pack, and a guide to keep pressing at home.
              </p>
            </Reveal>
            <Reveal as="article" className="card" delay={360}>
              <h3 className="card__title">Upgrade with Fresh Blooms</h3>
              <p>
                Pair your workshop with market buckets, bouquet subscriptions, or a bespoke pressed art commission to
                keep the story blooming long after class.
              </p>
              <div className="card__actions">
                <Link className="btn btn--secondary" to="/products">
                  Explore Products
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}

export default WorkshopsPage;
