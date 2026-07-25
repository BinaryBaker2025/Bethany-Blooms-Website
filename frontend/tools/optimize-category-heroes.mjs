import crypto from "node:crypto";
import admin from "firebase-admin";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const TARGET_BYTES = 500 * 1024;
const CACHE_CONTROL = "public,max-age=31536000,immutable";
const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  "bethanyblooms-89dcc";
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  `${projectId}.firebasestorage.app`;

let db = null;
let bucket = null;

if (APPLY) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
      storageBucket,
    });
  }
  db = admin.firestore();
  bucket = admin.storage().bucket(storageBucket);
}

async function optimize(buffer) {
  const source = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await source.metadata();
  const scale = Math.min(
    1,
    1920 / (metadata.width || 1920),
    1200 / (metadata.height || 1200),
  );
  let width = Math.max(1, Math.round((metadata.width || 1920) * scale));
  let height = Math.max(1, Math.round((metadata.height || 1200) * scale));
  let output = await source
    .clone()
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, smartSubsample: true })
    .toBuffer();

  if (output.length > TARGET_BYTES) {
    output = await source
      .clone()
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72, smartSubsample: true })
      .toBuffer();
  }
  if (output.length > TARGET_BYTES) {
    const retryScale = Math.min(1, 1600 / width, 1000 / height);
    width = Math.max(1, Math.round(width * retryScale));
    height = Math.max(1, Math.round(height * retryScale));
    output = await source
      .clone()
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 68, smartSubsample: true })
      .toBuffer();
  }

  return { output, width, height };
}

function downloadUrlFor(objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${encodeURIComponent(
    objectPath,
  )}?alt=media&token=${token}`;
}

async function loadCandidates() {
  if (APPLY) {
    const snapshot = await db.collection("productCategories").get();
    return snapshot.docs
      .map((document) => ({ id: document.id, ref: document.ref, ...document.data() }))
      .filter((category) => (category.coverImage || "").toString().trim());
  }

  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    "/databases/(default)/documents/productCategories?pageSize=200";
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Unable to read public category data (${response.status}).`);
  }
  const payload = await response.json();
  return (payload.documents || [])
    .map((document) => ({
      id: decodeURIComponent(document.name.split("/").pop() || ""),
      coverImage: document.fields?.coverImage?.stringValue || "",
    }))
    .filter((category) => category.coverImage.trim());
}

const candidates = await loadCandidates();

console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${candidates.length} category cover(s) found.`);

for (const category of candidates) {
  const sourceUrl = category.coverImage.toString().trim();
  if (sourceUrl.toLowerCase().includes(".webp")) {
    console.log(`SKIP ${category.id}: already WebP`);
    continue;
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    console.warn(`SKIP ${category.id}: download returned ${response.status}`);
    continue;
  }
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const { output, width, height } = await optimize(sourceBuffer);
  console.log(
    `${category.id}: ${(sourceBuffer.length / 1024).toFixed(0)} KB -> ${(output.length / 1024).toFixed(
      0,
    )} KB (${width}x${height})`,
  );

  if (!APPLY) continue;

  const digest = crypto.createHash("sha256").update(output).digest("hex").slice(0, 12);
  const objectPath = `product-media/category-heroes/${category.id}/${Date.now()}-${digest}.webp`;
  const token = crypto.randomUUID();
  await bucket.file(objectPath).save(output, {
    resumable: false,
    metadata: {
      contentType: "image/webp",
      cacheControl: CACHE_CONTROL,
      metadata: {
        firebaseStorageDownloadTokens: token,
        originalCoverImage: sourceUrl,
        migration: "category-hero-v1",
      },
    },
  });
  await category.ref.update({
    coverImage: downloadUrlFor(objectPath, token),
    coverImageOriginal: sourceUrl,
    coverImageMeta: {
      width,
      height,
      bytes: output.length,
      sourceBytes: sourceBuffer.length,
      format: "webp",
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`UPDATED ${category.id}; original retained in coverImageOriginal.`);
}

console.log(APPLY ? "Migration complete." : "Dry run complete. Re-run with --apply to upload and update.");
