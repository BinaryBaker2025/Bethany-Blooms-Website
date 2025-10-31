import { useEffect, useRef } from "react";

function Reveal({ as: Component = "div", className = "", children, delay = 0, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.transitionDelay = `${delay}ms`;

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      element.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Component ref={ref} className={`fade-in ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
}

export default Reveal;
