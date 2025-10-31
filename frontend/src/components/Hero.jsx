import Reveal from "./Reveal.jsx";

function Hero({ variant = "home", background, children, media }) {
  return (
    <Reveal as="div" className={`hero hero--${variant}`}>
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
