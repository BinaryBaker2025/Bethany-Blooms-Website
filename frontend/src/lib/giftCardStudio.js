export const WHOLE_CREW_MIN_QTY = 4;
export const WHOLE_CREW_OPTION_KEY = "wholecrew";
export const MAX_GIFT_CARD_OPTION_QTY = 200;

export const normalizeGiftCardOptionKey = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export const normalizeGiftCardOptionAmount = (value, fallback = null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
};

export const normalizeGiftCardOptionQuantity = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(MAX_GIFT_CARD_OPTION_QTY, parsed));
};

export const isWholeCrewOption = (option = {}) => {
  const optionId = normalizeGiftCardOptionKey(option?.id || "");
  const optionLabel = normalizeGiftCardOptionKey(option?.label || option?.name || "");
  return optionId.includes(WHOLE_CREW_OPTION_KEY) || optionLabel.includes(WHOLE_CREW_OPTION_KEY);
};

const normalizeLiveGiftCardOption = (
  option = {},
  { fallbackId = "", idPrefix = "", labelPrefix = "" } = {},
) => {
  const label = (option?.label || option?.name || option?.value || "").toString().trim();
  const amount = normalizeGiftCardOptionAmount(option?.price ?? option?.amount);
  if (!label || !Number.isFinite(amount)) return null;
  const baseId = (
    option?.value ||
    option?.id ||
    option?.label ||
    fallbackId ||
    label.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  )
    .toString()
    .trim();
  if (!baseId) return null;
  return {
    id: `${idPrefix}${baseId}`,
    label: labelPrefix ? `${labelPrefix} - ${label}` : label,
    amount,
  };
};

export const collectLiveBookingGiftCardOptions = ({
  classes = [],
  workshops = [],
} = {}) => {
  const unique = new Map();
  (Array.isArray(classes) ? classes : []).forEach((classDoc) => {
    const status = (classDoc?.status ?? "live").toString().trim().toLowerCase();
    if (status && status !== "live") return;
    const options = Array.isArray(classDoc?.options) ? classDoc.options : [];
    options.forEach((option, index) => {
      const normalized = normalizeLiveGiftCardOption(option, {
        fallbackId: `${classDoc?.id || "class"}-option-${index + 1}`,
      });
      if (!normalized) return;
      unique.set(normalized.id, normalized);
    });
  });
  (Array.isArray(workshops) ? workshops : []).forEach((workshop) => {
    const status = (workshop?.status ?? "live").toString().trim().toLowerCase();
    if (status && status !== "live") return;
    const title = (workshop?.title || workshop?.name || "Workshop").toString().trim();
    const options = Array.isArray(workshop?.options) ? workshop.options : [];
    options.forEach((option, index) => {
      const normalized = normalizeLiveGiftCardOption(option, {
        fallbackId: `${workshop?.id || "workshop"}-option-${index + 1}`,
        idPrefix: `workshop:${workshop?.id || "workshop"}:`,
        labelPrefix: title,
      });
      if (!normalized) return;
      unique.set(normalized.id, normalized);
    });
  });
  return Array.from(unique.values()).sort((left, right) => {
    if (left.amount !== right.amount) return left.amount - right.amount;
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  });
};

export const collectLiveCutFlowerGiftCardOptions = (classes = []) =>
  collectLiveBookingGiftCardOptions({ classes });

export const buildSelectedGiftCardOptions = (options = [], quantityMap = {}) =>
  (Array.isArray(options) ? options : [])
    .map((option) => {
      const id = (option?.id || "").toString().trim();
      if (!id) return null;
      const quantity = normalizeGiftCardOptionQuantity(quantityMap?.[id], 0);
      if (quantity <= 0) return null;
      const amount = normalizeGiftCardOptionAmount(option?.amount, null);
      if (!Number.isFinite(amount)) return null;
      return {
        id,
        label: (option?.label || option?.name || "").toString().trim() || id,
        amount,
        quantity,
        lineTotal: Number((amount * quantity).toFixed(2)),
      };
    })
    .filter(Boolean);

export const summarizeGiftCardSelectedOptions = (selectedOptions = []) => {
  return (Array.isArray(selectedOptions) ? selectedOptions : []).reduce(
    (summary, option) => {
      const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 0);
      const lineTotal = Number(option?.lineTotal);
      summary.selectedCount += quantity;
      if (Number.isFinite(lineTotal)) {
        summary.total += lineTotal;
      } else {
        const amount = normalizeGiftCardOptionAmount(option?.amount, 0);
        summary.total += amount * quantity;
      }
      return summary;
    },
    { selectedCount: 0, total: 0 },
  );
};

export const getWholeCrewSelectionValidation = (selectedOptions = []) => {
  const selected = Array.isArray(selectedOptions) ? selectedOptions : [];
  const wholeCrewSelection = selected.find((option) => isWholeCrewOption(option)) || null;
  const wholeCrewQuantity = normalizeGiftCardOptionQuantity(wholeCrewSelection?.quantity, 0);
  const hasViolation =
    wholeCrewQuantity > 0 &&
    wholeCrewQuantity < WHOLE_CREW_MIN_QTY;
  return {
    wholeCrewQuantity,
    hasViolation,
    minimumMessage: `Whole Crew requires ${WHOLE_CREW_MIN_QTY} or more people.`,
  };
};
