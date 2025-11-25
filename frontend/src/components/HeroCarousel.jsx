import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Hero from "./Hero.jsx";

const AUTO_ADVANCE_INTERVAL = 6500;

function HeroCarousel({ slides = [], autoAdvanceMs = AUTO_ADVANCE_INTERVAL }) {
  const preparedSlides = useMemo(() => {
    return slides
      .filter(Boolean)
      .map((slide, index) => {
        const fallbackTitle = slide.title ?? slide.heading ?? "Bethany Blooms";
        const primaryCta =
          slide.primaryCta && slide.primaryCta.href
            ? {
                variant: slide.primaryCta.variant ?? "primary",
                label: slide.primaryCta.label ?? "Learn more",
                href: slide.primaryCta.href,
              }
            : null;
        const secondaryCta =
          slide.secondaryCta && slide.secondaryCta.href
            ? {
                variant: slide.secondaryCta.variant ?? "secondary",
                label: slide.secondaryCta.label ?? "Learn more",
                href: slide.secondaryCta.href,
              }
            : null;

        const mediaNode =
          slide.media ??
          (slide.mediaImage ? (
            <img src={slide.mediaImage} alt={slide.mediaAlt ?? fallbackTitle} loading="lazy" />
          ) : null);

        return {
          id: slide.id ?? `hero-carousel-slide-${index}`,
          variant: slide.variant ?? "home",
          badge: slide.badge ?? slide.kicker ?? null,
          title: fallbackTitle,
          description: slide.description ?? "",
          background: slide.background ?? "",
          mediaNode,
          primaryCta,
          secondaryCta,
        };
      });
  }, [slides]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (preparedSlides.length <= 1) {
      return undefined;
    }

    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % preparedSlides.length);
    }, autoAdvanceMs);

    return () => clearInterval(timer);
  }, [autoAdvanceMs, preparedSlides.length]);

  useEffect(() => {
    if (preparedSlides.length === 0) {
      return;
    }

    if (activeIndex >= preparedSlides.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, preparedSlides.length]);

  if (preparedSlides.length === 0) {
    return null;
  }

  return (
    <div
      className="hero-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Bethany Blooms featured offerings"
    >
      {preparedSlides.map((slide, index) => (
        <div
          key={slide.id}
          id={slide.id}
          className={`hero-carousel__item${index === activeIndex ? " is-active" : ""}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${preparedSlides.length}`}
        >
          <Hero
            variant={slide.variant}
            background={slide.background}
            media={slide.mediaNode}
            className="hero-carousel__hero"
          >
            {slide.badge && <span className="badge">{slide.badge}</span>}
            <h1>{slide.title}</h1>
            {slide.description && <p>{slide.description}</p>}
            {(slide.primaryCta || slide.secondaryCta) && (
              <div className="cta-group">
                {slide.primaryCta && (
                  <Link className={`btn btn--${slide.primaryCta.variant}`} to={slide.primaryCta.href}>
                    {slide.primaryCta.label}
                  </Link>
                )}
                {slide.secondaryCta && (
                  <Link className={`btn btn--${slide.secondaryCta.variant}`} to={slide.secondaryCta.href}>
                    {slide.secondaryCta.label}
                  </Link>
                )}
              </div>
            )}
          </Hero>
        </div>
      ))}
      <div className="hero-carousel__controls" role="tablist" aria-label="Choose an offering">
        {preparedSlides.map((slide, index) => (
          <button
            key={`${slide.id}-control`}
            type="button"
            className={`hero-carousel__control${index === activeIndex ? " is-active" : ""}`}
            role="tab"
            aria-selected={index === activeIndex}
            aria-controls={slide.id}
            onClick={() => setActiveIndex(index)}
          >
            <span className="sr-only">{slide.title ?? `Slide ${index + 1}`}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default HeroCarousel;
