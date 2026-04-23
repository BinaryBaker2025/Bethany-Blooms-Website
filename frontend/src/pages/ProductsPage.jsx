import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Reveal from "../components/Reveal.jsx";
import ImageLoader from "../components/ImageLoader.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { useImageListPreloader } from "../hooks/useImageListPreloader.js";
import { formatPreorderSendMonth, getProductPreorderSendMonth } from "../lib/preorder.js";
import heroBackground from "../assets/photos/workshop-frame-purple.jpg";
import { CUT_FLOWER_PAGE_IMAGES } from "../lib/cutFlowerImages.js";
import { getProductCardStockStatus, getStockBadgeLabel } from "../lib/stockStatus.js";

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

const normalizeProductCategoryStatus = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "live" || normalized === "draft" || normalized === "archived") {
    return normalized;
  }
  return "live";
};

const isCategoryHidden = (category = {}) =>
  Boolean(category.hidden || category.isHidden) ||
  normalizeProductCategoryStatus(category.status) !== "live";

const getCategoryLookupTokens = (category = {}) =>
  [category.id, category.slug, category.name, category.title, category.label]
    .map((value) => normalizeCategoryToken(value ?? ""))
    .filter(Boolean);

const getCatalogItemCategoryValues = (item = {}) => {
  const values = [];
  if (Array.isArray(item.category_ids)) values.push(...item.category_ids);
  if (Array.isArray(item.categoryIds)) values.push(...item.categoryIds);
  if (item.categoryId) values.push(item.categoryId);
  if (item.categorySlug) values.push(item.categorySlug);
  if (item.category) values.push(item.category);
  if (item.categoryName) values.push(item.categoryName);
  return values.map((value) => normalizeCategoryToken(value ?? "")).filter(Boolean);
};

const hasHiddenCategoryAssignment = (item = {}, hiddenCategoryKeys = new Set()) => {
  if (!hiddenCategoryKeys.size) return false;
  return getCatalogItemCategoryValues(item).some((value) => hiddenCategoryKeys.has(value));
};

const preloadedProductHeroImages = new Set();

const preloadProductHeroImage = (src = "", priority = "low") => {
  const imageUrl = (src || "").toString().trim();
  if (!imageUrl || preloadedProductHeroImages.has(imageUrl) || typeof window === "undefined") {
    return;
  }
  preloadedProductHeroImages.add(imageUrl);
  const image = new Image();
  image.decoding = "async";
  if ("fetchPriority" in image) {
    image.fetchPriority = priority;
  }
  image.src = imageUrl;
};

const normalizeSubscriptionPlanStatus = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "live") return "live";
  if (normalized === "archived") return "archived";
  return "draft";
};

const normalizeSubscriptionTier = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "biweekly") return "bi-weekly";
  if (normalized === "weekly" || normalized === "bi-weekly" || normalized === "monthly") {
    return normalized;
  }
  return "";
};

const formatSubscriptionTier = (value = "") => {
  const normalized = normalizeSubscriptionTier(value);
  if (normalized === "weekly") return "Weekly";
  if (normalized === "bi-weekly") return "Bi-weekly";
  if (normalized === "monthly") return "Monthly";
  return "";
};

const normalizePriceAmount = (value = "") => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(2));
};

function ProductsPage() {
  const { openCart } = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCategoryParam = (searchParams.get("category") || "").toString().trim();
  const searchQuery = (searchParams.get("q") || "").toString().trim();
  const sortBy = (searchParams.get("sort") || "newest").toString().trim();
  const stockFilter = (searchParams.get("stock") || "all").toString().trim();
  const onSaleOnly = searchParams.get("sale") === "1";
  const priceMin = Number(searchParams.get("min") || "") || null;
  const priceMax = Number(searchParams.get("max") || "") || null;

  const setParam = (key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === "" || value === "all" || value === "newest" || value === "0") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  };

  const clearAllFilters = () => {
    setSearchParams({});
    setFiltersOpen(false);
  };
  const { items: remoteProducts, status } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });
  const { items: remoteSubscriptionPlans, status: subscriptionPlansStatus } = useFirestoreCollection(
    "subscriptionPlans",
    {
      orderByField: "updatedAt",
      orderDirection: "desc",
    },
  );
  const { items: categoryItems } = useFirestoreCollection("productCategories", {
    orderByField: "name",
    orderDirection: "asc",
  });
  const hiddenCategoryKeys = useMemo(() => {
    const keys = new Set();
    categoryItems.filter(isCategoryHidden).forEach((category) => {
      getCategoryLookupTokens(category).forEach((token) => keys.add(token));
    });
    return keys;
  }, [categoryItems]);
  const categoryOptions = useMemo(
    () =>
      categoryItems
        .filter((category) => !isCategoryHidden(category))
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
  const categoryHeroImagesToPreload = useMemo(() => {
    const urls = categoryOptions
      .map((category) => {
        const tokens = [category.id, category.slug, category.name].map(normalizeCategoryToken);
        const isCutFlower = tokens.some(
          (token) =>
            token === "cut-flower" ||
            token === "cutflower" ||
            token.includes("cut-flower") ||
            token.includes("cutflower"),
        );
        return isCutFlower ? CUT_FLOWER_PAGE_IMAGES.productsCutFlowerHero : category.coverImage;
      })
      .map((value) => (value || "").toString().trim())
      .filter(Boolean);
    return Array.from(new Set(urls));
  }, [categoryOptions]);
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

  const liveProducts = remoteProducts.filter(
    (product) =>
      (product.status ?? "live") === "live" &&
      !hasHiddenCategoryAssignment(product, hiddenCategoryKeys),
  );

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
      isOutOfStock: stockStatus?.state === "out",
      stockBadgeLabel,
      preorderSendMonth,
      preorderSendMonthLabel,
      variants,
    };
  });

  const normalizedSubscriptionPlans = useMemo(() => {
    const resolvePlanCategory = (value) => {
      if (!value) return null;
      const key = value.toString().trim().toLowerCase();
      if (!key) return null;
      return categoryLookup.get(key) || null;
    };

    return remoteSubscriptionPlans
      .filter((plan) => normalizeSubscriptionPlanStatus(plan?.status || "draft") === "live")
      .filter((plan) => !hasHiddenCategoryAssignment(plan, hiddenCategoryKeys))
      .map((plan, index) => {
        const planId = (plan?.id || "").toString().trim();
        if (!planId) return null;

        const perDeliveryAmount = normalizePriceAmount(plan?.monthlyAmount ?? plan?.monthly_amount);
        if (!perDeliveryAmount) return null;

        const tier = normalizeSubscriptionTier(plan?.tier);
        const tierLabel = formatSubscriptionTier(tier);

        const rawCategoryValues = [
          plan?.categoryId,
          plan?.categoryName,
          plan?.category,
          plan?.categorySlug,
        ]
          .map((value) => (value || "").toString().trim())
          .filter(Boolean);

        const categoryKeys = new Set();
        const categoryLabels = [];
        rawCategoryValues.forEach((value) => {
          const resolved = resolvePlanCategory(value);
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
            return;
          }
          const fallback = value.toLowerCase();
          categoryKeys.add(fallback);
          if (!categoryLabels.includes(value)) {
            categoryLabels.push(value);
          }
        });

        if (!categoryLabels.length) {
          categoryLabels.push("Subscriptions");
        }

        const title = (plan?.name || plan?.title || "Flower subscription").toString().trim();
        const generatedDescription = [
          tierLabel ? `${tierLabel} delivery` : null,
          "Billed monthly based on selected Monday deliveries",
        ]
          .filter(Boolean)
          .join(" · ");
        const description = stripHtml(plan?.description || generatedDescription || "Flower subscription plan.");

        return {
          ...plan,
          id: `subscription-plan-${planId}`,
          sourcePlanId: planId,
          slug: `subscription-plan-${index + 1}`,
          title,
          name: title,
          description,
          displayPrice: `R${perDeliveryAmount.toFixed(2)} / delivery`,
          originalPrice: null,
          numericPrice: perDeliveryAmount,
          image: (plan?.image || "").toString().trim() || heroBackground,
          images: [(plan?.image || "").toString().trim()].filter(Boolean),
          categoryLabels,
          categoryKeys: Array.from(categoryKeys),
          category: categoryLabels[0] || "Subscriptions",
          isPurchasable: true,
          isOutOfStock: false,
          stockStatus: { state: "in" },
          stockBadgeLabel: null,
          preorderSendMonth: null,
          preorderSendMonthLabel: "",
          variants: [],
          isSubscriptionPlan: true,
        };
      })
      .filter(Boolean);
  }, [categoryLookup, hiddenCategoryKeys, remoteSubscriptionPlans]);

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
    : "Bethany Blooms Products | Cut & Pressed Floral Gifting & Decor";
  const metaDescription = activeCategory?.description
    ? activeCategory.description
    : "Shop curated cut flower bunches, pressed flower products, bespoke arrangements, and keepsakes handcrafted by Bethany Blooms.";

  usePageMetadata({
    title: metaTitle,
    description: metaDescription,
  });

  const hasCategoryFilter = Boolean(activeCategoryParam);
  const activeCategoryKeys = useMemo(() => {
    if (!hasCategoryFilter) return [];
    const key = activeCategoryParam.toLowerCase();
    const keys = activeCategory
      ? [
          activeCategory.id?.toLowerCase?.(),
          activeCategory.slug?.toLowerCase?.(),
          activeCategory.name?.toLowerCase?.(),
        ].filter(Boolean)
      : [key];
    return Array.from(new Set(keys));
  }, [activeCategory, activeCategoryParam, hasCategoryFilter]);

  const filteredProducts = useMemo(() => {
    if (!hasCategoryFilter) return normalizedProducts;
    return normalizedProducts.filter((product) => {
      const productKeys = product.categoryKeys || [];
      if (activeCategoryKeys.length) {
        return productKeys.some((entry) => activeCategoryKeys.includes(entry));
      }
      return false;
    });
  }, [activeCategoryKeys, hasCategoryFilter, normalizedProducts]);

  const filteredSubscriptionPlans = useMemo(() => {
    if (!hasCategoryFilter) return [];
    if (!activeCategoryKeys.length) return normalizedSubscriptionPlans;
    return normalizedSubscriptionPlans.filter((plan) => {
      const planKeys = plan.categoryKeys || [];
      return planKeys.some((entry) => activeCategoryKeys.includes(entry));
    });
  }, [activeCategoryKeys, hasCategoryFilter, normalizedSubscriptionPlans]);

  const baseProducts = hasCategoryFilter
    ? [...filteredSubscriptionPlans, ...filteredProducts]
    : [...normalizedSubscriptionPlans, ...normalizedProducts];

  const displayProducts = useMemo(() => {
    let result = [...baseProducts];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.categoryLabels || []).some((l) => l.toLowerCase().includes(q)),
      );
    }

    // Stock filter
    if (stockFilter === "in") result = result.filter((p) => p.stockStatus?.state === "in");
    else if (stockFilter === "out") result = result.filter((p) => p.stockStatus?.state === "out");
    else if (stockFilter === "preorder") result = result.filter((p) => p.stockStatus?.state === "preorder");

    // On sale
    if (onSaleOnly) result = result.filter((p) => Boolean(p.originalPrice));

    // Price range
    if (priceMin !== null) result = result.filter((p) => p.numericPrice !== null && p.numericPrice >= priceMin);
    if (priceMax !== null) result = result.filter((p) => p.numericPrice !== null && p.numericPrice <= priceMax);

    // Sort
    if (sortBy === "price-asc") result.sort((a, b) => (a.numericPrice ?? Infinity) - (b.numericPrice ?? Infinity));
    else if (sortBy === "price-desc") result.sort((a, b) => (b.numericPrice ?? -Infinity) - (a.numericPrice ?? -Infinity));
    else if (sortBy === "name-az") result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    else if (sortBy === "name-za") result.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    // "newest" keeps original server order

    return result;
  }, [baseProducts, searchQuery, stockFilter, onSaleOnly, priceMin, priceMax, sortBy]);

  // Extract all product images for intelligent preloading
  const displayProductImages = useMemo(() => {
    return displayProducts
      .map((product) => product.image)
      .filter(Boolean)
      .slice(0, 50); // Limit to first 50 to avoid memory issues
  }, [displayProducts]);

  // Preload images intelligently as user scrolls
  useImageListPreloader(displayProductImages, {
    lookaheadCount: 12,
    priority: "low",
    enabled: true,
  });

  const hasActiveFilters = Boolean(
    searchQuery || activeCategoryParam || stockFilter !== "all" || onSaleOnly || priceMin || priceMax || sortBy !== "newest",
  );

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

  useEffect(() => {
    preloadProductHeroImage(heroImage || heroBackground, "high");
  }, [heroImage]);

  useEffect(() => {
    if (!categoryHeroImagesToPreload.length || typeof window === "undefined") return undefined;
    const preloadAllCategoryHeroImages = () => {
      categoryHeroImagesToPreload.forEach((imageUrl) => {
        preloadProductHeroImage(imageUrl, "low");
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      const callbackId = window.requestIdleCallback(preloadAllCategoryHeroImages, { timeout: 1500 });
      return () => window.cancelIdleCallback?.(callbackId);
    }

    const timeoutId = window.setTimeout(preloadAllCategoryHeroImages, 250);
    return () => window.clearTimeout(timeoutId);
  }, [categoryHeroImagesToPreload]);

  return (
    <>
      {/* Page hero */}
      <section className="section--no-pad">
        <div className="page-hero">
          <img className="page-hero__bg" src={heroImage || heroBackground} alt="" aria-hidden="true" loading="eager" decoding="async" fetchPriority="high" />
          <div className="page-hero__overlay" aria-hidden="true" />
          <div className="page-hero__content">
            <span className="editorial-eyebrow">Studio Collection</span>
            <h1>{heroTitle}</h1>
            <p>{heroDescription}</p>
            <div className="cta-group">
              <a href="#product-collection" className="btn btn--secondary">Browse Collection</a>
              <button className="btn btn--primary" type="button" onClick={openCart}>View Cart</button>
            </div>
          </div>
        </div>
      </section>

      <section className="section band--white" id="product-collection">
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">Curated by Bethany Blooms</span>
            <h2>{collectionHeading}</h2>
            <p>{collectionDescription}</p>
          </Reveal>

          {/* ── Filter & Search bar ── */}
          <div className="shop-filters">
            {/* Row 1: search + sort + filter toggle */}
            <div className="shop-filters__bar">
              <div className="shop-filters__search-wrap">
                <input
                  className="shop-filters__search"
                  type="search"
                  placeholder="Search products…"
                  value={searchQuery}
                  onChange={(e) => setParam("q", e.target.value)}
                  aria-label="Search products"
                />
                {searchQuery && (
                  <button className="shop-filters__search-clear" type="button" onClick={() => setParam("q", "")}>×</button>
                )}
              </div>
              <select
                className="shop-filters__sort"
                value={sortBy}
                onChange={(e) => setParam("sort", e.target.value)}
                aria-label="Sort products"
              >
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name-az">Name: A – Z</option>
                <option value="name-za">Name: Z – A</option>
              </select>
              <button
                className={`shop-filters__toggle ${filtersOpen ? "is-active" : ""}`}
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                Filters
                {hasActiveFilters && <span className="shop-filters__dot" aria-hidden="true" />}
              </button>
            </div>

            {/* Row 2: category chips */}
            {categoryOptions.length > 0 && (
              <div className="shop-filters__chips">
                <button
                  className={`shop-chip ${!activeCategoryParam ? "shop-chip--active" : ""}`}
                  type="button"
                  onClick={() => setParam("category", "")}
                >All</button>
                {categoryOptions.map((cat) => (
                  <button
                    key={cat.id}
                    className={`shop-chip ${activeCategoryParam === cat.slug || activeCategoryParam === cat.id ? "shop-chip--active" : ""}`}
                    type="button"
                    onClick={() => setParam("category", cat.slug || cat.id)}
                  >{cat.name}</button>
                ))}
              </div>
            )}

            {/* Row 3: expandable extra filters */}
            {filtersOpen && (
              <div className="shop-filters__panel">
                <div className="shop-filters__group">
                  <span className="shop-filters__group-label">Stock</span>
                  {[["all","All"],["in","In stock"],["preorder","Pre-order"],["out","Out of stock"]].map(([val, label]) => (
                    <button
                      key={val}
                      className={`shop-chip ${stockFilter === val ? "shop-chip--active" : ""}`}
                      type="button"
                      onClick={() => setParam("stock", val)}
                    >{label}</button>
                  ))}
                </div>

                <div className="shop-filters__group">
                  <span className="shop-filters__group-label">Price range</span>
                  <div className="shop-filters__price">
                    <label className="shop-filters__price-label">
                      From
                      <input
                        className="shop-filters__price-input"
                        type="number"
                        min="0"
                        placeholder="R 0"
                        value={priceMin ?? ""}
                        onChange={(e) => setParam("min", e.target.value || null)}
                      />
                    </label>
                    <span className="shop-filters__price-sep">—</span>
                    <label className="shop-filters__price-label">
                      To
                      <input
                        className="shop-filters__price-input"
                        type="number"
                        min="0"
                        placeholder="Any"
                        value={priceMax ?? ""}
                        onChange={(e) => setParam("max", e.target.value || null)}
                      />
                    </label>
                  </div>
                </div>

                <div className="shop-filters__group">
                  <span className="shop-filters__group-label">Deals</span>
                  <button
                    className={`shop-chip ${onSaleOnly ? "shop-chip--active" : ""}`}
                    type="button"
                    onClick={() => setParam("sale", onSaleOnly ? null : "1")}
                  >On sale</button>
                </div>
              </div>
            )}

            {/* Results count + clear */}
            <div className="shop-filters__meta">
              <span>{displayProducts.length} {displayProducts.length === 1 ? "product" : "products"}</span>
              {hasActiveFilters && (
                <button className="shop-filters__clear" type="button" onClick={clearAllFilters}>
                  Clear all filters
                </button>
              )}
            </div>
          </div>

          <div className="kits-grid">
            {displayProducts.map((product, index) => {
              const displayPrice = product.displayPrice;
              const categoryLabel = (product.categoryLabels?.[0] || product.category || "Product")
                .toString()
                .replace(/[-_]+/g, " ");
              const subscriptionPlanId = (product.sourcePlanId || "").toString().trim();
              const productUrl = product.isSubscriptionPlan
                ? `/subscriptions/checkout${subscriptionPlanId ? `?planId=${encodeURIComponent(subscriptionPlanId)}` : ""}`
                : `/products/${encodeURIComponent(product.slug)}`;

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
                    <ImageLoader
                      src={product.image}
                      alt=""
                      className="product-card__image"
                      containerClassName="product-card__image-container"
                      fetchPriority={index < 4 ? "high" : "low"}
                    />
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
                  <span className="btn btn--secondary">
                    {product.isSubscriptionPlan ? "Choose plan" : product.isOutOfStock ? "Out of stock" : "View details"}
                  </span>
                </Reveal>
              );
            })}
          </div>
          {displayProducts.length === 0 &&
            status !== "loading" &&
            (!hasCategoryFilter || subscriptionPlansStatus !== "loading") && (
            <div className="empty-state">
              <p>{hasActiveFilters ? "No products match your search or filters." : hasCategoryFilter ? "No items are available in this category right now." : "No products are available right now. Please check back soon."}</p>
              {hasActiveFilters && (
                <button className="btn btn--secondary" type="button" onClick={clearAllFilters}>
                  Clear all filters
                </button>
              )}
            </div>
          )}
          {(status === "loading" || (hasCategoryFilter && subscriptionPlansStatus === "loading")) && (
            <p className="empty-state">Loading products...</p>
          )}
          {status === "empty" && !hasCategoryFilter && (
            <p className="empty-state">No products are available right now. Please check back soon.</p>
          )}
          {(status === "error" || (hasCategoryFilter && subscriptionPlansStatus === "error")) && (
            <p className="empty-state">We couldn't load products right now. Please refresh and try again.</p>
          )}
        </div>
      </section>

      {/* What You'll Find — editorial-process */}
      <section className="section band--cream">
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">Thoughtfully Made</span>
            <h2>What You'll Find</h2>
          </Reveal>
          <Reveal as="div" className="editorial-process">
            <div className="editorial-process__step">
              <h3>Pressed Floral Artworks</h3>
              <p>Seasonally curated blooms preserved behind glass to honour treasured moments.</p>
            </div>
            <div className="editorial-process__step">
              <h3>Customisable Keepsakes</h3>
              <p>From bespoke commissions to meaningful gifts, each piece is created with intention.</p>
            </div>
            <div className="editorial-process__step">
              <h3>Ready-to-Arrange Blooms</h3>
              <p>Fresh and dried florals styled to elevate events, devotional spaces, and gifting.</p>
            </div>
            <div className="editorial-process__step">
              <h3>DIY Creativity</h3>
              <p>Beautifully curated kits with scripture reflections, guidance, and thoughtful tools.</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA band */}
      <section className="section band--white">
        <div className="section__inner">
          <Reveal as="div" className="editorial-band editorial-band--center">
            <span className="editorial-eyebrow">Style the Moment</span>
            <h2>From Fresh Stem to Framed Heirloom</h2>
            <p>
              Start with a fresh arrangement, then preserve your favourite stems in a bespoke artwork or DIY creation.
              We're here for every step — concept, styling, and keepsake.
            </p>
            <div className="cta-group">
              <a className="btn btn--primary" href="/workshops">Join a Workshop</a>
              <a className="btn btn--secondary" href="/contact">Start a Bespoke Project</a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

export default ProductsPage;
