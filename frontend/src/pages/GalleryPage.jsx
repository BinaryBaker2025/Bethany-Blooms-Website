import { useEffect, useState } from "react";
import Hero from "../components/Hero.jsx";
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
      <section className="section section--tight">
        <div className="section__inner">
          <Hero variant="gallery" background={CUT_FLOWER_PAGE_IMAGES.galleryHero}>
            <h1>Gallery of Blooming Stories</h1>
            <p>
              Explore both pressed flower keepsakes and cut flower moments from the farm. From workshops and custom
              commissions to fresh seasonal blooms, each image carries a story.
            </p>
          </Hero>
        </div>
      </section>

      <section className="section" id="gallery-grid">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Community Creations</span>
            <h2>Cut Flowers & Pressed Florals</h2>
            <p>Select an image to view it larger in the lightbox.</p>
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
                  <img src={item.src} alt={item.alt} loading="lazy" decoding="async"/>
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
