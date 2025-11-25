import Reveal from "./Reveal.jsx";

function Hero({ variant = "home", background, children, media, className = "" }) {
  const heroClassName = ["hero", `hero--${variant}`, className].filter(Boolean).join(" ");

  return (
    <Reveal as="div" className={heroClassName}>
      <div className="hero__bg parallax" aria-hidden="true" style={{ backgroundImage: `url(${background})` }} />
      <div className="hero__content">{children}</div>
      {media && (
        <Reveal as="div" className="hero__media" delay={120}>
          {media}
        </Reveal>
      )}
    </Reveal>
  );
}

export default Hero;
