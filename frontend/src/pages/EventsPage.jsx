import { Link } from "react-router-dom";
import { useMemo } from "react";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/photos/workshop-outdoor-venue.jpg";
import galleryHero from "../assets/photos/workshop-table-long-close.jpg";

const eventDateFormatter = new Intl.DateTimeFormat("en-ZA", {
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

function EventsPage() {
  usePageMetadata({
    title: "Events | Bethany Blooms",
    description:
      "Browse upcoming Bethany Blooms experiences, pop-ups, and collaborative events. Save the date and reserve your workshop seat in one place.",
  });

  const { items: remoteEvents, status } = useFirestoreCollection("events", {
    orderByField: "eventDate",
    orderDirection: "asc",
  });

  const events = useMemo(() => {
    return remoteEvents
      .filter((event) => (event.status ?? "live") === "live")
      .map((event) => {
        const eventDate = parseDateValue(event.eventDate);
        return {
          ...event,
          title: event.title || "Bethany Blooms Event",
          description: event.description || "",
          location: event.location || "Bethany Blooms Studio",
          image: event.image || galleryHero,
          eventDate,
          displayDate: eventDate ? eventDateFormatter.format(eventDate) : "Date coming soon",
          workshopId: event.workshopId || "",
          workshopTitle: event.workshopTitle || "",
        };
      })
      .filter((event) => Boolean(event.title?.trim()));
  }, [remoteEvents]);

  const hasEvents = events.length > 0;

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero variant="gallery" background={heroBackground} media={<img src={galleryHero} alt="Bethany Blooms events" />}>
            <h1>Studio Events & Pop-ups</h1>
            <p>
              Join Bethany Blooms on the road and in the studio for collaborative creative sessions, floral pop-ups, and
              intimate event styling moments tailored with pressed blooms.
            </p>
          </Hero>
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Upcoming</span>
            <h2>See Us In Person</h2>
            <p>
              These limited events are crafted with partners and clients around Gauteng and beyond. Secure your spot, or
              browse the workshop we&apos;re hosting on-site.
            </p>
          </Reveal>

          {hasEvents ? (
            <div className="events-grid">
              {events.map((event) => (
                <article className="event-card" key={event.id}>
                  {event.image && (
                    <div className="event-card__media">
                      <img src={event.image} alt={`${event.title} event banner`} loading="lazy" />
                    </div>
                  )}
                  <div className="event-card__body">
                    <span className="badge badge--muted">{event.displayDate}</span>
                    <h3>{event.title}</h3>
                    <p className="event-card__meta">{event.location}</p>
                    {event.description && <p>{event.description}</p>}
                    <div className="event-card__actions">
                      {event.workshopId && (
                        <Link className="btn btn--primary" to={`/workshops/${event.workshopId}`}>
                          View Workshop
                        </Link>
                      )}
                      <Link className="btn btn--secondary" to="/contact">
                        Contact Studio
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {status === "loading" ? "Loading events…" : "We’re planning new events. Check back soon!"}
            </p>
          )}
        </div>
      </section>
    </>
  );
}

export default EventsPage;
