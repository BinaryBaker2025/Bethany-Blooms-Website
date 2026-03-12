import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import Reveal from "../../components/Reveal.jsx";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { usePageMetadata } from "../../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection.js";
import { getFirebaseFunctions } from "../../lib/firebase.js";
import {
  buildSelectedGiftCardOptions,
  collectLiveCutFlowerGiftCardOptions,
  getWholeCrewSelectionValidation,
  isWholeCrewOption,
  normalizeGiftCardOptionQuantity,
  summarizeGiftCardSelectedOptions,
} from "../../lib/giftCardStudio.js";

const moneyFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

const ADMIN_GIFT_CARD_MODE_CATALOG_ITEM = "catalog-item";
const ADMIN_GIFT_CARD_MODE_CUSTOM_GIVEAWAY = "custom-giveaway";
const ADMIN_GIFT_CARD_MODE_MULTI_ITEM = "multi-item";
const ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT = "product";
const ADMIN_GIFT_CARD_ITEM_TYPE_WORKSHOP = "workshop";
const ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS = "cut-flower-class";
const ADMIN_GIFT_CARD_DEFAULT_EXPIRY_DAYS = "365";
const ADMIN_GIFT_CARD_REDEMPTION_SCOPE_OPTIONS = Object.freeze([
  { value: "both", label: "In-store & Online" },
  { value: "instore", label: "In-store only" },
  { value: "online", label: "Online only" },
]);
const ADMIN_GIFT_CARD_REDEMPTION_SCOPE_DESCRIPTIONS = Object.freeze({
  both: "Redeem at checkout online or in person at the farm.",
  instore: "Use this card only for in-person purchases and bookings.",
  online: "Use this card only through the website checkout flow.",
});
const ADMIN_GIFT_CARD_MODE_OPTIONS = Object.freeze([
  { value: ADMIN_GIFT_CARD_MODE_CATALOG_ITEM, label: "Catalog item" },
  { value: ADMIN_GIFT_CARD_MODE_CUSTOM_GIVEAWAY, label: "Custom giveaway" },
]);
const ADMIN_GIFT_CARD_ITEM_TYPE_OPTIONS = Object.freeze([
  { value: ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT, label: "Products" },
  { value: ADMIN_GIFT_CARD_ITEM_TYPE_WORKSHOP, label: "Workshops" },
  { value: ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS, label: "Classes" },
]);

const GIFT_CARD_STUDIO_CALLABLE_HELP_MESSAGE =
  "Gift card studio functions are unreachable. Deploy `previewAdminGiveawayGiftCard`, " +
  "`saveAdminGiveawayGiftCardDraft`, `createAdminGiveawayGiftCardFromDraft`, `adminUpdateGiftCard`, and " +
  "`adminArchiveGiftCard`, `adminBackfillGiftCardRegistry` " +
  "or run the Functions emulator (`firebase emulators:start --only functions`) with " +
  "`VITE_USE_LOCAL_FUNCTIONS=true` in `frontend/.env.local`.";

const parseNumber = (value, fallback = null) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const normalizeGiftCardExpiryDays = (value, fallback = 365) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(1825, Math.floor(parsed)));
};

const formatPriceLabel = (value) => {
  if (value === undefined || value === null) return "-";
  if (typeof value === "number") return moneyFormatter.format(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return moneyFormatter.format(numeric);
  return value;
};

const formatAdminGiftCardItemDate = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const resolveGiftCardStudioCallableError = (callableError, fallbackMessage) => {
  const rawMessage = (callableError?.message || "").toString();
  const normalizedMessage = rawMessage.trim().toLowerCase();
  const normalizedCode = (callableError?.code || "").toString().trim().toLowerCase();
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const likelyUnreachableCallable =
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("cors") ||
    normalizedMessage.includes("access-control-allow-origin") ||
    normalizedCode.includes("unavailable") ||
    normalizedCode.includes("not-found");
  if (isLocalHost && likelyUnreachableCallable) {
    return GIFT_CARD_STUDIO_CALLABLE_HELP_MESSAGE;
  }
  return rawMessage || fallbackMessage;
};

const copyTextWithFallback = async (value = "") => {
  const text = (value || "").toString().trim();
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const tempArea = document.createElement("textarea");
    tempArea.value = text;
    tempArea.setAttribute("readonly", "true");
    tempArea.style.position = "absolute";
    tempArea.style.left = "-9999px";
    document.body.appendChild(tempArea);
    tempArea.select();
    document.execCommand("copy");
    document.body.removeChild(tempArea);
    return true;
  } catch {
    return false;
  }
};

const resolveAdminCatalogGiftCardProductBasePrice = (product = {}) => {
  const salePrice = parseNumber(product?.sale_price ?? product?.salePrice, null);
  if (Number.isFinite(salePrice) && salePrice > 0) return salePrice;
  const price = parseNumber(product?.price, null);
  return Number.isFinite(price) && price > 0 ? price : null;
};

const resolveAdminCatalogGiftCardClassBasePrice = (classDoc = {}) => {
  const price = parseNumber(classDoc?.price, null);
  return Number.isFinite(price) && price > 0 ? price : null;
};

const buildLegacyAdminGiftCardProducts = (products = []) =>
  (Array.isArray(products) ? products : [])
    .filter((product) => {
      const isGiftCard = Boolean(product?.isGiftCard || product?.is_gift_card);
      if (!isGiftCard) return false;
      const status = (product?.status || "live").toString().trim().toLowerCase();
      return status !== "archived";
    })
    .map((product) => ({
      id: (product.id || "").toString().trim(),
      title: (product.title || product.name || "Gift Card").toString().trim(),
      expiryDays: normalizeGiftCardExpiryDays(
        product?.giftCardExpiryDays || product?.gift_card_expiry_days || 365,
        365,
      ),
    }))
    .filter((product) => product.id)
    .sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" }),
    );

const isLivePublicCatalogItem = (entry = {}) => {
  const status = (entry?.status || "live").toString().trim().toLowerCase();
  const visibility = (entry?.visibility || "").toString().trim().toLowerCase();
  if (
    entry?.archived ||
    entry?.isArchived ||
    entry?.hidden ||
    entry?.isHidden ||
    entry?.public === false ||
    entry?.isPublic === false ||
    entry?.published === false ||
    entry?.isPublished === false ||
    entry?.listed === false ||
    entry?.isListed === false
  ) {
    return false;
  }
  if (!["", "live", "active", "published", "scheduled"].includes(status)) {
    return false;
  }
  if (["archived", "deleted", "draft", "hidden", "inactive", "private", "unlisted"].includes(status)) {
    return false;
  }
  if (["hidden", "private", "unlisted"].includes(visibility)) {
    return false;
  }
  return true;
};

function useAdminCatalogGiftCardInventory({
  products = [],
  workshops = [],
  cutFlowerClasses = [],
} = {}) {
  return useMemo(() => {
    const productItems = (Array.isArray(products) ? products : [])
      .filter((product) => {
        if (!isLivePublicCatalogItem(product)) return false;
        if (product?.isGiftCard || product?.is_gift_card) return false;
        const variants = Array.isArray(product?.variants) ? product.variants : [];
        const hasPositiveVariant = variants.some((variant) => {
          const price = parseNumber(variant?.price, null);
          return Number.isFinite(price) && price > 0;
        });
        const basePrice = resolveAdminCatalogGiftCardProductBasePrice(product);
        return hasPositiveVariant || (Number.isFinite(basePrice) && basePrice > 0);
      })
      .map((product) => {
        const variants = (Array.isArray(product?.variants) ? product.variants : [])
          .map((variant, index) => {
            const label = (variant?.label || variant?.name || `Variant ${index + 1}`)
              .toString()
              .trim();
            const price = parseNumber(variant?.price, null);
            if (!label || !Number.isFinite(price) || price <= 0) return null;
            return {
              id: (variant?.id || label).toString().trim() || `variant-${index + 1}`,
              label,
              price,
            };
          })
          .filter(Boolean);
        const unitPrice = resolveAdminCatalogGiftCardProductBasePrice(product);
        const title = (product?.title || product?.name || "Bethany Blooms Product").toString().trim();
        return {
          id: (product?.id || "").toString().trim(),
          title,
          unitPrice,
          variants,
          type: ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT,
        };
      })
      .filter((product) => product.id)
      .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));

    const workshopItems = (Array.isArray(workshops) ? workshops : [])
      .filter((workshop) => {
        if (!isLivePublicCatalogItem(workshop)) return false;
        const price = parseNumber(workshop?.price, null);
        return Number.isFinite(price) && price > 0;
      })
      .map((workshop) => ({
        id: (workshop?.id || "").toString().trim(),
        title: (workshop?.title || workshop?.name || "Workshop").toString().trim(),
        unitPrice: parseNumber(workshop?.price, 0),
        metaLabel: formatAdminGiftCardItemDate(workshop?.scheduledFor),
        type: ADMIN_GIFT_CARD_ITEM_TYPE_WORKSHOP,
      }))
      .filter((workshop) => workshop.id)
      .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));

    const classItems = (Array.isArray(cutFlowerClasses) ? cutFlowerClasses : [])
      .filter((classDoc) => {
        if (!isLivePublicCatalogItem(classDoc)) return false;
        const basePrice = resolveAdminCatalogGiftCardClassBasePrice(classDoc);
        const options = Array.isArray(classDoc?.options) ? classDoc.options : [];
        const hasPositiveOption = options.some((option) => {
          const price = parseNumber(option?.price ?? option?.amount, null);
          return Number.isFinite(price) && price > 0;
        });
        return hasPositiveOption || (Number.isFinite(basePrice) && basePrice > 0);
      })
      .map((classDoc) => ({
        id: (classDoc?.id || "").toString().trim(),
        title: (classDoc?.title || classDoc?.name || "Class").toString().trim(),
        unitPrice: resolveAdminCatalogGiftCardClassBasePrice(classDoc),
        metaLabel: formatAdminGiftCardItemDate(classDoc?.eventDate),
        options: (Array.isArray(classDoc?.options) ? classDoc.options : [])
          .map((option, index) => {
            const label = (option?.label || option?.name || `Option ${index + 1}`).toString().trim();
            const price = parseNumber(option?.price ?? option?.amount, null);
            if (!label || !Number.isFinite(price) || price <= 0) return null;
            return {
              id: (option?.id || option?.value || label).toString().trim() || `option-${index + 1}`,
              label,
              price,
            };
          })
          .filter(Boolean),
        type: ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS,
      }))
      .filter((classDoc) => classDoc.id)
      .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));

    return {
      [ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT]: productItems,
      [ADMIN_GIFT_CARD_ITEM_TYPE_WORKSHOP]: workshopItems,
      [ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS]: classItems,
    };
  }, [products, workshops, cutFlowerClasses]);
}

const resolveAdminCatalogGiftCardSelection = ({
  catalogItemsByType = {},
  itemType = ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT,
  sourceId = "",
  variantId = "",
  optionId = "",
  quantity = "",
} = {}) => {
  const items = Array.isArray(catalogItemsByType?.[itemType]) ? catalogItemsByType[itemType] : [];
  const selectedItem = items.find((item) => item.id === sourceId) || null;
  const selectedVariant =
    itemType === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT && selectedItem?.variants?.length
      ? selectedItem.variants.find((variant) => variant.id === variantId) || null
      : null;
  const selectedOption =
    itemType === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS && selectedItem?.options?.length
      ? selectedItem.options.find((option) => option.id === optionId) || null
      : null;
  const quantityValue = normalizeGiftCardOptionQuantity(quantity, 0);
  const unitPrice =
    itemType === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT
      ? selectedItem?.variants?.length
        ? selectedVariant?.price ?? null
        : selectedItem?.unitPrice ?? null
      : itemType === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS
        ? selectedItem?.options?.length
          ? selectedOption?.price ?? null
          : selectedItem?.unitPrice ?? null
        : selectedItem?.unitPrice ?? null;
  const quantityLabel =
    itemType === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT ? "Quantity" : "Attendees";
  let errorMessage = "";
  if (!selectedItem) {
    errorMessage = "Select a catalog item.";
  } else if (
    itemType === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT &&
    selectedItem?.variants?.length > 0 &&
    !selectedVariant
  ) {
    errorMessage = "Select a product variant.";
  } else if (
    itemType === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS &&
    selectedItem?.options?.length > 0 &&
    !selectedOption
  ) {
    errorMessage = "Select a class option.";
  } else if (quantityValue <= 0) {
    errorMessage = `Enter a valid ${quantityLabel.toLowerCase()}.`;
  } else if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    errorMessage = "Selected item does not have a valid price.";
  }
  const total =
    Number.isFinite(unitPrice) && quantityValue > 0
      ? Number((unitPrice * quantityValue).toFixed(2))
      : 0;
  return {
    items,
    selectedItem,
    selectedVariant,
    selectedOption,
    quantityValue,
    quantityLabel,
    unitPrice,
    total,
    canSubmit: !errorMessage,
    errorMessage,
  };
};

const buildAdminCatalogGiftCardPayload = ({
  itemType,
  sourceId,
  variantId,
  optionId,
  quantityValue,
  recipientName,
  purchaserName,
  message,
  expiryDays,
} = {}) => ({
  mode: ADMIN_GIFT_CARD_MODE_CATALOG_ITEM,
  itemType,
  sourceId,
  ...(variantId ? { variantId } : {}),
  ...(optionId ? { optionId } : {}),
  quantity: quantityValue,
  recipientName: (recipientName || "").toString().trim(),
  purchaserName: (purchaserName || "").toString().trim(),
  message: (message || "").toString().trim(),
  expiryDays: normalizeGiftCardExpiryDays(expiryDays, 365),
});

const createInitialCatalogGiftCardForm = () => ({
  itemType: ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT,
  sourceId: "",
  variantId: "",
  optionId: "",
  quantity: "1",
  recipientName: "",
  purchaserName: "",
  message: "",
  expiryDays: ADMIN_GIFT_CARD_DEFAULT_EXPIRY_DAYS,
});

const normalizeRegistryGiftCardMode = (value = "") =>
  (value || "").toString().trim().toLowerCase() === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM
    ? ADMIN_GIFT_CARD_MODE_CATALOG_ITEM
    : ADMIN_GIFT_CARD_MODE_CUSTOM_GIVEAWAY;

const getGiftCardModeLabel = (value = "") =>
  normalizeRegistryGiftCardMode(value) === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM
    ? "Catalog item"
    : "Custom giveaway";

const getCatalogItemKindLabel = (kind = "") => {
  switch ((kind || "").toString().trim().toLowerCase()) {
    case ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT:
      return "Product";
    case ADMIN_GIFT_CARD_ITEM_TYPE_WORKSHOP:
      return "Workshop";
    case ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS:
      return "Class";
    default:
      return "Catalog item";
  }
};

const getRedemptionScopeLabel = (value = "") => {
  switch ((value || "").toString().trim().toLowerCase()) {
    case "instore":
      return "In-store only";
    case "online":
      return "Online only";
    case "both":
    default:
      return "In-store & online";
  }
};

const buildCatalogItemSummary = (catalogItemRef = null) => {
  if (!catalogItemRef || typeof catalogItemRef !== "object") return "";
  const parts = [
    catalogItemRef.titleSnapshot || "",
    catalogItemRef.variantLabel || catalogItemRef.optionLabel || "",
  ].filter(Boolean);
  return parts.join(" | ");
};

function AdminGiftCardModeSwitch({ value, onChange }) {
  return (
    <div className="admin-giftcard-manage__mode-switch" role="tablist" aria-label="Gift card mode">
      {ADMIN_GIFT_CARD_MODE_OPTIONS.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "btn btn--primary" : "btn btn--secondary"}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AdminLegacyGiftCardControls({
  giftCardProducts,
  selectedProductId,
  onSelectedProductIdChange,
  expiryDays,
  onExpiryDaysChange,
  message,
  onMessageChange,
  liveGiftCardOptions,
  optionQuantities,
  onOptionQuantityChange,
  wholeCrewValidation,
  selectedCount,
  total,
  idPrefix = "giftcard-legacy",
}) {
  return (
    <>
      <label className="admin-form__field" htmlFor={`${idPrefix}-product`}>
        <span>Gift card product</span>
        <select
          className="input"
          id={`${idPrefix}-product`}
          value={selectedProductId}
          onChange={(event) => onSelectedProductIdChange(event.target.value)}
          disabled={!giftCardProducts.length}
        >
          {!giftCardProducts.length && <option value="">No gift card products found</option>}
          {giftCardProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.title}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-form__field" htmlFor={`${idPrefix}-expiry`}>
        <span>Expiry days</span>
        <input
          className="input"
          id={`${idPrefix}-expiry`}
          type="number"
          min="1"
          max="1825"
          step="1"
          value={expiryDays}
          onChange={(event) => onExpiryDaysChange(event.target.value)}
        />
      </label>
      <label className="admin-form__field" htmlFor={`${idPrefix}-message`}>
        <span>Optional message</span>
        <textarea
          className="input textarea"
          id={`${idPrefix}-message`}
          rows="3"
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder="Optional giveaway note"
        />
      </label>
      <div className="admin-giftcard-studio__options">
        <div className="admin-giftcard-studio__options-head">
          <h3>Live option selection</h3>
          <p className="modal__meta">Option quantities set the giveaway value.</p>
        </div>
        {liveGiftCardOptions.length === 0 ? (
          <p className="admin-panel__note">
            No live cut-flower options were found. Add options in Cut Flower Classes.
          </p>
        ) : (
          <div className="admin-giftcard-studio__options-grid">
            {liveGiftCardOptions.map((option) => {
              const quantity = normalizeGiftCardOptionQuantity(optionQuantities?.[option.id], 0);
              const optionIsSelected = quantity > 0;
              const isWholeCrew = isWholeCrewOption(option);
              const optionHasWholeCrewViolation =
                isWholeCrew &&
                getWholeCrewSelectionValidation([{ ...option, quantity }]).hasViolation;
              return (
                <article
                  key={option.id}
                  className={`admin-giftcard-studio__option-card${optionIsSelected ? " is-selected" : ""}${optionHasWholeCrewViolation ? " is-invalid" : ""}`}
                >
                  <div className="admin-giftcard-studio__option-main">
                    <h4>{option.label}</h4>
                    <p className="modal__meta">{formatPriceLabel(option.amount)} each</p>
                  </div>
                  <label
                    className="admin-giftcard-studio__option-qty"
                    htmlFor={`${idPrefix}-option-${option.id}`}
                  >
                    <span>Quantity</span>
                    <input
                      className="input"
                      id={`${idPrefix}-option-${option.id}`}
                      type="number"
                      min="0"
                      max="200"
                      step="1"
                      value={quantity}
                      onChange={(event) => onOptionQuantityChange(option.id, event.target.value)}
                    />
                  </label>
                  {isWholeCrew && (
                    <p className="modal__meta admin-giftcard-studio__whole-crew-note">
                      {wholeCrewValidation.minimumMessage}
                    </p>
                  )}
                  {isWholeCrew && optionHasWholeCrewViolation && (
                    <p className="admin-panel__error admin-giftcard-studio__whole-crew-error">
                      Select at least 4 for Whole Crew.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
      <div className="admin-giftcard-studio__summary">
        <p className="modal__meta">
          Selected options: <strong>{selectedCount}</strong>
        </p>
        <p className="modal__meta">
          Giveaway value: <strong>{formatPriceLabel(total)}</strong>
        </p>
        {wholeCrewValidation.hasViolation && (
          <p className="admin-panel__error">{wholeCrewValidation.minimumMessage}</p>
        )}
      </div>
    </>
  );
}

function AdminCatalogGiftCardControls({
  formState,
  onFieldChange,
  selection,
  idPrefix = "giftcard-catalog",
}) {
  const hasItemsForType = selection.items.length > 0;
  const selectedItem = selection.selectedItem;

  return (
    <>
      <div className="admin-form__grid">
        <label className="admin-form__field" htmlFor={`${idPrefix}-type`}>
          <span>Item type</span>
          <select
            className="input"
            id={`${idPrefix}-type`}
            value={formState.itemType}
            onChange={(event) =>
              onFieldChange({
                itemType: event.target.value,
                sourceId: "",
                variantId: "",
                optionId: "",
              })
            }
          >
            {ADMIN_GIFT_CARD_ITEM_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-form__field" htmlFor={`${idPrefix}-item`}>
          <span>Item</span>
          <select
            className="input"
            id={`${idPrefix}-item`}
            value={formState.sourceId}
            onChange={(event) =>
              onFieldChange({
                sourceId: event.target.value,
                variantId: "",
                optionId: "",
              })
            }
            disabled={!hasItemsForType}
          >
            {!hasItemsForType && <option value="">No eligible items found</option>}
            {selection.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.metaLabel ? ` | ${item.metaLabel}` : ""}
              </option>
            ))}
          </select>
        </label>
        {formState.itemType === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT && selectedItem?.variants?.length > 0 && (
          <label className="admin-form__field" htmlFor={`${idPrefix}-variant`}>
            <span>Variant</span>
            <select
              className="input"
              id={`${idPrefix}-variant`}
              value={formState.variantId}
              onChange={(event) => onFieldChange({ variantId: event.target.value })}
            >
              <option value="">Select variant</option>
              {selectedItem.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label} - {formatPriceLabel(variant.price)}
                </option>
              ))}
            </select>
          </label>
        )}
        {formState.itemType === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS &&
          selectedItem?.options?.length > 0 && (
            <label className="admin-form__field" htmlFor={`${idPrefix}-option`}>
              <span>Class option</span>
              <select
                className="input"
                id={`${idPrefix}-option`}
                value={formState.optionId}
                onChange={(event) => onFieldChange({ optionId: event.target.value })}
              >
                <option value="">Select option</option>
                {selectedItem.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} - {formatPriceLabel(option.price)}
                  </option>
                ))}
              </select>
            </label>
          )}
        <label className="admin-form__field" htmlFor={`${idPrefix}-quantity`}>
          <span>{selection.quantityLabel}</span>
          <input
            className="input"
            id={`${idPrefix}-quantity`}
            type="number"
            min="1"
            max="200"
            step="1"
            value={formState.quantity}
            onChange={(event) => onFieldChange({ quantity: event.target.value })}
          />
        </label>
        <label className="admin-form__field" htmlFor={`${idPrefix}-recipient`}>
          <span>Recipient name</span>
          <input
            className="input"
            id={`${idPrefix}-recipient`}
            type="text"
            value={formState.recipientName}
            onChange={(event) => onFieldChange({ recipientName: event.target.value })}
            placeholder="Optional"
          />
        </label>
        <label className="admin-form__field" htmlFor={`${idPrefix}-purchaser`}>
          <span>Purchased by</span>
          <input
            className="input"
            id={`${idPrefix}-purchaser`}
            type="text"
            value={formState.purchaserName}
            onChange={(event) => onFieldChange({ purchaserName: event.target.value })}
            placeholder="Optional"
          />
        </label>
        <label className="admin-form__field" htmlFor={`${idPrefix}-expiry`}>
          <span>Expiry days</span>
          <input
            className="input"
            id={`${idPrefix}-expiry`}
            type="number"
            min="1"
            max="1825"
            step="1"
            value={formState.expiryDays}
            onChange={(event) => onFieldChange({ expiryDays: event.target.value })}
          />
        </label>
        <label className="admin-form__field" htmlFor={`${idPrefix}-message`}>
          <span>Optional message</span>
          <textarea
            className="input textarea"
            id={`${idPrefix}-message`}
            rows="3"
            value={formState.message}
            onChange={(event) => onFieldChange({ message: event.target.value })}
            placeholder="Optional admin-issued note"
          />
        </label>
      </div>
      <div className="admin-giftcard-studio__summary">
        <p className="modal__meta">
          Item: <strong>{selectedItem?.title || "Select an item"}</strong>
        </p>
        {selection.selectedVariant && (
          <p className="modal__meta">
            Variant: <strong>{selection.selectedVariant.label}</strong>
          </p>
        )}
        {selection.selectedOption && (
          <p className="modal__meta">
            Option: <strong>{selection.selectedOption.label}</strong>
          </p>
        )}
        <p className="modal__meta">
          Unit price:{" "}
          <strong>
            {Number.isFinite(selection.unitPrice) ? formatPriceLabel(selection.unitPrice) : "-"}
          </strong>
        </p>
        <p className="modal__meta">
          {selection.quantityLabel}: <strong>{selection.quantityValue || 0}</strong>
        </p>
        <p className="modal__meta">
          Voucher value: <strong>{formatPriceLabel(selection.total)}</strong>
        </p>
        {selection.errorMessage && <p className="admin-panel__error">{selection.errorMessage}</p>}
      </div>
    </>
  );
}

export function AdminGiftCardPreviewExperience() {
  usePageMetadata({
    title: "Admin - Gift Card Builder",
    description: "Build multi-item gift cards with products, workshops, and classes.",
  });

  const { products, workshops, cutFlowerClasses, inventoryEnabled, inventoryLoading, inventoryError } = useAdminData();
  const functionsInstance = useMemo(() => { try { return getFirebaseFunctions(); } catch { return null; } }, []);
  const catalogItemsByType = useAdminCatalogGiftCardInventory({ products, workshops, cutFlowerClasses });

  // Multi-item line items state
  const [lineItems, setLineItems] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addItemForm, setAddItemForm] = useState(createInitialCatalogGiftCardForm);

  // Card details
  const [redemptionScope, setRedemptionScope] = useState("both");
  const [recipientName, setRecipientName] = useState("");
  const [purchaserName, setPurchaserName] = useState("");
  const [message, setMessage] = useState("");
  const [expiryDays, setExpiryDays] = useState(ADMIN_GIFT_CARD_DEFAULT_EXPIRY_DAYS);

  // Preview / draft state
  const [previewState, setPreviewState] = useState({ html: "", generatedAt: "" });
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedDraft, setSavedDraft] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [error, setError] = useState(null);

  const addItemSelection = useMemo(
    () => resolveAdminCatalogGiftCardSelection({
      catalogItemsByType,
      itemType: addItemForm.itemType,
      sourceId: addItemForm.sourceId,
      variantId: addItemForm.variantId,
      optionId: addItemForm.optionId,
      quantity: addItemForm.quantity,
    }),
    [catalogItemsByType, addItemForm],
  );

  // Sync sourceId when item type changes
  useEffect(() => {
    const items = catalogItemsByType?.[addItemForm.itemType] || [];
    const hasSelected = items.some((item) => item.id === addItemForm.sourceId);
    const nextSourceId = hasSelected ? addItemForm.sourceId : (items[0]?.id || "");
    if (nextSourceId !== addItemForm.sourceId) {
      setAddItemForm((prev) => ({ ...prev, sourceId: nextSourceId, variantId: "", optionId: "" }));
    }
  }, [catalogItemsByType, addItemForm.itemType, addItemForm.sourceId]);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const t = setTimeout(() => setStatusMessage(null), 3200);
    return () => clearTimeout(t);
  }, [statusMessage]);

  // Resolve each line item for display (title, price, etc.)
  const resolvedLineItems = useMemo(() =>
    lineItems.map((item) => {
      const items = catalogItemsByType?.[item.type] || [];
      const found = items.find((i) => i.id === item.sourceId) || null;
      const variant = item.type === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT && found?.variants?.length
        ? found.variants.find((v) => v.id === item.variantId) || null : null;
      const option = item.type === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS && found?.options?.length
        ? found.options.find((o) => o.id === item.optionId) || null : null;
      const unitPrice =
        item.type === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT
          ? (found?.variants?.length ? variant?.price : found?.unitPrice) ?? 0
          : item.type === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS
            ? (found?.options?.length ? option?.price : found?.unitPrice) ?? 0
            : found?.unitPrice ?? 0;
      const subtitle = [variant?.label, option?.label].filter(Boolean).join(" | ");
      return {
        ...item,
        title: found?.title || item.sourceId,
        subtitle,
        typeLabel: getCatalogItemKindLabel(item.type),
        unitPrice,
        lineTotal: Number((unitPrice * item.quantity).toFixed(2)),
      };
    }),
    [lineItems, catalogItemsByType],
  );

  const grandTotal = useMemo(
    () => resolvedLineItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [resolvedLineItems],
  );

  const canBuild = lineItems.length > 0;
  const canCallFunctions = inventoryEnabled && Boolean(functionsInstance) && canBuild;

  const buildPayload = () => ({
    lineItems: lineItems.map((item) => ({
      type: item.type,
      sourceId: item.sourceId,
      quantity: item.quantity,
      ...(item.variantId ? { variantId: item.variantId } : {}),
      ...(item.optionId ? { optionId: item.optionId } : {}),
    })),
    recipientName: recipientName.trim(),
    purchaserName: purchaserName.trim(),
    message: message.trim(),
    expiryDays: normalizeGiftCardExpiryDays(expiryDays, 365),
    redemptionScope,
  });

  const handleAddItem = () => {
    if (!addItemSelection.canSubmit) return;
    setLineItems((prev) => [
      ...prev,
      {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: addItemForm.itemType,
        sourceId: addItemForm.sourceId,
        variantId: addItemForm.variantId,
        optionId: addItemForm.optionId,
        quantity: addItemSelection.quantityValue,
      },
    ]);
    setAddItemForm(createInitialCatalogGiftCardForm());
    setShowAddForm(false);
  };

  const handleRemoveItem = (localId) => {
    setLineItems((prev) => prev.filter((item) => item.localId !== localId));
  };

  const handleRefreshPreview = async (e) => {
    if (e) e.preventDefault();
    if (!canCallFunctions) {
      setError(!inventoryEnabled ? "Admin access required." : !canBuild ? "Add at least one item." : "Preview unavailable.");
      return;
    }
    setLoadingPreview(true);
    setError(null);
    setStatusMessage(null);
    try {
      const callable = httpsCallable(functionsInstance, "previewAdminGiveawayGiftCard");
      const response = await callable(buildPayload());
      const preview = response?.data?.preview || {};
      setPreviewState({ html: (preview.html || "").toString(), generatedAt: (preview.generatedAt || "").toString() });
      setStatusMessage(preview.generatedAt ? `Preview generated at ${new Date(preview.generatedAt).toLocaleString("en-ZA")}.` : "Preview generated.");
    } catch (err) {
      setError(resolveGiftCardStudioCallableError(err, "Unable to generate preview."));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!canCallFunctions) {
      setError(!inventoryEnabled ? "Admin access required." : "Add at least one item.");
      return;
    }
    setSavingDraft(true);
    setError(null);
    setStatusMessage(null);
    try {
      const callable = httpsCallable(functionsInstance, "saveAdminGiveawayGiftCardDraft");
      const response = await callable(buildPayload());
      const draft = response?.data?.draft || null;
      setSavedDraft(draft);
      setStatusMessage(`Draft saved${draft?.id ? ` (${draft.id})` : ""}.`);
    } catch (err) {
      setError(resolveGiftCardStudioCallableError(err, "Unable to save draft."));
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full admin-giftcard-studio">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Gift Card Builder</h2>
          <p className="admin-panel__note">
            Build a gift card with multiple items — products, workshops, or classes. Set the redemption scope, then save a draft to issue the card.
          </p>
        </div>
      </Reveal>

      <div className="admin-giftcard-studio__layout">
        <form className="admin-giftcard-studio__controls" onSubmit={handleRefreshPreview}>

          {/* ── Items list ── */}
          <div className="admin-giftcard-multiitem">
            <div className="admin-giftcard-multiitem__header">
              <h3>Items on this card</h3>
              {resolvedLineItems.length > 0 && (
                <span className="modal__meta">
                  {resolvedLineItems.length} item(s) · Total: <strong>{formatPriceLabel(grandTotal)}</strong>
                </span>
              )}
            </div>

            {resolvedLineItems.length === 0 ? (
              <p className="modal__meta admin-giftcard-multiitem__empty">No items added yet. Use "+ Add Item" below to start building.</p>
            ) : (
              <ul className="admin-giftcard-multiitem__list">
                {resolvedLineItems.map((item) => (
                  <li key={item.localId} className="admin-giftcard-multiitem__item">
                    <div className="admin-giftcard-multiitem__item-info">
                      <span className="admin-giftcard-multiitem__type-badge">{item.typeLabel}</span>
                      <strong>{item.title}</strong>
                      {item.subtitle && <span className="modal__meta"> · {item.subtitle}</span>}
                    </div>
                    <div className="admin-giftcard-multiitem__item-meta">
                      <span>Qty: {item.quantity}</span>
                      <span>{formatPriceLabel(item.unitPrice)} ea</span>
                      <strong>{formatPriceLabel(item.lineTotal)}</strong>
                    </div>
                    <button type="button" className="btn btn--danger btn--small" onClick={() => handleRemoveItem(item.localId)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!showAddForm ? (
              <button type="button" className="btn btn--secondary admin-giftcard-multiitem__add-btn" onClick={() => { setShowAddForm(true); setError(null); }} disabled={!inventoryEnabled}>
                + Add Item
              </button>
            ) : (
              <div className="admin-giftcard-multiitem__add-form">
                <h4>Add an item</h4>
                <AdminCatalogGiftCardControls
                  formState={addItemForm}
                  onFieldChange={(nextFields) => setAddItemForm((prev) => ({ ...prev, ...nextFields }))}
                  selection={addItemSelection}
                  idPrefix="gc-builder-add"
                />
                <div className="admin-form__actions">
                  <button type="button" className="btn btn--secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button type="button" className="btn btn--primary" onClick={handleAddItem} disabled={!addItemSelection.canSubmit}>
                    Add to Card
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Redemption scope ── */}
          <div className="admin-form__field">
            <span className="admin-form__label">Redeemable</span>
            <div className="admin-giftcard-scope-radios">
              {ADMIN_GIFT_CARD_REDEMPTION_SCOPE_OPTIONS.map((opt) => (
                <label key={opt.value} className="admin-giftcard-scope-radio">
                  <input type="radio" name="gc-builder-scope" value={opt.value} checked={redemptionScope === opt.value} onChange={() => setRedemptionScope(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* ── Card details ── */}
          <div className="admin-form__grid">
            <label className="admin-form__field" htmlFor="gc-builder-recipient">
              <span>Recipient name</span>
              <input className="input" id="gc-builder-recipient" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Optional" />
            </label>
            <label className="admin-form__field" htmlFor="gc-builder-purchaser">
              <span>Purchased by</span>
              <input className="input" id="gc-builder-purchaser" type="text" value={purchaserName} onChange={(e) => setPurchaserName(e.target.value)} placeholder="Optional" />
            </label>
            <label className="admin-form__field" htmlFor="gc-builder-expiry">
              <span>Expiry (days)</span>
              <input className="input" id="gc-builder-expiry" type="number" min="1" max="1825" step="1" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
            </label>
            <label className="admin-form__field" htmlFor="gc-builder-message">
              <span>Optional message</span>
              <textarea className="input textarea" id="gc-builder-message" rows="3" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Personal note on the card" />
            </label>
          </div>

          <div className="admin-form__actions">
            <button className="btn btn--secondary" type="submit" disabled={loadingPreview || !canCallFunctions}>
              {loadingPreview ? "Generating..." : "Refresh Preview"}
            </button>
            <button className="btn btn--primary" type="button" onClick={handleSaveDraft} disabled={savingDraft || !canCallFunctions}>
              {savingDraft ? "Saving draft..." : "Save Draft"}
            </button>
          </div>

          {savedDraft?.id && <p className="modal__meta">Saved draft: <strong>{savedDraft.id}</strong></p>}
          {inventoryLoading && <p className="modal__meta">Loading catalog...</p>}
          {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
          {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
          {error && <p className="admin-panel__error">{error}</p>}
        </form>

        <div className="admin-email-preview__panel admin-giftcard-studio__preview-panel">
          <div className="admin-email-preview__meta">
            <p className="modal__meta"><strong>Preview</strong></p>
            {previewState.generatedAt && <p className="modal__meta">Generated: {new Date(previewState.generatedAt).toLocaleString("en-ZA")}</p>}
          </div>
          <div className="admin-email-preview__frame-wrap">
            {previewState.html ? (
              <iframe className="admin-email-preview__frame admin-giftcard-studio__frame" title="Gift card preview" srcDoc={previewState.html} />
            ) : (
              <p className="modal__meta" style={{ padding: "1rem" }}>Add items and click "Refresh Preview" to see the card layout.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminGiftCardGenerateManageExperience() {
  usePageMetadata({
    title: "Admin - Gift Card Generate & Manage",
    description: "Generate gift cards instantly or from drafts, and manage issued cards.",
  });

  const {
    products,
    workshops,
    cutFlowerClasses,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);
  const {
    items: giftCardRegistry = [],
    status: registryStatus,
    error: registryError,
  } = useFirestoreCollection("giftCardRegistry", {
    orderByField: "createdAt",
    orderDirection: "desc",
    fallback: [],
  });

  const [quickCreateDialogOpen, setQuickCreateDialogOpen] = useState(false);
  const [quickLineItems, setQuickLineItems] = useState([]);
  const [quickShowAddForm, setQuickShowAddForm] = useState(false);
  const [quickMessage, setQuickMessage] = useState("");
  const [quickRecipientName, setQuickRecipientName] = useState("");
  const [quickPurchaserName, setQuickPurchaserName] = useState("");
  const [quickRedemptionScope, setQuickRedemptionScope] = useState("both");
  const [quickExpiryDays, setQuickExpiryDays] = useState(ADMIN_GIFT_CARD_DEFAULT_EXPIRY_DAYS);
  const [quickCatalogForm, setQuickCatalogForm] = useState(createInitialCatalogGiftCardForm);
  const [quickCreatingGiftCard, setQuickCreatingGiftCard] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState("");
  const [statusMessage, setStatusMessage] = useState(null);
  const [error, setError] = useState(null);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created-desc");
  const [editState, setEditState] = useState({
    open: false,
    giftCardId: "",
    code: "",
    status: "active",
    recipientName: "",
    purchaserName: "",
    message: "",
    terms: "",
    productTitle: "",
    expiresAt: "",
    optionQuantities: {},
    selectedOptions: [],
    selectedOptionsSummary: "",
    quantity: "1",
    isGiveaway: false,
    giftCardMode: ADMIN_GIFT_CARD_MODE_CUSTOM_GIVEAWAY,
    redemptionScope: "both",
    catalogItemRef: null,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [archivingGiftCardId, setArchivingGiftCardId] = useState("");
  const [syncingRegistry, setSyncingRegistry] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState(null);

  const liveGiftCardOptions = useMemo(
    () => collectLiveCutFlowerGiftCardOptions(cutFlowerClasses),
    [cutFlowerClasses],
  );
  const liveOptionIdSet = useMemo(
    () => new Set(liveGiftCardOptions.map((option) => option.id)),
    [liveGiftCardOptions],
  );
  const catalogItemsByType = useAdminCatalogGiftCardInventory({
    products,
    workshops,
    cutFlowerClasses,
  });

  const quickAddSelection = useMemo(
    () =>
      resolveAdminCatalogGiftCardSelection({
        catalogItemsByType,
        itemType: quickCatalogForm.itemType,
        sourceId: quickCatalogForm.sourceId,
        variantId: quickCatalogForm.variantId,
        optionId: quickCatalogForm.optionId,
        quantity: quickCatalogForm.quantity,
      }),
    [catalogItemsByType, quickCatalogForm],
  );
  const quickCatalogSelection = useMemo(
    () =>
      quickLineItems.map((item) => {
        const items = catalogItemsByType?.[item.type] || [];
        const selectedItem = items.find((entry) => entry.id === item.sourceId) || null;
        const selectedVariant =
          item.type === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT && selectedItem?.variants?.length
            ? selectedItem.variants.find((variant) => variant.id === item.variantId) || null
            : null;
        const selectedOption =
          item.type === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS && selectedItem?.options?.length
            ? selectedItem.options.find((option) => option.id === item.optionId) || null
            : null;
        const unitPrice =
          item.type === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT
            ? (selectedItem?.variants?.length ? selectedVariant?.price : selectedItem?.unitPrice) ?? 0
            : item.type === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS
              ? (selectedItem?.options?.length ? selectedOption?.price : selectedItem?.unitPrice) ?? 0
              : selectedItem?.unitPrice ?? 0;
        return {
          ...item,
          title: selectedItem?.title || item.sourceId,
          typeLabel: getCatalogItemKindLabel(item.type),
          subtitle: [selectedVariant?.label, selectedOption?.label].filter(Boolean).join(" | "),
          unitPrice,
          lineTotal: Number((unitPrice * item.quantity).toFixed(2)),
        };
      }),
    [catalogItemsByType, quickLineItems],
  );
  const quickCatalogTotal = useMemo(
    () => quickCatalogSelection.reduce((sum, item) => sum + item.lineTotal, 0),
    [quickCatalogSelection],
  );

  useEffect(() => {
    const items = catalogItemsByType?.[quickCatalogForm.itemType] || [];
    const selectedItem = items.find((item) => item.id === quickCatalogForm.sourceId) || null;
    const nextSourceId = selectedItem ? quickCatalogForm.sourceId : items[0]?.id || "";
    const nextVariantId =
      quickCatalogForm.itemType === ADMIN_GIFT_CARD_ITEM_TYPE_PRODUCT &&
      selectedItem?.variants?.some((variant) => variant.id === quickCatalogForm.variantId)
        ? quickCatalogForm.variantId
        : "";
    const nextOptionId =
      quickCatalogForm.itemType === ADMIN_GIFT_CARD_ITEM_TYPE_CUT_FLOWER_CLASS &&
      selectedItem?.options?.some((option) => option.id === quickCatalogForm.optionId)
        ? quickCatalogForm.optionId
        : "";
    if (
      nextSourceId !== quickCatalogForm.sourceId ||
      nextVariantId !== quickCatalogForm.variantId ||
      nextOptionId !== quickCatalogForm.optionId
    ) {
      setQuickCatalogForm((previous) => ({
        ...previous,
        sourceId: nextSourceId,
        variantId: nextVariantId,
        optionId: nextOptionId,
      }));
    }
  }, [
    catalogItemsByType,
    quickCatalogForm.itemType,
    quickCatalogForm.optionId,
    quickCatalogForm.sourceId,
    quickCatalogForm.variantId,
  ]);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3200);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (!copiedKey) return undefined;
    const timeout = setTimeout(() => setCopiedKey(""), 2400);
    return () => clearTimeout(timeout);
  }, [copiedKey]);

  useEffect(() => {
    if (!openActionMenuId) return undefined;
    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest("[data-giftcard-actions-root]")) {
        return;
      }
      setOpenActionMenuId("");
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenActionMenuId("");
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionMenuId]);

  const canQuickCreateGiftCard = quickCatalogSelection.length > 0;

  const registryRows = useMemo(() => {
    return (Array.isArray(giftCardRegistry) ? giftCardRegistry : [])
      .map((row) => {
        const catalogItemRef =
          row?.catalogItemRef && typeof row.catalogItemRef === "object"
            ? row.catalogItemRef
            : null;
        const giftCardMode = normalizeRegistryGiftCardMode(
          row?.giftCardMode ||
            (catalogItemRef ? ADMIN_GIFT_CARD_MODE_CATALOG_ITEM : row?.sourceType || ""),
        );
        const sourceType = (row.sourceType || "unknown").toString().trim().toLowerCase() || "unknown";
        return {
          ...row,
          id: (row.id || row.giftCardId || "").toString().trim(),
          giftCardId: (row.giftCardId || row.id || "").toString().trim(),
          code: (row.code || "").toString().trim(),
          status: (row.status || "active").toString().trim().toLowerCase() || "active",
          sourceType,
          value: Number(row.value || 0),
          selectedOptions: Array.isArray(row.selectedOptions) ? row.selectedOptions : [],
          selectedOptionsSummary: (row.selectedOptionsSummary || "").toString().trim(),
          redemptionScope: (row.redemptionScope || "both").toString().trim() || "both",
          isGiveaway: Boolean(row.isGiveaway || sourceType === "admin-giveaway"),
          isDeleted: Boolean(row.isDeleted),
          giftCardMode,
          catalogItemRef,
          itemSummary:
            (row.selectedOptionsSummary || "").toString().trim() ||
            (giftCardMode === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM
              ? buildCatalogItemSummary(catalogItemRef)
              : (row.productTitle || "").toString().trim()),
        };
      })
      .filter((row) => !row.isDeleted && row.status !== "deleted");
  }, [giftCardRegistry]);

  const availableStatuses = useMemo(
    () => Array.from(new Set(registryRows.map((row) => row.status).filter(Boolean))).sort(),
    [registryRows],
  );
  const availableSources = useMemo(
    () => Array.from(new Set(registryRows.map((row) => row.sourceType).filter(Boolean))).sort(),
    [registryRows],
  );
  const filteredRegistryRows = useMemo(() => {
    const normalizedSearch = searchValue.toString().trim().toLowerCase();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const resolveComparableTime = (value) => parseDateValue(value)?.getTime() || 0;
    const createdOrIssuedTime = (row) =>
      resolveComparableTime(row.createdAt) ||
      resolveComparableTime(row.issuedAt) ||
      resolveComparableTime(row.updatedAt);
    const expiresTime = (row) => resolveComparableTime(row.expiresAt);

    const filteredRows = registryRows.filter((row) => {
      if (statusFilter === "all" && row.status === "archived") return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (sourceFilter !== "all" && row.sourceType !== sourceFilter) return false;
      if (dateFilter === "last7" && createdOrIssuedTime(row) < now - 7 * dayMs) return false;
      if (dateFilter === "last30" && createdOrIssuedTime(row) < now - 30 * dayMs) return false;
      if (dateFilter === "expired") {
        const expiry = expiresTime(row);
        if (!expiry || expiry >= now) return false;
      }
      if (dateFilter === "expiring30") {
        const expiry = expiresTime(row);
        if (!expiry || expiry < now || expiry > now + 30 * dayMs) return false;
      }
      if (!normalizedSearch) return true;
      const haystack = [
        row.code,
        row.giftCardId,
        row.orderNumber,
        row.recipientName,
        row.purchaserName,
        row.itemSummary,
      ]
        .map((value) => (value || "").toString().toLowerCase())
        .join(" ");
      return haystack.includes(normalizedSearch);
    });

    return filteredRows.sort((left, right) => {
      const leftCreated = createdOrIssuedTime(left);
      const rightCreated = createdOrIssuedTime(right);
      const leftUpdated = resolveComparableTime(left.updatedAt);
      const rightUpdated = resolveComparableTime(right.updatedAt);
      const leftExpiry = expiresTime(left);
      const rightExpiry = expiresTime(right);
      const leftCode = (left.code || "").toString();
      const rightCode = (right.code || "").toString();
      const leftValue = Number(left.value || 0);
      const rightValue = Number(right.value || 0);

      switch (sortBy) {
        case "created-asc":
          return leftCreated - rightCreated;
        case "updated-desc":
          return rightUpdated - leftUpdated;
        case "updated-asc":
          return leftUpdated - rightUpdated;
        case "value-desc":
          return rightValue - leftValue;
        case "value-asc":
          return leftValue - rightValue;
        case "expiry-desc":
          return rightExpiry - leftExpiry;
        case "expiry-asc":
          return leftExpiry - rightExpiry;
        case "code-desc":
          return rightCode.localeCompare(leftCode, undefined, { sensitivity: "base" });
        case "code-asc":
          return leftCode.localeCompare(rightCode, undefined, { sensitivity: "base" });
        case "created-desc":
        default:
          return rightCreated - leftCreated;
      }
    });
  }, [dateFilter, registryRows, searchValue, sortBy, sourceFilter, statusFilter]);

  const hasActiveRegistryFilters =
    Boolean(searchValue.toString().trim()) ||
    statusFilter !== "all" ||
    sourceFilter !== "all" ||
    dateFilter !== "all" ||
    sortBy !== "created-desc";

  const clearRegistryFilters = () => {
    setSearchValue("");
    setStatusFilter("all");
    setSourceFilter("all");
    setDateFilter("all");
    setSortBy("created-desc");
  };

  const formatRegistryDateLabel = (value) => {
    const parsed = parseDateValue(value);
    if (!parsed) return "-";
    return parsed.toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const getRegistryCreatedOrIssuedLabel = (row) =>
    formatRegistryDateLabel(row?.createdAt || row?.issuedAt || row?.updatedAt);

  const resetQuickCreateState = () => {
    setQuickLineItems([]);
    setQuickShowAddForm(false);
    setQuickCatalogForm(createInitialCatalogGiftCardForm());
    setQuickMessage("");
    setQuickRecipientName("");
    setQuickPurchaserName("");
    setQuickRedemptionScope("both");
    setQuickExpiryDays(ADMIN_GIFT_CARD_DEFAULT_EXPIRY_DAYS);
  };

  const getQuickCreateValidationMessage = () => {
    return quickAddSelection.errorMessage || "Add at least one catalog item before generating.";
  };

  const handleQuickAddItem = () => {
    if (!quickAddSelection.canSubmit) {
      setError(getQuickCreateValidationMessage());
      return;
    }
    setQuickLineItems((previous) => [
      ...previous,
      {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: quickCatalogForm.itemType,
        sourceId: quickCatalogForm.sourceId,
        variantId: quickCatalogForm.variantId,
        optionId: quickCatalogForm.optionId,
        quantity: quickAddSelection.quantityValue,
      },
    ]);
    setQuickCatalogForm((previous) => ({
      ...createInitialCatalogGiftCardForm(),
      itemType: previous.itemType,
    }));
    setQuickShowAddForm(false);
    setError(null);
  };

  const handleQuickRemoveItem = (localId) => {
    setQuickLineItems((previous) => previous.filter((item) => item.localId !== localId));
  };

  const handleQuickLineItemQuantityChange = (localId, value) => {
    const quantity = normalizeGiftCardOptionQuantity(value, 1);
    setQuickLineItems((previous) =>
      previous.map((item) => (item.localId === localId ? { ...item, quantity } : item)),
    );
  };

  const handleQuickCreateGiftCard = async () => {
    if (!functionsInstance) {
      setError("Gift card functions are not available.");
      return;
    }
    if (!inventoryEnabled) {
      setError("Admin access is required to generate gift cards.");
      return;
    }
    if (!canQuickCreateGiftCard) {
      setError(getQuickCreateValidationMessage());
      return;
    }

    setQuickCreatingGiftCard(true);
    setStatusMessage(null);
    setError(null);
    try {
      const payload = {
        lineItems: quickLineItems.map((item) => ({
          type: item.type,
          sourceId: item.sourceId,
          quantity: normalizeGiftCardOptionQuantity(item.quantity, 1),
          ...(item.variantId ? { variantId: item.variantId } : {}),
          ...(item.optionId ? { optionId: item.optionId } : {}),
        })),
        recipientName: quickRecipientName.toString().trim(),
        purchaserName: quickPurchaserName.toString().trim(),
        message: quickMessage.toString().trim(),
        expiryDays: normalizeGiftCardExpiryDays(quickExpiryDays, 365),
        redemptionScope: quickRedemptionScope,
      };
      const saveDraftCallable = httpsCallable(functionsInstance, "saveAdminGiveawayGiftCardDraft");
      const draftResponse = await saveDraftCallable(payload);
      const draftId = (draftResponse?.data?.draft?.id || "").toString().trim();
      if (!draftId) {
        throw new Error("Draft could not be created for quick generation.");
      }

      const createCallable = httpsCallable(functionsInstance, "createAdminGiveawayGiftCardFromDraft");
      const createResponse = await createCallable({ draftId });
      const giftCard = createResponse?.data?.giftCard || null;
      if (!giftCard) {
        throw new Error("Gift card was created, but no card payload was returned.");
      }
      setStatusMessage(`Gift card created: ${giftCard.code || "Code unavailable"}.`);
      setQuickCreateDialogOpen(false);
      resetQuickCreateState();
    } catch (quickCreateError) {
      setError(
        resolveGiftCardStudioCallableError(
          quickCreateError,
          "Unable to create gift card.",
        ),
      );
    } finally {
      setQuickCreatingGiftCard(false);
    }
  };

  const copyValue = async (value, key) => {
    const text = (value || "").toString().trim();
    if (!text) return;
    const copied = await copyTextWithFallback(text);
    if (!copied) {
      setError("Unable to copy automatically. Please copy manually.");
      return;
    }
    setCopiedKey(key);
    setStatusMessage("Copied to clipboard.");
  };

  const openEditModal = (row) => {
    const optionQuantities = {};
    (Array.isArray(row.selectedOptions) ? row.selectedOptions : []).forEach((option) => {
      const optionId = (option?.id || "").toString().trim();
      const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 0);
      if (!optionId || quantity <= 0) return;
      optionQuantities[optionId] = quantity;
    });
    const expiresDate = parseDateValue(row.expiresAt);
    const catalogItemRef =
      row?.catalogItemRef && typeof row.catalogItemRef === "object" ? row.catalogItemRef : null;
    const catalogQuantity =
      catalogItemRef?.quantity ||
      normalizeGiftCardOptionQuantity(row?.selectedOptions?.[0]?.quantity, 1);
    setEditState({
      open: true,
      giftCardId: row.giftCardId,
      code: row.code || "",
      status: row.status || "active",
      recipientName: (row.recipientName || "").toString(),
      purchaserName: (row.purchaserName || "").toString(),
      message: (row.message || "").toString(),
      terms: (row.terms || "").toString(),
      productTitle: (row.productTitle || "").toString(),
      expiresAt: expiresDate ? expiresDate.toISOString().slice(0, 10) : "",
      optionQuantities,
      selectedOptions: Array.isArray(row.selectedOptions) ? row.selectedOptions : [],
      selectedOptionsSummary: (row.selectedOptionsSummary || "").toString(),
      quantity: String(catalogQuantity || 1),
      isGiveaway: Boolean(row.isGiveaway),
      giftCardMode: row.giftCardMode || ADMIN_GIFT_CARD_MODE_CUSTOM_GIVEAWAY,
      redemptionScope: (row.redemptionScope || "both").toString().trim() || "both",
      catalogItemRef,
    });
    setError(null);
  };

  const closeEditModal = () =>
    setEditState({
      open: false,
      giftCardId: "",
      code: "",
      status: "active",
      recipientName: "",
      purchaserName: "",
      message: "",
      terms: "",
      productTitle: "",
      expiresAt: "",
      optionQuantities: {},
      selectedOptions: [],
      selectedOptionsSummary: "",
      quantity: "1",
      isGiveaway: false,
      giftCardMode: ADMIN_GIFT_CARD_MODE_CUSTOM_GIVEAWAY,
      redemptionScope: "both",
      catalogItemRef: null,
    });

  const handleArchiveGiftCard = async (row) => {
    if (!functionsInstance) {
      setError("Gift card functions are not available.");
      return;
    }
    if (!inventoryEnabled) {
      setError("Admin access is required to archive gift cards.");
      return;
    }
    const giftCardId = (row?.giftCardId || row?.id || "").toString().trim();
    if (!giftCardId) {
      setError("Gift card ID is missing.");
      return;
    }
    const displayCode = (row?.code || giftCardId).toString().trim();
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        `Archive gift card ${displayCode}? This keeps it on record and makes it non-redeemable.`,
      );
    if (!confirmed) return;

    setArchivingGiftCardId(giftCardId);
    setError(null);
    setStatusMessage(null);
    try {
      const callable = httpsCallable(functionsInstance, "adminArchiveGiftCard");
      await callable({ giftCardId });
      if (editState.open && editState.giftCardId === giftCardId) {
        closeEditModal();
      }
      setStatusMessage(`Gift card archived: ${displayCode}.`);
    } catch (archiveError) {
      setError(resolveGiftCardStudioCallableError(archiveError, "Unable to archive gift card."));
    } finally {
      setArchivingGiftCardId("");
    }
  };

  const handleSyncLegacyGiftCards = async () => {
    if (!functionsInstance) {
      setError("Gift card functions are not available.");
      return;
    }
    if (!inventoryEnabled) {
      setError("Admin access is required to sync legacy gift cards.");
      return;
    }
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "Sync all canonical gift cards into the registry now? This may take a moment for large datasets.",
      );
    if (!confirmed) return;

    setSyncingRegistry(true);
    setError(null);
    setStatusMessage(null);
    try {
      const callable = httpsCallable(functionsInstance, "adminBackfillGiftCardRegistry");
      const response = await callable({ apply: true });
      const data = response?.data || {};
      const summary = {
        mode: data?.mode === "dry-run" ? "dry-run" : "apply",
        scannedGiftCards: Number(data?.scannedGiftCards || 0),
        docsNeedingSync: Number(data?.docsNeedingSync || 0),
        docsSynced: Number(data?.docsSynced || 0),
        docsAlreadyInSync: Number(data?.docsAlreadyInSync || 0),
      };
      setLastSyncSummary(summary);
      setStatusMessage(
        `Registry sync complete. Synced ${summary.docsSynced} card(s); ${summary.docsAlreadyInSync} already in sync.`,
      );
    } catch (syncError) {
      setError(
        resolveGiftCardStudioCallableError(
          syncError,
          "Unable to sync gift cards into the registry.",
        ),
      );
    } finally {
      setSyncingRegistry(false);
    }
  };

  const renderGiftCardActionMenu = (row, scope = "table") => {
    const rowId = (row?.giftCardId || row?.id || "").toString().trim();
    if (!rowId) return null;
    const menuId = `${scope}-${rowId}`;
    const isOpen = openActionMenuId === menuId;
    const isArchiving = archivingGiftCardId === rowId;

    return (
      <div className="admin-giftcard-actions" data-giftcard-actions-root>
        <button
          className={`admin-giftcard-actions__trigger${isOpen ? " is-open" : ""}`}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={`More actions for gift card ${row.code || rowId}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpenActionMenuId((previous) => (previous === menuId ? "" : menuId));
          }}
        >
          <span className="admin-giftcard-actions__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        {isOpen && (
          <div className="admin-giftcard-actions__menu" role="menu" aria-label="Gift card actions">
            <button
              className="admin-giftcard-actions__item"
              type="button"
              role="menuitem"
              onClick={async (event) => {
                event.stopPropagation();
                setOpenActionMenuId("");
                await copyValue(row.code || "", `${scope}-code-${rowId}`);
              }}
            >
              {copiedKey === `${scope}-code-${rowId}` ? "Copied" : "Copy code"}
            </button>
            {row.siteAccessUrl && (
              <a
                className="admin-giftcard-actions__item"
                href={row.siteAccessUrl}
                target="_blank"
                rel="noreferrer"
                role="menuitem"
                onClick={() => setOpenActionMenuId("")}
              >
                View
              </a>
            )}
            <button
              className="admin-giftcard-actions__item"
              type="button"
              role="menuitem"
              disabled={isArchiving}
              onClick={(event) => {
                event.stopPropagation();
                setOpenActionMenuId("");
                openEditModal(row);
              }}
            >
              Edit
            </button>
            {row.status !== "archived" && (
              <button
                className="admin-giftcard-actions__item is-danger"
                type="button"
                role="menuitem"
                disabled={isArchiving}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenActionMenuId("");
                  handleArchiveGiftCard(row);
                }}
              >
                {isArchiving ? "Archiving..." : "Archive"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const editSelectedOptions = useMemo(
    () => buildSelectedGiftCardOptions(liveGiftCardOptions, editState.optionQuantities),
    [liveGiftCardOptions, editState.optionQuantities],
  );
  const editSummary = useMemo(
    () => summarizeGiftCardSelectedOptions(editSelectedOptions),
    [editSelectedOptions],
  );
  const editWholeCrewValidation = useMemo(
    () => getWholeCrewSelectionValidation(editSelectedOptions),
    [editSelectedOptions],
  );
  const editMissingOptionIds = useMemo(() => {
    return Object.entries(editState.optionQuantities || {})
      .filter(([, quantity]) => normalizeGiftCardOptionQuantity(quantity, 0) > 0)
      .map(([optionId]) => optionId)
      .filter((optionId) => !liveOptionIdSet.has(optionId));
  }, [editState.optionQuantities, liveOptionIdSet]);
  const editIsBundledCatalogCard =
    editState.giftCardMode === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM &&
    Array.isArray(editState.selectedOptions) &&
    editState.selectedOptions.length > 1;
  const catalogEditQuantity = normalizeGiftCardOptionQuantity(editState.quantity, 0);
  const editCatalogItems = useMemo(() => {
    if (editState.giftCardMode !== ADMIN_GIFT_CARD_MODE_CATALOG_ITEM) return [];
    return (Array.isArray(editState.selectedOptions) ? editState.selectedOptions : []).map((option, index) => {
      const quantity = normalizeGiftCardOptionQuantity(
        !editIsBundledCatalogCard && index === 0 ? editState.quantity : option?.quantity,
        1,
      );
      const unitPrice = parseNumber(option?.amount ?? option?.unitPriceSnapshot, 0) || 0;
      const lineTotal =
        parseNumber(option?.lineTotal, null) ??
        Number((unitPrice * quantity).toFixed(2));
      return {
        id: (option?.id || option?.label || `option-${index + 1}`).toString(),
        label: (option?.label || editState.productTitle || "Gift item").toString(),
        typeLabel: getCatalogItemKindLabel(option?.sourceKind || editState.catalogItemRef?.kind || ""),
        quantity,
        lineTotal,
      };
    });
  }, [
    editIsBundledCatalogCard,
    editState.catalogItemRef?.kind,
    editState.giftCardMode,
    editState.productTitle,
    editState.quantity,
    editState.selectedOptions,
  ]);
  const editCatalogTotal = useMemo(
    () => editCatalogItems.reduce((sum, item) => sum + (parseNumber(item.lineTotal, 0) || 0), 0),
    [editCatalogItems],
  );
  const editDialogItemCount =
    editState.giftCardMode === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM
      ? editCatalogItems.length
      : editSelectedOptions.length;
  const editDialogTotal =
    editState.giftCardMode === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM ? editCatalogTotal : editSummary.total;
  const canSaveEdit =
    editState.giftCardMode === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM
      ? editState.open && (editIsBundledCatalogCard || catalogEditQuantity > 0) && !savingEdit
      : editState.open &&
        editSelectedOptions.length > 0 &&
        !editWholeCrewValidation.hasViolation &&
        editMissingOptionIds.length === 0 &&
        !savingEdit;

  const handleEditOptionQuantityChange = (optionId, value) => {
    const quantity = normalizeGiftCardOptionQuantity(value, 0);
    setEditState((previous) => {
      const next = { ...(previous.optionQuantities || {}) };
      if (quantity <= 0) {
        delete next[optionId];
      } else {
        next[optionId] = quantity;
      }
      return { ...previous, optionQuantities: next };
    });
  };

  const handleSaveEdit = async () => {
    if (!functionsInstance) {
      setError("Gift card functions are not available.");
      return;
    }
    if (!inventoryEnabled) {
      setError("Admin access is required to edit gift cards.");
      return;
    }
    if (!canSaveEdit) {
      setError(
        editState.giftCardMode === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM
          ? "Enter a valid quantity before saving."
          : editWholeCrewValidation.hasViolation
            ? editWholeCrewValidation.minimumMessage
            : "Fix selection errors before saving.",
      );
      return;
    }

    setSavingEdit(true);
    setError(null);
    setStatusMessage(null);
    try {
      const callable = httpsCallable(functionsInstance, "adminUpdateGiftCard");
      await callable(
        editState.giftCardMode === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM
          ? {
              giftCardId: editState.giftCardId,
              status: editState.status,
              recipientName: editState.recipientName,
              purchaserName: editState.purchaserName,
              message: editState.message,
              expiresAt: editState.expiresAt
                ? new Date(`${editState.expiresAt}T23:59:59+02:00`).toISOString()
                : null,
              ...(editIsBundledCatalogCard ? {} : { quantity: catalogEditQuantity }),
            }
          : {
              giftCardId: editState.giftCardId,
              status: editState.status,
              recipientName: editState.recipientName,
              purchaserName: editState.isGiveaway ? "" : editState.purchaserName,
              message: editState.message,
              terms: editState.terms,
              productTitle: editState.productTitle,
              expiresAt: editState.expiresAt
                ? new Date(`${editState.expiresAt}T23:59:59+02:00`).toISOString()
                : null,
              selectedOptions: editSelectedOptions.map((option) => ({
                id: option.id,
                quantity: normalizeGiftCardOptionQuantity(option.quantity, 1),
              })),
            },
      );
      setStatusMessage(`Gift card updated: ${editState.code || editState.giftCardId}.`);
      closeEditModal();
    } catch (saveError) {
      setError(resolveGiftCardStudioCallableError(saveError, "Unable to update gift card."));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full admin-giftcard-studio">
      <Reveal as="div" className="admin-panel__header">
        <div className="admin-giftcard-manage__hero">
          <h2>Gift Cards - Generate & Manage</h2>
          <p className="admin-panel__note">
            Build gift cards with products, workshops, and cut flower classes, then manage the full registry from one place.
          </p>
        </div>
      </Reveal>

      <section className="admin-panel__card admin-giftcard-manage__create-card">
        <h3>Create gift card</h3>
        <p className="modal__meta">
          Add one or more catalog items, choose where the card can be redeemed, and issue it immediately.
        </p>
        <div className="admin-form__actions">
          <button
            className="btn btn--primary admin-giftcard-manage__create-btn"
            type="button"
            onClick={() => {
              resetQuickCreateState();
              setQuickCreateDialogOpen(true);
              setError(null);
            }}
            disabled={!inventoryEnabled || !functionsInstance}
          >
            Build Gift Card
          </button>
        </div>
      </section>

      <section className="admin-panel__card admin-giftcard-registry">
        <h3>Gift card registry</h3>
        <div className="admin-giftcard-registry__toolbar">
          <p className="modal__meta admin-giftcard-registry__count">
            Showing <strong>{filteredRegistryRows.length}</strong> of{" "}
            <strong>{registryRows.length}</strong> cards
          </p>
          <div className="admin-giftcard-registry__toolbar-actions">
            <button
              className="btn btn--secondary btn--small"
              type="button"
              onClick={handleSyncLegacyGiftCards}
              disabled={syncingRegistry || !functionsInstance || !inventoryEnabled}
            >
              {syncingRegistry ? "Syncing..." : "Sync registry"}
            </button>
            <button
              className="btn btn--secondary btn--small"
              type="button"
              onClick={clearRegistryFilters}
              disabled={!hasActiveRegistryFilters || syncingRegistry}
            >
              Reset filters
            </button>
          </div>
        </div>
        {lastSyncSummary && (
          <p className="modal__meta admin-giftcard-registry__sync-summary">
            Last sync: scanned {lastSyncSummary.scannedGiftCards} card(s), synced{" "}
            {lastSyncSummary.docsSynced}, already in sync {lastSyncSummary.docsAlreadyInSync}.
          </p>
        )}
        <div className="admin-form__grid admin-giftcard-registry__filters">
          <label className="admin-form__field" htmlFor="giftcard-registry-search">
            <span>Search</span>
            <input
              className="input"
              id="giftcard-registry-search"
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Code, order no, recipient, purchaser"
            />
          </label>
          <label className="admin-form__field" htmlFor="giftcard-registry-status">
            <span>Status</span>
            <select
              className="input"
              id="giftcard-registry-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All except archived</option>
              {availableStatuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form__field" htmlFor="giftcard-registry-source">
            <span>Source</span>
            <select
              className="input"
              id="giftcard-registry-source"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option value="all">All sources</option>
              {availableSources.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form__field" htmlFor="giftcard-registry-date">
            <span>Date filter</span>
            <select
              className="input"
              id="giftcard-registry-date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            >
              <option value="all">All dates</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="expired">Expired cards</option>
              <option value="expiring30">Expiring in 30 days</option>
            </select>
          </label>
          <label className="admin-form__field" htmlFor="giftcard-registry-sort">
            <span>Sort by</span>
            <select
              className="input"
              id="giftcard-registry-sort"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="created-desc">Newest first</option>
              <option value="created-asc">Oldest first</option>
              <option value="updated-desc">Recently updated</option>
              <option value="updated-asc">Least recently updated</option>
              <option value="value-desc">Highest value</option>
              <option value="value-asc">Lowest value</option>
              <option value="expiry-asc">Expiry soonest</option>
              <option value="expiry-desc">Expiry latest</option>
              <option value="code-asc">Code A-Z</option>
              <option value="code-desc">Code Z-A</option>
            </select>
          </label>
        </div>
        {filteredRegistryRows.length === 0 ? (
          <p className="modal__meta">No gift cards match the current filters.</p>
        ) : (
          <div className="admin-giftcard-registry__mobile-list">
            {filteredRegistryRows.map((row) => (
              <article className="admin-giftcard-registry-card" key={`mobile-${row.giftCardId || row.id}`}>
                <div className="admin-giftcard-registry-card__head">
                  <strong>{row.code || "-"}</strong>
                  <span className="admin-giftcard-registry-card__status">{row.status || "active"}</span>
                </div>
                <div className="admin-giftcard-registry-card__meta">
                  <span>
                    Mode: {row.selectedOptions.length > 1 ? "Gift package" : getGiftCardModeLabel(row.giftCardMode)}
                  </span>
                  <span>Source: {row.sourceType || "unknown"}</span>
                  <span>Value: {formatPriceLabel(row.value)}</span>
                  <span>Item: {row.itemSummary || "-"}</span>
                  <span>Redeemable: {getRedemptionScopeLabel(row.redemptionScope)}</span>
                  <span>Recipient: {row.recipientName || "-"}</span>
                  <span>Purchaser: {row.purchaserName || "-"}</span>
                  <span>Created: {getRegistryCreatedOrIssuedLabel(row)}</span>
                </div>
                <div className="admin-giftcard-registry-card__actions">
                  {renderGiftCardActionMenu(row, "mobile")}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="admin-table-wrapper admin-giftcard-registry__table-wrap">
          <table className="admin-table admin-giftcard-registry__table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Mode</th>
                <th>Source</th>
                <th>Status</th>
                <th>Value</th>
                <th>Item</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistryRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <p className="modal__meta">No gift cards match the current filters.</p>
                  </td>
                </tr>
              ) : (
                filteredRegistryRows.map((row) => (
                  <tr key={row.giftCardId || row.id}>
                    <td>{row.code || "-"}</td>
                    <td>{row.selectedOptions.length > 1 ? "Gift package" : getGiftCardModeLabel(row.giftCardMode)}</td>
                    <td>{row.sourceType || "unknown"}</td>
                    <td>{row.status || "active"}</td>
                    <td>{formatPriceLabel(row.value)}</td>
                    <td>
                      <div className="admin-giftcard-registry__item-cell">
                        <strong>{row.itemSummary || "-"}</strong>
                        <span>{getRedemptionScopeLabel(row.redemptionScope)}</span>
                      </div>
                    </td>
                    <td>{getRegistryCreatedOrIssuedLabel(row)}</td>
                    <td>{renderGiftCardActionMenu(row, "table")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(inventoryLoading || registryStatus === "loading") && (
        <p className="modal__meta">Loading gift card data...</p>
      )}
      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
      {registryError && <p className="admin-panel__error">{registryError.message || "Unable to load registry."}</p>}
      {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
      {error && <p className="admin-panel__error">{error}</p>}

      {quickCreateDialogOpen && (
        <div className="modal is-active admin-modal" role="dialog" aria-modal="true" aria-labelledby="giftcard-create-title">
          <div className="modal__content admin-giftcard-manage__dialog">
            <button
              className="modal__close"
              type="button"
              onClick={() => setQuickCreateDialogOpen(false)}
              aria-label="Close"
            >
              x
            </button>
            <div className="admin-giftcard-manage__dialog-head">
              <div className="admin-giftcard-manage__dialog-head-copy">
                <p className="admin-giftcard-manage__eyebrow">Gift Card Builder</p>
                <h3 className="modal__title admin-giftcard-manage__dialog-title" id="giftcard-create-title">
                  Build Gift Card
                </h3>
                <p className="admin-giftcard-manage__subtitle">
                  Create a bundled card that can include products, workshops, and cut flower classes in a single issue flow.
                </p>
              </div>
              <div className="admin-giftcard-manage__hero-stats" aria-label="Gift card summary">
                <div className="admin-giftcard-manage__hero-stat">
                  <span>Items</span>
                  <strong>{quickCatalogSelection.length}</strong>
                </div>
                <div className="admin-giftcard-manage__hero-stat">
                  <span>Value</span>
                  <strong>{formatPriceLabel(quickCatalogTotal)}</strong>
                </div>
              </div>
            </div>
            <div className="admin-modal__content admin-giftcard-manage__dialog-body">
              <section className="admin-giftcard-manage__section admin-giftcard-manage__section--items">
                <div className="admin-giftcard-manage__section-head">
                  <div>
                    <p className="admin-giftcard-manage__section-kicker">Included Items</p>
                    <h4>Build the package</h4>
                  </div>
                  {quickCatalogSelection.length > 0 && (
                    <div className="admin-giftcard-manage__section-summary">
                      <span>{quickCatalogSelection.length} selected</span>
                      <strong>{formatPriceLabel(quickCatalogTotal)}</strong>
                    </div>
                  )}
                </div>

                <div className="admin-giftcard-multiitem">
                  {quickCatalogSelection.length === 0 ? (
                    <p className="modal__meta admin-giftcard-multiitem__empty">
                      No items added yet. Start by adding a product, workshop, or class.
                    </p>
                  ) : (
                    <ul className="admin-giftcard-multiitem__list">
                      {quickCatalogSelection.map((item) => (
                        <li key={item.localId} className="admin-giftcard-multiitem__item">
                          <div className="admin-giftcard-multiitem__item-info">
                            <span className="admin-giftcard-multiitem__type-badge">{item.typeLabel}</span>
                            <div className="admin-giftcard-multiitem__item-copy">
                              <strong>{item.title}</strong>
                              {item.subtitle && <span className="modal__meta">{item.subtitle}</span>}
                            </div>
                          </div>
                          <div className="admin-giftcard-multiitem__item-meta">
                            <label className="admin-giftcard-multiitem__qty" htmlFor={`quick-item-${item.localId}`}>
                              <span>Qty</span>
                              <input
                                className="input"
                                id={`quick-item-${item.localId}`}
                                type="number"
                                min="1"
                                max="200"
                                step="1"
                                value={item.quantity}
                                onChange={(event) =>
                                  handleQuickLineItemQuantityChange(item.localId, event.target.value)
                                }
                              />
                            </label>
                            <div className="admin-giftcard-multiitem__line-total">
                              <span>Line total</span>
                              <strong>{formatPriceLabel(item.lineTotal)}</strong>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn--danger btn--small"
                            onClick={() => handleQuickRemoveItem(item.localId)}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!quickShowAddForm ? (
                    <button
                      type="button"
                      className="btn btn--secondary admin-giftcard-multiitem__add-btn"
                      onClick={() => {
                        setQuickShowAddForm(true);
                        setError(null);
                      }}
                    >
                      + Add Item
                    </button>
                  ) : (
                    <div className="admin-giftcard-multiitem__add-form">
                      <div className="admin-giftcard-manage__section-head admin-giftcard-manage__section-head--compact">
                        <div>
                          <p className="admin-giftcard-manage__section-kicker">Catalog Picker</p>
                          <h4>Add another item</h4>
                        </div>
                      </div>
                      <AdminCatalogGiftCardControls
                        formState={quickCatalogForm}
                        onFieldChange={(nextFields) => {
                          setQuickCatalogForm((previous) => ({ ...previous, ...nextFields }));
                          setError(null);
                        }}
                        selection={quickAddSelection}
                        idPrefix="giftcard-generate-catalog"
                      />
                      <div className="admin-form__actions">
                        <button
                          className="btn btn--secondary"
                          type="button"
                          onClick={() => setQuickShowAddForm(false)}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn--primary"
                          type="button"
                          onClick={handleQuickAddItem}
                          disabled={!quickAddSelection.canSubmit}
                        >
                          Add to Card
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="admin-giftcard-manage__section">
                <div className="admin-giftcard-manage__section-head">
                  <div>
                    <p className="admin-giftcard-manage__section-kicker">Redemption</p>
                    <h4>Where can this card be used?</h4>
                  </div>
                </div>
                <div className="admin-giftcard-scope-radios">
                  {ADMIN_GIFT_CARD_REDEMPTION_SCOPE_OPTIONS.map((option) => (
                    <label key={option.value} className="admin-giftcard-scope-radio">
                      <input
                        type="radio"
                        name="giftcard-generate-scope"
                        value={option.value}
                        checked={quickRedemptionScope === option.value}
                        onChange={() => setQuickRedemptionScope(option.value)}
                      />
                      <span className="admin-giftcard-scope-radio__card">
                        <strong>{option.label}</strong>
                        <small>{ADMIN_GIFT_CARD_REDEMPTION_SCOPE_DESCRIPTIONS[option.value]}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="admin-giftcard-manage__section">
                <div className="admin-giftcard-manage__section-head">
                  <div>
                    <p className="admin-giftcard-manage__section-kicker">Card Details</p>
                    <h4>Personalize the issue</h4>
                  </div>
                </div>
                <div className="admin-form__grid admin-giftcard-manage__details-grid">
                  <label className="admin-form__field" htmlFor="giftcard-generate-recipient">
                    <span>Recipient name</span>
                    <input
                      className="input"
                      id="giftcard-generate-recipient"
                      type="text"
                      value={quickRecipientName}
                      onChange={(event) => setQuickRecipientName(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="admin-form__field" htmlFor="giftcard-generate-purchaser">
                    <span>Purchased by</span>
                    <input
                      className="input"
                      id="giftcard-generate-purchaser"
                      type="text"
                      value={quickPurchaserName}
                      onChange={(event) => setQuickPurchaserName(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="admin-form__field admin-giftcard-manage__field--compact" htmlFor="giftcard-generate-expiry">
                    <span>Expiry days</span>
                    <input
                      className="input"
                      id="giftcard-generate-expiry"
                      type="number"
                      min="1"
                      max="1825"
                      step="1"
                      value={quickExpiryDays}
                      onChange={(event) => setQuickExpiryDays(event.target.value)}
                    />
                  </label>
                  <label className="admin-form__field admin-giftcard-manage__field--message" htmlFor="giftcard-generate-message">
                    <span>Optional message</span>
                    <textarea
                      className="input textarea"
                      id="giftcard-generate-message"
                      rows="4"
                      value={quickMessage}
                      onChange={(event) => setQuickMessage(event.target.value)}
                      placeholder="Optional note on the card"
                    />
                  </label>
                </div>
              </section>
            </div>
            <div className="admin-modal__actions admin-form__actions admin-giftcard-manage__footer">
              <div className="admin-giftcard-manage__footer-meta">
                <span>{quickCatalogSelection.length > 0 ? "Ready to issue" : "Build your card"}</span>
                <strong>
                  {quickCatalogSelection.length > 0
                    ? `${quickCatalogSelection.length} item(s) | ${formatPriceLabel(quickCatalogTotal)}`
                    : "Add at least one item to continue"}
                </strong>
              </div>
              <div className="admin-giftcard-manage__footer-actions">
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => {
                    setQuickCreateDialogOpen(false);
                    resetQuickCreateState();
                  }}
                  disabled={quickCreatingGiftCard}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={handleQuickCreateGiftCard}
                  disabled={quickCreatingGiftCard || !canQuickCreateGiftCard || !inventoryEnabled || !functionsInstance}
                >
                  {quickCreatingGiftCard ? "Creating..." : "Issue Gift Card"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editState.open && (
        <div className="modal is-active admin-modal" role="dialog" aria-modal="true" aria-labelledby="giftcard-edit-title">
          <div className="modal__content admin-giftcard-manage__dialog">
            <button className="modal__close" type="button" onClick={closeEditModal} aria-label="Close">
              x
            </button>
            <div className="admin-giftcard-manage__dialog-head">
              <div className="admin-giftcard-manage__dialog-head-copy">
                <p className="admin-giftcard-manage__eyebrow">Gift Card Builder</p>
                <h3 className="modal__title admin-giftcard-manage__dialog-title" id="giftcard-edit-title">
                  Edit Gift Card
                </h3>
                <p className="admin-giftcard-manage__subtitle">
                  {editState.code ? `${editState.code}. ` : ""}
                  Update the issued card using the same layout as creation while keeping post-issue rules intact.
                </p>
              </div>
              <div className="admin-giftcard-manage__hero-stats" aria-label="Gift card summary">
                <div className="admin-giftcard-manage__hero-stat">
                  <span>Items</span>
                  <strong>{editDialogItemCount}</strong>
                </div>
                <div className="admin-giftcard-manage__hero-stat">
                  <span>Value</span>
                  <strong>{formatPriceLabel(editDialogTotal)}</strong>
                </div>
              </div>
            </div>
            <div className="admin-modal__content admin-giftcard-manage__dialog-body">
              {editState.giftCardMode === ADMIN_GIFT_CARD_MODE_CATALOG_ITEM ? (
                <section className="admin-giftcard-manage__section admin-giftcard-manage__section--items">
                  <div className="admin-giftcard-manage__section-head">
                    <div>
                      <p className="admin-giftcard-manage__section-kicker">Included Items</p>
                      <h4>Review the issued package</h4>
                    </div>
                    <div className="admin-giftcard-manage__section-summary">
                      <span>{editCatalogItems.length} selected</span>
                      <strong>{formatPriceLabel(editCatalogTotal)}</strong>
                    </div>
                  </div>

                  <div className="admin-giftcard-multiitem">
                    {editCatalogItems.length === 0 ? (
                      <p className="modal__meta admin-giftcard-multiitem__empty">
                        No catalog selections were stored on this card.
                      </p>
                    ) : (
                      <ul className="admin-giftcard-multiitem__list">
                        {editCatalogItems.map((item, index) => (
                          <li key={item.id} className="admin-giftcard-multiitem__item">
                            <div className="admin-giftcard-multiitem__item-info">
                              <span className="admin-giftcard-multiitem__type-badge">{item.typeLabel || "Item"}</span>
                              <div className="admin-giftcard-multiitem__item-copy">
                                <strong>{item.label}</strong>
                                {index === 0 && !editIsBundledCatalogCard && (
                                  <span className="modal__meta">
                                    {buildCatalogItemSummary(editState.catalogItemRef) || "Catalog-linked item"}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="admin-giftcard-multiitem__item-meta">
                              <label className="admin-giftcard-multiitem__qty" htmlFor={`giftcard-edit-item-${item.id}`}>
                                <span>Qty</span>
                                <input
                                  className="input"
                                  id={`giftcard-edit-item-${item.id}`}
                                  type="number"
                                  min="1"
                                  max="200"
                                  step="1"
                                  value={
                                    !editIsBundledCatalogCard && index === 0
                                      ? editState.quantity
                                      : item.quantity
                                  }
                                  onChange={(event) =>
                                    !editIsBundledCatalogCard && index === 0
                                      ? setEditState((previous) => ({
                                          ...previous,
                                          quantity: event.target.value,
                                        }))
                                      : undefined
                                  }
                                  disabled={editIsBundledCatalogCard || index > 0}
                                />
                              </label>
                              <div className="admin-giftcard-multiitem__line-total">
                                <span>Line total</span>
                                <strong>{formatPriceLabel(item.lineTotal)}</strong>
                              </div>
                            </div>
                            <div className="admin-giftcard-manage__readonly-value">
                              {editIsBundledCatalogCard ? "Locked" : "Editable"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="modal__meta">
                      {editIsBundledCatalogCard
                        ? "Included selections are locked after issue. You can still update names, message, expiry, and status."
                        : "Catalog binding is locked after issue. You can update names, message, expiry, status, and quantity only."}
                    </p>
                  </div>
                </section>
              ) : (
                <section className="admin-giftcard-manage__section admin-giftcard-manage__section--items">
                  <div className="admin-giftcard-manage__section-head">
                    <div>
                      <p className="admin-giftcard-manage__section-kicker">Included Items</p>
                      <h4>Review the issued package</h4>
                    </div>
                    <div className="admin-giftcard-manage__section-summary">
                      <span>{editSelectedOptions.length} selected</span>
                      <strong>{formatPriceLabel(editSummary.total)}</strong>
                    </div>
                  </div>
                  <div className="admin-giftcard-studio__options">
                    <div className="admin-giftcard-studio__options-head">
                      <h3>Live option selection</h3>
                      <p className="modal__meta">Option quantities determine card value.</p>
                    </div>
                    <div className="admin-giftcard-studio__options-grid">
                      {liveGiftCardOptions.map((option) => {
                        const quantity = normalizeGiftCardOptionQuantity(
                          editState.optionQuantities?.[option.id],
                          0,
                        );
                        const wholeCrewOptionSelectedInvalid =
                          isWholeCrewOption(option) &&
                          getWholeCrewSelectionValidation([{ ...option, quantity }]).hasViolation;
                        return (
                          <article
                            key={option.id}
                            className={`admin-giftcard-studio__option-card${quantity > 0 ? " is-selected" : ""}${wholeCrewOptionSelectedInvalid ? " is-invalid" : ""}`}
                          >
                            <div className="admin-giftcard-studio__option-main">
                              <h4>{option.label}</h4>
                              <p className="modal__meta">{formatPriceLabel(option.amount)} each</p>
                            </div>
                            <label className="admin-giftcard-studio__option-qty" htmlFor={`giftcard-edit-option-${option.id}`}>
                              <span>Quantity</span>
                              <input
                                className="input"
                                id={`giftcard-edit-option-${option.id}`}
                                type="number"
                                min="0"
                                max="200"
                                step="1"
                                value={quantity}
                                onChange={(event) => handleEditOptionQuantityChange(option.id, event.target.value)}
                              />
                            </label>
                            {isWholeCrewOption(option) && (
                              <p className="modal__meta admin-giftcard-studio__whole-crew-note">
                                {editWholeCrewValidation.minimumMessage}
                              </p>
                            )}
                            {isWholeCrewOption(option) && wholeCrewOptionSelectedInvalid && (
                              <p className="admin-panel__error admin-giftcard-studio__whole-crew-error">
                                Select at least 4 for Whole Crew.
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                  {editWholeCrewValidation.hasViolation && (
                    <p className="admin-panel__error">{editWholeCrewValidation.minimumMessage}</p>
                  )}
                  {editMissingOptionIds.length > 0 && (
                    <p className="admin-panel__error">
                      Options no longer live: {editMissingOptionIds.join(", ")}.
                    </p>
                  )}
                </section>
              )}

              <section className="admin-giftcard-manage__section">
                <div className="admin-giftcard-manage__section-head">
                  <div>
                    <p className="admin-giftcard-manage__section-kicker">Redemption</p>
                    <h4>Where can this card be used?</h4>
                  </div>
                </div>
                <div className="admin-giftcard-scope-radios">
                  {ADMIN_GIFT_CARD_REDEMPTION_SCOPE_OPTIONS.map((option) => (
                    <label key={option.value} className="admin-giftcard-scope-radio">
                      <input
                        type="radio"
                        name="giftcard-edit-scope"
                        value={option.value}
                        checked={editState.redemptionScope === option.value}
                        onChange={() => null}
                        disabled
                      />
                      <span className="admin-giftcard-scope-radio__card">
                        <strong>{option.label}</strong>
                        <small>{ADMIN_GIFT_CARD_REDEMPTION_SCOPE_DESCRIPTIONS[option.value]}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="modal__meta">
                  Redemption scope is locked after issue and shown here for reference only.
                </p>
              </section>

              <section className="admin-giftcard-manage__section">
                <div className="admin-giftcard-manage__section-head">
                  <div>
                    <p className="admin-giftcard-manage__section-kicker">Card Details</p>
                    <h4>Update the issued card</h4>
                  </div>
                </div>
                <div className="admin-form__grid admin-giftcard-manage__details-grid">
                  <label className="admin-form__field" htmlFor="giftcard-edit-recipient">
                    <span>Recipient name</span>
                    <input
                      className="input"
                      id="giftcard-edit-recipient"
                      type="text"
                      value={editState.recipientName}
                      onChange={(event) =>
                        setEditState((previous) => ({
                          ...previous,
                          recipientName: event.target.value,
                        }))
                      }
                      placeholder="Optional"
                    />
                  </label>
                  <label className="admin-form__field" htmlFor="giftcard-edit-purchaser">
                    <span>Purchased by</span>
                    <input
                      className="input"
                      id="giftcard-edit-purchaser"
                      type="text"
                      value={editState.isGiveaway ? "" : editState.purchaserName}
                      onChange={(event) =>
                        setEditState((previous) => ({
                          ...previous,
                          purchaserName: event.target.value,
                        }))
                      }
                      placeholder="Optional"
                      disabled={editState.isGiveaway}
                    />
                  </label>
                  <label className="admin-form__field admin-giftcard-manage__field--compact" htmlFor="giftcard-edit-expiry">
                    <span>Expiry date</span>
                    <input
                      className="input"
                      id="giftcard-edit-expiry"
                      type="date"
                      value={editState.expiresAt}
                      onChange={(event) =>
                        setEditState((previous) => ({ ...previous, expiresAt: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field admin-giftcard-manage__field--compact" htmlFor="giftcard-edit-status">
                    <span>Status</span>
                    <input
                      className="input"
                      id="giftcard-edit-status"
                      type="text"
                      value={editState.status}
                      onChange={(event) =>
                        setEditState((previous) => ({ ...previous, status: event.target.value }))
                      }
                    />
                  </label>
                  <label className="admin-form__field admin-giftcard-manage__field--message" htmlFor="giftcard-edit-message-field">
                    <span>Optional message</span>
                    <textarea
                      className="input textarea"
                      id="giftcard-edit-message-field"
                      rows="4"
                      value={editState.message}
                      onChange={(event) =>
                        setEditState((previous) => ({ ...previous, message: event.target.value }))
                      }
                      placeholder="Optional note on the card"
                    />
                  </label>
                  {editState.giftCardMode !== ADMIN_GIFT_CARD_MODE_CATALOG_ITEM && (
                    <>
                      <label className="admin-form__field" htmlFor="giftcard-edit-title-field">
                        <span>Product title</span>
                        <input
                          className="input"
                          id="giftcard-edit-title-field"
                          type="text"
                          value={editState.productTitle}
                          onChange={(event) =>
                            setEditState((previous) => ({
                              ...previous,
                              productTitle: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="admin-form__field admin-giftcard-manage__field--message" htmlFor="giftcard-edit-terms-field">
                        <span>Terms</span>
                        <textarea
                          className="input textarea"
                          id="giftcard-edit-terms-field"
                          rows="3"
                          value={editState.terms}
                          onChange={(event) =>
                            setEditState((previous) => ({ ...previous, terms: event.target.value }))
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              </section>
            </div>

            <div className="admin-modal__actions admin-form__actions admin-giftcard-manage__footer">
              <div className="admin-giftcard-manage__footer-meta">
                <span>{canSaveEdit ? "Ready to save" : "Resolve edit issues"}</span>
                <strong>
                  {editDialogItemCount > 0
                    ? `${editDialogItemCount} item(s) | ${formatPriceLabel(editDialogTotal)}`
                    : "No editable selections available"}
                </strong>
              </div>
              <div className="admin-giftcard-manage__footer-actions">
                <button className="btn btn--secondary" type="button" onClick={closeEditModal}>
                  Cancel
                </button>
                <button className="btn btn--primary" type="button" disabled={!canSaveEdit} onClick={handleSaveEdit}>
                  {savingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
