const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

functions.setGlobalOptions({ maxInstances: 10 });

const payfastConfig = {
  merchantId: process.env.PAYFAST_MERCHANT_ID,
  merchantKey: process.env.PAYFAST_MERCHANT_KEY,
  passphrase: process.env.PAYFAST_PASSPHRASE || "",
  returnUrl:
    process.env.PAYFAST_RETURN_URL ||
    `${process.env.SITE_URL || ""}/payment/success`,
  cancelUrl:
    process.env.PAYFAST_CANCEL_URL ||
    `${process.env.SITE_URL || ""}/payment/cancel`,
  notifyUrl: process.env.PAYFAST_NOTIFY_URL || "",
  mode: (process.env.PAYFAST_MODE || "sandbox").toLowerCase(),
};

const payfastHosts = {
  live: "www.payfast.co.za",
  sandbox: "sandbox.payfast.co.za",
};

const PENDING_COLLECTION = "pendingPayfastOrders";

const FIELD_VALUE = admin.firestore.FieldValue;

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
    .join(" · ")
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

function ensurePayfastConfig() {
  const missing = [];
  if (!payfastConfig.merchantId) missing.push("PAYFAST_MERCHANT_ID");
  if (!payfastConfig.merchantKey) missing.push("PAYFAST_MERCHANT_KEY");
  if (!payfastConfig.notifyUrl) missing.push("PAYFAST_NOTIFY_URL");
  if (missing.length) {
    throw new functions.https.HttpsError(
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

async function validateWithPayfast(rawBody) {
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

exports.createUserWithRole = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Only authenticated admins can create users.");
  }

  const tokenRole = context.auth.token?.role;
  const callerEmail = (context.auth.token?.email || "").toLowerCase();
  const callerUid = context.auth.uid;

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
    throw new functions.https.HttpsError("permission-denied", "Admin role required.");
  }


  const email = (data?.email || "").toString().trim();
  const password = (data?.password || "").toString();
  const role = (data?.role || "customer").toString().trim() || "customer";

  if (!email || !password) {
    throw new functions.https.HttpsError("invalid-argument", "Email and password are required.");
  }
  if (password.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "Password must be at least 6 characters.");
  }
  if (!["admin", "customer"].includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Role must be admin or customer.");
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
  ensurePayfastConfig();

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

  const requiredFields = ["fullName", "email", "phone", "address"];
  const missing = requiredFields.filter((field) => !customer[field]);
  if (missing.length) {
    throw new Error(`Missing customer information: ${missing.join(", ")}.`);
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) {
    throw new Error("Order items are required.");
  }

  const totalPrice = Number(data?.totalPrice ?? 0);
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    throw new Error("Order total must be greater than zero.");
  }

  const pendingRef = db.collection(PENDING_COLLECTION).doc();
  await pendingRef.set({
    customer,
    items,
    totalPrice,
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
    .join(" · ")
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

exports.createPayfastPayment = functions.https.onCall(() => {
  throw new functions.https.HttpsError(
    "failed-precondition",
    "Use the HTTP endpoint createPayfastPaymentHttp instead.",
  );
});

exports.createPayfastPaymentHttp = functions.https.onRequest((req, res) => {
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

exports.payfastItn = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  ensurePayfastConfig();

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
  const validatedWithGateway = rawBody && (await validateWithPayfast(rawBody));
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
