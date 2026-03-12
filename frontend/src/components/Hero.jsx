import Reveal from "./Reveal.jsx";

function Hero({ variant = "home", background, children, media, captionText, className = "" }) {
  const heroClassName = ["hero", `hero--${variant}`, className].filter(Boolean).join(" ");

  return (
    <Reveal as="div" className={heroClassName}>
      <div
        className="hero__bg parallax"
        aria-hidden="true"
        style={{ backgroundImage: background ? `url(${background})` : undefined }}
      />
      <div className="hero__content">{children}</div>
      {media && (
        <div className="hero__media">
          {media}
          {captionText && (
            <p className="editorial-caption" aria-hidden="true">{captionText}</p>
          )}
        </div>
      )}
    </Reveal>
  );
}

export default Hero;
