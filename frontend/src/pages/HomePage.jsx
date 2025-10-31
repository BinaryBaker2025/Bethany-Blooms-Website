import { Link } from "react-router-dom";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import TestimonialCarousel from "../components/TestimonialCarousel.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/hero-flowers.svg";
import kitBlue from "../assets/kit-blue.svg";
import { testimonials } from "../data/testimonials.js";

function HomePage() {
  usePageMetadata({
    title: "Bethany Blooms | Pressed Flower Art, Made Beautifully Simple",
    description:
      "Bethany Blooms offers artisanal pressed flower workshops, DIY kits, and custom floral art from Vereeniging, South Africa.",
  });

  const { addItem } = useCart();
  const { openCart } = useModal();

  const {
    items: remoteProducts,
    status: productsStatus,
    isFallback: productsFallback,
  } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const products = remoteProducts;

  const kits = products.filter((item) => (item.category ?? "kit") === "kit");

  const normalizedKits = kits.map((kit) => {
    const priceNumber = typeof kit.price === "number" ? kit.price : Number(kit.price);
    return {
      ...kit,
      title: kit.title || kit.name || "Bethany Blooms Kit",
      name: kit.name || kit.title || "Bethany Blooms Kit",
      price: Number.isFinite(priceNumber) ? priceNumber : 0,
      displayPrice: Number.isFinite(priceNumber) ? `R${priceNumber}` : kit.price ?? "Price on request",
      image: kit.image || kitBlue,
    };
  });

  const cutFlowers = products.filter((item) => (item.category ?? "cut-flower") === "cut-flower");
  const normalizedCutFlowers = cutFlowers.map((item) => {
    const priceNumber = typeof item.price === "number" ? item.price : Number(item.price);
    return {
      ...item,
      name: item.name || "Bethany Blooms Offering",
      description: item.description || "Details coming soon.",
      priceDisplay: Number.isFinite(priceNumber) ? `R${priceNumber}` : item.price ?? "Price on request",
    };
  });

  const heroKitImage = normalizedKits[0]?.image || kitBlue;

  const handleAddToCart = (kit) => {
    if (kit.price <= 0) {
      alert("This kit does not have a valid price yet. Please check back soon.");
      return;
    }
    addItem({ id: kit.id, name: kit.name, price: kit.price });
    openCart();
  };

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero
            variant="home"
            background={heroBackground}
            media={<img src={heroKitImage} alt="Pressed flower artwork in soft yellow and white tones" />}
          >
            <h1>Pressed Flower Art, Made Beautifully Simple 🌸</h1>
            <p>
              Discover the joy of preserving blooms with crafted workshops, ready-to-create DIY kits, bespoke floral
              keepsakes, and fresh cut stems gathered weekly from the Bethany Blooms garden.
            </p>
            <div className="cta-group">
              <Reveal as="div">
                <Link to="/workshops" className="btn btn--primary">
                  Book a Workshop
                </Link>
              </Reveal>
              <Reveal as="div" delay={120}>
                <Link to="/kits" className="btn btn--secondary">
                  Shop DIY Kits
                </Link>
              </Reveal>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Fresh Cut Blooms</span>
            <h2>The Flower Bar</h2>
            <p>
              Choose from weekly bouquets, market buckets, or event-ready collections—perfect for gifting or styling
              your own tablescapes.
            </p>
          </Reveal>
          <div className="cards-grid">
            {normalizedCutFlowers.slice(0, 3).map((item, index) => (
              <Reveal as="article" className="card" key={item.id} delay={index * 110}>
                <h3 className="card__title">{item.name}</h3>
                <p>{item.description}</p>
                <p className="card__price">{item.priceDisplay}</p>
                <div className="card__actions">
                  <a className="btn btn--secondary" href="/cut-flowers">
                    Learn More
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
          {normalizedCutFlowers.length === 0 && productsStatus !== "loading" && (
            <p className="empty-state">No fresh offerings available yet. Check back soon.</p>
          )}
          {productsStatus === "loading" && <p className="empty-state">Loading fresh selections…</p>}
          {productsStatus === "empty" && <p className="empty-state">No fresh offerings yet—check back soon.</p>}
          {productsStatus === "error" && (
            <p className="empty-state">We couldn’t load the flower bar offerings. Showing placeholder content.</p>
          )}
          {productsFallback && productsStatus !== "loading" && (
            <p className="empty-state">Showing placeholder offerings while we sync with the studio.</p>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Hand-Curated Kits</span>
            <h2>Featured DIY Flower Kits</h2>
            <p>
              Each kit includes a carefully chosen colour palette, pressed florals, glass frame, backing board, and
              easy-to-follow instructions.
            </p>
          </Reveal>
          <div className="cards-grid">
            {normalizedKits.map((kit, index) => (
              <Reveal as="article" className="card" key={kit.id} delay={index * 90}>
                <img src={kit.image} alt={`${kit.title} pressed flower kit`} />
                <h3 className="card__title">{kit.title}</h3>
                <p className="card__price">{kit.displayPrice}</p>
                <p>{kit.description}</p>
                <div className="card__actions">
                  <button className="btn btn--primary" type="button" onClick={() => handleAddToCart(kit)}>
                    Add to Cart
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
          {normalizedKits.length === 0 && productsStatus !== "loading" && (
            <p className="empty-state">No kits are available just yet.</p>
          )}
          {productsStatus === "loading" && <p className="empty-state">Loading featured kits…</p>}
          {productsStatus === "empty" && <p className="empty-state">No kits are available just yet.</p>}
          {productsStatus === "error" && (
            <p className="empty-state">We couldn’t load kits from the server. Showing sample data for now.</p>
          )}
          {productsFallback && productsStatus !== "loading" && (
            <p className="empty-state">Showing placeholder kits until live data syncs.</p>
          )}
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner" data-testimonials="">
          <Reveal as="div">
            <span className="badge">Kind Words</span>
            <h2>Testimonials</h2>
          </Reveal>
          <TestimonialCarousel testimonials={testimonials} />
        </div>
      </section>
    </>
  );
}

export default HomePage;
