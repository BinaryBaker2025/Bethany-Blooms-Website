import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/hero-flowers.svg";
import kitBlue from "../assets/kit-blue.svg";

function KitsPage() {
  usePageMetadata({
    title: "Bethany Blooms DIY Kits | Pressed Flower Creativity at Home",
    description:
      "Order Bethany Blooms DIY pressed flower kits with curated colour palettes, quality frames, and step-by-step guides.",
  });

  const { addItem } = useCart();
  const { openCart } = useModal();
  const {
    items: remoteProducts,
    status,
    isFallback,
  } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const kits = remoteProducts.filter((item) => (item.category ?? "kit") === "kit");

  const normalizedKits = kits.map((kit) => {
    const priceNumber = typeof kit.price === "number" ? kit.price : Number(kit.price);
    return {
      ...kit,
      title: kit.title || kit.name || "Bethany Blooms Kit",
      name: kit.name || kit.title || "Bethany Blooms Kit",
      price: Number.isFinite(priceNumber) ? priceNumber : 0,
      displayPrice: Number.isFinite(priceNumber) ? `R${priceNumber}` : kit.price ?? "Price on request",
      image: kit.image || kitBlue,
      category: kit.category || "kit",
    };
  });

  const heroImage = normalizedKits[0]?.image || kitBlue;

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
            variant="kits"
            background={heroBackground}
            media={<img src={heroImage} alt="Pressed flower kit laid out for crafting" />}
          >
            <h1>DIY Pressed Flower Kits</h1>
            <p>
              Bring the studio experience home. Each Bethany Blooms kit includes thoughtfully pressed florals, archival
              frames, a guide filled with scripture-inspired reflections, and pairing notes for fresh blooms from our cut
              flower bar.
            </p>
            <div className="cta-group">
              <a href="#kit-collection" className="btn btn--secondary">
                Explore Kits
              </a>
              <button className="btn btn--primary" type="button" onClick={openCart}>
                View Cart
              </button>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section" id="kit-collection">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Curated Colour Stories</span>
            <h2>The Signature Collection</h2>
            <p>
              Designed for beginners and experienced makers alike. Add multiple kits to your cart to gift or create
              together.
            </p>
          </Reveal>
          <div className="kits-grid">
            {normalizedKits.map((kit, index) => (
              <Reveal as="article" className="kit-card" key={kit.id} delay={index * 90}>
                <div className="kit-card__image">
                  <img src={kit.image} alt={`${kit.title} pressed flower kit contents`} />
                </div>
                <div className="kit-card__body">
                  <h3 className="kit-card__title">{kit.title}</h3>
                  <p>{kit.description}</p>
                  <p className="kit-card__price">{kit.displayPrice}</p>
                  <div className="kit-card__actions">
                    <button className="btn" type="button" onClick={() => handleAddToCart(kit)}>
                      Add to Cart
                    </button>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          {normalizedKits.length === 0 && status !== "loading" && (
            <p className="empty-state">No kits available yet. Create one from the admin dashboard.</p>
          )}
          {status === "loading" && <p className="empty-state">Loading kits…</p>}
          {status === "empty" && <p className="empty-state">No kits available yet. Check back soon!</p>}
          {status === "error" && (
            <p className="empty-state">We couldn’t load kits from the server. Showing sample data if available.</p>
          )}
          {isFallback && normalizedKits.length > 0 && status !== "loading" && (
            <p className="empty-state">Showing locally seeded kits while we fetch the live collection.</p>
          )}
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">In Every Box</span>
            <h2>What’s Included</h2>
          </Reveal>
          <div className="cards-grid">
            <Reveal as="article" className="card">
              <h3 className="card__title">Pressed Floral Selection</h3>
              <p>Seasonally curated blooms, sealed and ready for arranging.</p>
            </Reveal>
            <Reveal as="article" className="card" delay={120}>
              <h3 className="card__title">Glass &amp; Metal Frame</h3>
              <p>Archival-quality hardware in your colour palette.</p>
            </Reveal>
            <Reveal as="article" className="card" delay={240}>
              <h3 className="card__title">Linen Backing Board</h3>
              <p>Neutral linen to keep the focus on your botanical story.</p>
            </Reveal>
            <Reveal as="article" className="card" delay={360}>
              <h3 className="card__title">Guided Instruction Booklet</h3>
              <p>Step-by-step process, scripture reflections, and care tips.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Style the Moment</span>
            <h2>From Fresh Stem to Framed Heirloom</h2>
            <p>
              Start with a cut flower arrangement for your tablescape, then press your favourite stems with one of our
              kits to create a lasting keepsake. We’re here for every step.
            </p>
            <div className="cta-group">
              <a className="btn btn--secondary" href="/cut-flowers">
                Browse Cut Flowers
              </a>
              <a className="btn btn--primary" href="/workshops">
                Join a Workshop
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export default KitsPage;
