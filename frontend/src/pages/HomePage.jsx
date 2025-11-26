import { Link } from "react-router-dom";
import { useMemo } from "react";
import Reveal from "../components/Reveal.jsx";
import TestimonialCarousel from "../components/TestimonialCarousel.jsx";
import HeroCarousel from "../components/HeroCarousel.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/photos/workshop-banner.jpg";
import homePhotoOne from "../assets/photos/workshop-frame-hand-pink.jpeg";
import homePhotoTwo from "../assets/photos/workshop-frame-hand-neutral.jpeg";
import homePhotoThree from "../assets/photos/workshop-flowers-trays.jpg";
import homePhotoFour from "../assets/photos/workshop-table-long.jpg";
import workshopOutdoorVenue from "../assets/photos/workshop-outdoor-venue.jpg";
import workshopGuestsSmiling from "../assets/photos/workshop-guests-smiling.jpg";
import workshopTableLongClose from "../assets/photos/workshop-table-long-close.jpg";
import workshopTableDetailsOne from "../assets/photos/workshop-table-details-1.png";
import { testimonials } from "../data/testimonials.js";

const FALLBACK_PRODUCTS = [
  {
    id: "fallback-kit-yellow",
    title: "Pressed Flower Kit",
    description: "Create your own pressed bloom frame with curated seasonal stems.",
    price: 400,
    category: "kit",
    image: homePhotoOne,
    status: "live",
  },
  {
    id: "fallback-market-bucket",
    title: "Market Bucket",
    description: "Fresh stems in coordinating palettes, ready for styling or gifting.",
    price: "From R600",
    category: "cut-flower",
    image: workshopOutdoorVenue,
    status: "live",
  },
  {
    id: "fallback-bouquet",
    title: "Seasonal Bouquet",
    description: "Hand-tied bouquet featuring the best blooms of the week.",
    price: "From R350",
    category: "cut-flower",
    image: homePhotoTwo,
    status: "live",
  },
  {
    id: "fallback-frame",
    title: "Framed Bloom Art",
    description: "Pressed flower artwork crafted in-studio for thoughtful gifting.",
    price: "On request",
    category: "products",
    image: homePhotoThree,
    status: "live",
  },
];

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
    fallback: FALLBACK_PRODUCTS,
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
      category: product.category || "product",
      image: product.image || heroBackground,
      isPurchasable,
    };
  });

  const featuredProducts = normalizedProducts.filter((product) => product.featured).slice(0, 4);
  const displayProducts =
    featuredProducts.length > 0 ? featuredProducts : normalizedProducts.slice(0, 4);

  const heroSlides = useMemo(
    () => [
      {
        id: "hero-pressed-flowers",
        variant: "pressed",
        badge: "Pressed Flowers",
        title: "Pressed Flower Art & Workshops, Made Simple 🌸",
        description:
          "Discover the joy of preserving blooms with crafted workshops, ready-to-style floral products, bespoke art pieces, and thoughtful gifting collections from the Bethany Blooms studio.",
        background: heroBackground,
        mediaImage: homePhotoFour,
        mediaAlt: "Bethany Blooms workshop experience",
        primaryCta: { label: "Book a Workshop", href: "/workshops", variant: "primary" },
        secondaryCta: { label: "Explore Products", href: "/products", variant: "secondary" },
      },
      {
        id: "hero-cut-flowers",
        variant: "cut",
        badge: "Cut Flowers",
        title: "Cut Flowers Styled For Celebrations",
        description:
          "Order lush seasonal arrangements, event styling, and on-site florals designed to suit intimate gatherings, editorials, or heartfelt gifting moments.",
        background: workshopOutdoorVenue,
        mediaImage: workshopTableLongClose,
        mediaAlt: "Bethany Blooms long floral styling table outdoors",
        primaryCta: { label: "Plan Your Florals", href: "/contact", variant: "primary" },
        secondaryCta: { label: "View Gallery", href: "/gallery", variant: "secondary" },
      },
      {
        id: "hero-studio-products",
        variant: "products",
        badge: "Studio Products",
        title: "Ready-to-ship Floral Finds",
        description:
          "Shop limited studio drops, DIY kits, and gift-ready frames curated with local botanicals for keepsakes that last.",
        background: workshopGuestsSmiling,
        mediaImage: workshopTableDetailsOne,
        mediaAlt: "Colourful trays of dried flowers ready for a workshop",
        primaryCta: { label: "Browse Products", href: "/products", variant: "primary" },
        secondaryCta: { label: "Get in Touch", href: "/contact", variant: "secondary" },
      },
    ],
    []
  );

  const handleAddToCart = (product) => {
    if (!product.isPurchasable || !product.numericPrice) {
      alert("This product does not have a valid online price yet. Please enquire for availability.");
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
          <HeroCarousel slides={heroSlides} />
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <Reveal as="div">
            <span className="badge">Inside the Studio</span>
            <h2>Where Memories Take Shape</h2>
            <p>Every workshop blends joyful community with colourful blooms. Here’s a peek at recent sessions.</p>
          </Reveal>
          <div className="home-photo-grid">
            {[
              { src: homePhotoOne, alt: "Pressed floral frame with pink blooms held outside" },
              { src: homePhotoTwo, alt: "Pressed floral art in soft neutral tones" },
              { src: homePhotoThree, alt: "Colourful trays of dried flowers ready for a workshop" },
              { src: homePhotoFour, alt: "Long Bethany Blooms workshop table styled with blooms" },
            ].map((item, index) => (
              <Reveal as="figure" className="home-photo-grid__item" key={item.src} delay={index * 90}>
                <img src={item.src} alt={item.alt} />
              </Reveal>
            ))}
          </div>
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
            {displayProducts.map((product, index) => (
              <Reveal as="article" className="card" key={product.id} delay={index * 110}>
                <img src={product.image} alt={`${product.title} product from Bethany Blooms`} loading="lazy" />
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
