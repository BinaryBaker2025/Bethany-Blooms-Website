const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Replace non-ASCII / non-printable chars with ASCII equivalents
function encodeText(str) {
  return String(str)
    .replace(/[\u202f\u00a0]/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00d7/g, "x")
    .replace(/[^\x20-\x7e]/g, "?");
}

export class EscPos {
  constructor() {
    this._buf = [];
  }

  _push(...bytes) {
    this._buf.push(...bytes);
    return this;
  }

  init() {
    return this._push(ESC, 0x40);
  }

  align(a) {
    const n = a === "center" ? 1 : a === "right" ? 2 : 0;
    return this._push(ESC, 0x61, n);
  }

  bold(on = true) {
    return this._push(ESC, 0x45, on ? 1 : 0);
  }

  // width/height: 1 = normal, 2 = double
  size(w = 1, h = 1) {
    return this._push(GS, 0x21, ((w - 1) << 4) | (h - 1));
  }

  text(str) {
    const encoded = encodeText(str);
    for (let i = 0; i < encoded.length; i++) {
      this._buf.push(encoded.charCodeAt(i));
    }
    return this;
  }

  lf() {
    return this._push(LF);
  }

  line(str = "") {
    return this.text(str).lf();
  }

  feed(n = 1) {
    return this._push(ESC, 0x64, n);
  }

  // Two-column row: left text, right text, padded to `width` chars total
  row(left, right, width) {
    const l = encodeText(left);
    const r = encodeText(right);
    const spaces = Math.max(1, width - l.length - r.length);
    return this.line(l + " ".repeat(spaces) + r);
  }

  divider(width, char = "-") {
    return this.line(char.repeat(width));
  }

  partialCut() {
    return this._push(GS, 0x56, 0x01);
  }

  bytes() {
    return new Uint8Array(this._buf);
  }
}

const LINE_WIDTH = 48; // standard 80mm paper, normal font

export function buildReceiptCommands(receiptData, formatCurrency) {
  const W = LINE_WIDTH;
  const cmd = new EscPos().init();

  // ── Shop header ──────────────────────────────────────────────────────────
  cmd
    .align("center")
    .bold(true).size(1, 2).line("BETHANY BLOOMS")
    .size(1, 1).bold(false)
    .line("bethanyblooms.co.za")
    .lf()
    .divider(W);

  // ── Receipt meta ─────────────────────────────────────────────────────────
  cmd
    .align("left").lf()
    .row("Receipt:", receiptData.receiptNumber, W)
    .row("Date:", receiptData.createdAt.toLocaleString("en-ZA"), W)
    .lf()
    .divider(W);

  // ── Customer + payment ───────────────────────────────────────────────────
  cmd
    .lf()
    .row("Customer:", receiptData.customer.name || "Walk-in", W);

  if (receiptData.customer.email) {
    cmd.row("Email:", receiptData.customer.email, W);
  }
  if (receiptData.customer.phone) {
    cmd.row("Phone:", receiptData.customer.phone, W);
  }

  const payLabel =
    receiptData.paymentMethod.charAt(0).toUpperCase() +
    receiptData.paymentMethod.slice(1);
  cmd.row("Payment:", payLabel, W).lf().divider(W);

  // ── Line items ───────────────────────────────────────────────────────────
  cmd.lf().bold(true).line("ITEMS").bold(false);

  for (const item of receiptData.items) {
    const lineTotal = formatCurrency(item.price * item.quantity);
    const maxNameLen = W - lineTotal.length - 1;
    const name = encodeText(item.name).slice(0, maxNameLen);
    cmd.row(name, lineTotal, W);

    const detail = `  ${item.quantity} x ${formatCurrency(item.price)}`;
    const sub =
      item.metadata?.variantLabel
        ? `${detail}  (${item.metadata.variantLabel})`
        : item.metadata?.sessionLabel
          ? `${detail}  (${item.metadata.sessionLabel})`
          : detail;
    cmd.line(sub);
  }

  cmd.lf().divider(W);

  // ── Totals ───────────────────────────────────────────────────────────────
  if (receiptData.subtotal !== receiptData.total) {
    cmd.row("Subtotal:", formatCurrency(receiptData.subtotal), W);
  }
  if (receiptData.discount?.amount > 0) {
    cmd.row("Discount:", "-" + formatCurrency(receiptData.discount.amount), W);
  }
  if (Number(receiptData.giftCardApplied || 0) > 0) {
    cmd.row("Gift card:", "-" + formatCurrency(receiptData.giftCardApplied), W);
  }

  cmd
    .divider(W, "=")
    .bold(true).size(1, 2)
    .row("TOTAL:", formatCurrency(receiptData.total), W)
    .size(1, 1).bold(false)
    .lf();

  if (receiptData.paymentMethod === "cash" && receiptData.cashReceived != null) {
    cmd
      .row("Cash received:", formatCurrency(receiptData.cashReceived), W)
      .bold(true)
      .row("Change due:", formatCurrency(receiptData.changeDue || 0), W)
      .bold(false)
      .lf();
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  cmd
    .divider(W)
    .align("center").lf()
    .line("Thank you for shopping at")
    .bold(true).line("Bethany Blooms!").bold(false)
    .lf()
    .lf()
    .lf()
    .feed(6);

  return cmd;
}

// ── Pre-payment bill (show customer totals before checkout) ───────────────
export function buildBillCommands(cartItems, subtotal, tableLabel, formatCurrency) {
  const W = LINE_WIDTH;
  const cmd = new EscPos().init();

  // ── Header ───────────────────────────────────────────────────────────────
  cmd
    .align("center")
    .bold(true).size(1, 2).line("BETHANY BLOOMS")
    .size(1, 1).bold(false)
    .line("bethanyblooms.co.za")
    .lf()
    .divider(W);

  // ── Bill label + table ───────────────────────────────────────────────────
  cmd
    .align("center").lf()
    .bold(true).size(1, 2).line("BILL").size(1, 1).bold(false);

  if (tableLabel) {
    cmd.line(tableLabel);
  }

  cmd
    .line(new Date().toLocaleString("en-ZA"))
    .lf()
    .divider(W);

  // ── Line items ───────────────────────────────────────────────────────────
  cmd.align("left").lf().bold(true).line("ITEMS").bold(false);

  for (const item of cartItems) {
    const lineTotal = formatCurrency((item.price || 0) * (item.quantity || 1));
    const maxNameLen = W - lineTotal.length - 1;
    const name = encodeText(item.name || "Item").slice(0, maxNameLen);
    cmd.row(name, lineTotal, W);

    const detail = `  ${item.quantity} x ${formatCurrency(item.price || 0)}`;
    const sub =
      item.metadata?.variantLabel
        ? `${detail}  (${item.metadata.variantLabel})`
        : item.metadata?.sessionLabel
          ? `${detail}  (${item.metadata.sessionLabel})`
          : detail;
    cmd.line(sub);
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  cmd
    .lf()
    .divider(W, "=")
    .bold(true).size(1, 2)
    .row("TOTAL:", formatCurrency(subtotal), W)
    .size(1, 1).bold(false)
    .lf()
    .divider(W)
    .align("center").lf()
    .line("Printed receipt of order")
    .lf()
    .lf()
    .lf()
    .feed(6);

  return cmd;
}

// ── Browser-print fallback: returns an HTML string for a new print window ──
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getReceiptPrintScript() {
  return `<script>
    (function () {
      window.addEventListener("load", function () {
        requestAnimationFrame(function () {
          setTimeout(function () { window.print(); }, 80);
        });
      });

      window.addEventListener("afterprint", function () {
        setTimeout(function () { window.close(); }, 150);
      });
    })();
  </script>`;
}

function buildThermalHtml({ title, body, heightMm }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: 80mm ${heightMm}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html,
  body {
    width: 80mm;
    min-height: 0;
    background: #fff;
  }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 10pt;
    line-height: 1.28;
    color: #000;
  }
  .thermal-receipt {
    width: 72mm;
    padding: 4mm;
    overflow: hidden;
  }
  .center { text-align: center; }
  .shop-name { font-size: 13pt; font-weight: 700; letter-spacing: 0.05em; }
  .shop-sub { font-size: 8pt; margin-top: 1mm; }
  .divider { border: none; border-top: 1px dashed #000; margin: 3mm 0; }
  .divider-solid { border: none; border-top: 2px solid #000; margin: 3mm 0; }
  .label { font-size: 8pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding-bottom: 1mm; }
  .date { font-size: 8pt; color: #333; margin-top: 1mm; }
  .bill-label { font-size: 15pt; font-weight: 700; }
  .table-label { font-size: 9pt; margin-top: 1mm; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 0.8mm 0; }
  td.name { width: 64%; font-size: 9pt; font-weight: 700; overflow-wrap: anywhere; }
  td.total { width: 36%; text-align: right; font-size: 9pt; font-weight: 700; white-space: nowrap; }
  tr.detail-row td.detail { font-size: 8pt; font-weight: normal; padding: 0 0 1.8mm 3mm; }
  .kv td:first-child { width: 38%; color: #000; }
  .kv td:last-child { width: 62%; text-align: right; overflow-wrap: anywhere; }
  .total-row td { font-size: 12pt; font-weight: 700; padding-top: 2mm; }
  .footer { text-align: center; font-size: 9pt; margin-top: 3mm; }
  @media print {
    html,
    body {
      width: 80mm !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .thermal-receipt {
      break-after: avoid;
      page-break-after: avoid;
    }
  }
</style>
</head>
<body>
  <main class="thermal-receipt">
    ${body}
  </main>
  ${getReceiptPrintScript()}
</body>
</html>`;
}

export function buildReceiptHtml(receiptData, formatCurrency) {
  const itemCount = Array.isArray(receiptData.items) ? receiptData.items.length : 0;
  const giftCardCount = Array.isArray(receiptData.giftCardMatches)
    ? receiptData.giftCardMatches.length
    : 0;
  const customerRows =
    4 +
    (receiptData.customer?.email ? 1 : 0) +
    (receiptData.customer?.phone ? 1 : 0) +
    (receiptData.paymentMethod === "cash" && receiptData.cashReceived != null ? 2 : 0);
  const totalsRows =
    1 +
    (receiptData.subtotal !== receiptData.total ? 1 : 0) +
    (receiptData.discount?.amount > 0 ? 1 : 0) +
    (Number(receiptData.giftCardApplied || 0) > 0 ? 1 : 0);
  const heightMm = Math.max(
    95,
    42 + customerRows * 5 + itemCount * 10 + giftCardCount * 6 + totalsRows * 6,
  );

  const itemRows = (receiptData.items || [])
    .map((item) => {
      const lineTotal = formatCurrency((item.price || 0) * (item.quantity || 1));
      const unitLine = `${escapeHtml(item.quantity || 1)} &times; ${escapeHtml(formatCurrency(item.price || 0))}`;
      const sub = item.metadata?.variantLabel
        ? ` - ${escapeHtml(item.metadata.variantLabel)}`
        : item.metadata?.sessionLabel
          ? ` (${escapeHtml(item.metadata.sessionLabel)})`
          : "";
      return `
        <tr>
          <td class="name">${escapeHtml(item.name || "Item")}${sub}</td>
          <td class="total">${escapeHtml(lineTotal)}</td>
        </tr>
        <tr class="detail-row">
          <td colspan="2" class="detail">${unitLine}</td>
        </tr>`;
    })
    .join("");

  const paymentLabel = receiptData.paymentMethod
    ? receiptData.paymentMethod.charAt(0).toUpperCase() + receiptData.paymentMethod.slice(1)
    : "Unknown";

  const giftCardRows =
    Array.isArray(receiptData.giftCardMatches) && receiptData.giftCardMatches.length > 0
      ? `
        <hr class="divider">
        <p class="label">Gift Cards Redeemed</p>
        <table class="kv">
          ${receiptData.giftCardMatches
            .map((match) => {
              const status = (match.status || "unknown").toString().replace(/_/g, " ");
              return `<tr><td>${escapeHtml(match.code)}</td><td>${escapeHtml(status)}</td></tr>`;
            })
            .join("")}
        </table>`
      : "";

  const subtotalRow =
    receiptData.subtotal !== receiptData.total
      ? `<tr><td>Subtotal</td><td>${escapeHtml(formatCurrency(receiptData.subtotal))}</td></tr>`
      : "";
  const discountRow =
    receiptData.discount?.amount > 0
      ? `<tr><td>Discount</td><td>-${escapeHtml(formatCurrency(receiptData.discount.amount))}</td></tr>`
      : "";
  const giftCardAppliedRow =
    Number(receiptData.giftCardApplied || 0) > 0
      ? `<tr><td>Gift card</td><td>-${escapeHtml(formatCurrency(receiptData.giftCardApplied))}</td></tr>`
      : "";
  const cashRows =
    receiptData.paymentMethod === "cash" && receiptData.cashReceived != null
      ? `
        <tr><td>Cash received</td><td>${escapeHtml(formatCurrency(receiptData.cashReceived))}</td></tr>
        <tr><td>Change due</td><td>${escapeHtml(formatCurrency(receiptData.changeDue || 0))}</td></tr>`
      : "";

  return buildThermalHtml({
    title: `Receipt ${receiptData.receiptNumber || ""}`.trim(),
    heightMm,
    body: `
      <div class="center">
        <p class="shop-name">BETHANY BLOOMS</p>
        <p class="shop-sub">bethanyblooms.co.za</p>
      </div>
      <hr class="divider">
      <table class="kv">
        <tr><td>Receipt</td><td>${escapeHtml(receiptData.receiptNumber)}</td></tr>
        <tr><td>Date</td><td>${escapeHtml(receiptData.createdAt.toLocaleString("en-ZA"))}</td></tr>
        <tr><td>Customer</td><td>${escapeHtml(receiptData.customer?.name || "Walk-in")}</td></tr>
        ${
          receiptData.customer?.email
            ? `<tr><td>Email</td><td>${escapeHtml(receiptData.customer.email)}</td></tr>`
            : ""
        }
        ${
          receiptData.customer?.phone
            ? `<tr><td>Phone</td><td>${escapeHtml(receiptData.customer.phone)}</td></tr>`
            : ""
        }
        <tr><td>Payment</td><td>${escapeHtml(paymentLabel)}</td></tr>
        ${cashRows}
      </table>
      <hr class="divider">
      <p class="label">Items</p>
      <table>
        ${itemRows}
      </table>
      ${giftCardRows}
      <hr class="divider-solid">
      <table class="kv">
        ${subtotalRow}
        ${discountRow}
        ${giftCardAppliedRow}
        <tr class="total-row"><td>Total</td><td>${escapeHtml(formatCurrency(receiptData.total))}</td></tr>
      </table>
      <hr class="divider">
      <p class="footer">Thank you for shopping at Bethany Blooms!</p>`,
  });
}

export function buildBillHtml(cartItems, subtotal, tableLabel, formatCurrency) {
  const itemCount = Array.isArray(cartItems) ? cartItems.length : 0;
  const heightMm = Math.max(100, 73 + itemCount * 10 + (tableLabel ? 6 : 0));

  const itemRows = cartItems
    .map((item) => {
      const lineTotal = formatCurrency((item.price || 0) * (item.quantity || 1));
      const unitLine = `${escapeHtml(item.quantity || 1)} &times; ${escapeHtml(formatCurrency(item.price || 0))}`;
      const sub = item.metadata?.variantLabel
        ? ` - ${escapeHtml(item.metadata.variantLabel)}`
        : item.metadata?.sessionLabel
          ? ` (${escapeHtml(item.metadata.sessionLabel)})`
          : "";
      return `
        <tr>
          <td class="name">${escapeHtml(item.name || "Item")}${sub}</td>
          <td class="total">${escapeHtml(lineTotal)}</td>
        </tr>
        <tr class="detail-row">
          <td colspan="2" class="detail">${unitLine}</td>
        </tr>`;
    })
    .join("");

  return buildThermalHtml({
    title: "Bill",
    heightMm,
    body: `
      <div class="center">
        <p class="shop-name">BETHANY BLOOMS</p>
        <p class="shop-sub">bethanyblooms.co.za</p>
      </div>
      <hr class="divider">
      <div class="center">
        <p class="bill-label">BILL</p>
        ${tableLabel ? `<p class="table-label">${escapeHtml(tableLabel)}</p>` : ""}
        <p class="date">${escapeHtml(new Date().toLocaleString("en-ZA"))}</p>
      </div>
      <hr class="divider">
      <table>
        <tr><td colspan="2" class="label">Items</td></tr>
        ${itemRows}
      </table>
      <hr class="divider-solid">
      <table>
        <tr class="total-row">
          <td>TOTAL</td>
          <td style="text-align:right">${escapeHtml(formatCurrency(subtotal))}</td>
        </tr>
      </table>
      <hr class="divider">
      <p class="footer">Printed receipt of order</p>
      <br>
      <br>`,
  });
}
