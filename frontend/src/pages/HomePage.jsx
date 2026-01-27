import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import Reveal from "../components/Reveal.jsx";
import TestimonialCarousel from "../components/TestimonialCarousel.jsx";
import HeroCarousel from "../components/HeroCarousel.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { getStockBadgeLabel, getStockStatus } from "../lib/stockStatus.js";
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

const CartIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M6 6h15l-1.4 7H8.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="10" cy="20" r="1.3" fill="currentColor" />
    <circle cx="18" cy="20" r="1.3" fill="currentColor" />
    <path d="M6 6 5 3H3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

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

const stripHtml = (value = "") =>
  value
    .toString()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function HomePage() {
  usePageMetadata({
    title: "Bethany Blooms | Pressed Flower Art, Made Beautifully Simple",
    description:
      "Bethany Blooms offers artisanal pressed flower workshops, DIY kits, and custom floral art from Vereeniging, South Africa.",
  });

  const { addItem } = useCart();
  const { openCart } = useModal();
  const [selectedVariants, setSelectedVariants] = useState({});
  const { items: remoteProducts, status: productsStatus } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
    fallback: FALLBACK_PRODUCTS,
  });

  const liveProducts = remoteProducts.filter((product) => (product.status ?? "live") === "live");

  const normalizedProducts = liveProducts.map((product, index) => {
    const priceNumber = typeof product.price === "number" ? product.price : Number(product.price);
    const salePriceNumber =
      typeof product.sale_price === "number"
        ? product.sale_price
        : Number(product.sale_price ?? product.salePrice);
    const hasSale = Number.isFinite(salePriceNumber) && salePriceNumber !== priceNumber;
    const basePrice = hasSale ? salePriceNumber : priceNumber;
    const isPurchasable = Number.isFinite(basePrice);
    const stockStatus = getStockStatus({
      quantity: product.stock_quantity ?? product.quantity,
      forceOutOfStock: product.forceOutOfStock || product.stock_status === "out_of_stock",
      status: product.stock_status,
    });
    const stockBadgeLabel = getStockBadgeLabel(stockStatus);
    const variants = Array.isArray(product.variants)
      ? product.variants
          .map((variant) => {
            const label = (variant.label || variant.name || "").toString().trim();
            if (!label) return null;
            const priceValue =
              typeof variant.price === "number" ? variant.price : Number(variant.price);
            return {
              id: (variant.id || label).toString(),
              label,
              price: Number.isFinite(priceValue) ? priceValue : null,
            };
          })
          .filter(Boolean)
      : [];
    const imageCandidates = [
      product.main_image,
      ...(Array.isArray(product.gallery_images) ? product.gallery_images : []),
      product.image,
      ...(Array.isArray(product.images) ? product.images : []),
    ]
      .map((value) => (value || "").toString().trim())
      .filter(Boolean);
    const images = Array.from(new Set(imageCandidates)).slice(0, 6);
    const rawCategoryValues = Array.isArray(product.category_ids)
      ? product.category_ids
      : Array.isArray(product.categoryIds)
      ? product.categoryIds
      : product.categoryId
      ? [product.categoryId]
      : product.category
      ? [product.category]
      : [];
    const primaryCategory = rawCategoryValues[0] || product.category || "product";
    const slug = (product.slug || product.id || `product-${index}`).toString();
    const description = stripHtml(
      product.short_description ||
        product.shortDescription ||
        product.description ||
        product.long_description ||
        product.longDescription ||
        "Details coming soon.",
    );
    return {
      ...product,
      id: product.id || `product-${index}`,
      slug,
      title: product.title || product.name || "Bethany Blooms Product",
      name: product.name || product.title || "Bethany Blooms Product",
      description,
      displayPrice: Number.isFinite(basePrice) ? `R${basePrice}` : product.price ?? "Price on request",
      originalPrice: hasSale && Number.isFinite(priceNumber) ? `R${priceNumber}` : null,
      numericPrice: Number.isFinite(basePrice) ? basePrice : null,
      category: primaryCategory,
      image: images[0] || product.image || heroBackground,
      images,
      isPurchasable,
      stockStatus,
      stockBadgeLabel,
      variants,
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

  const handleAddToCart = (product, variant) => {
    if (product.stockStatus?.state === "out") {
      alert("This product is currently out of stock. Please check back soon.");
      return;
    }
    if (product.variants?.length && !variant) {
      alert("Please select a variant before adding this product to your cart.");
      return;
    }
    const variantPrice = Number.isFinite(variant?.price) ? variant.price : null;
    const finalPrice = Number.isFinite(variantPrice) ? variantPrice : product.numericPrice;
    if (!Number.isFinite(finalPrice)) {
      alert("This product does not have a valid online price yet. Please enquire for availability.");
      return;
    }
    addItem({
      id: variant ? `${product.id}:${variant.id}` : product.id,
      name: product.name,
      price: finalPrice,
      itemType: "product",
      metadata: {
        type: "product",
        productId: product.id,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        variantPrice,
      },
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
            {displayProducts.map((product, index) => {
              const selectedVariantId = selectedVariants[product.id] || "";
              const selectedVariant =
                product.variants?.find((variant) => variant.id === selectedVariantId) || null;
              const variantPrice = Number.isFinite(selectedVariant?.price) ? selectedVariant.price : null;
              const displayPrice = Number.isFinite(variantPrice) ? `R${variantPrice}` : product.displayPrice;
              const hasVariants = Boolean(product.variants?.length);
              const variantSelected = Boolean(selectedVariant);
              const canPurchase = hasVariants
                ? variantSelected
                  ? Number.isFinite(variantPrice) || product.isPurchasable
                  : false
                : product.isPurchasable;
              const isOutOfStock = product.stockStatus?.state === "out";
              const needsVariant = hasVariants && !variantSelected;
              const canAddToCart = !isOutOfStock && !needsVariant && canPurchase;
              const iconLabel = isOutOfStock
                ? "Out of stock"
                : needsVariant
                ? "Select a variant"
                : !canPurchase
                ? "Enquire for pricing"
                : "Add to cart";

              return (
                <Reveal as="article" className="card" key={product.id} delay={index * 110}>
                  <Link to={`/products/${encodeURIComponent(product.slug)}`} aria-label={`View ${product.title}`}>
                    <img src={product.image} alt={`${product.title} product from Bethany Blooms`} loading="lazy" />
                  </Link>
                  <h3 className="card__title">
                    <Link to={`/products/${encodeURIComponent(product.slug)}`}>{product.title}</Link>
                  </h3>
                  <p className="card__price">
                    <span className="price-stack">
                      <span className="price-stack__current">{displayPrice}</span>
                      {!Number.isFinite(variantPrice) && product.originalPrice && (
                        <span className="price-stack__original">{product.originalPrice}</span>
                      )}
                    </span>
                  </p>
                  <p>{product.description}</p>
                  <p className="modal__meta">Category: {product.category.replace(/-/g, " ")}</p>
                  {product.variants?.length > 0 && (
                    <label className="modal__meta">
                      Variant
                      <select
                        className="input"
                        value={selectedVariantId}
                        onChange={(event) =>
                          setSelectedVariants((prev) => ({
                            ...prev,
                            [product.id]: event.target.value,
                          }))
                        }
                        required
                      >
                        <option value="" disabled>
                          Select a variant
                        </option>
                        {product.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.label}
                            {Number.isFinite(variant.price) ? ` · R${variant.price}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {product.stockBadgeLabel && (
                    <span className={`badge badge--stock-${product.stockStatus?.state || "in"}`}>
                      {product.stockBadgeLabel}
                    </span>
                  )}
                  <div className="card__actions">
                    <Link className="btn btn--secondary" to={`/products/${encodeURIComponent(product.slug)}`}>
                      View details
                    </Link>
                    <button
                      className="btn btn--icon"
                      type="button"
                      onClick={() => handleAddToCart(product, selectedVariant)}
                      disabled={!canAddToCart}
                      aria-label={iconLabel}
                      title={iconLabel}
                    >
                      <span className="btn__icon">
                        <CartIcon />
                      </span>
                    </button>
                  </div>
                </Reveal>
              );
            })}
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
