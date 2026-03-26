import { Link } from "react-router-dom";
import Reveal from "../components/Reveal.jsx";
import TestimonialCarousel from "../components/TestimonialCarousel.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { getProductCardStockStatus, getStockBadgeLabel } from "../lib/stockStatus.js";
import heroBackground from "../assets/photos/hero-cut-flowers.jpg";
import homePhotoOne from "../assets/photos/workshop-frame-hand-pink.jpeg";
import homePhotoTwo from "../assets/photos/workshop-frame-hand-neutral.jpeg";
import homePhotoThree from "../assets/photos/workshop-flowers-trays.jpg";
import homePhotoFour from "../assets/photos/workshop-table-long.jpg";
import workshopGuestsSmiling from "../assets/photos/workshop-guests-smiling.jpg";
import workshopTableDetailsOne from "../assets/photos/workshop-table-details-1.png";
import { CUT_FLOWER_PAGE_IMAGES } from "../lib/cutFlowerImages.js";
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
    image: CUT_FLOWER_PAGE_IMAGES.homeFallbackMarketBucket,
    status: "live",
  },
  {
    id: "fallback-bouquet",
    title: "Seasonal Bouquet",
    description: "Hand-tied bouquet featuring the best blooms of the week.",
    price: "From R350",
    category: "cut-flower",
    image: CUT_FLOWER_PAGE_IMAGES.homeFallbackBouquet,
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
    title: "Bethany Blooms | Cut & Pressed Flowers, Made Beautifully Simple",
    description:
      "Bethany Blooms offers fresh cut flowers, artisanal pressed flower workshops, DIY kits, and custom floral art from Vereeniging, South Africa.",
  });

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
    const stockStatus = getProductCardStockStatus(product);
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
      isOutOfStock: stockStatus?.state === "out",
      stockBadgeLabel,
      variants,
    };
  });

  const featuredProducts = normalizedProducts.filter((product) => product.featured).slice(0, 4);
  const displayProducts =
    featuredProducts.length > 0 ? featuredProducts : normalizedProducts.slice(0, 4);


  return (
    <>
      {/* 1 — Home hero: full-bleed image with gradient overlay + service cards */}
      <section className="home-hero">
        <img
          className="home-hero__bg-img"
          src={heroBackground}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          fetchpriority="high"
        />
        <div className="home-hero__overlay" aria-hidden="true" />
        <div className="home-hero__text">
          <span className="home-hero__eyebrow">Bethany Blooms</span>
          <h1>Fresh Blooms,<br />Given With Love</h1>
          <p>
            Cut flowers, pressed keepsakes, thoughtful gifts, floral arrangements, and hands-on workshops
          </p>
          <div className="cta-group">
            <Link className="btn btn--primary" to="/workshops">Book a Workshop</Link>
            <Link className="btn btn--ghost" to="/cut-flowers">Visit the Farm</Link>
          </div>
        </div>
        <div className="home-hero__services">
          <Link className="home-hero__service" to="/cut-flowers">
            <img src={CUT_FLOWER_PAGE_IMAGES.homeOfferCard} alt="Buckets of bright cut flowers" loading="eager" decoding="async" />
            <div className="home-hero__service-label">
              <span>Farm Experience</span>
              <strong>Cut Flowers</strong>
            </div>
          </Link>
          <Link className="home-hero__service" to="/workshops">
            <img src={homePhotoOne} alt="Pressed flower frame held by hand" loading="eager" decoding="async" />
            <div className="home-hero__service-label">
              <span>Guided Sessions</span>
              <strong>Pressed Flower Workshops</strong>
            </div>
          </Link>
          <Link className="home-hero__service" to="/products">
            <img src={workshopTableDetailsOne} alt="Pressed floral art and studio products" loading="eager" decoding="async" />
            <div className="home-hero__service-label">
              <span>Take-Home Keepsakes</span>
              <strong>Floral Art & Kits</strong>
            </div>
          </Link>
          <Link className="home-hero__service" to="/events">
            <img src={workshopGuestsSmiling} alt="Workshop guests at a Bethany Blooms event" loading="eager" decoding="async" />
            <div className="home-hero__service-label">
              <span>Pop-ups & Styling</span>
              <strong>Events & Arrangements</strong>
            </div>
          </Link>
        </div>
      </section>

      {/* 2a — Editorial split: Cut Flowers (image left, cream bg) */}
      <section className="section section--no-pad band--cream">
        <Reveal as="div" className="editorial-split">
          <div className="editorial-split__media">
            <img
              src={CUT_FLOWER_PAGE_IMAGES.homeOfferCard}
              alt="Fresh cut flowers from the Bethany Blooms farm"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="editorial-split__body">
            <span className="editorial-eyebrow">Cut Flowers</span>
            <h2>Pick-Your-Own Flower Farm Experience</h2>
            <p>
              Visit the flower farm, walk through the rows, and cut your own blooms straight from the bush — fresh,
              seasonal, and entirely your own handpicked mix.
            </p>
            <div className="cta-group">
              <Link className="btn btn--secondary" to="/cut-flowers">Ask About The Flower Farm</Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 2b — Editorial split reversed: Pressed Flowers (image right, white bg) */}
      <section className="section section--no-pad band--white">
        <Reveal as="div" className="editorial-split editorial-split--reverse">
          <div className="editorial-split__media">
            <img
              src={homePhotoOne}
              alt="Pressed flower artwork in a frame held outdoors"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="editorial-split__body">
            <span className="editorial-eyebrow">Pressed Flowers</span>
            <h2>Hands-On Pressed Flower Workshop</h2>
            <p>
              Join a guided workshop where you receive a frame and create your own floral artwork by placing dried
              flowers into a design you love — a keepsake made entirely by hand.
            </p>
            <div className="cta-group">
              <Link className="btn btn--secondary" to="/workshops">Book A Pressed Flower Session</Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 3 — Editorial mosaic: Inside the Studio */}
      <section className="section band--cream">
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">Inside the Studio</span>
            <h2>Where Memories Take Shape</h2>
            <p>From pressed keepsakes to fresh farm cuts, here is a peek at recent Bethany Blooms creations.</p>
          </Reveal>
        </div>
        <div className="editorial-mosaic">
          {[
            { src: homePhotoTwo, alt: "Pressed floral art in soft neutral tones" },
            { src: homePhotoOne, alt: "Pressed floral frame with pink blooms held outside" },
            {
              src: CUT_FLOWER_PAGE_IMAGES.homeFallbackMarketBucket,
              alt: "Fresh cut flower stems arranged in bright seasonal colours",
            },
            {
              src: CUT_FLOWER_PAGE_IMAGES.homeFallbackBouquet,
              alt: "Hand-tied cut flower bouquet prepared from farm blooms",
            },
          ].map((item, index) => (
            <Reveal as="div" className="editorial-mosaic__item" key={item.src} delay={index * 80}>
              <img src={item.src} alt={item.alt} loading="lazy" decoding="async" />
            </Reveal>
          ))}
        </div>
      </section>

      {/* 4 — Featured Products */}
      <section className="section band--white" id="product-collection">
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">Featured Collection</span>
            <h2>Products from the Studio</h2>
            <p>
              Curated pieces crafted for gifting, styling, and preserving your favourite floral moments. Browse a blend
              of ready-to-enjoy arrangements, pressed art keepsakes, and bespoke kits.
            </p>
          </Reveal>
          <div className="cards-grid cards-grid--featured">
            {displayProducts.map((product, index) => {
              const displayPrice = product.displayPrice;
              const categoryLabel = (product.category || "Product").toString().replace(/[-_]+/g, " ");
              const productUrl = `/products/${encodeURIComponent(product.slug)}`;

              return (
                <Reveal
                  as={Link}
                  to={productUrl}
                  className="card product-card product-card--link"
                  key={product.id}
                  delay={index * 110}
                >
                  <span className="product-card__category">{categoryLabel}</span>
                  <div className="product-card__media" aria-hidden="true">
                    <img
                      className="product-card__image"
                      src={product.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    {product.stockBadgeLabel && (
                      <span className={`badge badge--stock-${product.stockStatus?.state || "in"} product-card__badge`}>
                        {product.stockBadgeLabel}
                      </span>
                    )}
                  </div>
                  <h3 className="card__title">{product.title}</h3>
                  <p className="card__price">
                    <span className="price-stack">
                      <span className="price-stack__current">{displayPrice}</span>
                      {product.originalPrice && (
                        <span className="price-stack__original">{product.originalPrice}</span>
                      )}
                    </span>
                  </p>
                  <p className="product-card__description">{product.description}</p>
                  <span className="btn btn--secondary">
                    {product.isOutOfStock ? "Out of stock" : "View details"}
                  </span>
                </Reveal>
              );
            })}
          </div>
          {normalizedProducts.length === 0 && productsStatus !== "loading" && (
            <p className="empty-state">No products are available right now. Please check back soon.</p>
          )}
          {productsStatus === "loading" && <p className="empty-state">Loading featured products...</p>}
          {productsStatus === "empty" && (
            <p className="empty-state">No products are available right now. Please check back soon.</p>
          )}
          {productsStatus === "error" && (
            <p className="empty-state">We couldn't load products right now. Please refresh and try again.</p>
          )}
        </div>
      </section>

      {/* 5 — Testimonials with pull-quote */}
      <section className="section band--cream">
        <div className="section__inner" data-testimonials="">
          <Reveal as="blockquote" className="pull-quote">
            Flowers preserved by hand, stories kept for life.
          </Reveal>
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">Kind Words</span>
            <h2>Testimonials</h2>
          </Reveal>
          <TestimonialCarousel testimonials={testimonials} />
        </div>
      </section>
    </>
  );
}

export default HomePage;
