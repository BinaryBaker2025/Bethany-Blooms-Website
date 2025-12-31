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
const classDayFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "long",
});
const timeOnlyFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeStyle: "short",
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
  return `${startLabel} – ${endLabel}`;
}

function parseOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function formatTimeInput(date) {
  return date.toISOString().slice(11, 16);
}

function combineDateAndTime(dateInput, timeInput) {
  if (!dateInput) return null;
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return null;
  if (timeInput) {
    const [hours, minutes] = timeInput.split(":").map(Number);
    if (Number.isFinite(hours)) base.setHours(hours);
    if (Number.isFinite(minutes)) base.setMinutes(minutes);
    base.setSeconds(0, 0);
  }
  return base;
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
        const repeatDays = Array.isArray(session.repeatDays)
          ? session.repeatDays.map((day) => Number(day)).filter((day) => Number.isFinite(day))
          : [];
        const repeatLabel =
          session.repeatWeekly && repeatDays.length > 0
            ? formatRepeatLabel(repeatDays)
            : "";
        const isRepeating = Boolean(repeatLabel);
        const fallbackTime =
          eventDate && (eventDate.getHours() || eventDate.getMinutes())
            ? formatTimeInput(eventDate)
            : "";
        const rawTimeSlots = Array.isArray(session.timeSlots) ? session.timeSlots : [];
        const timeSlots =
          rawTimeSlots.length > 0
            ? rawTimeSlots
                .map((slot) => ({
                  time: typeof slot.time === "string" ? slot.time : "",
                  endTime: typeof slot.endTime === "string" ? slot.endTime : "",
                  label: typeof slot.label === "string" ? slot.label : "",
                }))
                .filter((slot) => slot.time)
            : fallbackTime
            ? [{ time: fallbackTime, endTime: "", label: "" }]
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
        const rawOptions = Array.isArray(session.options) ? session.options : [];
        const options = rawOptions
          .map((option, index) => ({
            value: option.value || option.id || option.label || `option-${index}`,
            label: option.label || option.name || option.value || `Option ${index + 1}`,
            price: parseOptionalNumber(option.price),
          }))
          .filter((option) => option.label);
        const priceNumber = parseOptionalNumber(session.price);
        const optionPrices = options.map((option) => option.price).filter((price) => Number.isFinite(price));
        const minOptionPrice = optionPrices.length > 0 ? Math.min(...optionPrices) : null;
        const baseDisplayDate = eventDate
          ? showTimes
            ? classDayFormatter.format(eventDate)
            : classDateFormatter.format(eventDate)
          : "Date to be confirmed";
        return {
          ...session,
          eventDate,
          displayDate: repeatLabel || baseDisplayDate,
          priceLabel:
            minOptionPrice !== null
              ? `From R${minOptionPrice}`
              : priceNumber !== null
              ? `R${priceNumber}`
              : options.length > 0
              ? "Options available"
              : session.price || "On request",
          priceNumber,
          timeSlots,
          showTimes,
          timeText: timeLabels.join(" · "),
          isRepeating,
          repeatDays,
          options,
        };
      })
      .filter((session) => {
        if (session.isRepeating) return true;
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

  const buildClassSessions = (classItem) => {
    const baseDate = classItem.eventDate;
    if (!baseDate) return [];

    const rawSlots = Array.isArray(classItem.timeSlots) ? classItem.timeSlots : [];
    const fallbackTime =
      baseDate && (baseDate.getHours() || baseDate.getMinutes())
        ? formatTimeInput(baseDate)
        : "";
    const slots =
      rawSlots.length > 0
        ? rawSlots
        : fallbackTime
        ? [{ time: fallbackTime, endTime: "", label: "" }]
        : [];
    if (slots.length === 0) return [];

    const now = Date.now();
    const repeatDays = Array.isArray(classItem.repeatDays) ? classItem.repeatDays : [];

    const buildSession = (sessionDate, slot, index, dateKey) => {
      const formatted = classDateFormatter.format(sessionDate);
      const timeLabel = formatTimeRange(slot.time, slot.endTime);
      const fallbackLabel = formatTimeValue(slot.time);
      const label = slot.label ? `${slot.label} (${timeLabel || fallbackLabel})` : timeLabel || fallbackLabel || formatted;
      const dateValue = sessionDate.toISOString().slice(0, 10);
      const timeValue = slot.time || formatTimeInput(sessionDate);
      return {
        id: `${classItem.id}-${dateKey}-${index}`,
        label,
        start: sessionDate.toISOString(),
        date: dateValue,
        time: timeValue,
        endTime: slot.endTime || null,
        formatted,
        timeRangeLabel: timeLabel || null,
        capacity: classItem.capacity ? Number(classItem.capacity) : null,
        isPast: sessionDate.getTime() < now,
      };
    };

    if (classItem.isRepeating && repeatDays.length > 0) {
      const sessions = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(baseDate);
      start.setHours(0, 0, 0, 0);
      const cursor = start > today ? start : today;
      const windowDays = 90;
      for (let offset = 0; offset <= windowDays; offset += 1) {
        const nextDate = new Date(cursor);
        nextDate.setDate(cursor.getDate() + offset);
        if (!repeatDays.includes(nextDate.getDay())) continue;
        const dateKey = nextDate.toISOString().slice(0, 10);
        slots.forEach((slot, index) => {
          const sessionDate = combineDateAndTime(nextDate, slot.time);
          if (!sessionDate) return;
          sessions.push(buildSession(sessionDate, slot, index, dateKey));
        });
      }
      return sessions;
    }

    return slots
      .map((slot, index) => {
        const sessionDate = combineDateAndTime(baseDate, slot.time);
        if (!sessionDate) return null;
        const dateKey = sessionDate.toISOString().slice(0, 10);
        return buildSession(sessionDate, slot, index, dateKey);
      })
      .filter(Boolean);
  };

  const handleBookClass = (classItem) => {
    const sessions = buildClassSessions(classItem);

    openBooking({
      type: "cut-flower",
      workshop: {
        id: classItem.id,
        title: classItem.title,
        description: classItem.description,
        location: classItem.location,
        unitPrice: classItem.priceNumber ?? null,
        image: classItem.image || cutFlowersTable,
        sessions,
        options: classItem.options || [],
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
                  {classItem.showTimes && (
                    <p className="modal__meta">Times: {classItem.timeText}</p>
                  )}
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
