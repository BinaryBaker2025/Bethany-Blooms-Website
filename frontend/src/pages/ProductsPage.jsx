import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/photos/workshop-frame-purple.jpg";

function ProductsPage() {
  usePageMetadata({
    title: "Bethany Blooms Products | Pressed Floral Gifting & Decor",
    description:
      "Shop curated pressed flower products, bespoke arrangements, and keepsakes handcrafted in the Bethany Blooms studio.",
  });

  const { addItem } = useCart();
  const { openCart } = useModal();
  const { items: remoteProducts, status } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const liveProducts = remoteProducts.filter((product) => (product.status ?? "live") === "live");

  const normalizedProducts = liveProducts.map((product, index) => {
    const priceNumber = typeof product.price === "number" ? product.price : Number(product.price);
    const isPurchasable = product.category === "kit" && Number.isFinite(priceNumber);
    return {
      ...product,
      id: product.id || `product-${index}`,
      title: product.title || product.name || "Bethany Blooms Product",
      name: product.name || product.title || "Bethany Blooms Product",
      description: product.description || "Details coming soon.",
      displayPrice: Number.isFinite(priceNumber) ? `R${priceNumber}` : product.price ?? "Price on request",
      numericPrice: Number.isFinite(priceNumber) ? priceNumber : null,
      image: product.image || heroBackground,
      category: product.category || "product",
      isPurchasable,
    };
  });

  const heroImage = normalizedProducts[0]?.image || heroBackground;

  const handleAddToCart = (product) => {
    if (!product.isPurchasable || !product.numericPrice) {
      alert("This product is not available for direct purchase online yet. Please enquire for pricing.");
      return;
    }
    addItem({
      id: product.id,
      name: product.name,
      price: product.numericPrice,
      itemType: "product",
    });
    openCart();
  };

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero
            variant="kits"
            background={heroBackground}
            media={<img src={heroImage} alt="Bethany Blooms pressed flower products" />}
          >
            <h1>Pressed Floral Products</h1>
            <p>
              Bring the studio experience home. Explore framed pressed art, gifting collections, ready-to-style blooms,
              and premium DIY options handcrafted by Bethany Blooms.
            </p>
            <div className="cta-group">
              <a href="#product-collection" className="btn btn--secondary">
                Browse Collection
              </a>
              <button className="btn btn--primary" type="button" onClick={openCart}>
                View Cart
              </button>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section" id="product-collection">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Curated by Bethany Blooms</span>
            <h2>The Studio Collection</h2>
            <p>Discover limited releases, seasonal blooms, and bespoke keepsakes designed to celebrate meaningful moments.</p>
          </Reveal>
          <div className="kits-grid">
            {normalizedProducts.map((product, index) => (
              <Reveal as="article" className="kit-card" key={product.id} delay={index * 90}>
                <div className="kit-card__image">
                  <img src={product.image} alt={`${product.title} pressed flower product`} />
                </div>
                <div className="kit-card__body">
                  <span className="badge">{product.category.replace(/-/g, " ")}</span>
                  <h3 className="kit-card__title">{product.title}</h3>
                  <p>{product.description}</p>
                  <p className="kit-card__price">{product.displayPrice}</p>
                  <div className="kit-card__actions">
                    {product.isPurchasable ? (
                      <button className="btn" type="button" onClick={() => handleAddToCart(product)}>
                        Add to Cart
                      </button>
                    ) : (
                      <a className="btn" href="/contact">
                        Enquire
                      </a>
                    )}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          {normalizedProducts.length === 0 && status !== "loading" && (
            <p className="empty-state">No products available yet. Create one from the admin dashboard.</p>
          )}
          {status === "loading" && <p className="empty-state">Loading products…</p>}
          {status === "empty" && <p className="empty-state">No products available yet. Check back soon!</p>}
          {status === "error" && (
            <p className="empty-state">We couldn’t load products from the server. Please refresh to try again.</p>
          )}
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Thoughtfully Made</span>
            <h2>What You’ll Find</h2>
          </Reveal>
          <div className="cards-grid">
            <Reveal as="article" className="card">
              <h3 className="card__title">Pressed Floral Artworks</h3>
              <p>Seasonally curated blooms preserved behind glass to honour treasured moments.</p>
            </Reveal>
            <Reveal as="article" className="card" delay={120}>
              <h3 className="card__title">Customisable Keepsakes</h3>
              <p>From bespoke commissions to meaningful gifts, each piece is created with intention.</p>
            </Reveal>
            <Reveal as="article" className="card" delay={240}>
              <h3 className="card__title">Ready-to-Arrange Blooms</h3>
              <p>Fresh and dried florals styled to elevate events, devotional spaces, and gifting.</p>
            </Reveal>
            <Reveal as="article" className="card" delay={360}>
              <h3 className="card__title">DIY Creativity</h3>
              <p>Beautifully curated kits with scripture reflections, guidance, and thoughtful tools.</p>
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
              Start with a fresh arrangement, then preserve your favourite stems in a bespoke artwork or DIY creation.
              We’re here for every step—concept, styling, and keepsake.
            </p>
            <div className="cta-group">
              <a className="btn btn--primary" href="/workshops">
                Join a Workshop
              </a>
              <a className="btn btn--secondary" href="/contact">
                Start a Bespoke Project
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export default ProductsPage;
