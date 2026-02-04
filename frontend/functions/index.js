require("dotenv").config();
const functions = require("firebase-functions");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const crypto = require("crypto");
const cors = require("cors")({ origin: true });
const { Resend } = require("resend");
const { defineString } = require("firebase-functions/params");

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
const PAYFAST_MODE = defineString("PAYFAST_MODE", { default: "sandbox" });

setGlobalOptions({
  maxInstances: 10,
});
let resendClient = null;

const payfastHosts = {
  live: "www.payfast.co.za",
  sandbox: "sandbox.payfast.co.za",
};

const PENDING_COLLECTION = "pendingPayfastOrders";
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

function getPayfastConfig() {
  const siteUrl = getSiteUrl();
  return {
    merchantId:
      process.env.PAYFAST_MERCHANT_ID ||
      safeParamValue(PAYFAST_MERCHANT_ID, ""),
    merchantKey:
      process.env.PAYFAST_MERCHANT_KEY ||
      safeParamValue(PAYFAST_MERCHANT_KEY, ""),
    passphrase:
      process.env.PAYFAST_PASSPHRASE ||
      safeParamValue(PAYFAST_PASSPHRASE, ""),
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
    mode: (
      process.env.PAYFAST_MODE ||
      safeParamValue(PAYFAST_MODE, "sandbox") ||
      "sandbox"
    ).toLowerCase(),
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

async function sendEmail({ to, subject, html }) {
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

function buildOrderEmailHtml(order = {}, orderId = "") {
  const customerName = escapeHtml(order.customer?.fullName || "there");
  const orderNumber = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const itemsHtml = buildOrderItemsHtml(order.items || []);
  const preorderNoticeHtml = buildPreorderNoticeHtml(order.items || []);
  const total = formatCurrency(order.totalPrice || 0);
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 16px;">Thank you for your order with Bethany Blooms. We are preparing your items now.</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderNumber)}</strong>
    </div>
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
  const total = formatCurrency(order.totalPrice || 0);
  const body = `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderNumber)}</strong>
    </div>
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

async function sendEmailWithRetry({ to, subject, html, retryCount = 1, retryDelayMs = 1200 } = {}) {
  let attempts = 1;
  const firstResult = await sendEmail({ to, subject, html });
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
    finalResult = await sendEmail({ to, subject, html });
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
  const order = latestSnap.data() || {};
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
  const proofLine = order.paymentProof?.fileName
    ? `<p style="margin:0 0 12px;"><strong>Proof uploaded:</strong> ${escapeHtml(order.paymentProof.fileName)}</p>`
    : "";
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 12px;">We have received your EFT order and it is awaiting payment approval.</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderLabel)}</strong>
    </div>
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
  const proofMarkup = proofPath
    ? `<p style="margin:0 0 6px;"><strong>Proof path:</strong> ${escapeHtml(proofPath)}</p>`
    : "<p style=\"margin:0 0 6px;\"><strong>Proof path:</strong> Not provided</p>";
  const body = `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderLabel)}</strong>
    </div>
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
  const noteMarkup = note
    ? `<p style="margin:0 0 16px;"><strong>Admin note:</strong> ${escapeHtml(note)}</p>`
    : "";
  const eftInfoHtml = buildCustomerEftInfoHtml(order);
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderLabel)}</strong>
    </div>
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
  const noteMarkup = note
    ? `<p style="margin:0 0 8px;"><strong>Note:</strong> ${escapeHtml(note)}</p>`
    : "";
  const body = `
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(orderLabel)}</strong>
    </div>
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
  const body = `
    <p style="margin:0 0 16px;">Hi ${customerName},</p>
    <p style="margin:0 0 16px;">Thank you for shopping with Bethany Blooms. Here is your receipt.</p>
    <div style="padding:12px 16px;border-radius:14px;background:rgba(245,234,215,0.6);margin-bottom:16px;">
      <strong>${escapeHtml(receiptNumber)}</strong>
    </div>
    ${itemsHtml}
    ${discountLine}
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
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const current = snapshot.exists ? Number(snapshot.data().value) : 999;
    const safeValue = Number.isFinite(current) ? current : 999;
    const nextValue = safeValue + 1;
    transaction.set(counterRef, { value: nextValue }, { merge: true });
    return nextValue;
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

function ensurePayfastConfig(payfastConfig) {
  const missing = [];
  if (!payfastConfig.merchantId) missing.push("PAYFAST_MERCHANT_ID");
  if (!payfastConfig.merchantKey) missing.push("PAYFAST_MERCHANT_KEY");
  if (!payfastConfig.notifyUrl) missing.push("PAYFAST_NOTIFY_URL");
  if (missing.length) {
    throw new HttpsError(
      "failed-precondition",
      `Missing PayFast configuration: ${missing.join(", ")}.`,
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
  if (!customer.address) {
    throw new Error("Missing customer address details.");
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) {
    throw new Error("Order items are required.");
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
  const shippingCost = Number.isFinite(shippingCostRaw) && shippingCostRaw >= 0 ? shippingCostRaw : 0;
  const subtotalInput = Number(data?.subtotal ?? computedSubtotal);
  const subtotal = Number.isFinite(subtotalInput) ? subtotalInput : computedSubtotal;
  const shipping = data?.shipping
    ? {
        courierId: (data.shipping.courierId || "").toString().trim() || null,
        courierName: (data.shipping.courierName || "").toString().trim() || null,
        courierPrice: shippingCost,
        province: (data.shipping.province || shippingAddress.province || "").toString().trim() || null,
      }
    : null;

  return {
    data,
    customer,
    items,
    totalPrice,
    subtotal: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null,
    shippingCost,
    shipping: shipping || null,
    shippingAddress: hasStructuredAddress ? shippingAddress : null,
    paymentProof: validatePaymentProofMetadata(data?.paymentProof),
  };
}

function toCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

function encodeValue(value) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function createSignature(params, passphrase) {
  const parts = [];
  for (const [key, val] of Object.entries(params)) {
    if (key === "signature" || val === undefined || val === null || val === "") {
      continue;
    }
    parts.push(`${key}=${encodeValue(val)}`);
  }

  if (passphrase) {
    parts.push(`passphrase=${encodeValue(passphrase)}`);
  }

  const queryString = parts.join("&");
  return crypto.createHash("md5").update(queryString).digest("hex");
}

function parsePayfastBody(req) {
  if (req.rawBody && typeof req.rawBody.toString === "function") {
    const raw = req.rawBody.toString("utf8");
    const params = new URLSearchParams(raw);
    const result = {};
    for (const [key, value] of params.entries()) {
      result[key] = value;
    }
    return result;
  }
  return req.body || {};
}

async function validateWithPayfast(rawBody, payfastConfig) {
  const modeKey = payfastConfig.mode === "live" ? "live" : "sandbox";
  const host = payfastHosts[modeKey];
  const url = `https://${host}/eng/query/validate`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: rawBody,
    });
    const text = await response.text();
    return text.trim().toLowerCase() === "valid";
  } catch (error) {
    functions.logger.warn("PayFast validation call failed", error);
    return false;
  }
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
      email,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { uid: userRecord.uid, role };
});

async function buildPayfastPaymentPayload(dataInput = {}) {
  const payfastConfig = getPayfastConfig();
  ensurePayfastConfig(payfastConfig);

  const normalizedPayload = validateOrderPayload(dataInput);
  const {
    data,
    customer,
    items,
    totalPrice,
    subtotal,
    shippingCost,
    shipping,
    shippingAddress,
  } = normalizedPayload;
  functions.logger.debug("createPayfastPayment called", { data });

  const pendingRef = db.collection(PENDING_COLLECTION).doc();
  await pendingRef.set({
    customer,
    items,
    totalPrice,
    subtotal,
    shippingCost,
    shipping: shipping || null,
    shippingAddress,
    paymentMethod: "payfast",
    status: "pending",
    createdAt: FIELD_VALUE.serverTimestamp(),
  });

  const modeKey = payfastConfig.mode === "live" ? "live" : "sandbox";
  const host = payfastHosts[modeKey];
  const payfastUrl = `https://${host}/eng/process`;

  const paymentReference = pendingRef.id;
  const fullName = customer.fullName.trim();
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const nameFirst = nameParts[0] || fullName;
  const nameLast = nameParts.slice(1).join(" ");
  const itemSummary = items
    .map((item) => `${item.quantity} x ${item.name}`)
    .join(" - ")
    .slice(0, 255);
  const description = itemSummary || "Bethany Blooms Order";

  const fields = {};
  const appendField = (name, value) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    fields[name] = value;
  };

  appendField("merchant_id", payfastConfig.merchantId);
  appendField("merchant_key", payfastConfig.merchantKey);
  appendField("return_url", data?.returnUrl || payfastConfig.returnUrl);
  appendField("cancel_url", data?.cancelUrl || payfastConfig.cancelUrl);
  appendField("notify_url", payfastConfig.notifyUrl);
  appendField("name_first", nameFirst);
  appendField("name_last", nameLast);
  appendField("email_address", customer.email);
  appendField("cell_number", customer.phone);
  appendField("m_payment_id", paymentReference);
  appendField("amount", toCurrency(totalPrice));
  appendField("item_name", items[0]?.name || "Bethany Blooms Order");
  appendField("item_description", description);
  appendField("custom_str1", paymentReference);
  appendField("custom_str2", itemSummary);
  appendField("email_confirmation", 1);
  appendField("confirmation_address", customer.email);

  const signature = createSignature(fields, payfastConfig.passphrase);
  const payload = { ...fields, signature };

  await pendingRef.set(
    {
      paymentReference,
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

  return { url: payfastUrl, fields: payload };
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
        customer,
        items,
        subtotal,
        shippingCost,
        shipping,
        shippingAddress,
        totalPrice,
      } = normalizedPayload;

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

      await orderRef.set({
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
        trackingLink: null,
        createdAt: FIELD_VALUE.serverTimestamp(),
        updatedAt: FIELD_VALUE.serverTimestamp(),
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

exports.payfastItn = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const payfastConfig = getPayfastConfig();
  ensurePayfastConfig(payfastConfig);

  const params = parsePayfastBody(req);
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";

  const orderId = params.m_payment_id || params.custom_str1;
  const paymentStatus = (params.payment_status || "").toString().toUpperCase();
  const amountPaid = toCurrency(params.amount || params.amount_gross || 0);

  const signatureValid =
    params.signature &&
    params.signature === createSignature(params, payfastConfig.passphrase);

  if (!orderId) {
    functions.logger.warn("PayFast ITN missing order reference", params);
    res.status(400).send("Missing order reference");
    return;
  }

  const pendingRef = db.collection(PENDING_COLLECTION).doc(orderId);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) {
    functions.logger.warn("PayFast ITN for unknown pending order", { orderId, params });
    res.status(404).send("Pending order not found");
    return;
  }

  const pending = pendingSnap.data() || {};
  const expectedAmount = toCurrency(pending.totalPrice || 0);
  const amountMatches = expectedAmount === amountPaid;
  const validatedWithGateway = rawBody && (await validateWithPayfast(rawBody, payfastConfig));
  const paymentComplete = paymentStatus === "COMPLETE";

  const payfastDetails = {
    paymentReference: params.m_payment_id || null,
    paymentId: params.pf_payment_id || null,
    paymentStatus,
    gatewayResponse: params.payment_status || null,
    validatedWithGateway,
    signatureValid,
    amount: Number(amountPaid),
    merchantId: params.merchant_id || null,
    mode: payfastConfig.mode === "live" ? "live" : "sandbox",
    amountMatches,
    raw: params,
    updatedAt: FIELD_VALUE.serverTimestamp(),
  };

  let orderRef = null;
  let orderCreated = false;

  if (paymentComplete && pending.status !== "completed") {
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
      trackingLink: null,
      createdAt: pending.createdAt || FIELD_VALUE.serverTimestamp(),
      updatedAt: FIELD_VALUE.serverTimestamp(),
      payfast: payfastDetails,
    };
    const newOrderRef = db.collection("orders").doc();
    await newOrderRef.set(orderPayload);
    await createBookingsForOrder(pending.items || [], pending.customer || {}, newOrderRef.id);
    await pendingRef.set(
      {
        status: "completed",
        orderId: newOrderRef.id,
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
      paymentStatus: paymentComplete ? "paid" : "pending",
      paymentMethod: "payfast",
      paymentApprovalStatus: "not-required",
      paymentApproval: {
        required: false,
        decision: "not-required",
        decidedAt: null,
        decidedByUid: null,
        decidedByEmail: null,
        note: null,
      },
      status: paymentComplete ? "order-placed" : "pending",
    };
    if (paymentComplete) {
      orderUpdate.paidAt = FIELD_VALUE.serverTimestamp();
    }
    await orderRef.set(orderUpdate, { merge: true });
  }

  await pendingRef.set(
    {
      lastPaymentStatus: paymentStatus,
      amountPaid: Number(amountPaid),
      signatureValid,
      validatedWithGateway,
      updatedAt: FIELD_VALUE.serverTimestamp(),
    },
    { merge: true },
  );

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
    await createBookingsForOrder(order.items || [], order.customer || {}, orderId);
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

exports.createAdminEftOrder = onCall(async (request) => {
  await assertAdminRequest(request);
  const payload = request.data || {};
  const normalizedPayload = validateOrderPayload(payload);
  const {
    customer,
    items,
    subtotal,
    shippingCost,
    shipping,
    shippingAddress,
    totalPrice,
  } = normalizedPayload;

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

  await orderRef.set({
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
    trackingLink: null,
    createdByAdmin: {
      uid: adminUid,
      email: adminEmail,
      createdAt: FIELD_VALUE.serverTimestamp(),
    },
    createdAt: FIELD_VALUE.serverTimestamp(),
    updatedAt: FIELD_VALUE.serverTimestamp(),
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

exports.onOrderCreated = onDocumentCreated("orders/{orderId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  await dispatchOrderCreatedNotifications({
    orderRef: snapshot.ref,
    orderId: event.params.orderId,
    source: "trigger",
    sendAdmin: true,
    retryCustomer: true,
    skipIfCustomerAlreadyAttempted: false,
  });
});
