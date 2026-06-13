const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Replace non-ASCII / non-printable chars with ASCII equivalents
function encodeText(str) {
  return String(str)
    .replace(/ | /g, " ") // narrow/non-breaking space → space
    .replace(/[‐-―−]/g, "-") // various dashes/minus → hyphen
    .replace(/×/g, "x") // × → x
    .replace(/[^\x20-\x7e]/g, "?"); // anything else → ?
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
    .feed(4)
    .partialCut();

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
    .line("Please pay at the counter.")
    .lf()
    .feed(4)
    .partialCut();

  return cmd;
}

// ── Browser-print fallback: returns an HTML string for a new print window ──
export function buildBillHtml(cartItems, subtotal, tableLabel, formatCurrency) {
  const itemRows = cartItems
    .map((item) => {
      const lineTotal = formatCurrency((item.price || 0) * (item.quantity || 1));
      const unitLine = `${item.quantity} &times; ${formatCurrency(item.price || 0)}`;
      const sub = item.metadata?.variantLabel
        ? ` &mdash; ${item.metadata.variantLabel}`
        : item.metadata?.sessionLabel
          ? ` (${item.metadata.sessionLabel})`
          : "";
      return `
        <tr>
          <td class="name">${item.name || "Item"}${sub}</td>
          <td class="total">${lineTotal}</td>
        </tr>
        <tr class="detail-row">
          <td colspan="2" class="detail">${unitLine}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Bill</title>
<style>
  @page { margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11pt;
    color: #000;
    width: 100%;
  }
  .center { text-align: center; }
  .shop-name { font-size: 14pt; font-weight: 700; letter-spacing: 0.05em; }
  .shop-sub { font-size: 9pt; margin-top: 1mm; }
  .divider { border: none; border-top: 1px dashed #000; margin: 3mm 0; }
  .divider-solid { border: none; border-top: 2px solid #000; margin: 3mm 0; }
  .bill-label { font-size: 16pt; font-weight: 700; }
  .table-label { font-size: 10pt; margin-top: 1mm; }
  .date { font-size: 9pt; color: #444; margin-top: 1mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
  .section-label { font-size: 8pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding-bottom: 1mm; }
  td { vertical-align: top; padding: 1mm 0; }
  td.name { width: 65%; font-size: 10pt; font-weight: 700; }
  td.total { width: 35%; text-align: right; font-size: 10pt; font-weight: 700; }
  tr.detail-row td.detail { font-size: 9pt; font-weight: normal; padding: 0 0 2mm 3mm; }
  .total-row td { font-size: 13pt; font-weight: 700; padding-top: 2mm; }
  .footer { text-align: center; font-size: 10pt; margin-top: 3mm; }
</style>
</head>
<body>
  <div class="center">
    <p class="shop-name">BETHANY BLOOMS</p>
    <p class="shop-sub">bethanyblooms.co.za</p>
  </div>
  <hr class="divider">
  <div class="center">
    <p class="bill-label">BILL</p>
    ${tableLabel ? `<p class="table-label">${tableLabel}</p>` : ""}
    <p class="date">${new Date().toLocaleString("en-ZA")}</p>
  </div>
  <hr class="divider">
  <table>
    <tr><td colspan="2" class="section-label">ITEMS</td></tr>
    ${itemRows}
  </table>
  <hr class="divider-solid">
  <table>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">${formatCurrency(subtotal)}</td>
    </tr>
  </table>
  <hr class="divider">
  <p class="footer">Please pay at the counter.</p>
  <script>window.onload = function(){ window.print(); window.close(); }</script>
</body>
</html>`;
}
