require("dotenv").config();
const functions = require("firebase-functions");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const crypto = require("crypto");
const dns = require("dns");
const fs = require("fs");
const path = require("path");
const cors = require("cors")({ origin: true });
const { Resend } = require("resend");
const { defineString } = require("firebase-functions/params");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = defineString("RESEND_API_KEY");
const RESEND_FROM = defineString("RESEND_FROM", {
  default: "Bethany Blooms <admin@bethanyblooms.co.za>",
});
const ADMIN_EMAIL = defineString("ADMIN_EMAIL", {
  default: "admin@bethanyblooms.co.za",
});
const SITE_URL = defineString("SITE_URL", {
  default: "",
});
const PAYFAST_MERCHANT_ID = defineString("PAYFAST_MERCHANT_ID");
const PAYFAST_MERCHANT_KEY = defineString("PAYFAST_MERCHANT_KEY");
const PAYFAST_PASSPHRASE = defineString("PAYFAST_PASSPHRASE", { default: "" });
const PAYFAST_RETURN_URL = defineString("PAYFAST_RETURN_URL", { default: "" });
const PAYFAST_CANCEL_URL = defineString("PAYFAST_CANCEL_URL", { default: "" });
const PAYFAST_NOTIFY_URL = defineString("PAYFAST_NOTIFY_URL", { default: "" });
const PAYFAST_MODE = defineString("PAYFAST_MODE", { default: "live" });
const PAYFAST_LIVE_MERCHANT_ID = defineString("PAYFAST_LIVE_MERCHANT_ID", { default: "" });
const PAYFAST_LIVE_MERCHANT_KEY = defineString("PAYFAST_LIVE_MERCHANT_KEY", { default: "" });
const PAYFAST_LIVE_PASSPHRASE = defineString("PAYFAST_LIVE_PASSPHRASE", { default: "" });
const GIFT_CARD_TOKEN_SECRET = defineString("GIFT_CARD_TOKEN_SECRET", { default: "" });

setGlobalOptions({
  maxInstances: 10,
});
let resendClient = null;

const payfastHosts = {
  live: "www.payfast.co.za",
};
const PAYFAST_VALID_HOSTS = Object.freeze([
  "www.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
]);
const PAYFAST_IP_CACHE_TTL_MS = 10 * 60 * 1000;
const PAYFAST_ALLOWED_PAYMENT_METHODS = new Set([
  "ef",
  "cc",
  "dc",
  "mp",
  "mc",
  "sc",
  "ss",
  "zp",
  "mt",
  "rc",
  "mu",
  "ap",
  "sp",
  "cp",
  "gp",
  "pf",
]);
let payfastValidIpCache = {
  expiresAt: 0,
  ips: new Set(),
};

const PENDING_COLLECTION = "pendingPayfastOrders";
const CUSTOMER_PROFILES_COLLECTION = "customerProfiles";
const CUSTOMER_PROFILE_ORDERS_SUBCOLLECTION = "orders";
const MAX_CUSTOMER_PROFILE_ADDRESSES = 10;
const SUBSCRIPTIONS_COLLECTION = "subscriptions";
const SUBSCRIPTION_PLANS_COLLECTION = "subscriptionPlans";
const SUBSCRIPTION_INVOICES_COLLECTION = "subscriptionInvoices";
const SUBSCRIPTION_ADMIN_AUDIT_LOGS_COLLECTION = "subscriptionAdminAuditLogs";
const PENDING_SUBSCRIPTION_PAYFAST_COLLECTION = "pendingPayfastSubscriptions";
const SUBSCRIPTION_TIMEZONE = "Africa/Johannesburg";
const SUBSCRIPTION_BILLING_DAY = 1;
const SUBSCRIPTION_PREBILL_LEAD_DAYS = 5;
const SUBSCRIPTION_CURRENCY = "ZAR";
const SUBSCRIPTION_INVOICE_DOCUMENTS_DIRECTORY = "subscription-invoices";
const SUBSCRIPTION_INVOICE_PDF_CONTENT_TYPE = "application/pdf";
const ORDER_INVOICE_DOCUMENTS_DIRECTORY = "order-invoices";
const ORDER_INVOICE_PDF_CONTENT_TYPE = "application/pdf";
const SUBSCRIPTION_PAYLINK_TTL_MS = 45 * 24 * 60 * 60 * 1000;
const SUBSCRIPTION_STATUSES = Object.freeze({
  ACTIVE: "active",
  PAUSED: "paused",
  CANCELLED: "cancelled",
});
const SUBSCRIPTION_PLAN_STATUSES = Object.freeze({
  LIVE: "live",
  DRAFT: "draft",
  ARCHIVED: "archived",
});
const SUBSCRIPTION_INVOICE_STATUSES = Object.freeze({
  PENDING: "pending-payment",
  PAID: "paid",
  CANCELLED: "cancelled",
});
const SUBSCRIPTION_INVOICE_TYPES = Object.freeze({
  CYCLE: "cycle",
  TOPUP: "topup",
});
const SUBSCRIPTION_ADJUSTMENT_SOURCES = Object.freeze({
  PLAN_CHANGE: "admin-plan-change",
  EXTRA_CHARGE: "admin-extra-charge",
  RECURRING_CHARGE: "admin-recurring-charge",
});
const SUBSCRIPTION_CHARGE_MODES = Object.freeze({
  ONE_TIME: "one-time",
  RECURRING: "recurring",
});
const SUBSCRIPTION_CHARGE_BASES = Object.freeze({
  FLAT: "flat",
  PER_DELIVERY: "per-delivery",
});
const SUBSCRIPTION_CHARGE_STATUSES = Object.freeze({
  ACTIVE: "active",
  REMOVED: "removed",
});
const SUBSCRIPTION_PAYMENT_METHODS = Object.freeze({
  PAYFAST: "payfast",
  EFT: "eft",
});
const SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES = Object.freeze({
  NOT_REQUIRED: "not-required",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});
const SUBSCRIPTION_CATEGORY_TOKENS = Object.freeze(new Set([
  "subscription",
  "subscriptions",
]));
const SUBSCRIPTION_CUSTOMER_SETTINGS_COLLECTION = "subscriptionCustomerSettings";
const SUBSCRIPTION_PLAN_MATRIX = Object.freeze({
  weekly: Object.freeze({ "16": 1199, "32": 2299 }),
  "bi-weekly": Object.freeze({ "16": 699, "32": 1299 }),
  monthly: Object.freeze({ "16": 399, "32": 749 }),
});
const SUBSCRIPTION_MONDAY_SLOT_VALUES = Object.freeze([
  "first",
  "second",
  "third",
  "fourth",
  "last",
]);
const SUBSCRIPTION_DELIVERY_SLOT_DEFAULTS = Object.freeze({
  weekly: Object.freeze([...SUBSCRIPTION_MONDAY_SLOT_VALUES]),
  "bi-weekly": Object.freeze(["first", "third"]),
  monthly: Object.freeze(["first"]),
});
const SUBSCRIPTION_DELIVERY_SLOT_COUNT_BY_TIER = Object.freeze({
  weekly: 5,
  "bi-weekly": 2,
  monthly: 1,
});
const SUBSCRIPTION_DELIVERY_SLOT_LABELS = Object.freeze({
  first: "1st Monday",
  second: "2nd Monday",
  third: "3rd Monday",
  fourth: "4th Monday",
  last: "Last Monday",
});
const SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL = "monday-slots";
const SUBSCRIPTION_DELIVERY_CUTOFF_RULE = "next-monday-only";
const SUBSCRIPTION_RECURRING_RUN_MODES = Object.freeze({
  LAST5: "last5",
  DAY1_FALLBACK: "day1-fallback",
  SKIP: "skip",
});
const SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS = Object.freeze({
  SCHEDULER_LAST5: "scheduler-last5",
  SCHEDULER_DAY1_FALLBACK: "scheduler-day1-fallback",
  MANUAL: "manual",
});
const EFT_BANK_DETAILS = Object.freeze({
  accountName: "Bethany Blooms",
  bankName: "Capitec Business",
  accountType: "Business",
  accountNumber: "1053441444",
  branchCode: "450105",
  referenceFormat: "Order #<orderNumber>",
});
const EFT_PROOF_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const EFT_PROOF_UPLOAD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ORDER_CREATED_EMAIL_TEMPLATES = Object.freeze({
  EFT_PENDING: "eft-pending",
  STANDARD: "standard",
});
const ORDER_NOTIFICATION_STATUSES = Object.freeze({
  SENT: "sent",
  FAILED: "failed",
  SKIPPED: "skipped",
});
const COMPANY_PHONE_LOCAL = "0744555590";
const COMPANY_PHONE_E164 = "27744555590";
const COMPANY_PHONE_TEL = `+${COMPANY_PHONE_E164}`;
const COMPANY_WHATSAPP_URL = `https://wa.me/${COMPANY_PHONE_E164}`;
const GIFT_CARD_LOCATION_LINE = "2 PAUL ROOS STREET, UNITAS PARK";
const GIFT_CARD_CONTACT_LINE = "079 267 0819";
const GIFT_CARD_ASSET_DIRECTORY = path.join(__dirname, "assets", "giftcard");
const GIFT_CARD_LOGO_FILE = path.join(GIFT_CARD_ASSET_DIRECTORY, "logo.png");
const GIFT_CARD_SIGNATURE_FILE = path.join(GIFT_CARD_ASSET_DIRECTORY, "signiture.png");
const GIFT_CARDS_COLLECTION = "giftCards";
const GIFT_CARD_VALUE_CURRENCY = "ZAR";
const GIFT_CARD_DEFAULT_EXPIRY_DAYS = 365;
const GIFT_CARD_MAX_EXPIRY_DAYS = 1825;
const GIFT_CARD_MIN_EXPIRY_DAYS = 1;
const GIFT_CARD_MAX_MESSAGE_LENGTH = 320;
const GIFT_CARD_MAX_NAME_LENGTH = 120;
const GIFT_CARD_MAX_TERMS_LENGTH = 1400;
const DEFAULT_TRUNCATE_TEXT_LENGTH = 240;
let giftCardDesignAssetsCache = null;

const FIELD_VALUE = admin.firestore.FieldValue;

function safeParamValue(param, fallback = "") {
  try {
    if (param && typeof param.value === "function") {
      const value = param.value();
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function sanitizePayfastCredentialValue(value = "") {
  const normalized = (value || "").toString().trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  if (lower === "undefined" || lower === "null") return "";
  if (/^<[^>]+>$/.test(normalized)) return "";
  if (
    lower.includes("your_live_") ||
    lower.includes("replace_me") ||
    lower.includes("changeme") ||
    lower.includes("example")
  ) {
    return "";
  }
  return normalized;
}

function getResendApiKey() {
  return process.env.RESEND_API_KEY || safeParamValue(RESEND_API_KEY, "");
}

function getResendFrom() {
  return process.env.RESEND_FROM || safeParamValue(RESEND_FROM, "Bethany Blooms <onboarding@resend.dev>");
}

function getAdminEmail() {
  return process.env.ADMIN_EMAIL || safeParamValue(ADMIN_EMAIL, "admin@bethanyblooms.co.za");
}

function getSiteUrl() {
  return process.env.SITE_URL || safeParamValue(SITE_URL, "");
}

function getGiftCardTokenSecret() {
  return (
    process.env.GIFT_CARD_TOKEN_SECRET ||
    safeParamValue(GIFT_CARD_TOKEN_SECRET, "") ||
    process.env.PAYFAST_PASSPHRASE ||
    "bethany-blooms-gift-card"
  );
}

function getCanonicalSiteUrl() {
  const configured = (getSiteUrl() || "").toString().trim().replace(/\/+$/, "");
  if (configured) return configured;
  return "https://bethanyblooms.co.za";
}

function getFunctionsBaseUrl() {
  const region = "us-central1";
  const projectId = admin.app().options.projectId || "bethanyblooms-89dcc";
  return `https://${region}-${projectId}.cloudfunctions.net`;
}

function normalizePayfastMode(modeInput, fallback = "live") {
  const normalized = (modeInput || "").toString().trim().toLowerCase();
  if (normalized === "live") return "live";
  return "live";
}

function extractHostname(urlString = "") {
  const input = (urlString || "").toString().trim();
  if (!input) return "";
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalHost(hostname = "") {
  const normalized = (hostname || "").toString().trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost")
  );
}

function resolvePayfastMode({
  returnUrl = "",
  cancelUrl = "",
  configuredMode = "live",
} = {}) {
  const returnHost = extractHostname(returnUrl);
  const cancelHost = extractHostname(cancelUrl);
  const isLocalDevCheckout = isLocalHost(returnHost) || isLocalHost(cancelHost);
  return {
    mode: normalizePayfastMode(configuredMode, "live"),
    isLocalDevCheckout,
    returnHost,
    cancelHost,
  };
}

function getPayfastConfig() {
  const siteUrl = getSiteUrl();
  const legacyMerchantId = sanitizePayfastCredentialValue(
    process.env.PAYFAST_MERCHANT_ID ||
      safeParamValue(PAYFAST_MERCHANT_ID, ""),
  );
  const legacyMerchantKey = sanitizePayfastCredentialValue(
    process.env.PAYFAST_MERCHANT_KEY ||
      safeParamValue(PAYFAST_MERCHANT_KEY, ""),
  );
  const legacyPassphrase = sanitizePayfastCredentialValue(
    process.env.PAYFAST_PASSPHRASE ||
      safeParamValue(PAYFAST_PASSPHRASE, ""),
  );
  const configuredMode = normalizePayfastMode(
    process.env.PAYFAST_MODE ||
      safeParamValue(PAYFAST_MODE, "live") ||
      "live",
    "live",
  );
  return {
    returnUrl:
      process.env.PAYFAST_RETURN_URL ||
      safeParamValue(PAYFAST_RETURN_URL, "") ||
      (siteUrl ? `${siteUrl}/payment/success` : ""),
    cancelUrl:
      process.env.PAYFAST_CANCEL_URL ||
      safeParamValue(PAYFAST_CANCEL_URL, "") ||
      (siteUrl ? `${siteUrl}/payment/cancel` : ""),
    notifyUrl:
      process.env.PAYFAST_NOTIFY_URL ||
      safeParamValue(PAYFAST_NOTIFY_URL, ""),
    mode: configuredMode,
    configuredMode,
    liveCredentials: {
      merchantId: sanitizePayfastCredentialValue(
        process.env.PAYFAST_LIVE_MERCHANT_ID ||
        safeParamValue(PAYFAST_LIVE_MERCHANT_ID, "") ||
        legacyMerchantId,
      ),
      merchantKey: sanitizePayfastCredentialValue(
        process.env.PAYFAST_LIVE_MERCHANT_KEY ||
        safeParamValue(PAYFAST_LIVE_MERCHANT_KEY, "") ||
        legacyMerchantKey,
      ),
      passphrase: sanitizePayfastCredentialValue(
        process.env.PAYFAST_LIVE_PASSPHRASE ||
        safeParamValue(PAYFAST_LIVE_PASSPHRASE, "") ||
        legacyPassphrase,
      ),
    },
  };
}

function hasPayfastCredentialPair(credentials = {}) {
  const merchantId = (credentials?.merchantId || "").toString().trim();
  const merchantKey = (credentials?.merchantKey || "").toString().trim();
  return Boolean(merchantId && merchantKey);
}

function resolvePayfastCredentials(
  modeInput,
  payfastConfig,
  { allowModeFallback = true } = {},
) {
  const requestedMode = normalizePayfastMode(
    modeInput,
    payfastConfig?.configuredMode || "live",
  );
  const liveCredentials = payfastConfig?.liveCredentials || {};
  const mode = "live";
  const fallbackReason = requestedMode === "live" ? null : "mode-forced-live";
  const credentialSource = liveCredentials;
  return {
    requestedMode,
    mode,
    host: payfastHosts[mode],
    merchantId: sanitizePayfastCredentialValue(
      credentialSource?.merchantId || "",
    ),
    merchantKey: sanitizePayfastCredentialValue(
      credentialSource?.merchantKey || "",
    ),
    passphrase: sanitizePayfastCredentialValue(
      credentialSource?.passphrase || "",
    ),
    fallbackReason,
    allowModeFallback,
  };
}

function getResendClient() {
  if (resendClient) return resendClient;
  const apiKey = getResendApiKey();
  if (!apiKey) return null;
  resendClient = new Resend(apiKey);
  return resendClient;
}

function escapeHtml(value = "") {
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const EMAIL_BRAND = {
  background: "#f5ead7",
  card: "#ffffff",
  primary: "#556b2f",
  accent: "#e3a6a1",
  sage: "#b7c4a9",
  text: "#2f3624",
  muted: "rgba(47, 54, 36, 0.7)",
  border: "rgba(85, 107, 47, 0.18)",
};

function wrapEmail({ title, subtitle = "", body, footerNote = "" }) {
  const siteUrl = getSiteUrl();
  const logoText = "Bethany Blooms";
  const supportLine = `Call/WhatsApp: <a href="tel:${escapeHtml(
    COMPANY_PHONE_TEL,
  )}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">${escapeHtml(
    COMPANY_PHONE_LOCAL,
  )}</a> · <a href="${escapeHtml(
    COMPANY_WHATSAPP_URL,
  )}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">WhatsApp chat</a>`;
  const footerContent =
    footerNote ||
    `Need help? Reply to this email or visit ${
      siteUrl
        ? `<a href="${escapeHtml(siteUrl)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">${escapeHtml(siteUrl)}</a>`
        : "our website"
    }.`;
  return `
  <div style="margin:0;padding:0;background:${EMAIL_BRAND.background};font-family:Verdana,Arial,sans-serif;color:${EMAIL_BRAND.text};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${EMAIL_BRAND.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:${EMAIL_BRAND.card};border-radius:22px;overflow:hidden;border:1px solid ${EMAIL_BRAND.border};box-shadow:0 20px 45px -35px rgba(58,58,58,0.35);">
            <tr>
              <td style="padding:24px 28px;background:linear-gradient(135deg, ${EMAIL_BRAND.primary}, ${EMAIL_BRAND.accent});color:#fff;">
                <p style="margin:0;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;">${logoText}</p>
                <h1 style="margin:10px 0 0;font-size:24px;font-weight:700;">${escapeHtml(title)}</h1>
                ${subtitle ? `<p style="margin:6px 0 0;font-size:14px;opacity:0.92;">${escapeHtml(subtitle)}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 18px;line-height:1.65;font-size:15px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;">
                <div style="border-top:1px solid ${EMAIL_BRAND.border};padding-top:16px;font-size:13px;color:${EMAIL_BRAND.muted};">
                  <p style="margin:0 0 8px;">${footerContent}</p>
                  <p style="margin:0;">${supportLine}</p>
                </div>
              </td>
            </tr>
          </table>
          <p style="margin-top:16px;font-size:11px;color:${EMAIL_BRAND.muted};">Sent with care from Bethany Blooms.</p>
        </td>
      </tr>
    </table>
  </div>
  `;
}

async function sendEmail({ to, subject, html, attachments = [] }) {
  const client = getResendClient();
  if (!client) {
    functions.logger.error("Resend is not configured. Set RESEND_API_KEY.");
    return { error: "Resend not configured" };
  }
  try {
    const payload = {
      from: getResendFrom(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (Array.isArray(attachments) && attachments.length) {
      payload.attachments = attachments;
    }
    return await client.emails.send(payload);
  } catch (error) {
    functions.logger.error("Resend send failed", error);
    return { error: error.message };
  }
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "R0.00";
  return `R${amount.toFixed(2)}`;
}

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateText(value = "", maxLength = DEFAULT_TRUNCATE_TEXT_LENGTH) {
  const text = value == null ? "" : value.toString();
  if (!Number.isFinite(maxLength) || maxLength <= 0) return "";
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}

function hashEftProofUploadToken(token = "") {
  return crypto.createHash("sha256").update(token.toString()).digest("hex");
}

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

function normalizePreorderSendMonth(value = "") {
  const raw = value.toString().trim();
  if (!raw) return "";
  const directMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  if (directMatch) return `${directMatch[1]}-${directMatch[2]}`;

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return "";
  const year = parsedDate.getUTCFullYear();
  const month = `${parsedDate.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function formatPreorderSendMonth(value = "") {
  const normalized = normalizePreorderSendMonth(value);
  if (!normalized) return "";
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTimeZoneDateParts(date = new Date(), timeZone = SUBSCRIPTION_TIMEZONE) {
  const safeDate = date instanceof Date ? date : new Date(date);
  const formattedParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(safeDate);
  const year = Number(
    formattedParts.find((part) => part.type === "year")?.value || 0,
  );
  const month = Number(
    formattedParts.find((part) => part.type === "month")?.value || 0,
  );
  const day = Number(
    formattedParts.find((part) => part.type === "day")?.value || 0,
  );
  return {
    year,
    month,
    day,
    monthKey:
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      year > 0 &&
      month >= 1 &&
      month <= 12
        ? `${year}-${String(month).padStart(2, "0")}`
        : "",
  };
}

function getDaysInMonth(year, month) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return 30;
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildDateKey(year, month, day) {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTimeZoneDateKey(date = new Date(), timeZone = SUBSCRIPTION_TIMEZONE) {
  const parts = formatTimeZoneDateParts(date, timeZone);
  return buildDateKey(parts.year, parts.month, parts.day);
}

function normalizeIsoDateKey(value = "") {
  const normalized = (value || "").toString().trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDays = getDaysInMonth(year, month);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > maxDays
  ) {
    return "";
  }
  return buildDateKey(year, month, day);
}

function compareIsoDateKeys(leftDate = "", rightDate = "") {
  const left = normalizeIsoDateKey(leftDate);
  const right = normalizeIsoDateKey(rightDate);
  if (!left || !right) return 0;
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function normalizeSubscriptionMondaySlot(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  return SUBSCRIPTION_MONDAY_SLOT_VALUES.includes(normalized) ? normalized : "";
}

function resolveTierRequiredDeliveryCount(tier = "") {
  const normalizedTier = normalizeSubscriptionTier(tier);
  return SUBSCRIPTION_DELIVERY_SLOT_COUNT_BY_TIER[normalizedTier] || 1;
}

function getDefaultMondaySlotsForTier(tier = "") {
  const normalizedTier = normalizeSubscriptionTier(tier);
  const defaults = SUBSCRIPTION_DELIVERY_SLOT_DEFAULTS[normalizedTier];
  if (Array.isArray(defaults) && defaults.length) return [...defaults];
  return ["first"];
}

function normalizeMondaySlotsForTier(
  tier = "",
  slots = [],
  { allowDefaults = true } = {},
) {
  const normalizedTier = normalizeSubscriptionTier(tier);
  if (!normalizedTier) return [];
  if (normalizedTier === "weekly") {
    return [...SUBSCRIPTION_MONDAY_SLOT_VALUES];
  }

  const requiredCount = resolveTierRequiredDeliveryCount(normalizedTier);
  const seen = new Set();
  const normalized = [];
  (Array.isArray(slots) ? slots : []).forEach((slotValue) => {
    const slot = normalizeSubscriptionMondaySlot(slotValue);
    if (!slot || seen.has(slot)) return;
    seen.add(slot);
    normalized.push(slot);
  });

  if (normalized.length >= requiredCount) {
    return normalized.slice(0, requiredCount);
  }

  if (!allowDefaults) return normalized;

  const fallback = getDefaultMondaySlotsForTier(normalizedTier);
  for (const fallbackSlot of fallback) {
    if (normalized.length >= requiredCount) break;
    if (seen.has(fallbackSlot)) continue;
    seen.add(fallbackSlot);
    normalized.push(fallbackSlot);
  }

  return normalized.slice(0, requiredCount);
}

function getMondaySlotMapForMonth(monthKey = "", timeZone = SUBSCRIPTION_TIMEZONE) {
  const parsed = parseSubscriptionMonthKey(monthKey);
  if (!parsed) return {};
  const daysInMonth = getDaysInMonth(parsed.year, parsed.month);
  const mondays = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const probeDate = new Date(Date.UTC(parsed.year, parsed.month - 1, day, 12, 0, 0));
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
    })
      .format(probeDate)
      .toLowerCase();
    if (weekday !== "monday") continue;
    const dateKey = normalizeIsoDateKey(
      getTimeZoneDateKey(probeDate, timeZone) || buildDateKey(parsed.year, parsed.month, day),
    );
    if (dateKey) {
      mondays.push(dateKey);
    }
  }
  return {
    first: mondays[0] || "",
    second: mondays[1] || "",
    third: mondays[2] || "",
    fourth: mondays[3] || "",
    last: mondays[mondays.length - 1] || "",
    all: mondays,
  };
}

function listMondaysForMonth(monthKey = "", timeZone = SUBSCRIPTION_TIMEZONE) {
  return getMondaySlotMapForMonth(monthKey, timeZone).all || [];
}

function resolveCycleDeliveryDates(
  tier = "",
  slots = [],
  monthKey = "",
  timeZone = SUBSCRIPTION_TIMEZONE,
) {
  const normalizedTier = normalizeSubscriptionTier(tier);
  const mondayMap = getMondaySlotMapForMonth(monthKey, timeZone);
  const allMondays = mondayMap.all || [];
  if (!normalizedTier || !allMondays.length) return [];
  if (normalizedTier === "weekly") return allMondays;

  const requiredCount = resolveTierRequiredDeliveryCount(normalizedTier);
  const normalizedSlots = normalizeMondaySlotsForTier(normalizedTier, slots, {
    allowDefaults: true,
  });
  const selectedDates = [];
  const selectedSet = new Set();
  normalizedSlots.forEach((slot) => {
    const dateKey = normalizeIsoDateKey(mondayMap[slot] || "");
    if (!dateKey || selectedSet.has(dateKey)) return;
    selectedSet.add(dateKey);
    selectedDates.push(dateKey);
  });

  for (const mondayDate of allMondays) {
    if (selectedDates.length >= requiredCount) break;
    if (selectedSet.has(mondayDate)) continue;
    selectedSet.add(mondayDate);
    selectedDates.push(mondayDate);
  }

  return selectedDates.slice(0, requiredCount).sort((a, b) => compareIsoDateKeys(a, b));
}

function filterRemainingDeliveryDates(
  deliveryDates = [],
  signupDate = new Date(),
  cutoffRule = SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
  timeZone = SUBSCRIPTION_TIMEZONE,
) {
  const normalizedSignupDate = getTimeZoneDateKey(signupDate, timeZone);
  const uniqueDates = Array.from(
    new Set(
      (Array.isArray(deliveryDates) ? deliveryDates : [])
        .map((value) => normalizeIsoDateKey(value))
        .filter(Boolean),
    ),
  ).sort((a, b) => compareIsoDateKeys(a, b));
  if (!normalizedSignupDate) return uniqueDates;
  if (cutoffRule === SUBSCRIPTION_DELIVERY_CUTOFF_RULE) {
    return uniqueDates.filter((dateKey) => compareIsoDateKeys(dateKey, normalizedSignupDate) > 0);
  }
  return uniqueDates.filter((dateKey) => compareIsoDateKeys(dateKey, normalizedSignupDate) >= 0);
}

function roundMoney(value = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(2));
}

function buildDeliveryScheduleSnapshot({
  tier = "",
  mondaySlots = [],
  cycleMonth = "",
  includedDeliveryDates = [],
  timeZone = SUBSCRIPTION_TIMEZONE,
} = {}) {
  const normalizedTier = normalizeSubscriptionTier(tier);
  const normalizedCycle = normalizePreorderSendMonth(cycleMonth);
  const normalizedSlots = normalizeMondaySlotsForTier(normalizedTier, mondaySlots, {
    allowDefaults: true,
  });
  const cycleDeliveryDates = resolveCycleDeliveryDates(
    normalizedTier,
    normalizedSlots,
    normalizedCycle,
    timeZone,
  );
  const included = Array.from(
    new Set(
      (Array.isArray(includedDeliveryDates) ? includedDeliveryDates : [])
        .map((dateKey) => normalizeIsoDateKey(dateKey))
        .filter(Boolean),
    ),
  )
    .filter((dateKey) => cycleDeliveryDates.includes(dateKey))
    .sort((a, b) => compareIsoDateKeys(a, b));
  const effectiveIncluded = included.length ? included : cycleDeliveryDates;
  return {
    slotModel: SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL,
    cutoffRule: SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
    slots: normalizedSlots,
    cycleDeliveryDates,
    includedDeliveryDates: effectiveIncluded,
    totalDeliveries: cycleDeliveryDates.length,
    includedDeliveries: effectiveIncluded.length,
    firstDeliveryDate: effectiveIncluded[0] || cycleDeliveryDates[0] || null,
  };
}

function resolveSubscriptionDeliveryPreference(subscription = {}) {
  const normalizedTier = normalizeSubscriptionTier(
    subscription?.tier || subscription?.subscriptionPlan?.tier || "",
  );
  const source = subscription?.deliveryPreference || {};
  const slots = normalizeMondaySlotsForTier(normalizedTier, source?.slots, {
    allowDefaults: true,
  });
  return {
    model: SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL,
    cutoffRule: SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
    slots,
  };
}

function calculateSignupInvoicePlan({
  tier = "",
  monthlyAmount = 0,
  mondaySlots = [],
  signupMonth = "",
  signupDate = new Date(),
  timeZone = SUBSCRIPTION_TIMEZONE,
} = {}) {
  const normalizedTier = normalizeSubscriptionTier(tier);
  const normalizedSignupMonth = normalizePreorderSendMonth(signupMonth);
  const perDeliveryAmount = roundMoney(monthlyAmount);
  if (!normalizedTier || !normalizedSignupMonth || !Number.isFinite(perDeliveryAmount) || perDeliveryAmount <= 0) {
    throw new Error("Subscription billing plan is invalid.");
  }

  const normalizedSlots = normalizeMondaySlotsForTier(normalizedTier, mondaySlots, {
    allowDefaults: true,
  });
  const signupCycleDates = resolveCycleDeliveryDates(
    normalizedTier,
    normalizedSlots,
    normalizedSignupMonth,
    timeZone,
  );
  const remainingDates = filterRemainingDeliveryDates(
    signupCycleDates,
    signupDate,
    SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
    timeZone,
  );

  if (remainingDates.length > 0 && signupCycleDates.length > 0) {
    const includedDeliveryCount = remainingDates.length;
    const totalDeliveryCount = signupCycleDates.length;
    const ratio = Number((remainingDates.length / signupCycleDates.length).toFixed(6));
    const cycleAmount = roundMoney(perDeliveryAmount * totalDeliveryCount);
    const invoiceAmount = roundMoney(perDeliveryAmount * includedDeliveryCount);
    return {
      cycleMonth: normalizedSignupMonth,
      invoiceAmount,
      cycleAmount,
      perDeliveryAmount,
      isProrated: remainingDates.length < signupCycleDates.length,
      prorationRatio: ratio,
      prorationBasis: "remaining-deliveries",
      deliverySchedule: buildDeliveryScheduleSnapshot({
        tier: normalizedTier,
        mondaySlots: normalizedSlots,
        cycleMonth: normalizedSignupMonth,
        includedDeliveryDates: remainingDates,
        timeZone,
      }),
    };
  }

  const nextCycleMonth = getNextMonthKey(normalizedSignupMonth);
  if (!nextCycleMonth) {
    throw new Error("Unable to resolve next billing month.");
  }
  const nextCycleSchedule = buildDeliveryScheduleSnapshot({
    tier: normalizedTier,
    mondaySlots: normalizedSlots,
    cycleMonth: nextCycleMonth,
    timeZone,
  });
  const nextCycleDeliveries = Number(nextCycleSchedule.totalDeliveries || 0);
  const nextCycleAmount = roundMoney(perDeliveryAmount * nextCycleDeliveries);
  return {
    cycleMonth: nextCycleMonth,
    invoiceAmount: nextCycleAmount,
    cycleAmount: nextCycleAmount,
    perDeliveryAmount,
    isProrated: false,
    prorationRatio: 1,
    prorationBasis: "remaining-deliveries",
    deliverySchedule: nextCycleSchedule,
  };
}

function buildCycleInvoicePlan({
  tier = "",
  monthlyAmount = 0,
  mondaySlots = [],
  cycleMonth = "",
  timeZone = SUBSCRIPTION_TIMEZONE,
} = {}) {
  const normalizedTier = normalizeSubscriptionTier(tier);
  const normalizedCycleMonth = normalizePreorderSendMonth(cycleMonth);
  const perDeliveryAmount = roundMoney(monthlyAmount);
  if (!normalizedTier || !normalizedCycleMonth || !Number.isFinite(perDeliveryAmount) || perDeliveryAmount <= 0) {
    throw new Error("Subscription billing cycle is invalid.");
  }
  const deliverySchedule = buildDeliveryScheduleSnapshot({
    tier: normalizedTier,
    mondaySlots,
    cycleMonth: normalizedCycleMonth,
    timeZone,
  });
  const totalDeliveries = Number(deliverySchedule.totalDeliveries || 0);
  const cycleAmount = roundMoney(perDeliveryAmount * totalDeliveries);
  return {
    cycleMonth: normalizedCycleMonth,
    invoiceAmount: cycleAmount,
    cycleAmount,
    perDeliveryAmount,
    isProrated: false,
    prorationRatio: 1,
    prorationBasis: "remaining-deliveries",
    deliverySchedule,
  };
}

function formatDeliveryDateLabel(dateKey = "") {
  const normalized = normalizeIsoDateKey(dateKey);
  if (!normalized) return "";
  const [yearText, monthText, dayText] = normalized.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText), 12, 0, 0));
  return date.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDeliveryDateListForEmail(dates = []) {
  const labels = Array.from(
    new Set(
      (Array.isArray(dates) ? dates : [])
        .map((value) => formatDeliveryDateLabel(value))
        .filter(Boolean),
    ),
  );
  return labels.join(", ");
}

function formatMondaySlotLabel(slot = "") {
  const normalized = normalizeSubscriptionMondaySlot(slot);
  return SUBSCRIPTION_DELIVERY_SLOT_LABELS[normalized] || "";
}

function formatMondaySlotList(slots = []) {
  const labels = Array.from(
    new Set(
      (Array.isArray(slots) ? slots : [])
        .map((slot) => formatMondaySlotLabel(slot))
        .filter(Boolean),
    ),
  );
  return labels.join(", ");
}

function normalizeSubscriptionCategoryToken(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (!normalized) return "";
  return normalized.replace(/[^a-z0-9]+/g, "");
}

function isSubscriptionCategoryToken(value = "") {
  const normalized = normalizeSubscriptionCategoryToken(value);
  if (!normalized) return false;
  return SUBSCRIPTION_CATEGORY_TOKENS.has(normalized) || normalized.includes("subscription");
}

function normalizeSubscriptionTier(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "biweekly") return "bi-weekly";
  if (Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PLAN_MATRIX, normalized)) {
    return normalized;
  }
  return "";
}

function normalizeSubscriptionStems(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 0 ? Math.min(999, parsed) : 0;
}

function resolveSubscriptionMonthlyPrice(tier = "", stems = 0) {
  const normalizedTier = normalizeSubscriptionTier(tier);
  const normalizedStems = normalizeSubscriptionStems(stems);
  if (!normalizedTier || !normalizedStems) return null;
  const rawAmount = SUBSCRIPTION_PLAN_MATRIX[normalizedTier]?.[String(normalizedStems)];
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    tier: normalizedTier,
    stems: normalizedStems,
    amount: Number(amount.toFixed(2)),
  };
}

function formatSubscriptionTierLabel(tier = "") {
  const normalizedTier = normalizeSubscriptionTier(tier);
  if (normalizedTier === "bi-weekly") return "Bi-weekly";
  if (normalizedTier === "weekly") return "Weekly";
  if (normalizedTier === "monthly") return "Monthly";
  return "Monthly";
}

function resolveSubscriptionTierFromText(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (!normalized) return "";
  if (
    normalized.includes("bi-weekly") ||
    normalized.includes("bi weekly") ||
    normalized.includes("biweekly")
  ) {
    return "bi-weekly";
  }
  if (normalized.includes("weekly")) return "weekly";
  if (normalized.includes("monthly") || normalized.includes("month")) return "monthly";
  return "";
}

function resolveSubscriptionStemsFromText(value = "") {
  const normalized = (value || "").toString().trim();
  if (!normalized) return 0;
  const stemsMatch = normalized.match(/(\d{1,3})\s*(?:stems?|stem)\b/i);
  if (stemsMatch?.[1]) {
    return normalizeSubscriptionStems(stemsMatch[1]);
  }
  const preferredCount = normalized.match(/\b(16|32)\b/);
  if (preferredCount?.[1]) {
    return normalizeSubscriptionStems(preferredCount[1]);
  }
  return 0;
}

function resolveSubscriptionTierValue(...values) {
  for (const value of values) {
    const normalized = normalizeSubscriptionTier(value);
    if (normalized) return normalized;
    const parsedFromText = resolveSubscriptionTierFromText(value);
    if (parsedFromText) return parsedFromText;
  }
  return "";
}

function resolveSubscriptionStemValue(...values) {
  for (const value of values) {
    const normalized = normalizeSubscriptionStems(value);
    if (normalized > 0) return normalized;
    const parsedFromText = resolveSubscriptionStemsFromText(value);
    if (parsedFromText > 0) return parsedFromText;
  }
  return 0;
}

function toPositiveMoneyAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(2));
}

function resolveSubscriptionProductName(product = {}) {
  return trimToLength(
    product?.title ||
      product?.name ||
      product?.planName ||
      "Flower subscription",
    180,
  );
}

function resolveSubscriptionVariantOptions(product = {}) {
  const rawVariants = Array.isArray(product?.variants) ? product.variants : [];
  return rawVariants
    .map((variant, index) => {
      const label = trimToLength(variant?.label || variant?.name || "", 180);
      const resolvedId = trimToLength(
        variant?.id || label || `variant-${index + 1}`,
        120,
      );
      if (!resolvedId) return null;
      const price = toPositiveMoneyAmount(
        variant?.sale_price ?? variant?.salePrice ?? variant?.price,
      );
      return {
        id: resolvedId,
        label: label || resolvedId,
        price,
        raw: variant && typeof variant === "object" ? variant : {},
      };
    })
    .filter(Boolean);
}

function resolveSubscriptionBasePrice(product = {}) {
  return (
    toPositiveMoneyAmount(product?.sale_price) ||
    toPositiveMoneyAmount(product?.salePrice) ||
    toPositiveMoneyAmount(product?.price) ||
    toPositiveMoneyAmount(product?.monthlyPrice) ||
    toPositiveMoneyAmount(product?.monthly_amount)
  );
}

function normalizeSubscriptionProductSnapshot(value = {}) {
  const productId = trimToLength(
    value?.productId || value?.id || value?.sourceId || "",
    120,
  );
  if (!productId) return null;
  return {
    productId,
    productSlug: trimToLength(value?.productSlug || value?.slug || "", 200) || null,
    productSku: trimToLength(value?.productSku || value?.sku || "", 120) || null,
    productName: trimToLength(
      value?.productName || value?.name || "Flower subscription",
      180,
    ),
    variantId: trimToLength(value?.variantId || "", 120) || null,
    variantLabel: trimToLength(value?.variantLabel || "", 180) || null,
    category: trimToLength(value?.category || "", 120) || null,
  };
}

function normalizeSubscriptionPlanStatus(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_PLAN_STATUSES.LIVE) return SUBSCRIPTION_PLAN_STATUSES.LIVE;
  if (normalized === SUBSCRIPTION_PLAN_STATUSES.DRAFT) return SUBSCRIPTION_PLAN_STATUSES.DRAFT;
  if (normalized === SUBSCRIPTION_PLAN_STATUSES.ARCHIVED) return SUBSCRIPTION_PLAN_STATUSES.ARCHIVED;
  return SUBSCRIPTION_PLAN_STATUSES.DRAFT;
}

function normalizeSubscriptionPlanTier(value = "") {
  return normalizeSubscriptionTier(value);
}

function normalizeSubscriptionPlanStems(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed === 16 || parsed === 32) return parsed;
  return 0;
}

function resolveSubscriptionPlanAmountFromMatrix(tier = "", stems = 0) {
  const normalizedTier = normalizeSubscriptionPlanTier(tier);
  const normalizedStems = normalizeSubscriptionPlanStems(stems);
  if (!normalizedTier || !normalizedStems) return null;
  const amount = toPositiveMoneyAmount(
    SUBSCRIPTION_PLAN_MATRIX?.[normalizedTier]?.[String(normalizedStems)],
  );
  if (!amount) return null;
  return {
    tier: normalizedTier,
    stems: normalizedStems,
    amount,
  };
}

function normalizeSubscriptionPlanSnapshot(value = {}) {
  const planId = trimToLength(
    value?.planId || value?.id || value?.sourceId || "",
    120,
  );
  if (!planId) return null;
  const tier = normalizeSubscriptionPlanTier(value?.tier);
  const stems = normalizeSubscriptionPlanStems(value?.stems);
  const matrixAmount = resolveSubscriptionPlanAmountFromMatrix(tier, stems)?.amount || null;
  const monthlyAmount =
    toPositiveMoneyAmount(value?.monthlyAmount ?? value?.monthly_amount) ||
    matrixAmount ||
    null;
  const status = normalizeSubscriptionPlanStatus(
    value?.status || SUBSCRIPTION_PLAN_STATUSES.DRAFT,
  );
  return {
    planId,
    name: trimToLength(value?.name || value?.title || "Flower subscription", 180),
    description: trimToLength(value?.description || "", 1000) || null,
    categoryId: trimToLength(value?.categoryId || "", 120) || null,
    categoryName: trimToLength(value?.categoryName || value?.category || "", 180) || null,
    tier: tier || "",
    stems: stems || 0,
    monthlyAmount,
    currency: trimToLength(value?.currency || SUBSCRIPTION_CURRENCY, 12) || SUBSCRIPTION_CURRENCY,
    image: trimToLength(value?.image || value?.mainImage || "", 2000) || null,
    status,
  };
}

function resolveSubscriptionPlanFromDocument(plan = {}) {
  const snapshot = normalizeSubscriptionPlanSnapshot(plan);
  if (!snapshot) return null;
  if (snapshot.status !== SUBSCRIPTION_PLAN_STATUSES.LIVE) return null;
  if (!snapshot.categoryId) return null;
  const tier = normalizeSubscriptionPlanTier(snapshot.tier);
  const stems = normalizeSubscriptionPlanStems(snapshot.stems);
  const monthlyAmount = toPositiveMoneyAmount(snapshot.monthlyAmount);
  if (!tier || !stems || !monthlyAmount) return null;
  const normalizedSnapshot = {
    ...snapshot,
    tier,
    stems,
    monthlyAmount,
    status: SUBSCRIPTION_PLAN_STATUSES.LIVE,
  };
  const planName = trimToLength(
    normalizedSnapshot.name || "Flower subscription",
    180,
  );
  const subscriptionProduct = normalizeSubscriptionProductSnapshot({
    productId: normalizedSnapshot.planId,
    productName: planName,
    category: normalizedSnapshot.categoryName || "",
  });
  return {
    planName,
    tier: normalizedSnapshot.tier,
    stems: normalizedSnapshot.stems,
    monthlyAmount: normalizedSnapshot.monthlyAmount,
    subscriptionPlan: normalizedSnapshot,
    subscriptionProduct,
  };
}

function collectSubscriptionProductCategoryValues(product = {}) {
  const values = [];
  if (Array.isArray(product?.category_ids)) values.push(...product.category_ids);
  if (Array.isArray(product?.categoryIds)) values.push(...product.categoryIds);
  if (product?.categoryId) values.push(product.categoryId);
  if (product?.categorySlug) values.push(product.categorySlug);
  if (product?.category) values.push(product.category);
  if (product?.categoryName) values.push(product.categoryName);
  if (Array.isArray(product?.categories)) values.push(...product.categories);

  const deduped = [];
  const seen = new Set();
  values.forEach((entry) => {
    const value = (entry ?? "").toString().trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(value);
  });
  return deduped;
}

function collectSubscriptionCategoryDocIds(product = {}) {
  const values = [];
  if (Array.isArray(product?.category_ids)) values.push(...product.category_ids);
  if (Array.isArray(product?.categoryIds)) values.push(...product.categoryIds);
  if (product?.categoryId) values.push(product.categoryId);
  if (product?.categorySlug) values.push(product.categorySlug);
  return collectSubscriptionProductCategoryValues({ category_ids: values });
}

function hasExplicitSubscriptionFlag(product = {}) {
  if (!product || typeof product !== "object") return false;
  if (product.isSubscription === true || product.subscriptionEnabled === true) return true;
  const typeValue = (product.productType || product.type || product.kind || "")
    .toString()
    .trim()
    .toLowerCase();
  return typeValue === "subscription";
}

async function isSubscriptionProductRecord(product = {}) {
  if (!product || typeof product !== "object") return false;
  if (hasExplicitSubscriptionFlag(product)) return true;

  const categoryValues = collectSubscriptionProductCategoryValues(product);
  if (categoryValues.some((value) => isSubscriptionCategoryToken(value))) {
    return true;
  }

  const categoryDocIds = collectSubscriptionCategoryDocIds(product);
  if (!categoryDocIds.length) return false;
  const categorySnapshots = await Promise.all(
    categoryDocIds.map((categoryId) =>
      db.collection("productCategories").doc(categoryId).get(),
    ),
  );
  return categorySnapshots.some((snapshot) => {
    if (!snapshot.exists) return false;
    const data = snapshot.data() || {};
    return [
      snapshot.id,
      data?.slug,
      data?.name,
      data?.title,
      data?.label,
    ].some((entry) => isSubscriptionCategoryToken(entry));
  });
}

function resolveSubscriptionRecurringAmount(subscription = {}) {
  const planSnapshotAmount = toPositiveMoneyAmount(
    subscription?.subscriptionPlan?.monthlyAmount,
  );
  if (planSnapshotAmount) return planSnapshotAmount;
  const directAmount = toPositiveMoneyAmount(subscription?.monthlyAmount);
  if (directAmount) return directAmount;
  const matrixAmount = resolveSubscriptionPlanAmountFromMatrix(
    subscription?.subscriptionPlan?.tier || subscription?.tier,
    subscription?.subscriptionPlan?.stems || subscription?.stems,
  );
  if (matrixAmount?.amount) return matrixAmount.amount;
  const legacyAmount = resolveSubscriptionMonthlyPrice(
    subscription?.tier,
    subscription?.stems,
  );
  return legacyAmount?.amount || null;
}

function buildSubscriptionPlanLabel(subscription = {}, invoice = {}) {
  const planSnapshotName = trimToLength(
    subscription?.subscriptionPlan?.name ||
      invoice?.subscriptionPlan?.name ||
      "",
    180,
  );
  if (planSnapshotName) return planSnapshotName;

  const productName = trimToLength(
    subscription?.subscriptionProduct?.productName ||
      invoice?.subscriptionProduct?.productName ||
      subscription?.planName ||
      invoice?.planName ||
      "",
    180,
  );
  const variantLabel = trimToLength(
    subscription?.subscriptionProduct?.variantLabel ||
      invoice?.subscriptionProduct?.variantLabel ||
      "",
    180,
  );
  if (productName && variantLabel) return `${productName} - ${variantLabel}`;
  if (productName) return productName;

  const tier = resolveSubscriptionTierValue(subscription?.tier, invoice?.tier);
  if (tier) {
    return `${formatSubscriptionTierLabel(tier)} plan`;
  }
  return "Flower subscription";
}

function normalizeSubscriptionInvoiceType(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_INVOICE_TYPES.TOPUP) return SUBSCRIPTION_INVOICE_TYPES.TOPUP;
  return SUBSCRIPTION_INVOICE_TYPES.CYCLE;
}

function normalizeSubscriptionChargeMode(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_CHARGE_MODES.RECURRING) return SUBSCRIPTION_CHARGE_MODES.RECURRING;
  return SUBSCRIPTION_CHARGE_MODES.ONE_TIME;
}

function normalizeSubscriptionChargeBasis(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_CHARGE_BASES.PER_DELIVERY) {
    return SUBSCRIPTION_CHARGE_BASES.PER_DELIVERY;
  }
  return SUBSCRIPTION_CHARGE_BASES.FLAT;
}

function normalizeSubscriptionChargeStatus(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_CHARGE_STATUSES.REMOVED) {
    return SUBSCRIPTION_CHARGE_STATUSES.REMOVED;
  }
  return SUBSCRIPTION_CHARGE_STATUSES.ACTIVE;
}

function createSubscriptionChargeId() {
  return `charge-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function resolveSubscriptionInvoiceDeliveryCount(invoice = {}, fallbackTier = "") {
  const includedFromCount = Number(invoice?.deliverySchedule?.includedDeliveries);
  if (Number.isFinite(includedFromCount) && includedFromCount >= 0) {
    return Math.max(0, Math.floor(includedFromCount));
  }
  const includedDatesCount = Array.isArray(invoice?.deliverySchedule?.includedDeliveryDates)
    ? invoice.deliverySchedule.includedDeliveryDates.length
    : 0;
  if (includedDatesCount > 0) return includedDatesCount;
  const totalCount = Number(invoice?.deliverySchedule?.totalDeliveries);
  if (Number.isFinite(totalCount) && totalCount >= 0) {
    return Math.max(0, Math.floor(totalCount));
  }
  const cycleDatesCount = Array.isArray(invoice?.deliverySchedule?.cycleDeliveryDates)
    ? invoice.deliverySchedule.cycleDeliveryDates.length
    : 0;
  if (cycleDatesCount > 0) return cycleDatesCount;
  const requiredByTier = resolveTierRequiredDeliveryCount(fallbackTier);
  return Number.isFinite(requiredByTier) && requiredByTier > 0 ? requiredByTier : 0;
}

function computeAdjustmentAmount({
  basis = SUBSCRIPTION_CHARGE_BASES.FLAT,
  amount = 0,
  includedDeliveries = 0,
} = {}) {
  const normalizedBasis = normalizeSubscriptionChargeBasis(basis);
  const safeAmount = toPositiveMoneyAmount(amount);
  if (!safeAmount) return 0;
  if (normalizedBasis === SUBSCRIPTION_CHARGE_BASES.PER_DELIVERY) {
    const deliveries = Number.isFinite(Number(includedDeliveries))
      ? Math.max(0, Math.floor(Number(includedDeliveries)))
      : 0;
    return roundMoney(safeAmount * deliveries);
  }
  return roundMoney(safeAmount);
}

function computeCycleBaseAmount({
  tier = "",
  perDeliveryAmount = 0,
  deliverySchedule = null,
} = {}) {
  const safePerDelivery = toPositiveMoneyAmount(perDeliveryAmount);
  if (!safePerDelivery) return 0;
  const deliveryCount = resolveSubscriptionInvoiceDeliveryCount(
    { deliverySchedule: deliverySchedule || null },
    normalizeSubscriptionTier(tier),
  );
  return roundMoney(safePerDelivery * deliveryCount);
}

function normalizeSubscriptionInvoiceAdjustment(entry = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const adjustmentId = trimToLength(
    entry.adjustmentId || entry.chargeId || "",
    120,
  ) || createSubscriptionChargeId();
  const amount = Number(entry?.amount);
  if (!Number.isFinite(amount)) return null;
  const roundedAmount = roundMoney(amount);
  const source = (entry.source || "").toString().trim().toLowerCase();
  const normalizedSource = Object.values(SUBSCRIPTION_ADJUSTMENT_SOURCES).includes(source)
    ? source
    : SUBSCRIPTION_ADJUSTMENT_SOURCES.EXTRA_CHARGE;
  return {
    adjustmentId,
    chargeId: trimToLength(entry.chargeId || adjustmentId, 120) || adjustmentId,
    source: normalizedSource,
    label: trimToLength(entry.label || "Adjustment", 180),
    amount: roundedAmount,
    basis: normalizeSubscriptionChargeBasis(entry.basis || ""),
    mode: normalizeSubscriptionChargeMode(entry.mode || ""),
    reason: trimToLength(entry.reason || "", 500) || null,
    createdAt: entry.createdAt || null,
    createdByUid: trimToLength(entry.createdByUid || "", 128) || null,
    createdByEmail: trimToLength(entry.createdByEmail || "", 160) || null,
  };
}

function normalizeSubscriptionInvoiceAdjustments(entries = []) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeSubscriptionInvoiceAdjustment(entry))
    .filter((entry) => {
      if (!entry) return false;
      const key = `${entry.adjustmentId}:${entry.source}:${entry.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function recomputeSubscriptionInvoiceTotals(invoice = {}) {
  const explicitBase = Number(invoice?.baseAmount);
  const fallbackAmount = Number(invoice?.amount || 0);
  const baseAmount = roundMoney(
    Number.isFinite(explicitBase) && explicitBase >= 0 ? explicitBase : fallbackAmount,
  );
  const adjustments = normalizeSubscriptionInvoiceAdjustments(invoice?.adjustments || []);
  const adjustmentsTotal = roundMoney(
    adjustments.reduce((sum, entry) => sum + Number(entry?.amount || 0), 0),
  );
  const amount = roundMoney(baseAmount + adjustmentsTotal);
  return {
    baseAmount,
    adjustmentsTotal,
    amount,
    adjustments,
  };
}

function resolveSubscriptionInvoiceFinancialSnapshot(invoice = {}) {
  const normalizedType = normalizeSubscriptionInvoiceType(invoice?.invoiceType || "");
  const totals = recomputeSubscriptionInvoiceTotals(invoice);
  return {
    invoiceType: normalizedType,
    baseInvoiceId: trimToLength(invoice?.baseInvoiceId || "", 160) || null,
    ...totals,
  };
}

function normalizeSubscriptionRecurringCharge(entry = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const chargeId = trimToLength(entry.chargeId || "", 120) || createSubscriptionChargeId();
  const amount = toPositiveMoneyAmount(entry.amount);
  if (!amount) return null;
  return {
    chargeId,
    label: trimToLength(entry.label || "Recurring charge", 180),
    amount,
    basis: normalizeSubscriptionChargeBasis(entry.basis || ""),
    status: normalizeSubscriptionChargeStatus(entry.status || ""),
    reason: trimToLength(entry.reason || "", 500) || null,
    createdAt: entry.createdAt || null,
    createdByUid: trimToLength(entry.createdByUid || "", 128) || null,
    createdByEmail: trimToLength(entry.createdByEmail || "", 160) || null,
    removedAt: entry.removedAt || null,
    removedByUid: trimToLength(entry.removedByUid || "", 128) || null,
    removedByEmail: trimToLength(entry.removedByEmail || "", 160) || null,
    removedReason: trimToLength(entry.removedReason || "", 500) || null,
  };
}

function resolveSubscriptionRecurringCharges(subscription = {}) {
  const entries = Array.isArray(subscription?.billingCharges?.recurring)
    ? subscription.billingCharges.recurring
    : [];
  return entries
    .map((entry) => normalizeSubscriptionRecurringCharge(entry))
    .filter(Boolean);
}

function buildRecurringChargeAdjustments({
  subscription = {},
  invoice = {},
} = {}) {
  const recurringCharges = resolveSubscriptionRecurringCharges(subscription);
  if (!recurringCharges.length) return [];
  const includedDeliveries = resolveSubscriptionInvoiceDeliveryCount(
    invoice,
    normalizeSubscriptionTier(
      subscription?.tier || subscription?.subscriptionPlan?.tier || invoice?.tier,
    ),
  );
  return recurringCharges
    .filter((charge) => normalizeSubscriptionChargeStatus(charge.status) === SUBSCRIPTION_CHARGE_STATUSES.ACTIVE)
    .map((charge) => {
      const appliedAmount = computeAdjustmentAmount({
        basis: charge.basis,
        amount: charge.amount,
        includedDeliveries,
      });
      if (!appliedAmount) return null;
      return {
        adjustmentId: createSubscriptionChargeId(),
        chargeId: charge.chargeId,
        source: SUBSCRIPTION_ADJUSTMENT_SOURCES.RECURRING_CHARGE,
        label: charge.label || "Recurring charge",
        amount: appliedAmount,
        basis: charge.basis,
        mode: SUBSCRIPTION_CHARGE_MODES.RECURRING,
        reason: charge.reason || null,
      };
    })
    .filter(Boolean);
}

function buildSubscriptionTopUpInvoiceDocumentId(subscriptionId = "", cycleMonth = "") {
  const baseId = buildSubscriptionInvoiceDocumentId(subscriptionId, cycleMonth);
  return `${baseId}-topup-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
}

function getCycleBaseInvoice(cycleInvoices = [], subscriptionId = "", cycleMonth = "") {
  const rows = Array.isArray(cycleInvoices) ? cycleInvoices : [];
  if (!rows.length) return null;
  const expectedId = buildSubscriptionInvoiceDocumentId(subscriptionId, cycleMonth);
  const byExpectedId = rows.find((invoice) => (invoice?.id || invoice?.invoiceId || "") === expectedId);
  if (byExpectedId) return byExpectedId;
  const byCycleType = rows.find((invoice) =>
    normalizeSubscriptionInvoiceType(invoice?.invoiceType || "") === SUBSCRIPTION_INVOICE_TYPES.CYCLE,
  );
  if (byCycleType) return byCycleType;
  return rows[0] || null;
}

function formatSubscriptionInvoiceTypeLabel(invoiceType = "") {
  return normalizeSubscriptionInvoiceType(invoiceType) === SUBSCRIPTION_INVOICE_TYPES.TOPUP
    ? "Top-up"
    : "Cycle";
}

function formatSubscriptionAdjustmentLineLabel(adjustment = {}) {
  const baseLabel = trimToLength(adjustment?.label || "Adjustment", 180);
  const detailBits = [];
  if (normalizeSubscriptionChargeBasis(adjustment?.basis) === SUBSCRIPTION_CHARGE_BASES.PER_DELIVERY) {
    detailBits.push("per delivery");
  }
  if (normalizeSubscriptionChargeMode(adjustment?.mode) === SUBSCRIPTION_CHARGE_MODES.RECURRING) {
    detailBits.push("recurring");
  }
  return detailBits.length ? `${baseLabel} (${detailBits.join(", ")})` : baseLabel;
}

function resolveSubscriptionPlanFromProduct(product = {}, selectedVariant = null) {
  const productName = resolveSubscriptionProductName(product);
  const variantLabel = trimToLength(selectedVariant?.label || "", 180) || null;
  const monthlyAmount = selectedVariant?.price || resolveSubscriptionBasePrice(product);
  if (!monthlyAmount) return null;
  const tier = resolveSubscriptionTierValue(
    selectedVariant?.raw?.subscription_tier,
    selectedVariant?.raw?.subscriptionTier,
    product?.subscription_tier,
    product?.subscriptionTier,
    variantLabel,
    productName,
  );
  const stems = resolveSubscriptionStemValue(
    selectedVariant?.raw?.subscription_stems,
    selectedVariant?.raw?.subscriptionStems,
    product?.subscription_stems,
    product?.subscriptionStems,
    variantLabel,
    productName,
  );
  const subscriptionProduct = normalizeSubscriptionProductSnapshot({
    productId: product?.id,
    productSlug: product?.slug || "",
    productSku: product?.sku || "",
    productName,
    variantId: selectedVariant?.id || "",
    variantLabel: variantLabel || "",
    category: product?.category || "",
  });
  return {
    monthlyAmount,
    tier,
    stems,
    planName: buildSubscriptionPlanLabel({
      planName: productName,
      subscriptionProduct,
    }),
    subscriptionProduct,
  };
}

function hashSubscriptionPayLinkToken(token = "") {
  return crypto.createHash("sha256").update((token || "").toString()).digest("hex");
}

function createSubscriptionPayLinkToken() {
  return crypto.randomBytes(32).toString("hex");
}

function verifySubscriptionPayLinkToken(invoice = {}, token = "") {
  const expectedHash = (invoice?.payLink?.tokenHash || "").toString().trim();
  const providedToken = (token || "").toString().trim();
  if (!expectedHash || !providedToken) return false;
  const actualHash = hashSubscriptionPayLinkToken(providedToken);
  if (!actualHash || actualHash.length !== expectedHash.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
  } catch {
    return false;
  }
}

function buildSubscriptionInvoiceDocumentId(subscriptionId = "", cycleMonth = "") {
  const digest = crypto
    .createHash("sha1")
    .update(`${(subscriptionId || "").toString().trim()}:${(cycleMonth || "").toString().trim()}`)
    .digest("hex");
  return `subinv-${digest.slice(0, 24)}`;
}

function buildSubscriptionPayLinkUrl(invoiceId = "", token = "") {
  const siteUrl = getCanonicalSiteUrl();
  const encodedInvoiceId = encodeURIComponent((invoiceId || "").toString().trim());
  const encodedToken = encodeURIComponent((token || "").toString().trim());
  return `${siteUrl}/account/subscriptions/pay/${encodedInvoiceId}?token=${encodedToken}`;
}

function formatSubscriptionInvoiceStatusLabel(value = "") {
  const normalized = normalizeSubscriptionInvoiceStatus(value);
  if (normalized === SUBSCRIPTION_INVOICE_STATUSES.PAID) return "Paid";
  if (normalized === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED) return "Cancelled";
  return "Pending payment";
}

function formatSubscriptionInvoiceDate(value, fallback = "N/A") {
  const date = coerceTimestampToDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SUBSCRIPTION_TIMEZONE,
  }).format(date);
}

function sanitizeStoragePathSegment(value = "", fallback = "item") {
  const normalized = (value || "").toString().trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  return normalized || fallback;
}

function buildStorageMediaDownloadUrl({
  bucketName = "",
  storagePath = "",
  token = "",
} = {}) {
  const safeBucket = (bucketName || "").toString().trim();
  const safePath = (storagePath || "").toString().trim().replace(/^\/+/, "");
  const safeToken = (token || "").toString().trim();
  if (!safeBucket || !safePath || !safeToken) return "";
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    safeBucket,
  )}/o/${encodeURIComponent(safePath)}?alt=media&token=${encodeURIComponent(safeToken)}`;
}

function normalizeInvoiceSequenceNumber(value = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  if (rounded <= 0) return null;
  return rounded;
}

function formatInvoiceSequenceNumber(value = null) {
  const normalized = normalizeInvoiceSequenceNumber(value);
  if (!normalized) return "";
  return `INV-${normalized.toString().padStart(6, "0")}`;
}

function buildLegacySubscriptionInvoiceNumber(invoiceId = "", cycleMonth = "") {
  const normalizedCycleMonth = normalizePreorderSendMonth(cycleMonth).replace("-", "");
  const nowMonth = formatTimeZoneDateParts(new Date(), SUBSCRIPTION_TIMEZONE).monthKey.replace("-", "");
  const monthSegment = normalizedCycleMonth || nowMonth || "000000";
  const invoiceSegment = sanitizeStoragePathSegment(invoiceId, "invoice")
    .replace(/-/g, "")
    .toUpperCase()
    .slice(-8)
    .padStart(8, "0");
  return `SUB-${monthSegment}-${invoiceSegment}`;
}

function buildSubscriptionInvoiceNumber({
  invoice = {},
  invoiceId = "",
  cycleMonth = "",
} = {}) {
  const numericInvoiceNumber = normalizeInvoiceSequenceNumber(
    invoice?.invoiceNumber || invoice?.document?.invoiceNumber,
  );
  if (numericInvoiceNumber) {
    return formatInvoiceSequenceNumber(numericInvoiceNumber);
  }
  return buildLegacySubscriptionInvoiceNumber(invoiceId, cycleMonth);
}

function buildOrderInvoiceNumber({
  order = {},
  orderId = "",
} = {}) {
  const numericInvoiceNumber = normalizeInvoiceSequenceNumber(
    order?.invoiceNumber || order?.invoice?.invoiceNumber || order?.orderNumber,
  );
  if (numericInvoiceNumber) {
    return formatInvoiceSequenceNumber(numericInvoiceNumber);
  }
  const safeOrderId = sanitizeStoragePathSegment(orderId, "order")
    .replace(/-/g, "")
    .toUpperCase()
    .slice(-8)
    .padStart(8, "0");
  return `INV-${safeOrderId}`;
}

function buildSubscriptionInvoicePdfStoragePath(subscriptionId = "", invoiceId = "") {
  const safeSubscriptionId = sanitizeStoragePathSegment(subscriptionId, "subscription");
  const safeInvoiceId = sanitizeStoragePathSegment(invoiceId, "invoice");
  return `${SUBSCRIPTION_INVOICE_DOCUMENTS_DIRECTORY}/${safeSubscriptionId}/${safeInvoiceId}.pdf`;
}

function buildSubscriptionInvoicePdfFileName(invoiceNumber = "") {
  const safeNumber = sanitizeStoragePathSegment(invoiceNumber, "invoice").toLowerCase();
  return `bethany-blooms-${safeNumber}.pdf`;
}

function buildOrderInvoicePdfStoragePath(orderId = "") {
  const safeOrderId = sanitizeStoragePathSegment(orderId, "order");
  return `${ORDER_INVOICE_DOCUMENTS_DIRECTORY}/${safeOrderId}.pdf`;
}

function buildOrderInvoicePdfFileName(invoiceNumber = "") {
  const safeNumber = sanitizeStoragePathSegment(invoiceNumber, "invoice").toLowerCase();
  return `bethany-blooms-${safeNumber}.pdf`;
}

function formatSubscriptionAddressLines(address = null) {
  if (!address || typeof address !== "object") return [];
  const normalized = normalizeCustomerProfileAddress(address);
  if (!normalized) return [];
  const lines = [];
  const label = trimToLength(normalized.label || "", 120);
  if (label) {
    lines.push(label);
  }
  lines.push(trimToLength(normalized.street || "", 200));
  lines.push(
    `${trimToLength(normalized.suburb || "", 160)}, ${trimToLength(normalized.city || "", 160)}`,
  );
  lines.push(
    `${trimToLength(normalized.province || "", 160)}, ${trimToLength(normalized.postalCode || "", 40)}`,
  );
  return lines.filter(Boolean);
}

function formatOrderAddressLines(order = {}) {
  const shipping = order?.shippingAddress;
  if (shipping && typeof shipping === "object") {
    const street = trimToLength(shipping.street || shipping.streetAddress || "", 200);
    const suburb = trimToLength(shipping.suburb || "", 160);
    const city = trimToLength(shipping.city || "", 160);
    const province = trimToLength(shipping.province || "", 160);
    const postalCode = trimToLength(shipping.postalCode || shipping.postcode || "", 40);
    const structured = [
      street,
      [suburb, city].filter(Boolean).join(", "),
      [province, postalCode].filter(Boolean).join(", "),
    ].filter(Boolean);
    if (structured.length) return structured;
  }
  const fallback = trimToLength(order?.customer?.address || "", 300);
  return fallback ? [fallback] : [];
}

async function embedBethanyBloomsLogoPdfImage(pdf) {
  const { logoBuffer } = getGiftCardDesignAssets();
  if (!logoBuffer || !Buffer.isBuffer(logoBuffer) || !logoBuffer.length) {
    return null;
  }
  try {
    return await pdf.embedPng(logoBuffer);
  } catch {
    try {
      return await pdf.embedJpg(logoBuffer);
    } catch {
      return null;
    }
  }
}

async function createSubscriptionInvoicePdfBytes({
  subscriptionId = "",
  invoiceId = "",
  subscription = {},
  invoice = {},
} = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await embedBethanyBloomsLogoPdfImage(pdf);

  const palette = {
    heading: rgb(0.17, 0.28, 0.24),
    text: rgb(0.2, 0.22, 0.2),
    muted: rgb(0.36, 0.38, 0.36),
    line: rgb(0.77, 0.79, 0.73),
    accent: rgb(0.33, 0.45, 0.2),
  };

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const marginX = 46;
  const contentWidth = pageWidth - marginX * 2;
  const topY = pageHeight - 46;
  const invoiceNumber = buildSubscriptionInvoiceNumber({
    invoice,
    invoiceId,
    cycleMonth: invoice?.cycleMonth,
  });
  const cycleLabel = formatSubscriptionCycleLabel(invoice?.cycleMonth) || "Current billing cycle";
  const planLabel = buildSubscriptionPlanLabel(subscription, invoice);
  const invoiceFinancials = resolveSubscriptionInvoiceFinancialSnapshot(invoice);
  const invoiceType = normalizeSubscriptionInvoiceType(invoiceFinancials.invoiceType);
  const baseAmount = Number(invoiceFinancials.baseAmount || 0);
  const adjustmentsTotal = Number(invoiceFinancials.adjustmentsTotal || 0);
  const invoiceAmount = Number(invoiceFinancials.amount || 0);
  const adjustmentRows = invoiceFinancials.adjustments;
  const schedule = invoice?.deliverySchedule || {};
  const totalDeliveries = Number(schedule?.totalDeliveries || 0);
  const includedDeliveries = Number(
    schedule?.includedDeliveries ||
      (Array.isArray(schedule?.includedDeliveryDates) ? schedule.includedDeliveryDates.length : 0),
  );
  const perDeliveryAmount = Number(
    resolveSubscriptionRecurringAmount(subscription) ||
      invoice?.perDeliveryAmount ||
      invoice?.monthlyAmount ||
      0,
  );
  const cycleAmount = roundMoney(
    Number(invoice?.cycleAmount || perDeliveryAmount * (totalDeliveries || includedDeliveries || 0)),
  );
  const issuedAt =
    coerceTimestampToDate(invoice?.updatedAt) ||
    coerceTimestampToDate(invoice?.createdAt) ||
    new Date();
  const dueAt = coerceTimestampToDate(invoice?.payLink?.expiresAt);
  const statusLabel = formatSubscriptionInvoiceStatusLabel(invoice?.status);
  const customerName = trimToLength(
    invoice?.customer?.fullName || subscription?.customer?.fullName || "Bethany Blooms Customer",
    180,
  );
  const customerEmail = trimToLength(
    invoice?.customer?.email || subscription?.customer?.email || "",
    180,
  );
  const customerPhone = trimToLength(
    invoice?.customer?.phone || subscription?.customer?.phone || "",
    80,
  );
  const addressLines = formatSubscriptionAddressLines(
    invoice?.deliveryAddress || subscription?.address || null,
  );
  const slotLabel = formatMondaySlotList(schedule?.slots || []);
  const includedDatesLabel = formatDeliveryDateListForEmail(
    schedule?.includedDeliveryDates || schedule?.cycleDeliveryDates || [],
  );
  const prorationRatio = Number(invoice?.prorationRatio || invoice?.proration?.ratio || 0);
  const prorationRatioLabel =
    Number.isFinite(prorationRatio) && prorationRatio > 0
      ? `${(prorationRatio * 100).toFixed(2)}%`
      : "";
  const billingNote = invoiceType === SUBSCRIPTION_INVOICE_TYPES.TOPUP
    ? `Top-up invoice for ${cycleLabel}.`
    : invoice?.isProrated
    ? `Prorated for ${includedDeliveries}/${totalDeliveries || includedDeliveries} deliveries (${prorationRatioLabel || "pro rata"}).`
    : `Full-cycle invoice for ${cycleLabel}.`;

  let headerBottomY = topY - 24;
  if (logoImage) {
    const logoWidthMax = 190;
    const logoHeightMax = 68;
    const logoScale = Math.min(
      logoWidthMax / logoImage.width,
      logoHeightMax / logoImage.height,
      1,
    );
    const logoWidth = logoImage.width * logoScale;
    const logoHeight = logoImage.height * logoScale;
    const logoY = topY - logoHeight;
    page.drawImage(logoImage, {
      x: marginX,
      y: logoY,
      width: logoWidth,
      height: logoHeight,
    });
    headerBottomY = Math.min(headerBottomY, logoY - 10);
  } else {
    page.drawText("Bethany Blooms", {
      x: marginX,
      y: topY - 18,
      size: 15,
      font: fontBold,
      color: palette.heading,
    });
  }

  page.drawText("Subscription Invoice", {
    x: pageWidth - marginX - 198,
    y: topY - 18,
    size: 19,
    font: fontBold,
    color: palette.heading,
  });
  page.drawText(invoiceNumber, {
    x: pageWidth - marginX - 198,
    y: topY - 36,
    size: 10.8,
    font: fontRegular,
    color: palette.muted,
  });

  page.drawLine({
    start: { x: marginX, y: headerBottomY },
    end: { x: pageWidth - marginX, y: headerBottomY },
    thickness: 1,
    color: palette.line,
  });

  const metaRows = [
    ["Invoice #", invoiceNumber],
    ["Type", formatSubscriptionInvoiceTypeLabel(invoiceType)],
    ["Cycle", cycleLabel],
    ["Status", statusLabel],
    ["Issued", formatSubscriptionInvoiceDate(issuedAt)],
    ["Due", dueAt ? formatSubscriptionInvoiceDate(dueAt) : "On receipt"],
  ];

  let leftY = headerBottomY - 20;
  page.drawText("From", {
    x: marginX,
    y: leftY,
    size: 10.6,
    font: fontBold,
    color: palette.heading,
  });
  leftY -= 16;
  const companyLines = [
    "Bethany Blooms",
    COMPANY_PHONE_LOCAL,
    getCanonicalSiteUrl().replace(/^https?:\/\//, ""),
  ];
  companyLines.forEach((line) => {
    leftY = drawWrappedPdfText({
      page,
      text: line,
      x: marginX,
      y: leftY,
      maxWidth: contentWidth * 0.46,
      font: fontRegular,
      fontSize: 10.4,
      lineHeight: 13.4,
      color: palette.text,
    }) - 2;
  });

  let rightY = headerBottomY - 20;
  const rightX = marginX + contentWidth * 0.53;
  metaRows.forEach(([label, value]) => {
    page.drawText(`${label}:`, {
      x: rightX,
      y: rightY,
      size: 10,
      font: fontBold,
      color: palette.muted,
    });
    rightY = drawWrappedPdfText({
      page,
      text: (value || "N/A").toString(),
      x: rightX + 74,
      y: rightY,
      maxWidth: contentWidth * 0.47 - 74,
      font: fontRegular,
      fontSize: 10,
      lineHeight: 12.5,
      color: palette.text,
    }) - 3;
  });

  let cursorY = Math.min(leftY, rightY) - 8;
  page.drawLine({
    start: { x: marginX, y: cursorY },
    end: { x: pageWidth - marginX, y: cursorY },
    thickness: 1,
    color: palette.line,
  });
  cursorY -= 18;

  page.drawText("Bill to", {
    x: marginX,
    y: cursorY,
    size: 10.8,
    font: fontBold,
    color: palette.heading,
  });
  let billY = cursorY - 16;
  const customerLines = [customerName, customerEmail, customerPhone].filter(Boolean);
  customerLines.forEach((line) => {
    billY = drawWrappedPdfText({
      page,
      text: line,
      x: marginX,
      y: billY,
      maxWidth: contentWidth * 0.47,
      font: fontRegular,
      fontSize: 10.5,
      lineHeight: 13.5,
      color: palette.text,
    }) - 4;
  });
  if (!customerLines.length) {
    page.drawText("No customer details captured.", {
      x: marginX,
      y: billY,
      size: 10.5,
      font: fontRegular,
      color: palette.muted,
    });
    billY -= 17;
  }

  const addressX = marginX + contentWidth * 0.53;
  let addressY = cursorY;
  page.drawText("Delivery address", {
    x: addressX,
    y: addressY,
    size: 10.8,
    font: fontBold,
    color: palette.heading,
  });
  addressY -= 18;
  if (addressLines.length) {
    addressLines.forEach((line) => {
      addressY = drawWrappedPdfText({
        page,
        text: line,
        x: addressX,
        y: addressY,
        maxWidth: contentWidth * 0.47,
        font: fontRegular,
        fontSize: 10.5,
        lineHeight: 13.5,
        color: palette.text,
      }) - 4;
    });
  } else {
    page.drawText("No delivery address on file.", {
      x: addressX,
      y: addressY,
      size: 10.5,
      font: fontRegular,
      color: palette.muted,
    });
    addressY -= 17;
  }

  const detailSectionY = Math.min(billY, addressY) - 10;
  page.drawLine({
    start: { x: marginX, y: detailSectionY },
    end: { x: pageWidth - marginX, y: detailSectionY },
    thickness: 1,
    color: palette.line,
  });

  let tableY = detailSectionY - 20;
  page.drawText("Line items", {
    x: marginX,
    y: tableY,
    size: 10.8,
    font: fontBold,
    color: palette.heading,
  });
  tableY -= 10;

  const descColX = marginX;
  const qtyColX = marginX + contentWidth * 0.64;
  const unitColX = marginX + contentWidth * 0.76;
  const amountColX = marginX + contentWidth * 0.88;
  const descColWidth = qtyColX - descColX - 10;
  const tableHeadersY = tableY - 12;

  page.drawLine({
    start: { x: marginX, y: tableY },
    end: { x: pageWidth - marginX, y: tableY },
    thickness: 1,
    color: palette.line,
  });
  page.drawText("Description", {
    x: descColX,
    y: tableHeadersY,
    size: 9.8,
    font: fontBold,
    color: palette.muted,
  });
  page.drawText("Qty", {
    x: qtyColX,
    y: tableHeadersY,
    size: 9.8,
    font: fontBold,
    color: palette.muted,
  });
  page.drawText("Unit", {
    x: unitColX,
    y: tableHeadersY,
    size: 9.8,
    font: fontBold,
    color: palette.muted,
  });
  page.drawText("Amount", {
    x: amountColX,
    y: tableHeadersY,
    size: 9.8,
    font: fontBold,
    color: palette.muted,
  });
  let rowTopY = tableHeadersY - 8;
  page.drawLine({
    start: { x: marginX, y: rowTopY },
    end: { x: pageWidth - marginX, y: rowTopY },
    thickness: 1,
    color: palette.line,
  });

  const lineItems = [];
  const baseLineDescription = invoiceType === SUBSCRIPTION_INVOICE_TYPES.TOPUP
    ? `Top-up for ${cycleLabel}`
    : `${planLabel} - ${cycleLabel}`;
  const baseLineQty = invoiceType === SUBSCRIPTION_INVOICE_TYPES.TOPUP
    ? 1
    : Math.max(includedDeliveries || 0, 1);
  const baseLineUnit = invoiceType === SUBSCRIPTION_INVOICE_TYPES.TOPUP
    ? baseAmount
    : perDeliveryAmount;
  if (baseAmount > 0 || !adjustmentRows.length) {
    lineItems.push({
      description: baseLineDescription,
      quantity: baseLineQty,
      unitPrice: baseLineUnit,
      lineTotal: baseAmount,
    });
  }
  adjustmentRows.forEach((adjustment) => {
    lineItems.push({
      description: formatSubscriptionAdjustmentLineLabel(adjustment),
      quantity: 1,
      unitPrice: Number(adjustment?.amount || 0),
      lineTotal: Number(adjustment?.amount || 0),
    });
  });

  lineItems.forEach((entry, index) => {
    const descriptionLines = splitTextToPdfLines(
      entry.description || "Invoice item",
      fontRegular,
      10.2,
      descColWidth,
    );
    const rowHeight = Math.max(24, descriptionLines.length * 12 + 8);
    let lineY = rowTopY - 14;
    descriptionLines.forEach((line) => {
      page.drawText(line, {
        x: descColX,
        y: lineY,
        size: 10.2,
        font: fontRegular,
        color: palette.text,
      });
      lineY -= 12;
    });
    page.drawText(String(Math.max(Number(entry.quantity || 0), 1)), {
      x: qtyColX,
      y: rowTopY - 14,
      size: 10.2,
      font: fontRegular,
      color: palette.text,
    });
    page.drawText(formatCurrency(Number(entry.unitPrice || 0)), {
      x: unitColX,
      y: rowTopY - 14,
      size: 10.2,
      font: fontRegular,
      color: palette.text,
    });
    page.drawText(formatCurrency(Number(entry.lineTotal || 0)), {
      x: amountColX,
      y: rowTopY - 14,
      size: 10.2,
      font: index === lineItems.length - 1 ? fontBold : fontRegular,
      color: palette.heading,
    });
    rowTopY -= rowHeight;
    page.drawLine({
      start: { x: marginX, y: rowTopY },
      end: { x: pageWidth - marginX, y: rowTopY },
      thickness: 1,
      color: palette.line,
    });
  });

  let infoY = rowTopY - 14;
  if (slotLabel) {
    infoY = drawWrappedPdfText({
      page,
      text: `Delivery slots: ${slotLabel}`,
      x: descColX,
      y: infoY,
      maxWidth: contentWidth * 0.56,
      font: fontRegular,
      fontSize: 9.8,
      lineHeight: 12.2,
      color: palette.muted,
    }) - 3;
  }
  if (includedDatesLabel) {
    infoY = drawWrappedPdfText({
      page,
      text: `Deliveries in invoice: ${includedDatesLabel}`,
      x: descColX,
      y: infoY,
      maxWidth: contentWidth * 0.56,
      font: fontRegular,
      fontSize: 9.8,
      lineHeight: 12.2,
      color: palette.muted,
    }) - 3;
  }
  infoY = drawWrappedPdfText({
    page,
    text: billingNote,
    x: descColX,
    y: infoY,
    maxWidth: contentWidth * 0.56,
    font: fontRegular,
    fontSize: 9.8,
    lineHeight: 12.2,
    color: palette.muted,
  }) - 6;

  let totalsY = infoY - 8;
  const totalsRows = [
    ["Price per delivery", formatCurrency(perDeliveryAmount)],
    ["Base amount", formatCurrency(baseAmount)],
    ["Adjustments", formatCurrency(adjustmentsTotal)],
    ["Full cycle total", formatCurrency(cycleAmount)],
    ["Amount due", formatCurrency(invoiceAmount)],
  ];
  totalsRows.forEach(([label, value], index) => {
    page.drawText(label, {
      x: marginX + contentWidth * 0.6,
      y: totalsY,
      size: index === totalsRows.length - 1 ? 11.5 : 10.8,
      font: index === totalsRows.length - 1 ? fontBold : fontRegular,
      color: palette.text,
    });
    const textWidth = (index === totalsRows.length - 1 ? fontBold : fontRegular).widthOfTextAtSize(
      value,
      index === totalsRows.length - 1 ? 11.5 : 10.8,
    );
    page.drawText(value, {
      x: marginX + contentWidth - textWidth,
      y: totalsY,
      size: index === totalsRows.length - 1 ? 11.5 : 10.8,
      font: index === totalsRows.length - 1 ? fontBold : fontRegular,
      color: palette.heading,
    });
    totalsY -= 24;
  });

  const footerNote = "Thank you for supporting Bethany Blooms. Payments are manual via PayFast.";
  drawWrappedPdfText({
    page,
    text: footerNote,
    x: marginX,
    y: 60,
    maxWidth: contentWidth,
    font: fontRegular,
    fontSize: 9.2,
    lineHeight: 12,
    color: palette.muted,
  });
  page.drawText(
    `${COMPANY_PHONE_LOCAL}  |  ${getCanonicalSiteUrl().replace(/^https?:\/\//, "")}`,
    {
      x: marginX,
      y: 42,
      size: 9,
      font: fontRegular,
      color: palette.muted,
    },
  );

  return Buffer.from(await pdf.save());
}

async function generateSubscriptionInvoiceDocument({
  subscriptionId = "",
  invoiceId = "",
  subscription = {},
  invoice = {},
} = {}) {
  const normalizedSubscriptionId = (subscriptionId || "").toString().trim();
  const normalizedInvoiceId = (invoiceId || "").toString().trim();
  if (!normalizedSubscriptionId || !normalizedInvoiceId) {
    throw new Error("Subscription invoice reference is required.");
  }

  const invoiceNumber = buildSubscriptionInvoiceNumber({
    invoice,
    invoiceId: normalizedInvoiceId,
    cycleMonth: invoice?.cycleMonth,
  });
  const fileName = buildSubscriptionInvoicePdfFileName(invoiceNumber);
  const storagePath = buildSubscriptionInvoicePdfStoragePath(
    normalizedSubscriptionId,
    normalizedInvoiceId,
  );
  const pdfBytes = await createSubscriptionInvoicePdfBytes({
    subscriptionId: normalizedSubscriptionId,
    invoiceId: normalizedInvoiceId,
    subscription,
    invoice,
  });
  if (!pdfBytes || !pdfBytes.length) {
    throw new Error("Unable to generate the invoice document.");
  }

  const bucket = admin.storage().bucket();
  const downloadToken = crypto.randomBytes(24).toString("hex");
  await bucket.file(storagePath).save(pdfBytes, {
    contentType: SUBSCRIPTION_INVOICE_PDF_CONTENT_TYPE,
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0, no-store",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  const downloadUrl = buildStorageMediaDownloadUrl({
    bucketName: bucket.name,
    storagePath,
    token: downloadToken,
  });
  const generatedAt = new Date();

  return {
    document: {
      invoiceNumber: normalizeInvoiceSequenceNumber(
        invoice?.invoiceNumber || invoice?.document?.invoiceNumber,
      ),
      invoiceNumberLabel: invoiceNumber,
      fileName,
      storagePath,
      contentType: SUBSCRIPTION_INVOICE_PDF_CONTENT_TYPE,
      sizeBytes: pdfBytes.length,
      downloadUrl,
      generatedAt: admin.firestore.Timestamp.fromDate(generatedAt),
    },
    pdfBytes,
  };
}

function buildOrderInvoiceLineItems(order = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.map((item = {}) => {
    const quantityValue = Number(item?.quantity ?? 1);
    const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1;
    const unitPriceValue = Number(item?.price ?? 0);
    const unitPrice = Number.isFinite(unitPriceValue) ? unitPriceValue : 0;
    const lineTotal = Number((unitPrice * quantity).toFixed(2));
    const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const detailParts = [];
    if (metadata.variantLabel) {
      detailParts.push(`Variant: ${trimToLength(metadata.variantLabel, 140)}`);
    }
    if (metadata.type === "workshop") {
      const workshopSession = metadata.sessionDayLabel || metadata.sessionLabel || metadata.sessionTimeRange || "";
      if (workshopSession) {
        detailParts.push(`Workshop: ${trimToLength(workshopSession, 180)}`);
      }
    }
    if (metadata.type === "cut-flower" && metadata.optionLabel) {
      detailParts.push(`Option: ${trimToLength(metadata.optionLabel, 180)}`);
    }
    const preorderLabel = formatPreorderSendMonth(
      metadata.preorderSendMonth || metadata.preorder_send_month || "",
    );
    if (preorderLabel) {
      detailParts.push(`Pre-order: ${preorderLabel}`);
    }
    const description = [
      trimToLength(item?.name || "Order item", 180),
      detailParts.length ? detailParts.join(" - ") : "",
    ]
      .filter(Boolean)
      .join(" | ");
    return {
      description,
      quantity,
      unitPrice: Number(unitPrice.toFixed(2)),
      lineTotal,
    };
  });
}

async function createOrderInvoicePdfBytes({
  orderId = "",
  order = {},
} = {}) {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await embedBethanyBloomsLogoPdfImage(pdf);

  const palette = {
    heading: rgb(0.17, 0.28, 0.24),
    text: rgb(0.2, 0.22, 0.2),
    muted: rgb(0.36, 0.38, 0.36),
    line: rgb(0.77, 0.79, 0.73),
  };

  const pageSize = [595.28, 841.89];
  const marginX = 46;
  const contentWidth = pageSize[0] - marginX * 2;
  const lineItems = buildOrderInvoiceLineItems(order);
  const computedSubtotal = lineItems.reduce((sum, entry) => sum + Number(entry.lineTotal || 0), 0);
  const subtotalValue = Number(order?.subtotal);
  const subtotal = Number.isFinite(subtotalValue) ? subtotalValue : computedSubtotal;
  const shippingRaw = Number(order?.shippingCost ?? order?.shipping?.courierPrice ?? 0);
  const shippingCost = Number.isFinite(shippingRaw) ? shippingRaw : 0;
  const totalRaw = Number(order?.totalPrice);
  const total = Number.isFinite(totalRaw) ? totalRaw : subtotal + shippingCost;
  const invoiceNumber = buildOrderInvoiceNumber({ order, orderId });
  const issuedAt =
    coerceTimestampToDate(order?.updatedAt) ||
    coerceTimestampToDate(order?.createdAt) ||
    new Date();
  const orderLabel = Number.isFinite(Number(order?.orderNumber))
    ? `Order #${Number(order.orderNumber)}`
    : `Order ${sanitizeStoragePathSegment(orderId, "order")}`;
  const paymentMethod = normalizePaymentMethod(order?.paymentMethod || "payfast");
  const paymentStatus = (order?.paymentStatus || "pending").toString().trim() || "pending";
  const customerLines = [
    trimToLength(order?.customer?.fullName || "Bethany Blooms Customer", 180),
    trimToLength(order?.customer?.email || "", 180),
    trimToLength(order?.customer?.phone || "", 80),
  ].filter(Boolean);
  const addressLines = formatOrderAddressLines(order);

  const columns = {
    descriptionX: marginX,
    quantityX: marginX + contentWidth * 0.65,
    unitX: marginX + contentWidth * 0.76,
    amountX: marginX + contentWidth * 0.88,
  };
  const descriptionWidth = columns.quantityX - columns.descriptionX - 10;

  let page = null;
  let cursorY = 0;

  const drawTableHeader = () => {
    page.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: pageSize[0] - marginX, y: cursorY },
      thickness: 1,
      color: palette.line,
    });
    const headingY = cursorY - 12;
    page.drawText("Description", {
      x: columns.descriptionX,
      y: headingY,
      size: 9.6,
      font: fontBold,
      color: palette.muted,
    });
    page.drawText("Qty", {
      x: columns.quantityX,
      y: headingY,
      size: 9.6,
      font: fontBold,
      color: palette.muted,
    });
    page.drawText("Unit", {
      x: columns.unitX,
      y: headingY,
      size: 9.6,
      font: fontBold,
      color: palette.muted,
    });
    page.drawText("Amount", {
      x: columns.amountX,
      y: headingY,
      size: 9.6,
      font: fontBold,
      color: palette.muted,
    });
    cursorY = headingY - 8;
    page.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: pageSize[0] - marginX, y: cursorY },
      thickness: 1,
      color: palette.line,
    });
  };

  const startPage = ({ continuation = false } = {}) => {
    page = pdf.addPage(pageSize);
    const topY = page.getHeight() - 46;
    let headerBottomY = topY - 24;

    if (logoImage) {
      const logoWidthMax = 190;
      const logoHeightMax = 68;
      const logoScale = Math.min(
        logoWidthMax / logoImage.width,
        logoHeightMax / logoImage.height,
        1,
      );
      const logoWidth = logoImage.width * logoScale;
      const logoHeight = logoImage.height * logoScale;
      const logoY = topY - logoHeight;
      page.drawImage(logoImage, {
        x: marginX,
        y: logoY,
        width: logoWidth,
        height: logoHeight,
      });
      headerBottomY = Math.min(headerBottomY, logoY - 10);
    } else {
      page.drawText("Bethany Blooms", {
        x: marginX,
        y: topY - 18,
        size: 15,
        font: fontBold,
        color: palette.heading,
      });
    }

    page.drawText(continuation ? "Order Invoice (continued)" : "Order Invoice", {
      x: pageSize[0] - marginX - 206,
      y: topY - 18,
      size: 19,
      font: fontBold,
      color: palette.heading,
    });
    page.drawText(invoiceNumber, {
      x: pageSize[0] - marginX - 206,
      y: topY - 36,
      size: 10.6,
      font: fontRegular,
      color: palette.muted,
    });

    page.drawLine({
      start: { x: marginX, y: headerBottomY },
      end: { x: pageSize[0] - marginX, y: headerBottomY },
      thickness: 1,
      color: palette.line,
    });

    let leftY = headerBottomY - 20;
    page.drawText("From", {
      x: marginX,
      y: leftY,
      size: 10.6,
      font: fontBold,
      color: palette.heading,
    });
    leftY -= 16;
    const companyLines = [
      "Bethany Blooms",
      COMPANY_PHONE_LOCAL,
      getCanonicalSiteUrl().replace(/^https?:\/\//, ""),
    ];
    companyLines.forEach((line) => {
      leftY = drawWrappedPdfText({
        page,
        text: line,
        x: marginX,
        y: leftY,
        maxWidth: contentWidth * 0.46,
        font: fontRegular,
        fontSize: 10.2,
        lineHeight: 13.2,
        color: palette.text,
      }) - 2;
    });

    let rightY = headerBottomY - 20;
    const rightX = marginX + contentWidth * 0.53;
    const rightRows = [
      ["Invoice #", invoiceNumber],
      ["Order #", orderLabel],
      ["Issued", formatSubscriptionInvoiceDate(issuedAt)],
      ["Payment", paymentMethod === "eft" ? "EFT" : "PayFast"],
      ["Status", paymentStatus.replace(/[_-]+/g, " ")],
    ];
    rightRows.forEach(([label, value]) => {
      page.drawText(`${label}:`, {
        x: rightX,
        y: rightY,
        size: 10,
        font: fontBold,
        color: palette.muted,
      });
      rightY = drawWrappedPdfText({
        page,
        text: (value || "N/A").toString(),
        x: rightX + 74,
        y: rightY,
        maxWidth: contentWidth * 0.47 - 74,
        font: fontRegular,
        fontSize: 10,
        lineHeight: 12.5,
        color: palette.text,
      }) - 3;
    });

    cursorY = Math.min(leftY, rightY) - 8;
    page.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: pageSize[0] - marginX, y: cursorY },
      thickness: 1,
      color: palette.line,
    });

    if (!continuation) {
      cursorY -= 18;
      page.drawText("Bill to", {
        x: marginX,
        y: cursorY,
        size: 10.8,
        font: fontBold,
        color: palette.heading,
      });
      let billY = cursorY - 16;
      if (!customerLines.length) {
        page.drawText("No customer details captured.", {
          x: marginX,
          y: billY,
          size: 10.2,
          font: fontRegular,
          color: palette.muted,
        });
        billY -= 14;
      } else {
        customerLines.forEach((line) => {
          billY = drawWrappedPdfText({
            page,
            text: line,
            x: marginX,
            y: billY,
            maxWidth: contentWidth * 0.47,
            font: fontRegular,
            fontSize: 10.2,
            lineHeight: 13.2,
            color: palette.text,
          }) - 3;
        });
      }

      const deliveryX = marginX + contentWidth * 0.53;
      let deliveryY = cursorY;
      page.drawText("Delivery", {
        x: deliveryX,
        y: deliveryY,
        size: 10.8,
        font: fontBold,
        color: palette.heading,
      });
      deliveryY -= 16;
      if (!addressLines.length) {
        page.drawText("No delivery address captured.", {
          x: deliveryX,
          y: deliveryY,
          size: 10.2,
          font: fontRegular,
          color: palette.muted,
        });
        deliveryY -= 14;
      } else {
        addressLines.forEach((line) => {
          deliveryY = drawWrappedPdfText({
            page,
            text: line,
            x: deliveryX,
            y: deliveryY,
            maxWidth: contentWidth * 0.47,
            font: fontRegular,
            fontSize: 10.2,
            lineHeight: 13.2,
            color: palette.text,
          }) - 3;
        });
      }

      cursorY = Math.min(billY, deliveryY) - 8;
      page.drawLine({
        start: { x: marginX, y: cursorY },
        end: { x: pageSize[0] - marginX, y: cursorY },
        thickness: 1,
        color: palette.line,
      });
    }

    cursorY -= 18;
    drawTableHeader();
  };

  startPage();

  if (!lineItems.length) {
    page.drawText("No line items found for this order.", {
      x: columns.descriptionX,
      y: cursorY - 14,
      size: 10.2,
      font: fontRegular,
      color: palette.muted,
    });
    cursorY -= 28;
    page.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: pageSize[0] - marginX, y: cursorY },
      thickness: 1,
      color: palette.line,
    });
  } else {
    lineItems.forEach((entry) => {
      const descriptionLines = splitTextToPdfLines(
        entry.description || "Order item",
        fontRegular,
        10,
        descriptionWidth,
      );
      const rowHeight = Math.max(24, descriptionLines.length * 11.8 + 8);
      if (cursorY - rowHeight < 136) {
        startPage({ continuation: true });
      }

      let rowLineY = cursorY - 14;
      descriptionLines.forEach((line) => {
        page.drawText(line, {
          x: columns.descriptionX,
          y: rowLineY,
          size: 10,
          font: fontRegular,
          color: palette.text,
        });
        rowLineY -= 11.8;
      });

      page.drawText(String(entry.quantity), {
        x: columns.quantityX,
        y: cursorY - 14,
        size: 10,
        font: fontRegular,
        color: palette.text,
      });
      page.drawText(formatCurrency(entry.unitPrice), {
        x: columns.unitX,
        y: cursorY - 14,
        size: 10,
        font: fontRegular,
        color: palette.text,
      });
      page.drawText(formatCurrency(entry.lineTotal), {
        x: columns.amountX,
        y: cursorY - 14,
        size: 10,
        font: fontBold,
        color: palette.heading,
      });

      cursorY -= rowHeight;
      page.drawLine({
        start: { x: marginX, y: cursorY },
        end: { x: pageSize[0] - marginX, y: cursorY },
        thickness: 1,
        color: palette.line,
      });
      cursorY -= 3;
    });
  }

  if (cursorY < 160) {
    startPage({ continuation: true });
  }

  let totalsY = cursorY - 20;
  const totalsRows = [
    ["Subtotal", formatCurrency(subtotal)],
    ["Shipping", formatCurrency(shippingCost)],
    ["Amount due", formatCurrency(total)],
  ];
  totalsRows.forEach(([label, value], index) => {
    page.drawText(label, {
      x: marginX + contentWidth * 0.6,
      y: totalsY,
      size: index === totalsRows.length - 1 ? 11.4 : 10.8,
      font: index === totalsRows.length - 1 ? fontBold : fontRegular,
      color: palette.text,
    });
    const valueFont = index === totalsRows.length - 1 ? fontBold : fontRegular;
    const valueSize = index === totalsRows.length - 1 ? 11.4 : 10.8;
    const valueWidth = valueFont.widthOfTextAtSize(value, valueSize);
    page.drawText(value, {
      x: marginX + contentWidth - valueWidth,
      y: totalsY,
      size: valueSize,
      font: valueFont,
      color: palette.heading,
    });
    totalsY -= 24;
  });

  drawWrappedPdfText({
    page,
    text: "Please keep this invoice for your records.",
    x: marginX,
    y: 60,
    maxWidth: contentWidth,
    font: fontRegular,
    fontSize: 9.2,
    lineHeight: 12,
    color: palette.muted,
  });
  page.drawText(
    `${COMPANY_PHONE_LOCAL}  |  ${getCanonicalSiteUrl().replace(/^https?:\/\//, "")}`,
    {
      x: marginX,
      y: 42,
      size: 9,
      font: fontRegular,
      color: palette.muted,
    },
  );

  return Buffer.from(await pdf.save());
}

async function generateOrderInvoiceDocument({
  orderId = "",
  order = {},
} = {}) {
  const normalizedOrderId = (orderId || "").toString().trim();
  if (!normalizedOrderId) {
    throw new Error("Order reference is required.");
  }

  const invoiceNumber = buildOrderInvoiceNumber({
    order,
    orderId: normalizedOrderId,
  });
  const fileName = buildOrderInvoicePdfFileName(invoiceNumber);
  const storagePath = buildOrderInvoicePdfStoragePath(normalizedOrderId);
  const pdfBytes = await createOrderInvoicePdfBytes({
    orderId: normalizedOrderId,
    order,
  });
  if (!pdfBytes || !pdfBytes.length) {
    throw new Error("Unable to generate the order invoice document.");
  }

  const bucket = admin.storage().bucket();
  const downloadToken = crypto.randomBytes(24).toString("hex");
  await bucket.file(storagePath).save(pdfBytes, {
    contentType: ORDER_INVOICE_PDF_CONTENT_TYPE,
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0, no-store",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  const downloadUrl = buildStorageMediaDownloadUrl({
    bucketName: bucket.name,
    storagePath,
    token: downloadToken,
  });
  const generatedAt = new Date();

  return {
    document: {
      invoiceNumber: normalizeInvoiceSequenceNumber(
        order?.invoiceNumber || order?.invoice?.invoiceNumber || order?.orderNumber,
      ),
      invoiceNumberLabel: invoiceNumber,
      fileName,
      storagePath,
      contentType: ORDER_INVOICE_PDF_CONTENT_TYPE,
      sizeBytes: pdfBytes.length,
      downloadUrl,
      generatedAt: admin.firestore.Timestamp.fromDate(generatedAt),
    },
    pdfBytes,
  };
}

async function ensureOrderInvoiceDocument({
  orderRef,
  orderId = "",
  orderData = {},
} = {}) {
  const normalizedOrderId = (orderId || "").toString().trim();
  if (!orderRef || !normalizedOrderId) {
    return {
      order: orderData,
      document: null,
      created: false,
    };
  }

  const baseOrder = orderData && typeof orderData === "object" ? orderData : {};
  const existingDocument =
    baseOrder?.invoice && typeof baseOrder.invoice === "object" ? baseOrder.invoice : null;
  const existingDownloadUrl = (existingDocument?.downloadUrl || "").toString().trim();
  const existingStoragePath = (existingDocument?.storagePath || "").toString().trim();
  let invoiceNumber = normalizeInvoiceSequenceNumber(
    baseOrder?.invoiceNumber || existingDocument?.invoiceNumber || baseOrder?.orderNumber,
  );

  if (existingDownloadUrl && existingStoragePath && invoiceNumber) {
    return {
      order: {
        ...baseOrder,
        invoiceNumber,
      },
      document: existingDocument,
      created: false,
    };
  }

  if (!invoiceNumber) {
    invoiceNumber = await getNextInvoiceNumber();
  }

  const nextOrderPayload = {
    ...baseOrder,
    invoiceNumber,
  };
  const generated = await generateOrderInvoiceDocument({
    orderId: normalizedOrderId,
    order: nextOrderPayload,
  });

  await orderRef.set(
    {
      invoiceNumber,
      invoice: generated.document,
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    order: {
      ...nextOrderPayload,
      invoice: generated.document,
    },
    document: generated.document,
    created: true,
  };
}

function formatSubscriptionCycleLabel(cycleMonth = "") {
  const normalized = normalizePreorderSendMonth(cycleMonth);
  if (!normalized) return "";
  return formatPreorderSendMonth(normalized);
}

function splitContactName(fullName = "") {
  const safeFullName = (fullName || "").toString().trim();
  const parts = safeFullName.split(/\s+/).filter(Boolean);
  return {
    firstName: trimToLength(parts[0] || safeFullName || "Customer", 100),
    lastName: trimToLength(parts.slice(1).join(" "), 100),
  };
}

function toSortTimestamp(value) {
  return coerceTimestampToDate(value)?.getTime() || 0;
}

function sortSubscriptionInvoicesNewestFirst(left = {}, right = {}) {
  const leftValue = Math.max(toSortTimestamp(left.updatedAt), toSortTimestamp(left.createdAt));
  const rightValue = Math.max(toSortTimestamp(right.updatedAt), toSortTimestamp(right.createdAt));
  return rightValue - leftValue;
}

function normalizeGiftCardExpiryDays(value, fallback = GIFT_CARD_DEFAULT_EXPIRY_DAYS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(
    GIFT_CARD_MIN_EXPIRY_DAYS,
    Math.min(GIFT_CARD_MAX_EXPIRY_DAYS, Math.floor(parsed)),
  );
}

function isGiftCardOrderItem(item = {}) {
  if (!item || item.metadata?.type !== "product") return false;
  return Boolean(item.metadata?.giftCard?.isGiftCard || item.metadata?.isGiftCard);
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

function buildGiftCardInvitationLine({ recipientDisplay = "Gift recipient" } = {}) {
  const recipient = (recipientDisplay || "Gift recipient").toString().trim() || "Gift recipient";
  return `For ${recipient} to come and join us at our farm.`;
}

function normalizeCutFlowerClassGiftCardOption(option = {}, { fallbackId = "" } = {}) {
  const label = (option?.label || option?.name || option?.value || "").toString().trim();
  const amount = normalizeGiftCardAmount(option?.price ?? option?.amount);
  if (!label || !Number.isFinite(amount)) return null;
  const id = (
    option?.value ||
    option?.id ||
    option?.label ||
    fallbackId ||
    label.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  )
    .toString()
    .trim();
  if (!id) return null;
  return { id, label, amount };
}

async function getCutFlowerGiftCardOptions() {
  const snapshot = await db.collection("cutFlowerClasses").get();
  const unique = new Map();

  snapshot.forEach((docSnap) => {
    const classData = docSnap.data() || {};
    const status = (classData.status ?? "live").toString().trim().toLowerCase();
    if (status && status !== "live") return;
    const classOptions = Array.isArray(classData.options) ? classData.options : [];
    classOptions.forEach((option, index) => {
      const normalized = normalizeCutFlowerClassGiftCardOption(option, {
        fallbackId: `${docSnap.id}-option-${index + 1}`,
      });
      if (!normalized) return;
      unique.set(normalized.id, normalized);
    });
  });

  return Array.from(unique.values()).sort((left, right) => {
    if (left.amount !== right.amount) return left.amount - right.amount;
    return left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
    });
  });
}

function buildGiftCardDocumentId(orderId = "", lineIndex = 0, unitIndex = 0) {
  const hash = crypto
    .createHash("sha1")
    .update(`${orderId}:${lineIndex}:${unitIndex}`)
    .digest("hex");
  return `gc-${hash.slice(0, 24)}`;
}

function buildGiftCardCode({ orderNumber = null, giftCardId = "", lineIndex = 0, unitIndex = 0 } = {}) {
  const orderPart = Number.isFinite(Number(orderNumber))
    ? `${Math.floor(Number(orderNumber))}`.slice(-4).padStart(4, "0")
    : giftCardId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase().padEnd(4, "X");
  const suffix = giftCardId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase().padStart(6, "0");
  const indexPart = `${lineIndex + 1}${unitIndex + 1}`;
  return `BBGC-${orderPart}-${suffix}-${indexPart}`;
}

function normalizeGiftCardLookupCode(value = "") {
  return value
    .toString()
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

function createGiftCardAccessToken(giftCardId = "") {
  const normalizedId = (giftCardId || "").toString().trim();
  const secret = getGiftCardTokenSecret();
  if (!normalizedId || !secret) return "";
  return crypto.createHmac("sha256", secret).update(normalizedId).digest("hex");
}

function verifyGiftCardAccessToken(giftCardId = "", token = "") {
  const normalizedToken = (token || "").toString().trim();
  if (!normalizedToken) return false;
  const expected = createGiftCardAccessToken(giftCardId);
  if (!expected || expected.length !== normalizedToken.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalizedToken));
  } catch {
    return false;
  }
}

function toIsoString(value) {
  const date = coerceTimestampToDate(value);
  return date ? date.toISOString() : null;
}

function readOptionalFileBuffer(filePath = "") {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function bufferToDataUri(buffer = null, mimeType = "image/png") {
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) return "";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function getGiftCardDesignAssets() {
  if (giftCardDesignAssetsCache) return giftCardDesignAssetsCache;
  const logoBuffer = readOptionalFileBuffer(GIFT_CARD_LOGO_FILE);
  const signatureBuffer = readOptionalFileBuffer(GIFT_CARD_SIGNATURE_FILE);
  giftCardDesignAssetsCache = {
    logoBuffer,
    signatureBuffer,
    logoDataUri: bufferToDataUri(logoBuffer),
    signatureDataUri: bufferToDataUri(signatureBuffer),
  };
  return giftCardDesignAssetsCache;
}

function formatGiftCardDate(value) {
  const date = coerceTimestampToDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function formatGiftCardCompactDate(value) {
  const date = coerceTimestampToDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function buildGiftCardSiteUrl(giftCardId = "", token = "") {
  const baseUrl = getCanonicalSiteUrl();
  const idPart = encodeURIComponent((giftCardId || "").toString().trim());
  const tokenPart = encodeURIComponent((token || "").toString().trim());
  return `${baseUrl}/gift-cards/${idPart}?token=${tokenPart}`;
}

function buildGiftCardAccessUrl(giftCardId = "", token = "") {
  const functionsBase = getFunctionsBaseUrl();
  const idPart = encodeURIComponent((giftCardId || "").toString().trim());
  const tokenPart = encodeURIComponent((token || "").toString().trim());
  return `${functionsBase}/viewGiftCardHttp?giftCardId=${idPart}&token=${tokenPart}`;
}

function buildGiftCardPrintViewUrl(giftCardId = "", token = "") {
  const base = buildGiftCardAccessUrl(giftCardId, token);
  return `${base}&print=1`;
}

function buildGiftCardDownloadUrl(giftCardId = "", token = "", { inline = false } = {}) {
  const functionsBase = getFunctionsBaseUrl();
  const idPart = encodeURIComponent((giftCardId || "").toString().trim());
  const tokenPart = encodeURIComponent((token || "").toString().trim());
  const inlinePart = inline ? "&inline=1" : "";
  return `${functionsBase}/downloadGiftCardPdfHttp?giftCardId=${idPart}&token=${tokenPart}${inlinePart}`;
}

function buildGiftCardViewerHtml(giftCard = {}) {
  const { logoDataUri, signatureDataUri } = getGiftCardDesignAssets();
  const selectedOptions = normalizeGiftCardSelectedOptions(giftCard.selectedOptions);
  const purchaserDisplay = (giftCard.purchaserName || "Bethany Blooms Customer").toString().trim();
  const recipientDisplay = (giftCard.recipientName || purchaserDisplay || "Gift recipient").toString().trim();
  const invitationLine = buildGiftCardInvitationLine({
    recipientDisplay,
    selectedOptions,
  });
  const paidDateLabel =
    formatGiftCardCompactDate(giftCard.issuedAt) ||
    formatGiftCardCompactDate(new Date().toISOString()) ||
    "N/A";
  const expiryLabel = formatGiftCardDate(giftCard.expiresAt) || "No expiry date set";
  const optionRows = selectedOptions.length
    ? selectedOptions
        .map((option, index) => {
          const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 1);
          const amount = Number(option?.amount || 0);
          const lineTotal = Number(option?.lineTotal ?? amount * quantity);
          const detail = quantity > 1
            ? `${quantity} x ${formatCurrency(amount)} (${formatCurrency(lineTotal)} total)`
            : formatCurrency(amount);
          return `
            <li class="option-row">
              <span class="option-index">${index + 1}.</span>
              <span class="option-label">${escapeHtml(option.label)}</span>
              <span class="option-detail">${escapeHtml(detail)}</span>
            </li>`;
        })
        .join("")
    : '<li class="option-row option-row--empty"><span class="option-label">No options recorded.</span></li>';
  const messageHtml = giftCard.message
    ? `<p class="message">"${escapeHtml(giftCard.message)}"</p>`
    : "";
  const termsText =
    (giftCard.terms || "").toString().trim() ||
    "Redeemable for Bethany Blooms products and services only, before expiry. Non-refundable and not exchangeable for cash.";
  const siteAccessUrl = (giftCard.siteAccessUrl || "").toString().trim();
  const actionLinks = [
    giftCard.downloadUrl
      ? `<a class="btn" href="${escapeHtml(giftCard.downloadUrl)}">Download PDF</a>`
      : "",
    '<a class="btn btn--alt" href="#" onclick="window.print();return false;">Print voucher</a>',
    siteAccessUrl
      ? `<a class="btn btn--ghost" href="${escapeHtml(siteAccessUrl)}">Open website page</a>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const logoHtml = logoDataUri
    ? `<img class="logo-art" src="${logoDataUri}" alt="Bethany Blooms Flower Farm logo"/>`
    : `<p class="logo-fallback">BETHANY BLOOMS FLOWER FARM</p>`;
  const signatureHtml = signatureDataUri
    ? `<img class="signature-art" src="${signatureDataUri}" alt="Bethany Blooms signature"/>`
    : `<div class="signature-fallback">Signature</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Gift Card ${escapeHtml(giftCard.code || "")}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", Times, serif;
        background: radial-gradient(1200px 500px at 50% -120px, #f5efdf 0%, #ece3cf 62%, #e8deca 100%);
        color: #2f5e44;
      }
      .shell {
        max-width: 1020px;
        margin: 24px auto 30px;
        padding: 0 16px;
      }
      .gift-card {
        position: relative;
        overflow: hidden;
        border-radius: 14px;
        background: linear-gradient(180deg, rgba(247, 239, 224, 0.98) 0%, rgba(239, 232, 215, 0.98) 100%);
        border: 1px solid rgba(47, 94, 68, 0.2);
        box-shadow: 0 24px 40px -32px rgba(31, 47, 37, 0.6);
        padding: 34px 42px 40px;
      }
      .gift-card::before {
        content: "";
        position: absolute;
        top: -170px;
        right: -130px;
        width: 390px;
        height: 390px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(225, 197, 167, 0.35) 0%, rgba(225, 197, 167, 0) 72%);
        pointer-events: none;
      }
      .gift-card::after {
        content: "";
        position: absolute;
        bottom: -190px;
        left: -120px;
        width: 410px;
        height: 410px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(167, 198, 175, 0.24) 0%, rgba(167, 198, 175, 0) 72%);
        pointer-events: none;
      }
      .logo-wrap {
        text-align: center;
        margin-bottom: 20px;
      }
      .logo-art {
        width: min(760px, 100%);
        max-height: 185px;
        object-fit: contain;
      }
      .logo-fallback {
        margin: 0;
        font-size: 48px;
        letter-spacing: 0.1em;
        line-height: 1.05;
      }
      .headline,
      .gift-title,
      .recipient-line,
      .location,
      .phone {
        text-align: center;
        margin: 0;
        text-transform: uppercase;
        color: #2f6a47;
      }
      .headline {
        font-size: clamp(28px, 4.2vw, 56px);
        letter-spacing: 0.14em;
      }
      .gift-title {
        margin-top: 18px;
        font-size: clamp(31px, 4.7vw, 64px);
        letter-spacing: 0.11em;
        text-decoration: underline;
        text-decoration-thickness: 2px;
        text-underline-offset: 10px;
      }
      .recipient-line {
        margin-top: 22px;
        font-size: clamp(27px, 3.8vw, 52px);
        line-height: 1.28;
        text-transform: none;
        letter-spacing: 0.08em;
      }
      .meta-line {
        text-align: center;
        margin: 14px 0 0;
        font-size: 18px;
        letter-spacing: 0.05em;
      }
      .message {
        margin: 10px auto 0;
        max-width: 760px;
        text-align: center;
        font-size: 24px;
        line-height: 1.35;
        color: rgba(47, 94, 68, 0.9);
      }
      .options {
        margin: 26px auto 0;
        max-width: 810px;
      }
      .option-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 8px;
      }
      .option-row {
        display: grid;
        grid-template-columns: 34px 1fr auto;
        gap: 8px;
        align-items: baseline;
        border-bottom: 1px dashed rgba(47, 94, 68, 0.22);
        padding-bottom: 8px;
      }
      .option-row--empty {
        grid-template-columns: 1fr;
        text-align: center;
      }
      .option-index,
      .option-label,
      .option-detail {
        font-size: 18px;
      }
      .option-detail {
        white-space: nowrap;
      }
      .option-index {
        font-weight: 700;
      }
      .bottom-block {
        margin-top: 30px;
        position: relative;
        min-height: 130px;
      }
      .location,
      .phone {
        letter-spacing: 0.12em;
      }
      .location {
        font-size: clamp(26px, 3.2vw, 46px);
        line-height: 1.15;
      }
      .phone {
        margin-top: 10px;
        font-size: clamp(36px, 4.2vw, 60px);
        line-height: 1.1;
      }
      .signature-box {
        position: absolute;
        right: 6px;
        bottom: -6px;
        text-align: right;
      }
      .signature-art {
        width: 155px;
        max-width: 36vw;
        height: auto;
        display: block;
        margin-left: auto;
      }
      .signature-fallback {
        font-size: 18px;
        font-style: italic;
      }
      .paid-line {
        margin-top: 4px;
        font: 700 15px/1.1 "Courier New", Courier, monospace;
        color: #2f5e44;
        letter-spacing: 0.12em;
      }
      .code-line,
      .expiry-line,
      .status-line {
        margin: 8px 0 0;
        text-align: center;
        font-size: 17px;
        letter-spacing: 0.04em;
      }
      .status-line {
        margin-top: 4px;
        text-transform: uppercase;
      }
      .actions {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        background: #2f6a47;
        color: #f8f2e5;
        border: 1px solid #2f6a47;
        border-radius: 999px;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .btn--alt {
        background: #274f3d;
        border-color: #274f3d;
      }
      .btn--ghost {
        background: transparent;
        color: #2f6a47;
      }
      .terms-card {
        margin-top: 16px;
        background: rgba(255, 255, 255, 0.72);
        border-radius: 12px;
        border: 1px solid rgba(47, 94, 68, 0.18);
        padding: 18px 20px;
      }
      .terms-card h3 {
        margin: 0 0 8px;
        text-transform: uppercase;
        letter-spacing: 0.11em;
        font-size: 16px;
      }
      .terms-card p {
        margin: 0;
        font-size: 14px;
        line-height: 1.55;
      }
      .note {
        margin-top: 8px;
        font-size: 12px;
        color: rgba(47, 94, 68, 0.8);
      }
      @media (max-width: 740px) {
        .gift-card {
          padding: 22px 18px 28px;
        }
        .option-row {
          grid-template-columns: 28px 1fr;
        }
        .option-detail {
          grid-column: 2;
          white-space: normal;
          font-size: 16px;
        }
        .signature-box {
          position: static;
          margin-top: 18px;
          text-align: center;
        }
        .signature-art {
          margin: 0 auto;
        }
        .paid-line {
          text-align: center;
        }
      }
      @media print {
        html,
        body {
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .shell {
          margin: 0 auto;
          padding: 0;
          max-width: 1020px;
        }
        .gift-card {
          border: 1px solid rgba(47, 94, 68, 0.2);
          border-radius: 14px;
          box-shadow: none;
          margin: 0;
          page-break-after: avoid;
        }
        .actions {
          display: none !important;
        }
        .terms-card {
          display: none !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <article class="gift-card">
        <div class="logo-wrap">${logoHtml}</div>
        <p class="headline">COME AND PICK YOUR OWN BLOOMS</p>
        <p class="gift-title">FLOWER FARM GIFT CARD</p>
        <p class="recipient-line">${escapeHtml(invitationLine)}</p>
        ${messageHtml}
        <div class="options">
          <ol class="option-list">${optionRows}</ol>
        </div>
        <div class="bottom-block">
          <p class="location">${escapeHtml(GIFT_CARD_LOCATION_LINE)}</p>
          <p class="phone">${escapeHtml(GIFT_CARD_CONTACT_LINE)}</p>
          <div class="signature-box">
            ${signatureHtml}
            <p class="paid-line">PAID: ${escapeHtml(paidDateLabel)}</p>
          </div>
        </div>
        <p class="code-line">Card code: ${escapeHtml(giftCard.code || "Gift Card")}</p>
        <p class="expiry-line">Valid until: ${escapeHtml(expiryLabel)}</p>
        <p class="status-line">Status: ${escapeHtml(giftCard.status || "active")}</p>
      </article>
      <div class="actions">
        ${actionLinks}
      </div>
      <section class="terms-card">
        <h3>Gift Card Terms</h3>
        <p>${escapeHtml(termsText).replace(/\n/g, "<br/>")}</p>
        <p class="note">If this page opened correctly, your gift card link is working.</p>
      </section>
    </div>
    <script>
      (function () {
        var params = new URLSearchParams(window.location.search || "");
        if (params.get("print") === "1") {
          window.addEventListener("load", function () {
            window.print();
          });
        }
      })();
    </script>
  </body>
</html>`;
}

function splitTextToPdfLines(text = "", font, fontSize, maxWidth) {
  if (!text) return [];
  const normalizedText = text.toString().replace(/\s+/g, " ").trim();
  if (!normalizedText) return [];
  const words = normalizedText.split(" ");
  const lines = [];
  let current = "";
  const splitOversizedWord = (word = "") => {
    if (!word) return [];
    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) return [word];
    const segments = [];
    let segment = "";
    for (const character of word) {
      const next = `${segment}${character}`;
      if (!segment || font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        segment = next;
      } else {
        segments.push(segment);
        segment = character;
      }
    }
    if (segment) segments.push(segment);
    return segments;
  };

  words.forEach((word) => {
    const parts = splitOversizedWord(word);
    if (!parts.length) return;
    parts.forEach((part) => {
      const next = current ? `${current} ${part}` : part;
      const nextWidth = font.widthOfTextAtSize(next, fontSize);
      if (nextWidth <= maxWidth || !current) {
        current = next;
      } else {
        lines.push(current);
        current = part;
      }
    });
  });
  if (current) lines.push(current);
  return lines;
}

function drawWrappedPdfText({
  page,
  text = "",
  x = 0,
  y = 0,
  maxWidth = 100,
  font,
  fontSize = 12,
  lineHeight = 15,
  color = rgb(0, 0, 0),
}) {
  const lines = splitTextToPdfLines(text, font, fontSize, maxWidth);
  let cursorY = y;
  lines.forEach((line) => {
    page.drawText(line, { x, y: cursorY, size: fontSize, font, color });
    cursorY -= lineHeight;
  });
  return cursorY;
}

function drawCenteredPdfText({
  page,
  text = "",
  y = 0,
  maxWidth = 100,
  font,
  fontSize = 12,
  lineHeight = 15,
  color = rgb(0, 0, 0),
}) {
  const lines = splitTextToPdfLines(text, font, fontSize, maxWidth);
  let cursorY = y;
  lines.forEach((line) => {
    const lineWidth = font.widthOfTextAtSize(line, fontSize);
    const x = Math.max(0, (page.getWidth() - lineWidth) / 2);
    page.drawText(line, {
      x,
      y: cursorY,
      size: fontSize,
      font,
      color,
    });
    cursorY -= lineHeight;
  });
  return cursorY;
}

function buildGiftCardPlanFromOrder(order = {}, orderId = "") {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const plans = [];
  orderItems.forEach((item, lineIndex) => {
    if (!isGiftCardOrderItem(item)) return;
    const quantity = parsePositiveInteger(item.quantity, 1);
    const giftCardMetadata =
      item.metadata?.giftCard && typeof item.metadata.giftCard === "object"
        ? item.metadata.giftCard
        : {};
    const selectedOptions = normalizeGiftCardSelectedOptions(giftCardMetadata.selectedOptions);
    if (!selectedOptions.length) return;

    const optionsTotal = selectedOptions.reduce((sum, option) => {
      const lineTotal = Number(option.lineTotal);
      if (Number.isFinite(lineTotal)) return sum + lineTotal;
      const amount = Number(option.amount);
      const quantity = normalizeGiftCardOptionQuantity(option.quantity, 1);
      return sum + (Number.isFinite(amount) ? amount * quantity : 0);
    }, 0);
    const giftCardValue = Number(optionsTotal.toFixed(2));

    if (!Number.isFinite(giftCardValue) || giftCardValue <= 0) return;

    const purchaserName = truncateText(
      giftCardMetadata.purchaserName || order.customer?.fullName || "Bethany Blooms Customer",
      GIFT_CARD_MAX_NAME_LENGTH,
    );
    const recipientName = truncateText(
      giftCardMetadata.recipientName || purchaserName || order.customer?.fullName || "Gift Recipient",
      GIFT_CARD_MAX_NAME_LENGTH,
    );
    const message = truncateText(giftCardMetadata.message || "", GIFT_CARD_MAX_MESSAGE_LENGTH);
    const expiryDays = normalizeGiftCardExpiryDays(
      giftCardMetadata.expiryDays,
      GIFT_CARD_DEFAULT_EXPIRY_DAYS,
    );
    const terms = truncateText(
      giftCardMetadata.terms ||
        "This gift card is redeemable at Bethany Blooms before its expiry date and is not exchangeable for cash.",
      GIFT_CARD_MAX_TERMS_LENGTH,
    );
    const productId = (
      item.metadata?.productId ||
      item.metadata?.productID ||
      item.metadata?.product ||
      ""
    )
      .toString()
      .trim() || null;
    const productTitle = truncateText(
      giftCardMetadata.productTitle || item.name || "Bethany Blooms Gift Card",
      160,
    );

    for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
      const giftCardId = buildGiftCardDocumentId(orderId, lineIndex, unitIndex);
      const code = buildGiftCardCode({
        orderNumber: order.orderNumber || null,
        giftCardId,
        lineIndex,
        unitIndex,
      });
      plans.push({
        giftCardId,
        lineIndex,
        unitIndex,
        code,
        value: Number(giftCardValue.toFixed(2)),
        purchaserName,
        recipientName,
        message,
        expiryDays,
        terms,
        selectedOptions,
        productId,
        productTitle,
      });
    }
  });
  return plans;
}

async function createGiftCardPdfBytes(giftCard = {}) {
  const pdf = await PDFDocument.create();
  const pageSize = [595.28, 841.89];
  const fontSans = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontSerif = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontSerifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const { logoBuffer, signatureBuffer } = getGiftCardDesignAssets();

  let logoImage = null;
  if (logoBuffer) {
    try {
      logoImage = await pdf.embedPng(logoBuffer);
    } catch {
      logoImage = null;
    }
  }

  let signatureImage = null;
  if (signatureBuffer) {
    try {
      signatureImage = await pdf.embedPng(signatureBuffer);
    } catch {
      signatureImage = null;
    }
  }

  const palette = {
    bg: rgb(0.95, 0.92, 0.85),
    card: rgb(0.97, 0.94, 0.88),
    cardBorder: rgb(0.68, 0.72, 0.62),
    text: rgb(0.18, 0.39, 0.29),
    darkText: rgb(0.15, 0.27, 0.2),
    accent: rgb(0.88, 0.79, 0.68),
    accentSoft: rgb(0.79, 0.87, 0.81),
  };

  const drawGiftCardPageFrame = (page, { decorative = true } = {}) => {
    const width = page.getWidth();
    const height = page.getHeight();
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: palette.bg,
    });
    if (decorative) {
      page.drawRectangle({
        x: -40,
        y: height - 225,
        width: width + 80,
        height: 230,
        color: palette.accentSoft,
        opacity: 0.18,
      });
      page.drawRectangle({
        x: -25,
        y: -15,
        width: width + 50,
        height: 220,
        color: palette.accent,
        opacity: 0.14,
      });
    }
    page.drawRectangle({
      x: 24,
      y: 28,
      width: width - 48,
      height: height - 56,
      color: palette.card,
      borderColor: palette.cardBorder,
      borderWidth: 1.2,
      opacity: 0.96,
    });
  };

  const selectedOptions = normalizeGiftCardSelectedOptions(giftCard.selectedOptions);
  const purchaserDisplay = (giftCard.purchaserName || "Bethany Blooms Customer").toString().trim();
  const recipientDisplay = (giftCard.recipientName || purchaserDisplay || "Gift recipient").toString().trim();
  const invitationLine = buildGiftCardInvitationLine({
    recipientDisplay,
    selectedOptions,
  });
  const paidDateLabel =
    formatGiftCardCompactDate(giftCard.issuedAt) ||
    formatGiftCardCompactDate(new Date().toISOString()) ||
    "N/A";
  const expiryLabel = formatGiftCardDate(giftCard.expiresAt) || "No expiry date set";

  const optionLines = selectedOptions.length
    ? selectedOptions.map((option) => {
        const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 1);
        const amount = Number(option?.amount || 0);
        const lineTotal = Number(option?.lineTotal ?? amount * quantity);
        if (quantity <= 1) return `${option.label} (${formatCurrency(amount)})`;
        return `${option.label} x${quantity} (${formatCurrency(amount)} each, ${formatCurrency(lineTotal)} total)`;
      })
    : ["No options recorded."];

  const frontPage = pdf.addPage(pageSize);
  drawGiftCardPageFrame(frontPage);
  const width = frontPage.getWidth();
  const height = frontPage.getHeight();

  if (logoImage) {
    const logoDims = logoImage.scaleToFit(width - 100, 205);
    frontPage.drawImage(logoImage, {
      x: (width - logoDims.width) / 2,
      y: height - 240,
      width: logoDims.width,
      height: logoDims.height,
      opacity: 0.98,
    });
  } else {
    drawCenteredPdfText({
      page: frontPage,
      text: "BETHANY BLOOMS FLOWER FARM",
      y: height - 126,
      maxWidth: width - 100,
      font: fontSerifBold,
      fontSize: 30,
      lineHeight: 36,
      color: palette.text,
    });
  }

  drawCenteredPdfText({
    page: frontPage,
    text: "COME AND PICK YOUR OWN BLOOMS",
    y: 546,
    maxWidth: width - 90,
    font: fontSerif,
    fontSize: 22,
    lineHeight: 28,
    color: palette.text,
  });

  const giftTitle = "FLOWER FARM GIFT CARD";
  const giftTitleSize = 29;
  const giftTitleWidth = fontSerifBold.widthOfTextAtSize(giftTitle, giftTitleSize);
  const giftTitleX = Math.max(0, (width - giftTitleWidth) / 2);
  const giftTitleY = 500;
  frontPage.drawText(giftTitle, {
    x: giftTitleX,
    y: giftTitleY,
    size: giftTitleSize,
    font: fontSerifBold,
    color: palette.text,
  });
  frontPage.drawLine({
    start: { x: giftTitleX, y: giftTitleY - 4 },
    end: { x: giftTitleX + giftTitleWidth, y: giftTitleY - 4 },
    thickness: 1.3,
    color: palette.text,
  });

  drawCenteredPdfText({
    page: frontPage,
    text: invitationLine,
    y: 444,
    maxWidth: width - 116,
    font: fontSerif,
    fontSize: 17,
    lineHeight: 23,
    color: palette.darkText,
  });

  if (giftCard.message) {
    const messageLines = splitTextToPdfLines(`"${giftCard.message}"`, fontSerif, 11.5, width - 140).slice(0, 3);
    let messageY = 364;
    messageLines.forEach((line) => {
      const lineWidth = fontSerif.widthOfTextAtSize(line, 11.5);
      const x = Math.max(0, (width - lineWidth) / 2);
      frontPage.drawText(line, {
        x,
        y: messageY,
        size: 11.5,
        font: fontSerif,
        color: rgb(0.24, 0.36, 0.28),
      });
      messageY -= 15;
    });
  }

  frontPage.drawText("Selected options", {
    x: 57,
    y: 333,
    size: 12,
    font: fontSansBold,
    color: palette.text,
  });
  const optionBoxX = 52;
  const optionBoxY = 235;
  const optionBoxWidth = width - 104;
  const optionBoxHeight = 92;
  frontPage.drawRectangle({
    x: optionBoxX,
    y: optionBoxY,
    width: optionBoxWidth,
    height: optionBoxHeight,
    borderColor: rgb(0.55, 0.65, 0.56),
    borderWidth: 1,
    color: rgb(1, 1, 1),
    opacity: 0.58,
  });

  let optionsCursorY = 308;
  const optionsOverflow = [];
  for (let index = 0; index < optionLines.length; index += 1) {
    const numberedLine = `${index + 1}. ${optionLines[index]}`;
    const wrapped = splitTextToPdfLines(numberedLine, fontSans, 11, optionBoxWidth - 26);
    const requiredHeight = wrapped.length * 13 + 3;
    if (optionsCursorY - requiredHeight < 248) {
      for (let overflowIndex = index; overflowIndex < optionLines.length; overflowIndex += 1) {
        optionsOverflow.push(`${overflowIndex + 1}. ${optionLines[overflowIndex]}`);
      }
      break;
    }
    wrapped.forEach((line) => {
      frontPage.drawText(line, {
        x: optionBoxX + 12,
        y: optionsCursorY,
        size: 11,
        font: fontSans,
        color: palette.darkText,
      });
      optionsCursorY -= 13;
    });
    optionsCursorY -= 3;
  }

  drawCenteredPdfText({
    page: frontPage,
    text: GIFT_CARD_LOCATION_LINE,
    y: 160,
    maxWidth: width - 120,
    font: fontSerifBold,
    fontSize: 17,
    lineHeight: 21,
    color: palette.text,
  });
  drawCenteredPdfText({
    page: frontPage,
    text: GIFT_CARD_CONTACT_LINE,
    y: 124,
    maxWidth: width - 120,
    font: fontSerifBold,
    fontSize: 21,
    lineHeight: 25,
    color: palette.text,
  });

  if (signatureImage) {
    const signatureDims = signatureImage.scaleToFit(135, 95);
    frontPage.drawImage(signatureImage, {
      x: width - 60 - signatureDims.width,
      y: 95,
      width: signatureDims.width,
      height: signatureDims.height,
      opacity: 0.95,
    });
  }
  frontPage.drawText(`PAID: ${paidDateLabel}`, {
    x: width - 182,
    y: 90,
    size: 10,
    font: fontSansBold,
    color: palette.darkText,
  });

  frontPage.drawText(`Code: ${giftCard.code || "Gift Card"}`, {
    x: 52,
    y: 97,
    size: 10.5,
    font: fontSansBold,
    color: palette.darkText,
  });
  frontPage.drawText(`Expiry: ${expiryLabel}`, {
    x: 52,
    y: 82,
    size: 10.5,
    font: fontSans,
    color: palette.darkText,
  });
  frontPage.drawText(`Status: ${(giftCard.status || "active").toString().toUpperCase()}`, {
    x: 52,
    y: 67,
    size: 10.5,
    font: fontSans,
    color: palette.darkText,
  });
  frontPage.drawText(`Value: ${formatCurrency(giftCard.value || 0)} ${GIFT_CARD_VALUE_CURRENCY}`, {
    x: 52,
    y: 52,
    size: 10.5,
    font: fontSans,
    color: palette.darkText,
  });

  let remainingOptionLines = optionsOverflow;
  while (remainingOptionLines.length) {
    const overflowPage = pdf.addPage(pageSize);
    drawGiftCardPageFrame(overflowPage, { decorative: false });
    const overflowWidth = overflowPage.getWidth();
    drawCenteredPdfText({
      page: overflowPage,
      text: "Selected options (continued)",
      y: overflowPage.getHeight() - 94,
      maxWidth: overflowWidth - 100,
      font: fontSerifBold,
      fontSize: 25,
      lineHeight: 31,
      color: palette.text,
    });
    const listX = 56;
    const listWidth = overflowWidth - 112;
    let listY = overflowPage.getHeight() - 142;
    const nextRemaining = [];

    for (let index = 0; index < remainingOptionLines.length; index += 1) {
      const line = remainingOptionLines[index];
      const wrapped = splitTextToPdfLines(line, fontSans, 12, listWidth);
      const requiredHeight = wrapped.length * 16 + 2;
      if (listY - requiredHeight < 92) {
        for (let keep = index; keep < remainingOptionLines.length; keep += 1) {
          nextRemaining.push(remainingOptionLines[keep]);
        }
        break;
      }
      wrapped.forEach((wrappedLine) => {
        overflowPage.drawText(wrappedLine, {
          x: listX,
          y: listY,
          size: 12,
          font: fontSans,
          color: palette.darkText,
        });
        listY -= 16;
      });
      listY -= 2;
    }

    overflowPage.drawText(`Gift card code: ${giftCard.code || "Gift Card"}`, {
      x: listX,
      y: 56,
      size: 10,
      font: fontSansBold,
      color: palette.darkText,
    });
    remainingOptionLines = nextRemaining;
  }

  const termsPage = pdf.addPage(pageSize);
  drawGiftCardPageFrame(termsPage, { decorative: false });
  const termsMarginX = 56;
  const termsWidth = termsPage.getWidth() - termsMarginX * 2;
  let termsY = termsPage.getHeight() - 94;
  termsPage.drawText("Gift Card Terms", {
    x: termsMarginX,
    y: termsY,
    size: 30,
    font: fontSerifBold,
    color: palette.text,
  });
  termsY -= 40;

  const defaultTerms = [
    "Gift card is redeemable for Bethany Blooms products and services only.",
    "Gift cards are non-refundable and cannot be exchanged for cash.",
    "Present your gift card code when booking or redeeming in person.",
    `Gift card must be used before ${expiryLabel}.`,
  ];

  const normalizedTermsText = (giftCard.terms || "").toString().trim();
  const termRows = normalizedTermsText
    ? normalizedTermsText
        .split(/\n+/)
        .flatMap((line) => line.split(/(?<=\.)\s+/))
        .map((line) => line.toString().trim())
        .filter(Boolean)
    : defaultTerms;

  const limitedTerms = termRows.slice(0, 10);
  limitedTerms.forEach((entry) => {
    if (termsY < 130) return;
    termsY = drawWrappedPdfText({
      page: termsPage,
      text: `- ${entry}`,
      x: termsMarginX,
      y: termsY,
      maxWidth: termsWidth,
      font: fontSans,
      fontSize: 12.5,
      lineHeight: 18,
      color: palette.darkText,
    });
    termsY -= 6;
  });

  if (logoImage) {
    const logoDims = logoImage.scaleToFit(300, 100);
    termsPage.drawImage(logoImage, {
      x: (termsPage.getWidth() - logoDims.width) / 2,
      y: 112,
      width: logoDims.width,
      height: logoDims.height,
      opacity: 0.28,
    });
  }

  termsPage.drawText(`Gift card code: ${giftCard.code || "Gift Card"}`, {
    x: termsMarginX,
    y: 82,
    size: 10.5,
    font: fontSansBold,
    color: palette.darkText,
  });
  termsPage.drawText(`Recipient: ${recipientDisplay}`, {
    x: termsMarginX,
    y: 66,
    size: 10.5,
    font: fontSans,
    color: palette.darkText,
  });
  termsPage.drawText(`Issued: ${paidDateLabel}`, {
    x: termsMarginX,
    y: 50,
    size: 10.5,
    font: fontSans,
    color: palette.darkText,
  });

  return Buffer.from(await pdf.save());
}

function buildGiftCardPublicPayload(giftCardDoc = {}, giftCardId = "", token = "") {
  const selectedOptions = normalizeGiftCardSelectedOptions(giftCardDoc.selectedOptions);
  const selectedOptionCountValue = Number(giftCardDoc.selectedOptionCount);
  const selectedOptionCount =
    Number.isFinite(selectedOptionCountValue) && selectedOptionCountValue >= 0
      ? Math.floor(selectedOptionCountValue)
      : selectedOptions.reduce(
          (sum, option) => sum + normalizeGiftCardOptionQuantity(option?.quantity, 1),
          0,
        );
  return {
    id: giftCardId,
    code: giftCardDoc.code || giftCardId,
    status: giftCardDoc.status || "active",
    value: Number(giftCardDoc.value || 0),
    currency: giftCardDoc.currency || GIFT_CARD_VALUE_CURRENCY,
    purchaserName: giftCardDoc.purchaserName || "",
    recipientName: giftCardDoc.recipientName || "",
    message: giftCardDoc.message || "",
    productTitle: giftCardDoc.productTitle || "Bethany Blooms Gift Card",
    productId: giftCardDoc.productId || null,
    terms: giftCardDoc.terms || "",
    selectedOptions,
    selectedOptionCount,
    orderNumber: giftCardDoc.orderNumber || null,
    orderId: giftCardDoc.orderId || null,
    issuedAt: toIsoString(giftCardDoc.issuedAt),
    expiresAt: toIsoString(giftCardDoc.expiresAt),
    accessUrl: buildGiftCardAccessUrl(giftCardId, token),
    siteAccessUrl: buildGiftCardSiteUrl(giftCardId, token),
    downloadUrl: buildGiftCardDownloadUrl(giftCardId, token),
    printUrl: buildGiftCardPrintViewUrl(giftCardId, token),
  };
}

function normalizeStockStatusValue(value = "") {
  const normalized = value.toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "pre_order") return "preorder";
  if (normalized === "in_stock") return "in_stock";
  if (normalized === "out_of_stock") return "out_of_stock";
  if (normalized === "preorder") return "preorder";
  return normalized;
}

function getItemPreorderDetails(item = {}) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const monthRaw = (
    metadata.preorderSendMonth ||
    metadata.preorder_send_month ||
    item.preorderSendMonth ||
    item.preorder_send_month ||
    ""
  ).toString();
  const explicitMonthLabel = (
    metadata.preorderSendMonthLabel ||
    item.preorderSendMonthLabel ||
    ""
  ).toString().trim();
  const monthLabel = formatPreorderSendMonth(monthRaw) || explicitMonthLabel;

  const stockStateValues = [
    metadata.stock_status,
    metadata.stockStatus,
    metadata.stock_state,
    metadata.stockState,
    item.stock_status,
    item.stockStatus,
    item.stock_state,
    item.stockState,
  ];
  const isStockPreorder = stockStateValues.some((value) => normalizeStockStatusValue(value) === "preorder");

  return {
    isPreorder: Boolean(monthLabel || isStockPreorder),
    monthLabel,
  };
}

function buildOrderItemsHtml(items = []) {
  if (!items.length) return "<p style=\"margin:0;\">No items.</p>";
  const rows = items
    .map((item) => {
      const name = escapeHtml(item.name || "Item");
      const quantity = Number(item.quantity) || 1;
      const price = Number(item.price);
      const priceLabel = Number.isFinite(price) ? ` - ${formatCurrency(price)}` : "";
      const metaParts = [];
      if (item.metadata?.variantLabel) {
        metaParts.push(`Variant: ${escapeHtml(item.metadata.variantLabel)}`);
      }
      if (item.metadata?.type === "workshop") {
        const sessionLabel = item.metadata.sessionDayLabel || item.metadata.sessionLabel || "Session";
        metaParts.push(`Workshop: ${escapeHtml(sessionLabel)}`);
      }
      if (item.metadata?.type === "cut-flower" && item.metadata?.optionLabel) {
        metaParts.push(`Option: ${escapeHtml(item.metadata.optionLabel)}`);
      }
      if (isGiftCardOrderItem(item)) {
        const giftCard = item.metadata?.giftCard || {};
        const recipient = (giftCard.recipientName || "").toString().trim();
        const purchaser = (giftCard.purchaserName || "").toString().trim();
        const selectedOptions = normalizeGiftCardSelectedOptions(giftCard.selectedOptions);
        metaParts.push("Gift card");
        if (recipient) metaParts.push(`Recipient: ${escapeHtml(recipient)}`);
        if (purchaser) metaParts.push(`Purchased by: ${escapeHtml(purchaser)}`);
        if (selectedOptions.length) {
          metaParts.push(
            `Options: ${selectedOptions
              .map((option) => {
                const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 1);
                const amountLabel = escapeHtml(formatCurrency(option.amount));
                if (quantity <= 1) {
                  return `${escapeHtml(option.label)} (${amountLabel})`;
                }
                return `${escapeHtml(option.label)} x${quantity} (${amountLabel} each)`;
              })
              .join(", ")}`,
          );
        }
      }
      const preorderSendMonth = formatPreorderSendMonth(
        item.metadata?.preorderSendMonth || item.metadata?.preorder_send_month || "",
      );
      if (preorderSendMonth) {
        metaParts.push(`Pre-order dispatch: ${escapeHtml(preorderSendMonth)}`);
      }
      const metaLine = metaParts.length ? `<span>${metaParts.join(" - ")}</span>` : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${EMAIL_BRAND.border};">
          <strong>${name}</strong> <span style="color:${EMAIL_BRAND.muted};">x${quantity}${priceLabel}</span>
          ${metaLine ? `<div style="font-size:12px;color:${EMAIL_BRAND.muted};margin-top:4px;">${metaLine}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`;
}

function buildPreorderNoticeHtml(items = []) {
  const preorderRows = items
    .map((item) => {
      const preorderDetails = getItemPreorderDetails(item);
      if (!preorderDetails.isPreorder) return "";
      const name = escapeHtml(item.name || "Item");
      if (preorderDetails.monthLabel) {
        return `<li><strong>${name}</strong> ships from ${escapeHtml(preorderDetails.monthLabel)}.</li>`;
      }
      return `<li><strong>${name}</strong> is a pre-order item and will dispatch in the upcoming dispatch window.</li>`;
    })
    .filter(Boolean);

  if (!preorderRows.length) return "";
  return `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin:16px 0;">
      <p style="margin:0 0 8px;"><strong>Pre-order shipping timeline</strong></p>
      <ul style="margin:0;padding-left:18px;">
        ${preorderRows.join("")}
      </ul>
    </div>
  `;
}

function buildOrderTotalsHtml(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const computedSubtotal = items.reduce((sum, item) => {
    const quantityValue = Number(item.quantity);
    const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1;
    const price = Number(item.price);
    if (!Number.isFinite(price)) return sum;
    return sum + price * quantity;
  }, 0);

  const subtotalRaw = Number(order.subtotal);
  const subtotal = Number.isFinite(subtotalRaw) && subtotalRaw >= 0 ? subtotalRaw : computedSubtotal;

  const shippingRaw = Number(order.shippingCost ?? order.shipping?.courierPrice ?? 0);
  const shippingCost = Number.isFinite(shippingRaw) && shippingRaw >= 0 ? shippingRaw : 0;

  const totalRaw = Number(order.totalPrice);
  const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : subtotal + shippingCost;

  return `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin:16px 0;">
      <p style="margin:0 0 10px;"><strong>Pricing summary</strong></p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;">
        <tr>
          <td style="padding:0 0 6px;color:${EMAIL_BRAND.muted};">Subtotal</td>
          <td style="padding:0 0 6px;text-align:right;">${escapeHtml(formatCurrency(subtotal))}</td>
        </tr>
        <tr>
          <td style="padding:0 0 8px;color:${EMAIL_BRAND.muted};">Shipping</td>
          <td style="padding:0 0 8px;text-align:right;">${escapeHtml(formatCurrency(shippingCost))}</td>
        </tr>
        <tr>
          <td style="padding-top:8px;border-top:1px solid ${EMAIL_BRAND.border};"><strong>Total</strong></td>
          <td style="padding-top:8px;border-top:1px solid ${EMAIL_BRAND.border};text-align:right;"><strong>${escapeHtml(
            formatCurrency(total),
          )}</strong></td>
        </tr>
      </table>
    </div>
  `;
}

function getOrderInvoiceDownloadUrl(order = {}) {
  return (order?.invoice?.downloadUrl || "").toString().trim();
}

function getOrderInvoiceLabel(order = {}) {
  const explicitLabel = (order?.invoice?.invoiceNumberLabel || "").toString().trim();
  if (explicitLabel) return explicitLabel;
  const numericInvoice = normalizeInvoiceSequenceNumber(
    order?.invoiceNumber || order?.invoice?.invoiceNumber || order?.orderNumber,
  );
  if (numericInvoice) return formatInvoiceSequenceNumber(numericInvoice);
  return "";
}

function buildOrderInvoiceSummaryHtml(order = {}) {
  const invoiceLabel = getOrderInvoiceLabel(order);
  const downloadUrl = getOrderInvoiceDownloadUrl(order);
  if (!invoiceLabel && !downloadUrl) return "";
  const invoiceRow = invoiceLabel
    ? `<p style="margin:0 0 8px;"><strong>Invoice:</strong> ${escapeHtml(invoiceLabel)}</p>`
    : "";
  const downloadRow = downloadUrl
    ? `<p style="margin:0;"><a href="${escapeHtml(downloadUrl)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;font-weight:700;">Download order invoice (PDF)</a></p>`
    : "";
  return `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin:14px 0 0;">
      ${invoiceRow}
      ${downloadRow}
    </div>
  `;
}

function buildOrderEmailHtml(order = {}, orderId = "") {
  const customerName = escapeHtml(order.customer?.fullName || "there");
  const orderNumber = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const itemsHtml = buildOrderItemsHtml(order.items || []);
  const preorderNoticeHtml = buildPreorderNoticeHtml(order.items || []);
  const invoiceSummaryHtml = buildOrderInvoiceSummaryHtml(order);
  const total = formatCurrency(order.totalPrice || 0);
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 16px;">Thank you for your order with Bethany Blooms. We are preparing your items now.</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderNumber)}</strong>
    </div>
    ${invoiceSummaryHtml}
    ${itemsHtml}
    ${preorderNoticeHtml}
    <p style="margin:16px 0 0;"><strong>Total:</strong> ${total}</p>
  `;
  return wrapEmail({ title: "Order confirmation", subtitle: "We are getting everything ready.", body });
}

function buildOrderAdminEmailHtml(order = {}, orderId = "") {
  const customer = order.customer || {};
  const orderNumber = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const itemsHtml = buildOrderItemsHtml(order.items || []);
  const preorderNoticeHtml = buildPreorderNoticeHtml(order.items || []);
  const invoiceSummaryHtml = buildOrderInvoiceSummaryHtml(order);
  const total = formatCurrency(order.totalPrice || 0);
  const body = `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderNumber)}</strong>
    </div>
    ${invoiceSummaryHtml}
    <p style="margin:0 0 6px;"><strong>Customer:</strong> ${escapeHtml(customer.fullName || "Guest")}</p>
    <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(customer.email || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Phone:</strong> ${escapeHtml(customer.phone || "Not provided")}</p>
    <p style="margin:0 0 16px;"><strong>Address:</strong> ${escapeHtml(customer.address || "Not provided")}</p>
    ${itemsHtml}
    ${preorderNoticeHtml}
    <p style="margin:16px 0 0;"><strong>Total:</strong> ${total}</p>
  `;
  return wrapEmail({ title: "New order received", subtitle: "Order details for the studio team.", body });
}

function normalizePaymentMethod(value = "") {
  const normalized = value.toString().trim().toLowerCase();
  return normalized === "eft" ? "eft" : "payfast";
}

function normalizePaymentApprovalDecision(order = {}) {
  const direct = (
    order.paymentApprovalStatus ||
    order.paymentApproval?.decision ||
    ""
  ).toString().trim().toLowerCase();
  if (["not-required", "pending", "approved", "rejected"].includes(direct)) {
    return direct;
  }
  return normalizePaymentMethod(order.paymentMethod) === "eft" ? "pending" : "not-required";
}

function normalizeOrderCreatedEmailTemplate(value = "") {
  const normalized = value.toString().trim().toLowerCase();
  if (normalized === ORDER_CREATED_EMAIL_TEMPLATES.EFT_PENDING) {
    return ORDER_CREATED_EMAIL_TEMPLATES.EFT_PENDING;
  }
  return ORDER_CREATED_EMAIL_TEMPLATES.STANDARD;
}

function normalizeOrderNotificationStatus(value = "") {
  const normalized = value.toString().trim().toLowerCase();
  if ([
    ORDER_NOTIFICATION_STATUSES.SENT,
    ORDER_NOTIFICATION_STATUSES.FAILED,
    ORDER_NOTIFICATION_STATUSES.SKIPPED,
  ].includes(normalized)) {
    return normalized;
  }
  return "";
}

function resolveOrderCreatedEmailTemplate(order = {}) {
  const paymentMethod = normalizePaymentMethod(order.paymentMethod);
  const approvalDecision = normalizePaymentApprovalDecision(order);
  if (paymentMethod === "eft" && approvalDecision !== "approved") {
    return ORDER_CREATED_EMAIL_TEMPLATES.EFT_PENDING;
  }
  return ORDER_CREATED_EMAIL_TEMPLATES.STANDARD;
}

function resolveOrderCreatedEmailContent({
  order = {},
  orderId = "",
  template = ORDER_CREATED_EMAIL_TEMPLATES.STANDARD,
  recipient = "customer",
} = {}) {
  const normalizedTemplate = normalizeOrderCreatedEmailTemplate(template);
  const orderReference = order.orderNumber || orderId || "order";
  if (recipient === "admin") {
    if (normalizedTemplate === ORDER_CREATED_EMAIL_TEMPLATES.EFT_PENDING) {
      return {
        subject: `EFT payment approval needed - ${orderReference}`,
        html: buildEftPendingAdminEmailHtml(order, orderId),
      };
    }
    return {
      subject: `New order received - ${orderReference}`,
      html: buildOrderAdminEmailHtml(order, orderId),
    };
  }

  if (normalizedTemplate === ORDER_CREATED_EMAIL_TEMPLATES.EFT_PENDING) {
    return {
      subject: `Bethany Blooms - EFT order received (${orderReference})`,
      html: buildEftPendingCustomerEmailHtml(order, orderId),
    };
  }
  return {
    subject: `Bethany Blooms - Order ${orderReference}`,
    html: buildOrderEmailHtml(order, orderId),
  };
}

function wasOrderNotificationAlreadySent(notification = {}, template = ORDER_CREATED_EMAIL_TEMPLATES.STANDARD) {
  if (!notification || typeof notification !== "object") return false;
  const status = normalizeOrderNotificationStatus(notification.status);
  const existingTemplate = normalizeOrderCreatedEmailTemplate(notification.template);
  const expectedTemplate = normalizeOrderCreatedEmailTemplate(template);
  return status === ORDER_NOTIFICATION_STATUSES.SENT && existingTemplate === expectedTemplate;
}

function buildOrderNotificationAttempt({
  status = ORDER_NOTIFICATION_STATUSES.SKIPPED,
  template = ORDER_CREATED_EMAIL_TEMPLATES.STANDARD,
  source = "trigger",
  error = null,
  previousSentAt = null,
} = {}) {
  const normalizedStatus = normalizeOrderNotificationStatus(status) || ORDER_NOTIFICATION_STATUSES.SKIPPED;
  const normalizedTemplate = normalizeOrderCreatedEmailTemplate(template);
  const record = {
    status: normalizedStatus,
    template: normalizedTemplate,
    attemptedAt: FIELD_VALUE.serverTimestamp(),
    sentAt: null,
    error: error ? error.toString().slice(0, 500) : null,
    lastAttemptSource: source,
  };
  if (normalizedStatus === ORDER_NOTIFICATION_STATUSES.SENT) {
    record.sentAt = FIELD_VALUE.serverTimestamp();
    record.error = null;
  } else if (previousSentAt) {
    record.sentAt = previousSentAt;
  }
  return record;
}

function buildRetryFailureMessage(initialError, retryError) {
  const initial = (initialError || "").toString().trim();
  const retry = (retryError || "").toString().trim();
  if (!initial && !retry) return null;
  if (!initial) return retry;
  if (!retry) return initial;
  if (initial === retry) return retry;
  return `First attempt failed: ${initial}. Retry failed: ${retry}`;
}

async function sendEmailWithRetry({
  to,
  subject,
  html,
  attachments = [],
  retryCount = 1,
  retryDelayMs = 1200,
} = {}) {
  let attempts = 1;
  const firstResult = await sendEmail({ to, subject, html, attachments });
  if (!firstResult?.error || retryCount <= 0) {
    return {
      attempts,
      firstError: firstResult?.error || null,
      finalResult: firstResult,
    };
  }

  let finalResult = firstResult;
  for (let retryIndex = 0; retryIndex < retryCount; retryIndex += 1) {
    await wait(retryDelayMs);
    attempts += 1;
    finalResult = await sendEmail({ to, subject, html, attachments });
    if (!finalResult?.error) {
      return {
        attempts,
        firstError: firstResult.error,
        finalResult,
      };
    }
  }

  return {
    attempts,
    firstError: firstResult.error,
    finalResult,
  };
}

async function dispatchOrderCreatedNotifications({
  orderRef,
  orderId = "",
  source = "trigger",
  sendAdmin = true,
  retryCustomer = true,
  skipIfCustomerAlreadyAttempted = false,
} = {}) {
  if (!orderRef) return null;

  const latestSnap = await orderRef.get();
  if (!latestSnap.exists) return null;
  let order = latestSnap.data() || {};
  try {
    const invoiceResult = await ensureOrderInvoiceDocument({
      orderRef,
      orderId,
      orderData: order,
    });
    order = invoiceResult?.order || order;
  } catch (error) {
    functions.logger.error("Order invoice generation failed before notification dispatch", {
      orderId,
      error: error?.message || error,
    });
  }
  const template = resolveOrderCreatedEmailTemplate(order);

  const existingOrderNotifications = order.notifications?.orderCreated || {};
  const existingCustomerNotification = existingOrderNotifications.customer || null;
  const existingAdminNotification = existingOrderNotifications.admin || null;

  const customerEmail = (order.customer?.email || "").toString().trim();
  const adminEmail = getAdminEmail().toString().trim();

  const hasCustomerAttempt =
    Boolean(normalizeOrderNotificationStatus(existingCustomerNotification?.status)) ||
    Boolean(existingCustomerNotification?.attemptedAt) ||
    Boolean(existingCustomerNotification?.sentAt);

  let customerNotificationRecord = null;
  if (!wasOrderNotificationAlreadySent(existingCustomerNotification, template)) {
    if (!(skipIfCustomerAlreadyAttempted && hasCustomerAttempt)) {
      if (!customerEmail) {
        customerNotificationRecord = buildOrderNotificationAttempt({
          status: ORDER_NOTIFICATION_STATUSES.SKIPPED,
          template,
          source,
          error: "Customer email is missing.",
          previousSentAt: existingCustomerNotification?.sentAt || null,
        });
      } else {
        const customerEmailContent = resolveOrderCreatedEmailContent({
          order,
          orderId,
          template,
          recipient: "customer",
        });
        const customerSendResult = retryCustomer
          ? await sendEmailWithRetry({
            to: customerEmail,
            subject: customerEmailContent.subject,
            html: customerEmailContent.html,
            retryCount: 1,
            retryDelayMs: 1500,
          })
          : {
            attempts: 1,
            firstError: null,
            finalResult: await sendEmail({
              to: customerEmail,
              subject: customerEmailContent.subject,
              html: customerEmailContent.html,
            }),
          };

        const finalError = customerSendResult.finalResult?.error || null;
        customerNotificationRecord = buildOrderNotificationAttempt({
          status: finalError ? ORDER_NOTIFICATION_STATUSES.FAILED : ORDER_NOTIFICATION_STATUSES.SENT,
          template,
          source,
          error: finalError ? buildRetryFailureMessage(customerSendResult.firstError, finalError) : null,
          previousSentAt: existingCustomerNotification?.sentAt || null,
        });
      }
    }
  }

  let adminNotificationRecord = null;
  if (sendAdmin && !wasOrderNotificationAlreadySent(existingAdminNotification, template)) {
    if (!adminEmail) {
      adminNotificationRecord = buildOrderNotificationAttempt({
        status: ORDER_NOTIFICATION_STATUSES.SKIPPED,
        template,
        source,
        error: "Admin email is missing.",
        previousSentAt: existingAdminNotification?.sentAt || null,
      });
    } else {
      const adminEmailContent = resolveOrderCreatedEmailContent({
        order,
        orderId,
        template,
        recipient: "admin",
      });
      const adminSendResult = await sendEmail({
        to: adminEmail,
        subject: adminEmailContent.subject,
        html: adminEmailContent.html,
      });
      adminNotificationRecord = buildOrderNotificationAttempt({
        status: adminSendResult?.error ? ORDER_NOTIFICATION_STATUSES.FAILED : ORDER_NOTIFICATION_STATUSES.SENT,
        template,
        source,
        error: adminSendResult?.error || null,
        previousSentAt: existingAdminNotification?.sentAt || null,
      });
    }
  }

  const notificationUpdate = {};
  if (customerNotificationRecord) {
    notificationUpdate.customer = customerNotificationRecord;
  }
  if (adminNotificationRecord) {
    notificationUpdate.admin = adminNotificationRecord;
  }
  if (Object.keys(notificationUpdate).length) {
    await orderRef.set({
      notifications: {
        orderCreated: notificationUpdate,
      },
      updatedAt: FIELD_VALUE.serverTimestamp(),
    }, { merge: true });
  }

  return {
    order,
    template,
    customerNotificationRecord,
    adminNotificationRecord,
  };
}

function getEftBankDetails() {
  return {
    ...EFT_BANK_DETAILS,
    supportEmail: getAdminEmail(),
  };
}

function buildEftReferenceNoticeHtml(orderReference = EFT_BANK_DETAILS.referenceFormat) {
  return `
    <div style="padding:12px 16px;border-radius:14px;border:2px solid rgba(178,69,59,0.45);background:rgba(178,69,59,0.1);margin:12px 0 0;">
      <p style="margin:0 0 8px;letter-spacing:0.04em;font-size:12px;font-weight:700;color:#8f3129;">IMPORTANT PAYMENT REFERENCE</p>
      <p style="margin:0 0 8px;"><strong>Use this exact EFT reference:</strong> ${escapeHtml(orderReference)}</p>
      <p style="margin:0;font-size:13px;color:${EMAIL_BRAND.text};">
        This reference is your order number and is how we match your payment to your products. If it is missing or incorrect,
        payment approval can take longer and shipping may be delayed while we manually trace who paid for which order.
      </p>
    </div>
  `;
}

function buildEftBankDetailsHtml(order = {}, options = {}) {
  const details = getEftBankDetails();
  const orderReference = options.orderReference ||
    (order.orderNumber ? `Order #${order.orderNumber}` : EFT_BANK_DETAILS.referenceFormat);
  return `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin:16px 0;">
      <p style="margin:0 0 6px;"><strong>Account name:</strong> ${escapeHtml(details.accountName)}</p>
      <p style="margin:0 0 6px;"><strong>Bank:</strong> ${escapeHtml(details.bankName)}</p>
      <p style="margin:0 0 6px;"><strong>Account type:</strong> ${escapeHtml(details.accountType)}</p>
      <p style="margin:0 0 6px;"><strong>Account number:</strong> ${escapeHtml(details.accountNumber)}</p>
      <p style="margin:0 0 6px;"><strong>Branch code:</strong> ${escapeHtml(details.branchCode)}</p>
      <p style="margin:0;"><strong>Reference (must match order number):</strong> ${escapeHtml(orderReference)}</p>
      ${buildEftReferenceNoticeHtml(orderReference)}
    </div>
  `;
}

function buildCustomerEftInfoHtml(order = {}, options = {}) {
  const details = getEftBankDetails();
  return `
    <p style="margin:16px 0 8px;">
      Prefer paying via EFT? Use the banking details below and include your order reference.
    </p>
    ${buildEftBankDetailsHtml(order, { orderReference: options.orderReference })}
    <p style="margin:8px 0 0;font-size:13px;color:${EMAIL_BRAND.muted};">
      Need help with EFT payment? Contact ${escapeHtml(details.supportEmail)}.
    </p>
  `;
}

function buildEftPendingCustomerEmailHtml(order = {}, orderId = "") {
  const customerName = escapeHtml(order.customer?.fullName || "there");
  const orderLabel = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const itemsHtml = buildOrderItemsHtml(order.items || []);
  const preorderNoticeHtml = buildPreorderNoticeHtml(order.items || []);
  const totalsHtml = buildOrderTotalsHtml(order);
  const invoiceSummaryHtml = buildOrderInvoiceSummaryHtml(order);
  const proofLine = order.paymentProof?.fileName
    ? `<p style="margin:0 0 12px;"><strong>Proof uploaded:</strong> ${escapeHtml(order.paymentProof.fileName)}</p>`
    : "";
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 12px;">We have received your EFT order and it is awaiting payment approval.</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderLabel)}</strong>
    </div>
    ${invoiceSummaryHtml}
    <p style="margin:0 0 8px;"><strong>Order items</strong></p>
    ${itemsHtml}
    ${preorderNoticeHtml}
    ${totalsHtml}
    ${proofLine}
    ${buildEftBankDetailsHtml(order)}
    <p style="margin:16px 0 0;">Once payment is verified, our team will approve your order and continue fulfilment.</p>
  `;
  return wrapEmail({
    title: "EFT order received",
    subtitle: "Awaiting payment approval.",
    body,
  });
}

function buildEftPendingAdminEmailHtml(order = {}, orderId = "") {
  const customer = order.customer || {};
  const orderLabel = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const proofPath = order.paymentProof?.storagePath || "";
  const invoiceSummaryHtml = buildOrderInvoiceSummaryHtml(order);
  const proofMarkup = proofPath
    ? `<p style="margin:0 0 6px;"><strong>Proof path:</strong> ${escapeHtml(proofPath)}</p>`
    : "<p style=\"margin:0 0 6px;\"><strong>Proof path:</strong> Not provided</p>";
  const body = `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderLabel)}</strong>
    </div>
    ${invoiceSummaryHtml}
    <p style="margin:0 0 6px;"><strong>Customer:</strong> ${escapeHtml(customer.fullName || "Guest")}</p>
    <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(customer.email || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Phone:</strong> ${escapeHtml(customer.phone || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Total:</strong> ${escapeHtml(formatCurrency(order.totalPrice || 0))}</p>
    ${proofMarkup}
    <p style="margin:0 0 16px;"><strong>Status:</strong> Pending payment approval</p>
    ${buildOrderItemsHtml(order.items || [])}
  `;
  return wrapEmail({
    title: "EFT payment approval needed",
    subtitle: "Review and approve or reject this order payment.",
    body,
  });
}

function buildEftDecisionCustomerEmailHtml({ order = {}, orderId = "", decision = "approved", note = "" } = {}) {
  const customerName = escapeHtml(order.customer?.fullName || "there");
  const orderLabel = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const isApproved = decision === "approved";
  const invoiceSummaryHtml = buildOrderInvoiceSummaryHtml(order);
  const noteMarkup = note
    ? `<p style="margin:0 0 16px;"><strong>Admin note:</strong> ${escapeHtml(note)}</p>`
    : "";
  const eftInfoHtml = buildCustomerEftInfoHtml(order);
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderLabel)}</strong>
    </div>
    ${invoiceSummaryHtml}
    <p style="margin:0 0 12px;">
      Your EFT payment has been <strong>${escapeHtml(decision)}</strong>.
    </p>
    ${noteMarkup}
    <p style="margin:0;">
      ${
        isApproved
          ? "Thank you. We will continue preparing your order."
          : "This order will remain blocked from fulfilment. Please contact us if you need help."
      }
    </p>
    ${eftInfoHtml}
  `;
  return wrapEmail({
    title: isApproved ? "EFT payment approved" : "EFT payment rejected",
    subtitle: isApproved ? "Your order is now progressing." : "Order fulfilment is blocked.",
    body,
  });
}

function buildEftDecisionAdminEmailHtml({ order = {}, orderId = "", decision = "approved", note = "" } = {}) {
  const orderLabel = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const invoiceSummaryHtml = buildOrderInvoiceSummaryHtml(order);
  const noteMarkup = note
    ? `<p style="margin:0 0 8px;"><strong>Note:</strong> ${escapeHtml(note)}</p>`
    : "";
  const body = `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderLabel)}</strong>
    </div>
    ${invoiceSummaryHtml}
    <p style="margin:0 0 8px;"><strong>Decision:</strong> ${escapeHtml(decision)}</p>
    <p style="margin:0 0 8px;"><strong>Customer:</strong> ${escapeHtml(order.customer?.fullName || "Guest")}</p>
    <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(order.customer?.email || "Not provided")}</p>
    ${noteMarkup}
    <p style="margin:0;"><strong>Total:</strong> ${escapeHtml(formatCurrency(order.totalPrice || 0))}</p>
  `;
  return wrapEmail({
    title: `EFT payment ${decision}`,
    subtitle: "Payment review has been completed.",
    body,
  });
}

function buildGiftCardMatchesHtml(matches = []) {
  const entries = (Array.isArray(matches) ? matches : [])
    .map((entry) => {
      const code = normalizeGiftCardLookupCode(entry?.code || "");
      const giftCardId = (entry?.giftCardId || entry?.id || "").toString().trim();
      if (!code && !giftCardId) return null;
      const status = (entry?.status || "unknown").toString().trim().toLowerCase() || "unknown";
      const statusParts = [status.toUpperCase()];
      if (entry?.isExpired) statusParts.push("EXPIRED");
      if (entry?.isActive) statusParts.push("ACTIVE");
      const recipientName = (entry?.recipientName || "").toString().trim();
      const purchaserName = (entry?.purchaserName || "").toString().trim();
      const value = Number(entry?.value || 0);
      const currency = (entry?.currency || GIFT_CARD_VALUE_CURRENCY).toString().trim() || GIFT_CARD_VALUE_CURRENCY;
      return {
        code: code || giftCardId,
        statusLabel: statusParts.join(" - "),
        recipientName,
        purchaserName,
        valueLabel: `${formatCurrency(value)} ${currency}`,
      };
    })
    .filter(Boolean);
  if (!entries.length) return "";
  const rows = entries
    .map((entry) => {
      const recipientLine = entry.recipientName
        ? ` - Recipient: ${escapeHtml(entry.recipientName)}`
        : "";
      const purchaserLine = entry.purchaserName
        ? ` - Purchased by: ${escapeHtml(entry.purchaserName)}`
        : "";
      return `<li style="margin:0 0 8px;"><strong>${escapeHtml(entry.code)}</strong> - ${escapeHtml(
        entry.statusLabel,
      )} - ${escapeHtml(entry.valueLabel)}${recipientLine}${purchaserLine}</li>`;
    })
    .join("");
  return `
    <div style="margin:14px 0 4px;padding:12px 14px;border-radius:12px;background:rgba(245,234,215,0.55);border:1px solid ${EMAIL_BRAND.border};">
      <p style="margin:0 0 8px;"><strong>Gift card matches (${entries.length})</strong></p>
      <ul style="margin:0;padding-left:18px;">${rows}</ul>
    </div>
  `;
}

function buildPosReceiptHtml(sale = {}, receiptId = "") {
  const customerName = escapeHtml(sale.customer?.name || sale.customer?.fullName || "there");
  const receiptNumber = sale.receiptNumber ? `Receipt #${sale.receiptNumber}` : `Receipt ${receiptId}`;
  const itemsHtml = buildOrderItemsHtml(sale.items || []);
  const total = formatCurrency(sale.total || sale.totalPrice || 0);
  const paymentMethod = escapeHtml(sale.paymentMethod || "In-store");
  const cashReceived = Number(sale.cashReceived ?? 0);
  const changeDue = Number(sale.changeDue ?? 0);
  const cashLine =
    sale.paymentMethod === "cash" && Number.isFinite(cashReceived)
      ? `<p><strong>Cash received:</strong> ${formatCurrency(cashReceived)}</p>
    <p><strong>Change due:</strong> ${formatCurrency(Number.isFinite(changeDue) ? changeDue : 0)}</p>`
      : "";
  const discountAmount = Number(sale.discount?.amount ?? sale.discountAmount ?? 0) || 0;
  const discountType = sale.discount?.type || "";
  const discountValue = Number(sale.discount?.value ?? 0);
  const discountLine =
    discountAmount > 0
      ? `<p><strong>Discount:</strong> -${formatCurrency(discountAmount)}${
          discountType === "percent" && Number.isFinite(discountValue)
            ? ` (${discountValue}%)`
            : ""
        }</p>`
      : "";
  const giftCardMatchesHtml = buildGiftCardMatchesHtml(sale.giftCardMatches || []);
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 16px;">Thank you for shopping with Bethany Blooms. Here is your receipt.</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(receiptNumber)}</strong>
    </div>
    ${itemsHtml}
    ${discountLine}
    ${giftCardMatchesHtml}
    <p style="margin:16px 0 0;"><strong>Total:</strong> ${total}</p>
    <p style="margin:4px 0 0;"><strong>Payment:</strong> ${paymentMethod}</p>
    ${cashLine}
  `;
  return wrapEmail({ title: "POS receipt", subtitle: "Thank you for your purchase.", body });
}

function buildPosReceiptAdminHtml(sale = {}, receiptId = "") {
  const customer = sale.customer || {};
  const receiptNumber = sale.receiptNumber ? `Receipt #${sale.receiptNumber}` : `Receipt ${receiptId}`;
  const itemsHtml = buildOrderItemsHtml(sale.items || []);
  const total = formatCurrency(sale.total || sale.totalPrice || 0);
  const paymentMethod = escapeHtml(sale.paymentMethod || "In-store");
  const cashReceived = Number(sale.cashReceived ?? 0);
  const changeDue = Number(sale.changeDue ?? 0);
  const cashLine =
    sale.paymentMethod === "cash" && Number.isFinite(cashReceived)
      ? `<p><strong>Cash received:</strong> ${formatCurrency(cashReceived)}</p>
    <p><strong>Change due:</strong> ${formatCurrency(Number.isFinite(changeDue) ? changeDue : 0)}</p>`
      : "";
  const discountAmount = Number(sale.discount?.amount ?? sale.discountAmount ?? 0) || 0;
  const discountType = sale.discount?.type || "";
  const discountValue = Number(sale.discount?.value ?? 0);
  const discountLine =
    discountAmount > 0
      ? `<p><strong>Discount:</strong> -${formatCurrency(discountAmount)}${
          discountType === "percent" && Number.isFinite(discountValue)
            ? ` (${discountValue}%)`
            : ""
        }</p>`
      : "";
  const giftCardMatchesHtml = buildGiftCardMatchesHtml(sale.giftCardMatches || []);
  const body = `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(receiptNumber)}</strong>
    </div>
    <p style="margin:0 0 6px;"><strong>Customer:</strong> ${escapeHtml(customer.name || customer.fullName || "Walk-in")}</p>
    <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(customer.email || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Phone:</strong> ${escapeHtml(customer.phone || "Not provided")}</p>
    <p style="margin:0 0 16px;"><strong>Payment:</strong> ${paymentMethod}</p>
    ${itemsHtml}
    ${discountLine}
    ${giftCardMatchesHtml}
    <p style="margin:16px 0 0;"><strong>Total:</strong> ${total}</p>
    ${cashLine}
  `;
  return wrapEmail({ title: "POS sale summary", subtitle: "Internal record copy.", body });
}

function buildContactEmailHtml(data = {}) {
  const name = escapeHtml(data.name || "Guest");
  const email = escapeHtml(data.email || "Not provided");
  const phone = escapeHtml(data.phone || "Not provided");
  const topic = escapeHtml(data.topic || "General enquiry");
  const timeline = escapeHtml(data.timeline || "Not provided");
  const message = escapeHtml(data.message || "");
  const body = `
    <p style="margin:0 0 6px;"><strong>Name:</strong> ${name}</p>
    <p style="margin:0 0 6px;"><strong>Email:</strong> ${email}</p>
    <p style="margin:0 0 6px;"><strong>Phone:</strong> ${phone}</p>
    <p style="margin:0 0 6px;"><strong>Topic:</strong> ${topic}</p>
    <p style="margin:0 0 12px;"><strong>Timeline:</strong> ${timeline}</p>
    <div style="padding:14px 16px;border-radius:14px;background:rgba(245,234,215,0.6);">
      <strong>Message</strong>
      <p style="margin:8px 0 0;">${message.replace(/\n/g, "<br />")}</p>
    </div>
  `;
  return wrapEmail({ title: "New enquiry", subtitle: "A customer just reached out.", body });
}

function buildContactConfirmationHtml(data = {}) {
  const name = escapeHtml(data.name || "there");
  const body = `
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 16px;">Thank you for contacting Bethany Blooms. We have received your message and will respond within two business days.</p>
    <p style="margin:0;">If your enquiry is urgent, please reply to this email.</p>
  `;
  return wrapEmail({ title: "We received your message", subtitle: "Thanks for reaching out to Bethany Blooms.", body });
}

function buildAccountWelcomeEmailHtml(data = {}) {
  const name = escapeHtml(
    trimToLength(
      data.fullName || data.name || data.displayName || "",
      120,
    ) || "there",
  );
  const accountUrlRaw = (data.accountUrl || `${getCanonicalSiteUrl()}/account`)
    .toString()
    .trim();
  const accountUrl = escapeHtml(accountUrlRaw || `${getCanonicalSiteUrl()}/account`);
  const body = `
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 12px;">Welcome to Bethany Blooms. Your customer account is ready.</p>
    <p style="margin:0 0 14px;">
      From your account you can save delivery details, view orders, and manage your subscriptions.
    </p>
    <div style="margin:16px 0;">
      <a href="${accountUrl}" style="display:inline-block;padding:12px 20px;background:${EMAIL_BRAND.primary};color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">
        Go to Account
      </a>
    </div>
    <p style="margin:0;font-size:12px;color:${EMAIL_BRAND.muted};">
      If the button does not work, copy this link:<br/>
      <a href="${accountUrl}" style="color:${EMAIL_BRAND.primary};text-decoration:none;word-break:break-all;">${accountUrl}</a>
    </p>
  `;
  return wrapEmail({
    title: "Welcome to Bethany Blooms",
    subtitle: "Your customer account has been created.",
    body,
  });
}

function formatOrderStatusLabel(status = "") {
  return status
    .toString()
    .trim()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildOrderStatusEmailHtml({
  customer = {},
  status = "updated",
  orderNumber = "",
  trackingLink = "",
  items = [],
}) {
  const statusLabel = escapeHtml(formatOrderStatusLabel(status));
  const orderLabelRaw = orderNumber || "Your order";
  const orderLabel = escapeHtml(orderLabelRaw);
  const preorderNoticeHtml = buildPreorderNoticeHtml(items);
  const trackingMarkup = trackingLink
    ? `<div style="margin:18px 0 6px;">
        <a href="${escapeHtml(trackingLink)}" style="display:inline-block;padding:10px 18px;background:${EMAIL_BRAND.primary};color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;">Track your order</a>
      </div>
      <p style="margin:0;font-size:12px;color:${EMAIL_BRAND.muted};">Or copy this link: <a href="${escapeHtml(trackingLink)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">${escapeHtml(trackingLink)}</a></p>`
    : "";
  const body = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(customer.fullName || "there")},</p>
    <p style="margin:0 0 10px;">Your order status has been updated to <strong>${statusLabel}</strong>.</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${orderLabel}</strong>
    </div>
    ${preorderNoticeHtml}
    ${trackingMarkup}
    <p style="margin:16px 0 0;">If you have any questions, reply to this email and we will help.</p>
  `;
  return wrapEmail({ title: "Order update", subtitle: "Thanks for shopping with Bethany Blooms.", body });
}

function formatDeliveryMethodLabel(deliveryMethod = "") {
  const normalized = (deliveryMethod || "").toString().trim().toLowerCase();
  if (normalized === "courier") return "Courier";
  if (normalized === "company") return "Company delivery";
  return "Delivery";
}

function buildOrderDeliveryUpdateEmailHtml(order = {}, orderId = "") {
  const customerName = escapeHtml(order?.customer?.fullName || "there");
  const orderLabel = Number.isFinite(Number(order?.orderNumber))
    ? `Order #${Number(order.orderNumber)}`
    : `Order ${orderId}`;
  const deliveryMethodLabel = formatDeliveryMethodLabel(order?.deliveryMethod);
  const courierName = trimToLength(
    order?.shipping?.courierName || order?.courierName || "",
    160,
  );
  const trackingLink = (order?.trackingLink || "").toString().trim();
  const addressLines = formatOrderAddressLines(order).map((line) => escapeHtml(line));
  const addressMarkup = addressLines.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;">${addressLines.map((line) => `<li>${line}</li>`).join("")}</ul>`
    : "<p style=\"margin:8px 0 0;\">No delivery address captured.</p>";
  const shippingLabel = escapeHtml(formatCurrency(Number(order?.shippingCost || 0)));
  const totalLabel = escapeHtml(formatCurrency(Number(order?.totalPrice || 0)));
  const trackingMarkup = trackingLink
    ? `
      <p style="margin:0 0 6px;">
        <strong>Tracking link:</strong>
        <a href="${escapeHtml(trackingLink)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;word-break:break-all;">
          ${escapeHtml(trackingLink)}
        </a>
      </p>
    `
    : "<p style=\"margin:0 0 6px;\"><strong>Tracking link:</strong> Not provided yet</p>";
  const courierMarkup = courierName
    ? `<p style="margin:0 0 6px;"><strong>Courier:</strong> ${escapeHtml(courierName)}</p>`
    : "";
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 12px;">
      Your delivery details for <strong>${escapeHtml(orderLabel)}</strong> were updated by our team.
    </p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <p style="margin:0 0 6px;"><strong>Delivery method:</strong> ${escapeHtml(deliveryMethodLabel)}</p>
      ${courierMarkup}
      ${trackingMarkup}
      <p style="margin:0 0 6px;"><strong>Shipping:</strong> ${shippingLabel}</p>
      <p style="margin:0;"><strong>Total:</strong> ${totalLabel}</p>
    </div>
    <p style="margin:0 0 6px;"><strong>Delivery address</strong></p>
    ${addressMarkup}
    <p style="margin:16px 0 0;">If this looks incorrect, reply to this email and we will help immediately.</p>
  `;
  return wrapEmail({
    title: "Delivery details updated",
    subtitle: "Your order delivery details were changed.",
    body,
  });
}

function buildPreorderListEmailHtml({
  customer = {},
  orderNumber = "",
  preorderSendMonth = "",
  items = [],
}) {
  const customerName = escapeHtml(customer.fullName || "there");
  const orderLabel = escapeHtml(orderNumber || "Your order");
  const sendMonthLabel = formatPreorderSendMonth(preorderSendMonth) || preorderSendMonth || "the upcoming dispatch window";
  const preorderItems = (Array.isArray(items) ? items : [])
    .filter((item) => item && item.metadata?.type === "product")
    .map((item) => `<li>${escapeHtml(item.name || "Pre-order item")}</li>`)
    .join("");
  const itemsMarkup = preorderItems ?
    `<p style="margin:12px 0 6px;"><strong>Items on pre-order:</strong></p><ul style="margin:0;padding-left:18px;">${preorderItems}</ul>`
    : "";
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${orderLabel}</strong>
    </div>
    <p style="margin:0 0 12px;">
      This order is on our <strong>pre-order list</strong> and will be shipped out in <strong>${escapeHtml(sendMonthLabel)}</strong>.
    </p>
    ${itemsMarkup}
    <p style="margin:16px 0 0;">Thank you for your patience and support.</p>
  `;
  return wrapEmail({ title: "Pre-order update", subtitle: "Shipping month confirmed.", body });
}

function buildSubscriptionInvoiceEmailHtml({
  subscription = {},
  invoice = {},
  payLinkUrl = "",
  invoiceDownloadUrl = "",
} = {}) {
  const customerName = escapeHtml(subscription.customer?.fullName || "there");
  const planLabel = buildSubscriptionPlanLabel(subscription, invoice);
  const cycleLabel =
    formatSubscriptionCycleLabel(invoice.cycleMonth) ||
    "the current billing cycle";
  const invoiceNumberLabel = buildSubscriptionInvoiceNumber({
    invoice,
    invoiceId: invoice?.invoiceId || "",
    cycleMonth: invoice?.cycleMonth || "",
  });
  const invoiceFinancials = resolveSubscriptionInvoiceFinancialSnapshot(invoice);
  const invoiceType = normalizeSubscriptionInvoiceType(invoiceFinancials.invoiceType);
  const amountLabel = formatCurrency(Number(invoiceFinancials.amount || 0));
  const baseAmountLabel = formatCurrency(Number(invoiceFinancials.baseAmount || 0));
  const adjustmentsTotalLabel = formatCurrency(Number(invoiceFinancials.adjustmentsTotal || 0));
  const perDeliveryAmount = Number(
    resolveSubscriptionRecurringAmount(subscription) ||
      invoice?.perDeliveryAmount ||
      invoice?.monthlyAmount ||
      0,
  );
  const schedule = invoice?.deliverySchedule || {};
  const totalDeliveries = Number(schedule?.totalDeliveries || 0);
  const includedDeliveries = Number(
    schedule?.includedDeliveries ||
      (Array.isArray(schedule?.includedDeliveryDates) ? schedule.includedDeliveryDates.length : 0),
  );
  const cycleAmount = roundMoney(
    Number(invoice?.cycleAmount || perDeliveryAmount * (totalDeliveries || includedDeliveries || 0)),
  );
  const perDeliveryAmountLabel = formatCurrency(
    Number(
      perDeliveryAmount,
    ),
  );
  const deliverySlotsLabel = formatMondaySlotList(schedule?.slots || []);
  const deliveryDatesLabel = formatDeliveryDateListForEmail(
    schedule?.includedDeliveryDates || schedule?.cycleDeliveryDates || [],
  );
  const cycleAmountLabel = formatCurrency(cycleAmount);
  const adjustmentsMarkup = invoiceFinancials.adjustments.length
    ? `
      <p style="margin:0 0 6px;"><strong>Adjustments</strong></p>
      <ul style="margin:0 0 10px;padding-left:18px;">
        ${invoiceFinancials.adjustments
          .map((entry) =>
            `<li>${escapeHtml(formatSubscriptionAdjustmentLineLabel(entry))}: ${escapeHtml(
              formatCurrency(Number(entry?.amount || 0)),
            )}</li>`,
          )
          .join("")}
      </ul>
    `
    : "";
  const prorationRatio = Number(invoice?.prorationRatio || invoice?.proration?.ratio || 0);
  const prorationRatioLabel =
    Number.isFinite(prorationRatio) && prorationRatio > 0
      ? `${(prorationRatio * 100).toFixed(2)}%`
      : "";
  const billingNote = invoiceType === SUBSCRIPTION_INVOICE_TYPES.TOPUP
    ? `This is an additional top-up invoice for ${escapeHtml(cycleLabel)}.`
    : invoice?.isProrated
    ? `This amount is prorated for ${includedDeliveries}/${totalDeliveries || includedDeliveries} delivery slot(s) in ${escapeHtml(cycleLabel)} (${escapeHtml(prorationRatioLabel || "pro rata")}).`
    : `This invoice covers ${escapeHtml(cycleLabel)} at full cycle pricing.`;
  const actionMarkup = payLinkUrl
    ? `
      <div style="margin:16px 0;">
        <a href="${escapeHtml(payLinkUrl)}" style="display:inline-block;padding:12px 20px;background:${EMAIL_BRAND.primary};color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">
          Pay now
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:12px;color:${EMAIL_BRAND.muted};">
        If the button does not work, copy this link:<br/>
        <a href="${escapeHtml(payLinkUrl)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;word-break:break-all;">${escapeHtml(payLinkUrl)}</a>
      </p>
    `
    : "";
  const invoiceDownloadMarkup = invoiceDownloadUrl
    ? `
      <div style="margin:10px 0 14px;">
        <a href="${escapeHtml(invoiceDownloadUrl)}" style="display:inline-block;padding:10px 18px;background:${EMAIL_BRAND.accent};color:${EMAIL_BRAND.text};text-decoration:none;border-radius:999px;font-weight:700;">
          Download invoice PDF
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:12px;color:${EMAIL_BRAND.muted};">
        Keep this invoice for your records.
      </p>
    `
    : "";

  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 12px;">Your flower subscription invoice is ready.</p>
    <div style="padding:14px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <p style="margin:0 0 6px;"><strong>Invoice:</strong> ${escapeHtml(invoiceNumberLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Type:</strong> ${escapeHtml(formatSubscriptionInvoiceTypeLabel(invoiceType))}</p>
      <p style="margin:0 0 6px;"><strong>Plan:</strong> ${escapeHtml(planLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Billing cycle:</strong> ${escapeHtml(cycleLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Invoice amount:</strong> ${escapeHtml(amountLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Base amount:</strong> ${escapeHtml(baseAmountLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Adjustments:</strong> ${escapeHtml(adjustmentsTotalLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Price per delivery:</strong> ${escapeHtml(perDeliveryAmountLabel)}</p>
      <p style="margin:0;"><strong>Full cycle total:</strong> ${escapeHtml(cycleAmountLabel)}</p>
    </div>
    ${adjustmentsMarkup}
    ${
      deliverySlotsLabel
        ? `<p style="margin:0 0 8px;"><strong>Delivery slots:</strong> ${escapeHtml(deliverySlotsLabel)}</p>`
        : ""
    }
    ${
      deliveryDatesLabel
        ? `<p style="margin:0 0 8px;"><strong>Deliveries in this invoice:</strong> ${escapeHtml(deliveryDatesLabel)}</p>`
        : ""
    }
    <p style="margin:0 0 14px;">${billingNote}</p>
    ${actionMarkup}
    ${invoiceDownloadMarkup}
    <p style="margin:16px 0 0;">Payments are manual only. We will send a new invoice at the start of each month while your subscription is active.</p>
  `;

  return wrapEmail({
    title: "Subscription invoice",
    subtitle: "Flower delivery plan - manual PayFast payment",
    body,
  });
}

function buildSubscriptionEftInvoiceEmailHtml({
  subscription = {},
  invoice = {},
  invoiceDownloadUrl = "",
} = {}) {
  const customerName = escapeHtml(subscription.customer?.fullName || "there");
  const planLabel = buildSubscriptionPlanLabel(subscription, invoice);
  const cycleLabel =
    formatSubscriptionCycleLabel(invoice.cycleMonth) ||
    "the current billing cycle";
  const invoiceNumberLabel = buildSubscriptionInvoiceNumber({
    invoice,
    invoiceId: invoice?.invoiceId || "",
    cycleMonth: invoice?.cycleMonth || "",
  });
  const invoiceFinancials = resolveSubscriptionInvoiceFinancialSnapshot(invoice);
  const invoiceType = normalizeSubscriptionInvoiceType(invoiceFinancials.invoiceType);
  const invoiceAmountLabel = formatCurrency(Number(invoiceFinancials.amount || 0));
  const baseAmountLabel = formatCurrency(Number(invoiceFinancials.baseAmount || 0));
  const adjustmentsTotalLabel = formatCurrency(Number(invoiceFinancials.adjustmentsTotal || 0));
  const perDeliveryAmount = Number(
    resolveSubscriptionRecurringAmount(subscription) ||
      invoice?.perDeliveryAmount ||
      invoice?.monthlyAmount ||
      0,
  );
  const schedule = invoice?.deliverySchedule || {};
  const totalDeliveries = Number(schedule?.totalDeliveries || 0);
  const cycleAmount = roundMoney(
    Number(invoice?.cycleAmount || perDeliveryAmount * totalDeliveries),
  );
  const deliverySlotsLabel = formatMondaySlotList(schedule?.slots || []);
  const deliveryDatesLabel = formatDeliveryDateListForEmail(
    schedule?.includedDeliveryDates || schedule?.cycleDeliveryDates || [],
  );
  const adjustmentsMarkup = invoiceFinancials.adjustments.length
    ? `
      <p style="margin:0 0 6px;"><strong>Adjustments</strong></p>
      <ul style="margin:0 0 10px;padding-left:18px;">
        ${invoiceFinancials.adjustments
          .map((entry) =>
            `<li>${escapeHtml(formatSubscriptionAdjustmentLineLabel(entry))}: ${escapeHtml(
              formatCurrency(Number(entry?.amount || 0)),
            )}</li>`,
          )
          .join("")}
      </ul>
    `
    : "";
  const details = getEftBankDetails();
  const invoiceReference = `Subscription ${invoiceNumberLabel}`;
  const invoiceDownloadMarkup = invoiceDownloadUrl
    ? `
      <div style="margin:10px 0 14px;">
        <a href="${escapeHtml(invoiceDownloadUrl)}" style="display:inline-block;padding:10px 18px;background:${EMAIL_BRAND.accent};color:${EMAIL_BRAND.text};text-decoration:none;border-radius:999px;font-weight:700;">
          Download invoice PDF
        </a>
      </div>
    `
    : "";

  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 12px;">Your subscription invoice is ready for EFT payment and awaits admin approval once paid.</p>
    <div style="padding:14px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <p style="margin:0 0 6px;"><strong>Invoice:</strong> ${escapeHtml(invoiceNumberLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Type:</strong> ${escapeHtml(formatSubscriptionInvoiceTypeLabel(invoiceType))}</p>
      <p style="margin:0 0 6px;"><strong>Plan:</strong> ${escapeHtml(planLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Billing cycle:</strong> ${escapeHtml(cycleLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Amount due now:</strong> ${escapeHtml(invoiceAmountLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Base amount:</strong> ${escapeHtml(baseAmountLabel)}</p>
      <p style="margin:0 0 6px;"><strong>Adjustments:</strong> ${escapeHtml(adjustmentsTotalLabel)}</p>
      <p style="margin:0;"><strong>Full cycle total:</strong> ${escapeHtml(formatCurrency(cycleAmount))}</p>
    </div>
    ${adjustmentsMarkup}
    ${
      deliverySlotsLabel
        ? `<p style="margin:0 0 8px;"><strong>Delivery slots:</strong> ${escapeHtml(deliverySlotsLabel)}</p>`
        : ""
    }
    ${
      deliveryDatesLabel
        ? `<p style="margin:0 0 8px;"><strong>Deliveries in this invoice:</strong> ${escapeHtml(deliveryDatesLabel)}</p>`
        : ""
    }
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin:16px 0;">
      <p style="margin:0 0 6px;"><strong>Account name:</strong> ${escapeHtml(details.accountName)}</p>
      <p style="margin:0 0 6px;"><strong>Bank:</strong> ${escapeHtml(details.bankName)}</p>
      <p style="margin:0 0 6px;"><strong>Account type:</strong> ${escapeHtml(details.accountType)}</p>
      <p style="margin:0 0 6px;"><strong>Account number:</strong> ${escapeHtml(details.accountNumber)}</p>
      <p style="margin:0 0 6px;"><strong>Branch code:</strong> ${escapeHtml(details.branchCode)}</p>
      <p style="margin:0;"><strong>Reference (must match exactly):</strong> ${escapeHtml(invoiceReference)}</p>
      ${buildEftReferenceNoticeHtml(invoiceReference)}
    </div>
    ${invoiceDownloadMarkup}
    <p style="margin:10px 0 0;">After transfer, upload proof of payment from your account (optional) and our admin team will approve payment manually.</p>
    <p style="margin:8px 0 0;font-size:13px;color:${EMAIL_BRAND.muted};">
      Need help with EFT payment? Contact ${escapeHtml(details.supportEmail)}.
    </p>
  `;

  return wrapEmail({
    title: "Subscription EFT invoice",
    subtitle: "Manual EFT payment with admin approval",
    body,
  });
}

function buildSubscriptionSignupConfirmationEmailHtml({
  subscription = {},
  firstBillingMonth = "",
} = {}) {
  const customerName = escapeHtml(subscription.customer?.fullName || "there");
  const planLabel = escapeHtml(buildSubscriptionPlanLabel(subscription, {}));
  const perDeliveryAmountLabel = escapeHtml(
    formatCurrency(Number(resolveSubscriptionRecurringAmount(subscription) || 0)),
  );
  const addressLines = formatSubscriptionAddressLines(subscription.address || {}).map((line) =>
    escapeHtml(line),
  );
  const addressMarkup = addressLines.length
    ? `<ul style="margin:0;padding-left:18px;">${addressLines.map((line) => `<li>${line}</li>`).join("")}</ul>`
    : "<p style=\"margin:0;\">No delivery address on file yet.</p>";
  const firstCycleLabel = escapeHtml(
    formatSubscriptionCycleLabel(firstBillingMonth) || "next month",
  );
  const firstPaymentOpensLabel = escapeHtml(
    formatSubscriptionBillingOpenLabel(firstBillingMonth),
  );
  const body = `
    <p style="margin:0 0 14px;">Hi ${customerName},</p>
    <p style="margin:0 0 12px;">Your flower subscription has been created successfully.</p>
    <div style="padding:14px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <p style="margin:0 0 6px;"><strong>Plan:</strong> ${planLabel}</p>
      <p style="margin:0 0 6px;"><strong>Price per delivery:</strong> ${perDeliveryAmountLabel}</p>
      <p style="margin:0 0 6px;"><strong>First billing cycle:</strong> ${firstCycleLabel}</p>
      <p style="margin:0;"><strong>First payment opens:</strong> ${firstPaymentOpensLabel}</p>
    </div>
    <p style="margin:0 0 10px;">
      Your signup month is not billed and no deliveries are scheduled for this month.
      Billing starts from the following month.
    </p>
    <p style="margin:0 0 6px;"><strong>Delivery address</strong></p>
    ${addressMarkup}
    <p style="margin:16px 0 0;">Payments remain manual via PayFast pay links sent by email.</p>
  `;

  return wrapEmail({
    title: "Subscription confirmed",
    subtitle: "Your billing starts next month",
    body,
  });
}

function buildGiftCardDeliveryCustomerEmailHtml({ order = {}, orderId = "", giftCards = [] } = {}) {
  const customerName = escapeHtml(order.customer?.fullName || "there");
  const orderLabel = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const cardRows = giftCards
    .map((entry) => {
      const optionList = normalizeGiftCardSelectedOptions(entry.selectedOptions)
        .map((option) => {
          const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 1);
          const amount = escapeHtml(formatCurrency(option.amount || 0));
          if (quantity <= 1) {
            return `${escapeHtml(option.label)} (${amount})`;
          }
          return `${escapeHtml(option.label)} x${quantity} (${amount} each)`;
        })
        .join(", ");
      const optionsHtml = optionList
        ? `<p style="margin:6px 0 0;font-size:13px;color:${EMAIL_BRAND.muted};"><strong>Options:</strong> ${optionList}</p>`
        : "";
      const messageHtml = entry.message
        ? `<p style="margin:6px 0 0;font-size:13px;color:${EMAIL_BRAND.muted};"><strong>Message:</strong> ${escapeHtml(entry.message)}</p>`
        : "";
      return `
        <div style="padding:12px 14px;border-radius:14px;border:1px solid ${EMAIL_BRAND.border};margin-bottom:10px;background:rgba(245,234,215,0.45);">
          <p style="margin:0 0 4px;"><strong>${escapeHtml(entry.code || "Gift card")}</strong> - ${escapeHtml(
            formatCurrency(entry.value || 0),
          )}</p>
          <p style="margin:0 0 4px;"><strong>Recipient:</strong> ${escapeHtml(entry.recipientName || "Gift recipient")}</p>
          <p style="margin:0 0 4px;"><strong>Expiry:</strong> ${escapeHtml(formatGiftCardDate(entry.expiresAt) || "N/A")}</p>
          <p style="margin:0 0 4px;">
            <a href="${escapeHtml(entry.accessUrl)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;font-weight:700;">View / print gift card</a>
          </p>
          <p style="margin:0;">
            <a href="${escapeHtml(entry.downloadUrl)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">Download PDF</a>
          </p>
          ${optionsHtml}
          ${messageHtml}
        </div>
      `;
    })
    .join("");

  const body = `
    <p style="margin:0 0 14px;">Hi ${customerName},</p>
    <p style="margin:0 0 12px;">
      Your payment was successful and your gift card${giftCards.length === 1 ? "" : "s"} for
      <strong> ${escapeHtml(orderLabel)}</strong> are ready.
    </p>
    ${cardRows || "<p style=\"margin:0;\">No gift cards were generated for this order.</p>"}
    <p style="margin:12px 0 0;">Each card is downloadable, printable, and includes short terms and expiry details.</p>
  `;

  return wrapEmail({
    title: "Your gift card is ready",
    subtitle: "Download, print, or share instantly.",
    body,
  });
}

function buildGiftCardDeliveryAdminEmailHtml({ order = {}, orderId = "", giftCards = [] } = {}) {
  const orderLabel = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const rows = giftCards
    .map((entry) => {
      const optionSummary = normalizeGiftCardSelectedOptions(entry.selectedOptions)
        .map((option) => {
          const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 1);
          const amount = escapeHtml(formatCurrency(option.amount || 0));
          if (quantity <= 1) {
            return `${escapeHtml(option.label)} (${amount})`;
          }
          return `${escapeHtml(option.label)} x${quantity} (${amount} each)`;
        })
        .join(", ");
      return `
        <div style="padding:10px 12px;border-radius:12px;border:1px solid ${EMAIL_BRAND.border};margin-bottom:8px;">
          <p style="margin:0 0 4px;"><strong>${escapeHtml(entry.code || "Gift card")}</strong> - ${escapeHtml(
            formatCurrency(entry.value || 0),
          )}</p>
          <p style="margin:0 0 4px;"><strong>Recipient:</strong> ${escapeHtml(entry.recipientName || "N/A")}</p>
          <p style="margin:0 0 4px;"><strong>Purchased by:</strong> ${escapeHtml(entry.purchaserName || "N/A")}</p>
          <p style="margin:0 0 4px;"><strong>Expiry:</strong> ${escapeHtml(formatGiftCardDate(entry.expiresAt) || "N/A")}</p>
          <p style="margin:0 0 4px;"><strong>Options:</strong> ${optionSummary || "None"}</p>
          <p style="margin:0;"><a href="${escapeHtml(entry.accessUrl)}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">Open card</a></p>
        </div>
      `;
    })
    .join("");

  const body = `
    <p style="margin:0 0 12px;"><strong>${escapeHtml(orderLabel)}</strong> has generated ${giftCards.length} gift card${giftCards.length === 1 ? "" : "s"}.</p>
    <p style="margin:0 0 12px;"><strong>Customer:</strong> ${escapeHtml(order.customer?.fullName || "Guest")} (${escapeHtml(
      order.customer?.email || "No email",
    )})</p>
    ${rows}
  `;

  return wrapEmail({
    title: "Gift cards issued",
    subtitle: "Order gift cards were generated and delivered.",
    body,
  });
}

async function issueGiftCardsForOrder({
  orderRef = null,
  orderId = "",
  orderData = null,
  reason = "order-payment-confirmed",
} = {}) {
  const normalizedOrderId = (orderId || orderRef?.id || "").toString().trim();
  if (!normalizedOrderId) {
    return { issued: false, reason: "missing-order-id" };
  }

  const targetOrderRef = orderRef || db.doc(`orders/${normalizedOrderId}`);
  const lockResult = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(targetOrderRef);
    if (!snap.exists) return { proceed: false, reason: "order-not-found" };
    const order = snap.data() || {};
    const currentGiftCardStatus = (order?.giftCards?.status || "").toString().trim().toLowerCase();
    if (!isOrderEligibleForInventoryDeduction(order)) {
      return { proceed: false, reason: "order-not-paid" };
    }
    if (order?.giftCards?.issuedAt || currentGiftCardStatus === "issued") {
      return { proceed: false, reason: "already-issued" };
    }
    if (currentGiftCardStatus === "processing") {
      return { proceed: false, reason: "already-processing" };
    }

    const plan = buildGiftCardPlanFromOrder(order, normalizedOrderId);
    if (!plan.length) {
      return { proceed: false, reason: "no-gift-cards" };
    }

    transaction.set(
      targetOrderRef,
      {
        giftCards: {
          status: "processing",
          reason,
          startedAt: FIELD_VALUE.serverTimestamp(),
          count: plan.length,
          updatedAt: FIELD_VALUE.serverTimestamp(),
          error: null,
        },
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
    return { proceed: true, plan, order };
  });

  if (!lockResult?.proceed) {
    return {
      issued: false,
      reason: lockResult?.reason || "skipped",
    };
  }

  try {
    const order = lockResult.order || orderData || (await targetOrderRef.get()).data() || {};
    const plan = Array.isArray(lockResult.plan) ? lockResult.plan : buildGiftCardPlanFromOrder(order, normalizedOrderId);
    const bucket = admin.storage().bucket();
    const issuedCards = [];

    for (const planned of plan) {
      const giftCardId = planned.giftCardId;
      const token = createGiftCardAccessToken(giftCardId);
      const issuedAtDate = new Date();
      const expiresAtDate = new Date(
        issuedAtDate.getTime() + planned.expiryDays * 24 * 60 * 60 * 1000,
      );
      const pdfStoragePath = `gift-cards/${normalizedOrderId}/${giftCardId}.pdf`;

      const giftCardRecord = {
        id: giftCardId,
        orderId: normalizedOrderId,
        orderNumber: order.orderNumber || null,
        orderItemIndex: planned.lineIndex,
        orderItemUnit: planned.unitIndex,
        code: planned.code,
        status: "active",
        value: planned.value,
        currency: GIFT_CARD_VALUE_CURRENCY,
        purchaserName: planned.purchaserName,
        recipientName: planned.recipientName,
        message: planned.message || null,
        productId: planned.productId || null,
        productTitle: planned.productTitle || "Bethany Blooms Gift Card",
        terms: planned.terms,
        selectedOptions: planned.selectedOptions,
        selectedOptionCount: planned.selectedOptions.reduce(
          (sum, option) => sum + normalizeGiftCardOptionQuantity(option?.quantity, 1),
          0,
        ),
        expiryDays: planned.expiryDays,
        issuedAt: admin.firestore.Timestamp.fromDate(issuedAtDate),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
        pdfStoragePath,
        updatedAt: FIELD_VALUE.serverTimestamp(),
        createdAt: FIELD_VALUE.serverTimestamp(),
      };

      const pdfBytes = await createGiftCardPdfBytes({
        ...giftCardRecord,
        issuedAt: issuedAtDate,
        expiresAt: expiresAtDate,
      });
      await bucket.file(pdfStoragePath).save(pdfBytes, {
        contentType: "application/pdf",
        resumable: false,
        metadata: {
          cacheControl: "private, max-age=0, no-store",
        },
      });

      await db.collection(GIFT_CARDS_COLLECTION).doc(giftCardId).set(giftCardRecord, {
        merge: true,
      });

      issuedCards.push({
        ...giftCardRecord,
        accessUrl: buildGiftCardAccessUrl(giftCardId, token),
        downloadUrl: buildGiftCardDownloadUrl(giftCardId, token),
      });
    }

    const customerEmail = (order.customer?.email || "").toString().trim();
    let customerEmailStatus = ORDER_NOTIFICATION_STATUSES.SKIPPED;
    let customerEmailError = null;
    if (customerEmail) {
      const sendResult = await sendEmail({
        to: customerEmail,
        subject: `Bethany Blooms - Gift card${issuedCards.length === 1 ? "" : "s"} ready`,
        html: buildGiftCardDeliveryCustomerEmailHtml({
          order,
          orderId: normalizedOrderId,
          giftCards: issuedCards,
        }),
      });
      if (sendResult?.error) {
        customerEmailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
        customerEmailError = sendResult.error;
      } else {
        customerEmailStatus = ORDER_NOTIFICATION_STATUSES.SENT;
      }
    } else {
      customerEmailError = "Customer email missing.";
    }

    const adminSendResult = await sendEmail({
      to: getAdminEmail(),
      subject: `Gift cards issued - ${order.orderNumber || normalizedOrderId}`,
      html: buildGiftCardDeliveryAdminEmailHtml({
        order,
        orderId: normalizedOrderId,
        giftCards: issuedCards,
      }),
    });
    const adminEmailStatus = adminSendResult?.error
      ? ORDER_NOTIFICATION_STATUSES.FAILED
      : ORDER_NOTIFICATION_STATUSES.SENT;

    await targetOrderRef.set(
      {
        giftCards: {
          status: "issued",
          reason,
          count: issuedCards.length,
          issuedAt: FIELD_VALUE.serverTimestamp(),
          updatedAt: FIELD_VALUE.serverTimestamp(),
          customerEmailStatus,
          customerEmailError: customerEmailError || null,
          adminEmailStatus,
          adminEmailError: adminSendResult?.error || null,
          cards: issuedCards.map((entry) => ({
            id: entry.id,
            code: entry.code,
            recipientName: entry.recipientName,
            purchaserName: entry.purchaserName,
            value: entry.value,
            currency: entry.currency,
            selectedOptionCount: entry.selectedOptionCount,
            expiresAt: entry.expiresAt,
          })),
        },
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      issued: true,
      count: issuedCards.length,
      orderId: normalizedOrderId,
    };
  } catch (error) {
    functions.logger.error("Gift card issuance failed", {
      orderId: normalizedOrderId,
      message: error?.message || error,
      stack: error?.stack || null,
    });
    await targetOrderRef.set(
      {
        giftCards: {
          status: "failed",
          error: truncateText(error?.message || "Gift card issuance failed.", 900),
          updatedAt: FIELD_VALUE.serverTimestamp(),
        },
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
    return {
      issued: false,
      orderId: normalizedOrderId,
      reason: "failed",
      error: error?.message || "Gift card issuance failed.",
    };
  }
}

function buildTestOrderPayload() {
  return {
    orderNumber: "BB-1042",
    customer: {
      fullName: "Ava Jacobs",
      email: "ava@example.com",
      phone: "+27 82 123 4567",
      address: "12 Bloom Lane, Rosebank, Johannesburg",
    },
    items: [
      {
        name: "Garden Rose Bouquet",
        quantity: 1,
        price: 680,
        metadata: { variantLabel: "Signature size" },
      },
      {
        name: "Seasonal Stem Bundle",
        quantity: 2,
        price: 220,
        metadata: { type: "cut-flower", optionLabel: "Neutrals mix" },
      },
    ],
    totalPrice: 1120,
    subtotal: 1120,
  };
}

function buildTestEftOrderPayload() {
  const order = buildTestOrderPayload();
  return {
    ...order,
    status: "pending-payment-approval",
    paymentMethod: "eft",
    paymentStatus: "awaiting-approval",
    paymentApprovalStatus: "pending",
    paymentApproval: {
      required: true,
      decision: "pending",
      decidedAt: null,
      decidedByUid: null,
      decidedByEmail: null,
      note: null,
    },
    paymentProof: {
      fileName: "proof-of-payment.pdf",
      storagePath: "eftProofs/demo/proof-of-payment.pdf",
      contentType: "application/pdf",
      size: 182450,
    },
  };
}

function buildTestSalePayload() {
  return {
    receiptNumber: "POS-5521",
    customer: {
      name: "Lerato M.",
      email: "lerato@example.com",
      phone: "+27 82 987 6543",
    },
    items: [
      {
        name: "Florist apron",
        quantity: 1,
        price: 450,
      },
      {
        name: "Bud vase",
        quantity: 2,
        price: 120,
      },
    ],
    total: 690,
    paymentMethod: "card",
    discount: { amount: 50, type: "percent", value: 10 },
  };
}

function buildTestContactPayload() {
  return {
    name: "Sipho Nkosi",
    email: "sipho@example.com",
    phone: "+27 83 000 1122",
    topic: "Wedding florals",
    timeline: "September 2026",
    message: "We love your romantic style. Can we book a consult for a 120-guest wedding?",
  };
}

function buildTestCutFlowerPayload() {
  return {
    customerName: "Maya Singh",
    email: "maya@example.com",
    phone: "+27 82 555 8811",
    occasion: "Brand launch",
    location: "Kramerville, JHB",
    eventDate: "2026-04-18",
    sessionLabel: "Afternoon",
    attendeeCount: "24",
    optionLabel: "Build-your-own bar",
    notes: "We need on-site setup by 2pm.",
  };
}

function buildTestWorkshopPayload() {
  return {
    fullName: "Nadia van Wyk",
    email: "nadia@example.com",
    phone: "+27 82 444 2299",
    workshopTitle: "Spring Floral Masterclass",
    sessionLabel: "Saturday AM",
    sessionDateLabel: "May 10, 2026",
    attendeeCount: "2",
    notes: "Celebrating a birthday.",
  };
}

function buildTestOrderStatusPayload() {
  return {
    customer: { fullName: "Ava Jacobs" },
    status: "order-ready-for-shipping",
    orderNumber: "Order #BB-1042",
    trackingLink: "https://tracking.example.com/BB-1042",
  };
}

function buildTestOrderDeliveryUpdatePayload() {
  const order = buildTestOrderPayload();
  return {
    ...order,
    deliveryMethod: "courier",
    courierName: "The Courier Guy",
    trackingLink: "https://tracking.example.com/BB-1042-updated",
    shippingCost: 140,
    totalPrice: 1260,
    shippingAddress: {
      street: "22 Rose Crescent",
      suburb: "Parkhurst",
      city: "Johannesburg",
      province: "Gauteng",
      postalCode: "2193",
    },
    shipping: {
      courierId: "courier-demo",
      courierName: "The Courier Guy",
      courierPrice: 140,
      province: "Gauteng",
    },
  };
}

function buildTestAccountWelcomePayload() {
  return {
    fullName: "Ava Jacobs",
    accountUrl: `${getCanonicalSiteUrl()}/account`,
  };
}

function buildTestEmailContent({ templateType = "custom", subject = "", html = "" }) {
  const type = templateType.toString().trim().toLowerCase();
  switch (type) {
    case "order-confirmation": {
      const order = buildTestOrderPayload();
      return {
        subject: `Bethany Blooms - Order ${order.orderNumber}`,
        html: buildOrderEmailHtml(order, "test-order"),
      };
    }
    case "order-admin": {
      const order = buildTestOrderPayload();
      return {
        subject: `New order received - ${order.orderNumber}`,
        html: buildOrderAdminEmailHtml(order, "test-order"),
      };
    }
    case "eft-pending-customer": {
      const order = buildTestEftOrderPayload();
      return {
        subject: `Bethany Blooms - EFT order received (${order.orderNumber})`,
        html: buildEftPendingCustomerEmailHtml(order, "test-order"),
      };
    }
    case "eft-pending-admin": {
      const order = buildTestEftOrderPayload();
      return {
        subject: `EFT payment approval needed - ${order.orderNumber}`,
        html: buildEftPendingAdminEmailHtml(order, "test-order"),
      };
    }
    case "eft-approved-customer": {
      const order = {
        ...buildTestEftOrderPayload(),
        status: "order-placed",
        paymentStatus: "paid",
        paymentApprovalStatus: "approved",
        paymentApproval: {
          required: true,
          decision: "approved",
          decidedAt: new Date("2026-02-03T09:15:00.000Z"),
          decidedByUid: "demo-admin-uid",
          decidedByEmail: "admin@bethanyblooms.co.za",
          note: "Payment verified. Thank you!",
        },
      };
      return {
        subject: "Bethany Blooms - EFT payment approved",
        html: buildEftDecisionCustomerEmailHtml({
          order,
          orderId: "test-order",
          decision: "approved",
          note: "Payment verified. Thank you!",
        }),
      };
    }
    case "eft-approved-admin": {
      const order = {
        ...buildTestEftOrderPayload(),
        status: "order-placed",
        paymentStatus: "paid",
        paymentApprovalStatus: "approved",
      };
      return {
        subject: `EFT payment approved - ${order.orderNumber}`,
        html: buildEftDecisionAdminEmailHtml({
          order,
          orderId: "test-order",
          decision: "approved",
          note: "Payment verified. Thank you!",
        }),
      };
    }
    case "eft-rejected-customer": {
      const order = {
        ...buildTestEftOrderPayload(),
        status: "payment-rejected",
        paymentStatus: "rejected",
        paymentApprovalStatus: "rejected",
      };
      return {
        subject: "Bethany Blooms - EFT payment rejected",
        html: buildEftDecisionCustomerEmailHtml({
          order,
          orderId: "test-order",
          decision: "rejected",
          note: "Payment reference mismatch. Please contact support.",
        }),
      };
    }
    case "eft-rejected-admin": {
      const order = {
        ...buildTestEftOrderPayload(),
        status: "payment-rejected",
        paymentStatus: "rejected",
        paymentApprovalStatus: "rejected",
      };
      return {
        subject: `EFT payment rejected - ${order.orderNumber}`,
        html: buildEftDecisionAdminEmailHtml({
          order,
          orderId: "test-order",
          decision: "rejected",
          note: "Payment reference mismatch. Customer asked to retry EFT.",
        }),
      };
    }
    case "order-status": {
      const payload = buildTestOrderStatusPayload();
      return {
        subject: `Bethany Blooms - ${payload.orderNumber} update`,
        html: buildOrderStatusEmailHtml(payload),
      };
    }
    case "order-delivery-update": {
      const payload = buildTestOrderDeliveryUpdatePayload();
      return {
        subject: `Bethany Blooms - Delivery update for Order #${payload.orderNumber}`,
        html: buildOrderDeliveryUpdateEmailHtml(payload, "test-order"),
      };
    }
    case "pos-receipt": {
      const sale = buildTestSalePayload();
      return {
        subject: `Bethany Blooms - Receipt ${sale.receiptNumber}`,
        html: buildPosReceiptHtml(sale, "test-receipt"),
      };
    }
    case "pos-admin": {
      const sale = buildTestSalePayload();
      return {
        subject: `POS sale - Receipt ${sale.receiptNumber}`,
        html: buildPosReceiptAdminHtml(sale, "test-receipt"),
      };
    }
    case "contact-admin": {
      const contact = buildTestContactPayload();
      return {
        subject: `New enquiry from ${contact.name}`,
        html: buildContactEmailHtml(contact),
      };
    }
    case "contact-confirm": {
      const contact = buildTestContactPayload();
      return {
        subject: "We received your message",
        html: buildContactConfirmationHtml(contact),
      };
    }
    case "cut-flower-admin": {
      const booking = buildTestCutFlowerPayload();
      return {
        subject: `New cut flower booking - ${booking.customerName}`,
        html: buildCutFlowerAdminEmailHtml(booking),
      };
    }
    case "cut-flower-customer": {
      const booking = buildTestCutFlowerPayload();
      return {
        subject: "Bethany Blooms - Cut flower booking received",
        html: buildCutFlowerCustomerHtml(booking),
      };
    }
    case "workshop-admin": {
      const booking = buildTestWorkshopPayload();
      return {
        subject: `New workshop booking - ${booking.fullName}`,
        html: buildWorkshopAdminEmailHtml(booking),
      };
    }
    case "workshop-customer": {
      const booking = buildTestWorkshopPayload();
      return {
        subject: "Bethany Blooms - Workshop booking received",
        html: buildWorkshopCustomerHtml(booking),
      };
    }
    case "account-welcome": {
      const payload = buildTestAccountWelcomePayload();
      return {
        subject: "Bethany Blooms - Welcome to your account",
        html: buildAccountWelcomeEmailHtml(payload),
      };
    }
    case "custom":
    default: {
      const safeSubject = subject || "Bethany Blooms test email";
      const safeBody = html || "<p>This is a test message from Bethany Blooms.</p>";
      return {
        subject: safeSubject,
        html: wrapEmail({
          title: "Test email",
          subtitle: "Bethany Blooms preview",
          body: safeBody,
        }),
      };
    }
  }
}

function buildCutFlowerBookingHtml(booking = {}) {
  return `
    <p style="margin:0 0 6px;"><strong>Customer:</strong> ${escapeHtml(booking.customerName || booking.fullName || "Guest")}</p>
    <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(booking.email || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Phone:</strong> ${escapeHtml(booking.phone || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Occasion:</strong> ${escapeHtml(booking.occasion || "Cut flower booking")}</p>
    <p style="margin:0 0 6px;"><strong>Location:</strong> ${escapeHtml(booking.location || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Date:</strong> ${escapeHtml(booking.eventDate || "TBC")}</p>
    <p style="margin:0 0 6px;"><strong>Session:</strong> ${escapeHtml(booking.sessionLabel || "TBC")}</p>
    <p style="margin:0 0 6px;"><strong>Attendees:</strong> ${escapeHtml(booking.attendeeCount || "1")}</p>
    <p style="margin:0 0 6px;"><strong>Option:</strong> ${escapeHtml(booking.optionLabel || "Standard")}</p>
    <p style="margin:0;"><strong>Notes:</strong> ${escapeHtml(booking.notes || "None")}</p>
  `;
}

function buildCutFlowerAdminEmailHtml(booking = {}) {
  const body = `
    <div style="padding:14px 16px;border-radius:14px;background:rgba(245,234,215,0.6);">
      ${buildCutFlowerBookingHtml(booking)}
    </div>
  `;
  return wrapEmail({ title: "New cut flower booking", subtitle: "A new request has arrived.", body });
}

function buildCutFlowerCustomerHtml(booking = {}) {
  const name = escapeHtml(booking.customerName || booking.fullName || "there");
  const body = `
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 16px;">Thanks for your booking request with Bethany Blooms. Here are the details we received:</p>
    <div style="padding:14px 16px;border-radius:14px;background:rgba(245,234,215,0.6);">
      ${buildCutFlowerBookingHtml(booking)}
    </div>
    <p style="margin:16px 0 0;">We will be in touch shortly to confirm availability and next steps.</p>
  `;
  return wrapEmail({ title: "Cut flower booking received", subtitle: "We are reviewing your request.", body });
}

function buildWorkshopBookingHtml(booking = {}) {
  return `
    <p style="margin:0 0 6px;"><strong>Customer:</strong> ${escapeHtml(booking.fullName || "Guest")}</p>
    <p style="margin:0 0 6px;"><strong>Email:</strong> ${escapeHtml(booking.email || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Phone:</strong> ${escapeHtml(booking.phone || "Not provided")}</p>
    <p style="margin:0 0 6px;"><strong>Workshop:</strong> ${escapeHtml(booking.workshopTitle || "Workshop")}</p>
    <p style="margin:0 0 6px;"><strong>Session:</strong> ${escapeHtml(booking.sessionLabel || "TBC")}</p>
    <p style="margin:0 0 6px;"><strong>Date:</strong> ${escapeHtml(booking.sessionDateLabel || booking.sessionDate || "TBC")}</p>
    <p style="margin:0 0 6px;"><strong>Attendees:</strong> ${escapeHtml(booking.attendeeCount || "1")}</p>
    <p style="margin:0;"><strong>Notes:</strong> ${escapeHtml(booking.notes || "None")}</p>
  `;
}

function buildWorkshopAdminEmailHtml(booking = {}) {
  const body = `
    <div style="padding:14px 16px;border-radius:14px;background:rgba(245,234,215,0.6);">
      ${buildWorkshopBookingHtml(booking)}
    </div>
  `;
  return wrapEmail({ title: "New workshop booking", subtitle: "A new workshop request has arrived.", body });
}

function buildWorkshopCustomerHtml(booking = {}) {
  const name = escapeHtml(booking.fullName || "there");
  const body = `
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 16px;">Thanks for your workshop booking with Bethany Blooms. Here are the details we received:</p>
    <div style="padding:14px 16px;border-radius:14px;background:rgba(245,234,215,0.6);">
      ${buildWorkshopBookingHtml(booking)}
    </div>
    <p style="margin:16px 0 0;">We will be in touch shortly to confirm availability and next steps.</p>
  `;
  return wrapEmail({ title: "Workshop booking received", subtitle: "Thank you for reserving a spot.", body });
}

function isAdminContext(auth) {
  return (auth?.token?.role || "").toString().toLowerCase() === "admin";
}

async function assertCustomerSubscriptionRequest(auth = {}) {
  const uid = (auth?.uid || "").toString().trim();
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in to manage subscriptions.");
  }
  if (isAdminContext(auth)) {
    throw new HttpsError(
      "permission-denied",
      "Subscriptions are available for customer accounts only.",
    );
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const storedRole = (userSnap.data()?.role || "").toString().trim().toLowerCase();
  if (storedRole === "admin") {
    throw new HttpsError(
      "permission-denied",
      "Subscriptions are available for customer accounts only.",
    );
  }

  return uid;
}

async function assertAdminRequest(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in as an admin to perform this action.");
  }
  if (isAdminContext(request.auth)) {
    return true;
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const storedRole = (userSnap.data()?.role || "").toString().toLowerCase();
  if (storedRole === "admin") {
    return true;
  }

  throw new HttpsError("permission-denied", "Admin role required.");
}

async function getNextOrderNumber() {
  const counterRef = db.doc("config/orderCounter");
  const invoiceCounterRef = db.doc("config/invoiceCounter");
  return db.runTransaction(async (transaction) => {
    const [orderSnapshot, invoiceSnapshot] = await Promise.all([
      transaction.get(counterRef),
      transaction.get(invoiceCounterRef),
    ]);
    const currentOrder = orderSnapshot.exists ? Number(orderSnapshot.data().value) : 999;
    const currentInvoice = invoiceSnapshot.exists ? Number(invoiceSnapshot.data().value) : 999;
    const safeOrder = Number.isFinite(currentOrder) ? currentOrder : 999;
    const safeInvoice = Number.isFinite(currentInvoice) ? currentInvoice : 999;
    const nextOrder = Math.max(safeOrder, safeInvoice) + 1;
    transaction.set(counterRef, { value: nextOrder }, { merge: true });
    transaction.set(invoiceCounterRef, { value: nextOrder }, { merge: true });
    return nextOrder;
  });
}

async function getNextInvoiceNumber() {
  const orderCounterRef = db.doc("config/orderCounter");
  const invoiceCounterRef = db.doc("config/invoiceCounter");
  return db.runTransaction(async (transaction) => {
    const [orderSnapshot, invoiceSnapshot] = await Promise.all([
      transaction.get(orderCounterRef),
      transaction.get(invoiceCounterRef),
    ]);
    const currentOrder = orderSnapshot.exists ? Number(orderSnapshot.data().value) : 999;
    const currentInvoice = invoiceSnapshot.exists ? Number(invoiceSnapshot.data().value) : 999;
    const safeOrder = Number.isFinite(currentOrder) ? currentOrder : 999;
    const safeInvoice = Number.isFinite(currentInvoice) ? currentInvoice : 999;
    const nextInvoice = Math.max(safeOrder, safeInvoice) + 1;
    transaction.set(invoiceCounterRef, { value: nextInvoice }, { merge: true });
    return nextInvoice;
  });
}

function buildBookingData(item, customer = {}, orderId) {
  const frameValue =
    (item.metadata?.framePreference || "Workshop").toString().slice(0, 20) || "Workshop";
  const notesParts = [
    item.metadata?.sessionDayLabel ||
      item.metadata?.scheduledDateLabel ||
      null,
    item.metadata?.sessionLabel ||
      item.metadata?.sessionTimeRange ||
      item.metadata?.sessionTime ||
      null,
    item.metadata?.location || null,
    item.metadata?.attendeeCount
      ? `${item.metadata.attendeeCount} attendee(s)`
      : null,
  ].filter(Boolean);
  const notesValue = [
    ...notesParts,
    item.metadata?.notes || "",
  ]
    .filter(Boolean)
    .join(" - ")
    .slice(0, 1000);
  const sessionDateValue =
    item.metadata?.sessionDate ||
    item.metadata?.session?.date ||
    null;
  const sessionLabelValue =
    item.metadata?.sessionLabel ||
    item.metadata?.sessionTimeRange ||
    item.metadata?.sessionTime ||
    null;
  const bookingName =
    item.metadata?.customer?.fullName ||
    customer.fullName ||
    "Guest";
  const bookingEmail =
    item.metadata?.customer?.email ||
    customer.email ||
    "no-reply@bethanyblooms.co.za";

  return {
    name: bookingName,
    email: bookingEmail,
    frame: frameValue,
    notes: notesValue,
    sessionDate: sessionDateValue,
    sessionLabel: sessionLabelValue,
    workshopId: item.metadata?.workshopId || null,
    orderId,
    paid: true,
    paymentStatus: "paid",
    paidAt: FIELD_VALUE.serverTimestamp(),
    createdAt: FIELD_VALUE.serverTimestamp(),
  };
}

async function createBookingsForOrder(items, customer, orderId) {
  if (!orderId) return;
  const bookings = items
    .filter((item) => item.metadata?.type === "workshop")
    .map((item) => buildBookingData(item, customer, orderId));

  if (!bookings.length) return;

  const existingSnap = await db
    .collection("bookings")
    .where("orderId", "==", orderId)
    .limit(1)
    .get();
  if (!existingSnap.empty) {
    return;
  }

  const batch = db.batch();
  bookings.forEach((booking) => {
    const docRef = db.collection("bookings").doc();
    batch.set(docRef, booking);
  });
  await batch.commit();
}

function parsePositiveInteger(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function readTrackedQuantity(record = {}) {
  if (!record || typeof record !== "object") return null;
  const quantityValue =
    record.stock_quantity ??
    record.stockQuantity ??
    record.quantity;
  const quantity = Number(quantityValue);
  if (!Number.isFinite(quantity)) return null;
  return Math.max(0, Math.floor(quantity));
}

function isValidFirestoreDocumentId(value) {
  const id = (value || "").toString().trim();
  if (!id) return false;
  return !id.includes("/");
}

function buildOrderProductAdjustments(items = []) {
  const adjustments = new Map();
  items.forEach((item) => {
    if (!item || item.metadata?.type !== "product") return;
    const metadata = item.metadata || {};
    const fallbackId =
      typeof item.id === "string" && item.id.includes(":")
        ? item.id.split(":")[0]
        : item.id;
    const productId = (
      metadata.productId ||
      metadata.productID ||
      fallbackId ||
      metadata.product ||
      ""
    )
      .toString()
      .trim();
    if (!productId) return;

    const quantity = parsePositiveInteger(item.quantity, 1);
    const fallbackVariantId =
      typeof item.id === "string" && item.id.includes(":")
        ? item.id.split(":").slice(1).join(":")
        : "";
    const variantId = (metadata.variantId || fallbackVariantId || "")
      .toString()
      .trim();

    const key = `${productId}::${variantId}`;
    const existing = adjustments.get(key) || { productId, variantId, quantity: 0 };
    existing.quantity += quantity;
    adjustments.set(key, existing);
  });
  return Array.from(adjustments.values());
}

function isOrderEligibleForInventoryDeduction(order = {}) {
  const paymentMethod = normalizePaymentMethod(order.paymentMethod);
  const paymentStatus = (order.paymentStatus || "").toString().trim().toLowerCase();
  const orderStatus = (order.status || "").toString().trim().toLowerCase();
  if (paymentMethod === "eft") {
    return (
      normalizePaymentApprovalDecision(order) === "approved" ||
      paymentStatus === "paid" ||
      orderStatus === "order-placed"
    );
  }
  return paymentStatus === "paid" || orderStatus === "order-placed";
}

async function applyProductInventoryForOrder(
  orderId,
  { orderRef = null, orderData = null, reason = "order-payment-confirmed" } = {},
) {
  const normalizedOrderId =
    (orderId || orderRef?.id || "").toString().trim();
  if (!normalizedOrderId) {
    return { adjusted: false, reason: "missing-order-id" };
  }

  const targetOrderRef = orderRef || db.doc(`orders/${normalizedOrderId}`);

  return db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(targetOrderRef);
    if (!orderSnap.exists) {
      return { adjusted: false, reason: "order-not-found" };
    }

    const orderRecord = orderSnap.data() || {};
    if (orderRecord?.inventory?.stockDeductedAt) {
      return { adjusted: false, reason: "already-adjusted" };
    }

    const items = Array.isArray(orderRecord.items)
      ? orderRecord.items
      : Array.isArray(orderData?.items)
        ? orderData.items
        : [];
    const adjustments = buildOrderProductAdjustments(items);
    const groupedAdjustments = new Map();

    adjustments.forEach((entry) => {
      if (!groupedAdjustments.has(entry.productId)) {
        groupedAdjustments.set(entry.productId, {
          totalQuantity: 0,
          variants: new Map(),
        });
      }
      const productGroup = groupedAdjustments.get(entry.productId);
      productGroup.totalQuantity += entry.quantity;
      if (entry.variantId) {
        productGroup.variants.set(
          entry.variantId,
          (productGroup.variants.get(entry.variantId) || 0) + entry.quantity,
        );
      }
    });

    const adjustedProductIds = [];
    const missingProductIds = [];
    const untrackedProductIds = [];
    const invalidProductIds = [];

    const productTargets = [];
    for (const [productId, group] of groupedAdjustments.entries()) {
      if (!isValidFirestoreDocumentId(productId)) {
        invalidProductIds.push(productId);
        continue;
      }
      productTargets.push({
        productId,
        group,
        productRef: db.doc(`products/${productId}`),
      });
    }

    const productSnapshots = new Map();
    for (const target of productTargets) {
      const snap = await transaction.get(target.productRef);
      productSnapshots.set(target.productId, snap);
    }

    const productWrites = [];
    for (const target of productTargets) {
      const { productId, group, productRef } = target;
      const productSnap = productSnapshots.get(productId);
      if (!productSnap?.exists) {
        missingProductIds.push(productId);
        continue;
      }

      const product = productSnap.data() || {};
      const updatePayload = { updatedAt: FIELD_VALUE.serverTimestamp() };
      let adjusted = false;

      const currentProductQuantity = readTrackedQuantity(product);
      if (currentProductQuantity !== null) {
        const nextQuantity = Math.max(0, currentProductQuantity - group.totalQuantity);
        updatePayload.quantity = nextQuantity;
        updatePayload.stock_quantity = nextQuantity;
        if (Object.prototype.hasOwnProperty.call(product, "stockQuantity")) {
          updatePayload.stockQuantity = nextQuantity;
        }
        adjusted = true;
      }

      if (Array.isArray(product.variants) && group.variants.size > 0) {
        let variantsChanged = false;
        const nextVariants = product.variants.map((variant) => {
          if (!variant || typeof variant !== "object") return variant;
          const variantId = (variant.id || "").toString().trim();
          if (!variantId || !group.variants.has(variantId)) return variant;

          const currentVariantQuantity = readTrackedQuantity(variant);
          if (currentVariantQuantity === null) return variant;

          const decrementBy = group.variants.get(variantId) || 0;
          const nextVariantQuantity = Math.max(0, currentVariantQuantity - decrementBy);
          variantsChanged = true;

          const nextVariant = {
            ...variant,
            quantity: nextVariantQuantity,
            stock_quantity: nextVariantQuantity,
          };
          if (Object.prototype.hasOwnProperty.call(variant, "stockQuantity")) {
            nextVariant.stockQuantity = nextVariantQuantity;
          }
          return nextVariant;
        });

        if (variantsChanged) {
          updatePayload.variants = nextVariants;
          adjusted = true;
        }
      }

      if (adjusted) {
        productWrites.push({ productRef, updatePayload });
        adjustedProductIds.push(productId);
      } else {
        untrackedProductIds.push(productId);
      }
    }

    for (const write of productWrites) {
      transaction.set(write.productRef, write.updatePayload, { merge: true });
    }

    transaction.set(
      targetOrderRef,
      {
        "inventory.stockDeductedAt": FIELD_VALUE.serverTimestamp(),
        "inventory.stockDeductionReason": reason,
        "inventory.adjustedProductIds": adjustedProductIds,
        "inventory.missingProductIds": missingProductIds,
        "inventory.untrackedProductIds": untrackedProductIds,
        "inventory.invalidProductIds": invalidProductIds,
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      adjusted: adjustedProductIds.length > 0,
      adjustedProductIds,
      missingProductIds,
      untrackedProductIds,
      invalidProductIds,
    };
  });
}

function parseReconciliationLimit(value, fallback = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(500, Math.max(1, Math.floor(parsed)));
}

function parseBooleanFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

function ensurePayfastConfig(payfastConfig, modeInput, options = {}) {
  const resolvedCredentials = resolvePayfastCredentials(modeInput, payfastConfig, options);
  if (resolvedCredentials.fallbackReason) {
    functions.logger.warn("PayFast mode fallback applied", {
      requestedMode: resolvedCredentials.requestedMode,
      resolvedMode: resolvedCredentials.mode,
      reason: resolvedCredentials.fallbackReason,
    });
  }
  const missing = [];
  if (!resolvedCredentials.merchantId) {
    missing.push("PAYFAST_LIVE_MERCHANT_ID (or PAYFAST_MERCHANT_ID)");
  }
  if (!resolvedCredentials.merchantKey) {
    missing.push("PAYFAST_LIVE_MERCHANT_KEY (or PAYFAST_MERCHANT_KEY)");
  }
  if (!payfastConfig.notifyUrl) missing.push("PAYFAST_NOTIFY_URL");
  if (missing.length) {
    throw new HttpsError(
      "failed-precondition",
      `Missing PayFast configuration: ${missing.join(", ")}.`,
    );
  }
  return resolvedCredentials;
}

function ensurePayfastCheckoutFields(fields = {}) {
  const requiredFieldNames = ["merchant_id", "merchant_key", "amount", "item_name"];
  const missing = requiredFieldNames.filter((name) => {
    const value = fields?.[name];
    return value === undefined || value === null || value === "";
  });
  if (missing.length) {
    throw new HttpsError(
      "failed-precondition",
      `PayFast checkout payload is missing required fields: ${missing.join(", ")}.`,
    );
  }
}

function validatePaymentProofMetadata(input) {
  if (!input || typeof input !== "object") return null;
  const storagePath = (input.storagePath || "").toString().trim();
  const fileName = (input.fileName || "").toString().trim();
  const contentType = (input.contentType || "").toString().trim().toLowerCase();
  const size = Number(input.size);

  if (!storagePath || !fileName || !contentType || !Number.isFinite(size) || size <= 0) {
    throw new Error("Invalid EFT payment proof metadata.");
  }
  if (!storagePath.startsWith("eftProofs/")) {
    throw new Error("Invalid EFT proof storage path.");
  }
  const validContentType = contentType === "application/pdf" || contentType.startsWith("image/");
  if (!validContentType) {
    throw new Error("Unsupported proof file type. Upload a PDF or image.");
  }
  if (size > EFT_PROOF_MAX_SIZE_BYTES) {
    throw new Error("Proof file is too large. Maximum size is 10MB.");
  }

  return {
    storagePath,
    fileName,
    contentType,
    size,
  };
}

function validateOrderPayload(dataInput = {}) {
  const data = dataInput ?? {};
  const requestCustomer = data?.customer || {};
  const customerUid = normalizeCustomerUid(
    data?.customerUid != null ? data.customerUid : requestCustomer.uid,
  );
  const fallback = {
    fullName: data?.customerName,
    email: data?.customerEmail,
    phone: data?.customerPhone,
    address: data?.customerAddress,
  };
  const customer = {
    fullName: (requestCustomer.fullName || fallback.fullName || "").toString().trim(),
    email: (requestCustomer.email || fallback.email || "").toString().trim(),
    phone: (requestCustomer.phone || fallback.phone || "").toString().trim(),
    address: (requestCustomer.address || fallback.address || "").toString().trim(),
  };

  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) {
    throw new Error("Order items are required.");
  }
  const containsGiftCards = items.some((item) => isGiftCardOrderItem(item));
  const containsWorkshops = items.some((item) => item?.metadata?.type === "workshop");
  const containsPhysicalProducts = items.some(
    (item) => item?.metadata?.type === "product" && !isGiftCardOrderItem(item),
  );
  const requiresShipping = containsWorkshops || containsPhysicalProducts;
  const giftCardOnly = containsGiftCards && !requiresShipping;

  const shippingAddressInput = data?.shippingAddress || data?.address || {};
  const shippingAddress = {
    street: (shippingAddressInput.street || shippingAddressInput.streetAddress || "").toString().trim(),
    suburb: (shippingAddressInput.suburb || "").toString().trim(),
    city: (shippingAddressInput.city || "").toString().trim(),
    province: (shippingAddressInput.province || "").toString().trim(),
    postalCode: (shippingAddressInput.postalCode || shippingAddressInput.postcode || "").toString().trim(),
  };
  const structuredAddressParts = [
    shippingAddress.street,
    shippingAddress.suburb,
    shippingAddress.city,
    shippingAddress.province,
    shippingAddress.postalCode,
  ];
  const hasStructuredAddress = structuredAddressParts.every(Boolean);
  const formattedShippingAddress = hasStructuredAddress ? structuredAddressParts.join(", ") : "";
  if (formattedShippingAddress) {
    customer.address = formattedShippingAddress;
  }

  const requiredFields = ["fullName", "email", "phone"];
  const missing = requiredFields.filter((field) => !customer[field]);
  if (missing.length) {
    throw new Error(`Missing customer information: ${missing.join(", ")}.`);
  }
  if (!customer.address && giftCardOnly) {
    customer.address = "Digital gift card delivery via email";
  }
  if (requiresShipping && !hasStructuredAddress) {
    throw new Error("Missing customer address details.");
  }
  if (!customer.address) {
    throw new Error("Missing customer address details.");
  }

  const computedSubtotal = items.reduce((sum, item) => {
    const price = Number(item?.price ?? 0);
    const quantity = Number(item?.quantity ?? 1);
    if (!Number.isFinite(price)) return sum;
    return sum + price * (Number.isFinite(quantity) ? quantity : 1);
  }, 0);

  const totalPrice = Number(data?.totalPrice ?? 0);
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    throw new Error("Order total must be greater than zero.");
  }

  const shippingCostRaw = Number(data?.shippingCost ?? data?.shipping?.courierPrice ?? 0);
  const shippingCost =
    giftCardOnly
      ? 0
      : Number.isFinite(shippingCostRaw) && shippingCostRaw >= 0
        ? shippingCostRaw
        : 0;
  const subtotalInput = Number(data?.subtotal ?? computedSubtotal);
  const subtotal = Number.isFinite(subtotalInput) ? subtotalInput : computedSubtotal;
  const shipping = requiresShipping && data?.shipping
    ? {
        courierId: (data.shipping.courierId || "").toString().trim() || null,
        courierName: (data.shipping.courierName || "").toString().trim() || null,
        courierPrice: shippingCost,
        province: (data.shipping.province || shippingAddress.province || "").toString().trim() || null,
      }
    : null;

  return {
    data,
    customerUid,
    customer,
    items,
    totalPrice,
    subtotal: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null,
    shippingCost,
    shipping: shipping || null,
    shippingAddress: requiresShipping && hasStructuredAddress ? shippingAddress : null,
    containsGiftCards,
    requiresShipping,
    giftCardOnly,
    paymentProof: validatePaymentProofMetadata(data?.paymentProof),
  };
}

function normalizeOrderDeliveryMethod(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  return normalized === "courier" ? "courier" : "company";
}

function normalizeOrderShippingAddressInput(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    street: trimToLength(source.street || source.streetAddress || "", 200),
    suburb: trimToLength(source.suburb || "", 160),
    city: trimToLength(source.city || "", 160),
    province: trimToLength(source.province || "", 160),
    postalCode: trimToLength(source.postalCode || source.postcode || "", 40),
  };
}

function formatOrderShippingAddress(address = {}) {
  const normalized = normalizeOrderShippingAddressInput(address);
  return [
    normalized.street,
    normalized.suburb,
    normalized.city,
    normalized.province,
    normalized.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function hasCompleteShippingAddress(address = {}) {
  const normalized = normalizeOrderShippingAddressInput(address);
  return Boolean(
    normalized.street &&
    normalized.suburb &&
    normalized.city &&
    normalized.province &&
    normalized.postalCode &&
    /^\d{4}$/.test(normalized.postalCode),
  );
}

function computeOrderSubtotal(order = {}) {
  const explicitSubtotal = Number(order?.subtotal);
  if (Number.isFinite(explicitSubtotal) && explicitSubtotal >= 0) {
    return Number(explicitSubtotal.toFixed(2));
  }
  const computed = (Array.isArray(order?.items) ? order.items : []).reduce((sum, item) => {
    const price = Number(item?.price ?? 0);
    const quantity = Number(item?.quantity ?? 1);
    if (!Number.isFinite(price)) return sum;
    const safeQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    return sum + price * safeQty;
  }, 0);
  return Number(computed.toFixed(2));
}

function coerceOrderShippingCost(order = {}) {
  const shippingValue = Number(order?.shippingCost ?? order?.shipping?.courierPrice ?? 0);
  if (!Number.isFinite(shippingValue) || shippingValue < 0) return 0;
  return Number(shippingValue.toFixed(2));
}

function coerceOrderTotalPrice(order = {}) {
  const explicitTotal = Number(order?.totalPrice);
  if (Number.isFinite(explicitTotal) && explicitTotal >= 0) {
    return Number(explicitTotal.toFixed(2));
  }
  const subtotal = computeOrderSubtotal(order);
  const shippingCost = coerceOrderShippingCost(order);
  return Number((subtotal + shippingCost).toFixed(2));
}

function isOrderPaidForDeliveryAdjustment(order = {}) {
  const paymentMethod = normalizePaymentMethod(order?.paymentMethod);
  if (paymentMethod === "eft") {
    const approval = normalizePaymentApprovalDecision(order);
    const paymentStatus = (order?.paymentStatus || "").toString().trim().toLowerCase();
    return approval === "approved" || paymentStatus === "paid";
  }

  const paymentStatus = (
    order?.payfast?.paymentStatus ||
    order?.paymentStatus ||
    ""
  ).toString().trim().toLowerCase();
  return paymentStatus === "paid" || paymentStatus === "complete";
}

async function resolveCourierOptionForDeliveryUpdate({
  courierId = "",
  courierName = "",
  province = "",
} = {}) {
  const normalizedCourierId = (courierId || "").toString().trim();
  const normalizedCourierName = (courierName || "").toString().trim();
  const normalizedProvince = (province || "").toString().trim();
  if (!normalizedProvince) {
    throw new HttpsError("invalid-argument", "Province is required for courier delivery.");
  }

  let courierSnap = null;
  if (normalizedCourierId) {
    const snapshot = await db.collection("courierOptions").doc(normalizedCourierId).get();
    if (snapshot.exists) {
      courierSnap = snapshot;
    }
  }
  if (!courierSnap && normalizedCourierName) {
    const snapshot = await db
      .collection("courierOptions")
      .where("name", "==", normalizedCourierName)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      courierSnap = snapshot.docs[0];
    }
  }

  if (!courierSnap || !courierSnap.exists) {
    throw new HttpsError("not-found", "Selected courier option was not found.");
  }

  const data = courierSnap.data() || {};
  if (data.isActive === false) {
    throw new HttpsError("failed-precondition", "Selected courier is currently inactive.");
  }
  const provinceConfig = data?.provinces?.[normalizedProvince] || {};
  if (provinceConfig.isAvailable !== true) {
    throw new HttpsError(
      "failed-precondition",
      `Selected courier is not available for ${normalizedProvince}.`,
    );
  }
  const courierPrice = Number(provinceConfig.price);
  if (!Number.isFinite(courierPrice) || courierPrice < 0) {
    throw new HttpsError("failed-precondition", "Selected courier pricing is invalid.");
  }

  return {
    id: courierSnap.id,
    name: trimToLength(data?.name || normalizedCourierName || "Courier", 160),
    price: Number(courierPrice.toFixed(2)),
    province: normalizedProvince,
  };
}

function normalizeCustomerUid(value = null) {
  const normalized = (value || "").toString().trim();
  return normalized || null;
}

function createCustomerProfileAddressId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `addr-${crypto.randomBytes(16).toString("hex")}`;
}

function normalizeCustomerProfileAddress(input = {}) {
  if (!input || typeof input !== "object") return null;
  const street = trimToLength(input.street || "", 200);
  const suburb = trimToLength(input.suburb || "", 160);
  const city = trimToLength(input.city || "", 160);
  const province = trimToLength(input.province || "", 160);
  const postalCode = trimToLength(input.postalCode || "", 40);
  if (!street || !suburb || !city || !province || !postalCode) return null;

  const id = trimToLength(input.id || createCustomerProfileAddressId(), 120);
  const label = trimToLength(input.label || "Saved address", 120);
  return {
    id,
    label,
    street,
    suburb,
    city,
    province,
    postalCode,
  };
}

function customerProfileAddressKey(address = {}) {
  return [
    address.street,
    address.suburb,
    address.city,
    address.province,
    address.postalCode,
  ]
    .map((value) => (value || "").toString().trim().toLowerCase())
    .join("|");
}

function buildCustomerProfileAddressFromShipping(shippingAddress = null) {
  if (!shippingAddress || typeof shippingAddress !== "object") return null;
  return normalizeCustomerProfileAddress({
    id: createCustomerProfileAddressId(),
    label: "Saved address",
    street: shippingAddress.street,
    suburb: shippingAddress.suburb,
    city: shippingAddress.city,
    province: shippingAddress.province,
    postalCode: shippingAddress.postalCode,
  });
}

function mergeCustomerProfileAddresses(existingAddresses = [], incomingAddress = null) {
  const merged = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  const append = (candidate) => {
    const normalized = normalizeCustomerProfileAddress(candidate);
    if (!normalized) return;
    const addressId = normalized.id;
    const addressKey = customerProfileAddressKey(normalized);
    if (seenIds.has(addressId) || (addressKey && seenKeys.has(addressKey))) {
      return;
    }
    seenIds.add(addressId);
    if (addressKey) {
      seenKeys.add(addressKey);
    }
    merged.push(normalized);
  };

  append(incomingAddress);
  (Array.isArray(existingAddresses) ? existingAddresses : []).forEach((address) => append(address));
  return merged.slice(0, MAX_CUSTOMER_PROFILE_ADDRESSES);
}

function normalizeCustomerProfilePreferences(input = null) {
  const preferences = input && typeof input === "object" ? input : {};
  return {
    marketingEmails: preferences.marketingEmails !== false,
    orderUpdates: preferences.orderUpdates !== false,
  };
}

async function upsertCustomerProfileFromOrder({
  customerUid = null,
  customer = {},
  shippingAddress = null,
} = {}) {
  const normalizedUid = normalizeCustomerUid(customerUid);
  if (!normalizedUid) return;

  const profileRef = db.collection(CUSTOMER_PROFILES_COLLECTION).doc(normalizedUid);
  await db.runTransaction(async (transaction) => {
    const profileSnap = await transaction.get(profileRef);
    const existingProfile = profileSnap.exists ? profileSnap.data() || {} : {};
    const nextAddress = buildCustomerProfileAddressFromShipping(shippingAddress);
    const mergedAddresses = mergeCustomerProfileAddresses(existingProfile.addresses, nextAddress);
    const defaultAddressIdRaw = (existingProfile.defaultAddressId || "").toString().trim();
    const defaultAddressId = mergedAddresses.some((entry) => entry.id === defaultAddressIdRaw)
      ? defaultAddressIdRaw
      : mergedAddresses[0]?.id || "";

    const profilePayload = {
      uid: normalizedUid,
      email: trimToLength(customer?.email || existingProfile.email || "", 160),
      fullName: trimToLength(customer?.fullName || existingProfile.fullName || "", 160),
      phone: trimToLength(customer?.phone || existingProfile.phone || "", 40),
      addresses: mergedAddresses,
      defaultAddressId,
      preferences: normalizeCustomerProfilePreferences(existingProfile.preferences),
      createdAt: existingProfile.createdAt || FIELD_VALUE.serverTimestamp(),
      updatedAt: FIELD_VALUE.serverTimestamp(),
    };
    transaction.set(profileRef, profilePayload, { merge: true });
  });
}

function countOrderItems(items = []) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const quantity = Number(item?.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) return sum;
    return sum + Math.floor(quantity);
  }, 0);
}

async function upsertCustomerProfileOrder({
  customerUid = null,
  orderId = "",
  order = {},
} = {}) {
  const normalizedUid = normalizeCustomerUid(customerUid);
  const normalizedOrderId = (orderId || "").toString().trim();
  if (!normalizedUid || !normalizedOrderId) return;

  const orderRef = db
    .collection(CUSTOMER_PROFILES_COLLECTION)
    .doc(normalizedUid)
    .collection(CUSTOMER_PROFILE_ORDERS_SUBCOLLECTION)
    .doc(normalizedOrderId);
  const existingSnap = await orderRef.get();
  const existingOrder = existingSnap.exists ? existingSnap.data() || {} : {};

  await orderRef.set(
    {
      orderId: normalizedOrderId,
      orderNumber:
        Number.isFinite(Number(order?.orderNumber))
          ? Number(order.orderNumber)
          : existingOrder.orderNumber || null,
      invoiceNumber:
        Number.isFinite(Number(order?.invoiceNumber))
          ? Number(order.invoiceNumber)
          : Number.isFinite(Number(order?.orderNumber))
            ? Number(order.orderNumber)
            : existingOrder.invoiceNumber || null,
      status: (order?.status || existingOrder.status || "").toString().trim() || "pending",
      paymentMethod:
        (order?.paymentMethod || existingOrder.paymentMethod || "").toString().trim() || null,
      paymentStatus:
        (order?.paymentStatus || existingOrder.paymentStatus || "").toString().trim() || null,
      totalPrice:
        Number.isFinite(Number(order?.totalPrice))
          ? Number(order.totalPrice)
          : Number.isFinite(Number(existingOrder.totalPrice))
            ? Number(existingOrder.totalPrice)
            : 0,
      itemCount: countOrderItems(order?.items || existingOrder.items || []),
      customerEmail:
        trimToLength(order?.customer?.email || existingOrder.customerEmail || "", 160) || null,
      customerName:
        trimToLength(order?.customer?.fullName || existingOrder.customerName || "", 160) || null,
      shippingAddress:
        trimToLength(
          order?.customer?.address || existingOrder.shippingAddress || "",
          300,
        ) || null,
      createdAt: existingOrder.createdAt || order?.createdAt || FIELD_VALUE.serverTimestamp(),
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );
}

function toCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

function encodeValue(value) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function trimToLength(value, maxLength) {
  if (!Number.isFinite(maxLength) || maxLength <= 0) return "";
  const normalized = (value == null ? "" : value.toString()).trim();
  return normalized.slice(0, maxLength);
}

function normalizePayfastPaymentMethod(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (!normalized) return "";
  return PAYFAST_ALLOWED_PAYMENT_METHODS.has(normalized) ? normalized : "";
}

function buildPayfastParamString(
  entries = [],
  {
    excludeSignature = true,
    skipBlankValues = false,
    trimValues = false,
  } = {},
) {
  const parts = [];
  for (const [rawKey, rawValue] of entries) {
    const key = (rawKey || "").toString();
    if (!key) continue;
    if (excludeSignature && key === "signature") continue;
    const valueRaw = rawValue == null ? "" : rawValue.toString();
    const value = trimValues ? valueRaw.trim() : valueRaw;
    if (skipBlankValues && value === "") continue;
    parts.push(`${key}=${encodeValue(value)}`);
  }
  return parts.join("&");
}

function createPayfastSignatureFromParamString(paramString = "", passphrase = "") {
  let payload = paramString;
  const normalizedPassphrase = (passphrase || "").toString();
  if (normalizedPassphrase) {
    payload = payload
      ? `${payload}&passphrase=${encodeValue(normalizedPassphrase)}`
      : `passphrase=${encodeValue(normalizedPassphrase)}`;
  }
  return crypto.createHash("md5").update(payload).digest("hex");
}

function createPayfastCheckoutSignature(params, passphrase) {
  const paramString = buildPayfastParamString(Object.entries(params || {}), {
    excludeSignature: true,
    skipBlankValues: true,
    trimValues: true,
  });
  return createPayfastSignatureFromParamString(paramString, passphrase);
}

function parsePayfastBody(req) {
  if (req.rawBody && typeof req.rawBody.toString === "function") {
    const rawBody = req.rawBody.toString("utf8");
    const parsed = new URLSearchParams(rawBody);
    const entries = [];
    const params = {};
    for (const [key, value] of parsed.entries()) {
      entries.push([key, value]);
      params[key] = value;
    }
    return {
      rawBody,
      entries,
      params,
    };
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const entries = Object.entries(body).map(([key, value]) => [key, value == null ? "" : value.toString()]);
  const params = Object.fromEntries(entries);
  return {
    rawBody: buildPayfastParamString(entries, {
      excludeSignature: false,
      skipBlankValues: false,
      trimValues: false,
    }),
    entries,
    params,
  };
}

function normalizeIpAddress(value = "") {
  let candidate = (value || "").toString().trim();
  if (!candidate) return "";
  if (candidate.includes(",")) {
    candidate = candidate.split(",")[0].trim();
  }
  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]");
    if (closingBracket > 0) {
      candidate = candidate.slice(1, closingBracket);
    }
  }
  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPort) {
    candidate = ipv4WithPort[1];
  }
  if (candidate.startsWith("::ffff:")) {
    candidate = candidate.slice(7);
  }
  if (candidate === "::1") {
    return "127.0.0.1";
  }
  return candidate.toLowerCase();
}

function resolveRequestIp(req) {
  const forwardedFor =
    req.get?.("x-forwarded-for") ||
    req.headers?.["x-forwarded-for"] ||
    req.headers?.["X-Forwarded-For"] ||
    "";
  return normalizeIpAddress(
    forwardedFor ||
      req.ip ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      "",
  );
}

async function resolvePayfastValidIps() {
  const now = Date.now();
  if (payfastValidIpCache.expiresAt > now && payfastValidIpCache.ips.size) {
    return payfastValidIpCache.ips;
  }

  const previousCache = payfastValidIpCache;
  const resolvedIps = new Set();
  await Promise.all(
    PAYFAST_VALID_HOSTS.map(async (host) => {
      try {
        const ipv4Addresses = await dns.promises.resolve4(host);
        ipv4Addresses.forEach((ip) => {
          const normalized = normalizeIpAddress(ip);
          if (normalized) resolvedIps.add(normalized);
        });
      } catch (error) {
        functions.logger.warn("Failed to resolve PayFast IPv4 host", {
          host,
          message: error?.message || error,
        });
      }

      try {
        const ipv6Addresses = await dns.promises.resolve6(host);
        ipv6Addresses.forEach((ip) => {
          const normalized = normalizeIpAddress(ip);
          if (normalized) resolvedIps.add(normalized);
        });
      } catch (error) {
        functions.logger.debug("Failed to resolve PayFast IPv6 host", {
          host,
          message: error?.message || error,
        });
      }
    }),
  );

  if (resolvedIps.size) {
    payfastValidIpCache = {
      expiresAt: now + PAYFAST_IP_CACHE_TTL_MS,
      ips: resolvedIps,
    };
    return resolvedIps;
  }

  if (previousCache.ips.size) {
    payfastValidIpCache = {
      expiresAt: now + Math.floor(PAYFAST_IP_CACHE_TTL_MS / 2),
      ips: previousCache.ips,
    };
    return previousCache.ips;
  }

  return resolvedIps;
}

async function validatePayfastSourceIp(req) {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return {
      valid: true,
      retryable: false,
      reason: "emulator",
      requestIp: resolveRequestIp(req),
    };
  }

  const requestIp = resolveRequestIp(req);
  if (!requestIp) {
    return {
      valid: false,
      retryable: true,
      reason: "missing-request-ip",
      requestIp: "",
    };
  }

  const validIps = await resolvePayfastValidIps();
  if (!validIps.size) {
    return {
      valid: false,
      retryable: true,
      reason: "payfast-ip-resolution-failed",
      requestIp,
    };
  }

  return {
    valid: validIps.has(requestIp),
    retryable: false,
    reason: validIps.has(requestIp) ? "matched" : "untrusted-source-ip",
    requestIp,
  };
}

async function validateWithPayfast(paramString, modeInput) {
  const modeKey = normalizePayfastMode(modeInput, "live");
  const host = payfastHosts[modeKey];
  const url = `https://${host}/eng/query/validate`;

  if (!paramString) {
    return {
      valid: false,
      retryable: true,
      responseText: "",
      error: "Missing ITN validation payload.",
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: paramString,
    });
    const text = (await response.text()).trim();
    return {
      valid: text.toUpperCase() === "VALID",
      retryable: false,
      responseText: text,
      error: null,
    };
  } catch (error) {
    functions.logger.warn("PayFast validation call failed", error);
    return {
      valid: false,
      retryable: true,
      responseText: "",
      error: error?.message || "PayFast validation call failed.",
    };
  }
}

async function resolveGiftCardRequest(req) {
  const giftCardId = (req.query?.giftCardId || req.query?.id || "")
    .toString()
    .trim();
  const token = (req.query?.token || "").toString().trim();
  if (!giftCardId) {
    throw new Error("Gift card ID is required.");
  }
  if (!token) {
    throw new Error("Gift card token is required.");
  }
  if (!verifyGiftCardAccessToken(giftCardId, token)) {
    throw new Error("Invalid gift card token.");
  }
  const giftCardRef = db.collection(GIFT_CARDS_COLLECTION).doc(giftCardId);
  const giftCardSnap = await giftCardRef.get();
  if (!giftCardSnap.exists) {
    throw new Error("Gift card not found.");
  }
  return {
    giftCardId,
    token,
    giftCardRef,
    giftCard: giftCardSnap.data() || {},
  };
}

exports.createUserWithRole = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Only authenticated admins can create users.");
  }

  const data = request.data || {};
  const tokenRole = request.auth.token?.role;
  const callerEmail = (request.auth.token?.email || "").toLowerCase();
  const callerUid = request.auth.uid;

  const tokenRoleLower = (tokenRole || "").toString().toLowerCase();
  let callerIsAdmin = tokenRoleLower === "admin";
  let anyAdminExists = false;

  const callerUserRef = db.doc(`users/${callerUid}`);
  let callerDocData = {};
  try {
    const callerSnap = await callerUserRef.get();
    if (callerSnap.exists) {
      callerDocData = callerSnap.data() || {};
      const docRole = (callerDocData.role || "").toString().toLowerCase();
      if (docRole === "admin") {
        callerIsAdmin = true;
      }
    }
  } catch (error) {
    functions.logger.warn("Failed to read admin user doc", error);
  }

  try {
    const adminsSnap = await db.collection("users").where("role", "==", "admin").limit(1).get();
    anyAdminExists = !adminsSnap.empty;
  } catch (err) {
    functions.logger.warn("Admin lookup failed", err);
  }

  // Bootstrap: if there are no admins at all, make the first caller an admin
  if (!callerIsAdmin && !anyAdminExists) {
    callerIsAdmin = true;
    await db.doc(`users/${callerUid}`).set(
      {
        email: callerEmail || callerUid,
        uid: callerUid,
        role: "admin",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (!callerIsAdmin) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const email = (data.email || "").toString().trim();
  const password = (data.password || "").toString();
  const role = (data.role || "customer").toString().trim() || "customer";

  if (!email || !password) {
    throw new HttpsError("invalid-argument", "Email and password are required.");
  }
  if (password.length < 6) {
    throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }
  if (!["admin", "customer"].includes(role)) {
    throw new HttpsError("invalid-argument", "Role must be admin or customer.");
  }

  const userRecord = await admin.auth().createUser({
    email,
    password,
  });

  await admin.auth().setCustomUserClaims(userRecord.uid, { role });

  await db.doc(`users/${userRecord.uid}`).set(
    {
      uid: userRecord.uid,
      email,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await db.collection(CUSTOMER_PROFILES_COLLECTION).doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email,
      fullName: "",
      phone: "",
      addresses: [],
      defaultAddressId: "",
      preferences: {
        marketingEmails: true,
        orderUpdates: true,
      },
      createdAt: FIELD_VALUE.serverTimestamp(),
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  return { uid: userRecord.uid, role };
});

exports.adminUpdateUserProfile = onCall(async (request) => {
  await assertAdminRequest(request);
  const data = request.data && typeof request.data === "object" ? request.data : {};
  const userId = normalizeCustomerUid(data.userId);
  const profileInput = data.profile && typeof data.profile === "object" ? data.profile : {};

  if (!userId) {
    throw new HttpsError("invalid-argument", "userId is required.");
  }

  const userRef = db.doc(`users/${userId}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  const userData = userSnap.data() || {};
  const storedEmail = trimToLength(userData.email || "", 160);

  const dedupedAddresses = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  for (const rawAddress of Array.isArray(profileInput.addresses) ? profileInput.addresses : []) {
    const normalizedAddress = normalizeCustomerProfileAddress(rawAddress);
    if (!normalizedAddress) continue;
    const addressKey = customerProfileAddressKey(normalizedAddress);
    if (addressKey && seenKeys.has(addressKey)) continue;
    let safeAddressId = trimToLength(normalizedAddress.id || "", 120);
    if (!safeAddressId || seenIds.has(safeAddressId)) {
      safeAddressId = createCustomerProfileAddressId();
    }
    seenIds.add(safeAddressId);
    if (addressKey) seenKeys.add(addressKey);
    dedupedAddresses.push({
      ...normalizedAddress,
      id: safeAddressId,
    });
    if (dedupedAddresses.length >= MAX_CUSTOMER_PROFILE_ADDRESSES) {
      break;
    }
  }

  const requestedDefaultAddressId = trimToLength(profileInput.defaultAddressId || "", 120);
  const defaultAddressId = dedupedAddresses.some((entry) => entry.id === requestedDefaultAddressId)
    ? requestedDefaultAddressId
    : dedupedAddresses[0]?.id || "";

  const profileRef = db.collection(CUSTOMER_PROFILES_COLLECTION).doc(userId);
  const existingProfileSnap = await profileRef.get();
  const existingProfile = existingProfileSnap.exists ? existingProfileSnap.data() || {} : {};

  const normalizedProfilePayload = {
    uid: userId,
    email: storedEmail,
    fullName: trimToLength(profileInput.fullName || "", 160),
    phone: trimToLength(profileInput.phone || "", 40),
    addresses: dedupedAddresses,
    defaultAddressId,
    preferences: normalizeCustomerProfilePreferences(profileInput.preferences),
    createdAt: existingProfile.createdAt || FIELD_VALUE.serverTimestamp(),
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };

  await profileRef.set(normalizedProfilePayload, { merge: true });

  return {
    ok: true,
    userId,
    profile: {
      uid: userId,
      email: storedEmail,
      fullName: normalizedProfilePayload.fullName,
      phone: normalizedProfilePayload.phone,
      addresses: dedupedAddresses,
      defaultAddressId,
      preferences: normalizedProfilePayload.preferences,
    },
  };
});

async function buildPayfastPaymentPayload(dataInput = {}) {
  const payfastConfig = getPayfastConfig();

  const normalizedPayload = validateOrderPayload(dataInput);
  const {
    data,
    customerUid,
    customer,
    items,
    totalPrice,
    subtotal,
    shippingCost,
    shipping,
    shippingAddress,
  } = normalizedPayload;
  functions.logger.debug("createPayfastPayment called", { data });

  const requestedReturnUrl = (data?.returnUrl || "").toString().trim();
  const requestedCancelUrl = (data?.cancelUrl || "").toString().trim();
  const returnUrl = requestedReturnUrl || payfastConfig.returnUrl;
  const cancelUrl = requestedCancelUrl || payfastConfig.cancelUrl;
  const modeResolution = resolvePayfastMode({
    returnUrl,
    cancelUrl,
    configuredMode: payfastConfig.configuredMode,
  });
  const resolvedCredentials = ensurePayfastConfig(
    payfastConfig,
    modeResolution.mode,
    { allowModeFallback: !modeResolution.isLocalDevCheckout },
  );
  const payfastUrl = `https://${resolvedCredentials.host}/eng/process`;

  const pendingRef = db.collection(PENDING_COLLECTION).doc();
  const paymentReference = pendingRef.id;
  await pendingRef.set({
    customerUid,
    customer,
    items,
    totalPrice,
    subtotal,
    shippingCost,
    shipping: shipping || null,
    shippingAddress,
    paymentMethod: "payfast",
    status: "pending",
    paymentReference,
    payfastMode: modeResolution.mode,
    payfastHost: resolvedCredentials.host,
    payfastMerchantIdUsed: resolvedCredentials.merchantId || null,
    returnUrl: returnUrl || null,
    cancelUrl: cancelUrl || null,
    isLocalDevCheckout: modeResolution.isLocalDevCheckout,
    payfast: {
      mode: modeResolution.mode,
      host: resolvedCredentials.host,
    },
    createdAt: FIELD_VALUE.serverTimestamp(),
    updatedAt: FIELD_VALUE.serverTimestamp(),
  });
  await upsertCustomerProfileFromOrder({
    customerUid,
    customer,
    shippingAddress,
  });

  const fullName = customer.fullName.trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const nameFirst = trimToLength(nameParts[0] || fullName, 100);
  const nameLast = trimToLength(nameParts.slice(1).join(" "), 100);
  const itemSummary = items
    .map((item) => `${item.quantity} x ${item.name}`)
    .join(" - ");
  const description = trimToLength(itemSummary || "Bethany Blooms Order", 255);
  const itemName = trimToLength(items[0]?.name || "Bethany Blooms Order", 100);
  const paymentMethodCode = normalizePayfastPaymentMethod(
    data?.payfastPaymentMethod || data?.payfast?.paymentMethod || data?.payment_method,
  );

  const fields = {};
  const appendField = (name, value) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    fields[name] = value;
  };

  appendField("merchant_id", resolvedCredentials.merchantId);
  appendField("merchant_key", resolvedCredentials.merchantKey);
  appendField("return_url", returnUrl);
  appendField("cancel_url", cancelUrl);
  appendField("notify_url", payfastConfig.notifyUrl);
  appendField("name_first", nameFirst);
  appendField("name_last", nameLast);
  appendField("email_address", trimToLength(customer.email, 100));
  appendField("cell_number", trimToLength(customer.phone, 100));
  appendField("m_payment_id", trimToLength(paymentReference, 100));
  appendField("amount", toCurrency(totalPrice));
  appendField("item_name", itemName);
  appendField("item_description", description);
  appendField("custom_str1", trimToLength(paymentReference, 255));
  appendField("custom_str2", trimToLength(itemSummary, 255));
  appendField("email_confirmation", 1);
  appendField("confirmation_address", trimToLength(customer.email, 100));
  appendField("payment_method", paymentMethodCode);

  ensurePayfastCheckoutFields(fields);
  const signature = createPayfastCheckoutSignature(fields, resolvedCredentials.passphrase);
  const payload = { ...fields, signature };

  return { url: payfastUrl, fields: payload, mode: modeResolution.mode };
}

function parseSubscriptionMonthKey(value = "") {
  const normalized = normalizePreorderSendMonth(value);
  if (!normalized) return null;
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return { year, month, monthKey: normalized };
}

function getNextMonthKey(monthKey = "") {
  const parsed = parseSubscriptionMonthKey(monthKey);
  if (!parsed) return "";
  const rolloverYear = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  const rolloverMonth = parsed.month === 12 ? 1 : parsed.month + 1;
  return `${rolloverYear}-${String(rolloverMonth).padStart(2, "0")}`;
}

function buildSubscriptionMonthStartDate(monthKey = "") {
  const parsed = parseSubscriptionMonthKey(monthKey);
  if (!parsed) return "";
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-01`;
}

function compareSubscriptionMonthKeys(leftMonthKey = "", rightMonthKey = "") {
  const left = parseSubscriptionMonthKey(leftMonthKey);
  const right = parseSubscriptionMonthKey(rightMonthKey);
  if (!left || !right) return 0;
  const leftIndex = left.year * 12 + left.month;
  const rightIndex = right.year * 12 + right.month;
  return leftIndex - rightIndex;
}

function formatSubscriptionBillingOpenLabel(monthKey = "") {
  const cycleLabel = formatSubscriptionCycleLabel(monthKey);
  if (!cycleLabel) return "the 1st of next month";
  return `01 ${cycleLabel}`;
}

function isInLastFiveDaysOfMonth(now = new Date(), timeZone = SUBSCRIPTION_TIMEZONE) {
  const nowParts = formatTimeZoneDateParts(now, timeZone);
  if (!nowParts.monthKey || !Number.isFinite(nowParts.day) || nowParts.day < 1) {
    return false;
  }
  const daysInMonth = getDaysInMonth(nowParts.year, nowParts.month);
  const windowStartDay = Math.max(1, daysInMonth - (SUBSCRIPTION_PREBILL_LEAD_DAYS - 1));
  return nowParts.day >= windowStartDay;
}

function resolveRecurringRunMode(now = new Date(), timeZone = SUBSCRIPTION_TIMEZONE) {
  const nowParts = formatTimeZoneDateParts(now, timeZone);
  if (!nowParts.monthKey) return SUBSCRIPTION_RECURRING_RUN_MODES.SKIP;
  if (nowParts.day === 1) return SUBSCRIPTION_RECURRING_RUN_MODES.DAY1_FALLBACK;
  if (isInLastFiveDaysOfMonth(now, timeZone)) return SUBSCRIPTION_RECURRING_RUN_MODES.LAST5;
  return SUBSCRIPTION_RECURRING_RUN_MODES.SKIP;
}

function resolveTargetCycleMonth(runMode = "", nowMonthKey = "") {
  const normalizedNowMonthKey = normalizePreorderSendMonth(nowMonthKey);
  if (!normalizedNowMonthKey) return "";
  if (runMode === SUBSCRIPTION_RECURRING_RUN_MODES.LAST5) {
    return getNextMonthKey(normalizedNowMonthKey);
  }
  if (runMode === SUBSCRIPTION_RECURRING_RUN_MODES.DAY1_FALLBACK) {
    return normalizedNowMonthKey;
  }
  return "";
}

function normalizeSubscriptionInvoiceEmailTrigger(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (
    normalized === SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.SCHEDULER_LAST5 ||
    normalized === SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.SCHEDULER_DAY1_FALLBACK ||
    normalized === SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.MANUAL
  ) {
    return normalized;
  }
  return SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.MANUAL;
}

function buildSubscriptionCycleDateRange(cycleMonth = "") {
  const parsed = parseSubscriptionMonthKey(cycleMonth);
  if (!parsed) return { startDate: null, endDate: null };
  const daysInMonth = getDaysInMonth(parsed.year, parsed.month);
  return {
    startDate: `${parsed.year}-${String(parsed.month).padStart(2, "0")}-01`,
    endDate: `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`,
  };
}

function normalizeSubscriptionAction(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "pause" || normalized === "resume" || normalized === "cancel") {
    return normalized;
  }
  return "";
}

function normalizeSubscriptionStatus(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_STATUSES.ACTIVE) return SUBSCRIPTION_STATUSES.ACTIVE;
  if (normalized === SUBSCRIPTION_STATUSES.PAUSED) return SUBSCRIPTION_STATUSES.PAUSED;
  if (normalized === SUBSCRIPTION_STATUSES.CANCELLED) return SUBSCRIPTION_STATUSES.CANCELLED;
  return SUBSCRIPTION_STATUSES.ACTIVE;
}

function normalizeSubscriptionInvoiceStatus(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_INVOICE_STATUSES.PAID) return SUBSCRIPTION_INVOICE_STATUSES.PAID;
  if (normalized === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED) return SUBSCRIPTION_INVOICE_STATUSES.CANCELLED;
  return SUBSCRIPTION_INVOICE_STATUSES.PENDING;
}

function normalizeSubscriptionPaymentMethod(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  return normalized === SUBSCRIPTION_PAYMENT_METHODS.EFT
    ? SUBSCRIPTION_PAYMENT_METHODS.EFT
    : SUBSCRIPTION_PAYMENT_METHODS.PAYFAST;
}

function normalizeSubscriptionPaymentApprovalStatus(value = "", paymentMethod = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.APPROVED) {
    return SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.APPROVED;
  }
  if (normalized === SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.REJECTED) {
    return SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.REJECTED;
  }
  if (normalized === SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.PENDING) {
    return SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.PENDING;
  }
  const normalizedMethod = normalizeSubscriptionPaymentMethod(paymentMethod);
  return normalizedMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT
    ? SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.PENDING
    : SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED;
}

function buildSubscriptionPaymentApprovalState({
  paymentMethod = SUBSCRIPTION_PAYMENT_METHODS.PAYFAST,
  paymentApprovalStatus = "",
} = {}) {
  const normalizedMethod = normalizeSubscriptionPaymentMethod(paymentMethod);
  const normalizedStatus = normalizeSubscriptionPaymentApprovalStatus(
    paymentApprovalStatus,
    normalizedMethod,
  );
  const required = normalizedMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT;
  return {
    required,
    decision: normalizedStatus,
    decidedAt: null,
    decidedByUid: null,
    decidedByEmail: null,
    note: null,
  };
}

function buildSubscriptionCustomerSnapshot(profile = {}, authUser = {}) {
  const profileData = profile && typeof profile === "object" ? profile : {};
  const authData = authUser && typeof authUser === "object" ? authUser : {};
  const fullName =
    trimToLength(profileData.fullName || authData.fullName || authData.name || "", 160) ||
    "Bethany Blooms Customer";
  const email =
    trimToLength(profileData.email || authData.email || "", 160) ||
    "";
  const phone =
    trimToLength(profileData.phone || authData.phone || "", 40) ||
    "";
  return {
    fullName,
    email,
    phone,
  };
}

function resolveProfileAddresses(profile = {}) {
  const profileData = profile && typeof profile === "object" ? profile : {};
  return (Array.isArray(profileData.addresses) ? profileData.addresses : [])
    .map((address) => normalizeCustomerProfileAddress(address))
    .filter(Boolean);
}

function resolveSubscriptionAddress(profile = {}, addressId = "") {
  const addresses = resolveProfileAddresses(profile);
  if (!addresses.length) return null;
  const normalizedAddressId = (addressId || "").toString().trim();
  if (normalizedAddressId) {
    return addresses.find((entry) => entry.id === normalizedAddressId) || null;
  }
  const defaultAddressId = (profile?.defaultAddressId || "").toString().trim();
  if (defaultAddressId) {
    return addresses.find((entry) => entry.id === defaultAddressId) || null;
  }
  return addresses[0] || null;
}

async function loadSubscriptionCustomerSettings(uid = "") {
  const normalizedUid = normalizeCustomerUid(uid);
  if (!normalizedUid) return null;
  const settingsRef = db.collection(SUBSCRIPTION_CUSTOMER_SETTINGS_COLLECTION).doc(normalizedUid);
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) return null;
  return settingsSnap.data() || null;
}

async function isCustomerEftApproved(uid = "") {
  const settings = await loadSubscriptionCustomerSettings(uid);
  return settings?.eftApproved === true;
}

function buildSubscriptionInvoicePayload({
  invoiceId = "",
  invoiceNumber = null,
  subscriptionId = "",
  subscription = {},
  cycleMonth = "",
  amount = 0,
  baseAmount = null,
  adjustments = [],
  invoiceType = SUBSCRIPTION_INVOICE_TYPES.CYCLE,
  baseInvoiceId = null,
  isProrated = false,
  proration = null,
  prorationRatio = null,
  prorationBasis = "remaining-deliveries",
  deliverySchedule = null,
  source = "system",
  paymentMethod = "",
} = {}) {
  const safeAmount = Number(amount);
  const perDeliveryAmount = Number(resolveSubscriptionRecurringAmount(subscription) || 0);
  const customerUid = normalizeCustomerUid(
    subscription?.customerUid || subscription?.customer?.uid || subscription?.uid || "",
  );
  const { startDate, endDate } = buildSubscriptionCycleDateRange(cycleMonth);
  const subscriptionPlan = normalizeSubscriptionPlanSnapshot(
    subscription?.subscriptionPlan || {},
  );
  const subscriptionProduct = normalizeSubscriptionProductSnapshot(
    subscription?.subscriptionProduct || {},
  );
  const deliveryPreference = resolveSubscriptionDeliveryPreference(subscription);
  const resolvedTier = normalizeSubscriptionTier(subscription?.tier || subscriptionPlan?.tier);
  const resolvedStems = normalizeSubscriptionStems(
    subscription?.stems || subscriptionPlan?.stems,
  );
  const normalizedCycleMonth = normalizePreorderSendMonth(cycleMonth);
  const scheduleSnapshot = buildDeliveryScheduleSnapshot({
    tier: resolvedTier,
    mondaySlots: deliveryPreference.slots,
    cycleMonth: normalizedCycleMonth,
    includedDeliveryDates:
      deliverySchedule?.includedDeliveryDates || deliverySchedule?.cycleDeliveryDates || [],
    timeZone: SUBSCRIPTION_TIMEZONE,
  });
  if (
    deliverySchedule &&
    typeof deliverySchedule === "object" &&
    !Array.isArray(deliverySchedule)
  ) {
    scheduleSnapshot.slotModel =
      (deliverySchedule.slotModel || "").toString().trim() ||
      SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL;
    scheduleSnapshot.cutoffRule =
      (deliverySchedule.cutoffRule || "").toString().trim() ||
      SUBSCRIPTION_DELIVERY_CUTOFF_RULE;
    scheduleSnapshot.slots = normalizeMondaySlotsForTier(
      resolvedTier,
      deliverySchedule.slots || scheduleSnapshot.slots,
      { allowDefaults: true },
    );
    scheduleSnapshot.cycleDeliveryDates = Array.from(
      new Set(
        (Array.isArray(deliverySchedule.cycleDeliveryDates)
          ? deliverySchedule.cycleDeliveryDates
          : scheduleSnapshot.cycleDeliveryDates
        )
          .map((dateKey) => normalizeIsoDateKey(dateKey))
          .filter(Boolean),
      ),
    ).sort((a, b) => compareIsoDateKeys(a, b));
    scheduleSnapshot.includedDeliveryDates = Array.from(
      new Set(
        (Array.isArray(deliverySchedule.includedDeliveryDates)
          ? deliverySchedule.includedDeliveryDates
          : scheduleSnapshot.includedDeliveryDates
        )
          .map((dateKey) => normalizeIsoDateKey(dateKey))
          .filter((dateKey) => scheduleSnapshot.cycleDeliveryDates.includes(dateKey)),
      ),
    ).sort((a, b) => compareIsoDateKeys(a, b));
    scheduleSnapshot.totalDeliveries = Number(
      deliverySchedule.totalDeliveries || scheduleSnapshot.cycleDeliveryDates.length || 0,
    );
    scheduleSnapshot.includedDeliveries = Number(
      deliverySchedule.includedDeliveries || scheduleSnapshot.includedDeliveryDates.length || 0,
    );
    scheduleSnapshot.firstDeliveryDate =
      normalizeIsoDateKey(deliverySchedule.firstDeliveryDate || "") ||
      scheduleSnapshot.includedDeliveryDates[0] ||
      scheduleSnapshot.cycleDeliveryDates[0] ||
      null;
  }
  const resolvedProrationRatio = Number(
    prorationRatio ??
      proration?.ratio ??
      (scheduleSnapshot.totalDeliveries > 0
        ? scheduleSnapshot.includedDeliveries / scheduleSnapshot.totalDeliveries
        : 1),
  );
  const planName = trimToLength(
    subscription?.planName || buildSubscriptionPlanLabel(subscription, {}),
    180,
  );
  const totalDeliveries = Number(scheduleSnapshot.totalDeliveries || 0);
  const includedDeliveries = Number(scheduleSnapshot.includedDeliveries || 0);
  const cycleAmount = roundMoney(perDeliveryAmount * totalDeliveries);
  const includedAmount = roundMoney(perDeliveryAmount * includedDeliveries);
  const resolvedBaseAmount = Number(baseAmount);
  const normalizedBaseAmount = Number.isFinite(resolvedBaseAmount)
    ? roundMoney(Math.max(0, resolvedBaseAmount))
    : Number.isFinite(safeAmount)
      ? roundMoney(Math.max(0, safeAmount))
      : Number(includedAmount.toFixed(2));
  const normalizedAdjustments = normalizeSubscriptionInvoiceAdjustments(adjustments || []);
  const adjustmentsTotal = roundMoney(
    normalizedAdjustments.reduce((sum, entry) => sum + Number(entry?.amount || 0), 0),
  );
  const invoiceAmount = roundMoney(normalizedBaseAmount + adjustmentsTotal);
  const normalizedPaymentMethod = normalizeSubscriptionPaymentMethod(
    paymentMethod || subscription?.paymentMethod,
  );
  const paymentApprovalStatus = normalizeSubscriptionPaymentApprovalStatus(
    subscription?.paymentApprovalStatus,
    normalizedPaymentMethod,
  );
  const paymentApproval = buildSubscriptionPaymentApprovalState({
    paymentMethod: normalizedPaymentMethod,
    paymentApprovalStatus,
  });
  const payload = {
    invoiceId,
    invoiceNumber: normalizeInvoiceSequenceNumber(invoiceNumber),
    invoiceType: normalizeSubscriptionInvoiceType(invoiceType),
    baseInvoiceId: trimToLength(baseInvoiceId || "", 160) || null,
    subscriptionId,
    customerUid,
    customer: {
      fullName: trimToLength(subscription?.customer?.fullName || "", 160),
      email: trimToLength(subscription?.customer?.email || "", 160),
      phone: trimToLength(subscription?.customer?.phone || "", 40),
    },
    deliveryAddress: subscription?.address || null,
    deliveryPreference: {
      model: SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL,
      cutoffRule: SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
      slots: deliveryPreference.slots,
    },
    tier: resolvedTier,
    stems: resolvedStems,
    planName,
    subscriptionPlan,
    subscriptionProduct,
    cycleMonth: normalizedCycleMonth,
    cycleLabel: formatSubscriptionCycleLabel(cycleMonth),
    cycleStartDate: startDate,
    cycleEndDate: endDate,
    amount: invoiceAmount,
    baseAmount: normalizedBaseAmount,
    adjustmentsTotal,
    adjustments: normalizedAdjustments,
    monthlyAmount: Number.isFinite(perDeliveryAmount) ? Number(perDeliveryAmount.toFixed(2)) : 0,
    perDeliveryAmount: Number.isFinite(perDeliveryAmount) ? Number(perDeliveryAmount.toFixed(2)) : 0,
    cycleAmount: Number.isFinite(cycleAmount) ? Number(cycleAmount.toFixed(2)) : 0,
    includedAmount: Number.isFinite(includedAmount) ? Number(includedAmount.toFixed(2)) : 0,
    currency: SUBSCRIPTION_CURRENCY,
    status: SUBSCRIPTION_INVOICE_STATUSES.PENDING,
    deliverySchedule: scheduleSnapshot,
    isProrated: Boolean(isProrated),
    prorationRatio:
      Number.isFinite(resolvedProrationRatio) && resolvedProrationRatio > 0
        ? Number(resolvedProrationRatio.toFixed(6))
        : 1,
    prorationBasis: (prorationBasis || "").toString().trim() || "remaining-deliveries",
    proration: isProrated ? {
      ratio:
        Number.isFinite(resolvedProrationRatio) && resolvedProrationRatio > 0
          ? Number(resolvedProrationRatio.toFixed(6))
          : 1,
      totalDeliveries,
      includedDeliveries,
      includedDeliveryDates: scheduleSnapshot.includedDeliveryDates,
    } : null,
    source: (source || "").toString().trim() || "system",
    paymentReference: null,
    paymentMethod: normalizedPaymentMethod,
    paymentApprovalStatus,
    paymentApproval,
    paymentProof: null,
    payfastMode: null,
    payfastHost: null,
    payfast: null,
    payLink: null,
    email: {
      status: ORDER_NOTIFICATION_STATUSES.SKIPPED,
      attempts: 0,
      lastError: null,
      recipient: trimToLength(subscription?.customer?.email || "", 160) || null,
      lastAttemptAt: null,
      sentAt: null,
    },
    createdAt: FIELD_VALUE.serverTimestamp(),
    updatedAt: FIELD_VALUE.serverTimestamp(),
    paidAt: null,
    cancelledAt: null,
  };
  return payload;
}

async function createOrGetSubscriptionInvoice({
  subscriptionId = "",
  subscription = {},
  cycleMonth = "",
  amount = 0,
  baseAmount = null,
  adjustments = [],
  invoiceType = SUBSCRIPTION_INVOICE_TYPES.CYCLE,
  baseInvoiceId = null,
  includeRecurringCharges = true,
  isProrated = false,
  proration = null,
  prorationRatio = null,
  prorationBasis = "remaining-deliveries",
  deliverySchedule = null,
  source = "system",
  paymentMethod = "",
} = {}) {
  const normalizedSubscriptionId = (subscriptionId || "").toString().trim();
  const normalizedCycleMonth = normalizePreorderSendMonth(cycleMonth);
  const normalizedInvoiceType = normalizeSubscriptionInvoiceType(invoiceType);
  const normalizedCustomerUid = normalizeCustomerUid(
    subscription?.customerUid || subscription?.customer?.uid || subscription?.uid || "",
  );
  if (!normalizedSubscriptionId || !normalizedCycleMonth) {
    throw new Error("Subscription invoice cycle is invalid.");
  }
  if (normalizedInvoiceType !== SUBSCRIPTION_INVOICE_TYPES.CYCLE) {
    throw new Error("createOrGetSubscriptionInvoice only supports cycle invoices.");
  }

  const invoiceId = buildSubscriptionInvoiceDocumentId(normalizedSubscriptionId, normalizedCycleMonth);
  const invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoiceId);
  const orderCounterRef = db.doc("config/orderCounter");
  const invoiceCounterRef = db.doc("config/invoiceCounter");
  let created = false;
  let invoiceData = null;

  await db.runTransaction(async (transaction) => {
    const allocateNextInvoiceNumber = async () => {
      const [orderCounterSnapshot, invoiceCounterSnapshot] = await Promise.all([
        transaction.get(orderCounterRef),
        transaction.get(invoiceCounterRef),
      ]);
      const currentOrder = orderCounterSnapshot.exists ? Number(orderCounterSnapshot.data().value) : 999;
      const currentInvoice = invoiceCounterSnapshot.exists ? Number(invoiceCounterSnapshot.data().value) : 999;
      const safeOrder = Number.isFinite(currentOrder) ? currentOrder : 999;
      const safeInvoice = Number.isFinite(currentInvoice) ? currentInvoice : 999;
      const nextInvoice = Math.max(safeOrder, safeInvoice) + 1;
      transaction.set(invoiceCounterRef, { value: nextInvoice }, { merge: true });
      return nextInvoice;
    };

    const snapshot = await transaction.get(invoiceRef);
    if (snapshot.exists) {
      const existingData = snapshot.data() || {};
      const existingInvoiceNumber = normalizeInvoiceSequenceNumber(existingData.invoiceNumber);
      const existingCustomerUid = normalizeCustomerUid(existingData.customerUid || "");
      const existingFinancials = resolveSubscriptionInvoiceFinancialSnapshot(existingData);
      const patchPayload = {};
      let nextInvoiceNumber = existingInvoiceNumber;
      if (!nextInvoiceNumber) {
        nextInvoiceNumber = await allocateNextInvoiceNumber();
        patchPayload.invoiceNumber = nextInvoiceNumber;
      }
      if (!existingCustomerUid && normalizedCustomerUid) {
        patchPayload.customerUid = normalizedCustomerUid;
      }
      if (!existingData.invoiceType) {
        patchPayload.invoiceType = SUBSCRIPTION_INVOICE_TYPES.CYCLE;
      }
      if (!Object.prototype.hasOwnProperty.call(existingData, "baseAmount")) {
        patchPayload.baseAmount = existingFinancials.baseAmount;
      }
      if (!Object.prototype.hasOwnProperty.call(existingData, "adjustmentsTotal")) {
        patchPayload.adjustmentsTotal = existingFinancials.adjustmentsTotal;
      }
      if (!Array.isArray(existingData.adjustments) && existingFinancials.adjustments.length) {
        patchPayload.adjustments = existingFinancials.adjustments;
      }
      if (
        !Object.prototype.hasOwnProperty.call(existingData, "baseInvoiceId") &&
        existingFinancials.baseInvoiceId
      ) {
        patchPayload.baseInvoiceId = existingFinancials.baseInvoiceId;
      }
      if (Object.keys(patchPayload).length > 0) {
        patchPayload.updatedAt = FIELD_VALUE.serverTimestamp();
        transaction.set(invoiceRef, patchPayload, { merge: true });
      }
      invoiceData = {
        invoiceId,
        ...existingData,
        ...patchPayload,
        invoiceNumber: nextInvoiceNumber,
      };
      return;
    }
    let normalizedAdjustments = normalizeSubscriptionInvoiceAdjustments(adjustments || []);
    if (includeRecurringCharges) {
      const recurringAdjustments = buildRecurringChargeAdjustments({
        subscription,
        invoice: {
          deliverySchedule:
            deliverySchedule && typeof deliverySchedule === "object" && !Array.isArray(deliverySchedule)
              ? deliverySchedule
              : null,
          tier: normalizeSubscriptionTier(
            subscription?.tier || subscription?.subscriptionPlan?.tier || "",
          ),
        },
      });
      normalizedAdjustments = normalizeSubscriptionInvoiceAdjustments([
        ...normalizedAdjustments,
        ...recurringAdjustments,
      ]);
    }
    const nextInvoiceNumber = await allocateNextInvoiceNumber();
    const payload = buildSubscriptionInvoicePayload({
      invoiceId,
      invoiceNumber: nextInvoiceNumber,
      subscriptionId: normalizedSubscriptionId,
      subscription,
      cycleMonth: normalizedCycleMonth,
      amount,
      baseAmount,
      adjustments: normalizedAdjustments,
      invoiceType: normalizedInvoiceType,
      baseInvoiceId,
      isProrated,
      proration,
      prorationRatio,
      prorationBasis,
      deliverySchedule,
      source,
      paymentMethod,
    });
    transaction.set(invoiceRef, payload, { merge: true });
    created = true;
    invoiceData = { invoiceId, ...payload };
  });

  if (!invoiceData) {
    const latestSnap = await invoiceRef.get();
    invoiceData = latestSnap.exists ? { invoiceId, ...latestSnap.data() } : null;
  }

  return {
    invoiceId,
    invoiceRef,
    invoice: invoiceData,
    created,
  };
}

async function createSubscriptionTopUpInvoice({
  subscriptionId = "",
  subscription = {},
  cycleMonth = "",
  baseInvoiceId = "",
  deliverySchedule = null,
  source = "admin-topup",
  paymentMethod = "",
} = {}) {
  const normalizedSubscriptionId = (subscriptionId || "").toString().trim();
  const normalizedCycleMonth = normalizePreorderSendMonth(cycleMonth);
  const normalizedBaseInvoiceId = (baseInvoiceId || "").toString().trim();
  if (!normalizedSubscriptionId || !normalizedCycleMonth) {
    throw new Error("Subscription top-up cycle is invalid.");
  }
  const invoiceId = buildSubscriptionTopUpInvoiceDocumentId(
    normalizedSubscriptionId,
    normalizedCycleMonth,
  );
  const invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoiceId);
  const orderCounterRef = db.doc("config/orderCounter");
  const invoiceCounterRef = db.doc("config/invoiceCounter");
  let invoiceData = null;

  await db.runTransaction(async (transaction) => {
    const [orderCounterSnapshot, invoiceCounterSnapshot] = await Promise.all([
      transaction.get(orderCounterRef),
      transaction.get(invoiceCounterRef),
    ]);
    const currentOrder = orderCounterSnapshot.exists ? Number(orderCounterSnapshot.data().value) : 999;
    const currentInvoice = invoiceCounterSnapshot.exists ? Number(invoiceCounterSnapshot.data().value) : 999;
    const safeOrder = Number.isFinite(currentOrder) ? currentOrder : 999;
    const safeInvoice = Number.isFinite(currentInvoice) ? currentInvoice : 999;
    const nextInvoiceNumber = Math.max(safeOrder, safeInvoice) + 1;
    transaction.set(invoiceCounterRef, { value: nextInvoiceNumber }, { merge: true });

    const payload = buildSubscriptionInvoicePayload({
      invoiceId,
      invoiceNumber: nextInvoiceNumber,
      subscriptionId: normalizedSubscriptionId,
      subscription,
      cycleMonth: normalizedCycleMonth,
      amount: 0,
      baseAmount: 0,
      adjustments: [],
      invoiceType: SUBSCRIPTION_INVOICE_TYPES.TOPUP,
      baseInvoiceId: normalizedBaseInvoiceId || null,
      isProrated: false,
      proration: null,
      prorationRatio: 1,
      prorationBasis: "remaining-deliveries",
      deliverySchedule,
      source,
      paymentMethod,
    });
    transaction.set(invoiceRef, payload, { merge: true });
    invoiceData = { invoiceId, ...payload };
  });

  return {
    invoiceId,
    invoiceRef,
    invoice: invoiceData,
    created: true,
  };
}

async function ensurePendingCycleTopUpInvoice({
  subscriptionId = "",
  subscription = {},
  cycleMonth = "",
  baseInvoice = null,
  source = "admin-topup",
} = {}) {
  const cycleInvoices = await loadCycleInvoices(subscriptionId, cycleMonth);
  const existingPendingTopup = getLatestPendingTopUpInvoice(cycleInvoices);
  if (existingPendingTopup) {
    const invoiceId = (existingPendingTopup.id || existingPendingTopup.invoiceId || "").toString().trim();
    return {
      invoiceId,
      invoiceRef: db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoiceId),
      invoice: existingPendingTopup,
      created: false,
      cycleInvoices,
    };
  }

  const createdTopup = await createSubscriptionTopUpInvoice({
    subscriptionId,
    subscription,
    cycleMonth,
    baseInvoiceId:
      (baseInvoice?.id || baseInvoice?.invoiceId || "").toString().trim() || null,
    deliverySchedule: baseInvoice?.deliverySchedule || null,
    source,
    paymentMethod: normalizeSubscriptionPaymentMethod(
      subscription?.paymentMethod || baseInvoice?.paymentMethod,
    ),
  });
  return {
    ...createdTopup,
    cycleInvoices: [...cycleInvoices, createdTopup.invoice],
  };
}

async function loadSubscriptionInvoices(subscriptionId = "") {
  const normalizedSubscriptionId = (subscriptionId || "").toString().trim();
  if (!normalizedSubscriptionId) return [];
  const snapshot = await db
    .collection(SUBSCRIPTION_INVOICES_COLLECTION)
    .where("subscriptionId", "==", normalizedSubscriptionId)
    .get();
  const rows = snapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ...docSnapshot.data(),
  }));
  return rows.sort(sortSubscriptionInvoicesNewestFirst);
}

async function loadCycleInvoices(subscriptionId = "", cycleMonth = "") {
  const normalizedCycleMonth = normalizePreorderSendMonth(cycleMonth);
  if (!normalizedCycleMonth) return [];
  const invoices = await loadSubscriptionInvoices(subscriptionId);
  return invoices.filter(
    (invoice) => normalizePreorderSendMonth(invoice?.cycleMonth || "") === normalizedCycleMonth,
  );
}

function getLatestPendingTopUpInvoice(cycleInvoices = []) {
  const rows = Array.isArray(cycleInvoices) ? cycleInvoices : [];
  return rows
    .filter((invoice) =>
      normalizeSubscriptionInvoiceType(invoice?.invoiceType || "") === SUBSCRIPTION_INVOICE_TYPES.TOPUP &&
      normalizeSubscriptionInvoiceStatus(invoice?.status || "") === SUBSCRIPTION_INVOICE_STATUSES.PENDING,
    )
    .sort(sortSubscriptionInvoicesNewestFirst)[0] || null;
}

async function loadLatestPendingSubscriptionInvoice(subscriptionId = "") {
  const invoices = await loadSubscriptionInvoices(subscriptionId);
  return invoices.find((invoice) => normalizeSubscriptionInvoiceStatus(invoice.status) === SUBSCRIPTION_INVOICE_STATUSES.PENDING) || null;
}

async function supersedePendingSubscriptionPayfastSessionsForInvoice(
  invoiceId = "",
  reason = "invoice-updated",
) {
  const normalizedInvoiceId = (invoiceId || "").toString().trim();
  if (!normalizedInvoiceId) return 0;
  const snap = await db
    .collection(PENDING_SUBSCRIPTION_PAYFAST_COLLECTION)
    .where("invoiceId", "==", normalizedInvoiceId)
    .get();
  if (snap.empty) return 0;
  let updated = 0;
  const batch = db.batch();
  snap.docs.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    const currentStatus = (data.status || "").toString().trim().toLowerCase();
    if (currentStatus === "completed") return;
    batch.set(
      docSnapshot.ref,
      {
        status: "superseded",
        supersededAt: FIELD_VALUE.serverTimestamp(),
        supersededReason: trimToLength(reason || "invoice-updated", 240),
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
    updated += 1;
  });
  if (updated > 0) {
    await batch.commit();
  }
  return updated;
}

async function invalidateSubscriptionInvoicePayfastState({
  invoiceRef = null,
  invoiceId = "",
  reason = "invoice-updated",
} = {}) {
  const normalizedInvoiceId = (invoiceId || "").toString().trim();
  if (!invoiceRef || !normalizedInvoiceId) return 0;
  await Promise.all([
    invoiceRef.set(
      {
        payLink: null,
        paymentReference: null,
        payfastMode: null,
        payfastHost: null,
        payfast: null,
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    ),
    supersedePendingSubscriptionPayfastSessionsForInvoice(normalizedInvoiceId, reason),
  ]);
  return 1;
}

function buildSubscriptionInvoiceRecalculation({
  invoice = {},
  baseAmount = null,
  adjustments = null,
} = {}) {
  const currentFinancials = resolveSubscriptionInvoiceFinancialSnapshot(invoice);
  const nextBaseAmount = Number(baseAmount);
  const safeBaseAmount = Number.isFinite(nextBaseAmount)
    ? roundMoney(Math.max(0, nextBaseAmount))
    : currentFinancials.baseAmount;
  const nextAdjustments = adjustments == null ? currentFinancials.adjustments : adjustments;
  const totals = recomputeSubscriptionInvoiceTotals({
    baseAmount: safeBaseAmount,
    adjustments: nextAdjustments,
  });
  return {
    previousAmount: roundMoney(Number(invoice?.amount || 0)),
    previousBaseAmount: currentFinancials.baseAmount,
    previousAdjustmentsTotal: currentFinancials.adjustmentsTotal,
    previousAdjustments: currentFinancials.adjustments,
    ...totals,
    amountChanged: roundMoney(Number(invoice?.amount || 0)) !== totals.amount,
  };
}

async function issueSubscriptionSignupConfirmationEmail({
  subscriptionId = "",
  subscription = {},
  firstBillingMonth = "",
} = {}) {
  const normalizedSubscriptionId = (subscriptionId || "").toString().trim();
  const customerEmail = trimToLength(subscription?.customer?.email || "", 160);
  if (!normalizedSubscriptionId) {
    throw new Error("Subscription reference is required.");
  }

  let emailStatus = ORDER_NOTIFICATION_STATUSES.SKIPPED;
  let emailError = null;

  if (!customerEmail) {
    emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
    emailError = "Customer email is missing.";
  } else if (!getResendClient()) {
    emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
    emailError = "Email service is not configured.";
  } else {
    try {
      const html = buildSubscriptionSignupConfirmationEmailHtml({
        subscription,
        firstBillingMonth,
      });
      const sendResult = await sendEmailWithRetry({
        to: customerEmail,
        subject: `Bethany Blooms - Subscription confirmed (${firstBillingMonth || "next month"})`,
        html,
        retryCount: 1,
        retryDelayMs: 1200,
      });
      emailError = sendResult?.finalResult?.error || null;
      emailStatus = emailError ? ORDER_NOTIFICATION_STATUSES.FAILED : ORDER_NOTIFICATION_STATUSES.SENT;
    } catch (error) {
      emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
      emailError = error?.message || "Unable to send subscription confirmation email.";
    }
  }

  return {
    emailStatus,
    emailError,
  };
}

async function issueSubscriptionInvoiceEmail({
  subscriptionId = "",
  subscription = {},
  invoiceId = "",
  invoice = {},
  triggerContext = null,
} = {}) {
  const normalizedSubscriptionId = (subscriptionId || "").toString().trim();
  const normalizedInvoiceId = (invoiceId || "").toString().trim();
  if (!normalizedSubscriptionId || !normalizedInvoiceId) {
    throw new Error("Subscription invoice reference is required.");
  }

  const invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(normalizedInvoiceId);
  const customerEmail = trimToLength(
    subscription?.customer?.email || invoice?.customer?.email || "",
    160,
  );
  const invoicePaymentMethod = normalizeSubscriptionPaymentMethod(
    invoice?.paymentMethod || subscription?.paymentMethod,
  );
  const paymentApprovalStatus = normalizeSubscriptionPaymentApprovalStatus(
    invoice?.paymentApprovalStatus ||
      invoice?.paymentApproval?.decision ||
      subscription?.paymentApprovalStatus,
    invoicePaymentMethod,
  );
  const attempts = Number(invoice?.email?.attempts || 0) + 1;
  const payToken =
    invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.PAYFAST
      ? createSubscriptionPayLinkToken()
      : "";
  const tokenHash =
    invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.PAYFAST
      ? hashSubscriptionPayLinkToken(payToken)
      : "";
  const expiresAtDate =
    invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.PAYFAST
      ? new Date(Date.now() + SUBSCRIPTION_PAYLINK_TTL_MS)
      : null;
  const payLinkUrl =
    invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.PAYFAST
      ? buildSubscriptionPayLinkUrl(normalizedInvoiceId, payToken)
      : "";
  const normalizedTrigger = normalizeSubscriptionInvoiceEmailTrigger(
    triggerContext?.trigger ||
      triggerContext?.source ||
      triggerContext?.type ||
      triggerContext ||
      SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.MANUAL,
  );
  const triggerCycleMonth = normalizePreorderSendMonth(
    triggerContext?.cycleMonth || invoice?.cycleMonth || "",
  );
  let invoiceDocument = null;
  let invoiceAttachment = null;
  let documentWarning = null;

  try {
    const generatedDocument = await generateSubscriptionInvoiceDocument({
      subscriptionId: normalizedSubscriptionId,
      invoiceId: normalizedInvoiceId,
      subscription,
      invoice,
    });
    invoiceDocument = generatedDocument?.document || null;
    if (generatedDocument?.pdfBytes?.length) {
      invoiceAttachment = {
        filename:
          (invoiceDocument?.fileName || buildSubscriptionInvoicePdfFileName("invoice")).toString(),
        content: generatedDocument.pdfBytes.toString("base64"),
      };
    }
  } catch (error) {
    documentWarning = error?.message || "Unable to generate subscription invoice PDF.";
    functions.logger.error("Subscription invoice document generation failed", {
      subscriptionId: normalizedSubscriptionId,
      invoiceId: normalizedInvoiceId,
      error: documentWarning,
    });
  }

  let emailStatus = ORDER_NOTIFICATION_STATUSES.SKIPPED;
  let emailError = null;
  let sentAt = null;

  if (!customerEmail) {
    emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
    emailError = "Customer email is missing.";
  } else if (!getResendClient()) {
    emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
    emailError = "Email service is not configured.";
  } else {
    const normalizedInvoicePayload = {
      ...invoice,
      invoiceId: normalizedInvoiceId,
      invoiceNumber: normalizeInvoiceSequenceNumber(invoice?.invoiceNumber),
      amount: Number(invoice?.amount || 0),
      cycleMonth: invoice?.cycleMonth,
      paymentMethod: invoicePaymentMethod,
      paymentApprovalStatus,
    };
    const html = invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT
      ? buildSubscriptionEftInvoiceEmailHtml({
          subscription: {
            ...subscription,
            paymentMethod: invoicePaymentMethod,
            paymentApprovalStatus,
          },
          invoice: normalizedInvoicePayload,
          invoiceDownloadUrl: (invoiceDocument?.downloadUrl || "").toString().trim(),
        })
      : buildSubscriptionInvoiceEmailHtml({
          subscription: {
            ...subscription,
            paymentMethod: invoicePaymentMethod,
            paymentApprovalStatus,
          },
          invoice: normalizedInvoicePayload,
          payLinkUrl,
          invoiceDownloadUrl: (invoiceDocument?.downloadUrl || "").toString().trim(),
        });
    const emailSubject = invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT
      ? `Bethany Blooms - Subscription EFT invoice ${invoice?.cycleMonth || ""}`.trim()
      : `Bethany Blooms - Subscription invoice ${invoice?.cycleMonth || ""}`.trim();
    const sendResult = await sendEmailWithRetry({
      to: customerEmail,
      subject: emailSubject,
      html,
      attachments: invoiceAttachment ? [invoiceAttachment] : [],
      retryCount: 1,
      retryDelayMs: 1200,
    });
    emailError = sendResult?.finalResult?.error || null;
    if (emailError) {
      emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
    } else {
      emailStatus = ORDER_NOTIFICATION_STATUSES.SENT;
      sentAt = FIELD_VALUE.serverTimestamp();
    }
  }

  const payLinkPayload =
    invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.PAYFAST
      ? {
          tokenHash,
          issuedAt: FIELD_VALUE.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
        }
      : null;

  await invoiceRef.set(
    {
      payLink: payLinkPayload,
      paymentMethod: invoicePaymentMethod,
      paymentApprovalStatus,
      paymentApproval: {
        ...buildSubscriptionPaymentApprovalState({
          paymentMethod: invoicePaymentMethod,
          paymentApprovalStatus,
        }),
        ...(invoice?.paymentApproval && typeof invoice.paymentApproval === "object" && !Array.isArray(invoice.paymentApproval)
          ? {
              decidedAt: invoice.paymentApproval?.decidedAt || null,
              decidedByUid: invoice.paymentApproval?.decidedByUid || null,
              decidedByEmail: invoice.paymentApproval?.decidedByEmail || null,
              note: invoice.paymentApproval?.note || null,
            }
          : {}),
      },
      ...(invoiceDocument ? { document: invoiceDocument } : {}),
      email: {
        status: emailStatus,
        attempts,
        lastTrigger: normalizedTrigger,
        lastTriggerCycleMonth: triggerCycleMonth || null,
        lastError: emailError ? emailError.toString().slice(0, 500) : null,
        documentWarning: documentWarning ? documentWarning.toString().slice(0, 500) : null,
        recipient: customerEmail || null,
        paymentMethod: invoicePaymentMethod,
        lastAttemptAt: FIELD_VALUE.serverTimestamp(),
        sentAt,
      },
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    emailStatus,
    emailError: emailError || null,
    documentWarning: documentWarning || null,
    payLinkUrl,
    payLinkExpiresAt: expiresAtDate ? expiresAtDate.toISOString() : "",
    paymentMethod: invoicePaymentMethod,
    invoiceDownloadUrl: (invoiceDocument?.downloadUrl || "").toString().trim(),
    invoiceFileName: (invoiceDocument?.fileName || "").toString().trim(),
  };
}

async function resolveSubscriptionByIdForUser(subscriptionId = "", auth = {}) {
  const normalizedSubscriptionId = (subscriptionId || "").toString().trim();
  const authUid = (auth?.uid || "").toString().trim();
  const authEmail = (auth?.token?.email || "").toString().trim().toLowerCase();
  if (!normalizedSubscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }
  if (!authUid) {
    throw new HttpsError("unauthenticated", "Sign in to manage subscriptions.");
  }

  const subscriptionRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc(normalizedSubscriptionId);
  const subscriptionSnap = await subscriptionRef.get();
  if (!subscriptionSnap.exists) {
    throw new HttpsError("not-found", "Subscription not found.");
  }
  const subscription = subscriptionSnap.data() || {};
  const customerUid = normalizeCustomerUid(subscription.customerUid);
  const customerEmail = (subscription.customer?.email || "").toString().trim().toLowerCase();
  const ownerMatches = customerUid === authUid || (authEmail && customerEmail && customerEmail === authEmail);
  if (!ownerMatches && !isAdminContext(auth)) {
    throw new HttpsError("permission-denied", "You do not have access to this subscription.");
  }

  return {
    subscriptionId: normalizedSubscriptionId,
    subscriptionRef,
    subscription,
  };
}

async function resolveSubscriptionByIdForAdmin(subscriptionId = "") {
  const normalizedSubscriptionId = (subscriptionId || "").toString().trim();
  if (!normalizedSubscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }
  const subscriptionRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc(normalizedSubscriptionId);
  const subscriptionSnap = await subscriptionRef.get();
  if (!subscriptionSnap.exists) {
    throw new HttpsError("not-found", "Subscription not found.");
  }
  return {
    subscriptionId: normalizedSubscriptionId,
    subscriptionRef,
    subscription: subscriptionSnap.data() || {},
  };
}

async function resolveSubscriptionPlanByIdForAdmin(planId = "") {
  const normalizedPlanId = (planId || "").toString().trim();
  if (!normalizedPlanId) {
    throw new HttpsError("invalid-argument", "Plan ID is required.");
  }
  const planRef = db.collection(SUBSCRIPTION_PLANS_COLLECTION).doc(normalizedPlanId);
  const planSnap = await planRef.get();
  if (!planSnap.exists) {
    throw new HttpsError("not-found", "Subscription plan not found.");
  }
  const rawPlan = { id: planSnap.id, ...(planSnap.data() || {}) };
  const normalizedStatus = normalizeSubscriptionPlanStatus(rawPlan?.status || "");
  if (normalizedStatus !== SUBSCRIPTION_PLAN_STATUSES.LIVE) {
    throw new HttpsError("failed-precondition", "Only live subscription plans can be assigned.");
  }
  const resolvedPlan = resolveSubscriptionPlanFromDocument({
    ...rawPlan,
    status: SUBSCRIPTION_PLAN_STATUSES.LIVE,
  });
  if (!resolvedPlan) {
    throw new HttpsError("failed-precondition", "The selected subscription plan configuration is invalid.");
  }
  return {
    planId: normalizedPlanId,
    planRef,
    plan: resolvedPlan,
  };
}

function normalizeAdminSubscriptionStatusInput(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_STATUSES.ACTIVE) return SUBSCRIPTION_STATUSES.ACTIVE;
  if (normalized === SUBSCRIPTION_STATUSES.PAUSED) return SUBSCRIPTION_STATUSES.PAUSED;
  if (normalized === SUBSCRIPTION_STATUSES.CANCELLED) return SUBSCRIPTION_STATUSES.CANCELLED;
  return "";
}

function normalizeAdminSubscriptionInvoiceStatusInput(value = "") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === SUBSCRIPTION_INVOICE_STATUSES.PENDING) return SUBSCRIPTION_INVOICE_STATUSES.PENDING;
  if (normalized === SUBSCRIPTION_INVOICE_STATUSES.PAID) return SUBSCRIPTION_INVOICE_STATUSES.PAID;
  if (normalized === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED) return SUBSCRIPTION_INVOICE_STATUSES.CANCELLED;
  return "";
}

function normalizeAdminOverrideReason(value = "") {
  return (value || "").toString().trim().slice(0, 500);
}

async function writeSubscriptionAdminAuditLog({
  actionType = "",
  actorUid = "",
  actorEmail = "",
  subscriptionId = "",
  invoiceId = null,
  cycleMonth = null,
  fromStatus = null,
  toStatus = null,
  reason = "",
  meta = null,
} = {}) {
  const normalizedActionType = (actionType || "").toString().trim();
  if (!normalizedActionType) {
    throw new Error("Audit action type is required.");
  }
  const normalizedReason = normalizeAdminOverrideReason(reason);
  if (!normalizedReason) {
    throw new Error("Audit reason is required.");
  }
  const payload = {
    actionType: normalizedActionType,
    subscriptionId: (subscriptionId || "").toString().trim() || null,
    invoiceId: (invoiceId || "").toString().trim() || null,
    cycleMonth: normalizePreorderSendMonth(cycleMonth || "") || null,
    fromStatus: (fromStatus || "").toString().trim().toLowerCase() || null,
    toStatus: (toStatus || "").toString().trim().toLowerCase() || null,
    reason: normalizedReason,
    actorUid: (actorUid || "").toString().trim() || null,
    actorEmail: (actorEmail || "").toString().trim().toLowerCase() || null,
    createdAt: FIELD_VALUE.serverTimestamp(),
    meta: meta && typeof meta === "object" && !Array.isArray(meta) ? meta : null,
  };
  await db.collection(SUBSCRIPTION_ADMIN_AUDIT_LOGS_COLLECTION).add(payload);
}

function buildSubscriptionInvoiceAdjustmentEntry({
  source = SUBSCRIPTION_ADJUSTMENT_SOURCES.EXTRA_CHARGE,
  label = "Adjustment",
  amount = 0,
  basis = SUBSCRIPTION_CHARGE_BASES.FLAT,
  mode = SUBSCRIPTION_CHARGE_MODES.ONE_TIME,
  reason = "",
  chargeId = "",
  actorUid = "",
  actorEmail = "",
} = {}) {
  const nowTimestamp = admin.firestore.Timestamp.now();
  return normalizeSubscriptionInvoiceAdjustment({
    adjustmentId: createSubscriptionChargeId(),
    chargeId: trimToLength(chargeId || "", 120) || null,
    source,
    label: trimToLength(label || "Adjustment", 180),
    amount: roundMoney(amount),
    basis: normalizeSubscriptionChargeBasis(basis),
    mode: normalizeSubscriptionChargeMode(mode),
    reason: normalizeAdminOverrideReason(reason) || null,
    createdAt: nowTimestamp,
    createdByUid: trimToLength(actorUid || "", 128) || null,
    createdByEmail: trimToLength(actorEmail || "", 160) || null,
  });
}

function buildSubscriptionRecurringChargeEntry({
  chargeId = "",
  label = "Recurring charge",
  amount = 0,
  basis = SUBSCRIPTION_CHARGE_BASES.FLAT,
  reason = "",
  actorUid = "",
  actorEmail = "",
} = {}) {
  const nowTimestamp = admin.firestore.Timestamp.now();
  const safeAmount = toPositiveMoneyAmount(amount);
  if (!safeAmount) return null;
  return {
    chargeId: trimToLength(chargeId || "", 120) || createSubscriptionChargeId(),
    label: trimToLength(label || "Recurring charge", 180),
    amount: safeAmount,
    basis: normalizeSubscriptionChargeBasis(basis),
    status: SUBSCRIPTION_CHARGE_STATUSES.ACTIVE,
    reason: normalizeAdminOverrideReason(reason) || null,
    createdAt: nowTimestamp,
    createdByUid: trimToLength(actorUid || "", 128) || null,
    createdByEmail: trimToLength(actorEmail || "", 160) || null,
    removedAt: null,
    removedByUid: null,
    removedByEmail: null,
    removedReason: null,
  };
}

function mergeSubscriptionRecurringCharges({
  existingCharges = [],
  nextCharge = null,
} = {}) {
  const normalizedExisting = resolveSubscriptionRecurringCharges({
    billingCharges: {
      recurring: Array.isArray(existingCharges) ? existingCharges : [],
    },
  });
  if (!nextCharge) {
    return normalizedExisting;
  }
  return [...normalizedExisting, normalizeSubscriptionRecurringCharge(nextCharge)].filter(Boolean);
}

async function applySubscriptionInvoiceFinancialUpdate({
  invoiceRef = null,
  invoiceId = "",
  invoice = {},
  baseAmount = null,
  adjustments = null,
  actorUid = "",
  actorEmail = "",
  actionType = "",
  reason = "",
  additionalFields = {},
} = {}) {
  if (!invoiceRef) {
    throw new Error("Invoice reference is required.");
  }
  const normalizedInvoiceId = (invoiceId || "").toString().trim();
  const currentInvoice = invoice && typeof invoice === "object" ? invoice : {};
  const recalculated = buildSubscriptionInvoiceRecalculation({
    invoice: currentInvoice,
    baseAmount,
    adjustments,
  });

  const updatePayload = {
    baseAmount: recalculated.baseAmount,
    adjustmentsTotal: recalculated.adjustmentsTotal,
    adjustments: recalculated.adjustments,
    amount: recalculated.amount,
    updatedAt: FIELD_VALUE.serverTimestamp(),
    ...(additionalFields && typeof additionalFields === "object" && !Array.isArray(additionalFields)
      ? additionalFields
      : {}),
  };
  if (actionType) {
    updatePayload.adminOverride = {
      actionType: trimToLength(actionType, 120) || null,
      reason: normalizeAdminOverrideReason(reason) || null,
      actorUid: trimToLength(actorUid || "", 128) || null,
      actorEmail: trimToLength(actorEmail || "", 160) || null,
      at: FIELD_VALUE.serverTimestamp(),
      source: "admin-console",
      previousAmount: recalculated.previousAmount,
      nextAmount: recalculated.amount,
    };
  }

  await invoiceRef.set(updatePayload, { merge: true });

  const invoicePaymentMethod = normalizeSubscriptionPaymentMethod(
    currentInvoice?.paymentMethod || "",
  );
  if (
    recalculated.amountChanged &&
    normalizedInvoiceId &&
    invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.PAYFAST &&
    normalizeSubscriptionInvoiceStatus(currentInvoice?.status || "") === SUBSCRIPTION_INVOICE_STATUSES.PENDING
  ) {
    await invalidateSubscriptionInvoicePayfastState({
      invoiceRef,
      invoiceId: normalizedInvoiceId,
      reason: actionType || "invoice-amount-updated",
    });
  }

  const refreshedSnap = await invoiceRef.get();
  const refreshedInvoice = refreshedSnap.exists ? refreshedSnap.data() || {} : {};
  return {
    invoice: refreshedInvoice,
    amountChanged: recalculated.amountChanged,
    previousAmount: recalculated.previousAmount,
    nextAmount: recalculated.amount,
  };
}

async function resolveSubscriptionInvoiceForUser(invoiceId = "", auth = {}) {
  const normalizedInvoiceId = (invoiceId || "").toString().trim();
  if (!normalizedInvoiceId) {
    throw new HttpsError("invalid-argument", "Invoice ID is required.");
  }

  const invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(normalizedInvoiceId);
  const invoiceSnap = await invoiceRef.get();
  if (!invoiceSnap.exists) {
    throw new HttpsError("not-found", "Subscription invoice not found.");
  }
  const invoice = invoiceSnap.data() || {};
  const subscriptionId = (invoice.subscriptionId || "").toString().trim();
  if (!subscriptionId) {
    throw new HttpsError("failed-precondition", "Subscription reference is missing on this invoice.");
  }

  const { subscriptionRef, subscription } = await resolveSubscriptionByIdForUser(
    subscriptionId,
    auth,
  );

  return {
    invoiceId: normalizedInvoiceId,
    invoiceRef,
    invoice,
    subscriptionId,
    subscriptionRef,
    subscription,
  };
}

function buildSampleSubscriptionInvoicePreviewData() {
  const now = new Date();
  const nowParts = formatTimeZoneDateParts(now, SUBSCRIPTION_TIMEZONE);
  const cycleMonth = nowParts.monthKey || "2026-02";
  const invoiceId = `preview-${Date.now().toString(36)}`;
  const subscriptionId = "preview-subscription";
  const customer = {
    fullName: "Preview Customer",
    email: "preview@bethanyblooms.co.za",
    phone: "0744555590",
  };
  const address = normalizeCustomerProfileAddress({
    id: "preview-address",
    label: "Home",
    street: "2 Paul Roos Str",
    suburb: "Unitas Park",
    city: "Vereeniging",
    province: "Gauteng",
    postalCode: "1943",
  });
  const subscriptionPlan = normalizeSubscriptionPlanSnapshot({
    id: "preview-plan",
    name: "Signature Seasonal Blooms",
    description: "Weekly or monthly fresh flower deliveries.",
    tier: "weekly",
    stems: 32,
    monthlyAmount: 1499,
    categoryId: "subscriptions",
    categoryName: "Subscriptions",
    status: "live",
    currency: SUBSCRIPTION_CURRENCY,
  });
  const subscription = {
    subscriptionId,
    customerUid: "preview-user",
    customer,
    address,
    tier: "weekly",
    stems: 32,
    planName: "Signature Seasonal Blooms",
    subscriptionPlan,
    subscriptionProduct: null,
    monthlyAmount: 1499,
    currency: SUBSCRIPTION_CURRENCY,
  };
  const invoice = {
    invoiceId,
    invoiceNumber: 1201,
    invoiceType: SUBSCRIPTION_INVOICE_TYPES.CYCLE,
    baseInvoiceId: null,
    subscriptionId,
    customer,
    deliveryAddress: address,
    tier: "weekly",
    stems: 32,
    planName: "Signature Seasonal Blooms",
    subscriptionPlan,
    subscriptionProduct: null,
    cycleMonth,
    amount: 1499,
    baseAmount: 1499,
    adjustmentsTotal: 0,
    adjustments: [],
    monthlyAmount: 1499,
    currency: SUBSCRIPTION_CURRENCY,
    status: SUBSCRIPTION_INVOICE_STATUSES.PENDING,
    isProrated: false,
    proration: null,
    payLink: {
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      ),
    },
    createdAt: admin.firestore.Timestamp.fromDate(now),
    updatedAt: admin.firestore.Timestamp.fromDate(now),
  };

  return {
    source: "sample",
    invoiceId,
    subscriptionId,
    subscription,
    invoice,
  };
}

async function resolveSubscriptionInvoiceForAdminPreview(invoiceId = "") {
  const normalizedInvoiceId = (invoiceId || "").toString().trim();
  if (!normalizedInvoiceId) {
    return buildSampleSubscriptionInvoicePreviewData();
  }

  const invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(normalizedInvoiceId);
  const invoiceSnap = await invoiceRef.get();
  if (!invoiceSnap.exists) {
    throw new HttpsError("not-found", "Subscription invoice not found.");
  }
  const invoice = invoiceSnap.data() || {};
  const subscriptionId = (invoice.subscriptionId || "").toString().trim();
  let subscription = {};

  if (subscriptionId) {
    const subscriptionSnap = await db.collection(SUBSCRIPTIONS_COLLECTION).doc(subscriptionId).get();
    if (subscriptionSnap.exists) {
      subscription = subscriptionSnap.data() || {};
    }
  }

  const fallbackAddress = normalizeCustomerProfileAddress(
    invoice?.deliveryAddress || subscription?.address || {},
  );
  const fallbackCustomer = {
    fullName: trimToLength(
      invoice?.customer?.fullName || subscription?.customer?.fullName || "Bethany Blooms Customer",
      160,
    ),
    email: trimToLength(
      invoice?.customer?.email || subscription?.customer?.email || "",
      160,
    ),
    phone: trimToLength(
      invoice?.customer?.phone || subscription?.customer?.phone || "",
      40,
    ),
  };
  const normalizedSubscription = {
    ...subscription,
    subscriptionId: subscriptionId || "subscription-preview",
    customer: fallbackCustomer,
    address: fallbackAddress || null,
    tier: normalizeSubscriptionTier(subscription?.tier || invoice?.tier),
    stems: normalizeSubscriptionStems(subscription?.stems || invoice?.stems),
    planName: trimToLength(
      subscription?.planName || invoice?.planName || buildSubscriptionPlanLabel(subscription, invoice),
      180,
    ),
    subscriptionPlan: normalizeSubscriptionPlanSnapshot(
      subscription?.subscriptionPlan || invoice?.subscriptionPlan || {},
    ),
    subscriptionProduct: normalizeSubscriptionProductSnapshot(
      subscription?.subscriptionProduct || invoice?.subscriptionProduct || {},
    ),
    monthlyAmount:
      resolveSubscriptionRecurringAmount(subscription) ||
      Number(invoice?.monthlyAmount || invoice?.amount || 0),
    perDeliveryAmount:
      resolveSubscriptionRecurringAmount(subscription) ||
      Number(invoice?.perDeliveryAmount || invoice?.monthlyAmount || invoice?.amount || 0),
  };
  const normalizedPerDeliveryAmount = Number.isFinite(Number(invoice?.perDeliveryAmount))
    ? Number(invoice.perDeliveryAmount)
    : Number(normalizedSubscription.perDeliveryAmount || normalizedSubscription.monthlyAmount || 0);
  const normalizedTotalDeliveries = Number(invoice?.deliverySchedule?.totalDeliveries || 0);
  const normalizedInvoice = {
    ...invoice,
    invoiceId: normalizedInvoiceId,
    invoiceNumber: normalizeInvoiceSequenceNumber(invoice?.invoiceNumber),
    invoiceType: normalizeSubscriptionInvoiceType(invoice?.invoiceType || ""),
    baseInvoiceId: trimToLength(invoice?.baseInvoiceId || "", 160) || null,
    subscriptionId: subscriptionId || normalizedSubscription.subscriptionId,
    customer: fallbackCustomer,
    deliveryAddress: fallbackAddress || null,
    planName: trimToLength(
      invoice?.planName || normalizedSubscription.planName || "",
      180,
    ),
    subscriptionPlan: normalizeSubscriptionPlanSnapshot(
      invoice?.subscriptionPlan || normalizedSubscription.subscriptionPlan || {},
    ),
    subscriptionProduct: normalizeSubscriptionProductSnapshot(
      invoice?.subscriptionProduct || normalizedSubscription.subscriptionProduct || {},
    ),
    cycleMonth: normalizePreorderSendMonth(invoice?.cycleMonth || "") || formatTimeZoneDateParts(new Date(), SUBSCRIPTION_TIMEZONE).monthKey,
    amount: Number.isFinite(Number(invoice?.amount)) ? Number(invoice.amount) : 0,
    baseAmount: Number.isFinite(Number(invoice?.baseAmount))
      ? Number(invoice.baseAmount)
      : Number(invoice?.amount || 0),
    adjustmentsTotal: Number.isFinite(Number(invoice?.adjustmentsTotal))
      ? Number(invoice.adjustmentsTotal)
      : 0,
    adjustments: normalizeSubscriptionInvoiceAdjustments(invoice?.adjustments || []),
    monthlyAmount:
      Number.isFinite(Number(invoice?.monthlyAmount)) ?
        Number(invoice.monthlyAmount)
      : Number(normalizedSubscription.monthlyAmount || 0),
    perDeliveryAmount: normalizedPerDeliveryAmount,
    cycleAmount:
      Number.isFinite(Number(invoice?.cycleAmount))
        ? Number(invoice.cycleAmount)
        : roundMoney(normalizedPerDeliveryAmount * normalizedTotalDeliveries),
    status: normalizeSubscriptionInvoiceStatus(invoice?.status),
  };
  const recalculatedFinancials = resolveSubscriptionInvoiceFinancialSnapshot(normalizedInvoice);
  normalizedInvoice.baseAmount = recalculatedFinancials.baseAmount;
  normalizedInvoice.adjustmentsTotal = recalculatedFinancials.adjustmentsTotal;
  normalizedInvoice.adjustments = recalculatedFinancials.adjustments;
  normalizedInvoice.amount = recalculatedFinancials.amount;
  normalizedInvoice.invoiceType = recalculatedFinancials.invoiceType;
  normalizedInvoice.baseInvoiceId = recalculatedFinancials.baseInvoiceId;

  return {
    source: "invoice",
    invoiceId: normalizedInvoiceId,
    subscriptionId: normalizedInvoice.subscriptionId || "subscription-preview",
    subscription: normalizedSubscription,
    invoice: normalizedInvoice,
  };
}

exports.createPayfastPayment = onCall(() => {
  throw new HttpsError(
    "failed-precondition",
    "Use the HTTP endpoint createPayfastPaymentHttp instead.",
  );
});

exports.createPayfastPaymentHttp = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    try {
      const payload = await buildPayfastPaymentPayload(req.body ?? {});
      res.status(200).json(payload);
    } catch (error) {
      functions.logger.error("Create PayFast payment failed", error);
      res.status(400).json({ error: error.message || "Payment creation failed." });
    }
  });
});

exports.createSubscriptionPayfastPaymentHttp = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    try {
      const data = req.body ?? {};
      const invoiceId = (data?.invoiceId || "").toString().trim();
      const token = (data?.token || "").toString().trim();
      if (!invoiceId || !token) {
        throw new Error("Subscription invoice and pay link token are required.");
      }

      const invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoiceId);
      const invoiceSnap = await invoiceRef.get();
      if (!invoiceSnap.exists) {
        throw new Error("Subscription invoice not found.");
      }
      const invoice = invoiceSnap.data() || {};
      const invoicePaymentMethod = normalizeSubscriptionPaymentMethod(
        invoice?.paymentMethod || "",
      );
      if (invoicePaymentMethod !== SUBSCRIPTION_PAYMENT_METHODS.PAYFAST) {
        throw new Error("This invoice is configured for EFT and cannot be paid via PayFast.");
      }
      if (normalizeSubscriptionInvoiceStatus(invoice.status) !== SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
        throw new Error("This subscription invoice is no longer payable.");
      }

      if (!verifySubscriptionPayLinkToken(invoice, token)) {
        throw new Error("Invalid payment link.");
      }

      const payLinkExpiry = coerceTimestampToDate(invoice?.payLink?.expiresAt);
      if (!payLinkExpiry || payLinkExpiry.getTime() < Date.now()) {
        throw new Error("This payment link has expired. Request a new pay link from your account.");
      }

      const subscriptionId = (invoice.subscriptionId || "").toString().trim();
      if (!subscriptionId) {
        throw new Error("Subscription reference is missing on this invoice.");
      }
      const subscriptionRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc(subscriptionId);
      const subscriptionSnap = await subscriptionRef.get();
      if (!subscriptionSnap.exists) {
        throw new Error("Subscription not found.");
      }
      const subscription = subscriptionSnap.data() || {};
      const customer = {
        fullName: trimToLength(invoice?.customer?.fullName || subscription?.customer?.fullName || "Customer", 160),
        email: trimToLength(invoice?.customer?.email || subscription?.customer?.email || "", 160),
        phone: trimToLength(invoice?.customer?.phone || subscription?.customer?.phone || "", 40),
      };
      if (!customer.email) {
        throw new Error("Customer email is missing on this subscription.");
      }

      const payfastConfig = getPayfastConfig();
      const requestedReturnUrl = (data?.returnUrl || "").toString().trim();
      const requestedCancelUrl = (data?.cancelUrl || "").toString().trim();
      const accountUrl = `${getCanonicalSiteUrl()}/account`;
      const returnUrl = requestedReturnUrl || payfastConfig.returnUrl || accountUrl;
      const cancelUrl = requestedCancelUrl || payfastConfig.cancelUrl || accountUrl;
      const modeResolution = resolvePayfastMode({
        returnUrl,
        cancelUrl,
        configuredMode: payfastConfig.configuredMode,
      });
      const resolvedCredentials = ensurePayfastConfig(
        payfastConfig,
        modeResolution.mode,
        { allowModeFallback: !modeResolution.isLocalDevCheckout },
      );
      const payfastUrl = `https://${resolvedCredentials.host}/eng/process`;

      const pendingRef = db.collection(PENDING_SUBSCRIPTION_PAYFAST_COLLECTION).doc();
      const paymentReference = pendingRef.id;
      const amount = Number(invoice.amount || 0);
      const { firstName, lastName } = splitContactName(customer.fullName);
      const planLabel = buildSubscriptionPlanLabel(subscription, invoice);
      const itemName = trimToLength(
        `Flower subscription ${planLabel}`,
        100,
      );
      const itemDescription = trimToLength(
        `Subscription invoice ${invoice.cycleMonth || ""} - ${subscriptionId}`,
        255,
      );

      await pendingRef.set({
        paymentReference,
        invoiceId,
        subscriptionId,
        customerUid: normalizeCustomerUid(subscription.customerUid),
        customer,
        tier: normalizeSubscriptionTier(subscription.tier),
        stems: normalizeSubscriptionStems(subscription.stems),
        planName: trimToLength(planLabel, 180),
        subscriptionPlan: normalizeSubscriptionPlanSnapshot(
          subscription?.subscriptionPlan || invoice?.subscriptionPlan || {},
        ),
        subscriptionProduct: normalizeSubscriptionProductSnapshot(
          subscription?.subscriptionProduct || invoice?.subscriptionProduct || {},
        ),
        deliveryPreference: resolveSubscriptionDeliveryPreference(subscription),
        deliverySchedule: {
          slotModel:
            (invoice?.deliverySchedule?.slotModel || "").toString().trim() ||
            SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL,
          cutoffRule:
            (invoice?.deliverySchedule?.cutoffRule || "").toString().trim() ||
            SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
          slots: normalizeMondaySlotsForTier(
            normalizeSubscriptionTier(subscription.tier),
            invoice?.deliverySchedule?.slots || subscription?.deliveryPreference?.slots || [],
            { allowDefaults: true },
          ),
          cycleDeliveryDates: Array.isArray(invoice?.deliverySchedule?.cycleDeliveryDates)
            ? invoice.deliverySchedule.cycleDeliveryDates
            : [],
          includedDeliveryDates: Array.isArray(invoice?.deliverySchedule?.includedDeliveryDates)
            ? invoice.deliverySchedule.includedDeliveryDates
            : [],
          totalDeliveries: Number(invoice?.deliverySchedule?.totalDeliveries || 0),
          includedDeliveries: Number(invoice?.deliverySchedule?.includedDeliveries || 0),
          firstDeliveryDate:
            normalizeIsoDateKey(invoice?.deliverySchedule?.firstDeliveryDate || "") || null,
        },
        cycleMonth: normalizePreorderSendMonth(invoice.cycleMonth),
        invoiceType: normalizeSubscriptionInvoiceType(invoice?.invoiceType || ""),
        baseInvoiceId: trimToLength(invoice?.baseInvoiceId || "", 160) || null,
        amount: Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0,
        baseAmount: roundMoney(Number(invoice?.baseAmount || amount || 0)),
        adjustmentsTotal: roundMoney(Number(invoice?.adjustmentsTotal || 0)),
        adjustments: normalizeSubscriptionInvoiceAdjustments(invoice?.adjustments || []),
        currency: SUBSCRIPTION_CURRENCY,
        status: "pending",
        payfastMode: modeResolution.mode,
        payfastHost: resolvedCredentials.host,
        payfastMerchantIdUsed: resolvedCredentials.merchantId || null,
        returnUrl: returnUrl || null,
        cancelUrl: cancelUrl || null,
        createdAt: FIELD_VALUE.serverTimestamp(),
        updatedAt: FIELD_VALUE.serverTimestamp(),
      });

      await invoiceRef.set(
        {
          paymentMethod: "payfast",
          paymentReference,
          payfastMode: modeResolution.mode,
          payfastHost: resolvedCredentials.host,
          updatedAt: FIELD_VALUE.serverTimestamp(),
        },
        { merge: true },
      );

      const fields = {};
      const appendField = (name, value) => {
        if (value === undefined || value === null || value === "") return;
        fields[name] = value;
      };

      appendField("merchant_id", resolvedCredentials.merchantId);
      appendField("merchant_key", resolvedCredentials.merchantKey);
      appendField("return_url", returnUrl);
      appendField("cancel_url", cancelUrl);
      appendField("notify_url", payfastConfig.notifyUrl);
      appendField("name_first", firstName);
      appendField("name_last", lastName);
      appendField("email_address", trimToLength(customer.email, 100));
      appendField("cell_number", trimToLength(customer.phone, 100));
      appendField("m_payment_id", trimToLength(paymentReference, 100));
      appendField("amount", toCurrency(amount));
      appendField("item_name", itemName);
      appendField("item_description", itemDescription);
      appendField("custom_str1", trimToLength(paymentReference, 255));
      appendField("custom_str2", trimToLength(invoiceId, 255));
      appendField("custom_str3", trimToLength(subscriptionId, 255));
      appendField("email_confirmation", 1);
      appendField("confirmation_address", trimToLength(customer.email, 100));

      ensurePayfastCheckoutFields(fields);
      const signature = createPayfastCheckoutSignature(fields, resolvedCredentials.passphrase);
      const payload = { ...fields, signature };

      res.status(200).json({
        url: payfastUrl,
        fields: payload,
        mode: modeResolution.mode,
      });
    } catch (error) {
      functions.logger.error("Create subscription PayFast payment failed", error);
      res.status(400).json({ error: error?.message || "Unable to create subscription payment." });
    }
  });
});

exports.createCustomerSubscription = onCall(async (request) => {
  const authUid = (request.auth?.uid || "").toString().trim();
  if (!authUid) {
    throw new HttpsError("unauthenticated", "Sign in to create a subscription.");
  }
  await assertCustomerSubscriptionRequest(request.auth || {});

  const payload = request.data || {};
  const planId = (payload.planId || payload.productId || "").toString().trim();
  const addressId = (payload.addressId || "").toString().trim();
  const paymentMethod = normalizeSubscriptionPaymentMethod(payload?.paymentMethod || "");
  if (!planId) {
    throw new HttpsError("invalid-argument", "Choose a subscription plan.");
  }

  const planRef = db.collection(SUBSCRIPTION_PLANS_COLLECTION).doc(planId);
  const planSnap = await planRef.get();
  if (!planSnap.exists) {
    throw new HttpsError("not-found", "The selected subscription plan was not found.");
  }
  const rawPlan = { id: planSnap.id, ...(planSnap.data() || {}) };
  const planStatus = normalizeSubscriptionPlanStatus(rawPlan?.status || "");
  if (planStatus !== SUBSCRIPTION_PLAN_STATUSES.LIVE) {
    throw new HttpsError("failed-precondition", "This subscription plan is currently unavailable.");
  }
  const categoryId = (rawPlan?.categoryId || "").toString().trim();
  if (!categoryId) {
    throw new HttpsError(
      "failed-precondition",
      "This subscription plan is missing a linked category.",
    );
  }
  const categoryRef = db.collection("productCategories").doc(categoryId);
  const categorySnap = await categoryRef.get();
  if (!categorySnap.exists) {
    throw new HttpsError("failed-precondition", "This subscription plan category is invalid.");
  }
  const categoryData = categorySnap.data() || {};
  const planRecord = {
    ...rawPlan,
    categoryId,
    categoryName:
      (rawPlan?.categoryName || categoryData?.name || categoryData?.slug || categoryId)
        .toString()
        .trim(),
    status: SUBSCRIPTION_PLAN_STATUSES.LIVE,
  };
  const resolvedPlan = resolveSubscriptionPlanFromDocument(planRecord);
  if (!resolvedPlan) {
    throw new HttpsError(
      "failed-precondition",
      "This subscription plan configuration is invalid.",
    );
  }


  const profileRef = db.collection(CUSTOMER_PROFILES_COLLECTION).doc(authUid);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    throw new HttpsError("failed-precondition", "Customer profile not found. Save your profile first.");
  }
  const profile = profileSnap.data() || {};
  const selectedAddress = resolveSubscriptionAddress(profile, addressId);
  if (!selectedAddress) {
    throw new HttpsError("invalid-argument", "Select a valid delivery address for this subscription.");
  }

  const customer = buildSubscriptionCustomerSnapshot(profile, {
    email: request.auth?.token?.email || "",
    name: request.auth?.token?.name || "",
  });
  if (!customer.email) {
    throw new HttpsError("failed-precondition", "Customer email is missing. Update your account profile.");
  }
  if (!getResendClient()) {
    throw new HttpsError(
      "failed-precondition",
      "Subscription signup is unavailable right now. Pay-now email service is not configured.",
    );
  }
  if (paymentMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT) {
    const eftApproved = await isCustomerEftApproved(authUid);
    if (!eftApproved) {
      throw new HttpsError(
        "failed-precondition",
        `EFT is admin-approved only for subscriptions. Please contact us on WhatsApp: ${COMPANY_WHATSAPP_URL}`,
      );
    }
  }

  const nowDate = new Date();
  const nowParts = formatTimeZoneDateParts(nowDate, SUBSCRIPTION_TIMEZONE);
  const signupMonth = nowParts.monthKey;
  if (!signupMonth) {
    throw new HttpsError("internal", "Unable to resolve billing cycle month.");
  }
  const normalizedTier = normalizeSubscriptionTier(resolvedPlan.tier);
  const perDeliveryAmount = roundMoney(resolvedPlan.monthlyAmount);
  if (!normalizedTier || !perDeliveryAmount) {
    throw new HttpsError("failed-precondition", "Subscription plan pricing is invalid.");
  }

  const requestedMondaySlots = Array.isArray(payload?.mondaySlots)
    ? payload.mondaySlots
    : [];
  const normalizedMondaySlots = normalizeMondaySlotsForTier(
    normalizedTier,
    requestedMondaySlots,
    { allowDefaults: true },
  );
  const requiredSlotCount = resolveTierRequiredDeliveryCount(normalizedTier);
  if (normalizedTier !== "weekly" && normalizedMondaySlots.length !== requiredSlotCount) {
    throw new HttpsError(
      "invalid-argument",
      normalizedTier === "bi-weekly"
        ? "Select 2 Monday delivery slots for bi-weekly subscriptions."
        : "Select a Monday delivery slot for monthly subscriptions.",
    );
  }

  const signupInvoicePlan = calculateSignupInvoicePlan({
    tier: normalizedTier,
    monthlyAmount: perDeliveryAmount,
    mondaySlots: normalizedMondaySlots,
    signupMonth,
    signupDate: nowDate,
    timeZone: SUBSCRIPTION_TIMEZONE,
  });
  const firstInvoiceCycleMonth = normalizePreorderSendMonth(signupInvoicePlan.cycleMonth);
  if (!firstInvoiceCycleMonth) {
    throw new HttpsError("internal", "Unable to resolve the first invoice cycle.");
  }
  const nextBillingMonth = getNextMonthKey(firstInvoiceCycleMonth);
  if (!nextBillingMonth) {
    throw new HttpsError("internal", "Unable to resolve next billing month.");
  }

  const deliveryPreference = {
    model: SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL,
    cutoffRule: SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
    slots: normalizedMondaySlots,
  };
  const subscriptionRef = db.collection(SUBSCRIPTIONS_COLLECTION).doc();
  const subscriptionId = subscriptionRef.id;
  const paymentApprovalRequired = paymentMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT;
  const paymentApprovalStatus = normalizeSubscriptionPaymentApprovalStatus(
    "",
    paymentMethod,
  );
  const subscriptionSnapshot = {
    customerUid: authUid,
    customer,
    address: selectedAddress,
    tier: normalizedTier,
    stems: normalizeSubscriptionStems(resolvedPlan.stems),
    planName: trimToLength(resolvedPlan.planName || "", 180),
    subscriptionPlan: resolvedPlan.subscriptionPlan || null,
    subscriptionProduct: resolvedPlan.subscriptionProduct || null,
    monthlyAmount: perDeliveryAmount,
    perDeliveryAmount,
    deliveryPreference,
    paymentMethod,
    paymentApprovalRequired,
    paymentApprovalStatus,
  };

  await subscriptionRef.set(
    {
      subscriptionId,
      ...subscriptionSnapshot,
      currency: SUBSCRIPTION_CURRENCY,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      billingDay: SUBSCRIPTION_BILLING_DAY,
      billingTimeZone: SUBSCRIPTION_TIMEZONE,
      currentCycleMonth: firstInvoiceCycleMonth,
      nextBillingMonth,
      firstDeliveryDate: signupInvoicePlan.deliverySchedule?.firstDeliveryDate || null,
      createdAt: FIELD_VALUE.serverTimestamp(),
      updatedAt: FIELD_VALUE.serverTimestamp(),
      pausedAt: null,
      resumedAt: null,
      cancelledAt: null,
      lastInvoiceId: null,
      lastInvoiceMonth: null,
      lastPaymentAt: null,
      lastPaidInvoiceId: null,
    },
    { merge: true },
  );

  const createdInvoice = await createOrGetSubscriptionInvoice({
    subscriptionId,
    subscription: {
      ...subscriptionSnapshot,
      currentCycleMonth: firstInvoiceCycleMonth,
      nextBillingMonth,
    },
    cycleMonth: firstInvoiceCycleMonth,
    amount: signupInvoicePlan.invoiceAmount,
    isProrated: signupInvoicePlan.isProrated,
    proration: {
      ratio: signupInvoicePlan.prorationRatio,
      totalDeliveries: Number(signupInvoicePlan.deliverySchedule?.totalDeliveries || 0),
      includedDeliveries: Number(signupInvoicePlan.deliverySchedule?.includedDeliveries || 0),
      includedDeliveryDates: signupInvoicePlan.deliverySchedule?.includedDeliveryDates || [],
    },
    prorationRatio: signupInvoicePlan.prorationRatio,
    prorationBasis: signupInvoicePlan.prorationBasis,
    deliverySchedule: signupInvoicePlan.deliverySchedule,
    source: "signup",
    paymentMethod: normalizeSubscriptionPaymentMethod(subscriptionSnapshot.paymentMethod),
  });
  const invoiceId = createdInvoice.invoiceId;
  const invoice = createdInvoice.invoice || {};

  let emailDispatch = {
    emailStatus: ORDER_NOTIFICATION_STATUSES.FAILED,
    emailError: "Unable to send subscription invoice email.",
    documentWarning: null,
    payLinkUrl: "",
    invoiceDownloadUrl: "",
    invoiceFileName: "",
  };
  try {
    emailDispatch = await issueSubscriptionInvoiceEmail({
      subscriptionId,
      subscription: {
        ...subscriptionSnapshot,
        currentCycleMonth: firstInvoiceCycleMonth,
        nextBillingMonth,
      },
      invoiceId,
      invoice,
      triggerContext: {
        trigger: SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.MANUAL,
        cycleMonth: firstInvoiceCycleMonth,
      },
    });
  } catch (error) {
    functions.logger.error("Subscription signup invoice email failed", {
      subscriptionId,
      invoiceId,
      error: error?.message || error,
    });
    emailDispatch = {
      ...emailDispatch,
      emailStatus: ORDER_NOTIFICATION_STATUSES.FAILED,
      emailError: error?.message || "Unable to send subscription invoice email.",
    };
  }

  if (emailDispatch.emailStatus !== ORDER_NOTIFICATION_STATUSES.SENT) {
    const rollbackResults = await Promise.allSettled([
      subscriptionRef.delete(),
      createdInvoice.created ? db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoiceId).delete() : Promise.resolve(),
    ]);
    const rollbackFailures = rollbackResults.filter((result) => result.status === "rejected");
    if (rollbackFailures.length > 0) {
      functions.logger.error("Subscription signup rollback failed", {
        subscriptionId,
        invoiceId,
        rollbackFailures: rollbackFailures.map((result) => result.reason?.message || result.reason || "unknown"),
      });
      throw new HttpsError(
        "internal",
        "Unable to complete subscription signup right now. Please try again.",
      );
    }
    throw new HttpsError(
      "failed-precondition",
      "Unable to send the pay-now email right now. Your subscription was not created. Please try again.",
    );
  }

  await subscriptionRef.set(
    {
      currentCycleMonth: firstInvoiceCycleMonth,
      nextBillingMonth,
      firstDeliveryDate: signupInvoicePlan.deliverySchedule?.firstDeliveryDate || null,
      lastInvoiceId: invoiceId,
      lastInvoiceMonth: firstInvoiceCycleMonth,
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  const firstDeliveryDate = signupInvoicePlan.deliverySchedule?.firstDeliveryDate || "";
  const deliveryDates = Array.isArray(signupInvoicePlan.deliverySchedule?.includedDeliveryDates)
    ? signupInvoicePlan.deliverySchedule.includedDeliveryDates
    : [];
  const cycleDeliveryDates = Array.isArray(signupInvoicePlan.deliverySchedule?.cycleDeliveryDates)
    ? signupInvoicePlan.deliverySchedule.cycleDeliveryDates
    : [];
  const invoiceAmount = roundMoney(signupInvoicePlan.invoiceAmount);
  const cycleAmount = roundMoney(signupInvoicePlan.cycleAmount || invoiceAmount);

  return {
    subscriptionId,
    invoiceId,
    planId,
    planName: trimToLength(resolvedPlan.planName || "", 180),
    paymentMethod,
    paymentApprovalStatus: normalizeSubscriptionPaymentApprovalStatus("", paymentMethod),
    cycleMonth: firstInvoiceCycleMonth,
    nextBillingMonth,
    firstDeliveryDate,
    deliveryDates,
    cycleDeliveryDates,
    mondaySlots: normalizedMondaySlots,
    invoiceAmount,
    monthlyAmount: perDeliveryAmount,
    perDeliveryAmount,
    cycleAmount,
    isProrated: Boolean(signupInvoicePlan.isProrated),
    prorationRatio: Number(signupInvoicePlan.prorationRatio || 0),
    emailStatus: emailDispatch.emailStatus,
    emailError: emailDispatch.emailError,
    payLinkUrl: emailDispatch.payLinkUrl || "",
    invoiceDownloadUrl: emailDispatch.invoiceDownloadUrl || "",
    invoiceFileName: emailDispatch.invoiceFileName || "",
    firstBillingMonth: firstInvoiceCycleMonth,
    firstPaymentOpensOn: buildSubscriptionMonthStartDate(firstInvoiceCycleMonth),
  };
});

exports.updateCustomerSubscriptionDeliveryPreferences = onCall(async (request) => {
  await assertCustomerSubscriptionRequest(request.auth || {});
  const {
    subscriptionId,
    subscriptionRef,
    subscription,
  } = await resolveSubscriptionByIdForUser(request.data?.subscriptionId, request.auth);

  const currentStatus = normalizeSubscriptionStatus(subscription.status);
  if (currentStatus !== SUBSCRIPTION_STATUSES.ACTIVE && currentStatus !== SUBSCRIPTION_STATUSES.PAUSED) {
    throw new HttpsError(
      "failed-precondition",
      "Delivery preferences can only be updated for active or paused subscriptions.",
    );
  }

  const normalizedTier = normalizeSubscriptionTier(
    subscription?.tier || subscription?.subscriptionPlan?.tier,
  );
  if (!normalizedTier) {
    throw new HttpsError("failed-precondition", "Subscription tier is invalid.");
  }

  const requestedMondaySlots = Array.isArray(request.data?.mondaySlots)
    ? request.data.mondaySlots
    : [];
  const normalizedMondaySlots = normalizeMondaySlotsForTier(
    normalizedTier,
    requestedMondaySlots,
    { allowDefaults: false },
  );
  const requiredSlotCount = resolveTierRequiredDeliveryCount(normalizedTier);
  if (normalizedTier !== "weekly" && normalizedMondaySlots.length !== requiredSlotCount) {
    throw new HttpsError(
      "invalid-argument",
      normalizedTier === "bi-weekly"
        ? "Select 2 Monday delivery slots."
        : "Select 1 Monday delivery slot.",
    );
  }

  const nowMonth = formatTimeZoneDateParts(new Date(), SUBSCRIPTION_TIMEZONE).monthKey;
  const existingNextBillingMonth = normalizePreorderSendMonth(subscription?.nextBillingMonth || "");
  const defaultEffectiveCycle = getNextMonthKey(nowMonth);
  const effectiveFromCycleMonth =
    existingNextBillingMonth &&
    compareSubscriptionMonthKeys(existingNextBillingMonth, nowMonth) > 0
      ? existingNextBillingMonth
      : defaultEffectiveCycle || existingNextBillingMonth || "";

  await subscriptionRef.set(
    {
      deliveryPreference: {
        model: SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL,
        cutoffRule: SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
        slots: normalizedTier === "weekly"
          ? [...SUBSCRIPTION_MONDAY_SLOT_VALUES]
          : normalizedMondaySlots,
      },
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    subscriptionId,
    mondaySlots:
      normalizedTier === "weekly"
        ? [...SUBSCRIPTION_MONDAY_SLOT_VALUES]
        : normalizedMondaySlots,
    tier: normalizedTier,
    effectiveFromCycleMonth,
  };
});

exports.updateCustomerSubscriptionStatus = onCall(async (request) => {
  await assertCustomerSubscriptionRequest(request.auth || {});

  const action = normalizeSubscriptionAction(request.data?.action);
  if (!action) {
    throw new HttpsError("invalid-argument", "Action must be pause, resume, or cancel.");
  }

  const { subscriptionId, subscriptionRef, subscription } = await resolveSubscriptionByIdForUser(
    request.data?.subscriptionId,
    request.auth,
  );
  const currentStatus = normalizeSubscriptionStatus(subscription.status);
  const updatePayload = {
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };
  let nextStatus = currentStatus;

  if (action === "pause") {
    if (currentStatus === SUBSCRIPTION_STATUSES.CANCELLED) {
      throw new HttpsError("failed-precondition", "Cancelled subscriptions cannot be paused.");
    }
    nextStatus = SUBSCRIPTION_STATUSES.PAUSED;
    updatePayload.status = SUBSCRIPTION_STATUSES.PAUSED;
    updatePayload.pausedAt = FIELD_VALUE.serverTimestamp();
  } else if (action === "resume") {
    if (currentStatus === SUBSCRIPTION_STATUSES.CANCELLED) {
      throw new HttpsError("failed-precondition", "Cancelled subscriptions cannot be resumed.");
    }
    nextStatus = SUBSCRIPTION_STATUSES.ACTIVE;
    updatePayload.status = SUBSCRIPTION_STATUSES.ACTIVE;
    updatePayload.resumedAt = FIELD_VALUE.serverTimestamp();
  } else if (action === "cancel") {
    nextStatus = SUBSCRIPTION_STATUSES.CANCELLED;
    updatePayload.status = SUBSCRIPTION_STATUSES.CANCELLED;
    updatePayload.cancelledAt = FIELD_VALUE.serverTimestamp();
  }

  await subscriptionRef.set(updatePayload, { merge: true });

  if (action === "cancel") {
    const invoiceRows = await loadSubscriptionInvoices(subscriptionId);
    const batch = db.batch();
    let changeCount = 0;
    invoiceRows.forEach((invoice) => {
      if (normalizeSubscriptionInvoiceStatus(invoice.status) !== SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
        return;
      }
      batch.set(
        db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoice.id || invoice.invoiceId),
        {
          status: SUBSCRIPTION_INVOICE_STATUSES.CANCELLED,
          cancelledAt: FIELD_VALUE.serverTimestamp(),
          updatedAt: FIELD_VALUE.serverTimestamp(),
        },
        { merge: true },
      );
      changeCount += 1;
    });
    if (changeCount) {
      await batch.commit();
    }
  }

  return {
    subscriptionId,
    status: nextStatus,
  };
});

exports.sendSubscriptionInvoiceEmailNow = onCall(async (request) => {
  await assertCustomerSubscriptionRequest(request.auth || {});

  const { subscriptionId, subscription } = await resolveSubscriptionByIdForUser(
    request.data?.subscriptionId,
    request.auth,
  );

  let invoice = await loadLatestPendingSubscriptionInvoice(subscriptionId);
  let invoiceId = invoice?.id || invoice?.invoiceId || "";

  if (!invoice) {
    const currentStatus = normalizeSubscriptionStatus(subscription.status);
    if (currentStatus !== SUBSCRIPTION_STATUSES.ACTIVE) {
      throw new HttpsError("failed-precondition", "Only active subscriptions can create new invoices.");
    }
    const normalizedTier = normalizeSubscriptionTier(
      subscription?.tier || subscription?.subscriptionPlan?.tier,
    );
    if (!normalizedTier) {
      throw new HttpsError("failed-precondition", "Subscription tier is invalid.");
    }
    const recurringAmount = resolveSubscriptionRecurringAmount(subscription);
    if (!recurringAmount) {
      throw new HttpsError("failed-precondition", "Subscription plan pricing is invalid.");
    }
    const nowParts = formatTimeZoneDateParts(new Date(), SUBSCRIPTION_TIMEZONE);
    const cycleMonth = nowParts.monthKey;
    if (!cycleMonth) {
      throw new HttpsError("internal", "Unable to resolve current billing cycle.");
    }
    const nextBillingMonth = normalizePreorderSendMonth(subscription?.nextBillingMonth || "");
    if (nextBillingMonth && compareSubscriptionMonthKeys(cycleMonth, nextBillingMonth) < 0) {
      throw new HttpsError(
        "failed-precondition",
        `First invoice opens on ${formatSubscriptionBillingOpenLabel(nextBillingMonth)}.`,
      );
    }
    const deliveryPreference = resolveSubscriptionDeliveryPreference(subscription);
    const cycleInvoicePlan = buildCycleInvoicePlan({
      tier: normalizedTier,
      monthlyAmount: recurringAmount,
      mondaySlots: deliveryPreference.slots,
      cycleMonth,
      timeZone: SUBSCRIPTION_TIMEZONE,
    });
    const createdInvoice = await createOrGetSubscriptionInvoice({
      subscriptionId,
      subscription: {
        ...subscription,
        monthlyAmount: recurringAmount,
      },
      cycleMonth: cycleInvoicePlan.cycleMonth,
      amount: cycleInvoicePlan.invoiceAmount,
      isProrated: cycleInvoicePlan.isProrated,
      proration: null,
      prorationRatio: cycleInvoicePlan.prorationRatio,
      prorationBasis: cycleInvoicePlan.prorationBasis,
      deliverySchedule: cycleInvoicePlan.deliverySchedule,
      source: "manual-resend",
      paymentMethod: normalizeSubscriptionPaymentMethod(subscription?.paymentMethod),
    });
    invoice = createdInvoice.invoice || {};
    invoiceId = createdInvoice.invoiceId;
  }

  const normalizedInvoiceStatus = normalizeSubscriptionInvoiceStatus(invoice.status);
  const normalizedPaymentMethod = normalizeSubscriptionPaymentMethod(
    invoice?.paymentMethod || subscription?.paymentMethod,
  );
  const normalizedPaymentApprovalStatus = normalizeSubscriptionPaymentApprovalStatus(
    invoice?.paymentApprovalStatus || invoice?.paymentApproval?.decision || "",
    normalizedPaymentMethod,
  );
  invoice = {
    ...(invoice || {}),
    status: normalizedInvoiceStatus,
    paymentMethod: normalizedPaymentMethod,
    paymentApprovalStatus: normalizedPaymentApprovalStatus,
  };
  if (normalizedInvoiceStatus !== SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
    throw new HttpsError("failed-precondition", "No pending invoice is available for this subscription.");
  }

  const emailDispatch = await issueSubscriptionInvoiceEmail({
    subscriptionId,
    subscription,
    invoiceId,
    invoice,
    triggerContext: {
      trigger: SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.MANUAL,
      cycleMonth: invoice?.cycleMonth || "",
    },
  });

  await db.collection(SUBSCRIPTIONS_COLLECTION).doc(subscriptionId).set(
    {
      lastInvoiceId: invoiceId,
      lastInvoiceMonth: invoice?.cycleMonth || null,
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  const normalizedTier = normalizeSubscriptionTier(
    subscription?.tier || subscription?.subscriptionPlan?.tier,
  );
  const schedule = invoice?.deliverySchedule || {};
  const cycleMonth = normalizePreorderSendMonth(invoice?.cycleMonth || "") || "";
  const mondaySlots = normalizeMondaySlotsForTier(
    normalizedTier,
    schedule?.slots || subscription?.deliveryPreference?.slots || [],
    { allowDefaults: true },
  );
  const deliveryDates = Array.isArray(schedule?.includedDeliveryDates)
    ? schedule.includedDeliveryDates.map((dateKey) => normalizeIsoDateKey(dateKey)).filter(Boolean)
    : [];
  const cycleDeliveryDates = Array.isArray(schedule?.cycleDeliveryDates)
    ? schedule.cycleDeliveryDates.map((dateKey) => normalizeIsoDateKey(dateKey)).filter(Boolean)
    : [];
  const perDeliveryAmount = roundMoney(
    Number(
      resolveSubscriptionRecurringAmount(subscription) ||
      invoice?.perDeliveryAmount ||
      invoice?.monthlyAmount ||
      0,
    ),
  );
  const totalDeliveries = Number(schedule?.totalDeliveries || cycleDeliveryDates.length || 0);
  const cycleAmount = roundMoney(Number(invoice?.cycleAmount || perDeliveryAmount * totalDeliveries || 0));

  return {
    subscriptionId,
    invoiceId,
    paymentMethod: normalizedPaymentMethod,
    paymentApprovalStatus: normalizedPaymentApprovalStatus,
    cycleMonth,
    invoiceAmount: roundMoney(Number(invoice?.amount || 0)),
    monthlyAmount: perDeliveryAmount,
    perDeliveryAmount,
    cycleAmount,
    nextBillingMonth: normalizePreorderSendMonth(subscription?.nextBillingMonth || "") || "",
    firstDeliveryDate:
      normalizeIsoDateKey(schedule?.firstDeliveryDate || "") || deliveryDates[0] || cycleDeliveryDates[0] || "",
    deliveryDates,
    cycleDeliveryDates,
    mondaySlots,
    isProrated: Boolean(invoice?.isProrated),
    prorationRatio: Number(
      invoice?.prorationRatio ||
        invoice?.proration?.ratio ||
        (invoice?.isProrated ? 0 : 1),
    ),
    emailStatus: emailDispatch.emailStatus,
    emailError: emailDispatch.emailError,
    payLinkUrl: emailDispatch.payLinkUrl,
    invoiceDownloadUrl: emailDispatch.invoiceDownloadUrl || "",
    invoiceFileName: emailDispatch.invoiceFileName || "",
  };
});

exports.adminBackfillSubscriptionInvoiceOwnership = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const dryRun = parseBooleanFlag(payload?.dryRun, false);
  const rawLimit = Number.parseInt(payload?.limit, 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(2000, Math.max(1, rawLimit)) : 500;

  const invoicesSnap = await db
    .collection(SUBSCRIPTION_INVOICES_COLLECTION)
    .limit(limit)
    .get();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let missingSubscription = 0;
  const missingSubscriptionIds = [];
  const unresolvedInvoiceIds = [];
  const subscriptionUidCache = new Map();
  let batch = db.batch();
  let batchWrites = 0;

  for (const invoiceDoc of invoicesSnap.docs) {
    scanned += 1;
    const invoice = invoiceDoc.data() || {};
    const existingCustomerUid = normalizeCustomerUid(invoice?.customerUid || "");
    if (existingCustomerUid) {
      skipped += 1;
      continue;
    }

    const subscriptionId = (invoice?.subscriptionId || "").toString().trim();
    if (!subscriptionId) {
      missingSubscription += 1;
      unresolvedInvoiceIds.push(invoiceDoc.id);
      continue;
    }

    let resolvedCustomerUid = subscriptionUidCache.get(subscriptionId);
    if (resolvedCustomerUid === undefined) {
      const subscriptionSnap = await db.collection(SUBSCRIPTIONS_COLLECTION).doc(subscriptionId).get();
      resolvedCustomerUid = subscriptionSnap.exists
        ? normalizeCustomerUid(subscriptionSnap.data()?.customerUid || "")
        : "";
      subscriptionUidCache.set(subscriptionId, resolvedCustomerUid);
    }

    if (!resolvedCustomerUid) {
      missingSubscription += 1;
      missingSubscriptionIds.push(subscriptionId);
      unresolvedInvoiceIds.push(invoiceDoc.id);
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    batch.set(
      invoiceDoc.ref,
      {
        customerUid: resolvedCustomerUid,
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
    batchWrites += 1;
    updated += 1;

    if (batchWrites >= 400) {
      await batch.commit();
      batch = db.batch();
      batchWrites = 0;
    }
  }

  if (!dryRun && batchWrites > 0) {
    await batch.commit();
  }

  return {
    scanned,
    updated,
    skipped,
    missingSubscription,
    dryRun,
    missingSubscriptionIds: Array.from(new Set(missingSubscriptionIds)).slice(0, 50),
    unresolvedInvoiceIds: unresolvedInvoiceIds.slice(0, 50),
  };
});

exports.generateSubscriptionInvoiceDocumentNow = onCall(async (request) => {
  await assertCustomerSubscriptionRequest(request.auth || {});

  const {
    invoiceId,
    invoiceRef,
    invoice,
    subscriptionId,
    subscription,
  } = await resolveSubscriptionInvoiceForUser(request.data?.invoiceId, request.auth);

  try {
    const generatedDocument = await generateSubscriptionInvoiceDocument({
      subscriptionId,
      invoiceId,
      subscription,
      invoice,
    });
    const document = generatedDocument?.document || null;
    const invoiceDownloadUrl = (document?.downloadUrl || "").toString().trim();
    if (!invoiceDownloadUrl) {
      throw new Error("Unable to generate an invoice preview URL.");
    }

    await invoiceRef.set(
      {
        document,
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      subscriptionId,
      invoiceId,
      invoiceDownloadUrl,
      invoiceFileName: (document?.fileName || "").toString().trim(),
    };
  } catch (error) {
    functions.logger.error("Generate subscription invoice preview failed", {
      invoiceId,
      subscriptionId,
      error: error?.message || error,
    });
    throw new HttpsError(
      "internal",
      error?.message || "Unable to generate invoice preview right now.",
    );
  }
});

exports.sendMonthlySubscriptionInvoices = onSchedule(
  {
    schedule: "10 6 * * *",
    timeZone: SUBSCRIPTION_TIMEZONE,
  },
  async () => {
    const nowDate = new Date();
    const nowParts = formatTimeZoneDateParts(nowDate, SUBSCRIPTION_TIMEZONE);
    const currentMonth = nowParts.monthKey;
    if (!currentMonth) {
      functions.logger.error("Recurring subscription scheduler could not resolve current month.");
      return;
    }
    const runMode = resolveRecurringRunMode(nowDate, SUBSCRIPTION_TIMEZONE);
    if (runMode === SUBSCRIPTION_RECURRING_RUN_MODES.SKIP) {
      functions.logger.info("Recurring subscription scheduler skipped outside billing window", {
        currentMonth,
      });
      return;
    }
    const targetCycleMonth = resolveTargetCycleMonth(runMode, currentMonth);
    if (!targetCycleMonth) {
      functions.logger.error("Recurring subscription scheduler could not resolve target cycle month", {
        runMode,
        currentMonth,
      });
      return;
    }
    const schedulerTrigger =
      runMode === SUBSCRIPTION_RECURRING_RUN_MODES.LAST5
        ? SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.SCHEDULER_LAST5
        : SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.SCHEDULER_DAY1_FALLBACK;

    const subscriptionsSnap = await db
      .collection(SUBSCRIPTIONS_COLLECTION)
      .where("status", "==", SUBSCRIPTION_STATUSES.ACTIVE)
      .get();

    let createdInvoices = 0;
    let resentInvoices = 0;
    let carryForwardResends = 0;
    let outOfOrderPendingSkips = 0;
    let emailsSent = 0;
    let emailsFailed = 0;
    let skipped = 0;

    for (const docSnapshot of subscriptionsSnap.docs) {
      const subscriptionId = docSnapshot.id;
      const subscription = docSnapshot.data() || {};

      try {
        const normalizedTier = normalizeSubscriptionTier(
          subscription?.tier || subscription?.subscriptionPlan?.tier,
        );
        if (!normalizedTier) {
          skipped += 1;
          continue;
        }
        const recurringAmount = resolveSubscriptionRecurringAmount(subscription);
        if (!recurringAmount) {
          skipped += 1;
          continue;
        }
        const pendingInvoice = await loadLatestPendingSubscriptionInvoice(subscriptionId);
        if (pendingInvoice) {
          const pendingInvoiceId =
            (pendingInvoice.id || pendingInvoice.invoiceId || "").toString().trim();
          if (!pendingInvoiceId) {
            skipped += 1;
            continue;
          }
          const pendingCycleMonth = normalizePreorderSendMonth(pendingInvoice?.cycleMonth || "");
          const cycleComparison = pendingCycleMonth
            ? compareSubscriptionMonthKeys(pendingCycleMonth, targetCycleMonth)
            : -1;
          if (cycleComparison > 0) {
            outOfOrderPendingSkips += 1;
            skipped += 1;
            continue;
          }

          resentInvoices += 1;
          if (cycleComparison < 0) {
            carryForwardResends += 1;
          }
          const normalizedPendingInvoice = {
            ...pendingInvoice,
            status: SUBSCRIPTION_INVOICE_STATUSES.PENDING,
          };
          const emailDispatch = await issueSubscriptionInvoiceEmail({
            subscriptionId,
            subscription: {
              ...subscription,
              monthlyAmount: recurringAmount,
            },
            invoiceId: pendingInvoiceId,
            invoice: normalizedPendingInvoice,
            triggerContext: {
              trigger: schedulerTrigger,
              cycleMonth: pendingCycleMonth || targetCycleMonth,
            },
          });

          if (emailDispatch.emailStatus === ORDER_NOTIFICATION_STATUSES.SENT) {
            emailsSent += 1;
            const subscriptionPatch = {
              lastInvoiceId: pendingInvoiceId,
              lastInvoiceMonth: pendingCycleMonth || null,
              updatedAt: FIELD_VALUE.serverTimestamp(),
            };
            if (cycleComparison === 0) {
              const advancedBillingMonth = getNextMonthKey(targetCycleMonth);
              if (advancedBillingMonth) {
                subscriptionPatch.nextBillingMonth = advancedBillingMonth;
              }
            }
            await db.collection(SUBSCRIPTIONS_COLLECTION).doc(subscriptionId).set(
              subscriptionPatch,
              { merge: true },
            );
          } else {
            emailsFailed += 1;
          }
          continue;
        }

        const nextBillingMonth = normalizePreorderSendMonth(subscription?.nextBillingMonth || "");
        if (
          nextBillingMonth &&
          compareSubscriptionMonthKeys(targetCycleMonth, nextBillingMonth) < 0
        ) {
          skipped += 1;
          continue;
        }

        const deliveryPreference = resolveSubscriptionDeliveryPreference(subscription);
        const cycleInvoicePlan = buildCycleInvoicePlan({
          tier: normalizedTier,
          monthlyAmount: recurringAmount,
          mondaySlots: deliveryPreference.slots,
          cycleMonth: targetCycleMonth,
          timeZone: SUBSCRIPTION_TIMEZONE,
        });

        const invoiceResult = await createOrGetSubscriptionInvoice({
          subscriptionId,
          subscription: {
            ...subscription,
            monthlyAmount: recurringAmount,
          },
          cycleMonth: cycleInvoicePlan.cycleMonth,
          amount: cycleInvoicePlan.invoiceAmount,
          isProrated: cycleInvoicePlan.isProrated,
          proration: null,
          prorationRatio: cycleInvoicePlan.prorationRatio,
          prorationBasis: cycleInvoicePlan.prorationBasis,
          deliverySchedule: cycleInvoicePlan.deliverySchedule,
          source:
            runMode === SUBSCRIPTION_RECURRING_RUN_MODES.LAST5
              ? "scheduler-last5"
              : "scheduler-day1-fallback",
          paymentMethod: normalizeSubscriptionPaymentMethod(subscription?.paymentMethod),
        });

        const invoice = invoiceResult.invoice || {};
        const invoiceStatus = normalizeSubscriptionInvoiceStatus(invoice.status);
        if (invoiceStatus !== SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
          skipped += 1;
          continue;
        }

        if (invoiceResult.created) {
          createdInvoices += 1;
        } else {
          resentInvoices += 1;
        }
        const emailDispatch = await issueSubscriptionInvoiceEmail({
          subscriptionId,
          subscription: {
            ...subscription,
            monthlyAmount: recurringAmount,
          },
          invoiceId: invoiceResult.invoiceId,
          invoice,
          triggerContext: {
            trigger: schedulerTrigger,
            cycleMonth: targetCycleMonth,
          },
        });

        if (emailDispatch.emailStatus === ORDER_NOTIFICATION_STATUSES.SENT) {
          emailsSent += 1;
          await db.collection(SUBSCRIPTIONS_COLLECTION).doc(subscriptionId).set(
            {
              lastInvoiceId: invoiceResult.invoiceId,
              lastInvoiceMonth: targetCycleMonth,
              nextBillingMonth: getNextMonthKey(targetCycleMonth),
              updatedAt: FIELD_VALUE.serverTimestamp(),
            },
            { merge: true },
          );
        } else {
          emailsFailed += 1;
        }
      } catch (error) {
        emailsFailed += 1;
        functions.logger.error("Recurring subscription invoice processing failed", {
          subscriptionId,
          error: error?.message || error,
        });
      }
    }

    functions.logger.info("Recurring subscription invoices complete", {
      runMode,
      currentMonth,
      targetCycleMonth,
      subscriptionsConsidered: subscriptionsSnap.size,
      createdInvoices,
      resentInvoices,
      carryForwardResends,
      outOfOrderPendingSkips,
      emailsSent,
      emailsFailed,
      skipped,
    });
  },
);

exports.adminSetSubscriptionEftEligibility = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const userId = normalizeCustomerUid(payload?.userId || "");
  const approved = parseBooleanFlag(payload?.approved, false);
  const reason = normalizeAdminOverrideReason(payload?.reason || "");
  if (!userId) {
    throw new HttpsError("invalid-argument", "User ID is required.");
  }

  const userSnap = await db.doc(`users/${userId}`).get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  const actorUid = (request.auth?.uid || "").toString().trim();
  const actorEmail = (request.auth?.token?.email || "").toString().trim().toLowerCase();
  const settingsRef = db.collection(SUBSCRIPTION_CUSTOMER_SETTINGS_COLLECTION).doc(userId);
  await settingsRef.set(
    {
      uid: userId,
      eftApproved: approved,
      approvedAt: approved ? FIELD_VALUE.serverTimestamp() : null,
      approvedByUid: approved ? actorUid || null : null,
      approvedByEmail: approved ? actorEmail || null : null,
      reason: reason || null,
      updatedAt: FIELD_VALUE.serverTimestamp(),
      updatedByUid: actorUid || null,
      updatedByEmail: actorEmail || null,
    },
    { merge: true },
  );

  return {
    userId,
    approved,
    updatedAt: new Date().toISOString(),
  };
});

exports.adminUpdateSubscriptionPaymentMethod = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const subscriptionId = (payload?.subscriptionId || "").toString().trim();
  const nextPaymentMethod = normalizeSubscriptionPaymentMethod(payload?.paymentMethod || "");
  const reason = normalizeAdminOverrideReason(payload?.reason || "");
  const applyToPendingInvoice = parseBooleanFlag(payload?.applyToPendingInvoice, true);
  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "A reason is required for payment method changes.");
  }

  const actorUid = (request.auth?.uid || "").toString().trim();
  const actorEmail = (request.auth?.token?.email || "").toString().trim().toLowerCase();
  const { subscriptionRef, subscription } = await resolveSubscriptionByIdForAdmin(subscriptionId);
  const currentPaymentMethod = normalizeSubscriptionPaymentMethod(subscription?.paymentMethod || "");
  const nextPaymentApprovalStatus = normalizeSubscriptionPaymentApprovalStatus("", nextPaymentMethod);
  const nextApprovalRequired = nextPaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT;

  if (currentPaymentMethod === nextPaymentMethod && !applyToPendingInvoice) {
    throw new HttpsError(
      "failed-precondition",
      `Subscription is already configured for ${nextPaymentMethod.toUpperCase()}.`,
    );
  }

  await subscriptionRef.set(
    {
      paymentMethod: nextPaymentMethod,
      paymentApprovalRequired: nextApprovalRequired,
      paymentApprovalStatus: nextPaymentApprovalStatus,
      updatedAt: FIELD_VALUE.serverTimestamp(),
      adminOverride: {
        actionType: "subscription-payment-method-override",
        fromPaymentMethod: currentPaymentMethod,
        toPaymentMethod: nextPaymentMethod,
        reason,
        actorUid: actorUid || null,
        actorEmail: actorEmail || null,
        at: FIELD_VALUE.serverTimestamp(),
        source: "admin-console",
      },
    },
    { merge: true },
  );

  let pendingInvoiceUpdated = false;
  let pendingInvoiceId = null;
  if (applyToPendingInvoice) {
    const pendingInvoice = await loadLatestPendingSubscriptionInvoice(subscriptionId);
    const pendingInvoiceDocId = (
      pendingInvoice?.id || pendingInvoice?.invoiceId || ""
    ).toString().trim();
    if (pendingInvoiceDocId) {
      pendingInvoiceId = pendingInvoiceDocId;
      const invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(pendingInvoiceDocId);
      const previousInvoicePaymentMethod = normalizeSubscriptionPaymentMethod(
        pendingInvoice?.paymentMethod || currentPaymentMethod,
      );
      const methodChanged = previousInvoicePaymentMethod !== nextPaymentMethod;
      await invoiceRef.set(
        {
          paymentMethod: nextPaymentMethod,
          paymentApprovalStatus: nextPaymentApprovalStatus,
          paymentApproval: {
            ...buildSubscriptionPaymentApprovalState({
              paymentMethod: nextPaymentMethod,
              paymentApprovalStatus: nextPaymentApprovalStatus,
            }),
          },
          payLink:
            nextPaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.PAYFAST && !methodChanged
              ? pendingInvoice?.payLink || null
              : null,
          paymentReference: methodChanged ? null : pendingInvoice?.paymentReference || null,
          payfastMode: methodChanged ? null : pendingInvoice?.payfastMode || null,
          payfastHost: methodChanged ? null : pendingInvoice?.payfastHost || null,
          payfast: methodChanged ? null : pendingInvoice?.payfast || null,
          updatedAt: FIELD_VALUE.serverTimestamp(),
        },
        { merge: true },
      );
      if (methodChanged) {
        await supersedePendingSubscriptionPayfastSessionsForInvoice(
          pendingInvoiceDocId,
          "payment-method-updated",
        );
      }
      pendingInvoiceUpdated = true;
    }
  }

  await writeSubscriptionAdminAuditLog({
    actionType: "subscription-payment-method-override",
    actorUid,
    actorEmail,
    subscriptionId,
    fromStatus: currentPaymentMethod,
    toStatus: nextPaymentMethod,
    reason,
    meta: {
      applyToPendingInvoice,
      pendingInvoiceUpdated,
      pendingInvoiceId,
    },
  });

  return {
    subscriptionId,
    paymentMethod: nextPaymentMethod,
    pendingInvoiceUpdated,
    pendingInvoiceId,
  };
});

function buildSubscriptionPlanAssignmentPatch({
  subscription = {},
  plan = {},
  reason = "",
  actorUid = "",
  actorEmail = "",
} = {}) {
  const normalizedTier = normalizeSubscriptionTier(plan?.tier || subscription?.tier);
  const nextSlots = normalizeMondaySlotsForTier(
    normalizedTier,
    subscription?.deliveryPreference?.slots || [],
    { allowDefaults: true },
  );
  const currentPlanId = trimToLength(
    subscription?.subscriptionPlan?.planId || subscription?.subscriptionProduct?.productId || "",
    120,
  ) || null;
  const nextPlanId = trimToLength(
    plan?.subscriptionPlan?.planId || plan?.subscriptionProduct?.productId || "",
    120,
  ) || null;
  return {
    planName: trimToLength(plan?.planName || buildSubscriptionPlanLabel(plan, {}), 180),
    tier: normalizedTier || "",
    stems: normalizeSubscriptionStems(plan?.stems || 0),
    monthlyAmount: roundMoney(Number(plan?.monthlyAmount || 0)),
    perDeliveryAmount: roundMoney(Number(plan?.monthlyAmount || 0)),
    subscriptionPlan: normalizeSubscriptionPlanSnapshot(plan?.subscriptionPlan || {}),
    subscriptionProduct: normalizeSubscriptionProductSnapshot(plan?.subscriptionProduct || {}),
    deliveryPreference: {
      model: SUBSCRIPTION_DELIVERY_PREFERENCE_MODEL,
      cutoffRule: SUBSCRIPTION_DELIVERY_CUTOFF_RULE,
      slots: normalizedTier === "weekly" ? [...SUBSCRIPTION_MONDAY_SLOT_VALUES] : nextSlots,
    },
    updatedAt: FIELD_VALUE.serverTimestamp(),
    planOverride: {
      previousPlanId: currentPlanId,
      newPlanId: nextPlanId,
      changedAt: FIELD_VALUE.serverTimestamp(),
      changedByUid: actorUid || null,
      changedByEmail: actorEmail || null,
      reason: normalizeAdminOverrideReason(reason) || null,
    },
  };
}

async function ensureCycleBaseInvoiceForAdmin({
  subscriptionId = "",
  subscription = {},
  cycleMonth = "",
  createIfMissing = false,
} = {}) {
  const normalizedCycleMonth = normalizePreorderSendMonth(cycleMonth || "");
  if (!normalizedCycleMonth) {
    throw new HttpsError("invalid-argument", "Cycle month must be in YYYY-MM format.");
  }
  const cycleInvoices = await loadCycleInvoices(subscriptionId, normalizedCycleMonth);
  let baseInvoice = getCycleBaseInvoice(cycleInvoices, subscriptionId, normalizedCycleMonth);
  if (baseInvoice) {
    const baseInvoiceId = (baseInvoice.id || baseInvoice.invoiceId || "").toString().trim();
    return {
      baseInvoice,
      baseInvoiceId,
      baseInvoiceRef: db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(baseInvoiceId),
      cycleInvoices,
      created: false,
      cycleMonth: normalizedCycleMonth,
    };
  }
  if (!createIfMissing) {
    return {
      baseInvoice: null,
      baseInvoiceId: "",
      baseInvoiceRef: null,
      cycleInvoices,
      created: false,
      cycleMonth: normalizedCycleMonth,
    };
  }

  const recurringAmount = resolveSubscriptionRecurringAmount(subscription);
  if (!recurringAmount) {
    throw new HttpsError("failed-precondition", "Subscription plan pricing is invalid.");
  }
  const normalizedTier = normalizeSubscriptionTier(
    subscription?.tier || subscription?.subscriptionPlan?.tier,
  );
  if (!normalizedTier) {
    throw new HttpsError("failed-precondition", "Subscription tier is invalid.");
  }
  const deliveryPreference = resolveSubscriptionDeliveryPreference(subscription);
  const cycleInvoicePlan = buildCycleInvoicePlan({
    tier: normalizedTier,
    monthlyAmount: recurringAmount,
    mondaySlots: deliveryPreference.slots,
    cycleMonth: normalizedCycleMonth,
    timeZone: SUBSCRIPTION_TIMEZONE,
  });
  const createdInvoice = await createOrGetSubscriptionInvoice({
    subscriptionId,
    subscription,
    cycleMonth: cycleInvoicePlan.cycleMonth,
    amount: cycleInvoicePlan.invoiceAmount,
    isProrated: cycleInvoicePlan.isProrated,
    proration: null,
    prorationRatio: cycleInvoicePlan.prorationRatio,
    prorationBasis: cycleInvoicePlan.prorationBasis,
    deliverySchedule: cycleInvoicePlan.deliverySchedule,
    source: "admin-console",
    paymentMethod: normalizeSubscriptionPaymentMethod(subscription?.paymentMethod || ""),
  });
  const refreshedSnap = await createdInvoice.invoiceRef.get();
  const refreshedInvoice = refreshedSnap.exists ? { id: createdInvoice.invoiceId, ...refreshedSnap.data() } : {};
  return {
    baseInvoice: refreshedInvoice,
    baseInvoiceId: createdInvoice.invoiceId,
    baseInvoiceRef: createdInvoice.invoiceRef,
    cycleInvoices: [...cycleInvoices, refreshedInvoice],
    created: Boolean(createdInvoice.created),
    cycleMonth: normalizedCycleMonth,
  };
}

exports.adminUpdateSubscriptionPlanAssignment = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const subscriptionId = (payload.subscriptionId || "").toString().trim();
  const planId = (payload.planId || "").toString().trim();
  const cycleMonth = normalizePreorderSendMonth(payload.cycleMonth || "");
  const reason = normalizeAdminOverrideReason(payload.reason);
  const applyToCurrentCycle = parseBooleanFlag(payload.applyToCurrentCycle, true);
  const sendUpdatedInvoiceEmail = parseBooleanFlag(payload.sendUpdatedInvoiceEmail, true);

  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }
  if (!planId) {
    throw new HttpsError("invalid-argument", "Plan ID is required.");
  }
  if (!cycleMonth) {
    throw new HttpsError("invalid-argument", "Cycle month must be in YYYY-MM format.");
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "A reason is required for plan reassignment.");
  }

  const actorUid = (request.auth?.uid || "").toString().trim();
  const actorEmail = (request.auth?.token?.email || "").toString().trim().toLowerCase();
  const { subscriptionRef, subscription } = await resolveSubscriptionByIdForAdmin(subscriptionId);
  const { plan } = await resolveSubscriptionPlanByIdForAdmin(planId);

  const nextSubscriptionPatch = buildSubscriptionPlanAssignmentPatch({
    subscription,
    plan,
    reason,
    actorUid,
    actorEmail,
  });
  await subscriptionRef.set(nextSubscriptionPatch, { merge: true });
  const nextSubscription = {
    ...subscription,
    ...nextSubscriptionPatch,
  };

  let currentCycleUpdate = "no-cycle-change";
  let affectedInvoiceId = "";
  let affectedInvoiceType = "";
  let invoiceAmount = 0;
  let emailStatus = ORDER_NOTIFICATION_STATUSES.SKIPPED;
  let targetInvoiceForEmail = null;

  if (applyToCurrentCycle) {
    const cycleContext = await ensureCycleBaseInvoiceForAdmin({
      subscriptionId,
      subscription: nextSubscription,
      cycleMonth,
      createIfMissing: false,
    });
    const baseInvoice = cycleContext.baseInvoice;
    const baseInvoiceId = cycleContext.baseInvoiceId;

    if (baseInvoice && baseInvoiceId) {
      const baseInvoiceStatus = normalizeSubscriptionInvoiceStatus(baseInvoice?.status || "");
      const baseInvoiceFinancials = resolveSubscriptionInvoiceFinancialSnapshot(baseInvoice);
      const newBaseAmount = computeCycleBaseAmount({
        tier: nextSubscriptionPatch.tier,
        perDeliveryAmount: nextSubscriptionPatch.perDeliveryAmount,
        deliverySchedule: baseInvoice?.deliverySchedule || null,
      });

      if (baseInvoiceStatus === SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
        const result = await applySubscriptionInvoiceFinancialUpdate({
          invoiceRef: cycleContext.baseInvoiceRef,
          invoiceId: baseInvoiceId,
          invoice: baseInvoice,
          baseAmount: newBaseAmount,
          adjustments: baseInvoiceFinancials.adjustments,
          actorUid,
          actorEmail,
          actionType: "subscription-plan-override",
          reason,
          additionalFields: {
            invoiceType: SUBSCRIPTION_INVOICE_TYPES.CYCLE,
            planName: nextSubscriptionPatch.planName,
            tier: nextSubscriptionPatch.tier,
            stems: nextSubscriptionPatch.stems,
            subscriptionPlan: nextSubscriptionPatch.subscriptionPlan,
            subscriptionProduct: nextSubscriptionPatch.subscriptionProduct,
            monthlyAmount: nextSubscriptionPatch.monthlyAmount,
            perDeliveryAmount: nextSubscriptionPatch.perDeliveryAmount,
            cycleAmount: newBaseAmount,
          },
        });
        currentCycleUpdate = "repriced-pending";
        affectedInvoiceId = baseInvoiceId;
        affectedInvoiceType = SUBSCRIPTION_INVOICE_TYPES.CYCLE;
        invoiceAmount = roundMoney(Number(result?.invoice?.amount || 0));
        targetInvoiceForEmail = { id: baseInvoiceId, ...(result?.invoice || {}) };
      } else if (baseInvoiceStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID) {
        const difference = roundMoney(newBaseAmount - baseInvoiceFinancials.baseAmount);
        if (difference > 0) {
          const topupContext = await ensurePendingCycleTopUpInvoice({
            subscriptionId,
            subscription: nextSubscription,
            cycleMonth,
            baseInvoice,
            source: "admin-plan-change",
          });
          const topupInvoiceId = topupContext.invoiceId;
          const topupInvoiceRef = topupContext.invoiceRef;
          const topupInvoice = topupContext.invoice || {};
          const topupFinancials = resolveSubscriptionInvoiceFinancialSnapshot(topupInvoice);
          const adjustmentEntry = buildSubscriptionInvoiceAdjustmentEntry({
            source: SUBSCRIPTION_ADJUSTMENT_SOURCES.PLAN_CHANGE,
            label: `Plan change top-up (${nextSubscriptionPatch.planName})`,
            amount: difference,
            basis: SUBSCRIPTION_CHARGE_BASES.FLAT,
            mode: SUBSCRIPTION_CHARGE_MODES.ONE_TIME,
            reason,
            actorUid,
            actorEmail,
          });
          const result = await applySubscriptionInvoiceFinancialUpdate({
            invoiceRef: topupInvoiceRef,
            invoiceId: topupInvoiceId,
            invoice: {
              ...topupInvoice,
              invoiceType: SUBSCRIPTION_INVOICE_TYPES.TOPUP,
            },
            baseAmount: topupFinancials.baseAmount,
            adjustments: [...topupFinancials.adjustments, adjustmentEntry],
            actorUid,
            actorEmail,
            actionType: "subscription-plan-override",
            reason,
            additionalFields: {
              invoiceType: SUBSCRIPTION_INVOICE_TYPES.TOPUP,
              baseInvoiceId,
              cycleMonth,
              planName: nextSubscriptionPatch.planName,
              tier: nextSubscriptionPatch.tier,
              stems: nextSubscriptionPatch.stems,
              subscriptionPlan: nextSubscriptionPatch.subscriptionPlan,
              subscriptionProduct: nextSubscriptionPatch.subscriptionProduct,
              monthlyAmount: nextSubscriptionPatch.monthlyAmount,
              perDeliveryAmount: nextSubscriptionPatch.perDeliveryAmount,
            },
          });
          currentCycleUpdate = "created-topup-paid-cycle";
          affectedInvoiceId = topupInvoiceId;
          affectedInvoiceType = SUBSCRIPTION_INVOICE_TYPES.TOPUP;
          invoiceAmount = roundMoney(Number(result?.invoice?.amount || 0));
          targetInvoiceForEmail = { id: topupInvoiceId, ...(result?.invoice || {}) };
        }
      }
    }
  }

  if (sendUpdatedInvoiceEmail && targetInvoiceForEmail) {
    try {
      const dispatch = await issueSubscriptionInvoiceEmail({
        subscriptionId,
        subscription: nextSubscription,
        invoiceId: targetInvoiceForEmail.id || "",
        invoice: targetInvoiceForEmail,
        triggerContext: {
          trigger: SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.MANUAL,
          cycleMonth,
        },
      });
      emailStatus = dispatch.emailStatus || ORDER_NOTIFICATION_STATUSES.SKIPPED;
    } catch (error) {
      emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
      functions.logger.error("Subscription plan reassignment email failed", {
        subscriptionId,
        cycleMonth,
        affectedInvoiceId,
        error: error?.message || error,
      });
    }
  } else {
    emailStatus = ORDER_NOTIFICATION_STATUSES.SKIPPED;
  }

  await writeSubscriptionAdminAuditLog({
    actionType: "subscription-plan-override",
    actorUid,
    actorEmail,
    subscriptionId,
    invoiceId: affectedInvoiceId || null,
    cycleMonth,
    fromStatus:
      trimToLength(
        subscription?.subscriptionPlan?.planId || subscription?.subscriptionProduct?.productId || "",
        120,
      ) || null,
    toStatus: trimToLength(plan?.subscriptionPlan?.planId || "", 120) || planId,
    reason,
    meta: {
      applyToCurrentCycle,
      currentCycleUpdate,
      affectedInvoiceType: affectedInvoiceType || null,
      sendUpdatedInvoiceEmail,
      emailStatus,
    },
  });

  return {
    subscriptionId,
    planId,
    planName: nextSubscriptionPatch.planName,
    cycleMonth,
    currentCycleUpdate,
    affectedInvoiceId: affectedInvoiceId || null,
    affectedInvoiceType: affectedInvoiceType || null,
    invoiceAmount: Number.isFinite(Number(invoiceAmount)) ? Number(invoiceAmount.toFixed(2)) : null,
    emailStatus,
  };
});

exports.adminAddSubscriptionInvoiceCharge = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const subscriptionId = (payload.subscriptionId || "").toString().trim();
  const cycleMonth = normalizePreorderSendMonth(payload.cycleMonth || "");
  const reason = normalizeAdminOverrideReason(payload.reason);
  const label = trimToLength(payload.label || "Admin charge", 180) || "Admin charge";
  const chargeMode = normalizeSubscriptionChargeMode(payload.chargeMode || "");
  const chargeBasis = normalizeSubscriptionChargeBasis(payload.chargeBasis || "");
  const createIfMissing = parseBooleanFlag(payload.createInvoiceIfMissing, true);
  const sendUpdatedInvoiceEmail = parseBooleanFlag(payload.sendUpdatedInvoiceEmail, true);
  const chargeAmount = toPositiveMoneyAmount(payload.amount);

  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }
  if (!cycleMonth) {
    throw new HttpsError("invalid-argument", "Cycle month must be in YYYY-MM format.");
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "A reason is required for invoice charges.");
  }
  if (!chargeAmount) {
    throw new HttpsError("invalid-argument", "Charge amount must be greater than zero.");
  }

  const actorUid = (request.auth?.uid || "").toString().trim();
  const actorEmail = (request.auth?.token?.email || "").toString().trim().toLowerCase();
  const { subscriptionRef, subscription } = await resolveSubscriptionByIdForAdmin(subscriptionId);
  let workingSubscription = { ...subscription };
  let recurringChargeEntry = null;

  if (chargeMode === SUBSCRIPTION_CHARGE_MODES.RECURRING) {
    recurringChargeEntry = buildSubscriptionRecurringChargeEntry({
      chargeId: createSubscriptionChargeId(),
      label,
      amount: chargeAmount,
      basis: chargeBasis,
      reason,
      actorUid,
      actorEmail,
    });
    const nextRecurring = mergeSubscriptionRecurringCharges({
      existingCharges: workingSubscription?.billingCharges?.recurring || [],
      nextCharge: recurringChargeEntry,
    });
    await subscriptionRef.set(
      {
        billingCharges: {
          recurring: nextRecurring,
        },
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
    workingSubscription = {
      ...workingSubscription,
      billingCharges: {
        recurring: nextRecurring,
      },
    };
  }

  const baseContext = await ensureCycleBaseInvoiceForAdmin({
    subscriptionId,
    subscription: workingSubscription,
    cycleMonth,
    createIfMissing,
  });
  if (!baseContext?.baseInvoice || !baseContext.baseInvoiceId) {
    throw new HttpsError("failed-precondition", "No invoice exists for this cycle.");
  }

  let targetInvoice = baseContext.baseInvoice;
  let targetInvoiceId = baseContext.baseInvoiceId;
  let targetInvoiceRef = baseContext.baseInvoiceRef;
  let targetInvoiceType = SUBSCRIPTION_INVOICE_TYPES.CYCLE;
  const baseInvoiceStatus = normalizeSubscriptionInvoiceStatus(targetInvoice?.status || "");

  if (baseInvoiceStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID) {
    const topupContext = await ensurePendingCycleTopUpInvoice({
      subscriptionId,
      subscription: workingSubscription,
      cycleMonth,
      baseInvoice: baseContext.baseInvoice,
      source: "admin-extra-charge",
    });
    targetInvoice = topupContext.invoice || {};
    targetInvoiceId = topupContext.invoiceId;
    targetInvoiceRef = topupContext.invoiceRef;
    targetInvoiceType = SUBSCRIPTION_INVOICE_TYPES.TOPUP;
  } else if (baseInvoiceStatus !== SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
    throw new HttpsError(
      "failed-precondition",
      "Charges can only be applied to pending invoices or as top-up against paid cycle invoices.",
    );
  }

  const deliveryCount = resolveSubscriptionInvoiceDeliveryCount(
    targetInvoiceType === SUBSCRIPTION_INVOICE_TYPES.TOPUP ? baseContext.baseInvoice : targetInvoice,
    normalizeSubscriptionTier(workingSubscription?.tier || workingSubscription?.subscriptionPlan?.tier),
  );
  const appliedAmount = computeAdjustmentAmount({
    basis: chargeBasis,
    amount: chargeAmount,
    includedDeliveries: deliveryCount,
  });
  if (!appliedAmount) {
    throw new HttpsError(
      "failed-precondition",
      "Charge amount resolved to zero for this cycle and basis.",
    );
  }

  const targetFinancials = resolveSubscriptionInvoiceFinancialSnapshot(targetInvoice);
  const adjustmentEntry = buildSubscriptionInvoiceAdjustmentEntry({
    source:
      chargeMode === SUBSCRIPTION_CHARGE_MODES.RECURRING
        ? SUBSCRIPTION_ADJUSTMENT_SOURCES.RECURRING_CHARGE
        : SUBSCRIPTION_ADJUSTMENT_SOURCES.EXTRA_CHARGE,
    label,
    amount: appliedAmount,
    basis: chargeBasis,
    mode: chargeMode,
    reason,
    chargeId: recurringChargeEntry?.chargeId || createSubscriptionChargeId(),
    actorUid,
    actorEmail,
  });
  const result = await applySubscriptionInvoiceFinancialUpdate({
    invoiceRef: targetInvoiceRef,
    invoiceId: targetInvoiceId,
    invoice: {
      ...targetInvoice,
      invoiceType: targetInvoiceType,
    },
    baseAmount: targetFinancials.baseAmount,
    adjustments: [...targetFinancials.adjustments, adjustmentEntry],
    actorUid,
    actorEmail,
    actionType: "subscription-invoice-charge-add",
    reason,
    additionalFields: {
      invoiceType: targetInvoiceType,
      ...(targetInvoiceType === SUBSCRIPTION_INVOICE_TYPES.TOPUP
        ? { baseInvoiceId: baseContext.baseInvoiceId, cycleMonth }
        : {}),
    },
  });

  let emailStatus = ORDER_NOTIFICATION_STATUSES.SKIPPED;
  if (sendUpdatedInvoiceEmail) {
    try {
      const dispatch = await issueSubscriptionInvoiceEmail({
        subscriptionId,
        subscription: workingSubscription,
        invoiceId: targetInvoiceId,
        invoice: { id: targetInvoiceId, ...(result?.invoice || {}) },
        triggerContext: {
          trigger: SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.MANUAL,
          cycleMonth,
        },
      });
      emailStatus = dispatch?.emailStatus || ORDER_NOTIFICATION_STATUSES.SKIPPED;
    } catch (error) {
      emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
      functions.logger.error("Subscription charge invoice email failed", {
        subscriptionId,
        cycleMonth,
        targetInvoiceId,
        error: error?.message || error,
      });
    }
  }

  await writeSubscriptionAdminAuditLog({
    actionType: "subscription-invoice-charge-add",
    actorUid,
    actorEmail,
    subscriptionId,
    invoiceId: targetInvoiceId,
    cycleMonth,
    fromStatus: null,
    toStatus: null,
    reason,
    meta: {
      label,
      chargeMode,
      chargeBasis,
      chargeAmount,
      appliedAmount,
      targetInvoiceType,
      recurringChargeId: recurringChargeEntry?.chargeId || adjustmentEntry?.chargeId || null,
      emailStatus,
    },
  });

  return {
    subscriptionId,
    cycleMonth,
    chargeId: recurringChargeEntry?.chargeId || adjustmentEntry?.chargeId || null,
    chargeMode,
    chargeBasis,
    appliedAmount: roundMoney(appliedAmount),
    targetInvoiceId,
    targetInvoiceType,
    newInvoiceAmount: roundMoney(Number(result?.invoice?.amount || 0)),
    emailStatus,
  };
});

exports.adminRemoveSubscriptionRecurringCharge = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const subscriptionId = (payload.subscriptionId || "").toString().trim();
  const chargeId = trimToLength(payload.chargeId || "", 120);
  const reason = normalizeAdminOverrideReason(payload.reason);
  const cycleMonth = normalizePreorderSendMonth(payload.cycleMonth || "");
  const sendUpdatedInvoiceEmail = parseBooleanFlag(payload.sendUpdatedInvoiceEmail, true);

  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }
  if (!chargeId) {
    throw new HttpsError("invalid-argument", "Charge ID is required.");
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "A reason is required.");
  }

  const actorUid = (request.auth?.uid || "").toString().trim();
  const actorEmail = (request.auth?.token?.email || "").toString().trim().toLowerCase();
  const { subscriptionRef, subscription } = await resolveSubscriptionByIdForAdmin(subscriptionId);
  const recurringCharges = resolveSubscriptionRecurringCharges(subscription);
  const targetCharge = recurringCharges.find(
    (entry) =>
      entry?.chargeId === chargeId &&
      normalizeSubscriptionChargeStatus(entry?.status || "") === SUBSCRIPTION_CHARGE_STATUSES.ACTIVE,
  );
  if (!targetCharge) {
    throw new HttpsError("not-found", "Recurring charge not found or already removed.");
  }

  const nextRecurringCharges = recurringCharges.map((entry) => {
    if (entry.chargeId !== chargeId) return entry;
    return {
      ...entry,
      status: SUBSCRIPTION_CHARGE_STATUSES.REMOVED,
      removedAt: admin.firestore.Timestamp.now(),
      removedByUid: actorUid || null,
      removedByEmail: actorEmail || null,
      removedReason: reason || null,
    };
  });

  await subscriptionRef.set(
    {
      billingCharges: {
        recurring: nextRecurringCharges,
      },
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  let emailStatus = ORDER_NOTIFICATION_STATUSES.SKIPPED;
  let updatedInvoiceId = null;
  if (cycleMonth) {
    const cycleInvoices = await loadCycleInvoices(subscriptionId, cycleMonth);
    let invoiceForEmail = null;
    for (const cycleInvoice of cycleInvoices) {
      const cycleInvoiceId = (cycleInvoice?.id || cycleInvoice?.invoiceId || "").toString().trim();
      if (!cycleInvoiceId) continue;
      if (normalizeSubscriptionInvoiceStatus(cycleInvoice?.status || "") !== SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
        continue;
      }
      const currentFinancials = resolveSubscriptionInvoiceFinancialSnapshot(cycleInvoice);
      const nextAdjustments = currentFinancials.adjustments.filter(
        (entry) => trimToLength(entry?.chargeId || "", 120) !== chargeId,
      );
      if (nextAdjustments.length === currentFinancials.adjustments.length) {
        continue;
      }
      const invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(cycleInvoiceId);
      const result = await applySubscriptionInvoiceFinancialUpdate({
        invoiceRef,
        invoiceId: cycleInvoiceId,
        invoice: cycleInvoice,
        baseAmount: currentFinancials.baseAmount,
        adjustments: nextAdjustments,
        actorUid,
        actorEmail,
        actionType: "subscription-recurring-charge-remove",
        reason,
      });
      updatedInvoiceId = cycleInvoiceId;
      if (!invoiceForEmail) {
        invoiceForEmail = { id: cycleInvoiceId, ...(result?.invoice || {}) };
      }
    }

    if (sendUpdatedInvoiceEmail && invoiceForEmail) {
      try {
        const dispatch = await issueSubscriptionInvoiceEmail({
          subscriptionId,
          subscription: {
            ...subscription,
            billingCharges: {
              recurring: nextRecurringCharges,
            },
          },
          invoiceId: invoiceForEmail.id,
          invoice: invoiceForEmail,
          triggerContext: {
            trigger: SUBSCRIPTION_INVOICE_EMAIL_TRIGGERS.MANUAL,
            cycleMonth,
          },
        });
        emailStatus = dispatch?.emailStatus || ORDER_NOTIFICATION_STATUSES.SKIPPED;
      } catch (error) {
        emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
        functions.logger.error("Recurring charge removal email failed", {
          subscriptionId,
          cycleMonth,
          invoiceId: invoiceForEmail.id,
          error: error?.message || error,
        });
      }
    }
  }

  await writeSubscriptionAdminAuditLog({
    actionType: "subscription-recurring-charge-remove",
    actorUid,
    actorEmail,
    subscriptionId,
    invoiceId: updatedInvoiceId,
    cycleMonth: cycleMonth || null,
    reason,
    meta: {
      chargeId,
      sendUpdatedInvoiceEmail,
      emailStatus,
    },
  });

  return {
    subscriptionId,
    chargeId,
    removed: true,
    emailStatus,
  };
});

exports.attachSubscriptionEftPaymentProof = onCall(async (request) => {
  await assertCustomerSubscriptionRequest(request.auth || {});

  const {
    invoiceId,
    invoiceRef,
    invoice,
  } = await resolveSubscriptionInvoiceForUser(request.data?.invoiceId, request.auth);

  const invoiceStatus = normalizeSubscriptionInvoiceStatus(invoice?.status || "");
  if (invoiceStatus !== SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
    throw new HttpsError(
      "failed-precondition",
      "Proof upload is only available while invoice payment is pending.",
    );
  }

  const invoicePaymentMethod = normalizeSubscriptionPaymentMethod(invoice?.paymentMethod || "");
  if (invoicePaymentMethod !== SUBSCRIPTION_PAYMENT_METHODS.EFT) {
    throw new HttpsError(
      "failed-precondition",
      "Proof upload is only available for EFT subscription invoices.",
    );
  }

  const paymentProof = validatePaymentProofMetadata(request.data?.paymentProof);
  if (!paymentProof.storagePath.startsWith("eftProofs/subscriptions/")) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid subscription proof storage path.",
    );
  }

  await invoiceRef.set(
    {
      paymentMethod: SUBSCRIPTION_PAYMENT_METHODS.EFT,
      paymentApprovalStatus: SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.PENDING,
      paymentApproval: {
        ...buildSubscriptionPaymentApprovalState({
          paymentMethod: SUBSCRIPTION_PAYMENT_METHODS.EFT,
          paymentApprovalStatus: SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.PENDING,
        }),
      },
      paymentProof: {
        ...paymentProof,
        uploadedAt: FIELD_VALUE.serverTimestamp(),
      },
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    ok: true,
    invoiceId,
    proofUploadedAt: new Date().toISOString(),
  };
});

exports.adminUpdateSubscriptionStatus = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const subscriptionId = (payload.subscriptionId || "").toString().trim();
  const nextStatus = normalizeAdminSubscriptionStatusInput(payload.status);
  const reason = normalizeAdminOverrideReason(payload.reason);
  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }
  if (!nextStatus) {
    throw new HttpsError("invalid-argument", "Status must be active, paused, or cancelled.");
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "A reason is required for admin overrides.");
  }

  const actorUid = (request.auth?.uid || "").toString().trim();
  const actorEmail = (request.auth?.token?.email || "").toString().trim().toLowerCase();
  const {
    subscriptionRef,
    subscription,
  } = await resolveSubscriptionByIdForAdmin(subscriptionId);
  const currentStatus = normalizeSubscriptionStatus(subscription.status);
  if (currentStatus === nextStatus) {
    throw new HttpsError(
      "failed-precondition",
      `Subscription is already ${nextStatus}.`,
    );
  }

  const updatePayload = {
    status: nextStatus,
    updatedAt: FIELD_VALUE.serverTimestamp(),
    adminOverride: {
      actionType: "subscription-status-override",
      fromStatus: currentStatus,
      toStatus: nextStatus,
      reason,
      actorUid: actorUid || null,
      actorEmail: actorEmail || null,
      at: FIELD_VALUE.serverTimestamp(),
      source: "admin-console",
    },
  };
  if (nextStatus === SUBSCRIPTION_STATUSES.ACTIVE) {
    updatePayload.resumedAt = FIELD_VALUE.serverTimestamp();
  } else if (nextStatus === SUBSCRIPTION_STATUSES.PAUSED) {
    updatePayload.pausedAt = FIELD_VALUE.serverTimestamp();
  } else if (nextStatus === SUBSCRIPTION_STATUSES.CANCELLED) {
    updatePayload.cancelledAt = FIELD_VALUE.serverTimestamp();
  }

  await subscriptionRef.set(updatePayload, { merge: true });

  let cancelledInvoiceCount = 0;
  if (nextStatus === SUBSCRIPTION_STATUSES.CANCELLED) {
    const invoiceRows = await loadSubscriptionInvoices(subscriptionId);
    const batch = db.batch();
    invoiceRows.forEach((invoice) => {
      if (
        normalizeSubscriptionInvoiceStatus(invoice.status) !==
        SUBSCRIPTION_INVOICE_STATUSES.PENDING
      ) {
        return;
      }
      const invoiceDocId = (invoice.id || invoice.invoiceId || "").toString().trim();
      if (!invoiceDocId) return;
      batch.set(
        db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoiceDocId),
        {
          status: SUBSCRIPTION_INVOICE_STATUSES.CANCELLED,
          paymentApprovalStatus:
            normalizeSubscriptionPaymentMethod(invoice?.paymentMethod || "") === SUBSCRIPTION_PAYMENT_METHODS.EFT
              ? SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.REJECTED
              : SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED,
          paymentApproval: {
            ...buildSubscriptionPaymentApprovalState({
              paymentMethod: normalizeSubscriptionPaymentMethod(invoice?.paymentMethod || ""),
              paymentApprovalStatus:
                normalizeSubscriptionPaymentMethod(invoice?.paymentMethod || "") === SUBSCRIPTION_PAYMENT_METHODS.EFT
                  ? SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.REJECTED
                  : SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED,
            }),
            decidedAt: FIELD_VALUE.serverTimestamp(),
            decidedByUid: actorUid || null,
            decidedByEmail: actorEmail || null,
            note: reason || null,
          },
          cancelledAt: FIELD_VALUE.serverTimestamp(),
          updatedAt: FIELD_VALUE.serverTimestamp(),
          adminOverride: {
            actionType: "subscription-status-override",
            fromStatus: normalizeSubscriptionInvoiceStatus(invoice.status),
            toStatus: SUBSCRIPTION_INVOICE_STATUSES.CANCELLED,
            reason,
            actorUid: actorUid || null,
            actorEmail: actorEmail || null,
            at: FIELD_VALUE.serverTimestamp(),
            source: "admin-console",
          },
        },
        { merge: true },
      );
      cancelledInvoiceCount += 1;
    });
    if (cancelledInvoiceCount > 0) {
      await batch.commit();
    }
  }

  await writeSubscriptionAdminAuditLog({
    actionType: "subscription-status-override",
    actorUid,
    actorEmail,
    subscriptionId,
    fromStatus: currentStatus,
    toStatus: nextStatus,
    reason,
    meta: {
      cancelledInvoiceCount,
    },
  });

  return {
    subscriptionId,
    fromStatus: currentStatus,
    status: nextStatus,
    cancelledInvoiceCount,
  };
});

exports.adminUpsertSubscriptionInvoiceStatus = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const subscriptionId = (payload.subscriptionId || "").toString().trim();
  const cycleMonth = normalizePreorderSendMonth(payload.cycleMonth || "");
  const nextStatus = normalizeAdminSubscriptionInvoiceStatusInput(payload.status);
  const reason = normalizeAdminOverrideReason(payload.reason);
  const createIfMissing = parseBooleanFlag(payload.createIfMissing, true);

  if (!subscriptionId) {
    throw new HttpsError("invalid-argument", "Subscription ID is required.");
  }
  if (!cycleMonth) {
    throw new HttpsError("invalid-argument", "Cycle month must be in YYYY-MM format.");
  }
  if (!nextStatus) {
    throw new HttpsError(
      "invalid-argument",
      "Invoice status must be pending-payment, paid, or cancelled.",
    );
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "A reason is required for admin overrides.");
  }

  const actorUid = (request.auth?.uid || "").toString().trim();
  const actorEmail = (request.auth?.token?.email || "").toString().trim().toLowerCase();
  const { subscriptionRef, subscription } = await resolveSubscriptionByIdForAdmin(subscriptionId);
  let invoiceId = buildSubscriptionInvoiceDocumentId(subscriptionId, cycleMonth);
  let invoiceRef = db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoiceId);
  let invoiceSnap = await invoiceRef.get();
  let invoiceCreated = false;

  if (!invoiceSnap.exists) {
    if (!createIfMissing) {
      throw new HttpsError(
        "failed-precondition",
        "No invoice exists for this subscription and billing cycle.",
      );
    }
    const recurringAmount = resolveSubscriptionRecurringAmount(subscription);
    if (!recurringAmount) {
      throw new HttpsError("failed-precondition", "Subscription plan pricing is invalid.");
    }
    const createdInvoice = await createOrGetSubscriptionInvoice({
      subscriptionId,
      subscription: {
        ...subscription,
        monthlyAmount: recurringAmount,
      },
      cycleMonth,
      amount: recurringAmount,
      isProrated: false,
      proration: null,
      source: "admin-console",
      paymentMethod: normalizeSubscriptionPaymentMethod(subscription?.paymentMethod),
    });
    invoiceId = createdInvoice.invoiceId;
    invoiceRef = createdInvoice.invoiceRef;
    invoiceCreated = Boolean(createdInvoice.created);
    invoiceSnap = await invoiceRef.get();
  }

  if (!invoiceSnap.exists) {
    throw new HttpsError("not-found", "Unable to load subscription invoice.");
  }
  const invoice = invoiceSnap.data() || {};
  const currentStatus = normalizeSubscriptionInvoiceStatus(invoice.status);
  const invoicePaymentMethod = normalizeSubscriptionPaymentMethod(
    invoice?.paymentMethod || subscription?.paymentMethod,
  );
  let nextPaymentApprovalStatus = normalizeSubscriptionPaymentApprovalStatus(
    invoice?.paymentApprovalStatus || invoice?.paymentApproval?.decision || "",
    invoicePaymentMethod,
  );
  if (invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT) {
    if (nextStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID) {
      nextPaymentApprovalStatus = SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.APPROVED;
    } else if (nextStatus === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED) {
      nextPaymentApprovalStatus = SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.REJECTED;
    } else {
      nextPaymentApprovalStatus = SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.PENDING;
    }
  } else {
    nextPaymentApprovalStatus = SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED;
  }
  if (currentStatus === nextStatus && !invoiceCreated) {
    throw new HttpsError(
      "failed-precondition",
      `Invoice is already ${nextStatus}.`,
    );
  }

  const invoiceUpdate = {
    status: nextStatus,
    paymentMethod: invoicePaymentMethod,
    paymentApprovalStatus: nextPaymentApprovalStatus,
    paymentApproval: {
      ...buildSubscriptionPaymentApprovalState({
        paymentMethod: invoicePaymentMethod,
        paymentApprovalStatus: nextPaymentApprovalStatus,
      }),
      decidedAt:
        nextStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID ||
        nextStatus === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED
          ? FIELD_VALUE.serverTimestamp()
          : null,
      decidedByUid:
        nextStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID ||
        nextStatus === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED
          ? actorUid || null
          : null,
      decidedByEmail:
        nextStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID ||
        nextStatus === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED
          ? actorEmail || null
          : null,
      note: reason || null,
    },
    updatedAt: FIELD_VALUE.serverTimestamp(),
    adminOverride: {
      actionType: "subscription-invoice-status-override",
      fromStatus: currentStatus,
      toStatus: nextStatus,
      reason,
      actorUid: actorUid || null,
      actorEmail: actorEmail || null,
      at: FIELD_VALUE.serverTimestamp(),
      source: "admin-console",
      cycleMonth,
    },
  };
  if (nextStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID) {
    invoiceUpdate.paidAt = FIELD_VALUE.serverTimestamp();
    invoiceUpdate.cancelledAt = null;
  } else if (nextStatus === SUBSCRIPTION_INVOICE_STATUSES.PENDING) {
    invoiceUpdate.paidAt = null;
    invoiceUpdate.cancelledAt = null;
  } else if (nextStatus === SUBSCRIPTION_INVOICE_STATUSES.CANCELLED) {
    invoiceUpdate.cancelledAt = FIELD_VALUE.serverTimestamp();
    invoiceUpdate.paidAt = null;
  }
  await invoiceRef.set(invoiceUpdate, { merge: true });

  const subscriptionUpdate = {
    lastInvoiceId: invoiceId,
    lastInvoiceMonth: cycleMonth,
    paymentApprovalStatus:
      invoicePaymentMethod === SUBSCRIPTION_PAYMENT_METHODS.EFT
        ? nextPaymentApprovalStatus
        : SUBSCRIPTION_PAYMENT_APPROVAL_STATUSES.NOT_REQUIRED,
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };
  if (nextStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID) {
    subscriptionUpdate.lastPaymentAt = FIELD_VALUE.serverTimestamp();
    subscriptionUpdate.lastPaidInvoiceId = invoiceId;
  } else if (
    currentStatus === SUBSCRIPTION_INVOICE_STATUSES.PAID &&
    (subscription?.lastPaidInvoiceId || "").toString().trim() === invoiceId
  ) {
    subscriptionUpdate.lastPaidInvoiceId = null;
    subscriptionUpdate.lastPaymentAt = null;
  }
  await subscriptionRef.set(subscriptionUpdate, { merge: true });

  await writeSubscriptionAdminAuditLog({
    actionType: "subscription-invoice-status-override",
    actorUid,
    actorEmail,
    subscriptionId,
    invoiceId,
    cycleMonth,
    fromStatus: currentStatus,
    toStatus: nextStatus,
    reason,
    meta: {
      invoiceCreated,
      createIfMissing,
    },
  });

  const refreshedInvoiceSnap = await invoiceRef.get();
  const refreshedInvoice = refreshedInvoiceSnap.exists ? refreshedInvoiceSnap.data() || {} : {};
  return {
    subscriptionId,
    invoiceId,
    cycleMonth,
    fromStatus: currentStatus,
    status: nextStatus,
    invoiceCreated,
    invoiceNumber: normalizeInvoiceSequenceNumber(refreshedInvoice.invoiceNumber),
    amount: Number(refreshedInvoice.amount || 0),
  };
});

exports.createEftOrderHttp = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    try {
      const data = req.body ?? {};
      const paymentMethod = normalizePaymentMethod(data?.paymentMethod || "eft");
      if (paymentMethod !== "eft") {
        throw new Error("Invalid payment method for EFT checkout.");
      }

      const normalizedPayload = validateOrderPayload(data);
      const {
        customerUid,
        customer,
        items,
        subtotal,
        shippingCost,
        shipping,
        shippingAddress,
        totalPrice,
        containsGiftCards,
      } = normalizedPayload;
      if (containsGiftCards) {
        throw new Error("Gift cards must be paid via PayFast and cannot be checked out with EFT.");
      }
      await upsertCustomerProfileFromOrder({
        customerUid,
        customer,
        shippingAddress,
      });

      const orderNumber = await getNextOrderNumber();
      const orderRef = db.collection("orders").doc();
      const proofUploadToken = crypto.randomBytes(32).toString("hex");
      const proofUploadExpiresAtDate = new Date(Date.now() + EFT_PROOF_UPLOAD_TOKEN_TTL_MS);
      const paymentApproval = {
        required: true,
        decision: "pending",
        decidedAt: null,
        decidedByUid: null,
        decidedByEmail: null,
        note: null,
      };

      const orderPayload = {
        customerUid,
        customer,
        items,
        subtotal,
        shippingCost,
        shipping: shipping || null,
        shippingAddress,
        totalPrice,
        status: "pending-payment-approval",
        paymentStatus: "awaiting-approval",
        paymentMethod: "eft",
        paymentApprovalStatus: "pending",
        paymentApproval,
        paymentProof: null,
        paymentProofUpload: {
          tokenHash: hashEftProofUploadToken(proofUploadToken),
          expiresAt: admin.firestore.Timestamp.fromDate(proofUploadExpiresAtDate),
          usedAt: null,
        },
        orderNumber,
        invoiceNumber: normalizeInvoiceSequenceNumber(orderNumber),
        trackingLink: null,
        createdAt: FIELD_VALUE.serverTimestamp(),
        updatedAt: FIELD_VALUE.serverTimestamp(),
      };
      await orderRef.set(orderPayload);
      await upsertCustomerProfileOrder({
        customerUid,
        orderId: orderRef.id,
        order: orderPayload,
      });

      res.status(200).json({
        ok: true,
        orderId: orderRef.id,
        orderNumber,
        status: "pending-payment-approval",
        paymentApprovalStatus: "pending",
        bankDetails: getEftBankDetails(),
        proofUploadToken,
        proofUploadExpiresAt: proofUploadExpiresAtDate.toISOString(),
      });
    } catch (error) {
      functions.logger.error("Create EFT order failed", error);
      res.status(400).json({ error: error.message || "Unable to create EFT order." });
    }
  });
});

exports.attachEftPaymentProofHttp = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    try {
      const data = req.body ?? {};
      const orderId = (data.orderId || "").toString().trim();
      const proofUploadToken = (data.proofUploadToken || "").toString().trim();
      const paymentProof = validatePaymentProofMetadata(data.paymentProof);

      if (!orderId) {
        throw new Error("Order ID is required.");
      }
      if (!proofUploadToken) {
        throw new Error("Proof upload token is required.");
      }
      if (!paymentProof) {
        throw new Error("Invalid EFT payment proof metadata.");
      }

      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        throw new Error("Order not found.");
      }

      const order = orderSnap.data() || {};
      if (normalizePaymentMethod(order.paymentMethod) !== "eft") {
        throw new Error("Proof upload is only available for EFT orders.");
      }
      if (order.status !== "pending-payment-approval" || normalizePaymentApprovalDecision(order) !== "pending") {
        throw new Error("Proof upload is only available while EFT payment is pending approval.");
      }

      const proofUploadState = order.paymentProofUpload || {};
      const tokenHash = (proofUploadState.tokenHash || "").toString().trim();
      if (!tokenHash) {
        throw new Error("Proof upload is unavailable for this order.");
      }
      if (proofUploadState.usedAt) {
        throw new Error("Proof upload token has already been used.");
      }

      const expiresAt = coerceTimestampToDate(proofUploadState.expiresAt);
      if (!expiresAt || expiresAt.getTime() <= Date.now()) {
        throw new Error("Proof upload token has expired.");
      }

      if (hashEftProofUploadToken(proofUploadToken) !== tokenHash) {
        throw new Error("Invalid proof upload token.");
      }

      await orderRef.set(
        {
          paymentProof: {
            ...paymentProof,
            uploadedAt: FIELD_VALUE.serverTimestamp(),
          },
          "paymentProofUpload.usedAt": FIELD_VALUE.serverTimestamp(),
          updatedAt: FIELD_VALUE.serverTimestamp(),
        },
        { merge: true },
      );

      res.status(200).json({
        ok: true,
        orderId,
        paymentProof: {
          ...paymentProof,
          uploadedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      functions.logger.error("Attach EFT proof failed", error);
      res.status(400).json({ error: error.message || "Unable to attach EFT proof." });
    }
  });
});

exports.getGiftCardPublicHttp = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    try {
      const { giftCardId, token, giftCard } = await resolveGiftCardRequest(req);
      if ((giftCard.status || "").toString().toLowerCase() === "cancelled") {
        res.status(403).json({ error: "Gift card is no longer active." });
        return;
      }
      const payload = buildGiftCardPublicPayload(giftCard, giftCardId, token);
      res.set("Cache-Control", "private, no-store, max-age=0");
      res.status(200).json({
        ok: true,
        giftCard: payload,
      });
    } catch (error) {
      const message = error?.message || "Unable to load gift card.";
      const statusCode = /not found/i.test(message) ? 404 : /token/i.test(message) ? 403 : 400;
      res.status(statusCode).json({ error: message });
    }
  });
});

exports.viewGiftCardHttp = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    try {
      const { giftCardId, token, giftCard } = await resolveGiftCardRequest(req);
      if ((giftCard.status || "").toString().toLowerCase() === "cancelled") {
        res.status(403).send(
          buildGiftCardViewerHtml({
            code: giftCard.code || giftCardId,
            status: "cancelled",
            value: giftCard.value || 0,
            recipientName: giftCard.recipientName || "",
            purchaserName: giftCard.purchaserName || "",
            expiresAt: giftCard.expiresAt || null,
            selectedOptions: giftCard.selectedOptions || [],
            terms: "This gift card is no longer active.",
            downloadUrl: "",
            printUrl: "",
            siteAccessUrl: buildGiftCardSiteUrl(giftCardId, token),
          }),
        );
        return;
      }
      const payload = buildGiftCardPublicPayload(giftCard, giftCardId, token);
      res.set("Content-Type", "text/html; charset=utf-8");
      res.set("Cache-Control", "private, no-store, max-age=0");
      res.status(200).send(buildGiftCardViewerHtml(payload));
    } catch (error) {
      const message = error?.message || "Unable to load gift card.";
      const statusCode = /not found/i.test(message) ? 404 : /token/i.test(message) ? 403 : 400;
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Gift card unavailable</title><style>body{font-family:Verdana,Arial,sans-serif;background:#f5ead7;color:#2f3624;margin:0;padding:24px}.card{max-width:640px;margin:0 auto;background:#fff;border:1px solid rgba(85,107,47,.18);border-radius:14px;padding:18px}</style></head><body><div class="card"><h1 style="margin:0 0 10px;font-size:22px;">Gift card unavailable</h1><p style="margin:0;">${escapeHtml(message)}</p></div></body></html>`;
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(statusCode).send(html);
    }
  });
});

exports.downloadGiftCardPdfHttp = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }
    try {
      const { giftCardId, giftCard } = await resolveGiftCardRequest(req);
      const storagePath = (giftCard.pdfStoragePath || "").toString().trim();
      if (!storagePath) {
        res.status(404).json({ error: "Gift card PDF is not available." });
        return;
      }
      const file = admin.storage().bucket().file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        res.status(404).json({ error: "Gift card PDF could not be found." });
        return;
      }
      const [pdfBuffer] = await file.download();
      const safeCode = (giftCard.code || giftCardId).toString().replace(/[^a-zA-Z0-9_-]/g, "-");
      const inline = (req.query?.inline || "").toString().trim() === "1";
      res.set("Content-Type", "application/pdf");
      res.set(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="bethany-blooms-gift-card-${safeCode}.pdf"`,
      );
      res.set("Cache-Control", "private, no-store, max-age=0");
      res.status(200).send(pdfBuffer);
    } catch (error) {
      const message = error?.message || "Unable to download gift card PDF.";
      const statusCode = /not found/i.test(message) ? 404 : /token/i.test(message) ? 403 : 400;
      res.status(statusCode).json({ error: message });
    }
  });
});

async function handleSubscriptionPayfastItn({
  payfastConfig,
  paymentReference = "",
  params = {},
  paramString = "",
  req,
} = {}) {
  const pendingRef = db.collection(PENDING_SUBSCRIPTION_PAYFAST_COLLECTION).doc(paymentReference);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) {
    return { handled: false, retryRequired: false };
  }

  const pending = pendingSnap.data() || {};
  const pendingStatus = (pending.status || "").toString().trim().toLowerCase();
  const invoiceId = (pending.invoiceId || "").toString().trim();
  const subscriptionId = (pending.subscriptionId || "").toString().trim();
  const invoiceRef = invoiceId
    ? db.collection(SUBSCRIPTION_INVOICES_COLLECTION).doc(invoiceId)
    : null;
  const invoiceSnap = invoiceRef ? await invoiceRef.get() : null;
  const invoiceData = invoiceSnap?.exists ? invoiceSnap.data() || {} : {};
  if (pendingStatus === "superseded") {
    await pendingRef.set(
      {
        status: "ignored-superseded",
        updatedAt: FIELD_VALUE.serverTimestamp(),
        lastPaymentStatus: (params.payment_status || "").toString().toUpperCase() || null,
      },
      { merge: true },
    );
    return { handled: true, retryRequired: false };
  }
  const paymentStatus = (params.payment_status || "").toString().toUpperCase();
  const amountPaid = toCurrency(params.amount_gross || params.amount || 0);
  const transactionMode = normalizePayfastMode(
    pending.payfastMode || pending?.payfast?.mode || payfastConfig.configuredMode,
    payfastConfig.configuredMode,
  );
  const resolvedCredentials = ensurePayfastConfig(
    payfastConfig,
    transactionMode,
    { allowModeFallback: false },
  );
  const transactionHost = resolvedCredentials.host;
  const signatureValue = (params.signature || "").toString().trim().toLowerCase();
  const expectedSignature = createPayfastSignatureFromParamString(
    paramString,
    resolvedCredentials.passphrase,
  );
  const signatureValid = Boolean(signatureValue) && signatureValue === expectedSignature;
  const expectedAmount = toCurrency(pending.amount || 0);
  const currentInvoiceExpectedAmount = invoiceRef
    ? toCurrency(invoiceData?.amount || 0)
    : expectedAmount;
  const currentInvoicePaymentReference = (invoiceData?.paymentReference || "").toString().trim();
  const amountMatches = expectedAmount === amountPaid;
  const currentInvoiceAmountMatches = currentInvoiceExpectedAmount === amountPaid;
  const paymentReferenceMatchesInvoice = invoiceRef
    ? Boolean(currentInvoicePaymentReference && currentInvoicePaymentReference === paymentReference)
    : true;
  const expectedMerchantId = (resolvedCredentials.merchantId || "").toString().trim();
  const postedMerchantId = (params.merchant_id || "").toString().trim();
  const merchantMatches = !postedMerchantId || postedMerchantId === expectedMerchantId;
  const [gatewayValidation, sourceIpValidation] = await Promise.all([
    validateWithPayfast(paramString, transactionMode),
    validatePayfastSourceIp(req),
  ]);
  const validatedWithGateway = gatewayValidation.valid;
  const sourceIpValid = sourceIpValidation.valid;
  const paymentComplete = paymentStatus === "COMPLETE";
  const validationFailures = [];
  if (!signatureValid) validationFailures.push("signature");
  if (!validatedWithGateway) validationFailures.push("gateway");
  if (!sourceIpValid) validationFailures.push("source-ip");
  if (!amountMatches) validationFailures.push("amount");
  if (!currentInvoiceAmountMatches) validationFailures.push("invoice-amount");
  if (!paymentReferenceMatchesInvoice) validationFailures.push("payment-reference");
  if (invoiceRef && !invoiceSnap?.exists) validationFailures.push("invoice-not-found");
  if (!merchantMatches) validationFailures.push("merchant");
  const checksPassed = validationFailures.length === 0;
  const paymentVerified = paymentComplete && checksPassed;

  const payfastDetails = {
    paymentReference: paymentReference || null,
    paymentId: params.pf_payment_id || null,
    paymentStatus,
    gatewayResponse: params.payment_status || null,
    validatedWithGateway,
    gatewayValidationResponse: gatewayValidation.responseText || null,
    gatewayValidationError: gatewayValidation.error || null,
    signatureValid,
    amount: Number(amountPaid),
    invoiceAmount: Number(currentInvoiceExpectedAmount),
    merchantId: postedMerchantId || null,
    merchantMatches,
    mode: transactionMode,
    host: transactionHost,
    sourceIp: sourceIpValidation.requestIp || null,
    sourceIpValid,
    sourceIpValidationReason: sourceIpValidation.reason || null,
    amountMatches,
    currentInvoiceAmountMatches,
    paymentReferenceMatchesInvoice,
    validationFailures,
    raw: params,
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };

  if (invoiceId && invoiceRef) {
    const invoiceUpdate = {
      paymentReference,
      paymentMethod: "payfast",
      payfastMode: transactionMode,
      payfastHost: transactionHost,
      payfast: payfastDetails,
      updatedAt: FIELD_VALUE.serverTimestamp(),
    };
    if (paymentVerified) {
      invoiceUpdate.status = SUBSCRIPTION_INVOICE_STATUSES.PAID;
      invoiceUpdate.paidAt = FIELD_VALUE.serverTimestamp();
    }
    if (invoiceSnap?.exists) {
      await invoiceRef.set(invoiceUpdate, { merge: true });
    }
  }

  if (paymentVerified && subscriptionId) {
    await db.collection(SUBSCRIPTIONS_COLLECTION).doc(subscriptionId).set(
      {
        lastPaymentAt: FIELD_VALUE.serverTimestamp(),
        lastPaidInvoiceId: invoiceId || null,
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
  }

  const pendingUpdate = {
    paymentReference,
    invoiceId: invoiceId || null,
    subscriptionId: subscriptionId || null,
    payfastMode: transactionMode,
    payfastHost: transactionHost,
    lastPaymentStatus: paymentStatus,
    amountPaid: Number(amountPaid),
    signatureValid,
    validatedWithGateway,
    sourceIpValid,
    amountMatches,
    currentInvoiceAmountMatches,
    paymentReferenceMatchesInvoice,
    merchantMatches,
    validationFailures,
    paymentVerified,
    payfast: {
      mode: transactionMode,
      host: transactionHost,
    },
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };
  if (paymentVerified) {
    pendingUpdate.status = "completed";
    pendingUpdate.completedAt = FIELD_VALUE.serverTimestamp();
  } else if (paymentComplete) {
    pendingUpdate.status = "validation-failed";
  }
  await pendingRef.set(pendingUpdate, { merge: true });

  return {
    handled: true,
    retryRequired:
      paymentComplete &&
      !checksPassed &&
      (gatewayValidation.retryable || sourceIpValidation.retryable),
  };
}

exports.payfastItn = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const payfastConfig = getPayfastConfig();
  const { params, entries } = parsePayfastBody(req);
  const paramString = buildPayfastParamString(entries, {
    excludeSignature: true,
    skipBlankValues: false,
    trimValues: false,
  });

  const orderId = params.m_payment_id || params.custom_str1;
  const paymentStatus = (params.payment_status || "").toString().toUpperCase();
  const amountPaid = toCurrency(params.amount_gross || params.amount || 0);

  if (!orderId) {
    functions.logger.warn("PayFast ITN missing order reference", params);
    res.status(400).send("Missing order reference");
    return;
  }

  const pendingRef = db.collection(PENDING_COLLECTION).doc(orderId);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) {
    const subscriptionItn = await handleSubscriptionPayfastItn({
      payfastConfig,
      paymentReference: orderId,
      params,
      paramString,
      req,
    });
    if (subscriptionItn.handled) {
      if (subscriptionItn.retryRequired) {
        res.status(503).send("Validation retry required");
      } else {
        res.status(200).send("OK");
      }
      return;
    }
    functions.logger.warn("PayFast ITN for unknown pending order", { orderId, params });
    res.status(404).send("Pending order not found");
    return;
  }

  const pending = pendingSnap.data() || {};
  const transactionMode = normalizePayfastMode(
    pending.payfastMode || pending?.payfast?.mode || payfastConfig.configuredMode,
    payfastConfig.configuredMode,
  );
  const resolvedCredentials = ensurePayfastConfig(
    payfastConfig,
    transactionMode,
    { allowModeFallback: false },
  );
  const transactionHost = resolvedCredentials.host;
  const signatureValue = (params.signature || "").toString().trim().toLowerCase();
  const expectedSignature = createPayfastSignatureFromParamString(
    paramString,
    resolvedCredentials.passphrase,
  );
  const signatureValid = Boolean(signatureValue) && signatureValue === expectedSignature;
  const expectedAmount = toCurrency(pending.totalPrice || 0);
  const amountMatches = expectedAmount === amountPaid;
  const expectedMerchantId = (resolvedCredentials.merchantId || "").toString().trim();
  const postedMerchantId = (params.merchant_id || "").toString().trim();
  const merchantMatches = !postedMerchantId || postedMerchantId === expectedMerchantId;
  const [gatewayValidation, sourceIpValidation] = await Promise.all([
    validateWithPayfast(paramString, transactionMode),
    validatePayfastSourceIp(req),
  ]);
  const validatedWithGateway = gatewayValidation.valid;
  const sourceIpValid = sourceIpValidation.valid;
  const paymentComplete = paymentStatus === "COMPLETE";
  const validationFailures = [];
  if (!signatureValid) validationFailures.push("signature");
  if (!validatedWithGateway) validationFailures.push("gateway");
  if (!sourceIpValid) validationFailures.push("source-ip");
  if (!amountMatches) validationFailures.push("amount");
  if (!merchantMatches) validationFailures.push("merchant");
  const checksPassed = validationFailures.length === 0;

  const payfastDetails = {
    paymentReference: params.m_payment_id || null,
    paymentId: params.pf_payment_id || null,
    paymentStatus,
    gatewayResponse: params.payment_status || null,
    validatedWithGateway,
    gatewayValidationResponse: gatewayValidation.responseText || null,
    gatewayValidationError: gatewayValidation.error || null,
    signatureValid,
    amount: Number(amountPaid),
    merchantId: postedMerchantId || null,
    merchantMatches,
    mode: transactionMode,
    host: transactionHost,
    sourceIp: sourceIpValidation.requestIp || null,
    sourceIpValid,
    sourceIpValidationReason: sourceIpValidation.reason || null,
    amountMatches,
    validationFailures,
    raw: params,
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };

  let orderRef = null;
  let orderCreated = false;
  const paymentVerified = paymentComplete && checksPassed;
  const pendingCustomerUid = normalizeCustomerUid(pending.customerUid);

  if (paymentVerified && !pending.orderId) {
    const orderNumber = await getNextOrderNumber();
    const paymentApproval = {
      required: false,
      decision: "not-required",
      decidedAt: null,
      decidedByUid: null,
      decidedByEmail: null,
      note: null,
    };
    const orderPayload = {
      customerUid: pendingCustomerUid,
      customer: pending.customer,
      items: pending.items,
      subtotal: pending.subtotal ?? null,
      shippingCost: pending.shippingCost ?? 0,
      shipping: pending.shipping ?? null,
      shippingAddress: pending.shippingAddress ?? null,
      totalPrice: pending.totalPrice,
      status: "order-placed",
      paymentStatus: "paid",
      paymentMethod: "payfast",
      paymentApprovalStatus: "not-required",
      paymentApproval,
      paidAt: FIELD_VALUE.serverTimestamp(),
      orderNumber,
      invoiceNumber: normalizeInvoiceSequenceNumber(orderNumber),
      trackingLink: null,
      createdAt: pending.createdAt || FIELD_VALUE.serverTimestamp(),
      updatedAt: FIELD_VALUE.serverTimestamp(),
      payfast: payfastDetails,
    };
    const newOrderRef = db.collection("orders").doc();
    await newOrderRef.set(orderPayload);
    await upsertCustomerProfileOrder({
      customerUid: pendingCustomerUid,
      orderId: newOrderRef.id,
      order: orderPayload,
    });
    await upsertCustomerProfileFromOrder({
      customerUid: pendingCustomerUid,
      customer: pending.customer || {},
      shippingAddress: pending.shippingAddress || null,
    });
    await applyProductInventoryForOrder(newOrderRef.id, {
      orderRef: newOrderRef,
      orderData: orderPayload,
      reason: "payfast-complete",
    });
    await createBookingsForOrder(pending.items || [], pending.customer || {}, newOrderRef.id);
    await pendingRef.set(
      {
        status: "completed",
        orderId: newOrderRef.id,
        payfastMode: transactionMode,
        payfastHost: transactionHost,
        payfast: {
          mode: transactionMode,
          host: transactionHost,
        },
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
    orderRef = newOrderRef;
    orderCreated = true;
  } else if (pending.orderId) {
    orderRef = db.doc(`orders/${pending.orderId}`);
  }

  if (orderRef && !orderCreated) {
    const orderUpdate = {
      payfast: payfastDetails,
    };
    if (paymentVerified) {
      if (pendingCustomerUid) {
        orderUpdate.customerUid = pendingCustomerUid;
      }
      orderUpdate.paymentStatus = "paid";
      orderUpdate.paymentMethod = "payfast";
      orderUpdate.paymentApprovalStatus = "not-required";
      orderUpdate.paymentApproval = {
        required: false,
        decision: "not-required",
        decidedAt: null,
        decidedByUid: null,
        decidedByEmail: null,
        note: null,
      };
      orderUpdate.status = "order-placed";
      orderUpdate.paidAt = FIELD_VALUE.serverTimestamp();
    }
    await orderRef.set(orderUpdate, { merge: true });
    if (paymentVerified) {
      await upsertCustomerProfileFromOrder({
        customerUid: pendingCustomerUid,
        customer: pending.customer || {},
        shippingAddress: pending.shippingAddress || null,
      });
      const orderSnap = await orderRef.get();
      await upsertCustomerProfileOrder({
        customerUid: pendingCustomerUid,
        orderId: orderRef.id,
        order: orderSnap.exists ? orderSnap.data() || {} : { ...pending, ...orderUpdate },
      });
      await applyProductInventoryForOrder(orderRef.id, {
        orderRef,
        reason: "payfast-complete",
      });
    }
  }

  const pendingUpdate = {
    customerUid: pendingCustomerUid,
    payfastMode: transactionMode,
    payfastHost: transactionHost,
    payfast: {
      mode: transactionMode,
      host: transactionHost,
    },
    lastPaymentStatus: paymentStatus,
    amountPaid: Number(amountPaid),
    signatureValid,
    validatedWithGateway,
    sourceIpValid,
    amountMatches,
    merchantMatches,
    validationFailures,
    paymentVerified,
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };
  if (paymentVerified) {
    pendingUpdate.status = "completed";
    if (orderRef?.id) {
      pendingUpdate.orderId = orderRef.id;
    }
  }

  await pendingRef.set(pendingUpdate, { merge: true });

  if (paymentComplete && !checksPassed && (gatewayValidation.retryable || sourceIpValidation.retryable)) {
    res.status(503).send("Validation retry required");
    return;
  }

  res.status(200).send("OK");
});

exports.reviewEftPayment = onCall(async (request) => {
  await assertAdminRequest(request);
  const payload = request.data || {};
  const orderId = (payload.orderId || "").toString().trim();
  const decisionRaw = (payload.decision || "").toString().trim().toLowerCase();
  const note = (payload.note || "").toString().trim().slice(0, 500);

  if (!orderId) {
    throw new HttpsError("invalid-argument", "Order ID is required.");
  }
  if (!["approve", "reject"].includes(decisionRaw)) {
    throw new HttpsError("invalid-argument", "Decision must be approve or reject.");
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  if (normalizePaymentMethod(order.paymentMethod) !== "eft") {
    throw new HttpsError("failed-precondition", "This action is only valid for EFT orders.");
  }

  const targetDecision = decisionRaw === "approve" ? "approved" : "rejected";
  const currentDecision = normalizePaymentApprovalDecision(order);

  if (currentDecision === targetDecision) {
    if (targetDecision === "approved") {
      await applyProductInventoryForOrder(orderId, {
        orderRef,
        reason: "eft-approved",
      });
    }
    return {
      ok: true,
      orderId,
      decision: targetDecision,
      status: order.status || null,
      paymentApprovalStatus: order.paymentApprovalStatus || currentDecision,
    };
  }

  const callerUid = request.auth?.uid || null;
  const callerEmail = (request.auth?.token?.email || "").toString().trim() || null;
  const approvalPayload = {
    required: true,
    decision: targetDecision,
    decidedAt: FIELD_VALUE.serverTimestamp(),
    decidedByUid: callerUid,
    decidedByEmail: callerEmail,
    note: note || null,
  };

  const updatePayload = {
    paymentMethod: "eft",
    paymentApprovalStatus: targetDecision,
    paymentApproval: approvalPayload,
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };

  if (targetDecision === "approved") {
    updatePayload.paymentStatus = "paid";
    updatePayload.status = "order-placed";
    updatePayload.paidAt = FIELD_VALUE.serverTimestamp();
  } else {
    updatePayload.paymentStatus = "rejected";
    updatePayload.status = "payment-rejected";
  }

  await orderRef.set(updatePayload, { merge: true });

  if (targetDecision === "approved") {
    await applyProductInventoryForOrder(orderId, {
      orderRef,
      reason: "eft-approved",
    });
    await createBookingsForOrder(order.items || [], order.customer || {}, orderId);
    await issueGiftCardsForOrder({
      orderRef,
      orderId,
      orderData: order,
      reason: "eft-approved",
    });
  }

  const updatedSnap = await orderRef.get();
  const updatedOrder = updatedSnap.data() || order;
  const customerEmail = (updatedOrder.customer?.email || "").toString().trim();

  if (customerEmail) {
    await sendEmail({
      to: customerEmail,
      subject: `Bethany Blooms - EFT payment ${targetDecision}`,
      html: buildEftDecisionCustomerEmailHtml({
        order: updatedOrder,
        orderId,
        decision: targetDecision,
        note,
      }),
    });
  }

  await sendEmail({
    to: getAdminEmail(),
    subject: `EFT payment ${targetDecision} - ${updatedOrder.orderNumber || orderId}`,
    html: buildEftDecisionAdminEmailHtml({
      order: updatedOrder,
      orderId,
      decision: targetDecision,
      note,
    }),
  });

  return {
    ok: true,
    orderId,
    decision: targetDecision,
    status: updatedOrder.status || null,
    paymentApprovalStatus: updatedOrder.paymentApprovalStatus || targetDecision,
  };
});

exports.reconcilePaidOrderProductInventory = onCall(
  { timeoutSeconds: 540 },
  async (request) => {
    await assertAdminRequest(request);
    const payload = request.data || {};
    const dryRun = parseBooleanFlag(payload.dryRun, true);
    const limit = parseReconciliationLimit(payload.limit, 100);
    const cursorOrderId = (payload.cursorOrderId || "").toString().trim();

    let ordersQuery = db
      .collection("orders")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(limit);

    if (cursorOrderId) {
      const cursorRef = db.doc(`orders/${cursorOrderId}`);
      const cursorSnap = await cursorRef.get();
      if (!cursorSnap.exists) {
        throw new HttpsError("invalid-argument", "Cursor order not found.");
      }
      ordersQuery = ordersQuery.startAfter(cursorSnap);
    }

    const ordersSnap = await ordersQuery.get();
    const scannedCount = ordersSnap.size;
    const hasMore = scannedCount === limit;
    const nextCursorOrderId = hasMore && scannedCount > 0
      ? ordersSnap.docs[ordersSnap.docs.length - 1].id
      : null;

    const candidates = [];
    let skippedAlreadyAdjusted = 0;
    let skippedNoProductItems = 0;
    let skippedUnpaidOrUnapproved = 0;

    ordersSnap.docs.forEach((docSnap) => {
      const order = docSnap.data() || {};
      if (!isOrderEligibleForInventoryDeduction(order)) {
        skippedUnpaidOrUnapproved += 1;
        return;
      }
      const adjustments = buildOrderProductAdjustments(order.items || []);
      if (!adjustments.length) {
        skippedNoProductItems += 1;
        return;
      }
      if (order?.inventory?.stockDeductedAt) {
        skippedAlreadyAdjusted += 1;
        return;
      }
      candidates.push({
        orderId: docSnap.id,
        orderRef: docSnap.ref,
        orderData: order,
      });
    });

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        scannedCount,
        hasMore,
        nextCursorOrderId,
        candidateCount: candidates.length,
        skippedAlreadyAdjusted,
        skippedNoProductItems,
        skippedUnpaidOrUnapproved,
        candidateOrderIds: candidates.slice(0, 100).map((entry) => entry.orderId),
      };
    }

    const reconciledOrderIds = [];
    const failedOrderIds = [];
    const failedDetails = [];
    let adjustedOrderCount = 0;
    let alreadyAdjustedDuringRun = 0;
    let noTrackedInventoryCount = 0;

    for (const candidate of candidates) {
      try {
        const result = await applyProductInventoryForOrder(candidate.orderId, {
          orderRef: candidate.orderRef,
          orderData: candidate.orderData,
          reason: "admin-reconciliation",
        });

        reconciledOrderIds.push(candidate.orderId);
        if (result?.reason === "already-adjusted") {
          alreadyAdjustedDuringRun += 1;
        } else if (result?.adjusted) {
          adjustedOrderCount += 1;
        } else {
          noTrackedInventoryCount += 1;
        }
      } catch (error) {
        failedOrderIds.push(candidate.orderId);
        failedDetails.push({
          orderId: candidate.orderId,
          message: error?.message || "Unknown reconciliation error.",
        });
      }
    }

    return {
      ok: true,
      dryRun: false,
      scannedCount,
      hasMore,
      nextCursorOrderId,
      candidateCount: candidates.length,
      reconciledCount: reconciledOrderIds.length,
      adjustedOrderCount,
      alreadyAdjustedDuringRun,
      noTrackedInventoryCount,
      failedCount: failedOrderIds.length,
      failedOrderIds,
      failedDetails: failedDetails.slice(0, 20),
      skippedAlreadyAdjusted,
      skippedNoProductItems,
      skippedUnpaidOrUnapproved,
    };
  },
);

exports.createAdminEftOrder = onCall(async (request) => {
  await assertAdminRequest(request);
  const payload = request.data || {};
  const normalizedPayload = validateOrderPayload(payload);
  const {
    customerUid,
    customer,
    items,
    subtotal,
    shippingCost,
    shipping,
    shippingAddress,
    totalPrice,
    containsGiftCards,
  } = normalizedPayload;
  if (containsGiftCards) {
    throw new HttpsError(
      "failed-precondition",
      "Gift cards must be paid via PayFast and cannot be created as EFT orders.",
    );
  }
  await upsertCustomerProfileFromOrder({
    customerUid,
    customer,
    shippingAddress,
  });

  const orderNumber = await getNextOrderNumber();
  const orderRef = db.collection("orders").doc();
  const adminUid = request.auth?.uid || null;
  const adminEmail = (request.auth?.token?.email || "").toString().trim() || null;
  const paymentApproval = {
    required: true,
    decision: "pending",
    decidedAt: null,
    decidedByUid: null,
    decidedByEmail: null,
    note: null,
  };

  const orderPayload = {
    customerUid,
    customer,
    items,
    subtotal,
    shippingCost,
    shipping: shipping || null,
    shippingAddress: shippingAddress || null,
    totalPrice,
    status: "pending-payment-approval",
    paymentStatus: "awaiting-approval",
    paymentMethod: "eft",
    paymentApprovalStatus: "pending",
    paymentApproval,
    paymentProof: null,
    orderNumber,
    invoiceNumber: normalizeInvoiceSequenceNumber(orderNumber),
    trackingLink: null,
    createdByAdmin: {
      uid: adminUid,
      email: adminEmail,
      createdAt: FIELD_VALUE.serverTimestamp(),
    },
    createdAt: FIELD_VALUE.serverTimestamp(),
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };
  await orderRef.set(orderPayload);
  await upsertCustomerProfileOrder({
    customerUid,
    orderId: orderRef.id,
    order: orderPayload,
  });

  try {
    await wait(1500);
    await dispatchOrderCreatedNotifications({
      orderRef,
      orderId: orderRef.id,
      source: "trigger",
      sendAdmin: false,
      retryCustomer: true,
      skipIfCustomerAlreadyAttempted: true,
    });
  } catch (dispatchError) {
    functions.logger.warn("Admin order email dispatch fallback failed", {
      orderId: orderRef.id,
      error: dispatchError?.message || dispatchError,
    });
  }

  return {
    ok: true,
    orderId: orderRef.id,
    orderNumber,
    status: "pending-payment-approval",
    paymentApprovalStatus: "pending",
  };
});

exports.adminUpdateOrderDeliveryDetails = onCall(async (request) => {
  await assertAdminRequest(request);
  const payload = request.data || {};
  const orderId = (payload.orderId || "").toString().trim();
  if (!orderId) {
    throw new HttpsError("invalid-argument", "Order ID is required.");
  }

  const deliveryMethod = normalizeOrderDeliveryMethod(payload.deliveryMethod);
  const shippingAddress = normalizeOrderShippingAddressInput(payload.shippingAddress || {});
  if (!hasCompleteShippingAddress(shippingAddress)) {
    throw new HttpsError(
      "invalid-argument",
      "Shipping address must include street, suburb, city, province, and a 4-digit postal code.",
    );
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};

  const previousShippingCost = coerceOrderShippingCost(order);
  const previousTotalPrice = coerceOrderTotalPrice(order);
  const subtotal = computeOrderSubtotal(order);

  let resolvedCourier = null;
  let shippingCost = previousShippingCost;
  if (deliveryMethod === "courier") {
    const courierId = (payload.courierId || "").toString().trim();
    const courierName = (payload.courierName || "").toString().trim();
    if (!courierId && !courierName) {
      throw new HttpsError("invalid-argument", "Select a courier for courier delivery.");
    }
    resolvedCourier = await resolveCourierOptionForDeliveryUpdate({
      courierId,
      courierName,
      province: shippingAddress.province,
    });
    shippingCost = Number(resolvedCourier.price || 0);
  }

  const totalPrice = Number((subtotal + shippingCost).toFixed(2));
  const totalsChanged = Math.abs(totalPrice - previousTotalPrice) > 0.009;
  const paymentAdjustmentRequired = isOrderPaidForDeliveryAdjustment(order) && totalsChanged;
  const paymentAdjustmentDelta = paymentAdjustmentRequired
    ? Number((totalPrice - previousTotalPrice).toFixed(2))
    : 0;

  const trackingLinkProvided = Object.prototype.hasOwnProperty.call(payload, "trackingLink");
  const trackingLink = trackingLinkProvided
    ? trimToLength(payload.trackingLink || "", 2000)
    : trimToLength(order?.trackingLink || "", 2000);
  const normalizedTrackingLink = trackingLink || null;

  const customer = {
    ...(order?.customer && typeof order.customer === "object" ? order.customer : {}),
    address: formatOrderShippingAddress(shippingAddress),
  };
  const adminUid = (request.auth?.uid || "").toString().trim() || null;
  const adminEmail = (request.auth?.token?.email || "").toString().trim() || null;

  const updatePayload = {
    deliveryMethod,
    courierName: deliveryMethod === "courier" ? resolvedCourier?.name || "" : "",
    trackingLink: normalizedTrackingLink,
    shippingAddress,
    shipping:
      deliveryMethod === "courier"
        ? {
            courierId: resolvedCourier?.id || null,
            courierName: resolvedCourier?.name || null,
            courierPrice: shippingCost,
            province: shippingAddress.province || null,
          }
        : null,
    shippingCost,
    totalPrice,
    customer,
    deliveryUpdatedAt: FIELD_VALUE.serverTimestamp(),
    deliveryUpdatedByUid: adminUid,
    deliveryUpdatedByEmail: adminEmail,
    paymentAdjustment: paymentAdjustmentRequired
      ? {
          required: true,
          status: "review-needed",
          reason: "delivery-change-total-adjusted",
          previousShippingCost,
          newShippingCost: shippingCost,
          previousTotalPrice,
          newTotalPrice: totalPrice,
          delta: paymentAdjustmentDelta,
          changedAt: FIELD_VALUE.serverTimestamp(),
          changedByUid: adminUid,
          changedByEmail: adminEmail,
        }
      : {
          required: false,
          status: "not-required",
          reason: null,
          previousShippingCost: null,
          newShippingCost: null,
          previousTotalPrice: null,
          newTotalPrice: null,
          delta: null,
          changedAt: FIELD_VALUE.serverTimestamp(),
          changedByUid: adminUid,
          changedByEmail: adminEmail,
        },
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };

  await orderRef.set(updatePayload, { merge: true });
  const updatedOrderSnap = await orderRef.get();
  const updatedOrder = updatedOrderSnap.exists
    ? updatedOrderSnap.data() || {}
    : { ...order, ...updatePayload };

  await upsertCustomerProfileOrder({
    customerUid: normalizeCustomerUid(updatedOrder.customerUid || order.customerUid),
    orderId,
    order: updatedOrder,
  });

  return {
    ok: true,
    orderId,
    shippingCost,
    totalPrice,
    previousShippingCost,
    previousTotalPrice,
    paymentAdjustmentRequired,
    paymentAdjustmentDelta,
  };
});

exports.adminSendOrderDeliveryUpdateEmail = onCall(async (request) => {
  await assertAdminRequest(request);
  const payload = request.data || {};
  const orderId = (payload.orderId || "").toString().trim();
  if (!orderId) {
    throw new HttpsError("invalid-argument", "Order ID is required.");
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const order = orderSnap.data() || {};
  const customerEmail = trimToLength(order?.customer?.email || "", 160);
  if (!customerEmail) {
    throw new HttpsError("failed-precondition", "Customer email is missing.");
  }
  if (!getResendClient()) {
    return {
      ok: false,
      emailStatus: "failed",
      emailError: "Email service is not configured.",
    };
  }

  const orderLabel = Number.isFinite(Number(order?.orderNumber))
    ? `Order #${Number(order.orderNumber)}`
    : `Order ${orderId}`;
  const sendResult = await sendEmailWithRetry({
    to: customerEmail,
    subject: `Bethany Blooms - Delivery update for ${orderLabel}`,
    html: buildOrderDeliveryUpdateEmailHtml(order, orderId),
    retryCount: 1,
    retryDelayMs: 1200,
  });
  const finalError = sendResult?.finalResult?.error || null;
  if (finalError) {
    return {
      ok: false,
      emailStatus: "failed",
      emailError: finalError,
    };
  }
  return {
    ok: true,
    emailStatus: "sent",
    emailError: null,
  };
});

exports.sendContactEmail = onCall(async (request) => {
  if (!getResendClient()) {
    throw new HttpsError(
      "failed-precondition",
      "Email service is not configured.",
    );
  }
  const payload = request.data || {};
  const name = (payload.name || "").toString().trim();
  const email = (payload.email || "").toString().trim();
  const message = (payload.message || "").toString().trim();

  if (!name || !email || !message) {
    throw new HttpsError(
      "invalid-argument",
      "Name, email, and message are required.",
    );
  }

  const adminSubject = `New enquiry from ${name}`;
  const customerSubject = "We received your message";

  await sendEmail({
    to: getAdminEmail(),
    subject: adminSubject,
    html: buildContactEmailHtml(payload),
  });

  await sendEmail({
    to: email,
    subject: customerSubject,
    html: buildContactConfirmationHtml(payload),
  });

  return { ok: true };
});

exports.sendOrderStatusEmail = onCall(async (request) => {
  if (!getResendClient()) {
    throw new HttpsError(
      "failed-precondition",
      "Email service is not configured.",
    );
  }
  await assertAdminRequest(request);

  const payload = request.data || {};
  const customer = payload.customer || {};
  const customerEmail = (customer.email || payload.email || payload.customerEmail || "").toString().trim();
  if (!customerEmail) {
    throw new HttpsError("invalid-argument", "Customer email is required.");
  }

  const status = (payload.status || "updated").toString();
  const orderNumber = payload.orderNumber ? `Order #${payload.orderNumber}` : "Your order";
  const trackingLink = (payload.trackingLink || "").toString().trim();

  const html = buildOrderStatusEmailHtml({
    customer,
    status,
    orderNumber,
    trackingLink,
    items: Array.isArray(payload.items) ? payload.items : [],
  });

  const sendResult = await sendEmail({
    to: customerEmail,
    subject: `Bethany Blooms - ${orderNumber} update`,
    html,
  });
  if (sendResult?.error) {
    throw new HttpsError("internal", sendResult.error);
  }

  return { ok: true };
});

exports.sendPreorderListEmail = onCall(async (request) => {
  if (!getResendClient()) {
    throw new HttpsError(
      "failed-precondition",
      "Email service is not configured.",
    );
  }
  await assertAdminRequest(request);

  const payload = request.data || {};
  const customer = payload.customer || {};
  const customerEmail = (customer.email || payload.email || payload.customerEmail || "").toString().trim();
  if (!customerEmail) {
    throw new HttpsError("invalid-argument", "Customer email is required.");
  }

  const orderNumber = payload.orderNumber ? `Order #${payload.orderNumber}` : "Your order";
  const preorderSendMonth = (payload.preorderSendMonth || "").toString().trim();

  const html = buildPreorderListEmailHtml({
    customer,
    orderNumber,
    preorderSendMonth,
    items: Array.isArray(payload.items) ? payload.items : [],
  });

  const sendResult = await sendEmail({
    to: customerEmail,
    subject: `Bethany Blooms - ${orderNumber} pre-order update`,
    html,
  });
  if (sendResult?.error) {
    throw new HttpsError("internal", sendResult.error);
  }

  return { ok: true };
});

exports.resendOrderConfirmationEmail = onCall(async (request) => {
  if (!getResendClient()) {
    throw new HttpsError(
      "failed-precondition",
      "Email service is not configured.",
    );
  }
  await assertAdminRequest(request);

  const payload = request.data || {};
  const orderId = (payload.orderId || "").toString().trim();
  const orderRef = orderId ? db.doc(`orders/${orderId}`) : null;

  let order = payload.order && typeof payload.order === "object" ? payload.order : null;
  if (orderRef) {
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }
    order = orderSnap.data() || order;
  }

  if (!order) {
    throw new HttpsError("invalid-argument", "Order details are required.");
  }

  const customerEmail = (
    order.customer?.email ||
    payload.customerEmail ||
    payload.email ||
    ""
  ).toString().trim();
  const templateUsed = resolveOrderCreatedEmailTemplate(order);
  const previousCustomerNotification = order.notifications?.orderCreated?.customer || null;

  if (!customerEmail) {
    if (orderRef) {
      await orderRef.set(
        {
          notifications: {
            orderCreated: {
              customer: buildOrderNotificationAttempt({
                status: ORDER_NOTIFICATION_STATUSES.SKIPPED,
                template: templateUsed,
                source: "manual-resend",
                error: "Customer email is missing.",
                previousSentAt: previousCustomerNotification?.sentAt || null,
              }),
            },
          },
          updatedAt: FIELD_VALUE.serverTimestamp(),
        },
        { merge: true },
      );
    }
    throw new HttpsError("invalid-argument", "Customer email is required.");
  }

  const { subject, html } = resolveOrderCreatedEmailContent({
    order,
    orderId: orderId || "manual-resend",
    template: templateUsed,
    recipient: "customer",
  });

  const sendResult = await sendEmail({
    to: customerEmail,
    subject,
    html,
  });

  const deliveryStatus = sendResult?.error ?
    ORDER_NOTIFICATION_STATUSES.FAILED :
    ORDER_NOTIFICATION_STATUSES.SENT;
  const customerNotification = buildOrderNotificationAttempt({
    status: deliveryStatus,
    template: templateUsed,
    source: "manual-resend",
    error: sendResult?.error || null,
    previousSentAt: previousCustomerNotification?.sentAt || null,
  });
  if (orderRef) {
    await orderRef.set(
      {
        notifications: {
          orderCreated: {
            customer: customerNotification,
          },
        },
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
  }
  if (sendResult?.error) {
    throw new HttpsError("internal", sendResult.error);
  }

  return {
    ok: true,
    customerEmail,
    orderId: orderId || null,
    templateUsed,
    deliveryStatus,
  };
});

exports.sendBookingEmail = onCall(async (request) => {
  if (!getResendClient()) {
    throw new HttpsError(
      "failed-precondition",
      "Email service is not configured.",
    );
  }

  const payload = request.data || {};
  const bookingType = (payload.type || "workshop").toString();
  const email = (payload.email || "").toString().trim();
  const fullName = (payload.fullName || "").toString().trim();

  if (!email || !fullName) {
    throw new HttpsError(
      "invalid-argument",
      "Customer name and email are required.",
    );
  }

  let adminHtml = "";
  let customerHtml = "";
  let subjectBase = "Booking";

  if (bookingType === "cut-flower") {
    adminHtml = buildCutFlowerAdminEmailHtml(payload);
    customerHtml = buildCutFlowerCustomerHtml(payload);
    subjectBase = "Cut flower booking";
  } else {
    adminHtml = buildWorkshopAdminEmailHtml(payload);
    customerHtml = buildWorkshopCustomerHtml(payload);
    subjectBase = "Workshop booking";
  }

  await sendEmail({
    to: getAdminEmail(),
    subject: `New ${subjectBase} - ${fullName}`,
    html: adminHtml,
  });

  await sendEmail({
    to: email,
    subject: `Bethany Blooms - ${subjectBase} received`,
    html: customerHtml,
  });

  return { ok: true };
});

exports.previewTestEmailTemplate = onCall({ cors: true }, async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const templateType = (payload.templateType || "custom").toString();
  const content = buildTestEmailContent({
    templateType,
    subject: (payload.subject || "").toString().trim(),
    html: (payload.html || "").toString(),
  });

  return {
    ok: true,
    templateType: templateType.toString().trim().toLowerCase() || "custom",
    subject: content.subject,
    html: content.html,
    generatedAt: new Date().toISOString(),
  };
});

exports.previewSubscriptionInvoiceTemplate = onCall({ cors: true }, async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const invoiceId = (payload.invoiceId || "").toString().trim();
  const previewData = await resolveSubscriptionInvoiceForAdminPreview(invoiceId);
  const pdfBytes = await createSubscriptionInvoicePdfBytes({
    subscriptionId: previewData.subscriptionId,
    invoiceId: previewData.invoiceId,
    subscription: previewData.subscription,
    invoice: previewData.invoice,
  });
  const invoiceNumber = buildSubscriptionInvoiceNumber({
    invoice: previewData.invoice || {},
    invoiceId: previewData.invoiceId,
    cycleMonth: previewData.invoice?.cycleMonth || "",
  });
  const fileName = buildSubscriptionInvoicePdfFileName(invoiceNumber);

  return {
    ok: true,
    source: previewData.source,
    invoiceId: previewData.source === "invoice" ? previewData.invoiceId : null,
    subscriptionId: previewData.source === "invoice" ? previewData.subscriptionId : null,
    invoiceNumber,
    cycleMonth: previewData.invoice?.cycleMonth || "",
    planName: buildSubscriptionPlanLabel(previewData.subscription, previewData.invoice),
    amount: Number(previewData.invoice?.amount || 0),
    mimeType: SUBSCRIPTION_INVOICE_PDF_CONTENT_TYPE,
    fileName,
    pdfBase64: Buffer.from(pdfBytes).toString("base64"),
    generatedAt: new Date().toISOString(),
  };
});

exports.sendTestEmail = onCall({ cors: true }, async (request) => {
  if (!getResendClient()) {
    throw new HttpsError("failed-precondition", "Email service is not configured.");
  }
  await assertAdminRequest(request);
  const payload = request.data || {};
  const email = (payload.email || getAdminEmail()).toString().trim();
  const templateType = (payload.templateType || "custom").toString();
  const content = buildTestEmailContent({
    templateType,
    subject: (payload.subject || "").toString().trim(),
    html: (payload.html || "").toString(),
  });
  const subject = content.subject;
  const html = content.html;

  if (!email) {
    throw new HttpsError("invalid-argument", "Recipient email is required.");
  }

  await sendEmail({ to: email, subject, html });
  return { ok: true, preview: null };
});

exports.sendTestGiftCard = onCall({ cors: true }, async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const recipientEmail = (
    payload.recipientEmail ||
    request.auth?.token?.email ||
    getAdminEmail()
  )
    .toString()
    .trim();
  if (!recipientEmail) {
    throw new HttpsError("invalid-argument", "Recipient email is required.");
  }

  const productTitle = truncateText(
    payload.productTitle || "Bethany Blooms Gift Card",
    160,
  );
  const productId = truncateText(payload.productId || "", 120) || null;
  const purchaserName = truncateText(
    payload.purchaserName || "Bethany Blooms Test Team",
    GIFT_CARD_MAX_NAME_LENGTH,
  );
  const recipientName = truncateText(
    payload.recipientName || purchaserName || "Gift Recipient",
    GIFT_CARD_MAX_NAME_LENGTH,
  );
  const message = truncateText(
    payload.message || "This is a test gift card preview generated from admin.",
    GIFT_CARD_MAX_MESSAGE_LENGTH,
  );
  const expiryDays = normalizeGiftCardExpiryDays(
    payload.expiryDays,
    GIFT_CARD_DEFAULT_EXPIRY_DAYS,
  );
  const terms = truncateText(
    payload.terms ||
      "Gift card is redeemable for Bethany Blooms services/products and is not exchangeable for cash.",
    GIFT_CARD_MAX_TERMS_LENGTH,
  );

  const requestedOptions = normalizeGiftCardSelectedOptions(payload.selectedOptions);
  let selectedOptions = requestedOptions;
  if (!selectedOptions.length) {
    const dynamicOptions = await getCutFlowerGiftCardOptions();
    const requestedOptionIds = Array.isArray(payload.optionIds)
      ? payload.optionIds
          .map((value) => (value || "").toString().trim())
          .filter(Boolean)
      : [];

    if (requestedOptionIds.length) {
      const dynamicMap = new Map(dynamicOptions.map((option) => [option.id, option]));
      selectedOptions = normalizeGiftCardSelectedOptions(
        requestedOptionIds.map((optionId) => {
          const option = dynamicMap.get(optionId);
          if (!option) return null;
          return {
            id: option.id,
            label: option.label,
            amount: option.amount,
            quantity: 1,
          };
        }),
      );
    } else {
      selectedOptions = normalizeGiftCardSelectedOptions(
        dynamicOptions.slice(0, Math.min(2, dynamicOptions.length)).map((option) => ({
          id: option.id,
          label: option.label,
          amount: option.amount,
          quantity: 1,
        })),
      );
    }
  }

  if (!selectedOptions.length) {
    selectedOptions = normalizeGiftCardSelectedOptions([
      {
        id: "test-standard",
        label: "Standard gift card option",
        amount: 250,
        quantity: 1,
      },
    ]);
  }

  const giftCardValue = Number(
    selectedOptions
      .reduce((sum, option) => {
        const lineTotal = Number(option?.lineTotal);
        if (Number.isFinite(lineTotal)) return sum + lineTotal;
        const amount = Number(option?.amount);
        const quantity = normalizeGiftCardOptionQuantity(option?.quantity, 1);
        return sum + (Number.isFinite(amount) ? amount * quantity : 0);
      }, 0)
      .toFixed(2),
  );

  if (!Number.isFinite(giftCardValue) || giftCardValue <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "Unable to build a valid test gift card value.",
    );
  }

  const giftCardId = `gc-test-${crypto.randomBytes(10).toString("hex")}`;
  const token = createGiftCardAccessToken(giftCardId);
  const issuedAtDate = new Date();
  const expiresAtDate = new Date(
    issuedAtDate.getTime() + expiryDays * 24 * 60 * 60 * 1000,
  );
  const code = buildGiftCardCode({
    orderNumber: `TEST${Date.now().toString().slice(-4)}`,
    giftCardId,
    lineIndex: 0,
    unitIndex: 0,
  });
  const pdfStoragePath = `gift-cards/test/${giftCardId}.pdf`;

  const giftCardRecord = {
    id: giftCardId,
    orderId: null,
    orderNumber: "TEST",
    orderItemIndex: 0,
    orderItemUnit: 0,
    code,
    status: "active",
    value: giftCardValue,
    currency: GIFT_CARD_VALUE_CURRENCY,
    purchaserName,
    recipientName,
    message: message || null,
    productId,
    productTitle,
    terms,
    selectedOptions,
    selectedOptionCount: selectedOptions.reduce(
      (sum, option) => sum + normalizeGiftCardOptionQuantity(option?.quantity, 1),
      0,
    ),
    expiryDays,
    issuedAt: admin.firestore.Timestamp.fromDate(issuedAtDate),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
    pdfStoragePath,
    isTest: true,
    testMeta: {
      createdByUid: request.auth?.uid || null,
      createdByEmail: (request.auth?.token?.email || "").toString().trim() || null,
      recipientEmail,
    },
    updatedAt: FIELD_VALUE.serverTimestamp(),
    createdAt: FIELD_VALUE.serverTimestamp(),
  };

  const pdfBytes = await createGiftCardPdfBytes({
    ...giftCardRecord,
    issuedAt: issuedAtDate,
    expiresAt: expiresAtDate,
  });
  const bucket = admin.storage().bucket();
  await bucket.file(pdfStoragePath).save(pdfBytes, {
    contentType: "application/pdf",
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0, no-store",
    },
  });

  await db.collection(GIFT_CARDS_COLLECTION).doc(giftCardId).set(giftCardRecord, {
    merge: true,
  });

  const issuedCard = {
    ...giftCardRecord,
    accessUrl: buildGiftCardAccessUrl(giftCardId, token),
    downloadUrl: buildGiftCardDownloadUrl(giftCardId, token),
    printUrl: buildGiftCardPrintViewUrl(giftCardId, token),
  };
  const orderId = `test-${giftCardId}`;
  const order = {
    orderNumber: `TEST-${Date.now().toString().slice(-6)}`,
    customer: {
      fullName: purchaserName,
      email: recipientEmail,
    },
  };
  const emailSubject = "Bethany Blooms - Test gift card preview";
  const emailHtml = buildGiftCardDeliveryCustomerEmailHtml({
    order,
    orderId,
    giftCards: [issuedCard],
  });

  let emailStatus = ORDER_NOTIFICATION_STATUSES.SKIPPED;
  let emailError = null;
  if (getResendClient()) {
    const sendResult = await sendEmail({
      to: recipientEmail,
      subject: emailSubject,
      html: emailHtml,
    });
    if (sendResult?.error) {
      emailStatus = ORDER_NOTIFICATION_STATUSES.FAILED;
      emailError = sendResult.error;
    } else {
      emailStatus = ORDER_NOTIFICATION_STATUSES.SENT;
    }
  } else {
    emailError = "Email service is not configured. Preview links were still generated.";
  }

  return {
    ok: true,
    recipientEmail,
    emailStatus,
    emailError,
    giftCard: buildGiftCardPublicPayload(giftCardRecord, giftCardId, token),
    preview: {
      subject: emailSubject,
      html: emailHtml,
    },
  };
});

exports.lookupGiftCardByCode = onCall(async (request) => {
  await assertAdminRequest(request);

  const payload = request.data || {};
  const code = normalizeGiftCardLookupCode(payload.code || "");
  if (!code) {
    throw new HttpsError("invalid-argument", "Gift card code is required.");
  }

  const snapshot = await db
    .collection(GIFT_CARDS_COLLECTION)
    .where("code", "==", code)
    .limit(1)
    .get();
  if (snapshot.empty) {
    throw new HttpsError("not-found", "Gift card not found.");
  }

  const giftCardSnap = snapshot.docs[0];
  const giftCard = giftCardSnap.data() || {};
  const status = (giftCard.status || "active").toString().trim().toLowerCase() || "active";
  const expiresAtDate = coerceTimestampToDate(giftCard.expiresAt);
  const isExpired = Boolean(expiresAtDate && expiresAtDate.getTime() < Date.now());
  const selectedOptions = normalizeGiftCardSelectedOptions(giftCard.selectedOptions);
  const selectedOptionCountValue = Number(giftCard.selectedOptionCount);
  const selectedOptionCount =
    Number.isFinite(selectedOptionCountValue) && selectedOptionCountValue >= 0
      ? Math.floor(selectedOptionCountValue)
      : selectedOptions.reduce(
          (sum, option) => sum + normalizeGiftCardOptionQuantity(option?.quantity, 1),
          0,
        );

  return {
    ok: true,
    giftCard: {
      id: giftCardSnap.id,
      code,
      status,
      isExpired,
      isActive: status === "active" && !isExpired,
      recipientName: (giftCard.recipientName || "").toString(),
      purchaserName: (giftCard.purchaserName || "").toString(),
      value: Number(giftCard.value || 0),
      currency: (giftCard.currency || GIFT_CARD_VALUE_CURRENCY).toString() || GIFT_CARD_VALUE_CURRENCY,
      expiresAt: toIsoString(giftCard.expiresAt),
      selectedOptionCount,
    },
  };
});

exports.syncUserClaims = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to sync your account.");
  }

  const uid = request.auth.uid;
  const authEmail = (request.auth.token?.email || "").toString().trim().toLowerCase();

  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError("failed-precondition", "User profile not found.");
  }

  const userData = userSnap.data() || {};
  const storedRole = (userData.role || "customer").toString().toLowerCase();
  const role = storedRole === "admin" ? "admin" : "customer";
  const storedUid = (userData.uid || "").toString().trim();
  if (storedUid !== uid) {
    await userRef.set(
      {
        uid,
        updatedAt: FIELD_VALUE.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await admin.auth().setCustomUserClaims(uid, { role });

  return {
    ok: true,
    role,
    email: userData.email || authEmail || null,
  };
});

exports.sendPosReceipt = onCall(async (request) => {
  if (!getResendClient()) {
    throw new HttpsError(
      "failed-precondition",
      "Email service is not configured.",
    );
  }
  await assertAdminRequest(request);

  const payload = request.data || {};
  const customer = payload.customer || {};
  const customerEmail = (customer.email || payload.email || "").toString().trim();
  if (!customerEmail) {
    throw new HttpsError("invalid-argument", "Customer email is required.");
  }

  const receiptId = payload.receiptId || "";
  const receiptLabel = payload.receiptNumber
    ? `Receipt #${payload.receiptNumber}`
    : `Receipt ${receiptId || "POS"}`;

  await sendEmail({
    to: customerEmail,
    subject: `Bethany Blooms - ${receiptLabel}`,
    html: buildPosReceiptHtml(payload, receiptId),
  });

  if (payload.includeAdminCopy) {
    await sendEmail({
      to: getAdminEmail(),
      subject: `POS sale - ${receiptLabel}`,
      html: buildPosReceiptAdminHtml(payload, receiptId),
    });
  }

  return { ok: true };
});

exports.onUserCreatedSendWelcomeEmail = onDocumentCreated("users/{uid}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const userId = (event.params.uid || snapshot.id || "").toString().trim();
  const userData = snapshot.data() || {};
  const userRef = snapshot.ref;
  const role = (userData.role || "customer").toString().trim().toLowerCase();
  const userEmail = trimToLength(userData.email || "", 160);
  const template = "account-welcome";

  const writeStatus = async ({
    status = ORDER_NOTIFICATION_STATUSES.SKIPPED,
    error = null,
    attempts = 0,
    sent = false,
  } = {}) => {
    await userRef.set(
      {
        notifications: {
          accountWelcome: {
            status,
            template,
            recipient: userEmail || null,
            attempts,
            attemptedAt: FIELD_VALUE.serverTimestamp(),
            sentAt: sent ? FIELD_VALUE.serverTimestamp() : null,
            error: error ? error.toString().slice(0, 500) : null,
            source: "users.onCreate",
          },
        },
      },
      { merge: true },
    );
  };

  if (role !== "customer") {
    await writeStatus({
      status: ORDER_NOTIFICATION_STATUSES.SKIPPED,
      error: "User role is not customer.",
    });
    return;
  }

  if (!userEmail) {
    await writeStatus({
      status: ORDER_NOTIFICATION_STATUSES.FAILED,
      error: "Customer email is missing.",
    });
    return;
  }

  if (!getResendClient()) {
    await writeStatus({
      status: ORDER_NOTIFICATION_STATUSES.FAILED,
      error: "Email service is not configured.",
    });
    return;
  }

  try {
    const fullName = trimToLength(
      userData.fullName ||
        userData.name ||
        userData.displayName ||
        userData.firstName ||
        "",
      120,
    );
    const sendResult = await sendEmailWithRetry({
      to: userEmail,
      subject: "Bethany Blooms - Welcome to your account",
      html: buildAccountWelcomeEmailHtml({
        fullName,
        accountUrl: `${getCanonicalSiteUrl()}/account`,
      }),
      retryCount: 1,
      retryDelayMs: 1200,
    });
    const finalError = sendResult?.finalResult?.error || null;
    await writeStatus({
      status: finalError
        ? ORDER_NOTIFICATION_STATUSES.FAILED
        : ORDER_NOTIFICATION_STATUSES.SENT,
      error: finalError,
      attempts: Number(sendResult?.attempts || 1),
      sent: !finalError,
    });
  } catch (error) {
    functions.logger.error("Account welcome email trigger failed", {
      userId,
      error: error?.message || error,
    });
    await writeStatus({
      status: ORDER_NOTIFICATION_STATUSES.FAILED,
      error: error?.message || "Unable to send account welcome email.",
      attempts: 1,
    });
  }
});

exports.onOrderCreated = onDocumentCreated("orders/{orderId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  let orderData = snapshot.data() || {};
  try {
    const invoiceResult = await ensureOrderInvoiceDocument({
      orderRef: snapshot.ref,
      orderId: event.params.orderId,
      orderData,
    });
    orderData = invoiceResult?.order || orderData;
  } catch (error) {
    functions.logger.error("Order invoice generation failed on create trigger", {
      orderId: event.params.orderId,
      error: error?.message || error,
    });
  }

  await dispatchOrderCreatedNotifications({
    orderRef: snapshot.ref,
    orderId: event.params.orderId,
    source: "trigger",
    sendAdmin: true,
    retryCustomer: true,
    skipIfCustomerAlreadyAttempted: false,
  });
  const refreshedSnap = await snapshot.ref.get();
  if (refreshedSnap.exists) {
    orderData = refreshedSnap.data() || orderData;
  }
  await issueGiftCardsForOrder({
    orderRef: snapshot.ref,
    orderId: event.params.orderId,
    orderData,
    reason: "order-created-trigger",
  });
});
