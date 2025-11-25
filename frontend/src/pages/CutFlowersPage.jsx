import { Link } from "react-router-dom";
import { useMemo } from "react";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useModal } from "../context/ModalContext.jsx";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/photos/workshop-outdoor-venue.jpg";
import cutFlowersTable from "../assets/photos/workshop-table-long.jpg";
import cutFlowersDetails from "../assets/photos/workshop-table-details-2.png";

const classDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "long",
  timeStyle: "short",
});

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === "function") {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function CutFlowersPage() {
  usePageMetadata({
    title: "Cut Flowers | Bethany Blooms",
    description:
      "Order lush cut flower arrangements, editorial styling, and botanical installations from the Bethany Blooms studio.",
  });
  const { openBooking } = useModal();
  const { items: remoteClasses, status: classesStatus } = useFirestoreCollection("cutFlowerClasses", {
    orderByField: "eventDate",
    orderDirection: "asc",
  });

  const upcomingClasses = useMemo(() => {
    const now = Date.now();
    return remoteClasses
      .filter((session) => (session.status ?? "live") === "live")
      .map((session) => {
        const eventDate = parseDateValue(session.eventDate);
        const priceNumber =
          typeof session.price === "number"
            ? session.price
            : Number.isFinite(Number(session.price))
            ? Number(session.price)
            : null;
        return {
          ...session,
          eventDate,
          displayDate: eventDate ? classDateFormatter.format(eventDate) : "Date to be confirmed",
          priceLabel: priceNumber !== null ? `R${priceNumber}` : session.price || "On request",
          priceNumber,
        };
      })
      .filter((session) => {
        if (!session.eventDate) return true;
        return session.eventDate.getTime() >= now;
      });
  }, [remoteClasses]);

  const offerings = [
    {
      title: "Editorial & Brand Styling",
      description: "Custom concepts for shoots, campaigns, and branded experiences with an emphasis on colour play.",
    },
    {
      title: "Celebration Installations",
      description: "Statement tables, arches, and floral backdrops for intimate celebrations and gatherings.",
    },
    {
      title: "Weekly Studio Drops",
      description: "Limited seasonal bunches and vase-ready florals available for pick-up from the studio.",
    },
  ];

  const handleBookClass = (classItem) => {
    const sessionDate = classItem.eventDate;
    const sessionId = `${classItem.id}-session`;
    const session = sessionDate
      ? {
          id: sessionId,
          label: classItem.displayDate,
          start: sessionDate.toISOString(),
          date: sessionDate.toISOString().slice(0, 10),
          time: sessionDate.toISOString().slice(11, 16),
          formatted: classItem.displayDate,
          capacity: classItem.capacity ? Number(classItem.capacity) : null,
        }
      : null;

    openBooking({
      type: "cut-flower",
      workshop: {
        id: classItem.id,
        title: classItem.title,
        description: classItem.description,
        location: classItem.location,
        unitPrice: classItem.priceNumber ?? null,
        image: classItem.image || cutFlowersTable,
        sessions: session ? [session] : [],
      },
    });
  };

  const processSteps = [
    {
      title: "1. Share Your Brief",
      description: "Tell us about the occasion, palette, and any inspiration so we can prepare a tailored quote.",
    },
    {
      title: "2. Approve the Proposal",
      description: "We’ll confirm mechanics, mood boards, and logistics for delivery or on-site styling.",
    },
    {
      title: "3. Bloom Day",
      description: "Our team handles sourcing, arranging, and setup so you can enjoy the flowers stress-free.",
    },
  ];

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero
            variant="cut"
            background={heroBackground}
            media={<img src={cutFlowersTable} alt="Bethany Blooms cut flower styling" />}
          >
            <span className="badge">Cut Flowers</span>
            <h1>Seasonal Florals, Styled For You</h1>
            <p>
              From elevated dinner tables and pop-up installs to thoughtful weekly deliveries, Bethany Blooms curates
              cut flowers that feel personal, textural, and artfully wild.
            </p>
            <div className="cta-group">
              <Link className="btn btn--primary" to="/contact">
                Start a Booking
              </Link>
              <Link className="btn btn--secondary" to="/events">
                See Upcoming Events
              </Link>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Offerings</span>
            <h2>How We Bloom</h2>
            <p>
              Whether you’re planning a gallery table, cafe takeover, or heartfelt gifting moment, we build florals that
              travel beautifully and feel intentional.
            </p>
          </Reveal>
          <div className="cards-grid">
            {offerings.map((item) => (
              <article className="card" key={item.title}>
                <h3 className="card__title">{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Upcoming Sessions</span>
            <h2>Book a Cut Flower Class</h2>
            <p>Reserve a spot at one of our small group floral builds, bouquet bars, or styling masterclasses.</p>
          </Reveal>
          {upcomingClasses.length > 0 ? (
            <div className="cards-grid">
              {upcomingClasses.map((classItem) => (
                <article className="card" key={classItem.id}>
                  <h3 className="card__title">{classItem.title}</h3>
                  <p className="modal__meta">{classItem.displayDate}</p>
                  {classItem.location && <p className="modal__meta">{classItem.location}</p>}
                  <p>{classItem.description}</p>
                  <p className="card__price">{classItem.priceLabel}</p>
                  <div className="card__actions">
                    <button className="btn btn--primary" type="button" onClick={() => handleBookClass(classItem)}>
                      Book This Session
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {classesStatus === "loading" ? "Loading sessions…" : "No cut flower classes are open right now."}
            </p>
          )}
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner cut-flowers-process">
          <div className="cut-flowers-process__media">
            <img src={cutFlowersDetails} alt="Cut flowers styled on a Bethany Blooms table" />
          </div>
          <div className="cut-flowers-process__steps">
            <Reveal as="div">
              <span className="badge">The Process</span>
              <h2>Bookings, Simplified</h2>
            </Reveal>
            <ol>
              {processSteps.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </li>
              ))}
            </ol>
            <Link className="btn btn--primary" to="/contact">
              Request Availability
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default CutFlowersPage;
