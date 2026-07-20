import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { getFirebaseDb } from "../lib/firebase.js";
import heroBackground from "../assets/photos/workshop-outdoor-venue.jpg";

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
    if (/^[-*\u2022]\s*/.test(line)) {
      listItems.push(
        <li key={`item-${index}`}>
          {line.replace(/^[-*\u2022]\s*/, "").trim()}
        </li>,
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
      elements.push(<p key={`paragraph-${index}`}>{line}</p>);
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

const isWorkshopSessionFull = (session) =>
  typeof session?.capacity === "number" && session.capacity <= 0;

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
  "09:00": "09:00 - 12:00",
  "13:00": "13:00 - 16:00",
};

const WORKSHOP_BOOKING_WINDOW_DAYS = 14;
const WORKSHOP_REQUEST_WINDOWS = ["08:00 - 11:00", "12:00 - 15:00"];

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

function isSessionInsideBookingWindow(session) {
  const startDate =
    session?.startDate instanceof Date &&
    !Number.isNaN(session.startDate.getTime())
      ? session.startDate
      : typeof session?.start === "string"
        ? new Date(session.start)
        : combineDateAndTime(session?.date, session?.time);
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime()))
    return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return startDate.getTime() >= now.getTime();
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
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const detailsSectionRef = useRef(null);
  const bookingSectionRef = useRef(null);
  const infoTrailRef = useRef(null);
  const infoTrailPathRef = useRef(null);
  const infoTrailMetricsRef = useRef({ length: 0, samples: [] });
  const { openBooking } = useModal();
  const canonicalWorkshopPath = workshopId
    ? `/workshops/${encodeURIComponent(workshopId)}`
    : "/workshops";
  const sessionFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    [],
  );

  usePageMetadata({
    title: workshop
      ? `${workshop.title} | Bethany Blooms Workshops`
      : "Workshop Details | Bethany Blooms",
    description:
      workshop?.description ??
      "Explore Bethany Blooms workshop details, what to expect, pricing, and policies before you reserve your seat.",
    canonicalPath: canonicalWorkshopPath,
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
            const customLabel =
              typeof entry.label === "string" ? entry.label.trim() : "";
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
              capacity:
                Number.isFinite(capacityNumber) && capacityNumber >= 0
                  ? capacityNumber
                  : null,
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
              timeRangeLabel: getSlotRangeLabel(
                formatTimeInput(fallbackDate),
                fallbackDate,
              ),
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

        const upcomingSession =
          normalizedSessions.find((session) => !session.isPast) ?? null;
        const fallbackSession = normalizedSessions[0] ?? null;
        const headlineSession = upcomingSession ?? fallbackSession;
        const storedScheduledLabel =
          typeof data.scheduledDateLabel === "string" &&
          data.scheduledDateLabel.trim()
            ? data.scheduledDateLabel.trim()
            : "";
        let scheduledDateLabel = storedScheduledLabel || "By request";
        if (headlineSession?.formatted) {
          scheduledDateLabel = headlineSession.formatted;
        }

        const primarySessionId =
          (typeof data.primarySessionId === "string" &&
            normalizedSessions.some(
              (session) => session.id === data.primarySessionId,
            ) &&
            data.primarySessionId) ||
          headlineSession?.id ||
          null;

        const priceNumber =
          typeof data.price === "number" ? data.price : Number(data.price);
        const unitPrice = Number.isFinite(priceNumber) ? priceNumber : null;
        const rawOptions = Array.isArray(data.options) ? data.options : [];
        const normalizedOptions = rawOptions
          .map((opt, index) => {
            const label = (opt?.label || "").toString().trim();
            const priceNum =
              typeof opt?.price === "number" ? opt.price : Number(opt?.price);
            if (!label || !Number.isFinite(priceNum) || priceNum <= 0)
              return null;
            return {
              id: (opt?.id || `option-${index}`).toString().trim(),
              label,
              price: priceNum,
            };
          })
          .filter(Boolean);

        setWorkshop({
          id: snapshot.id,
          ...data,
          scheduledDateLabel,
          sessions: normalizedSessions,
          primarySessionId,
          unitPrice,
          options: normalizedOptions,
        });
        setSelectedOptionId(
          normalizedOptions.length > 0 ? normalizedOptions[0].id : null,
        );
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

    const sessionList = Array.isArray(workshop.sessions)
      ? workshop.sessions.filter(isSessionInsideBookingWindow)
      : [];
    if (sessionList.length === 0) {
      setSelectedSessionId(null);
      setSelectedDay(null);
      return;
    }

    const hasActive = sessionList.some(
      (session) => !session.isPast && !isWorkshopSessionFull(session),
    );
    let nextSessionId = selectedSessionId;
    if (
      !nextSessionId ||
      !sessionList.some((session) => session.id === nextSessionId)
    ) {
      if (workshop.primarySessionId) {
        const primary =
          sessionList.find(
            (session) => session.id === workshop.primarySessionId,
          ) ?? null;
        if (
          primary &&
          ((!primary.isPast && !isWorkshopSessionFull(primary)) || !hasActive)
        ) {
          nextSessionId = primary.id;
        }
      }
      if (!nextSessionId) {
        const upcoming = sessionList.find(
          (session) => !session.isPast && !isWorkshopSessionFull(session),
        );
        nextSessionId = (upcoming ?? sessionList[0]).id;
      }
    }

    setSelectedSessionId(nextSessionId);
    setSelectedDay((prevDay) => {
      if (prevDay && sessionList.some((session) => session.date === prevDay)) {
        return prevDay;
      }
      const nextSession =
        sessionList.find((session) => session.id === nextSessionId) ??
        sessionList[0];
      return nextSession?.date ?? sessionList[0]?.date ?? null;
    });
  }, [selectedSessionId, workshop]);

  const sessions = useMemo(
    () => (Array.isArray(workshop?.sessions) ? workshop.sessions : []),
    [workshop],
  );
  const visibleSessions = useMemo(
    () => sessions.filter(isSessionInsideBookingWindow),
    [sessions],
  );
  const isByRequest = sessions.length === 0;
  const isFullyBooked = useMemo(() => {
    if (isByRequest) return false;
    const upcomingSessions = visibleSessions.filter(
      (session) => !session.isPast,
    );
    if (upcomingSessions.length === 0) return false;
    return upcomingSessions.every((session) => isWorkshopSessionFull(session));
  }, [isByRequest, visibleSessions]);

  const sessionDays = useMemo(() => {
    if (!visibleSessions.length) return [];
    const map = new Map();
    visibleSessions.forEach((session) => {
      const dateKey = session.date;
      if (!dateKey) return;
      if (!map.has(dateKey)) {
        const dateObject =
          session.startDate instanceof Date &&
          !Number.isNaN(session.startDate.getTime())
            ? session.startDate
            : combineDateAndTime(session.date, session.time);
        const label = dateObject
          ? sessionDayFormatter.format(dateObject)
          : dateKey;
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
      const aTime =
        a.sessions[0]?.startDate instanceof Date
          ? a.sessions[0].startDate.getTime()
          : Number.POSITIVE_INFINITY;
      const bTime =
        b.sessions[0]?.startDate instanceof Date
          ? b.sessions[0].startDate.getTime()
          : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });
    return grouped;
  }, [visibleSessions]);

  const selectedDayData =
    sessionDays.find((day) => day.date === selectedDay) ??
    sessionDays[0] ??
    null;
  const selectedDaySlots = useMemo(
    () => selectedDayData?.sessions ?? [],
    [selectedDayData],
  );
  const dayHasActiveSlots = selectedDaySlots.some(
    (slot) => !slot.isPast && !isWorkshopSessionFull(slot),
  );
  const selectedSession =
    visibleSessions.find((session) => session.id === selectedSessionId) ??
    selectedDaySlots[0] ??
    null;
  const selectedDayLabel = selectedDayData?.label ?? null;

  useEffect(() => {
    if (!selectedDayData) {
      setSelectedSessionId(null);
      return;
    }
    if (selectedSession && selectedSession.date === selectedDayData.date)
      return;
    if (selectedDaySlots.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    const firstAvailable =
      selectedDaySlots.find(
        (slot) => !slot.isPast && !isWorkshopSessionFull(slot),
      ) ?? selectedDaySlots[0];
    setSelectedSessionId(firstAvailable?.id ?? null);
  }, [selectedDayData, selectedDaySlots, selectedSession]);

  const selectedOption =
    (Array.isArray(workshop?.options) ? workshop.options : []).find(
      (option) => option.id === selectedOptionId,
    ) ?? (Array.isArray(workshop?.options) ? workshop.options[0] : null);

  const whenLabel = (() => {
    if (isByRequest) return "By request";
    const timeLabel =
      selectedSession?.timeRangeLabel ||
      selectedSession?.formatted ||
      workshop?.scheduledDateLabel;
    if (selectedDayLabel && timeLabel) {
      return timeLabel.includes(selectedDayLabel)
        ? timeLabel
        : `${selectedDayLabel} - ${timeLabel}`;
    }
    return timeLabel || "Date to be confirmed";
  })();

  const capacityText =
    !isByRequest && typeof selectedSession?.capacity === "number"
      ? selectedSession.capacity > 0
        ? `${selectedSession.capacity} seat${selectedSession.capacity === 1 ? "" : "s"} available`
        : "Fully booked"
      : null;

  const requestModeNote = `Choose any Monday to Saturday up to ${WORKSHOP_BOOKING_WINDOW_DAYS} days in advance. Available windows: ${WORKSHOP_REQUEST_WINDOWS.join(
    " or ",
  )}.`;

  const sections = [
    { key: "whatToExpect", title: "What to Expect" },
    { key: "bookingPricing", title: "Booking & Pricing" },
    { key: "goodToKnow", title: "Good to Know" },
    { key: "cancellations", title: "Cancellations & Policies" },
    { key: "groupsInfo", title: "Groups & Private Events" },
    { key: "careInfo", title: "Caring for Your Art" },
    { key: "whyPeopleLove", title: "Why People Love Our Workshops" },
  ];

  const locationLabel = workshop?.location || "Vereeniging Studio";
  const priceLabel = (() => {
    if (selectedOption) {
      return `${selectedOption.label} - R${selectedOption.price}`;
    }
    if (Array.isArray(workshop?.options) && workshop.options.length > 0) {
      const lowest = Math.min(
        ...workshop.options.map((option) => option.price),
      );
      return `From R${lowest}`;
    }
    if (workshop?.price) return `From R${workshop.price}`;
    return "Pricing shared below";
  })();

  const bookingSectionTitle = isByRequest
    ? "Request Your Workshop Date"
    : "Choose Your Session";
  const bookingSectionDescription = isByRequest
    ? "Pick your workshop option first. After that you can request your preferred date and start window in the booking form."
    : "Work through the session details below, choose the option that suits you, and then reserve your place.";
  const bookingButtonDisabled =
    !isByRequest &&
    (!selectedSession || isWorkshopSessionFull(selectedSession));
  const detailSections = sections.filter(({ key }) => Boolean(workshop?.[key]));
  const heroSummary =
    workshop?.description?.trim() ||
    "Choose your preferred workshop format, review the session details, and reserve your place below.";
  const summaryCopy =
    workshop?.ctaNote?.trim() ||
    (isByRequest
      ? "This workshop is booked by request. Choose your option, then submit the date and start window that suits you best."
      : "Use the booking planner to choose your date, time, and workshop option before reserving your place.");
  const heroImage = workshop?.image || heroBackground;
  const anyFutureSessionDay = sessionDays.some((entry) =>
    entry.sessions.some((slot) => !slot.isPast && !isWorkshopSessionFull(slot)),
  );
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      status !== "success" ||
      detailSections.length === 0
    ) {
      return undefined;
    }

    let frameId = null;
    const buildTrailMetrics = () => {
      const pathNode = infoTrailPathRef.current;
      if (!pathNode) return;
      const pathLength = pathNode.getTotalLength();
      const sampleCount = 220;
      const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
        const distance = (pathLength * index) / sampleCount;
        const point = pathNode.getPointAtLength(distance);
        return { distance, y: point.y };
      });

      infoTrailMetricsRef.current = { length: pathLength, samples };
    };

    const getDistanceForY = (targetY) => {
      const { length, samples } = infoTrailMetricsRef.current;
      if (!length || samples.length === 0) return 0;
      if (targetY <= 0) return 0;
      if (targetY >= 100) return length;

      let nearest = samples[0];
      let nearestDelta = Math.abs(samples[0].y - targetY);

      for (let index = 1; index < samples.length; index += 1) {
        const previous = samples[index - 1];
        const sample = samples[index];
        if (previous.y <= targetY && sample.y >= targetY) {
          const span = Math.max(0.001, sample.y - previous.y);
          const ratio = (targetY - previous.y) / span;
          return (
            previous.distance + (sample.distance - previous.distance) * ratio
          );
        }

        const delta = Math.abs(sample.y - targetY);
        if (delta < nearestDelta) {
          nearest = sample;
          nearestDelta = delta;
        }
      }

      return nearest.distance;
    };

    const updateTrailFlower = () => {
      frameId = null;
      const detailsNode = detailsSectionRef.current;
      const trailNode = infoTrailRef.current;
      const pathNode = infoTrailPathRef.current;
      if (!detailsNode || !trailNode || !pathNode) {
        return;
      }

      if (!infoTrailMetricsRef.current.length) {
        buildTrailMetrics();
      }

      const trailRect = trailNode.getBoundingClientRect();
      const viewportHeight =
        window.visualViewport?.height || window.innerHeight;
      const viewportAnchor =
        viewportHeight * (window.innerWidth <= 640 ? 0.58 : 0.6);
      const targetY = Math.min(
        100,
        Math.max(
          0,
          ((viewportAnchor - trailRect.top) / Math.max(1, trailRect.height)) *
            100,
        ),
      );
      const pathLength =
        infoTrailMetricsRef.current.length || pathNode.getTotalLength();
      const distance = getDistanceForY(targetY);
      const point = pathNode.getPointAtLength(distance);
      const previousPoint = pathNode.getPointAtLength(
        Math.max(0, distance - 1.8),
      );
      const nextPoint = pathNode.getPointAtLength(
        Math.min(pathLength, distance + 1.8),
      );
      const angle =
        Math.atan2(
          nextPoint.y - previousPoint.y,
          nextPoint.x - previousPoint.x,
        ) *
        (180 / Math.PI);
      const flowerX = (point.x / 100) * trailRect.width;
      const flowerY = (point.y / 100) * trailRect.height;

      trailNode.style.setProperty("--info-flower-x", `${flowerX.toFixed(2)}px`);
      trailNode.style.setProperty("--info-flower-y", `${flowerY.toFixed(2)}px`);
      trailNode.style.setProperty(
        "--info-flower-angle",
        `${(angle + 90).toFixed(2)}deg`,
      );
      trailNode.style.setProperty("--info-trail-length", pathLength.toFixed(2));
      trailNode.style.setProperty(
        "--info-trail-draw",
        Math.max(0.01, distance).toFixed(2),
      );
    };
    const requestUpdate = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(updateTrailFlower);
      }
    };
    const handleResize = () => {
      buildTrailMetrics();
      requestUpdate();
    };
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(handleResize)
        : null;

    buildTrailMetrics();
    updateTrailFlower();
    if (detailsSectionRef.current && resizeObserver) {
      resizeObserver.observe(detailsSectionRef.current);
    }
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, [detailSections.length, status]);

  const handleSelectDay = (date) => {
    setSelectedDay(date);
  };

  const handleSelectSlot = (sessionId) => {
    setSelectedSessionId(sessionId);
  };

  const handleScrollToBooking = () => {
    bookingSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleOpenBooking = () => {
    if (!workshop) return;
    const customerSeed =
      items.find((item) => item.metadata?.customer)?.metadata?.customer ?? null;
    const options = Array.isArray(workshop.options) ? workshop.options : [];
    const chosenOption =
      options.find((opt) => opt.id === selectedOptionId) ?? null;
    const bookingPayload = {
      type: "workshop",
      workshop,
      customer: customerSeed || undefined,
      selectedOption: chosenOption,
      optionId: chosenOption?.id || chosenOption?.value || "",
      optionValue: chosenOption?.id || chosenOption?.value || "",
      optionLabel: chosenOption?.label || chosenOption?.name || "",
      framePreference: chosenOption?.id || chosenOption?.value || "",
      sessionSource: isByRequest ? "customer-requested" : "admin-session",
      selectionConfirmed: !isByRequest && Boolean(selectedSession),
      optionConfirmed: Boolean(chosenOption),
    };
    if (!isByRequest && selectedSession) {
      bookingPayload.sessionId = selectedSession.id;
      bookingPayload.session = selectedSession;
      bookingPayload.date = selectedDay;
      bookingPayload.dayLabel = selectedDayLabel;
    }
    openBooking(bookingPayload);
  };

  if (status === "loading") {
    return null;
  }

  if (status === "error") {
    return (
      <section className="section section--tight">
        <div className="section__inner">
          <p className="empty-state">
            We couldn't load this workshop right now. {error}
          </p>
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
          <p className="empty-state">
            We couldn't find that workshop. It may have been updated or removed.
          </p>
          <Link className="btn btn--secondary" to="/workshops">
            Back to Workshops
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="section section--no-pad band--cream">
        <Hero
          variant="editorial-split"
          className="workshop-detail-hero"
          background={heroImage}
          media={
            <img
              className="workshop-detail-hero__image"
              src={heroImage}
              alt={`${workshop.title} workshop`}
              loading="eager"
              decoding="async"
            />
          }
          captionText={isByRequest ? "Workshop available by request." : null}
        >
          <span className="editorial-eyebrow">Workshops</span>
          <h1>{workshop.title}</h1>
          <p>{heroSummary}</p>
          <div className="workshop-detail-hero__facts">
            <div className="workshop-detail-hero__fact">
              <span className="workshop-detail-hero__fact-label">When</span>
              <span className="workshop-detail-hero__fact-value">
                {whenLabel}
              </span>
            </div>
            <div className="workshop-detail-hero__fact">
              <span className="workshop-detail-hero__fact-label">Where</span>
              <span className="workshop-detail-hero__fact-value">
                {locationLabel}
              </span>
            </div>
            <div className="workshop-detail-hero__fact">
              <span className="workshop-detail-hero__fact-label">Price</span>
              <span className="workshop-detail-hero__fact-value">
                {priceLabel}
              </span>
            </div>
          </div>
          <div className="cta-group">
            <button
              className="btn btn--primary"
              type="button"
              onClick={handleScrollToBooking}
            >
              Book Now
            </button>
            <Link className="btn btn--secondary" to="/workshops">
              Back to Workshops
            </Link>
          </div>
          <a
            className="workshop-detail-hero__scroll-invitation"
            href={
              detailSections.length > 0
                ? "#workshop-details-content"
                : "#workshop-booking"
            }
            aria-label="Continue down the workshop page"
          >
            <span
              className="workshop-scroll-invitation__chevron"
              aria-hidden="true"
            />
          </a>
        </Hero>
      </section>

      {detailSections.length > 0 && (
        <section
          className="section band--cream workshop-detail-content"
          id="workshop-details-content"
          ref={detailsSectionRef}
        >
          <div
            ref={infoTrailRef}
            className="workshop-info-trail"
            aria-hidden="true"
          >
            <svg
              className="workshop-info-trail__map"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              focusable="false"
            >
              <defs>
                <mask
                  id="workshop-info-trail-progress-mask"
                  maskUnits="userSpaceOnUse"
                >
                  <path
                    className="workshop-info-trail__reveal"
                    d="M50 0 C64 2 63 10 49 11 C35 12 40 2 53 5 C66 9 39 20 8 18 C-4 25 8 35 3 45 C-3 57 9 68 4 79 C0 89 8 96 4 100"
                  />
                </mask>
              </defs>
              <path
                ref={infoTrailPathRef}
                className="workshop-info-trail__path workshop-info-trail__path--base"
                d="M50 0 C64 2 63 10 49 11 C35 12 40 2 53 5 C66 9 39 20 8 18 C-4 25 8 35 3 45 C-3 57 9 68 4 79 C0 89 8 96 4 100"
              />
              <path
                className="workshop-info-trail__path workshop-info-trail__path--progress"
                d="M50 0 C64 2 63 10 49 11 C35 12 40 2 53 5 C66 9 39 20 8 18 C-4 25 8 35 3 45 C-3 57 9 68 4 79 C0 89 8 96 4 100"
                mask="url(#workshop-info-trail-progress-mask)"
              />
            </svg>
            <span className="workshop-info-trail__flower">
              <svg viewBox="0 0 32 32" focusable="false">
                <path
                  className="workshop-info-trail__stem"
                  d="M16 17 C16 22 16 25 16 30"
                />
                <path
                  className="workshop-info-trail__leaf"
                  d="M16 24 C21 20 25 21 26 25 C22 27 19 27 16 24"
                />
                <circle
                  className="workshop-bloom-trail__petal"
                  cx="16"
                  cy="8"
                  r="6"
                />
                <circle
                  className="workshop-bloom-trail__petal"
                  cx="23"
                  cy="13"
                  r="6"
                />
                <circle
                  className="workshop-bloom-trail__petal"
                  cx="20"
                  cy="22"
                  r="6"
                />
                <circle
                  className="workshop-bloom-trail__petal"
                  cx="12"
                  cy="22"
                  r="6"
                />
                <circle
                  className="workshop-bloom-trail__petal"
                  cx="9"
                  cy="13"
                  r="6"
                />
                <circle
                  className="workshop-bloom-trail__center"
                  cx="16"
                  cy="16"
                  r="5"
                />
              </svg>
            </span>
          </div>
          <div className="section__inner workshop-detail">
            <Reveal as="div" className="editorial-band editorial-band--center">
              <span className="editorial-eyebrow">Workshop Details</span>
              <h2>Everything You Need To Know</h2>
              <p>
                Review the experience, practical notes, and policies before you
                reserve your place.
              </p>
            </Reveal>

            {detailSections.map(({ key, title }, index) => (
              <Reveal
                as="article"
                className="detail-section"
                key={key}
                delay={index * 60}
              >
                <h2>{title}</h2>
                {renderRichText(workshop[key])}
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section
        className="section band--white"
        id="workshop-booking"
        ref={bookingSectionRef}
      >
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">
              {isByRequest ? "By Request" : "Booking Planner"}
            </span>
            <h2>{bookingSectionTitle}</h2>
            <p>{bookingSectionDescription}</p>
          </Reveal>

          <div className="workshop-booking-section workshop-planner">
            <Reveal as="aside" className="workshop-planner__summary">
              <span
                className={`badge ${isFullyBooked ? "badge--stock-out" : ""}`}
              >
                {isFullyBooked
                  ? "Fully booked"
                  : isByRequest
                    ? "By Request"
                    : "Reserve A Seat"}
              </span>
              <h3>{workshop.title}</h3>
              <p className="workshop-planner__summary-copy">{summaryCopy}</p>

              <div className="workshop-planner__meta">
                <div className="workshop-planner__meta-item">
                  <span>When</span>
                  <strong>{whenLabel}</strong>
                </div>
                <div className="workshop-planner__meta-item">
                  <span>Where</span>
                  <strong>{locationLabel}</strong>
                </div>
                <div className="workshop-planner__meta-item">
                  <span>Price</span>
                  <strong>{priceLabel}</strong>
                </div>
                {selectedOption && (
                  <div className="workshop-planner__meta-item">
                    <span>Selected Option</span>
                    <strong>{selectedOption.label}</strong>
                  </div>
                )}
              </div>

              {capacityText && (
                <p className="workshop-planner__note">{capacityText}</p>
              )}
              {isByRequest && (
                <p className="workshop-planner__note">{requestModeNote}</p>
              )}

              <button
                className="btn btn--primary"
                type="button"
                onClick={handleOpenBooking}
                disabled={bookingButtonDisabled}
              >
                Book Now
              </button>
            </Reveal>

            <div className="workshop-planner__selectors">
              {!isByRequest && sessionDays.length > 0 && (
                <Reveal as="div" className="session-picker" delay={120}>
                  <h3 className="session-picker__title">Choose Your Day</h3>
                  <p className="session-picker__note">
                    Pick from the next {WORKSHOP_BOOKING_WINDOW_DAYS} days, then
                    choose the time slot you want to attend.
                  </p>
                  <div className="session-picker__grid session-picker__grid--dates">
                    {sessionDays.map((day) => {
                      const isActive = day.date === selectedDay;
                      const allUnavailable = day.sessions.every(
                        (slot) => slot.isPast || isWorkshopSessionFull(slot),
                      );
                      return (
                        <label
                          key={day.date}
                          className={`session-day-chip ${isActive ? "session-day-chip--active" : ""} ${
                            allUnavailable ? "session-day-chip--disabled" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="workshop-day"
                            value={day.date}
                            checked={isActive}
                            onChange={() => handleSelectDay(day.date)}
                            disabled={allUnavailable && anyFutureSessionDay}
                          />
                          <span className="session-day-chip__label">
                            {day.label}
                          </span>
                          <span className="session-day-chip__meta">
                            {day.sessions.length} slot
                            {day.sessions.length === 1 ? "" : "s"} available
                          </span>
                          {allUnavailable && (
                            <span className="session-day-chip__meta session-day-chip__meta--warning">
                              {day.sessions.every((slot) =>
                                isWorkshopSessionFull(slot),
                              )
                                ? "Full"
                                : "Unavailable"}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </Reveal>
              )}

              {!isByRequest && selectedDaySlots.length > 0 && (
                <Reveal
                  as="div"
                  className="session-picker session-slot-picker"
                  delay={180}
                >
                  <h3 className="session-slot-picker__title">Pick A Time</h3>
                  <p className="session-slot-picker__note">
                    Morning sessions run 09:00 - 12:00 and afternoon sessions
                    run 13:00 - 16:00.
                  </p>
                  <div className="session-slot-picker__grid">
                    {selectedDaySlots.map((slot) => {
                      const full = isWorkshopSessionFull(slot);
                      const disabled =
                        full || (slot.isPast && dayHasActiveSlots);
                      return (
                        <label
                          key={slot.id}
                          className={`session-chip ${
                            selectedSessionId === slot.id
                              ? "session-chip--active"
                              : ""
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
                          <span className="session-chip__label">
                            {slot.timeRangeLabel || slot.formatted}
                          </span>
                          <span className="session-chip__meta">
                            {typeof slot.capacity === "number"
                              ? slot.capacity > 0
                                ? `${slot.capacity} seat${slot.capacity === 1 ? "" : "s"}`
                                : "Fully booked"
                              : "Open booking"}
                          </span>
                          {full && (
                            <span className="session-chip__meta session-chip__meta--warning">
                              Full
                            </span>
                          )}
                          {slot.isPast && (
                            <span className="session-chip__meta session-chip__meta--warning">
                              Past session
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </Reveal>
              )}

              {Array.isArray(workshop.options) &&
                workshop.options.length > 0 && (
                  <Reveal as="div" className="session-picker" delay={240}>
                    <h3 className="session-picker__title">
                      Choose Your Option
                    </h3>
                    <p className="session-picker__note">
                      Select the workshop format or package you want before
                      continuing to the reservation form.
                    </p>
                    <div className="session-slot-picker__grid">
                      {workshop.options.map((option) => (
                        <label
                          key={option.id}
                          className={`session-chip ${selectedOptionId === option.id ? "session-chip--active" : ""}`}
                        >
                          <input
                            type="radio"
                            name="workshop-option"
                            value={option.id}
                            checked={selectedOptionId === option.id}
                            onChange={() => setSelectedOptionId(option.id)}
                          />
                          <span className="session-chip__label">
                            {option.label}
                          </span>
                          <span className="session-chip__meta">
                            R{option.price}
                          </span>
                        </label>
                      ))}
                    </div>
                  </Reveal>
                )}

              {isByRequest && (
                <Reveal
                  as="div"
                  className="session-picker workshop-planner__request"
                  delay={120}
                >
                  <h3 className="session-picker__title">Booked By Request</h3>
                  <p className="session-picker__note">
                    No fixed public sessions are published for this workshop
                    yet. Use the reservation form to request a date and one of
                    the available start windows.
                  </p>
                  <p className="workshop-planner__note">{requestModeNote}</p>
                </Reveal>
              )}

              {!isByRequest &&
                sessionDays.length > 0 &&
                selectedDaySlots.length === 0 && (
                  <Reveal
                    as="p"
                    className="modal__meta session-picker__empty"
                    delay={180}
                  >
                    No time slots are currently open for the selected day.
                    Choose a different date to continue.
                  </Reveal>
                )}

              {!isByRequest &&
                sessions.length > 0 &&
                sessionDays.length === 0 && (
                  <Reveal
                    as="p"
                    className="modal__meta session-picker__empty"
                    delay={180}
                  >
                    No workshop dates are open in the next{" "}
                    {WORKSHOP_BOOKING_WINDOW_DAYS} days. Please check back soon.
                  </Reveal>
                )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default WorkshopDetailPage;
