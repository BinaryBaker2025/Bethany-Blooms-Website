import { useEffect, useState } from "react";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import heroBackground from "../assets/hero-flowers.svg";
import { galleryItems } from "../data/gallery.js";

function GalleryPage() {
  usePageMetadata({
    title: "Bethany Blooms Gallery | Pressed Flower Art Showcase",
    description: "Browse the Bethany Blooms gallery for pressed flower art created by workshop guests and clients.",
  });

  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelected(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero variant="gallery" background={heroBackground}>
            <h1>Gallery of Blooming Stories</h1>
            <p>
              Discover frames crafted by our workshop guests and custom commission clients. From weddings and birthdays
              to everyday gratitude, each piece carries a story.
            </p>
          </Hero>
        </div>
      </section>

      <section className="section" id="gallery-grid">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Community Creations</span>
            <h2>Pressed Florals by You</h2>
            <p>Select an artwork to view larger in the lightbox.</p>
          </Reveal>
          <div className="gallery">
            {galleryItems.map((item, index) => (
              <Reveal key={item.id} as="div" className="gallery__item" delay={index * 60}>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="gallery__button"
                  aria-label={`Open ${item.caption}`}
                >
                  <img src={item.src} alt={item.alt} />
                  <div className="gallery__overlay" aria-hidden="true" />
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div
        className={`lightbox ${selected ? "is-active" : ""}`}
        role="dialog"
        aria-hidden={selected ? "false" : "true"}
        aria-modal="true"
        aria-label="Image preview"
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelected(null);
        }}
      >
        {selected && (
          <div className="lightbox__content">
            <button
              className="lightbox__close"
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close preview"
            >
              &times;
            </button>
            <img className="lightbox__image" src={selected.src} alt={selected.alt} />
          </div>
        )}
      </div>
    </>
  );
}

export default GalleryPage;
