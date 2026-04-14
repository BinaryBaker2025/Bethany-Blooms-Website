import logo from "../assets/BethanyBloomsLogo.png";
import { COMPANY_PHONE_LOCAL_DISPLAY } from "./contactInfo.js";
import { EFT_BANK_DETAILS } from "./paymentMethods.js";
import { formatPreorderSendMonth } from "./preorder.js";
import { getCanonicalSiteUrl } from "./seo.js";
import { formatShippingAddress } from "./shipping.js";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-ZA", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const escapeHtml = (value = "") =>
  (value || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "R0.00";
  return `R${amount.toFixed(2)}`;
};

const getLogoUrl = () => {
  if (typeof window === "undefined" || !logo) return "";
  try {
    return new URL(logo, window.location.href).toString();
  } catch {
    return logo;
  }
};

const titleCase = (value = "") =>
  (value || "")
    .toString()
    .trim()
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getOrderLabel = (order = {}) => {
  const numericOrder = Number(order?.orderNumber);
  if (Number.isFinite(numericOrder) && numericOrder > 0) {
    return `Order #${Math.floor(numericOrder)}`;
  }
  const fallbackId = (order?.id || "").toString().trim();
  return fallbackId ? `Order ${fallbackId}` : "Order";
};

const getPlacedAtLabel = (order = {}) => {
  const placedAt = toDate(order?.createdAt) || toDate(order?.updatedAt);
  return placedAt ? DATE_TIME_FORMATTER.format(placedAt) : "Date unavailable";
};

const buildAddressLines = (order = {}) => {
  const formattedAddress = formatShippingAddress(order?.shippingAddress || {});
  if (formattedAddress) {
    return formattedAddress
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  const fallback = (order?.customer?.address || "").toString().trim();
  return fallback ? [fallback] : [];
};

const buildItemDetailLines = (item = {}) => {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const lines = [];

  if (metadata.variantLabel) {
    lines.push(`Variant: ${metadata.variantLabel}`);
  }

  if (metadata.type === "workshop") {
    const sessionSource = (metadata.sessionSource || "").toString().trim().toLowerCase();
    const dateLabel = metadata.sessionDayLabel || metadata.scheduledDateLabel || "";
    const timeLabel = metadata.sessionTimeRange || metadata.sessionLabel || metadata.sessionTime || "";
    if (sessionSource === "customer-requested") {
      if (dateLabel) lines.push(`Requested date: ${dateLabel}`);
      if (timeLabel) lines.push(`Requested time: ${timeLabel}`);
    } else {
      const scheduleLabel = dateLabel || timeLabel;
      if (scheduleLabel) lines.push(`Workshop: ${scheduleLabel}`);
      if (timeLabel && timeLabel !== scheduleLabel) {
        lines.push(`Time: ${timeLabel}`);
      }
    }
  }

  if ((metadata.type === "cut-flower" || metadata.type === "workshop") && metadata.optionLabel) {
    lines.push(`Option: ${metadata.optionLabel}`);
  }

  const preorderLabel = formatPreorderSendMonth(
    metadata.preorderSendMonth || metadata.preorder_send_month || "",
  );
  if (preorderLabel) {
    lines.push(`Pre-order: ${preorderLabel}`);
  }

  return lines;
};

const buildLineItems = (order = {}) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.map((item = {}) => {
    const quantityValue = Number(item?.quantity ?? 1);
    const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1;
    const unitPriceValue = Number(item?.price ?? 0);
    const unitPrice = Number.isFinite(unitPriceValue) ? unitPriceValue : 0;
    const lineTotal = Number((unitPrice * quantity).toFixed(2));

    return {
      name: (item?.name || "Order item").toString().trim() || "Order item",
      details: buildItemDetailLines(item),
      quantity,
      unitPrice,
      lineTotal,
    };
  });
};

const getPaymentMethodLabel = (order = {}) => {
  const normalized = (order?.paymentMethod || "").toString().trim().toLowerCase();
  if (normalized === "eft") return "EFT";
  if (normalized === "payfast") return "PayFast";
  return normalized ? titleCase(normalized) : "Online payment";
};

const getOrderNotes = (order = {}) =>
  [
    order?.notes,
    order?.note,
    order?.paymentApproval?.note,
    order?.deliveryInstructions,
    order?.specialInstructions,
  ]
    .map((entry) => (entry || "").toString().trim())
    .filter(Boolean);

const buildPrintableOrderInvoiceHtml = (order = {}) => {
  const orderLabel = getOrderLabel(order);
  const placedAtLabel = getPlacedAtLabel(order);
  const lineItems = buildLineItems(order);
  const computedSubtotal = lineItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const subtotalValue = Number(order?.subtotal);
  const subtotal = Number.isFinite(subtotalValue) ? subtotalValue : computedSubtotal;
  const shippingRaw = Number(order?.shippingCost ?? order?.shipping?.courierPrice ?? 0);
  const shippingCost = Number.isFinite(shippingRaw) ? shippingRaw : 0;
  const totalRaw = Number(order?.totalPrice);
  const total = Number.isFinite(totalRaw) ? totalRaw : subtotal + shippingCost;
  const customerName = (order?.customer?.fullName || "Bethany Blooms Customer").toString().trim();
  const customerEmail = (order?.customer?.email || "").toString().trim();
  const customerPhone = (order?.customer?.phone || "").toString().trim();
  const addressLines = buildAddressLines(order);
  const siteUrl = getCanonicalSiteUrl();
  const displaySiteUrl = (siteUrl || "").replace(/^https?:\/\//i, "");
  const logoUrl = getLogoUrl();
  const courierName = (order?.shipping?.courierName || "").toString().trim();
  const trackingLink = (order?.trackingLink || "").toString().trim();
  const deliveryMethod = titleCase((order?.deliveryMethod || "company").toString().trim()) || "Company";
  const paymentMethodLabel = getPaymentMethodLabel(order);
  const orderNotes = getOrderNotes(order);

  const customerHtml = [
    `<div class="invoice-data-name">${escapeHtml(customerName)}</div>`,
    customerEmail ? `<div>${escapeHtml(customerEmail)}</div>` : "",
    customerPhone ? `<div>${escapeHtml(customerPhone)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");

  const deliveryHtml = [
    `<div class="invoice-data-name">${escapeHtml(customerName)}</div>`,
    ...addressLines.map((line) => `<div>${escapeHtml(line)}</div>`),
    !addressLines.length ? '<div class="invoice-muted">No delivery address saved.</div>' : "",
    `<div class="invoice-data-meta">Method: ${escapeHtml(deliveryMethod)}</div>`,
    courierName ? `<div class="invoice-data-meta">Courier: ${escapeHtml(courierName)}</div>` : "",
    trackingLink
      ? `<div class="invoice-data-meta">Tracking: <a href="${escapeHtml(trackingLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(trackingLink)}</a></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const notesHtml = orderNotes.length
    ? orderNotes.map((entry) => `<p>${escapeHtml(entry)}</p>`).join("")
    : "<p>Thank you for your order with Bethany Blooms.</p>";

  const sidebarRows = [
    paymentMethodLabel === "EFT"
      ? `<div class="invoice-sidebar-list__row"><span>Bank</span><strong>${escapeHtml(EFT_BANK_DETAILS.bankName)}</strong></div>`
      : "",
    paymentMethodLabel === "EFT"
      ? `<div class="invoice-sidebar-list__row"><span>Account Number</span><strong>${escapeHtml(EFT_BANK_DETAILS.accountNumber)}</strong></div>`
      : "",
    `<div class="invoice-sidebar-list__row"><span>Order Number</span><strong>${escapeHtml(orderLabel)}</strong></div>`,
    `<div class="invoice-sidebar-list__row"><span>Date Placed</span><strong>${escapeHtml(placedAtLabel)}</strong></div>`,
  ]
    .filter(Boolean)
    .join("");

  const lineItemsHtml = lineItems.length
    ? lineItems
        .map(
          (item, index) => `
            <tr>
              <td class="invoice-table__item-number">${escapeHtml(index + 1)}</td>
              <td>
                <div class="invoice-line-title">${escapeHtml(item.name)}</div>
                ${
                  item.details.length
                    ? `<div class="invoice-line-meta">${item.details
                        .map((detail) => escapeHtml(detail))
                        .join(" | ")}</div>`
                    : ""
                }
              </td>
              <td class="is-numeric">${escapeHtml(item.quantity)}</td>
              <td class="is-numeric">${escapeHtml(formatMoney(item.unitPrice))}</td>
              <td class="is-numeric">-</td>
              <td class="is-numeric">${escapeHtml(formatMoney(item.lineTotal))}</td>
            </tr>
          `,
        )
        .join("")
    : `
        <tr>
          <td class="invoice-table__item-number">1</td>
          <td>
            <div class="invoice-line-title">No line items saved on this order.</div>
          </td>
          <td class="is-numeric">-</td>
          <td class="is-numeric">-</td>
          <td class="is-numeric">-</td>
          <td class="is-numeric">-</td>
        </tr>
      `;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(orderLabel)} | Invoice</title>
    <style>
      :root {
        color-scheme: light;
        --invoice-text: #1f2a21;
        --invoice-muted: rgba(31, 42, 33, 0.66);
        --invoice-line: #e0d4be;
        --invoice-soft: #f8f5ef;
        --invoice-accent: #536f34;
        --invoice-accent-soft: #edf4e0;
        --invoice-shadow: rgba(18, 28, 18, 0.14);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 1100px;
        font-family: "Source Sans 3", "Helvetica Neue", Arial, sans-serif;
        background: #f4f1ea;
        color: var(--invoice-text);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        overflow-x: auto;
      }

      .invoice-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 1rem 1.5rem;
        background: rgba(255, 255, 255, 0.96);
        border-bottom: 1px solid rgba(57, 50, 47, 0.1);
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .invoice-toolbar__meta {
        font-size: 0.92rem;
        color: var(--invoice-muted);
      }

      .invoice-toolbar__actions {
        display: flex;
        gap: 0.75rem;
      }

      .invoice-toolbar__btn {
        border: 1px solid rgba(83, 111, 52, 0.28);
        background: #fff;
        color: var(--invoice-accent);
        border-radius: 999px;
        padding: 0.7rem 1.1rem;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .invoice-page {
        width: 1040px;
        margin: 1.5rem auto 2.25rem;
        background: #fff;
        box-shadow: 0 24px 60px var(--invoice-shadow);
      }

      .invoice-shell {
        padding: 2.9rem 2.8rem 2.6rem;
      }

      .invoice-header {
        display: grid;
        grid-template-columns: 170px minmax(0, 1fr) minmax(220px, 0.82fr);
        gap: 1.75rem;
        align-items: flex-start;
        padding-bottom: 1.8rem;
        border-bottom: 1px solid var(--invoice-line);
      }

      .invoice-logo {
        width: 150px;
        height: auto;
        object-fit: contain;
      }

      .invoice-rule {
        width: 100%;
        height: 2px;
        margin-bottom: 0.85rem;
        background: var(--invoice-accent);
      }

      .invoice-title {
        margin: 0 0 0.45rem;
        color: var(--invoice-accent);
        font-size: clamp(2rem, 4vw, 2.55rem);
        line-height: 1;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .invoice-section-label {
        margin: 0 0 0.4rem;
        color: var(--invoice-muted);
        font-size: 0.74rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .invoice-meta-grid,
      .invoice-issued-list {
        display: grid;
        gap: 0.5rem;
      }

      .invoice-meta-row,
      .invoice-issued-list div {
        display: grid;
        grid-template-columns: 110px minmax(0, 1fr);
        gap: 0.8rem;
        align-items: baseline;
      }

      .invoice-meta-row span,
      .invoice-issued-list span {
        color: var(--invoice-muted);
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .invoice-meta-row strong,
      .invoice-issued-list strong {
        font-size: 0.92rem;
        line-height: 1.45;
      }

      .invoice-info-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2rem;
        padding: 1.6rem 0 1.8rem;
        border-bottom: 1px solid var(--invoice-line);
      }

      .invoice-info-card h2,
      .invoice-main-column h2,
      .invoice-sidebar-card h2,
      .invoice-thank-you h2 {
        margin: 0 0 0.65rem;
        color: var(--invoice-muted);
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .invoice-data-name {
        margin-bottom: 0.3rem;
        font-size: 1rem;
        font-weight: 700;
      }

      .invoice-info-card div,
      .invoice-info-card p {
        line-height: 1.56;
      }

      .invoice-data-meta {
        margin-top: 0.45rem;
        color: var(--invoice-muted);
        font-size: 0.9rem;
      }

      .invoice-data-meta a {
        color: inherit;
        text-decoration: none;
        word-break: break-word;
      }

      .invoice-muted {
        color: var(--invoice-muted);
      }

      .invoice-body-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 270px;
        gap: 2rem;
        padding-top: 1.8rem;
      }

      .invoice-main-column {
        min-width: 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        text-align: left;
        padding: 0.78rem 0.55rem;
        border-bottom: 1px solid var(--invoice-line);
        vertical-align: top;
      }

      thead th {
        padding-top: 0;
        padding-bottom: 0.75rem;
        border-bottom: 2px solid var(--invoice-accent);
        color: var(--invoice-muted);
        font-size: 0.78rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      th:first-child,
      td:first-child {
        padding-left: 0;
      }

      th:last-child,
      td:last-child {
        padding-right: 0;
      }

      .invoice-table__item-number {
        width: 42px;
        color: var(--invoice-accent);
        font-weight: 700;
      }

      .is-numeric {
        text-align: right;
        white-space: nowrap;
      }

      .invoice-line-title {
        font-weight: 700;
      }

      .invoice-line-meta {
        margin-top: 0.35rem;
        color: var(--invoice-muted);
        font-size: 0.88rem;
        line-height: 1.45;
      }

      .invoice-thank-you {
        max-width: 420px;
        padding-top: 2.4rem;
      }

      .invoice-thank-you p {
        margin: 0;
        color: var(--invoice-muted);
        line-height: 1.7;
      }

      .invoice-contact-bar {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
        margin-top: 2rem;
        padding-top: 0.7rem;
        border-top: 2px solid var(--invoice-accent);
        font-size: 0.8rem;
      }

      .invoice-contact-bar a {
        color: inherit;
        text-decoration: none;
      }

      .invoice-side-column {
        background: linear-gradient(180deg, rgba(183, 196, 169, 0.2), rgba(245, 234, 215, 0.8));
        border-left: 1px solid var(--invoice-line);
        padding: 1rem 1rem 1.15rem;
      }

      .invoice-sidebar-card {
        padding: 0.15rem 0 1rem;
      }

      .invoice-sidebar-card + .invoice-sidebar-card {
        border-top: 1px solid rgba(83, 111, 52, 0.18);
        padding-top: 1rem;
      }

      .invoice-sidebar-list {
        display: grid;
        gap: 0.6rem;
      }

      .invoice-sidebar-list__row {
        display: grid;
        gap: 0.18rem;
      }

      .invoice-sidebar-list__row span {
        color: var(--invoice-muted);
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .invoice-sidebar-list__row strong {
        font-size: 0.94rem;
        line-height: 1.4;
      }

      .invoice-total-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 0.46rem 0;
      }

      .invoice-total-row span {
        color: var(--invoice-muted);
        font-size: 0.84rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .invoice-total-row--grand {
        margin-top: 0.65rem;
        padding: 0.75rem 0.55rem;
        border: 1px solid rgba(83, 111, 52, 0.42);
        background: var(--invoice-accent-soft);
      }

      .invoice-total-row--grand strong {
        color: var(--invoice-accent);
        font-size: 1.08rem;
      }

      .invoice-sidebar-note p {
        margin: 0;
        color: var(--invoice-muted);
        line-height: 1.65;
      }

      .invoice-sidebar-note p + p {
        margin-top: 0.6rem;
      }

      @media screen and (max-width: 760px) {
        .invoice-shell {
          padding: 1.4rem;
        }

        .invoice-toolbar {
          flex-direction: column;
          align-items: stretch;
        }

        .invoice-toolbar__actions {
          width: 100%;
        }

        .invoice-toolbar__btn {
          flex: 1 1 0;
        }

        .invoice-logo {
          width: 122px;
        }

        .invoice-meta-row,
        .invoice-issued-list div {
          grid-template-columns: 1fr;
          gap: 0.18rem;
        }
      }

      @media print {
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        body {
          background: #fff;
          min-width: 0;
          overflow: visible;
        }

        .invoice-toolbar {
          display: none;
        }

        .invoice-page {
          width: auto;
          margin: 0;
          box-shadow: none;
        }

        .invoice-shell {
          padding: 0;
        }

        .invoice-header {
          grid-template-columns: 34mm minmax(0, 1fr) 58mm;
          gap: 7mm;
        }

        .invoice-info-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10mm;
        }

        .invoice-body-grid {
          grid-template-columns: minmax(0, 1fr) 62mm;
          gap: 8mm;
        }

        .invoice-contact-bar {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .invoice-side-column {
          background: #f5ead7 !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="invoice-toolbar">
      <div>
        <div class="invoice-toolbar__meta">${escapeHtml(orderLabel)}</div>
        <div class="invoice-toolbar__meta">Placed ${escapeHtml(placedAtLabel)}</div>
      </div>
      <div class="invoice-toolbar__actions">
        <button class="invoice-toolbar__btn" type="button" onclick="window.print()">Print</button>
        <button class="invoice-toolbar__btn" type="button" onclick="window.close()">Close</button>
      </div>
    </div>
    <main class="invoice-page">
      <div class="invoice-shell">
        <section class="invoice-header">
          <div>
            ${logoUrl ? `<img class="invoice-logo" src="${escapeHtml(logoUrl)}" alt="Bethany Blooms logo" />` : ""}
          </div>
          <div>
            <div class="invoice-rule"></div>
            <h1 class="invoice-title">Invoice</h1>
            <div class="invoice-meta-grid">
              <div class="invoice-meta-row">
                <span>Order Number</span>
                <strong>${escapeHtml(orderLabel)}</strong>
              </div>
              <div class="invoice-meta-row">
                <span>Date Placed</span>
                <strong>${escapeHtml(placedAtLabel)}</strong>
              </div>
            </div>
          </div>
          <div>
            <p class="invoice-section-label">Issued By</p>
            <div class="invoice-rule"></div>
            <div class="invoice-issued-list">
              <div>
                <span>Business</span>
                <strong>Bethany Blooms</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>${escapeHtml(EFT_BANK_DETAILS.supportEmail)}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>${escapeHtml(COMPANY_PHONE_LOCAL_DISPLAY)}</strong>
              </div>
              <div>
                <span>Website</span>
                <strong>${escapeHtml(displaySiteUrl)}</strong>
              </div>
            </div>
          </div>
        </section>

        <section class="invoice-info-grid">
          <article class="invoice-info-card">
            <h2>Bill To</h2>
            ${customerHtml}
          </article>
          <article class="invoice-info-card">
            <h2>Deliver To</h2>
            ${deliveryHtml}
          </article>
        </section>

        <section class="invoice-body-grid">
          <div class="invoice-main-column">
            <h2>Items</h2>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th class="is-numeric">Quantity</th>
                  <th class="is-numeric">Unit</th>
                  <th class="is-numeric">Tax</th>
                  <th class="is-numeric">Total</th>
                </tr>
              </thead>
              <tbody>
                ${lineItemsHtml}
              </tbody>
            </table>

            <section class="invoice-thank-you">
              <h2>Thank You</h2>
              <p>
                Thank you for shopping with Bethany Blooms. If you need help with this order,
                contact us and include ${escapeHtml(orderLabel)}.
              </p>
            </section>

            <footer class="invoice-contact-bar">
              <div><a href="mailto:${escapeHtml(EFT_BANK_DETAILS.supportEmail)}">${escapeHtml(EFT_BANK_DETAILS.supportEmail)}</a></div>
              <div>${escapeHtml(COMPANY_PHONE_LOCAL_DISPLAY)}</div>
              <div><a href="${escapeHtml(siteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displaySiteUrl)}</a></div>
            </footer>
          </div>

          <aside class="invoice-side-column">
            <section class="invoice-sidebar-card">
              <h2>Totals</h2>
              <div class="invoice-total-row">
                <span>Subtotal</span>
                <strong>${escapeHtml(formatMoney(subtotal))}</strong>
              </div>
              <div class="invoice-total-row">
                <span>Delivery</span>
                <strong>${escapeHtml(formatMoney(shippingCost))}</strong>
              </div>
              <div class="invoice-total-row invoice-total-row--grand">
                <span>Total</span>
                <strong>${escapeHtml(formatMoney(total))}</strong>
              </div>
            </section>

            <section class="invoice-sidebar-card">
              <h2>Order Summary</h2>
              <div class="invoice-sidebar-list">
                ${sidebarRows}
              </div>
            </section>

            <section class="invoice-sidebar-card invoice-sidebar-note">
              <h2>Notes</h2>
              ${notesHtml}
            </section>
          </aside>
        </section>
      </div>
    </main>
    <script>
      window.addEventListener("load", function () {
        window.setTimeout(function () {
          window.focus();
          window.print();
        }, 120);
      });
    </script>
  </body>
</html>`;
};

export function printOrderInvoice(order = {}) {
  if (typeof window === "undefined") {
    throw new Error("Invoice printing is only available in the browser.");
  }

  const printWindow = window.open("", "_blank", "width=1320,height=980");
  if (!printWindow) {
    throw new Error("The browser blocked the invoice print window.");
  }

  try {
    printWindow.opener = null;
  } catch {
    // Ignore browsers that do not allow reassigning opener.
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintableOrderInvoiceHtml(order));
  printWindow.document.close();
}
