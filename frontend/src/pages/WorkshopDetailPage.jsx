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

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
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
  }
  base.setSeconds(0, 0);
  return base;
}

const DEFAULT_TIME_RANGES = {
  "09:00": "09:00 – 12:00",
  "13:00": "13:00 – 16:00",
};

const slotTimeFormatter = new Intl.DateTimeFormat("en-ZA", {
  hour: "2-digit",
  minute: "2-digit",
});

const sessionDayFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "long",
});

function getSlotRangeLabel(timeValue, startDate) {
  if (typeof timeValue === "string" && timeValue.length >= 5) {
    const normalized = timeValue.slice(0, 5);
    if (DEFAULT_TIME_RANGES[normalized]) {
      return DEFAULT_TIME_RANGES[normalized];
    }
  }
  if (startDate instanceof Date && !Number.isNaN(startDate.getTime())) {
    return slotTimeFormatter.format(startDate);
  }
  if (typeof timeValue === "string" && timeValue.trim()) {
    return timeValue.trim();
  }
  return null;
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
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const { openBooking } = useModal();
  const sessionFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    [],
  );

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
        const now = Date.now();
        const rawSessions = Array.isArray(data.sessions) ? data.sessions : [];
        const normalizedSessions = rawSessions
          .map((entry, index) => {
            const sessionId = entry.id || `session-${index}-${snapshot.id}`;
            const dateValue = typeof entry.date === "string" ? entry.date : "";
            const timeValue = typeof entry.time === "string" ? entry.time : "";
            const candidates = [
              entry.start,
              entry.startTime,
              entry.startDate,
              entry.datetime,
              entry.dateTime,
            ];
            let startDate = null;
            for (const candidate of candidates) {
              const parsedCandidate = parseDateValue(candidate);
              if (parsedCandidate) {
                startDate = parsedCandidate;
                break;
              }
            }
            if (!startDate && dateValue) {
              startDate = combineDateAndTime(dateValue, timeValue);
            }
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
          const fallbackDate = parseDateValue(data.scheduledFor);
          if (fallbackDate) {
            normalizedSessions.push({
              id: `session-fallback-${snapshot.id}`,
              label: null,
              formatted: sessionFormatter.format(fallbackDate),
              start: fallbackDate.toISOString(),
              startDate: fallbackDate,
              date: formatDateInput(fallbackDate),
              time: formatTimeInput(fallbackDate),
              timeRangeLabel: getSlotRangeLabel(formatTimeInput(fallbackDate), fallbackDate),
              capacity: null,
              isPast: fallbackDate.getTime() < now,
            });
          }
        }

        normalizedSessions.sort((a, b) => {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return a.startDate.getTime() - b.startDate.getTime();
        });

        const upcomingSession = normalizedSessions.find((session) => !session.isPast) ?? null;
        const fallbackSession = normalizedSessions[0] ?? null;
        const headlineSession = upcomingSession ?? fallbackSession;
        let scheduledDateLabel = "Date to be confirmed";
        if (headlineSession?.formatted) {
          scheduledDateLabel = headlineSession.formatted;
        }
        const primarySessionId =
          (typeof data.primarySessionId === "string" &&
            normalizedSessions.some((session) => session.id === data.primarySessionId) &&
            data.primarySessionId) ||
          headlineSession?.id ||
          null;
        const priceNumber = typeof data.price === "number" ? data.price : Number(data.price);
        const unitPrice = Number.isFinite(priceNumber) ? priceNumber : null;
        setWorkshop({
          id: snapshot.id,
          ...data,
          scheduledDateLabel,
          sessions: normalizedSessions,
          primarySessionId,
          unitPrice,
        });
        setStatus("success");
      } catch (err) {
        setError(err.message);
        setStatus("error");
      }
    };

    loadWorkshop();
  }, [db, sessionFormatter, workshopId]);

  useEffect(() => {
    if (!workshop) {
      setSelectedSessionId(null);
      setSelectedDay(null);
      return;
    }
    const sessionList = Array.isArray(workshop.sessions) ? workshop.sessions : [];
    if (sessionList.length === 0) {
      setSelectedSessionId(null);
      setSelectedDay(null);
      return;
    }
    const hasActive = sessionList.some((session) => !session.isPast);
    let nextSessionId = selectedSessionId;
    if (!nextSessionId || !sessionList.some((session) => session.id === nextSessionId)) {
      if (workshop.primarySessionId) {
        const primary = sessionList.find((session) => session.id === workshop.primarySessionId) ?? null;
        if (primary && (!primary.isPast || !hasActive)) {
          nextSessionId = primary.id;
        }
      }
      if (!nextSessionId) {
        const upcoming = sessionList.find((session) => !session.isPast);
        nextSessionId = (upcoming ?? sessionList[0]).id;
      }
    }

    setSelectedSessionId(nextSessionId);
    setSelectedDay((prevDay) => {
      if (prevDay && sessionList.some((session) => session.date === prevDay)) {
        return prevDay;
      }
      const nextSession = sessionList.find((session) => session.id === nextSessionId) ?? sessionList[0];
      return nextSession?.date ?? sessionList[0]?.date ?? null;
    });
  }, [selectedSessionId, workshop]);

  const sessions = Array.isArray(workshop?.sessions) ? workshop.sessions : [];

  const sessionDays = useMemo(() => {
    if (!sessions.length) return [];
    const map = new Map();
    sessions.forEach((session) => {
      const dateKey = session.date;
      if (!dateKey) return;
      if (!map.has(dateKey)) {
        const dateObject =
          session.startDate instanceof Date && !Number.isNaN(session.startDate.getTime())
            ? session.startDate
            : combineDateAndTime(session.date, session.time);
        const label = dateObject ? sessionDayFormatter.format(dateObject) : dateKey;
        map.set(dateKey, { date: dateKey, label, sessions: [] });
      }
      map.get(dateKey).sessions.push(session);
    });
    const grouped = Array.from(map.values()).map((group) => ({
      ...group,
      sessions: group.sessions.sort((a, b) => {
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return a.startDate.getTime() - b.startDate.getTime();
      }),
    }));
    grouped.sort((a, b) => {
      const aTime = a.sessions[0]?.startDate instanceof Date ? a.sessions[0].startDate.getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.sessions[0]?.startDate instanceof Date ? b.sessions[0].startDate.getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
    return grouped;
  }, [sessions]);

  const selectedDayData = sessionDays.find((day) => day.date === selectedDay) ?? sessionDays[0] ?? null;
  const selectedDaySlots = selectedDayData?.sessions ?? [];
  const dayHasActiveSlots = selectedDaySlots.some((slot) => !slot.isPast);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? selectedDaySlots[0] ?? null;
  const selectedDayLabel = selectedDayData?.label ?? null;

  useEffect(() => {
    if (!selectedDayData) {
      setSelectedSessionId(null);
      return;
    }
    if (selectedSession && selectedSession.date === selectedDayData.date) return;
    if (selectedDaySlots.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    const firstAvailable = selectedDaySlots.find((slot) => !slot.isPast) ?? selectedDaySlots[0];
    setSelectedSessionId(firstAvailable?.id ?? null);
  }, [selectedDayData, selectedDaySlots, selectedSession]);

  const handleSelectDay = (date) => {
    setSelectedDay(date);
  };

  const handleSelectSlot = (sessionId) => {
    setSelectedSessionId(sessionId);
  };

  const handleOpenBooking = () => {
    if (!workshop) return;
    const customerSeed = items.find((item) => item.metadata?.customer)?.metadata?.customer ?? null;
    if (!selectedSession) return;
    openBooking({
      workshop,
      sessionId: selectedSession.id,
      session: selectedSession,
      customer: customerSeed || undefined,
      date: selectedDay,
      dayLabel: selectedDayLabel,
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

  const whenLabel = (() => {
    const timeLabel = selectedSession?.timeRangeLabel || selectedSession?.formatted || workshop.scheduledDateLabel;
    if (selectedDayLabel && timeLabel) {
      return timeLabel.includes(selectedDayLabel) ? timeLabel : `${selectedDayLabel} · ${timeLabel}`;
    }
    return timeLabel || "Date to be confirmed";
  })();
  const capacityText =
    typeof selectedSession?.capacity === "number"
      ? `${selectedSession.capacity} seat${selectedSession.capacity === 1 ? "" : "s"} available`
      : null;
  const hasActiveSession = sessions.some((session) => !session.isPast);

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
              <p>{whenLabel}</p>
              {capacityText && <p className="modal__meta">{capacityText}</p>}
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
          {sessionDays.length > 0 && (
            <Reveal as="div" className="session-picker" delay={360}>
              <h3 className="session-picker__title">Choose Your Day</h3>
              <p className="session-picker__note">
                Pick the workshop day that suits you best, then select the time slot you’d like to attend.
              </p>
              <div className="session-picker__grid session-picker__grid--dates">
                {sessionDays.map((day) => {
                  const isActive = day.date === selectedDay;
                  const allPast = day.sessions.every((slot) => slot.isPast);
                  const anyFutureDay = sessionDays.some((entry) => entry.sessions.some((slot) => !slot.isPast));
                  return (
                    <label
                      key={day.date}
                      className={`session-day-chip ${isActive ? "session-day-chip--active" : ""} ${
                        allPast ? "session-day-chip--disabled" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="workshop-day"
                        value={day.date}
                        checked={isActive}
                        onChange={() => handleSelectDay(day.date)}
                        disabled={allPast && anyFutureDay}
                      />
                      <span className="session-day-chip__label">{day.label}</span>
                      <span className="session-day-chip__meta">
                        {day.sessions.length} slot{day.sessions.length === 1 ? "" : "s"} available
                      </span>
                      {allPast && (
                        <span className="session-day-chip__meta session-day-chip__meta--warning">Past day</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </Reveal>
          )}

          {selectedDaySlots.length > 0 && (
            <Reveal as="div" className="session-slot-picker" delay={420}>
              <h3 className="session-slot-picker__title">Pick a Time</h3>
              <p className="session-slot-picker__note">
                Morning sessions run 09:00 – 12:00 and afternoons 13:00 – 16:00. Capacity defaults to 10 guests but may differ per venue.
              </p>
              <div className="session-slot-picker__grid">
                {selectedDaySlots.map((slot) => {
                  const disabled = slot.isPast && dayHasActiveSlots;
                  return (
                    <label
                      key={slot.id}
                      className={`session-chip ${
                        selectedSessionId === slot.id ? "session-chip--active" : ""
                      } ${disabled ? "session-chip--disabled" : ""}`}
                    >
                      <input
                        type="radio"
                        name="workshop-session"
                        value={slot.id}
                        checked={selectedSessionId === slot.id}
                        onChange={() => handleSelectSlot(slot.id)}
                        disabled={disabled}
                      />
                      <span className="session-chip__label">{slot.timeRangeLabel || slot.formatted}</span>
                      <span className="session-chip__meta">
                        {slot.capacity
                          ? `${slot.capacity} seat${slot.capacity === 1 ? "" : "s"}`
                          : "Open booking"}
                      </span>
                      {slot.isPast && (
                        <span className="session-chip__meta session-chip__meta--warning">Past session</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </Reveal>
          )}

          {sessionDays.length === 0 && (
            <Reveal as="p" className="modal__meta session-picker__empty" delay={360}>
              We’re finalising new workshop dates. Follow us on social or send us a note to reserve your spot.
            </Reveal>
          )}
          {sessionDays.length > 0 && selectedDaySlots.length === 0 && (
            <Reveal as="p" className="modal__meta session-picker__empty" delay={420}>
              No time slots are currently open for the selected day. Choose a different date to continue.
            </Reveal>
          )}
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
