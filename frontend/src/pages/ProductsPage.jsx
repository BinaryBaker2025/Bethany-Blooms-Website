import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import heroBackground from "../assets/photos/workshop-frame-purple.jpg";
import { getStockBadgeLabel, getStockStatus } from "../lib/stockStatus.js";

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

const stripHtml = (value = "") =>
  value
    .toString()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function ProductsPage() {
  const { addItem } = useCart();
  const { openCart } = useModal();
  const [searchParams] = useSearchParams();
  const [selectedVariants, setSelectedVariants] = useState({});
  const activeCategoryParam = (searchParams.get("category") || "").toString().trim();
  const { items: remoteProducts, status } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });
  const { items: categoryItems } = useFirestoreCollection("productCategories", {
    orderByField: "name",
    orderDirection: "asc",
  });
  const categoryOptions = useMemo(
    () =>
      categoryItems
        .map((category) => {
          const name = (category.name || category.title || category.label || category.id || "").toString().trim();
          if (!name) return null;
          const slug = (category.slug || category.id || name).toString().trim();
          const coverImage =
            (category.coverImage || category.cover_image || category.image || "").toString().trim();
          const description = (category.description || category.short_description || category.shortDescription || "")
            .toString()
            .trim();
          return { id: category.id || slug, name, slug, coverImage, description };
        })
        .filter(Boolean),
    [categoryItems],
  );
  const categoryLookup = useMemo(() => {
    const map = new Map();
    categoryOptions.forEach((category) => {
      const idKey = (category.id || "").toString().trim().toLowerCase();
      const slugKey = (category.slug || "").toString().trim().toLowerCase();
      const nameKey = (category.name || "").toString().trim().toLowerCase();
      if (idKey) map.set(idKey, category);
      if (slugKey) map.set(slugKey, category);
      if (nameKey) map.set(nameKey, category);
    });
    return map;
  }, [categoryOptions]);

  const resolveCategory = (value) => {
    if (!value) return null;
    const key = value.toString().trim().toLowerCase();
    if (!key) return null;
    return categoryLookup.get(key) || null;
  };

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

    const rawCategoryValues = [];
    if (Array.isArray(product.category_ids)) {
      rawCategoryValues.push(...product.category_ids);
    } else if (Array.isArray(product.categoryIds)) {
      rawCategoryValues.push(...product.categoryIds);
    } else if (product.categoryId) {
      rawCategoryValues.push(product.categoryId);
    }
    if (product.category) rawCategoryValues.push(product.category);
    if (product.categorySlug) rawCategoryValues.push(product.categorySlug);
    const normalizedCategoryValues = rawCategoryValues
      .map((value) => (value ?? "").toString().trim())
      .filter(Boolean);
    const categoryKeys = new Set();
    const categoryLabels = [];
    normalizedCategoryValues.forEach((value) => {
      const resolved = resolveCategory(value);
      if (resolved) {
        const idKey = (resolved.id || "").toString().trim().toLowerCase();
        const slugKey = (resolved.slug || "").toString().trim().toLowerCase();
        const nameKey = (resolved.name || "").toString().trim().toLowerCase();
        if (idKey) categoryKeys.add(idKey);
        if (slugKey) categoryKeys.add(slugKey);
        if (nameKey) categoryKeys.add(nameKey);
        if (resolved.name && !categoryLabels.includes(resolved.name)) {
          categoryLabels.push(resolved.name);
        }
      } else {
        const fallbackKey = value.toLowerCase();
        categoryKeys.add(fallbackKey);
        if (!categoryLabels.includes(value)) {
          categoryLabels.push(value);
        }
      }
    });

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
      image: images[0] || product.image || heroBackground,
      images,
      categoryLabels,
      categoryKeys: Array.from(categoryKeys),
      isPurchasable,
      stockStatus,
      stockBadgeLabel,
      variants,
    };
  });

  const activeCategory = useMemo(() => {
    if (!activeCategoryParam) return null;
    const key = activeCategoryParam.toLowerCase();
    return (
      categoryOptions.find(
        (category) =>
          category.id?.toLowerCase?.() === key ||
          category.slug?.toLowerCase?.() === key ||
          category.name?.toLowerCase?.() === key,
      ) || null
    );
  }, [activeCategoryParam, categoryOptions]);
  const metaTitle = activeCategory
    ? `${activeCategory.name} | Bethany Blooms Products`
    : "Bethany Blooms Products | Pressed Floral Gifting & Decor";
  const metaDescription = activeCategory?.description
    ? activeCategory.description
    : "Shop curated pressed flower products, bespoke arrangements, and keepsakes handcrafted in the Bethany Blooms studio.";

  usePageMetadata({
    title: metaTitle,
    description: metaDescription,
  });
  const filteredProducts = useMemo(() => {
    if (!activeCategoryParam) return normalizedProducts;
    const key = activeCategoryParam.toLowerCase();
    const activeKeys = activeCategory
      ? [
          activeCategory.id?.toLowerCase?.(),
          activeCategory.slug?.toLowerCase?.(),
          activeCategory.name?.toLowerCase?.(),
        ].filter(Boolean)
      : null;
    return normalizedProducts.filter((product) => {
      const productKeys = product.categoryKeys || [];
      if (activeKeys?.length) {
        return productKeys.some((entry) => activeKeys.includes(entry));
      }
      return productKeys.includes(key);
    });
  }, [normalizedProducts, activeCategoryParam, activeCategory]);

  const displayProducts = filteredProducts;

  const hasCategoryFilter = Boolean(activeCategoryParam);
  const heroImage =
    (activeCategory?.coverImage && activeCategory.coverImage.trim()) ||
    displayProducts[0]?.image ||
    normalizedProducts[0]?.image ||
    heroBackground;
  const heroTitle = activeCategory?.name || "Pressed Floral Products";
  const heroDescription =
    activeCategory?.description ||
    "Bring the studio experience home. Explore framed pressed art, gifting collections, ready-to-style blooms, and premium DIY options handcrafted by Bethany Blooms.";

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
      alert("This product is not available for direct purchase online yet. Please enquire for pricing.");
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
          <Hero
            variant="kits"
            background={heroImage || heroBackground}
            media={<img src={heroImage} alt={heroTitle} />}
          >
            <h1>{heroTitle}</h1>
            <p>{heroDescription}</p>
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
          {hasCategoryFilter && (
            <p className="modal__meta">
              Showing {activeCategory?.name || activeCategoryParam} products.{" "}
              <a href="/products">View all products</a>
            </p>
          )}
          <div className="kits-grid">
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
                <Reveal as="article" className="kit-card" key={product.id} delay={index * 90}>
                  <div className="kit-card__image">
                    <Link to={`/products/${encodeURIComponent(product.slug)}`} aria-label={`View ${product.title}`}>
                      <img src={product.image} alt={`${product.title} pressed flower product`} />
                    </Link>
                  </div>
                  <div className="kit-card__body">
                    <div className="kit-card__meta">
                      {(product.categoryLabels?.length ? product.categoryLabels : ["Product"]).slice(0, 2).map((label) => (
                        <span key={`${product.id}-category-${label}`} className="badge">
                          {label.replace(/-/g, " ")}
                        </span>
                      ))}
                      {(product.categoryLabels?.length ?? 0) > 2 && (
                        <span className="badge badge--muted">+{product.categoryLabels.length - 2}</span>
                      )}
                      {product.stockBadgeLabel && (
                        <span className={`badge badge--stock-${product.stockStatus?.state || "in"}`}>
                          {product.stockBadgeLabel}
                        </span>
                      )}
                    </div>
                    <h3 className="kit-card__title">
                      <Link to={`/products/${encodeURIComponent(product.slug)}`}>{product.title}</Link>
                    </h3>
                    <p>{product.description}</p>
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
                    <p className="kit-card__price">
                      <span className="price-stack">
                        <span className="price-stack__current">{displayPrice}</span>
                        {!Number.isFinite(variantPrice) && product.originalPrice && (
                          <span className="price-stack__original">{product.originalPrice}</span>
                        )}
                      </span>
                    </p>
                    <div className="kit-card__actions">
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
                  </div>
                </Reveal>
              );
            })}
          </div>
          {displayProducts.length === 0 && status !== "loading" && (
            <p className="empty-state">
              {hasCategoryFilter
                ? "No products found in this category yet."
                : "No products available yet. Create one from the admin dashboard."}
            </p>
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
