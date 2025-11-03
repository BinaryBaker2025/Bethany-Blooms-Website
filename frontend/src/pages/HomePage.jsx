import { Link } from "react-router-dom";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import TestimonialCarousel from "../components/TestimonialCarousel.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/hero-flowers.svg";
import { testimonials } from "../data/testimonials.js";

function HomePage() {
  usePageMetadata({
    title: "Bethany Blooms | Pressed Flower Art, Made Beautifully Simple",
    description:
      "Bethany Blooms offers artisanal pressed flower workshops, DIY kits, and custom floral art from Vereeniging, South Africa.",
  });

  const { addItem } = useCart();
  const { openCart } = useModal();

  const { items: remoteProducts, status: productsStatus } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const products = remoteProducts;

  const normalizedProducts = products.map((product, index) => {
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
      category: product.category || "product",
      image: product.image || heroBackground,
      isPurchasable,
    };
  });

  const featuredProducts = normalizedProducts.slice(0, 4);

  const heroProductImage = featuredProducts[0]?.image || heroBackground;

  const handleAddToCart = (product) => {
    if (!product.isPurchasable || !product.numericPrice) {
      alert("This product does not have a valid online price yet. Please enquire for availability.");
      return;
    }
    addItem({ id: product.id, name: product.name, price: product.numericPrice });
    openCart();
  };

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero
            variant="home"
            background={heroBackground}
            media={<img src={heroProductImage} alt="Pressed flower artwork from Bethany Blooms" />}
          >
            <h1>Pressed Flower Art & Workshops, Made Simple 🌸</h1>
            <p>
              Discover the joy of preserving blooms with crafted workshops, ready-to-style floral products, bespoke art
              pieces, and thoughtful gifting collections from the Bethany Blooms studio.
            </p>
            <div className="cta-group">
              <Reveal as="div">
                <Link to="/workshops" className="btn btn--primary">
                  Book a Workshop
                </Link>
              </Reveal>
              <Reveal as="div" delay={120}>
                <Link to="/products" className="btn btn--secondary">
                  Explore Products
                </Link>
              </Reveal>
            </div>
          </Hero>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Featured Collection</span>
            <h2>Products from the Studio</h2>
            <p>
              Curated pieces crafted for gifting, styling, and preserving your favourite floral moments. Browse a blend
              of ready-to-enjoy arrangements, pressed art keepsakes, and bespoke kits.
            </p>
          </Reveal>
          <div className="cards-grid">
            {featuredProducts.map((product, index) => (
              <Reveal as="article" className="card" key={product.id} delay={index * 110}>
                <img src={product.image} alt={`${product.title} product from Bethany Blooms`} />
                <h3 className="card__title">{product.title}</h3>
                <p className="card__price">{product.displayPrice}</p>
                <p>{product.description}</p>
                <p className="modal__meta">Category: {product.category.replace(/-/g, " ")}</p>
                <div className="card__actions">
                  {product.isPurchasable ? (
                    <button className="btn btn--primary" type="button" onClick={() => handleAddToCart(product)}>
                      Add to Cart
                    </button>
                  ) : (
                    <Link className="btn btn--secondary" to="/contact">
                      Enquire
                    </Link>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
          {normalizedProducts.length === 0 && productsStatus !== "loading" && (
            <p className="empty-state">No products are available just yet.</p>
          )}
          {productsStatus === "loading" && <p className="empty-state">Loading featured products…</p>}
          {productsStatus === "empty" && <p className="empty-state">No products are available just yet.</p>}
          {productsStatus === "error" && (
            <p className="empty-state">We couldn’t load products from the server. Please refresh to try again.</p>
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
