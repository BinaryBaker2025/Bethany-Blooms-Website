import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Reveal from "../components/Reveal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { getStockBadgeLabel, getStockStatus } from "../lib/stockStatus.js";
import heroBackground from "../assets/photos/workshop-frame-purple.jpg";

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const stripHtml = (value = "") =>
  value
    .toString()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sanitizePlainText = (value = "") => {
  const raw = value.toString();
  if (!raw) return "";
  const withLineBreaks = raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");
  return withLineBreaks.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};

const formatSunlightLabel = (value = "") => {
  const key = value.toString().toLowerCase().trim();
  if (!key) return "";
  if (key === "full_sun") return "Full sun";
  if (key === "partial_shade") return "Partial shade";
  if (key === "shade") return "Shade";
  return value;
};

const getYouTubeEmbedUrl = (value = "") => {
  const raw = value.toString().trim();
  if (!raw) return "";
  const iframeMatch = raw.match(/src=["']([^"']+)["']/i);
  const url = iframeMatch ? iframeMatch[1] : raw;
  const idMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/,
  );
  const videoId = idMatch ? idMatch[1] : "";
  return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
};

const buildLookup = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const name = (item.name || item.title || item.label || item.id || "").toString().trim();
    if (!name) return;
    const slug = (item.slug || item.id || name).toString().trim();
    const id = (item.id || slug).toString().trim();
    const record = { id, name, slug };
    const keys = [id, slug, name]
      .map((value) => value.toString().trim().toLowerCase())
      .filter(Boolean);
    keys.forEach((key) => map.set(key, record));
  });
  return map;
};

const buildProductCard = (product, index = 0) => {
  const priceNumber = normalizeNumber(product.price);
  const salePriceNumber = normalizeNumber(product.sale_price ?? product.salePrice);
  const hasSale = Number.isFinite(salePriceNumber) && salePriceNumber !== priceNumber;
  const basePrice = hasSale ? salePriceNumber : priceNumber;
  const displayPrice = Number.isFinite(basePrice) ? `R${basePrice}` : product.price ?? "Price on request";
  const originalPrice = hasSale && Number.isFinite(priceNumber) ? `R${priceNumber}` : null;
  const imageCandidates = [
    product.main_image,
    ...(Array.isArray(product.gallery_images) ? product.gallery_images : []),
    product.image,
    ...(Array.isArray(product.images) ? product.images : []),
  ]
    .map((value) => (value || "").toString().trim())
    .filter(Boolean);
  const images = Array.from(new Set(imageCandidates)).slice(0, 6);
  const slug = (product.slug || product.id || `product-${index}`).toString();
  return {
    id: product.id || `product-${index}`,
    slug,
    title: product.title || product.name || "Bethany Blooms Product",
    image: images[0] || heroBackground,
    displayPrice,
    originalPrice,
  };
};

function ProductDetailPage() {
  const { productId } = useParams();
  const slugParam = useMemo(() => decodeURIComponent(productId || "").toLowerCase(), [productId]);
  const { addItem } = useCart();
  const { openCart } = useModal();
  const { items: productItems, status: productsStatus, error: productsError } = useFirestoreCollection("products", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });
  const { items: categoryItems } = useFirestoreCollection("productCategories", {
    orderByField: "name",
    orderDirection: "asc",
  });
  const { items: tagItems } = useFirestoreCollection("productTags", {
    orderByField: "name",
    orderDirection: "asc",
  });
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const categoryLookup = useMemo(() => buildLookup(categoryItems), [categoryItems]);
  const tagLookup = useMemo(() => buildLookup(tagItems), [tagItems]);

  const liveProducts = useMemo(
    () => productItems.filter((product) => (product.status ?? "live") === "live"),
    [productItems],
  );

  const productRecord = useMemo(() => {
    if (!slugParam) return null;
    return (
      liveProducts.find((product) => {
        const slug = (product.slug || "").toString().toLowerCase();
        const id = (product.id || "").toString().toLowerCase();
        return slug === slugParam || id === slugParam;
      }) || null
    );
  }, [liveProducts, slugParam]);

  const product = useMemo(() => {
    if (!productRecord) return null;
    const title = productRecord.title || productRecord.name || "Bethany Blooms Product";
    const slug = (productRecord.slug || productRecord.id || "").toString();
    const priceNumber = normalizeNumber(productRecord.price);
    const salePriceNumber = normalizeNumber(productRecord.sale_price ?? productRecord.salePrice);
    const hasSale = Number.isFinite(salePriceNumber) && salePriceNumber !== priceNumber;
    const basePrice = hasSale ? salePriceNumber : priceNumber;
    const displayPrice = Number.isFinite(basePrice) ? `R${basePrice}` : productRecord.price ?? "Price on request";
    const originalPrice = hasSale && Number.isFinite(priceNumber) ? `R${priceNumber}` : null;
    const shortDescription = sanitizePlainText(
      productRecord.short_description || productRecord.shortDescription || productRecord.description || "",
    );
    const longDescription = sanitizePlainText(
      productRecord.long_description || productRecord.longDescription || "",
    );
    const summaryText = shortDescription || longDescription;
    const detailText =
      shortDescription &&
      longDescription &&
      shortDescription.trim() !== longDescription.trim()
        ? longDescription
        : "";

    const stockStatus = getStockStatus({
      quantity: productRecord.stock_quantity ?? productRecord.quantity,
      forceOutOfStock: productRecord.forceOutOfStock || productRecord.stock_status === "out_of_stock",
      status: productRecord.stock_status,
    });
    const stockBadgeLabel = getStockBadgeLabel(stockStatus);

    const imageCandidates = [
      productRecord.main_image,
      ...(Array.isArray(productRecord.gallery_images) ? productRecord.gallery_images : []),
      productRecord.image,
      ...(Array.isArray(productRecord.images) ? productRecord.images : []),
    ]
      .map((value) => (value || "").toString().trim())
      .filter(Boolean);
    const images = Array.from(new Set(imageCandidates)).slice(0, 6);
    const primaryImage = images[0] || heroBackground;

    const rawCategoryValues = [];
    if (Array.isArray(productRecord.category_ids)) {
      rawCategoryValues.push(...productRecord.category_ids);
    } else if (Array.isArray(productRecord.categoryIds)) {
      rawCategoryValues.push(...productRecord.categoryIds);
    } else if (productRecord.categoryId) {
      rawCategoryValues.push(productRecord.categoryId);
    }
    if (productRecord.category) rawCategoryValues.push(productRecord.category);
    if (productRecord.categorySlug) rawCategoryValues.push(productRecord.categorySlug);

    const categoryLabels = [];
    const categoryKeys = new Set();
    rawCategoryValues
      .map((value) => (value ?? "").toString().trim())
      .filter(Boolean)
      .forEach((value) => {
        const resolved = categoryLookup.get(value.toLowerCase());
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
        } else if (!categoryLabels.includes(value)) {
          categoryLabels.push(value);
          categoryKeys.add(value.toLowerCase());
        }
      });

    const rawTagValues = [];
    if (Array.isArray(productRecord.tag_ids)) {
      rawTagValues.push(...productRecord.tag_ids);
    } else if (Array.isArray(productRecord.tagIds)) {
      rawTagValues.push(...productRecord.tagIds);
    }
    const tagLabels = [];
    rawTagValues
      .map((value) => (value ?? "").toString().trim())
      .filter(Boolean)
      .forEach((value) => {
        const resolved = tagLookup.get(value.toLowerCase());
        if (resolved?.name) {
          if (!tagLabels.includes(resolved.name)) tagLabels.push(resolved.name);
        } else if (!tagLabels.includes(value)) {
          tagLabels.push(value);
        }
      });

    return {
      ...productRecord,
      id: productRecord.id,
      slug,
      title,
      sku: productRecord.sku || "",
      displayPrice,
      originalPrice,
      numericPrice: Number.isFinite(basePrice) ? basePrice : null,
      isPurchasable: Number.isFinite(basePrice),
      shortDescription,
      longDescription,
      summaryText,
      detailText,
      images: images.length ? images : [primaryImage],
      image: primaryImage,
      stockStatus,
      stockBadgeLabel,
      categoryLabels,
      tagLabels,
      videoEmbed: productRecord.video_embed || productRecord.videoEmbed || "",
      sunlight: formatSunlightLabel(productRecord.sunlight || ""),
      soilType: productRecord.soil_type || productRecord.soilType || "",
      watering: productRecord.watering || "",
      climate: productRecord.climate || "",
      plantingDepth: productRecord.planting_depth || productRecord.plantingDepth || "",
      plantingSpacing: productRecord.planting_spacing || productRecord.plantingSpacing || "",
      bestPlantingTime: productRecord.best_planting_time || productRecord.bestPlantingTime || "",
      bloomPeriod: productRecord.bloom_period || productRecord.bloomPeriod || "",
      flowerColor: productRecord.flower_color || productRecord.flowerColor || "",
      matureHeight: productRecord.mature_height || productRecord.matureHeight || "",
      pestIssues: productRecord.pest_issues || productRecord.pestIssues || "",
      diseaseInfo: productRecord.disease_info || productRecord.diseaseInfo || "",
      propagation: productRecord.propagation || "",
      companions: productRecord.companions || "",
      metaTitle: productRecord.meta_title || productRecord.metaTitle || "",
      metaDescription: productRecord.meta_description || productRecord.metaDescription || "",
      metaKeywords: productRecord.meta_keywords || productRecord.metaKeywords || "",
      relatedProductIds: Array.isArray(productRecord.related_product_ids)
        ? productRecord.related_product_ids
        : Array.isArray(productRecord.relatedProductIds)
        ? productRecord.relatedProductIds
        : [],
      upsellProductIds: Array.isArray(productRecord.upsell_product_ids)
        ? productRecord.upsell_product_ids
        : Array.isArray(productRecord.upsellProductIds)
        ? productRecord.upsellProductIds
        : [],
      crossSellProductIds: Array.isArray(productRecord.cross_sell_product_ids)
        ? productRecord.cross_sell_product_ids
        : Array.isArray(productRecord.crossSellProductIds)
        ? productRecord.crossSellProductIds
        : [],
      variants: Array.isArray(productRecord.variants)
        ? productRecord.variants
            .map((variant) => {
              const label = (variant.label || variant.name || "").toString().trim();
              if (!label) return null;
              const priceValue = normalizeNumber(variant.price);
              return {
                id: (variant.id || label).toString(),
                label,
                price: Number.isFinite(priceValue) ? priceValue : null,
              };
            })
            .filter(Boolean)
        : [],
    };
  }, [productRecord, categoryLookup, tagLookup]);

  useEffect(() => {
    if (!product) return;
    setSelectedVariantId("");
    setActiveImageIndex(0);
  }, [product?.id]);

  const selectedVariant = product?.variants?.find((variant) => variant.id === selectedVariantId) || null;
  const variantPrice = Number.isFinite(selectedVariant?.price) ? selectedVariant.price : null;
  const displayPrice = product
    ? Number.isFinite(variantPrice)
      ? `R${variantPrice}`
      : product.displayPrice
    : "";
  const showOriginalPrice = product && !Number.isFinite(variantPrice) ? product.originalPrice : null;
  const canPurchase = product
    ? product.variants?.length
      ? Boolean(selectedVariant) && (Number.isFinite(variantPrice) || product.isPurchasable)
      : product.isPurchasable
    : false;
  const youtubeEmbedUrl = product ? getYouTubeEmbedUrl(product.videoEmbed) : "";

  const stockNote = useMemo(() => {
    if (!product?.stockStatus) return "";
    const { state, quantity } = product.stockStatus;
    if (state === "preorder") {
      return "Preorder now to reserve this item.";
    }
    if (state === "low" && Number.isFinite(quantity)) {
      return `Only ${quantity} left in stock.`;
    }
    if (state === "in" && Number.isFinite(quantity)) {
      return `${quantity} in stock.`;
    }
    return "";
  }, [product]);

  const attributeItems = useMemo(() => {
    if (!product) return [];
    return [
      { label: "Sunlight", value: product.sunlight },
      { label: "Soil type", value: product.soilType },
      { label: "Watering", value: product.watering },
      { label: "Climate", value: product.climate },
      { label: "Planting depth", value: product.plantingDepth },
      { label: "Planting spacing", value: product.plantingSpacing },
      { label: "Best planting time", value: product.bestPlantingTime },
      { label: "Bloom period", value: product.bloomPeriod },
      { label: "Flower color", value: product.flowerColor },
      { label: "Mature height", value: product.matureHeight },
    ].filter((item) => item.value);
  }, [product]);

  const careItems = useMemo(() => {
    if (!product) return [];
    return [
      { label: "Pest issues", value: product.pestIssues },
      { label: "Disease info", value: product.diseaseInfo },
      { label: "Propagation", value: product.propagation },
      { label: "Companion plants", value: product.companions },
    ]
      .map((item) => ({
        ...item,
        text: sanitizePlainText(item.value || ""),
      }))
      .filter((item) => item.text);
  }, [product]);

  const productCardMap = useMemo(() => {
    const map = new Map();
    liveProducts.forEach((entry, index) => {
      const card = buildProductCard(entry, index);
      map.set(entry.id, card);
      if (card.slug) map.set(card.slug, card);
    });
    return map;
  }, [liveProducts]);

  const relatedProducts = useMemo(() => {
    if (!product) return [];
    return (product.relatedProductIds || [])
      .map((id) => productCardMap.get(id))
      .filter((entry) => entry && entry.id !== product.id);
  }, [product, productCardMap]);

  const upsellProducts = useMemo(() => {
    if (!product) return [];
    return (product.upsellProductIds || [])
      .map((id) => productCardMap.get(id))
      .filter((entry) => entry && entry.id !== product.id);
  }, [product, productCardMap]);

  const crossSellProducts = useMemo(() => {
    if (!product) return [];
    return (product.crossSellProductIds || [])
      .map((id) => productCardMap.get(id))
      .filter((entry) => entry && entry.id !== product.id);
  }, [product, productCardMap]);

  const pageTitle = product?.metaTitle || (product ? `${product.title} | Bethany Blooms Products` : "Product Details | Bethany Blooms");
  const pageDescriptionSource =
    product?.metaDescription || product?.shortDescription || product?.longDescription || "";
  const pageDescription =
    stripHtml(pageDescriptionSource) ||
    "Browse the Bethany Blooms product collection and discover curated pressed flower keepsakes.";
  const pageKeywords = product?.metaKeywords || "";

  usePageMetadata({
    title: pageTitle,
    description: pageDescription,
    keywords: pageKeywords,
  });

  const isLoading = productsStatus === "loading";
  const isError = productsStatus === "error";
  const isNotFound = !isLoading && !isError && !product;

  const handleAddToCart = () => {
    if (!product) return;
    if (product.stockStatus?.state === "out") {
      alert("This product is currently out of stock. Please check back soon.");
      return;
    }
    if (product.variants?.length && !selectedVariant) {
      alert("Please select a variant before adding this product to your cart.");
      return;
    }
    const finalPrice = Number.isFinite(variantPrice) ? variantPrice : product.numericPrice;
    if (!Number.isFinite(finalPrice)) {
      alert("This product is not available for direct purchase online yet. Please enquire for pricing.");
      return;
    }
    addItem({
      id: selectedVariant ? `${product.id}:${selectedVariant.id}` : product.id,
      name: product.name || product.title,
      price: finalPrice,
      itemType: "product",
      metadata: {
        type: "product",
        productId: product.id,
        variantId: selectedVariant?.id ?? null,
        variantLabel: selectedVariant?.label ?? null,
        variantPrice,
      },
    });
    openCart();
  };

  const relationSections = [
    { key: "related", title: "Related products", items: relatedProducts },
    { key: "upsell", title: "You might also like", items: upsellProducts },
    { key: "cross", title: "Pairs well with", items: crossSellProducts },
  ].filter((section) => section.items.length > 0);

  return (
    <section className="section product-detail">
      <div className="section__inner">
        <Link className="breadcrumb-link" to="/products">
          &lt;- Back to products
        </Link>

        {isLoading && <p className="empty-state">Loading product...</p>}
        {isError && (
          <p className="empty-state">
            {productsError?.message || "We couldn't load this product. Please refresh to try again."}
          </p>
        )}
        {isNotFound && (
          <p className="empty-state">
            This product could not be found. <Link to="/products">Browse the collection instead.</Link>
          </p>
        )}

        {product && (
          <>
            <div className="product-detail__grid">
              <Reveal as="div" className="product-gallery">
                <div className="product-gallery__main">
                  <img src={product.images[activeImageIndex] || product.image} alt={product.title} />
                </div>
                {product.images.length > 1 && (
                  <div className="product-gallery__thumbs">
                    {product.images.map((image, index) => (
                      <button
                        className={`product-thumb${index === activeImageIndex ? " is-active" : ""}`}
                        type="button"
                        key={`${image}-${index}`}
                        onClick={() => setActiveImageIndex(index)}
                        aria-label={`View image ${index + 1}`}
                      >
                        <img src={image} alt={`${product.title} preview ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </Reveal>

              <Reveal as="div" className="product-detail__info" delay={120}>
                <div className="product-detail__meta">
                  {(product.categoryLabels?.length ? product.categoryLabels : ["Product"]).map((label) => (
                    <span key={`${product.id}-category-${label}`} className="badge">
                      {label.replace(/-/g, " ")}
                    </span>
                  ))}
                  {product.stockBadgeLabel && (
                    <span className={`badge badge--stock-${product.stockStatus?.state || "in"}`}>
                      {product.stockBadgeLabel}
                    </span>
                  )}
                </div>
                <h1>{product.title}</h1>
                {product.sku && <p className="product-detail__sku">SKU: {product.sku}</p>}
                <div className="product-detail__price-row">
                  <span className="product-detail__price-current">{displayPrice}</span>
                  {showOriginalPrice && (
                    <span className="product-detail__price-original">{showOriginalPrice}</span>
                  )}
                </div>
                {product.summaryText && (
                  <p className="product-detail__text product-detail__summary">{product.summaryText}</p>
                )}

                {product.variants?.length > 0 && (
                  <label className="modal__meta product-detail__variant">
                    Variant
                    <select
                      className="input"
                      value={selectedVariantId}
                      onChange={(event) => setSelectedVariantId(event.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select a variant
                      </option>
                      {product.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.label}
                          {Number.isFinite(variant.price) ? ` - R${variant.price}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {stockNote && <p className="modal__meta product-detail__stock-note">{stockNote}</p>}

                <div className="product-detail__actions">
                  {product.stockStatus?.state === "out" ? (
                    <button className="btn btn--secondary" type="button" disabled>
                      Out of stock
                    </button>
                  ) : product.variants?.length && !selectedVariant ? (
                    <button className="btn btn--secondary" type="button" disabled>
                      Select variant
                    </button>
                  ) : canPurchase ? (
                    <button className="btn btn--primary" type="button" onClick={handleAddToCart}>
                      {product.stockStatus?.state === "preorder" ? "Preorder now" : "Add to Cart"}
                    </button>
                  ) : (
                    <Link className="btn btn--secondary" to="/contact">
                      Enquire
                    </Link>
                  )}
                </div>

                {product.tagLabels?.length > 0 && (
                  <div className="product-detail__tags">
                    {product.tagLabels.map((tag) => (
                      <span key={`${product.id}-tag-${tag}`} className="badge badge--muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Reveal>
            </div>

            <div className="product-detail__sections">
              {product.detailText && (
                <section className="product-detail__section">
                  <h2>Product details</h2>
                  <p className="product-detail__text">{product.detailText}</p>
                </section>
              )}

              {attributeItems.length > 0 && (
                <section className="product-detail__section">
                  <h2>Plant attributes</h2>
                  <div className="product-detail__attribute-grid">
                    {attributeItems.map((item) => (
                      <div key={item.label} className="product-detail__attribute">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {careItems.length > 0 && (
                <section className="product-detail__section">
                  <h2>Care notes</h2>
                  <div className="product-detail__care-grid">
                    {careItems.map((item) => (
                      <div key={item.label} className="product-detail__care-item">
                        <h3>{item.label}</h3>
                        <p className="product-detail__text">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {product.videoEmbed && (
                <section className="product-detail__section">
                  <h2>Video</h2>
                  {youtubeEmbedUrl ? (
                    <div className="product-detail__video">
                      <iframe
                        src={youtubeEmbedUrl}
                        title={`${product.title} video`}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                  ) : (
                    <p className="product-detail__text">Video unavailable.</p>
                  )}
                </section>
              )}

              {relationSections.map((section) => (
                <section className="product-detail__section" key={section.key}>
                  <h2>{section.title}</h2>
                  <div className="cards-grid product-detail__related-grid">
                    {section.items.map((item) => (
                      <article className="card product-related-card" key={item.id}>
                        <Link to={`/products/${encodeURIComponent(item.slug)}`} aria-label={`View ${item.title}`}>
                          <img
                            className="product-related-card__image"
                            src={item.image}
                            alt={item.title}
                            loading="lazy"
                          />
                        </Link>
                        <h3 className="card__title">
                          <Link to={`/products/${encodeURIComponent(item.slug)}`}>{item.title}</Link>
                        </h3>
                        <p className="card__price">
                          <span className="price-stack">
                            <span className="price-stack__current">{item.displayPrice}</span>
                            {item.originalPrice && (
                              <span className="price-stack__original">{item.originalPrice}</span>
                            )}
                          </span>
                        </p>
                        <Link className="btn btn--secondary" to={`/products/${encodeURIComponent(item.slug)}`}>
                          View details
                        </Link>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default ProductDetailPage;
