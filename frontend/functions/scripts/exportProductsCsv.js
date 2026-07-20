#!/usr/bin/env node
/* global Buffer, __dirname, process, require */

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const FIREBASE_CLI_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID ||
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET =
  process.env.FIREBASE_CLIENT_SECRET || "j9iVZfS8kkCEFUPaAeJV0sAi";

function readDefaultProjectId() {
  try {
    const firebaseRcPath = path.join(__dirname, "..", "..", ".firebaserc");
    const raw = fs.readFileSync(firebaseRcPath, "utf8");
    const parsed = JSON.parse(raw);
    return (parsed?.projects?.default || "").toString().trim();
  } catch {
    return "";
  }
}

function readFirebaseTokens() {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "configstore",
    "firebase-tools.json",
  );
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      accessToken: (parsed?.tokens?.access_token || "").toString().trim(),
      refreshToken: (parsed?.tokens?.refresh_token || "").toString().trim(),
    };
  } catch {
    return { accessToken: "", refreshToken: "" };
  }
}

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  readDefaultProjectId();

const FIREBASE_TOKENS = readFirebaseTokens();
const ACCESS_TOKEN =
  process.env.FIREBASE_ACCESS_TOKEN || FIREBASE_TOKENS.accessToken;
const REFRESH_TOKEN =
  process.env.FIREBASE_REFRESH_TOKEN || FIREBASE_TOKENS.refreshToken;

if (!PROJECT_ID) {
  console.error(
    "Could not determine Firebase project ID. Set GOOGLE_CLOUD_PROJECT or ensure .firebaserc exists.",
  );
  process.exit(1);
}

if (!ACCESS_TOKEN && !REFRESH_TOKEN) {
  console.error("Could not find Firebase credentials. Run: firebase login");
  process.exit(1);
}

function httpsJsonRequest(url, token, method = "GET") {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

function httpsFormRequest(url, formFields) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(formFields).toString();
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function getFirestoreAccessToken() {
  if (!REFRESH_TOKEN) return ACCESS_TOKEN;

  const response = await httpsFormRequest("https://oauth2.googleapis.com/token", {
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  return (response?.access_token || ACCESS_TOKEN || "").toString().trim();
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, nestedValue]) => [
        key,
        fromFirestoreValue(nestedValue),
      ]),
    );
  }
  return null;
}

function fromFirestoreDocument(document) {
  const fields = document?.fields || {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]),
  );
}

async function listCollection(collectionName, accessToken) {
  const baseUrl =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/documents/${collectionName}`;
  const documents = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await httpsJsonRequest(`${baseUrl}?${params}`, accessToken);
    documents.push(...(response.documents || []));
    pageToken = response.nextPageToken || "";
  } while (pageToken);

  return documents.map((document) => ({
    id: (document.name || "").split("/").pop(),
    ...fromFirestoreDocument(document),
  }));
}

function getCategoryLookup(categories) {
  const lookup = new Map();
  categories.forEach((category) => {
    const name = (category.name || category.title || category.label || "")
      .toString()
      .trim();
    [category.id, category.slug, category.categoryId, name]
      .filter(Boolean)
      .forEach((key) => lookup.set(key.toString().trim().toLowerCase(), name));
  });
  return lookup;
}

function resolveCategory(product, categoryLookup) {
  const categoryValues = [
    product.categoryName,
    product.category,
    product.categoryLabel,
    product.categoryId,
    product.categorySlug,
    ...(Array.isArray(product.categoryIds) ? product.categoryIds : []),
    ...(Array.isArray(product.category_ids) ? product.category_ids : []),
    ...(Array.isArray(product.categoryKeys) ? product.categoryKeys : []),
    ...(Array.isArray(product.categoryLabels) ? product.categoryLabels : []),
  ];

  for (const value of categoryValues) {
    const normalized = (value || "").toString().trim();
    if (!normalized) continue;
    const matched = categoryLookup.get(normalized.toLowerCase());
    return matched || normalized;
  }

  return "Uncategorised";
}

function resolvePrice(product) {
  const value =
    product.price ??
    product.basePrice ??
    product.baseSellingPrice ??
    product.salePrice ??
    product.amount ??
    "";
  const number = Number(value);
  return Number.isFinite(number) ? number : value || "";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows) {
  const header = ["Name", "Price", "Category"];
  const body = rows.map((row) =>
    [row.name, row.price, row.category].map(csvEscape).join(","),
  );
  return `${header.join(",")}\n${body.join("\n")}\n`;
}

async function main() {
  const accessToken = await getFirestoreAccessToken();
  if (!accessToken) {
    throw new Error("Could not obtain a Firestore access token. Run: firebase login");
  }

  const [products, posProducts, productCategories] = await Promise.all([
    listCollection("products", accessToken),
    listCollection("posProducts", accessToken),
    listCollection("productCategories", accessToken),
  ]);

  const categoryLookup = getCategoryLookup(productCategories);
  const rows = [...products, ...posProducts]
    .map((product) => ({
      name: (product.name || product.title || "Untitled product").toString().trim(),
      price: resolvePrice(product),
      category: resolveCategory(product, categoryLookup),
    }))
    .filter((row) => row.name)
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  const outputPath = path.resolve(
    process.cwd(),
    `products-export-${new Date().toISOString().slice(0, 10)}.csv`,
  );

  fs.writeFileSync(outputPath, buildCsv(rows), "utf8");

  console.log(
    JSON.stringify(
      {
        projectId: PROJECT_ID,
        products: products.length,
        posProducts: posProducts.length,
        rows: rows.length,
        outputPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Product CSV export failed:", error?.message || error);
  process.exit(1);
});
