#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const APPLY_CHANGES = process.argv.includes("--apply");

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

function readFirebaseToken() {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "configstore",
    "firebase-tools.json",
  );
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return (parsed?.tokens?.access_token || "").toString().trim();
  } catch {
    return "";
  }
}

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  readDefaultProjectId();

const ACCESS_TOKEN = process.env.FIREBASE_ACCESS_TOKEN || readFirebaseToken();

if (!PROJECT_ID) {
  console.error("Could not determine Firebase project ID. Set GOOGLE_CLOUD_PROJECT or ensure .firebaserc exists.");
  process.exit(1);
}

if (!ACCESS_TOKEN) {
  console.error("Could not find a Firebase access token. Run: firebase login");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
const POS_PRODUCTS = [
  // Coffee
  { name: "Double Shot Espresso", category: "Coffee", price: 28 },
  { name: "Americano", category: "Coffee", price: 34 },
  { name: "Cappuccino", category: "Coffee", price: 42 },
  { name: "Red Cappuccino", category: "Coffee", price: 44 },
  { name: "Flat White", category: "Coffee", price: 36 },
  { name: "Caffè Latte", category: "Coffee", price: 38 },
  { name: "Mocha", category: "Coffee", price: 48 },
  { name: "Iced Coffee", category: "Coffee", price: 45 },
  { name: "Iced Latte", category: "Coffee", price: 45 },
  { name: "Hot Chocolate", category: "Coffee", price: 48 },
  { name: "Chai Latte", category: "Coffee", price: 46 },
  { name: "Five Roses / Rooibos", category: "Coffee", price: 24 },

  // Add-ons
  { name: "Extra Shot", category: "Add-ons", price: 9 },
  { name: "Almond / Oat Milk", category: "Add-ons", price: 9 },
  { name: "Flavoured Syrup: Vanilla, Caramel, Hazelnut", category: "Add-ons", price: 9 },

  // Drinks
  { name: "Juice", category: "Drinks", price: 35 },
  { name: "Still / Sparkling Water", category: "Drinks", price: 20 },
  { name: "Soft Drinks", category: "Drinks", price: 24 },

  // Food
  { name: "Croissant", category: "Food", price: 40 },
  { name: "Cheese Croissant", category: "Food", price: 45 },
  { name: "Muffin", category: "Food", price: 28 },
  { name: "Scone with Jam & Cheese", category: "Food", price: 35 },
  { name: "Banana Bread", category: "Food", price: 25 },
  { name: "Cheese Toasted Sandwich", category: "Food", price: 30 },
  { name: "Ham & Cheese Toasted Sandwich", category: "Food", price: 38 },
  { name: "Ham, Cheese & Tomato Toasted Sandwich", category: "Food", price: 42 },
  { name: "Chicken Mayo & Cheese Toasted Sandwich", category: "Food", price: 45 },
  { name: "Cheese Griller Hotdog", category: "Food", price: 35 },
  { name: "Brownie", category: "Food", price: 38 },
  { name: "Chocolate Croissant", category: "Food", price: 45 },

  // TBA — added as inactive until price is confirmed
  { name: "Slice of Cake", category: "Food", price: 0, status: "inactive" },
];

// ---------------------------------------------------------------------------
// Firestore REST helpers
// ---------------------------------------------------------------------------
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

function httpsPost(url, token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const nowIso = new Date().toISOString();
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posProducts`;

  console.log(`Mode:     ${APPLY_CHANGES ? "APPLY" : "DRY-RUN"}`);
  console.log(`Project:  ${PROJECT_ID}`);
  console.log(`Products: ${POS_PRODUCTS.length}\n`);

  let written = 0;
  let skipped = 0;

  for (const product of POS_PRODUCTS) {
    const status = product.status || "active";
    const label = status === "inactive" ? "INACTIVE" : "active";
    console.log(`  [${label}] ${product.name} — R${product.price} (${product.category})`);

    if (!APPLY_CHANGES) {
      skipped += 1;
      continue;
    }

    const docFields = {
      name: product.name,
      category: product.category || null,
      price: product.price,
      quantity: 1000000,
      forceOutOfStock: false,
      status,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const body = buildFirestoreDoc(docFields);

    try {
      await httpsPost(baseUrl, ACCESS_TOKEN, body);
      written += 1;
    } catch (err) {
      if (err.message.includes("401") || err.message.includes("403")) {
        console.error("\nAuthentication failed. Your Firebase token may have expired.");
        console.error("Run:  firebase login\n  then retry this script.");
        process.exit(1);
      }
      throw err;
    }
  }

  console.log(
    "\n" +
      JSON.stringify(
        {
          mode: APPLY_CHANGES ? "apply" : "dry-run",
          projectId: PROJECT_ID,
          productsQueued: POS_PRODUCTS.length,
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
    console.error("POS product seed failed:", error?.message || error);
    process.exit(1);
  });
