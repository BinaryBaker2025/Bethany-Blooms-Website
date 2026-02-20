import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Reveal from "../components/Reveal.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import { formatPreorderSendMonth, getProductPreorderSendMonth } from "../lib/preorder.js";
import {
  getCustomerStockLabel,
  getProductCardStockStatus,
  getStockBadgeLabel,
  getStockStatus,
  getVariantStockStatus,
} from "../lib/stockStatus.js";
import heroBackground from "../assets/photos/workshop-frame-purple.jpg";

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeStockQuantity = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : null;
};

const normalizeGiftCardExpiryDays = (value, fallback = 365) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(1825, Math.floor(parsed)));
};

const normalizeGiftCardAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
};

const normalizeGiftCardOptionQuantity = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(200, parsed);
};

const normalizeGiftCardOptions = (input = []) =>
  (Array.isArray(input) ? input : [])
    .map((option, index) => {
      const label = (option?.label || option?.name || "").toString().trim();
      const amount = normalizeGiftCardAmount(option?.amount ?? option?.price);
      if (!label || !Number.isFinite(amount)) return null;
      return {
        id:
          (option?.id || "").toString().trim() ||
          `gift-card-option-${index + 1}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label,
        amount,
      };
    })
    .filter(Boolean);

const normalizeCutFlowerGiftCardOptions = (classes = []) => {
  const unique = new Map();
  (Array.isArray(classes) ? classes : [])
    .filter((classDoc) => (classDoc?.status ?? "live") === "live")
    .forEach((classDoc) => {
      const options = Array.isArray(classDoc?.options) ? classDoc.options : [];
      options.forEach((option, index) => {
        if (!option || typeof option !== "object") return;
        const label = (option.label || option.name || option.value || "").toString().trim();
        const amount = normalizeGiftCardAmount(option.price ?? option.amount);
        if (!label || !Number.isFinite(amount)) return;
        const rawId =
          option.value ||
          option.id ||
          option.label ||
          `${classDoc?.id || "class"}-option-${index + 1}`;
        const id = rawId.toString().trim();
        if (!id) return;
        if (!unique.has(id)) {
          unique.set(id, {
            id,
            label,
            amount,
          });
          return;
        }
        const existing = unique.get(id);
        unique.set(id, {
          id,
          label: existing?.label || label,
          amount,
        });
      });
    });
  return Array.from(unique.values()).sort((a, b) => {
    if (a.amount !== b.amount) return a.amount - b.amount;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
};

const buildGiftCardCartItemId = ({
  productId = "",
  selectedOptionKeys = [],
  purchaserName = "",
  recipientName = "",
  message = "",
} = {}) => {
  const base = [
    productId,
    selectedOptionKeys.join(","),
    purchaserName.trim().toLowerCase(),
    recipientName.trim().toLowerCase(),
    message.trim().toLowerCase(),
  ].join("|");
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash * 31 + base.charCodeAt(index)) >>> 0;
  }
  const normalizedProductId = (productId || "gift-card").toString().replace(/[^a-zA-Z0-9_-]/g, "-");
  return `gift-card:${normalizedProductId}:${hash.toString(36)}`;
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
  const stockStatus = getProductCardStockStatus(product);
  const stockBadgeLabel = getStockBadgeLabel(stockStatus);
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
    stockStatus,
    stockBadgeLabel,
    isOutOfStock: stockStatus?.state === "out",
  };
};

function ProductDetailPage() {
  const { productId } = useParams();
  const slugParam = useMemo(() => decodeURIComponent(productId || "").toLowerCase(), [productId]);
  const { items, addItem } = useCart();
  const { notifyCart } = useModal();
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
  const { items: cutFlowerClassItems } = useFirestoreCollection("cutFlowerClasses", {
    orderByField: "eventDate",
    orderDirection: "asc",
  });
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [giftCardOptionQuantities, setGiftCardOptionQuantities] = useState({});
  const [giftCardPurchaserName, setGiftCardPurchaserName] = useState("");
  const [giftCardRecipientName, setGiftCardRecipientName] = useState("");
  const [giftCardMessage, setGiftCardMessage] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const addedTimeoutRef = useRef(null);
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
    const preorderSendMonth = getProductPreorderSendMonth(productRecord);
    const preorderSendMonthLabel = formatPreorderSendMonth(preorderSendMonth);

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
      preorderSendMonth,
      preorderSendMonthLabel,
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
      isGiftCard: Boolean(productRecord.isGiftCard || productRecord.is_gift_card),
      giftCardExpiryDays: normalizeGiftCardExpiryDays(
        productRecord.giftCardExpiryDays || productRecord.gift_card_expiry_days || 365,
        365,
      ),
      giftCardTerms: (
        productRecord.giftCardTerms ||
        productRecord.gift_card_terms ||
        "Gift card is redeemable for selected Bethany Blooms services or products. Non-refundable and not exchangeable for cash."
      )
        .toString()
        .trim(),
      giftCardOptions: normalizeGiftCardOptions(
        Array.isArray(productRecord.giftCardOptions)
          ? productRecord.giftCardOptions
          : Array.isArray(productRecord.gift_card_options)
          ? productRecord.gift_card_options
          : [],
      ),
      variants: Array.isArray(productRecord.variants)
        ? productRecord.variants
            .map((variant) => {
              const label = (variant.label || variant.name || "").toString().trim();
              if (!label) return null;
              const priceValue = normalizeNumber(variant.price);
              const stockQuantity = normalizeStockQuantity(
                variant.stock_quantity ?? variant.stockQuantity ?? variant.quantity,
              );
              const stockStatus = getVariantStockStatus(variant, productRecord);
              return {
                id: (variant.id || label).toString(),
                label,
                price: Number.isFinite(priceValue) ? priceValue : null,
                stockQuantity,
                stockStatus,
              };
            })
            .filter(Boolean)
        : [],
    };
  }, [productRecord, categoryLookup, tagLookup]);

  useEffect(() => {
    if (!product?.id) return;
    setSelectedVariantId("");
    setGiftCardOptionQuantities({});
    setGiftCardPurchaserName("");
    setGiftCardRecipientName("");
    setGiftCardMessage("");
    setActiveImageIndex(0);
  }, [product?.id]);

  const selectedVariant = product?.variants?.find((variant) => variant.id === selectedVariantId) || null;
  const isGiftCardProduct = Boolean(product?.isGiftCard);
  const dynamicGiftCardOptions = useMemo(
    () => normalizeCutFlowerGiftCardOptions(cutFlowerClassItems),
    [cutFlowerClassItems],
  );
  const effectiveGiftCardOptions = useMemo(() => {
    if (!isGiftCardProduct) return [];
    if (dynamicGiftCardOptions.length > 0) return dynamicGiftCardOptions;
    return Array.isArray(product?.giftCardOptions) ? product.giftCardOptions : [];
  }, [dynamicGiftCardOptions, isGiftCardProduct, product?.giftCardOptions]);

  useEffect(() => {
    if (!isGiftCardProduct) return;
    const validOptionIds = new Set((effectiveGiftCardOptions || []).map((option) => option.id));
    setGiftCardOptionQuantities((prev) => {
      const entries = Object.entries(prev || {});
      if (entries.length === 0) return prev;
      let changed = false;
      const next = {};
      entries.forEach(([optionId, quantity]) => {
        if (validOptionIds.has(optionId)) {
          next[optionId] = quantity;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [effectiveGiftCardOptions, isGiftCardProduct]);

  const giftCardSelectedBreakdown = useMemo(() => {
    if (!isGiftCardProduct || !Array.isArray(effectiveGiftCardOptions)) return [];
    return effectiveGiftCardOptions
      .map((option) => {
        const quantity = normalizeGiftCardOptionQuantity(giftCardOptionQuantities?.[option.id]);
        if (quantity <= 0) return null;
        return {
          ...option,
          quantity,
          lineTotal: Number((Number(option.amount || 0) * quantity).toFixed(2)),
        };
      })
      .filter(Boolean);
  }, [effectiveGiftCardOptions, giftCardOptionQuantities, isGiftCardProduct]);
  const selectedGiftCardOptions = useMemo(
    () =>
      giftCardSelectedBreakdown.map((option) => ({
        id: option.id,
        label: option.label,
        amount: Number(option.amount || 0),
        quantity: option.quantity,
      })),
    [giftCardSelectedBreakdown],
  );
  const giftCardSelectedCount = useMemo(
    () =>
      giftCardSelectedBreakdown.reduce((sum, option) => {
        const quantity = normalizeGiftCardOptionQuantity(option.quantity);
        return sum + quantity;
      }, 0),
    [giftCardSelectedBreakdown],
  );
  const giftCardSelectedTotal = useMemo(
    () =>
      giftCardSelectedBreakdown.reduce((sum, option) => {
        const lineTotal = Number(option.lineTotal);
        return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
      }, 0),
    [giftCardSelectedBreakdown],
  );
  const giftCardHasNamedRecipient = Boolean(
    (giftCardPurchaserName || "").toString().trim() || (giftCardRecipientName || "").toString().trim(),
  );
  const hasVariants = !isGiftCardProduct && Boolean(product?.variants?.length);
  const allVariantsOutOfStock = isGiftCardProduct ?
     false
    : hasVariants &&
      product.variants.every((variant) => variant.stockStatus?.state === "out");
  const activeStockStatus = useMemo(() => {
    if (isGiftCardProduct) {
      return { state: "in", quantity: null };
    }
    if (hasVariants) return selectedVariant?.stockStatus || null;
    return product?.stockStatus || null;
  }, [
    hasVariants,
    isGiftCardProduct,
    product?.stockStatus,
    selectedVariant?.stockStatus,
  ]);
  const isSelectionOutOfStock = isGiftCardProduct ?
     false
    : hasVariants && !selectedVariant ?
     false
    : activeStockStatus?.state === "out" ||
      (activeStockStatus?.state !== "preorder" &&
        Number.isFinite(activeStockStatus?.quantity) &&
        activeStockStatus.quantity <= 0);
  const variantPrice = !isGiftCardProduct && Number.isFinite(selectedVariant?.price) ? selectedVariant.price : null;
  const activeGiftCardPrice =
    isGiftCardProduct && giftCardSelectedCount > 0 ? giftCardSelectedTotal : product?.numericPrice;
  const activePrice = isGiftCardProduct ? activeGiftCardPrice : Number.isFinite(variantPrice) ? variantPrice : product?.numericPrice;
  const displayPrice = product ?
     Number.isFinite(activePrice) ? `R${activePrice.toFixed(2)}` : product.displayPrice
    : "";
  const showOriginalPrice = product && !isGiftCardProduct && !Number.isFinite(variantPrice) ? product.originalPrice : null;
  const canPurchase = product ?
     isGiftCardProduct
      ? giftCardSelectedCount > 0 && giftCardHasNamedRecipient && Number.isFinite(activePrice)
      : hasVariants
        ? Boolean(selectedVariant) &&
          !isSelectionOutOfStock &&
          (Number.isFinite(variantPrice) || product.isPurchasable)
        : product.isPurchasable && !isSelectionOutOfStock
    : false;
  const youtubeEmbedUrl = product ? getYouTubeEmbedUrl(product.videoEmbed) : "";

  const stockNote = useMemo(() => {
    if (isGiftCardProduct) {
      return "Gift cards are delivered by email and can be downloaded or printed after payment.";
    }
    if (hasVariants && !selectedVariant) {
      return allVariantsOutOfStock ?
         "All variants are currently out of stock."
        : "Select a variant to view availability.";
    }
    if (!activeStockStatus) return "";
    const { state } = activeStockStatus;
    if (state === "preorder") {
      return product.preorderSendMonthLabel
        ? `Preorder now. Shipping starts ${product.preorderSendMonthLabel}.`
        : "Preorder now to reserve this item.";
    }
    if (state === "out") return "Out of stock.";
    const availabilityLabel = getCustomerStockLabel(activeStockStatus);
    if (availabilityLabel) return availabilityLabel;
    return "";
  }, [
    activeStockStatus,
    allVariantsOutOfStock,
    hasVariants,
    isGiftCardProduct,
    product,
    selectedVariant,
  ]);

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
  const canonicalProductSlug = (product?.slug || product?.id || productId || "").toString().trim();
  const canonicalProductPath = canonicalProductSlug
    ? `/products/${encodeURIComponent(canonicalProductSlug)}`
    : "/products";

  usePageMetadata({
    title: pageTitle,
    description: pageDescription,
    keywords: pageKeywords,
    canonicalPath: canonicalProductPath,
  });

  const isLoading = productsStatus === "loading";
  const isError = productsStatus === "error";
  const isNotFound = !isLoading && !isError && !product;

  const showOutOfStockMessage = () => {
    if (selectedVariant?.label) {
      notifyCart(`${selectedVariant.label} is out of stock.`);
      return;
    }
    if (allVariantsOutOfStock) {
      notifyCart("All variants for this product are out of stock.");
      return;
    }
    notifyCart("This item is out of stock.");
  };

  const handleGiftCardOptionQuantityChange = (optionId, nextValue) => {
    if (!optionId) return;
    const quantity = normalizeGiftCardOptionQuantity(nextValue);
    setGiftCardOptionQuantities((prev) => {
      const next = { ...(prev || {}) };
      if (quantity <= 0) {
        delete next[optionId];
      } else {
        next[optionId] = quantity;
      }
      return next;
    });
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (isGiftCardProduct) {
      if (giftCardSelectedCount <= 0) {
        notifyCart("Select at least one gift card option before adding to cart.");
        return;
      }
      if (!giftCardHasNamedRecipient) {
        notifyCart("Add at least one name (purchaser or recipient) for this gift card.");
        return;
      }
      if (!Number.isFinite(activePrice) || activePrice <= 0) {
        notifyCart("This gift card selection is not purchasable yet.");
        return;
      }

      const purchaserName = giftCardPurchaserName.toString().trim();
      const recipientName = giftCardRecipientName.toString().trim() || purchaserName;
      const message = giftCardMessage.toString().trim();
      const selectedOptionKeys = selectedGiftCardOptions
        .map((option) => `${option.id}:${normalizeGiftCardOptionQuantity(option.quantity) || 1}`)
        .sort();
      const cartItemId = buildGiftCardCartItemId({
        productId: product.id,
        selectedOptionKeys,
        purchaserName,
        recipientName,
        message,
      });

      addItem({
        id: cartItemId,
        name: product.name || product.title,
        price: activePrice,
        itemType: "product",
        metadata: {
          type: "product",
          productId: product.id,
          variantId: null,
          variantLabel: null,
          variantPrice: null,
          stockStatus: "in",
          stockQuantity: null,
          giftCard: {
            isGiftCard: true,
            purchaserName,
            recipientName,
            message,
            selectedOptions: selectedGiftCardOptions.map((option) => ({
              id: option.id,
              label: option.label,
              amount: option.amount,
              quantity: normalizeGiftCardOptionQuantity(option.quantity) || 1,
            })),
            selectedOptionCount: giftCardSelectedCount,
            selectedTotal: activePrice,
            expiryDays: product.giftCardExpiryDays || 365,
            terms: product.giftCardTerms || "",
            productTitle: product.title,
          },
          isGiftCard: true,
        },
      });
      notifyCart("Gift card added to cart.");
      setJustAdded(true);
      if (addedTimeoutRef.current) {
        clearTimeout(addedTimeoutRef.current);
      }
      addedTimeoutRef.current = setTimeout(() => {
        setJustAdded(false);
      }, 1600);
      return;
    }

    if (isSelectionOutOfStock) {
      showOutOfStockMessage();
      return;
    }
    if (hasVariants && !selectedVariant) {
      notifyCart("Please select a variant before adding this product to your cart.");
      return;
    }
    const finalPrice = Number.isFinite(variantPrice) ? variantPrice : product.numericPrice;
    if (!Number.isFinite(finalPrice)) {
      notifyCart("This product is not available for direct purchase online yet. Please enquire for pricing.");
      return;
    }
    const cartItemId = selectedVariant ? `${product.id}:${selectedVariant.id}` : product.id;
    const existingItem = items.find((entry) => entry.id === cartItemId);
    const existingQuantity = Number(existingItem?.quantity) || 0;
    if (Number.isFinite(activeStockStatus?.quantity) && activeStockStatus.quantity <= 0) {
      showOutOfStockMessage();
      return;
    }
    if (Number.isFinite(activeStockStatus?.quantity) && existingQuantity >= activeStockStatus.quantity) {
      notifyCart(`Only ${activeStockStatus.quantity} available for this selection.`);
      return;
    }
    addItem({
      id: cartItemId,
      name: product.name || product.title,
      price: finalPrice,
      itemType: "product",
      metadata: {
        type: "product",
        productId: product.id,
        variantId: selectedVariant?.id ?? null,
        variantLabel: selectedVariant?.label ?? null,
        variantPrice,
        stockStatus: activeStockStatus?.state || null,
        stockQuantity: Number.isFinite(activeStockStatus?.quantity) ? activeStockStatus.quantity : null,
        preorderSendMonth: activeStockStatus?.state === "preorder" ? product.preorderSendMonth || null : null,
        preorderSendMonthLabel:
          activeStockStatus?.state === "preorder" ? product.preorderSendMonthLabel || null : null,
        isGiftCard: false,
      },
    });
    notifyCart("Item added to cart");
    setJustAdded(true);
    if (addedTimeoutRef.current) {
      clearTimeout(addedTimeoutRef.current);
    }
    addedTimeoutRef.current = setTimeout(() => {
      setJustAdded(false);
    }, 1600);
  };

  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) {
        clearTimeout(addedTimeoutRef.current);
      }
    };
  }, []);

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
                  <img src={product.images[activeImageIndex] || product.image} alt={product.title} loading="lazy" decoding="async"/>
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
                        <img src={image} alt={`${product.title} preview ${index + 1}`} loading="lazy" decoding="async"/>
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

                {isGiftCardProduct && (
                  <div className="product-detail__gift-card-config">
                    <h2>Build your gift card</h2>
                    <p className="modal__meta">
                      Pick cut flower options and set quantities. The total gift card value updates automatically.
                    </p>
                    {effectiveGiftCardOptions?.length > 0 ? (
                      <div className="product-detail__gift-card-options">
                        {effectiveGiftCardOptions.map((option) => {
                          const quantity = normalizeGiftCardOptionQuantity(giftCardOptionQuantities?.[option.id]);
                          return (
                            <div
                              key={option.id}
                              className={`product-detail__gift-card-option${quantity > 0 ? " is-selected" : ""}`}
                            >
                              <span>{option.label}</span>
                              <strong>R{option.amount.toFixed(2)}</strong>
                              <div className="product-detail__gift-card-option-qty">
                                <button
                                  className="cart-list__stepper-btn"
                                  type="button"
                                  onClick={() =>
                                    handleGiftCardOptionQuantityChange(option.id, Math.max(0, quantity - 1))
                                  }
                                  disabled={quantity <= 0}
                                  aria-label={`Decrease ${option.label} quantity`}
                                >
                                  -
                                </button>
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  max="200"
                                  step="1"
                                  value={quantity}
                                  onChange={(event) =>
                                    handleGiftCardOptionQuantityChange(option.id, event.target.value)
                                  }
                                  aria-label={`${option.label} quantity`}
                                />
                                <button
                                  className="cart-list__stepper-btn"
                                  type="button"
                                  onClick={() => handleGiftCardOptionQuantityChange(option.id, quantity + 1)}
                                  aria-label={`Increase ${option.label} quantity`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="admin-panel__error">
                        No cut flower options are available yet. Add pricing options in Cut Flower Classes.
                      </p>
                    )}
                    {dynamicGiftCardOptions.length > 0 && (
                      <p className="modal__meta">Options are synced live from Cut Flower Classes.</p>
                    )}
                    <p className="modal__meta">
                      Selected options: {giftCardSelectedCount} | Option types: {selectedGiftCardOptions.length} | Gift
                      card total: R{giftCardSelectedTotal.toFixed(2)}
                    </p>
                    <div className="product-detail__gift-card-fields">
                      <label className="modal__meta product-detail__gift-card-field">
                        Purchaser name
                        <input
                          className="input"
                          type="text"
                          maxLength={120}
                          value={giftCardPurchaserName}
                          onChange={(event) => setGiftCardPurchaserName(event.target.value)}
                          placeholder="Name of purchaser"
                        />
                      </label>
                      <label className="modal__meta product-detail__gift-card-field">
                        Recipient name
                        <input
                          className="input"
                          type="text"
                          maxLength={120}
                          value={giftCardRecipientName}
                          onChange={(event) => setGiftCardRecipientName(event.target.value)}
                          placeholder="Name on the gift card"
                        />
                      </label>
                      <label className="modal__meta product-detail__gift-card-field">
                        Message (optional)
                        <textarea
                          className="input textarea"
                          rows="3"
                          maxLength={320}
                          value={giftCardMessage}
                          onChange={(event) => setGiftCardMessage(event.target.value)}
                          placeholder="Short message for the card"
                        />
                      </label>
                    </div>
                    {product.giftCardTerms && (
                      <p className="modal__meta product-detail__gift-card-terms">{product.giftCardTerms}</p>
                    )}
                    {!giftCardHasNamedRecipient && (
                      <p className="admin-panel__error">
                        Add at least one name to personalize this gift card.
                      </p>
                    )}
                  </div>
                )}

                {!isGiftCardProduct && hasVariants && (
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
                      {product.variants.map((variant) => {
                        const variantStockLabel = getCustomerStockLabel(variant.stockStatus);
                        return (
                          <option key={variant.id} value={variant.id}>
                            {variant.label}
                            {Number.isFinite(variant.price) ? ` - R${variant.price}` : ""}
                            {variantStockLabel ? ` - ${variantStockLabel}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                )}

                {stockNote && <p className="modal__meta product-detail__stock-note">{stockNote}</p>}

                <div className="product-detail__actions">
                  {isGiftCardProduct && giftCardSelectedCount <= 0 ? (
                    <button className="btn btn--secondary" type="button" disabled>
                      Select gift card options
                    </button>
                  ) : isGiftCardProduct && !giftCardHasNamedRecipient ? (
                    <button className="btn btn--secondary" type="button" disabled>
                      Add purchaser or recipient name
                    </button>
                  ) : hasVariants && !selectedVariant ? (
                    <button className="btn btn--secondary" type="button" disabled>
                      Select variant
                    </button>
                  ) : isSelectionOutOfStock ? (
                    <button className="btn btn--secondary" type="button" onClick={showOutOfStockMessage}>
                      Out of stock
                    </button>
                  ) : canPurchase ? (
                    <button
                      className={`btn btn--primary ${justAdded ? "is-added" : ""}`}
                      type="button"
                      onClick={handleAddToCart}
                    >
                      {justAdded
                        ? "Added!"
                        : isGiftCardProduct
                        ? "Add Gift Card"
                        : activeStockStatus?.state === "preorder"
                        ? "Preorder now"
                        : "Add to Cart"}
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
                    {section.items.map((item) => {
                      const categoryLabel = (item.categoryLabels?.[0] || item.category || "Product")
                        .toString()
                        .replace(/[-_]+/g, " ");
                      const description = item.summaryText || item.shortDescription || item.description || "";
                      const productUrl = `/products/${encodeURIComponent(item.slug)}`;
                      return (
                        <Link
                          className="card product-card product-card--link product-related-card"
                          to={productUrl}
                          key={item.id}
                        >
                          <span className="product-card__category">{categoryLabel}</span>
                          <div className="product-card__media" aria-hidden="true">
                            <img
                              className="product-card__image"
                              src={item.image}
                              alt=""
                              loading="lazy" decoding="async"/>
                            {item.stockBadgeLabel && (
                              <span
                                className={`badge badge--stock-${item.stockStatus?.state || "in"} product-card__badge`}
                              >
                                {item.stockBadgeLabel}
                              </span>
                            )}
                          </div>
                          <h3 className="card__title">{item.title}</h3>
                          <p className="product-card__description">{description}</p>
                          <p className="card__price">
                            <span className="price-stack">
                              <span className="price-stack__current">{item.displayPrice}</span>
                              {item.originalPrice && (
                                <span className="price-stack__original">{item.originalPrice}</span>
                              )}
                            </span>
                          </p>
                          <span className="btn btn--secondary">
                            {item.isOutOfStock ? "Out of stock" : "View details"}
                          </span>
                        </Link>
                      );
                    })}
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
