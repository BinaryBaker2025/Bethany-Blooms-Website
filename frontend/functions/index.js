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
const RESEND_PREVIEW_TO = defineString("RESEND_PREVIEW_TO", { default: "" });
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

function getPreviewEmail() {
  return process.env.RESEND_PREVIEW_TO || safeParamValue(RESEND_PREVIEW_TO, "");
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

function buildOrderItemsHtml(items = []) {
  if (!items.length) return "<p>No items.</p>";
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
      const metaLine = metaParts.length ? `<br /><span>${metaParts.join(" - ")}</span>` : "";
      return `<li><strong>${name}</strong> x${quantity}${priceLabel}${metaLine}</li>`;
    })
    .join("");
  return `<ul>${rows}</ul>`;
}

function buildOrderEmailHtml(order = {}, orderId = "") {
  const customerName = escapeHtml(order.customer?.fullName || "there");
  const orderNumber = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const itemsHtml = buildOrderItemsHtml(order.items || []);
  const total = formatCurrency(order.totalPrice || 0);
  const siteUrl = getSiteUrl();
  return `
    <p>Hi ${customerName},</p>
    <p>Thank you for your order with Bethany Blooms. We are preparing your items now.</p>
    <p><strong>${escapeHtml(orderNumber)}</strong></p>
    ${itemsHtml}
    <p><strong>Total:</strong> ${total}</p>
    <p>If you have any questions, reply to this email or contact us via ${escapeHtml(siteUrl || "our website")}.</p>
  `;
}

function buildOrderAdminEmailHtml(order = {}, orderId = "") {
  const customer = order.customer || {};
  const orderNumber = order.orderNumber ? `Order #${order.orderNumber}` : `Order ${orderId}`;
  const itemsHtml = buildOrderItemsHtml(order.items || []);
  const total = formatCurrency(order.totalPrice || 0);
  return `
    <p><strong>${escapeHtml(orderNumber)}</strong></p>
    <p><strong>Customer:</strong> ${escapeHtml(customer.fullName || "Guest")}</p>
    <p><strong>Email:</strong> ${escapeHtml(customer.email || "Not provided")}</p>
    <p><strong>Phone:</strong> ${escapeHtml(customer.phone || "Not provided")}</p>
    <p><strong>Address:</strong> ${escapeHtml(customer.address || "Not provided")}</p>
    ${itemsHtml}
    <p><strong>Total:</strong> ${total}</p>
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
  return `
    <p>Hi ${customerName},</p>
    <p>Thank you for shopping with Bethany Blooms. Here is your receipt.</p>
    <p><strong>${escapeHtml(receiptNumber)}</strong></p>
    ${itemsHtml}
    ${discountLine}
    <p><strong>Total:</strong> ${total}</p>
    <p><strong>Payment:</strong> ${paymentMethod}</p>
    ${cashLine}
  `;
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
  return `
    <p><strong>${escapeHtml(receiptNumber)}</strong></p>
    <p><strong>Customer:</strong> ${escapeHtml(customer.name || customer.fullName || "Walk-in")}</p>
    <p><strong>Email:</strong> ${escapeHtml(customer.email || "Not provided")}</p>
    <p><strong>Phone:</strong> ${escapeHtml(customer.phone || "Not provided")}</p>
    <p><strong>Payment:</strong> ${paymentMethod}</p>
    ${itemsHtml}
    ${discountLine}
    <p><strong>Total:</strong> ${total}</p>
    ${cashLine}
  `;
}

function buildContactEmailHtml(data = {}) {
  const name = escapeHtml(data.name || "Guest");
  const email = escapeHtml(data.email || "Not provided");
  const phone = escapeHtml(data.phone || "Not provided");
  const topic = escapeHtml(data.topic || "General enquiry");
  const timeline = escapeHtml(data.timeline || "Not provided");
  const message = escapeHtml(data.message || "");
  return `
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone:</strong> ${phone}</p>
    <p><strong>Topic:</strong> ${topic}</p>
    <p><strong>Timeline:</strong> ${timeline}</p>
    <p><strong>Message:</strong><br />${message.replace(/\n/g, "<br />")}</p>
  `;
}

function buildContactConfirmationHtml(data = {}) {
  const name = escapeHtml(data.name || "there");
  return `
    <p>Hi ${name},</p>
    <p>Thank you for contacting Bethany Blooms. We have received your message and will respond within two business days.</p>
    <p>If your enquiry is urgent, please reply to this email.</p>
  `;
}

function buildCutFlowerBookingHtml(booking = {}) {
  return `
    <p><strong>Customer:</strong> ${escapeHtml(booking.customerName || booking.fullName || "Guest")}</p>
    <p><strong>Email:</strong> ${escapeHtml(booking.email || "Not provided")}</p>
    <p><strong>Phone:</strong> ${escapeHtml(booking.phone || "Not provided")}</p>
    <p><strong>Occasion:</strong> ${escapeHtml(booking.occasion || "Cut flower booking")}</p>
    <p><strong>Location:</strong> ${escapeHtml(booking.location || "Not provided")}</p>
    <p><strong>Date:</strong> ${escapeHtml(booking.eventDate || "TBC")}</p>
    <p><strong>Session:</strong> ${escapeHtml(booking.sessionLabel || "TBC")}</p>
    <p><strong>Attendees:</strong> ${escapeHtml(booking.attendeeCount || "1")}</p>
    <p><strong>Option:</strong> ${escapeHtml(booking.optionLabel || "Standard")}</p>
    <p><strong>Notes:</strong> ${escapeHtml(booking.notes || "None")}</p>
  `;
}

function buildCutFlowerCustomerHtml(booking = {}) {
  const name = escapeHtml(booking.customerName || booking.fullName || "there");
  return `
    <p>Hi ${name},</p>
    <p>Thanks for your booking request with Bethany Blooms. Here are the details we received:</p>
    ${buildCutFlowerBookingHtml(booking)}
    <p>We will be in touch shortly to confirm availability and next steps.</p>
  `;
}

function buildWorkshopBookingHtml(booking = {}) {
  return `
    <p><strong>Customer:</strong> ${escapeHtml(booking.fullName || "Guest")}</p>
    <p><strong>Email:</strong> ${escapeHtml(booking.email || "Not provided")}</p>
    <p><strong>Phone:</strong> ${escapeHtml(booking.phone || "Not provided")}</p>
    <p><strong>Workshop:</strong> ${escapeHtml(booking.workshopTitle || "Workshop")}</p>
    <p><strong>Session:</strong> ${escapeHtml(booking.sessionLabel || "TBC")}</p>
    <p><strong>Date:</strong> ${escapeHtml(booking.sessionDateLabel || booking.sessionDate || "TBC")}</p>
    <p><strong>Attendees:</strong> ${escapeHtml(booking.attendeeCount || "1")}</p>
    <p><strong>Notes:</strong> ${escapeHtml(booking.notes || "None")}</p>
  `;
}

function buildWorkshopCustomerHtml(booking = {}) {
  const name = escapeHtml(booking.fullName || "there");
  return `
    <p>Hi ${name},</p>
    <p>Thanks for your workshop booking with Bethany Blooms. Here are the details we received:</p>
    ${buildWorkshopBookingHtml(booking)}
    <p>We will be in touch shortly to confirm availability and next steps.</p>
  `;
}

function isAdminContext(auth) {
  return (auth?.token?.role || "").toString().toLowerCase() === "admin";
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
  const bookings = items
    .filter((item) => item.metadata?.type === "workshop")
    .map((item) => buildBookingData(item, customer, orderId));

  if (!bookings.length) return;

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

  const data = dataInput ?? {};
  functions.logger.debug("createPayfastPayment called", { data });

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

  const shippingCost = Number(data?.shippingCost ?? data?.shipping?.courierPrice ?? 0);
  const subtotalInput = Number(data?.subtotal ?? computedSubtotal);
  const subtotal = Number.isFinite(subtotalInput) ? subtotalInput : computedSubtotal;
  const shipping = data?.shipping
    ? {
        courierId: (data.shipping.courierId || "").toString().trim() || null,
        courierName: (data.shipping.courierName || "").toString().trim() || null,
        courierPrice: Number.isFinite(shippingCost) ? shippingCost : 0,
        province: (data.shipping.province || shippingAddress.province || "").toString().trim() || null,
      }
    : null;

  const pendingRef = db.collection(PENDING_COLLECTION).doc();
  await pendingRef.set({
    customer,
    items,
    totalPrice,
    subtotal: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : null,
    shippingCost: Number.isFinite(shippingCost) ? shippingCost : 0,
    shipping: shipping || null,
    shippingAddress: hasStructuredAddress ? shippingAddress : null,
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
    const orderPayload = {
      customer: pending.customer,
      items: pending.items,
      subtotal: pending.subtotal ?? null,
      shippingCost: pending.shippingCost ?? 0,
      shipping: pending.shipping ?? null,
      shippingAddress: pending.shippingAddress ?? null,
      totalPrice: pending.totalPrice,
      status: "processing",
      paymentStatus: "paid",
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
      status: paymentComplete ? "processing" : "pending",
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
  if (!isAdminContext(request.auth)) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const payload = request.data || {};
  const customer = payload.customer || {};
  const customerEmail = (customer.email || "").toString().trim();
  if (!customerEmail) {
    throw new HttpsError("invalid-argument", "Customer email is required.");
  }

  const status = (payload.status || "updated").toString();
  const orderNumber = payload.orderNumber ? `Order #${payload.orderNumber}` : "Your order";
  const trackingLink = (payload.trackingLink || "").toString().trim();

  const html = `
    <p>Hi ${escapeHtml(customer.fullName || "there")},</p>
    <p>Your order status has been updated to <strong>${escapeHtml(status)}</strong>.</p>
    <p><strong>${escapeHtml(orderNumber)}</strong></p>
    ${trackingLink ? `<p>Tracking link: <a href="${escapeHtml(trackingLink)}">${escapeHtml(trackingLink)}</a></p>` : ""}
    <p>If you have any questions, reply to this email and we will help.</p>
  `;

  await sendEmail({
    to: customerEmail,
    subject: `Bethany Blooms - ${orderNumber} update`,
    html,
  });

  return { ok: true };
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
    adminHtml = buildCutFlowerBookingHtml(payload);
    customerHtml = buildCutFlowerCustomerHtml(payload);
    subjectBase = "Cut flower booking";
  } else {
    adminHtml = buildWorkshopBookingHtml(payload);
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

exports.sendPosReceipt = onCall(async (request) => {
  if (!getResendClient()) {
    throw new HttpsError(
      "failed-precondition",
      "Email service is not configured.",
    );
  }
  if (!isAdminContext(request.auth)) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

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
  const order = snapshot?.data() || {};
  const orderId = event.params.orderId;
    const customerEmail = (order.customer?.email || "").toString().trim();

    const adminHtml = buildOrderAdminEmailHtml(order, orderId);
    const adminSubject = `New order received - ${order.orderNumber || orderId}`;
    await sendEmail({
      to: getAdminEmail(),
      subject: adminSubject,
      html: adminHtml,
    });

    if (customerEmail) {
      const customerHtml = buildOrderEmailHtml(order, orderId);
      const customerSubject = `Bethany Blooms - Order ${order.orderNumber || orderId}`;
      await sendEmail({
        to: customerEmail,
        subject: customerSubject,
        html: customerHtml,
      });
    }
});
