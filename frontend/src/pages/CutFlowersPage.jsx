import { Link } from "react-router-dom";
import { useMemo, useRef } from "react";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useModal } from "../context/ModalContext.jsx";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { CUT_FLOWER_PAGE_IMAGES } from "../lib/cutFlowerImages.js";

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
      "Visit the Bethany Blooms flower farm to cut your own fresh flowers and take home handpicked seasonal stems.",
  });
  const { openBooking } = useModal();
  const { items: remoteClasses, status: classesStatus } = useFirestoreCollection("cutFlowerClasses", {
    orderByField: "eventDate",
    orderDirection: "asc",
  });
  const classesSectionRef = useRef(null);

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
            minAttendees: parseOptionalNumber(option.minAttendees),
            isExtra: Boolean(option.isExtra),
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
      title: "Pick-Your-Own Flower Rows",
      description:
        "Walk through the farm beds, choose your favourites, and cut stems yourself for a personal bunch.",
    },
    {
      title: "Build Your Own Bucket",
      description:
        "Mix colours and flower varieties at your own pace, then take home a bucket of blooms you selected.",
    },
    {
      title: "Relaxed Farm Sessions",
      description:
        "Book a time slot for a calm, hands-on flower experience at the farm rather than off-site event styling.",
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
    const capacityValue = Number(classItem.capacity);
    const capacity = Number.isFinite(capacityValue) && capacityValue > 0 ? capacityValue : null;

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
        capacity,
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
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      if (cursor.getTime() > monthEnd.getTime()) {
        return sessions;
      }

      const nextDate = new Date(cursor);
      while (nextDate.getTime() <= monthEnd.getTime()) {
        if (!repeatDays.includes(nextDate.getDay())) {
          nextDate.setDate(nextDate.getDate() + 1);
          continue;
        }
        const dateKey = nextDate.toISOString().slice(0, 10);
        slots.forEach((slot, index) => {
          const sessionDate = combineDateAndTime(nextDate, slot.time);
          if (!sessionDate) return;
          sessions.push(buildSession(sessionDate, slot, index, dateKey));
        });
        nextDate.setDate(nextDate.getDate() + 1);
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
        image: classItem.image || CUT_FLOWER_PAGE_IMAGES.cutFlowersClassFallback,
        sessions,
        options: classItem.options || [],
      },
    });
  };

  const handleStartBookingClick = () => {
    if (classesSectionRef.current) {
      classesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const processSteps = [
    {
      title: "1. Choose Your Session",
      description: "Pick a date and time that suits you, then reserve your farm visit.",
    },
    {
      title: "2. Arrive At The Farm",
      description: "We'll welcome you, share the picking guidelines, and help you get started.",
    },
    {
      title: "3. Cut & Take Home",
      description: "Cut your own stems from the flower bushes and head home with your handpicked blooms.",
    },
  ];

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero
            variant="cut"
            background={CUT_FLOWER_PAGE_IMAGES.cutFlowersHeroBackground}
            media={
              <img
                src={CUT_FLOWER_PAGE_IMAGES.cutFlowersHeroMedia}
                alt="Visitors cutting flowers at the Bethany Blooms farm"
                loading="lazy"
                decoding="async"
              />
            }
          >
            <span className="badge">Cut Flowers</span>
            <h1>Visit The Farm & Cut Your Own Flowers</h1>
            <p>
              Bethany Blooms cut flowers are a flower-farm experience: come to the farm, walk the rows, cut from the
              bushes yourself, and take home a bunch you chose by hand.
            </p>
            <div className="cta-group">
              <button className="btn btn--primary" type="button" onClick={handleStartBookingClick}>
                Book A Farm Session
              </button>
              <Link className="btn btn--secondary" to="/contact">
                Ask About Farm Visits
              </Link>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Offerings</span>
            <h2>What To Expect At The Farm</h2>
            <p>
              This is a hands-on flower farm experience where you do the cutting yourself. We do not provide off-site
              event styling from this page.
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

      <section className="section section--tight" id="cut-flower-classes" ref={classesSectionRef}>
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Upcoming Sessions</span>
            <h2>Book A Cut Flower Farm Session</h2>
            <p>Reserve your spot, visit the farm, and enjoy cutting your own fresh flowers.</p>
          </Reveal>
          {upcomingClasses.length > 0 ? (
            <div className="cards-grid">
              {upcomingClasses.map((classItem) => (
                <article className="card cut-flower-card" key={classItem.id}>
                  <div className="cut-flower-card__media">
                    <img
                      src={classItem.image || CUT_FLOWER_PAGE_IMAGES.cutFlowersClassFallback}
                      alt={`${classItem.title} class`} loading="lazy" decoding="async"/>
                    <span className="cut-flower-card__badge">{classItem.displayDate}</span>
                    {classItem.priceLabel && (
                      <span className="cut-flower-card__price-tag">{classItem.priceLabel}</span>
                    )}
                  </div>
                  <div className="cut-flower-card__body">
                    <div className="cut-flower-card__heading">
                      <h3 className="card__title">{classItem.title}</h3>
                      {classItem.location && (
                        <p className="cut-flower-card__location">{classItem.location}</p>
                      )}
                    </div>
                    <p className="cut-flower-card__summary">{classItem.description}</p>
                    <div className="cut-flower-card__details">
                      <div className="cut-flower-card__detail">
                        <span className="cut-flower-card__detail-label">Spots</span>
                        <span className="cut-flower-card__detail-value">
                          {classItem.capacity
                            ? `${classItem.capacity} seats per time slot`
                            : "Open booking"}
                        </span>
                      </div>
                      {classItem.showTimes && (
                        <div className="cut-flower-card__detail">
                          <span className="cut-flower-card__detail-label">Times</span>
                          <span className="cut-flower-card__detail-value">{classItem.timeText}</span>
                        </div>
                      )}
                      {classItem.options?.length > 0 && (
                        <div className="cut-flower-card__detail">
                          <span className="cut-flower-card__detail-label">Options</span>
                          <span className="cut-flower-card__detail-value">
                            {classItem.options.length} bucket option{classItem.options.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="card__actions">
                      <button className="btn btn--primary" type="button" onClick={() => handleBookClass(classItem)}>
                        Book Farm Session
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {classesStatus === "loading" ? "Loading sessions…" : "No farm sessions are open right now."}
            </p>
          )}
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner cut-flowers-process">
          <div className="cut-flowers-process__media">
            <img
              src={CUT_FLOWER_PAGE_IMAGES.cutFlowersProcess}
              alt="Cut flowers styled on a Bethany Blooms table"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="cut-flowers-process__steps">
            <Reveal as="div">
              <span className="badge">The Process</span>
              <h2>Your Farm Visit, Simplified</h2>
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
              Request Farm Availability
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default CutFlowersPage;
