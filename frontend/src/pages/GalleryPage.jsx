import { useEffect, useState } from "react";
import Reveal from "../components/Reveal.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { CUT_FLOWER_PAGE_IMAGES } from "../lib/cutFlowerImages.js";
import { galleryItems } from "../data/gallery.js";

function GalleryPage() {
  usePageMetadata({
    title: "Bethany Blooms Gallery | Cut & Pressed Flower Showcase",
    description:
      "Browse the Bethany Blooms gallery for cut flower moments and pressed flower art created in-studio and on the farm.",
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
      {/* Page hero */}
      <section className="section--no-pad">
        <div className="page-hero">
          <img className="page-hero__bg" src={CUT_FLOWER_PAGE_IMAGES.galleryHero} alt="" aria-hidden="true" loading="eager" decoding="async" fetchpriority="high" />
          <div className="page-hero__overlay" aria-hidden="true" />
          <div className="page-hero__content">
            <span className="editorial-eyebrow">Bethany Blooms</span>
            <h1>Gallery of Blooming Stories</h1>
            <p>Pressed flower keepsakes and cut flower moments from the farm and studio.</p>
          </div>
        </div>
      </section>

      {/* Editorial gallery grid */}
      <section className="section band--white" id="gallery-grid">
        <div className="section__inner">
          <div className="gallery editorial-gallery-grid">
            {galleryItems.map((item, index) => (
              <Reveal key={item.id} as="div" className="gallery__item" delay={index * 40}>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="gallery__button"
                  aria-label={`Open ${item.caption}`}
                >
                  <img src={item.src} alt={item.alt} loading="lazy" decoding="async" />
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
            <img className="lightbox__image" src={selected.src} alt={selected.alt} loading="lazy" decoding="async"/>
          </div>
        )}
      </div>
    </>
  );
}

export default GalleryPage;
