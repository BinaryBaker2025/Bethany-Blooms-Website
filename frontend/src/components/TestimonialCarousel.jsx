import { useEffect, useState } from "react";
import Reveal from "./Reveal.jsx";

function TestimonialCarousel({ testimonials }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % testimonials.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [testimonials.length]);

  return (
    <div className="testimonials">
      {testimonials.map((testimonial, idx) => (
        <Reveal
          key={testimonial.author}
          as="figure"
          className={`testimonial ${idx === index ? "is-active" : ""}`}
        >
          <blockquote className="testimonial__quote">“{testimonial.quote}”</blockquote>
          <figcaption className="testimonial__name">{testimonial.author}</figcaption>
        </Reveal>
      ))}
      <div className="testimonial__controls">
        {testimonials.map((testimonial, idx) => (
          <button
            key={testimonial.author}
            type="button"
            className="dot"
            aria-label={`Show testimonial ${idx + 1}`}
            aria-pressed={idx === index}
            onClick={() => setIndex(idx)}
          />
        ))}
      </div>
    </div>
  );
}

export default TestimonialCarousel;
