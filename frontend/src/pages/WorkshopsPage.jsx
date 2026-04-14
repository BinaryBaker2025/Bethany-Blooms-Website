import { Link } from "react-router-dom";
import Reveal from "../components/Reveal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import workshopDetailImage from "../assets/photos/workshop-table-details-1.png";

function parseWorkshopDateValue(value) {
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

function combineDateAndTime(dateInput, timeInput) {
  if (!dateInput) return null;
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return null;
  if (timeInput) {
    const [hours, minutes] = timeInput.split(":").map(Number);
    if (Number.isFinite(hours)) base.setHours(hours);
    if (Number.isFinite(minutes)) base.setMinutes(minutes);
  }
  base.setSeconds(0, 0);
  return base;
}

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeInput(date) {
  return date.toISOString().slice(11, 16);
}

const DEFAULT_TIME_RANGES = {
  "09:00": "09:00 - 12:00",
  "13:00": "13:00 - 16:00",
};

function getSlotRangeLabel(timeValue, startDate) {
  if (typeof timeValue === "string" && timeValue.length >= 5) {
    const normalized = timeValue.slice(0, 5);
    if (DEFAULT_TIME_RANGES[normalized]) return DEFAULT_TIME_RANGES[normalized];
  }
  if (startDate instanceof Date && !Number.isNaN(startDate.getTime())) {
    return new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit" }).format(startDate);
  }
  if (typeof timeValue === "string" && timeValue.trim()) return timeValue.trim();
  return null;
}

function normalizeWorkshopForModal(workshop, sessionFormatter) {
  const now = Date.now();
  const rawSessions = Array.isArray(workshop.sessions) ? workshop.sessions.filter(Boolean) : [];
  const normalizedSessions = rawSessions
    .map((entry, index) => {
      const sessionId = entry.id || `session-${index}-${workshop.id}`;
      const dateValue = typeof entry.date === "string" ? entry.date : "";
      const timeValue = typeof entry.time === "string" ? entry.time : "";
      const candidates = [entry.start, entry.startTime, entry.startDate, entry.datetime, entry.dateTime];
      let startDate = null;
      for (const candidate of candidates) {
        const parsed = parseWorkshopDateValue(candidate);
        if (parsed) { startDate = parsed; break; }
      }
      if (!startDate && dateValue) startDate = combineDateAndTime(dateValue, timeValue);
      if (!startDate) return null;
      const capacityNumber = Number(entry.capacity);
      const customLabel = typeof entry.label === "string" ? entry.label.trim() : "";
      const formatted = customLabel || sessionFormatter.format(startDate);
      const timeRangeLabel = getSlotRangeLabel(timeValue, startDate);
      return {
        id: sessionId,
        label: customLabel || null,
        formatted,
        start: startDate.toISOString(),
        startDate,
        date: dateValue || formatDateInput(startDate),
        time: timeValue || formatTimeInput(startDate),
        timeRangeLabel,
        capacity: Number.isFinite(capacityNumber) && capacityNumber > 0 ? capacityNumber : null,
        isPast: startDate.getTime() < now,
      };
    })
    .filter(Boolean);

  if (normalizedSessions.length === 0) {
    const fallbackDate = parseWorkshopDateValue(workshop.scheduledFor);
    if (fallbackDate) {
      const fallbackTime = formatTimeInput(fallbackDate);
      normalizedSessions.push({
        id: `session-fallback-${workshop.id}`,
        label: null,
        formatted: sessionFormatter.format(fallbackDate),
        start: fallbackDate.toISOString(),
        startDate: fallbackDate,
        date: formatDateInput(fallbackDate),
        time: fallbackTime,
        timeRangeLabel: getSlotRangeLabel(fallbackTime, fallbackDate),
        capacity: null,
        isPast: fallbackDate.getTime() < now,
      });
    }
  }

  normalizedSessions.sort((a, b) => {
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.getTime() - b.startDate.getTime();
  });

  const rawOptions = Array.isArray(workshop.options) ? workshop.options : [];
  const normalizedOptions = rawOptions
    .map((opt, index) => {
      const label = (opt?.label || "").toString().trim();
      const priceNum = typeof opt?.price === "number" ? opt.price : Number(opt?.price);
      if (!label || !Number.isFinite(priceNum) || priceNum <= 0) return null;
      return { id: (opt?.id || `option-${index}`).toString().trim(), label, price: priceNum };
    })
    .filter(Boolean);

  const priceNumber = typeof workshop.price === "number" ? workshop.price : Number(workshop.price);
  const unitPrice = Number.isFinite(priceNumber) ? priceNumber : null;
  const headlineSession = normalizedSessions.find((s) => !s.isPast) ?? normalizedSessions[0] ?? null;
  const scheduledDateLabel = headlineSession?.formatted || workshop.scheduledDateLabel || "By request";
  const primarySessionId = workshop.primarySessionId || headlineSession?.id || null;

  return { ...workshop, sessions: normalizedSessions, options: normalizedOptions, unitPrice, scheduledDateLabel, primarySessionId };
}

function resolveWorkshopDate(workshop = {}) {
  const explicitDate = parseWorkshopDateValue(workshop?.scheduledFor);
  if (explicitDate) return explicitDate;
  const sessions = Array.isArray(workshop?.sessions) ? workshop.sessions : [];
  for (const session of sessions) {
    const directStart = parseWorkshopDateValue(session?.start || session?.startDate);
    if (directStart) return directStart;
    const dateValue = (session?.date || "").toString().trim();
    const timeValue = (session?.time || "").toString().trim();
    if (!dateValue) continue;
    const parsed = parseWorkshopDateValue(`${dateValue}T${timeValue || "00:00"}`);
    if (parsed) return parsed;
  }
  return null;
}

function buildWorkshopCardSummary(workshop = {}) {
  const contentCandidates = [
    workshop.description,
    workshop.ctaNote,
    workshop.whatToExpect,
    workshop.bookingPricing,
  ];
  const firstFilled = contentCandidates
    .find((value) => typeof value === "string" && value.trim().length > 0)
    ?.replace(/\s+/g, " ")
    .trim();
  if (!firstFilled) return "Explore the workshop details, available dates, and booking options.";
  if (firstFilled.length <= 150) return firstFilled;
  return `${firstFilled.slice(0, 147).trimEnd()}...`;
}

function WorkshopsPage() {
  usePageMetadata({
    title: "Bethany Blooms Workshops | Pressed Flower Experiences in Vereeniging",
    description:
      "Reserve your seat at a Bethany Blooms pressed flower workshop. Explore dates, pricing, and what's included.",
  });

  const { openBooking } = useModal();
  const { items } = useCart();

  const eventFormatter = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const { items: remoteWorkshops, status } = useFirestoreCollection("workshops", {
    orderByField: null,
    orderDirection: null,
  });

  const workshops = remoteWorkshops.filter((workshop) => (workshop.status ?? "live") === "live");

  const normalizedWorkshops = workshops
    .map((workshop) => {
      const parsedDate = resolveWorkshopDate(workshop);
      const hasValidDate = parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime());
      const rawSessions = Array.isArray(workshop.sessions) ? workshop.sessions : [];
      const isByRequest = !hasValidDate && rawSessions.length === 0;
      const displayDate = isByRequest ? "By request" : hasValidDate ? eventFormatter.format(parsedDate) : "Date to be confirmed";
      const priceNumber = typeof workshop.price === "number" ? workshop.price : Number(workshop.price);
      const options = Array.isArray(workshop.options) ? workshop.options : [];
      const optionPrices = options
        .map((o) => {
          const p = typeof o.price === "number" ? o.price : Number(o.price);
          return Number.isFinite(p) ? p : null;
        })
        .filter((p) => p !== null);
      const minOptionPrice = optionPrices.length > 0 ? Math.min(...optionPrices) : null;
      return {
        ...workshop,
        title: workshop.title || workshop.name || "Bethany Blooms Workshop",
        description: buildWorkshopCardSummary(workshop),
        scheduledFor: workshop.scheduledFor ?? null,
        formattedDate: displayDate,
        isByRequest,
        priceDisplay:
          minOptionPrice !== null
            ? `From R${minOptionPrice}`
            : Number.isFinite(priceNumber)
              ? `R${priceNumber}`
              : workshop.price ?? "Pricing on request",
        options,
        location: workshop.location || "Vereeniging Studio",
        sortTime: hasValidDate ? parsedDate.getTime() : Number.POSITIVE_INFINITY,
      };
    })
    .sort((left, right) => {
      if (left.sortTime !== right.sortTime) {
        return left.sortTime - right.sortTime;
      }
      return left.title.localeCompare(right.title, undefined, {
        sensitivity: "base",
      });
    });

  const firstWorkshop = normalizedWorkshops[0];

  const handleBookWorkshop = (workshop) => {
    const normalized = normalizeWorkshopForModal(workshop, eventFormatter);
    const firstOption = normalized.options.length > 0 ? normalized.options[0] : null;
    const isByRequest = normalized.sessions.length === 0;
    const customerSeed = items.find((item) => item.metadata?.customer)?.metadata?.customer ?? null;
    const bookingPayload = {
      type: "workshop",
      workshop: normalized,
      customer: customerSeed || undefined,
      selectedOption: firstOption,
      optionId: firstOption?.id || "",
      optionValue: firstOption?.id || "",
      optionLabel: firstOption?.label || "",
      framePreference: firstOption?.id || "",
      sessionSource: isByRequest ? "customer-requested" : "admin-session",
    };
    if (!isByRequest) {
      const firstUpcoming = normalized.sessions.find((s) => !s.isPast) ?? normalized.sessions[0] ?? null;
      if (firstUpcoming) {
        bookingPayload.sessionId = firstUpcoming.id;
        bookingPayload.session = firstUpcoming;
        bookingPayload.date = firstUpcoming.date;
        bookingPayload.dayLabel = firstUpcoming.formatted;
      }
    }
    openBooking(bookingPayload);
  };

  return (
    <>
      {/* Page hero */}
      <section className="section--no-pad">
        <div className="page-hero">
          <img className="page-hero__bg" src={workshopDetailImage} alt="" aria-hidden="true" loading="eager" decoding="async" />
          <div className="page-hero__overlay" aria-hidden="true" />
          <div className="page-hero__content">
            <span className="editorial-eyebrow">Pressed Flower Workshops</span>
            <h1>Bespoke Pressed Flower Workshops</h1>
            <p>
              Slow down with a day of making, guided by Bethany Blooms. Craft a framed arrangement, learn pressing
              techniques, and share a peaceful table with fellow creatives.
            </p>
            <div className="cta-group">
              {firstWorkshop ? (
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => handleBookWorkshop(firstWorkshop)}
                >
                  Book Now
                </button>
              ) : (
                <a className="btn btn--primary" href="#workshop-details">
                  View Upcoming Dates
                </a>
              )}
              <a href="#workshop-details" className="btn btn--secondary">See All Dates</a>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming workshops cards */}
      <section className="section band--cream" id="workshop-details">
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">Upcoming</span>
            <h2>Upcoming Workshops</h2>
            <p>
              We gather at a light-filled studio in Vereeniging, with refreshments, blooms, and framing included.
              Explore the next available dates below, or request a private date when a workshop is marked by request.
            </p>
          </Reveal>
          <div className="cards-grid workshops-grid">
            {normalizedWorkshops.map((workshop, index) => (
              <Reveal as="article" className="card cut-flower-card" key={workshop.id} delay={index * 120}>
                <div className="cut-flower-card__media">
                  <img
                    src={workshop.image || workshopDetailImage}
                    alt={`${workshop.title} workshop`}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="cut-flower-card__badge">{workshop.formattedDate}</span>
                  {workshop.priceDisplay && (
                    <span className="cut-flower-card__price-tag">{workshop.priceDisplay}</span>
                  )}
                </div>
                <div className="cut-flower-card__body">
                  <div className="cut-flower-card__heading">
                    <h3 className="card__title">{workshop.title}</h3>
                    {workshop.location && (
                      <p className="cut-flower-card__location">{workshop.location}</p>
                    )}
                  </div>
                  <p className="cut-flower-card__summary">{workshop.description}</p>
                  <div className="cut-flower-card__details">
                    <div className="cut-flower-card__detail">
                      <span className="cut-flower-card__detail-label">Booking</span>
                      <span className="cut-flower-card__detail-value">
                        {workshop.isByRequest ? "Choose your date" : "Scheduled workshop"}
                      </span>
                    </div>
                    <div className="cut-flower-card__detail">
                      <span className="cut-flower-card__detail-label">Format</span>
                      <span className="cut-flower-card__detail-value">Pressed flower workshop</span>
                    </div>
                    {workshop.options.length > 0 && (
                      <div className="cut-flower-card__detail">
                        <span className="cut-flower-card__detail-label">Options</span>
                        <span className="cut-flower-card__detail-value">
                          {workshop.options.length} ticket option{workshop.options.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="card__actions">
                    <Link
                      className="btn btn--secondary"
                      to={`/workshops/${encodeURIComponent(workshop.id)}`}
                    >
                      View More
                    </Link>
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={() => handleBookWorkshop(workshop)}
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          {normalizedWorkshops.length === 0 && status !== "loading" && (
            <p className="empty-state">No workshops are scheduled right now. Please check back soon.</p>
          )}
          {status === "loading" && <p className="empty-state">Loading workshop schedule...</p>}
          {status === "empty" && (
            <p className="empty-state">No workshops are scheduled right now. Please check back soon.</p>
          )}
          {status === "error" && (
            <p className="empty-state">We couldn't load workshops right now. Please refresh and try again.</p>
          )}
        </div>
      </section>

      {/* A Day in Bloom — editorial-process */}
      <section className="section band--white">
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">What to Expect</span>
            <h2>A Day in Bloom</h2>
          </Reveal>
          <Reveal as="div" className="editorial-process">
            <div className="editorial-process__step">
              <h3>Guided Creative Flow</h3>
              <p>
                Learn foundational techniques for pressing, arranging, and preserving florals while crafting a frame
                that reflects your unique style.
              </p>
            </div>
            <div className="editorial-process__step">
              <h3>All Materials Included</h3>
              <p>
                We provide tools, florals, frames, and refreshments. Simply arrive, breathe deeply, and create.
              </p>
            </div>
            <div className="editorial-process__step">
              <h3>Take-Home Keepsakes</h3>
              <p>
                Leave with your completed framed art, a curated mini bloom pack, and a guide to keep pressing at home.
              </p>
            </div>
            <div className="editorial-process__step">
              <h3>Upgrade with Fresh Blooms</h3>
              <p>
                Pair your workshop with market buckets, bouquet subscriptions, or a bespoke pressed art commission.
              </p>
              <Link className="btn btn--secondary" to="/products">Explore Products</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export default WorkshopsPage;
