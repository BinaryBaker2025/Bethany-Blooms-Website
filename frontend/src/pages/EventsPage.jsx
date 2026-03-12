import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { buildWhatsAppLink } from "../lib/contactInfo.js";
import galleryHero from "../assets/photos/workshop-table-long-close.jpg";

const eventDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "long",
  timeStyle: "short",
});
const eventDayFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "long",
});
const timeOnlyFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeStyle: "short",
});
const listingDayFormatter = new Intl.DateTimeFormat("en-ZA", {
  day: "2-digit",
  month: "short",
});
const weekdayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatRepeatLabel(repeatDays) {
  const days = Array.isArray(repeatDays) ? repeatDays : [];
  const normalized = days.map((day) => Number(day)).filter((day) => Number.isFinite(day));
  const labels = normalized
    .map((day) => weekdayLabels[day])
    .filter(Boolean);
  if (!labels.length) return "";
  return `Every ${labels.join(", ")}`;
}

function formatTimeValue(value) {
  if (!value) return "";
  if (value instanceof Date) return timeOnlyFormatter.format(value);
  if (typeof value !== "string") return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours)) return value;
  const date = new Date();
  date.setHours(hours);
  date.setMinutes(Number.isFinite(minutes) ? minutes : 0);
  date.setSeconds(0, 0);
  return timeOnlyFormatter.format(date);
}

function formatTimeRange(startTime, endTime) {
  const startLabel = formatTimeValue(startTime);
  if (!startLabel) return "";
  const endLabel = formatTimeValue(endTime);
  if (!endLabel) return startLabel;
  return `${startLabel} - ${endLabel}`;
}

function buildEventWhatsAppLink(event) {
  const hasDate = event?.displayDate && event.displayDate !== "Date coming soon";
  const title = event?.title ? `"${event.title}"` : "your events";
  const datePart = hasDate ? ` for ${event.displayDate}` : "";
  const timePart = event?.timeText ? ` (${event.timeText})` : "";
  const locationPart = event?.location ? ` at ${event.location}` : "";
  const message = `Hi Bethany Blooms, I'm interested in ${title}${datePart}${timePart}${locationPart}. Please share more details.`;
  return buildWhatsAppLink(message);
}

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
        const repeatLabel =
          event.repeatWeekly && Array.isArray(event.repeatDays)
            ? formatRepeatLabel(event.repeatDays)
            : "";
        const isRepeating = Boolean(repeatLabel);
        const timeSlots = Array.isArray(event.timeSlots)
          ? event.timeSlots
              .map((slot) => ({
                time: typeof slot.time === "string" ? slot.time : "",
                endTime: typeof slot.endTime === "string" ? slot.endTime : "",
                label: typeof slot.label === "string" ? slot.label : "",
              }))
              .filter((slot) => slot.time)
          : [];
        const timeLabels = timeSlots
          .map((slot) => {
            const formattedTime = formatTimeRange(slot.time, slot.endTime);
            if (!formattedTime) return "";
            return slot.label ? `${slot.label} (${formattedTime})` : formattedTime;
          })
          .filter(Boolean);
        const hasLabeledSlot = timeSlots.some((slot) => slot.label?.trim());
        const showTimes =
          timeLabels.length > 0 &&
          (timeLabels.length > 1 || hasLabeledSlot || isRepeating);
        const baseDisplayDate = eventDate
          ? showTimes
            ? eventDayFormatter.format(eventDate)
            : eventDateFormatter.format(eventDate)
          : "Date coming soon";
        return {
          ...event,
          title: event.title || "Bethany Blooms Event",
          description: event.description || "",
          location: event.location || "Bethany Blooms Studio",
          image: event.image || galleryHero,
          eventDate,
          displayDate: repeatLabel || baseDisplayDate,
          isRepeating,
          showTimes,
          timeText: timeLabels.join(" · "),
          workshopId: event.workshopId || "",
          workshopTitle: event.workshopTitle || "",
        };
      })
      .filter((event) => Boolean(event.title?.trim()));
  }, [remoteEvents]);

  const hasEvents = events.length > 0;
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    if (!lightboxImage) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setLightboxImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxImage]);

  const openLightbox = (event) => {
    if (!event?.image) return;
    setLightboxImage({
      src: event.image,
      alt: `${event.title} event poster`,
    });
  };

  return (
    <>
      {/* Page hero */}
      <section className="section--no-pad">
        <div className="page-hero">
          <img className="page-hero__bg" src={galleryHero} alt="" aria-hidden="true" loading="eager" decoding="async" />
          <div className="page-hero__overlay" aria-hidden="true" />
          <div className="page-hero__content">
            <span className="editorial-eyebrow">Studio Events & Pop-ups</span>
            <h1>Studio Events & Pop-ups</h1>
            <p>
              Join Bethany Blooms on the road and in the studio for collaborative creative sessions, floral pop-ups, and
              intimate event styling moments tailored with pressed blooms.
            </p>
          </div>
        </div>
      </section>

      {/* Editorial event listing */}
      <section className="section band--white">
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">Upcoming</span>
            <h2>See Us In Person</h2>
            <p>
              These limited events are crafted with partners and clients around Gauteng and beyond. Secure your spot, or
              browse the workshop we&apos;re hosting on-site.
            </p>
          </Reveal>

          {hasEvents ? (
            <div className="editorial-listing">
              {events.map((event) => (
                <Reveal as="article" className="editorial-listing__item" key={event.id}>
                  <div className="editorial-listing__date">
                    {event.eventDate
                      ? listingDayFormatter.format(event.eventDate)
                      : "—"}
                    <span className="editorial-listing__date-sub">{event.displayDate}</span>
                  </div>
                  <div className="editorial-listing__body">
                    <h3 className="editorial-listing__title">{event.title}</h3>
                    <p className="editorial-listing__meta">{event.location}</p>
                    {event.showTimes && (
                      <p className="editorial-listing__meta">Times: {event.timeText}</p>
                    )}
                    {event.description && (
                      <p className="editorial-listing__desc">{event.description}</p>
                    )}
                    {event.image && (
                      <button
                        className="editorial-listing__thumb"
                        type="button"
                        onClick={() => openLightbox(event)}
                        aria-label={`View ${event.title} image`}
                      >
                        <img src={event.image} alt={`${event.title} banner`} loading="lazy" decoding="async" />
                      </button>
                    )}
                    <div className="editorial-listing__actions">
                      {event.workshopId && (
                        <Link className="btn btn--primary" to={`/workshops/${event.workshopId}`}>
                          View Workshop
                        </Link>
                      )}
                      <a
                        className="btn btn--secondary"
                        href={buildEventWhatsAppLink(event)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Contact Us
                      </a>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {status === "loading" ? "Loading events..." : "We're planning new events. Check back soon!"}
            </p>
          )}
        </div>
      </section>

      {lightboxImage && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightboxImage(null)}>
          <div className="lightbox__content" onClick={(event) => event.stopPropagation()}>
            <button className="lightbox__close" type="button" onClick={() => setLightboxImage(null)}>
              Close
            </button>
            <img className="lightbox__image" src={lightboxImage.src} alt={lightboxImage.alt} loading="lazy" decoding="async" />
          </div>
        </div>
      )}
    </>
  );
}

export default EventsPage;
