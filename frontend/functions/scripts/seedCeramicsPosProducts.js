#!/usr/bin/env node
/* global Buffer, __dirname, process, require */

const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const APPLY_CHANGES = process.argv.includes("--apply");
const CATEGORY = "Ceramics";
const DEFAULT_QUANTITY = 1000000;
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
const ACCESS_TOKEN = process.env.FIREBASE_ACCESS_TOKEN || FIREBASE_TOKENS.accessToken;
const REFRESH_TOKEN = process.env.FIREBASE_REFRESH_TOKEN || FIREBASE_TOKENS.refreshToken;

if (!PROJECT_ID) {
  console.error("Could not determine Firebase project ID. Set GOOGLE_CLOUD_PROJECT or ensure .firebaserc exists.");
  process.exit(1);
}

if (!ACCESS_TOKEN && !REFRESH_TOKEN) {
  console.error("Could not find Firebase credentials. Run: firebase login");
  process.exit(1);
}

const CERAMICS_POS_PRODUCTS = [
  { name: "Ribbed Vase", price: 180, code: "AB001" },
  { name: "Geo Vase", price: 200, code: "AB002" },
  { name: "Skinny Vase", price: 180, code: "AB003" },
  { name: "Shell(S)", price: 80, code: "AB004" },
  { name: "Shell(M)", price: 100, code: "AB005" },
  { name: "Tbag (S)", price: 80, code: "AB006" },
  { name: "Wavey Rectangular", price: 150, code: "AB007" },
  { name: "Flower Pot (S)", price: 150, code: "AB008" },
  { name: "Cube Mug", price: 150, code: "AB009" },
  { name: "Egg Cup", price: 50, code: "AB010" },
  { name: "Salt and Pepper Couple", price: 150, code: "AB011" },
  { name: "Cat Spoon rest", price: 100, code: "AB012" },
  { name: "Toast", price: 100, code: "AB013" },
  { name: "Heart Plate", price: 150, code: "AB014" },
  { name: "Heart Dish", price: 100, code: "AB015" },
  { name: "Grater", price: 100, code: "AB016" },
  { name: "Hand", price: 350, code: "AB017" },
  { name: "Spoon rest", price: 120, code: "AB018" },
  { name: "No handle cup", price: 150, code: "AB019" },
  { name: "Odd bowl", price: 200, code: "AB020" },
  { name: "Rhino", price: 350, code: "AB021" },
  { name: "Elephant", price: 200, code: "AB022" },
  { name: "Rabit", price: 250, code: "AB023" },
  { name: "Rimmless side plate", price: 150, code: "AB024" },
  { name: "Large Country Cup", price: 150, code: "AB025" },
  { name: "Round water Jug (L)", price: 250, code: "AB026" },
  { name: "Round water Jug (M)", price: 200, code: "AB027" },
  { name: "Round water Jug (S)", price: 150, code: "AB028" },
  { name: "14 cm plate", price: 100, code: "AB029" },
  { name: "Deep dinner plate", price: 250, code: "AB030" },
  { name: "Smal Sushi plate", price: 200, code: "AB031" },
  { name: "Wall heart", price: 200, code: "AB032" },
  { name: "Large Oival bowl", price: 200, code: "AB033" },
  { name: "23cm Lace plate", price: 200, code: "AB034" },
  { name: "Bread lace", price: 250, code: "AB035" },
  { name: "Small rectangulat platter", price: 180, code: "AB036" },
  { name: "Soup mug", price: 150, code: "AB037" },
  { name: "Breakfast Cup", price: 180, code: "AB038" },
  { name: "Country cup smaller", price: 150, code: "AB039" },
  { name: "Utensil holder", price: 120, code: "AB040" },
];

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  throw new Error(`Unsupported type: ${typeof value}`);
}

function buildFirestoreDoc(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = toFirestoreValue(value);
  }
  return { fields: result };
}

function httpsJsonRequest(url, token, method, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
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

function getDocumentId(productCode) {
  return `ceramics-${productCode.toLowerCase()}`;
}

function getDisplayName(product) {
  return `${product.code} - ${product.name}`;
}

async function main() {
  const nowIso = new Date().toISOString();
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posProducts`;
  const accessToken = APPLY_CHANGES ? await getFirestoreAccessToken() : ACCESS_TOKEN;

  if (APPLY_CHANGES && !accessToken) {
    throw new Error("Could not obtain a Firestore access token. Run: firebase login");
  }

  console.log(`Mode:     ${APPLY_CHANGES ? "APPLY" : "DRY-RUN"}`);
  console.log(`Project:  ${PROJECT_ID}`);
  console.log(`Category: ${CATEGORY}`);
  console.log(`Products: ${CERAMICS_POS_PRODUCTS.length}\n`);

  let written = 0;

  for (const product of CERAMICS_POS_PRODUCTS) {
    const docId = getDocumentId(product.code);
    const displayName = getDisplayName(product);
    console.log(`  [${docId}] ${displayName} - R${product.price}`);

    if (!APPLY_CHANGES) continue;

    const docFields = {
      name: displayName,
      category: CATEGORY,
      categoryName: CATEGORY,
      price: product.price,
      productCode: product.code,
      sku: product.code,
      quantity: DEFAULT_QUANTITY,
      forceOutOfStock: false,
      status: "active",
      imageUrl: "",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await httpsJsonRequest(
      `${baseUrl}/${encodeURIComponent(docId)}`,
      accessToken,
      "PATCH",
      buildFirestoreDoc(docFields),
    );
    written += 1;
  }

  console.log(
    "\n" +
      JSON.stringify(
        {
          mode: APPLY_CHANGES ? "apply" : "dry-run",
          projectId: PROJECT_ID,
          category: CATEGORY,
          productsQueued: CERAMICS_POS_PRODUCTS.length,
          productsWritten: APPLY_CHANGES ? written : 0,
        },
        null,
        2,
      ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Ceramics POS product seed failed:", error?.message || error);
    process.exit(1);
  });
