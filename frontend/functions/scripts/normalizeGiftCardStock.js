#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

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
const FIELD_VALUE = admin.firestore.FieldValue;
const APPLY_CHANGES = process.argv.includes("--apply");
const BATCH_LIMIT = 400;

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object || {}, field);
}

function isGiftCardProduct(product = {}) {
  return Boolean(product?.isGiftCard || product?.is_gift_card);
}

function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

function addIfDifferent(payload, product, field, desiredValue, options = {}) {
  const { onlyWhenFieldExists = false } = options;
  if (onlyWhenFieldExists && !hasOwn(product, field)) return;
  const currentValue = hasOwn(product, field) ? product[field] : undefined;
  if (Array.isArray(desiredValue)) {
    if (isEmptyArray(currentValue) && isEmptyArray(desiredValue)) return;
    payload[field] = desiredValue;
    return;
  }
  if (currentValue === desiredValue) return;
  payload[field] = desiredValue;
}

function buildGiftCardNormalizationPatch(product = {}) {
  const patch = {};
  addIfDifferent(patch, product, "stock_status", "in_stock");
  addIfDifferent(patch, product, "stockStatus", "in_stock");
  addIfDifferent(patch, product, "forceOutOfStock", false);
  addIfDifferent(patch, product, "stock_quantity", null);
  addIfDifferent(patch, product, "stockQuantity", null, { onlyWhenFieldExists: true });
  addIfDifferent(patch, product, "quantity", null);
  addIfDifferent(patch, product, "preorder_send_month", "");
  addIfDifferent(patch, product, "preorderSendMonth", "");
  addIfDifferent(patch, product, "variants", []);
  return patch;
}

async function commitBatch(batch, pendingWrites) {
  if (pendingWrites === 0) return 0;
  await batch.commit();
  return 1;
}

async function main() {
  const snapshot = await db.collection("products").get();
  const stats = {
    scanned: snapshot.size,
    giftCardProducts: 0,
    candidates: 0,
    writesCommitted: 0,
  };
  const candidateIds = [];

  let batch = db.batch();
  let pendingWrites = 0;

  for (const docSnap of snapshot.docs) {
    const product = docSnap.data() || {};
    if (!isGiftCardProduct(product)) continue;
    stats.giftCardProducts += 1;

    const patch = buildGiftCardNormalizationPatch(product);
    if (Object.keys(patch).length === 0) continue;

    stats.candidates += 1;
    candidateIds.push(docSnap.id);

    if (!APPLY_CHANGES) continue;

    batch.set(
      docSnap.ref,
      {
        ...patch,
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
    pendingWrites += 1;

    if (pendingWrites >= BATCH_LIMIT) {
      stats.writesCommitted += await commitBatch(batch, pendingWrites);
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (APPLY_CHANGES) {
    stats.writesCommitted += await commitBatch(batch, pendingWrites);
  }

  const sampleIds = candidateIds.slice(0, 20);
  console.log(
    JSON.stringify(
      {
        mode: APPLY_CHANGES ? "apply" : "dry-run",
        projectId: resolvedProjectId || null,
        scannedProducts: stats.scanned,
        giftCardProducts: stats.giftCardProducts,
        productsNeedingNormalization: stats.candidates,
        committedBatches: APPLY_CHANGES ? stats.writesCommitted : 0,
        sampleProductIds: sampleIds,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Gift card stock normalization failed:", error?.message || error);
    process.exit(1);
  });
