import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { getFirebaseDb } from "../lib/firebase.js";
import heroBackground from "../assets/hero-flowers.svg";

function renderRichText(content) {
  if (!content) return null;
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const elements = [];
  let listItems = [];

  lines.forEach((line, index) => {
    if (line.startsWith("-")) {
      listItems.push(
        <li key={`item-${index}`}>{line.replace(/^[-•]\s*/, "").trim()}</li>,
      );
    } else {
      if (listItems.length) {
        elements.push(
          <ul key={`list-${index}`} className="detail-list">
            {listItems}
          </ul>,
        );
        listItems = [];
      }
      elements.push(
        <p key={`paragraph-${index}`}>
          {line}
        </p>,
      );
    }
  });

  if (listItems.length) {
    elements.push(
      <ul key="list-final" className="detail-list">
        {listItems}
      </ul>,
    );
  }

  return elements;
}

function WorkshopDetailPage() {
  const { workshopId } = useParams();
  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);
  const { items } = useCart();
  const [workshop, setWorkshop] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const { openBooking } = useModal();

  usePageMetadata({
    title: workshop ? `${workshop.title} | Bethany Blooms Workshops` : "Workshop Details | Bethany Blooms",
    description:
      workshop?.description ??
      "Explore Bethany Blooms workshop details, what to expect, pricing, and policies before you reserve your seat.",
  });

  useEffect(() => {
    if (!db || !workshopId) return;

    const loadWorkshop = async () => {
      setStatus("loading");
      setError(null);
      try {
        const snapshot = await getDoc(doc(db, "workshops", workshopId));
        if (!snapshot.exists()) {
          setStatus("not-found");
          return;
        }
        const data = snapshot.data();
        let scheduledDateLabel = "Date to be confirmed";
        if (data.scheduledFor) {
          const parsed = typeof data.scheduledFor === "string" ? new Date(data.scheduledFor) : data.scheduledFor.toDate?.();
          if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
            scheduledDateLabel = new Intl.DateTimeFormat("en-ZA", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(parsed);
          }
        }
        const priceNumber = typeof data.price === "number" ? data.price : Number(data.price);
        const unitPrice = Number.isFinite(priceNumber) ? priceNumber : null;
        setWorkshop({
          id: snapshot.id,
          ...data,
          scheduledDateLabel,
          unitPrice,
        });
        setStatus("success");
      } catch (err) {
        setError(err.message);
        setStatus("error");
      }
    };

    loadWorkshop();
  }, [db, workshopId]);

  const handleOpenBooking = () => {
    if (!workshop) return;
    const customerSeed =
      items.find((item) => item.metadata?.customer)?.metadata?.customer ?? null;
    openBooking({
      workshop,
      customer: customerSeed || undefined,
    });
  };

  if (status === "loading") {
    return (
      <section className="section section--tight">
        <div className="section__inner">
          <p className="empty-state">Loading workshop information…</p>
        </div>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="section section--tight">
        <div className="section__inner">
          <p className="empty-state">We couldn’t load this workshop right now. {error}</p>
          <Link className="btn btn--secondary" to="/workshops">
            Back to Workshops
          </Link>
        </div>
      </section>
    );
  }

  if (status === "not-found" || !workshop) {
    return (
      <section className="section section--tight">
        <div className="section__inner">
          <p className="empty-state">We couldn’t find that workshop. It may have been updated or removed.</p>
          <Link className="btn btn--secondary" to="/workshops">
            Back to Workshops
          </Link>
        </div>
      </section>
    );
  }

  const sections = [
    { key: "whatToExpect", title: "What to Expect" },
    { key: "bookingPricing", title: "Booking & Pricing" },
    { key: "goodToKnow", title: "Good to Know" },
    { key: "cancellations", title: "Cancellations & Policies" },
    { key: "groupsInfo", title: "Groups & Private Events" },
    { key: "careInfo", title: "Caring for Your Art" },
    { key: "whyPeopleLove", title: "Why People Love Our Workshops" },
  ];

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero
            variant="workshops"
            background={workshop.image || heroBackground}
            media={workshop.image ? <img src={workshop.image} alt={`${workshop.title} workshop`} /> : null}
          >
            <h1>{workshop.title}</h1>
            <p>{workshop.description}</p>
            <div className="cta-group">
              <button className="btn btn--primary" type="button" onClick={handleOpenBooking}>
                Reserve Your Seat
              </button>
              <Link className="btn btn--secondary" to="/workshops">
                Back to Workshops
              </Link>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Workshop Snapshot</span>
            <h2>Plan Ahead</h2>
          </Reveal>
          <div className="cards-grid">
            <Reveal as="article" className="card">
              <h3 className="card__title">When</h3>
              <p>{workshop.scheduledDateLabel}</p>
            </Reveal>
            <Reveal as="article" className="card" delay={120}>
              <h3 className="card__title">Where</h3>
              <p>{workshop.location || "Vereeniging Studio"}</p>
            </Reveal>
            <Reveal as="article" className="card" delay={240}>
              <h3 className="card__title">Investment</h3>
              <p>{workshop.price ? `Starting from R${workshop.price}` : "Pricing shared below"}</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner workshop-detail">
          {sections.map(({ key, title }) => {
            const content = workshop[key];
            if (!content) return null;
            return (
              <Reveal as="article" className="detail-section" key={key}>
                <h2>{title}</h2>
                {renderRichText(content)}
              </Reveal>
            );
          })}

          {workshop.ctaNote && (
            <Reveal as="div" className="detail-cta">
              <p>{workshop.ctaNote}</p>
              <button className="btn btn--primary" type="button" onClick={handleOpenBooking}>
                Reserve Your Seat
              </button>
            </Reveal>
          )}
        </div>
      </section>
    </>
  );
}

export default WorkshopDetailPage;
