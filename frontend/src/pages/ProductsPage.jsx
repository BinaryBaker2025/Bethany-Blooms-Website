import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { formatPreorderSendMonth, getProductPreorderSendMonth } from "../lib/preorder.js";
import heroBackground from "../assets/photos/workshop-frame-purple.jpg";
import { CUT_FLOWER_PAGE_IMAGES } from "../lib/cutFlowerImages.js";
import { getStockBadgeLabel, getStockStatus } from "../lib/stockStatus.js";

const stripHtml = (value = "") =>
  value
    .toString()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCategoryToken = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

function ProductsPage() {
  const { openCart } = useModal();
  const [searchParams] = useSearchParams();
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
          const subHeading = (
            category.subHeading ||
            category.subheading ||
            category.collectionHeading ||
            category.collection_heading ||
            category.collectionTitle ||
            category.collection_title ||
            ""
          )
            .toString()
            .trim();
          const productDescription = (
            category.productDescription ||
            category.collectionDescription ||
            category.collection_description ||
            ""
          )
            .toString()
            .trim();
          return { id: category.id || slug, name, slug, coverImage, description, subHeading, productDescription };
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
    const preorderSendMonth = getProductPreorderSendMonth(product);
    const preorderSendMonthLabel = formatPreorderSendMonth(preorderSendMonth);
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
      preorderSendMonth,
      preorderSendMonthLabel,
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
  const isCutFlowerCategory = useMemo(() => {
    if (!hasCategoryFilter) return false;
    const tokens = new Set([
      normalizeCategoryToken(activeCategoryParam),
      normalizeCategoryToken(activeCategory?.id),
      normalizeCategoryToken(activeCategory?.slug),
      normalizeCategoryToken(activeCategory?.name),
    ].filter(Boolean));
    return Array.from(tokens).some((token) =>
      token === "cut-flower" ||
      token === "cutflower" ||
      token.includes("cut-flower") ||
      token.includes("cutflower"),
    );
  }, [activeCategory?.id, activeCategory?.name, activeCategory?.slug, activeCategoryParam, hasCategoryFilter]);

  const categoryCoverImage = (activeCategory?.coverImage && activeCategory.coverImage.trim()) || "";
  const heroImage =
    (isCutFlowerCategory ? CUT_FLOWER_PAGE_IMAGES.productsCutFlowerHero : categoryCoverImage) ||
    displayProducts[0]?.image ||
    normalizedProducts[0]?.image ||
    heroBackground;
  const heroTitle = activeCategory?.name || "Pressed Floral Products";
  const heroDescription =
    activeCategory?.description ||
    "Bring the studio experience home. Explore framed pressed art, gifting collections, ready-to-style blooms, and premium DIY options handcrafted by Bethany Blooms.";
  const collectionHeading = activeCategory?.subHeading || "The Studio Collection";
  const collectionDescription =
    activeCategory?.productDescription ||
    activeCategory?.description ||
    "Discover limited releases, seasonal blooms, and bespoke keepsakes designed to celebrate meaningful moments.";

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero
            variant="kits"
            background={heroImage || heroBackground}
            media={<img src={heroImage} alt={heroTitle} loading="lazy" decoding="async"/>}
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
            <h2>{collectionHeading}</h2>
            <p>{collectionDescription}</p>
          </Reveal>
          {hasCategoryFilter && (
            <p className="modal__meta">
              Showing {activeCategory?.name || activeCategoryParam} products.{" "}
              <a href="/products">View all products</a>
            </p>
          )}
          <div className="kits-grid">
            {displayProducts.map((product, index) => {
              const displayPrice = product.displayPrice;
              const categoryLabel = (product.categoryLabels?.[0] || product.category || "Product")
                .toString()
                .replace(/[-_]+/g, " ");
              const productUrl = `/products/${encodeURIComponent(product.slug)}`;

              return (
                <Reveal
                  as={Link}
                  to={productUrl}
                  className="card product-card product-card--link"
                  key={product.id}
                  delay={index * 90}
                >
                  <span className="product-card__category">{categoryLabel}</span>
                  <div className="product-card__media" aria-hidden="true">
                    <img className="product-card__image" src={product.image} alt="" loading="lazy" decoding="async"/>
                    {product.stockBadgeLabel && (
                      <span className={`badge badge--stock-${product.stockStatus?.state || "in"} product-card__badge`}>
                        {product.stockBadgeLabel}
                      </span>
                    )}
                  </div>
                  <h3 className="card__title">{product.title}</h3>
                  <p className="product-card__description">{product.description}</p>
                  {product.stockStatus?.state === "preorder" && product.preorderSendMonthLabel && (
                    <p className="modal__meta">Ships from {product.preorderSendMonthLabel}</p>
                  )}
                  <p className="card__price">
                    <span className="price-stack">
                      <span className="price-stack__current">{displayPrice}</span>
                      {product.originalPrice && (
                        <span className="price-stack__original">{product.originalPrice}</span>
                      )}
                    </span>
                  </p>
                  <span className="btn btn--secondary">View details</span>
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
