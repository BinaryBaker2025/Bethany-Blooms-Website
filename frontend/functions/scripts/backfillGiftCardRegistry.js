#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const admin = require("firebase-admin");

function readDefaultProjectId() {
  try {
    const firebaseRcPath = path.join(__dirname, "..", "..", ".firebaserc");
    const raw = fs.readFileSync(firebaseRcPath, "utf8");
    const parsed = JSON.parse(raw);
    const value = (parsed?.projects?.default || "").toString().trim();
    return value || "";
  } catch {
    return "";
  }
}

const resolvedProjectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  readDefaultProjectId();

if (!admin.apps.length) {
  if (resolvedProjectId) {
    admin.initializeApp({ projectId: resolvedProjectId });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();
const APPLY_CHANGES = process.argv.includes("--apply");
const BATCH_LIMIT = 400;
const GIFT_CARDS_COLLECTION = "giftCards";
const GIFT_CARD_REGISTRY_COLLECTION = "giftCardRegistry";
const GIFT_CARD_VALUE_CURRENCY = "ZAR";
const GIFT_CARD_ISSUE_SOURCE_ADMIN_GIVEAWAY = "admin-giveaway";

const siteUrlFromEnv = (process.env.SITE_URL || "").toString().trim();
const canonicalSiteUrl = siteUrlFromEnv
  ? siteUrlFromEnv.replace(/\/+$/, "")
  : "https://bethanyblooms.co.za";
const functionsBaseUrl =
  (process.env.FUNCTIONS_BASE_URL || "").toString().trim() ||
  (resolvedProjectId ? `https://us-central1-${resolvedProjectId}.cloudfunctions.net` : "");
const giftCardTokenSecret = (process.env.GIFT_CARD_TOKEN_SECRET || "")
  .toString()
  .trim();

function coerceTimestampToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeLookupCode(value = "") {
  return value
    .toString()
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

function normalizeGiftCardAmount(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
}

function normalizeGiftCardOptionQuantity(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

function normalizeGiftCardSelectedOptions(options = []) {
  const mergedOptions = new Map();
  (Array.isArray(options) ? options : []).forEach((option, index) => {
    const label = (option?.label || option?.name || "").toString().trim();
    const amount = normalizeGiftCardAmount(option?.amount ?? option?.price);
    const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 1);
    if (!label || !Number.isFinite(amount)) return;
    const id =
      (option?.id || "").toString().trim() ||
      `option-${index + 1}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const key = `${id}::${label.toLowerCase()}::${amount}`;
    const existing = mergedOptions.get(key);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    mergedOptions.set(key, {
      id,
      label,
      amount,
      quantity,
    });
  });

  return Array.from(mergedOptions.values()).map((option) => {
    const quantity = normalizeGiftCardOptionQuantity(option.quantity, 1);
    return {
      ...option,
      quantity,
      lineTotal: Number((option.amount * quantity).toFixed(2)),
    };
  });
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "R0.00";
  return `R${amount.toFixed(2)}`;
}

function buildGiftCardSelectedOptionsSummary(selectedOptions = []) {
  const normalizedOptions = normalizeGiftCardSelectedOptions(selectedOptions);
  if (!normalizedOptions.length) return "None";
  return normalizedOptions
    .map((option) => {
      const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 1);
      const amount = normalizeGiftCardAmount(option?.amount, 0);
      return `${option.label} x${quantity} (${formatCurrency(amount * quantity)})`;
    })
    .join(", ");
}

function buildGiftCardSourceType(giftCard = {}) {
  const issueSource = (giftCard?.issueSource || "").toString().trim().toLowerCase();
  if (issueSource === GIFT_CARD_ISSUE_SOURCE_ADMIN_GIVEAWAY || giftCard?.isGiveaway) {
    return "admin-giveaway";
  }
  if (giftCard?.isTest || issueSource === "admin-test") {
    return "admin-test";
  }
  if ((giftCard?.orderId || "").toString().trim()) {
    return "user-order";
  }
  return "unknown";
}

function createGiftCardAccessToken(giftCardId = "") {
  const normalizedId = (giftCardId || "").toString().trim();
  if (!normalizedId || !giftCardTokenSecret) return "";
  return crypto.createHmac("sha256", giftCardTokenSecret).update(normalizedId).digest("hex");
}

function buildGiftCardAccessUrl(giftCardId = "", token = "") {
  const idPart = encodeURIComponent((giftCardId || "").toString().trim());
  const tokenPart = encodeURIComponent((token || "").toString().trim());
  if (!idPart || !tokenPart || !functionsBaseUrl) return "";
  return `${functionsBaseUrl}/viewGiftCardHttp?giftCardId=${idPart}&token=${tokenPart}`;
}

function buildGiftCardDownloadUrl(giftCardId = "", token = "") {
  const idPart = encodeURIComponent((giftCardId || "").toString().trim());
  const tokenPart = encodeURIComponent((token || "").toString().trim());
  if (!idPart || !tokenPart || !functionsBaseUrl) return "";
  return `${functionsBaseUrl}/downloadGiftCardPdfHttp?giftCardId=${idPart}&token=${tokenPart}`;
}

function buildGiftCardPrintViewUrl(giftCardId = "", token = "") {
  const accessUrl = buildGiftCardAccessUrl(giftCardId, token);
  if (!accessUrl) return "";
  return `${accessUrl}&print=1`;
}

function buildGiftCardSiteUrl(giftCardId = "", token = "") {
  const idPart = encodeURIComponent((giftCardId || "").toString().trim());
  const tokenPart = encodeURIComponent((token || "").toString().trim());
  if (!idPart || !tokenPart) return "";
  return `${canonicalSiteUrl}/gift-cards/${idPart}?token=${tokenPart}`;
}

function toComparableValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map((entry) => toComparableValue(entry));
  if (typeof value?.toDate === "function") {
    const date = coerceTimestampToDate(value);
    return date ? date.toISOString() : null;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const sorted = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        sorted[key] = toComparableValue(value[key]);
      });
    return sorted;
  }
  return value;
}

function hasDiff(existingDoc = {}, desiredDoc = {}) {
  return JSON.stringify(toComparableValue(existingDoc)) !== JSON.stringify(toComparableValue(desiredDoc));
}

function buildGiftCardRegistryPayload(giftCard = {}, giftCardId = "") {
  const normalizedGiftCardId = (giftCardId || "").toString().trim();
  const token = createGiftCardAccessToken(normalizedGiftCardId);
  const selectedOptions = normalizeGiftCardSelectedOptions(giftCard.selectedOptions);
  const selectedOptionCount = Number(giftCard.selectedOptionCount);
  const sourceType = buildGiftCardSourceType(giftCard);
  const normalizedCode = normalizeLookupCode(giftCard.code || normalizedGiftCardId);
  const status = (giftCard.status || "active").toString().trim().toLowerCase() || "active";
  return {
    giftCardId: normalizedGiftCardId,
    code: normalizedCode,
    status,
    isGiveaway: Boolean(giftCard?.isGiveaway || sourceType === "admin-giveaway"),
    isTest: Boolean(giftCard?.isTest || sourceType === "admin-test"),
    issueSource: (giftCard?.issueSource || "").toString().trim() || null,
    sourceType,
    value: Number(giftCard.value || 0),
    currency: (giftCard.currency || GIFT_CARD_VALUE_CURRENCY).toString() || GIFT_CARD_VALUE_CURRENCY,
    selectedOptions,
    selectedOptionCount:
      Number.isFinite(selectedOptionCount) && selectedOptionCount >= 0
        ? Math.floor(selectedOptionCount)
        : selectedOptions.reduce(
            (sum, option) => sum + normalizeGiftCardOptionQuantity(option?.quantity, 1),
            0,
          ),
    selectedOptionsSummary: buildGiftCardSelectedOptionsSummary(selectedOptions),
    recipientName: (giftCard.recipientName || "").toString().trim(),
    purchaserName: (giftCard.purchaserName || "").toString().trim(),
    message: (giftCard.message || "").toString().trim(),
    terms: (giftCard.terms || "").toString().trim(),
    accessUrl: buildGiftCardAccessUrl(normalizedGiftCardId, token),
    downloadUrl: buildGiftCardDownloadUrl(normalizedGiftCardId, token),
    printUrl: buildGiftCardPrintViewUrl(normalizedGiftCardId, token),
    siteAccessUrl: buildGiftCardSiteUrl(normalizedGiftCardId, token),
    orderId: (giftCard.orderId || "").toString().trim() || null,
    orderNumber: giftCard.orderNumber ?? null,
    productId: (giftCard.productId || "").toString().trim() || null,
    productTitle: (giftCard.productTitle || "").toString().trim() || "Bethany Blooms Gift Card",
    issuedAt: giftCard.issuedAt || null,
    expiresAt: giftCard.expiresAt || null,
    createdAt: giftCard.createdAt || null,
    updatedAt: giftCard.updatedAt || null,
    lastEditedAt: giftCard.lastEditedAt || null,
    lastEditedByUid: (giftCard.lastEditedByUid || "").toString().trim() || null,
    lastEditedByEmail: (giftCard.lastEditedByEmail || "").toString().trim() || null,
    isDeleted: false,
    deletedAt: null,
  };
}

async function commitBatch(batch, pendingWrites) {
  if (pendingWrites === 0) return 0;
  await batch.commit();
  return 1;
}

async function main() {
  const giftCardSnapshot = await db.collection(GIFT_CARDS_COLLECTION).get();
  const stats = {
    scannedGiftCards: giftCardSnapshot.size,
    registryDocsChecked: 0,
    candidates: 0,
    unchanged: 0,
    committedBatches: 0,
  };
  const sampleGiftCardIds = [];

  let batch = db.batch();
  let pendingWrites = 0;

  for (const giftCardSnap of giftCardSnapshot.docs) {
    const giftCardId = giftCardSnap.id;
    const giftCard = giftCardSnap.data() || {};
    const desiredPayload = buildGiftCardRegistryPayload(giftCard, giftCardId);
    const registryRef = db.collection(GIFT_CARD_REGISTRY_COLLECTION).doc(giftCardId);
    const registrySnap = await registryRef.get();
    stats.registryDocsChecked += 1;
    const existingPayload = registrySnap.exists ? registrySnap.data() || {} : {};

    if (!hasDiff(existingPayload, desiredPayload)) {
      stats.unchanged += 1;
      continue;
    }

    stats.candidates += 1;
    if (sampleGiftCardIds.length < 20) sampleGiftCardIds.push(giftCardId);
    if (!APPLY_CHANGES) continue;

    batch.set(registryRef, desiredPayload, { merge: true });
    pendingWrites += 1;
    if (pendingWrites >= BATCH_LIMIT) {
      stats.committedBatches += await commitBatch(batch, pendingWrites);
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (APPLY_CHANGES) {
    stats.committedBatches += await commitBatch(batch, pendingWrites);
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY_CHANGES ? "apply" : "dry-run",
        projectId: resolvedProjectId || null,
        scannedGiftCards: stats.scannedGiftCards,
        registryDocsChecked: stats.registryDocsChecked,
        docsNeedingSync: stats.candidates,
        docsAlreadyInSync: stats.unchanged,
        committedBatches: APPLY_CHANGES ? stats.committedBatches : 0,
        sampleGiftCardIds,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Gift card registry backfill failed:", error?.message || error);
    process.exit(1);
  });
