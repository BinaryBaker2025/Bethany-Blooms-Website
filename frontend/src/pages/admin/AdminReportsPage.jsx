import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection.js";
import { usePageMetadata } from "../../hooks/usePageMetadata.js";
import {
  PAYMENT_APPROVAL_STATUSES,
  PAYMENT_METHODS,
  normalizePaymentApprovalStatus,
  normalizePaymentMethod,
} from "../../lib/paymentMethods.js";
import {
  formatPosSaleStatusLabel,
  getPosSaleNetTotal,
  getPosSaleStatusBadgeClass,
  getPosSaleVoidSummary,
  normalizePosSaleStatus,
} from "../../lib/posSales.js";

const moneyFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

const toLocalDateKey = (date) => {
  if (!(date instanceof Date)) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    } catch { return null; }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const parseNumber = (value, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeVariantLabel = (item) => {
  const label = item?.metadata?.variantLabel;
  return typeof label === "string" ? label.trim() : "";
};

const buildProductReportLabel = (item, fallbackName) => {
  const baseName = (item?.name || fallbackName || "Product").toString().trim() || "Product";
  const variantLabel = normalizeVariantLabel(item);
  return variantLabel ? `${baseName} — ${variantLabel}` : baseName;
};

const resolveProductReportIdentity = (item) => {
  const metadata = item?.metadata || {};
  const rawItemId = (item?.id || "").toString().trim();
  const idSegments = rawItemId ? rawItemId.split(":") : [];
  const fallbackProductId = idSegments[0] || rawItemId;
  const fallbackVariantId = idSegments.length > 1 ? idSegments.slice(1).join(":") : "";
  const productKey = (metadata.productId || metadata.productID || metadata.product || fallbackProductId || item?.name || "").toString().trim();
  const variantLabel = normalizeVariantLabel(item);
  const variantId = (metadata.variantId || fallbackVariantId || "").toString().trim();
  const variantKey = (variantId || variantLabel).toString().trim().toLowerCase();
  return { productKey, variantKey };
};

function AdminReportsPage() {
  usePageMetadata({
    title: "Admin — Reports",
    description: "Comprehensive reporting for online and POS sales.",
  });

  const { orders } = useAdminData();
  const { items: posSales } = useFirestoreCollection("posSales", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });
  const { items: siteVisits } = useFirestoreCollection("siteVisits", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const today = new Date();
  const defaultStart = new Date();
  defaultStart.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState(toLocalDateKey(defaultStart));
  const [endDate, setEndDate] = useState(toLocalDateKey(today));
  const [productSort, setProductSort] = useState("qty-desc");
  const [minQty, setMinQty] = useState("1");
  const [minRevenue, setMinRevenue] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const rangeBounds = useMemo(() => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [startDate, endDate]);

  const inRange = (dateValue) => {
    if (!dateValue || !rangeBounds.start || !rangeBounds.end) return false;
    return dateValue >= rangeBounds.start && dateValue <= rangeBounds.end;
  };

  const normalizedOrders = useMemo(() =>
    (Array.isArray(orders) ? orders : []).map((order) => ({
      ...order,
      createdAt: parseDateValue(order.createdAt || order.paidAt || order.updatedAt),
    })),
  [orders]);

  const normalizedSales = useMemo(() =>
    (Array.isArray(posSales) ? posSales : []).map((sale) => ({
      ...sale,
      createdAt: parseDateValue(sale.createdAt || sale.updatedAt),
      status: normalizePosSaleStatus(sale.status),
      netTotal: getPosSaleNetTotal(sale),
      voidSummary: getPosSaleVoidSummary(sale),
    })),
  [posSales]);

  const filteredOrders = useMemo(() =>
    normalizedOrders.filter((order) => inRange(order.createdAt)),
  [normalizedOrders, rangeBounds]);

  const recognizedRevenueOrders = useMemo(() =>
    filteredOrders.filter((order) => {
      const paymentMethod = normalizePaymentMethod(order?.paymentMethod);
      if (paymentMethod !== PAYMENT_METHODS.EFT) return true;
      return normalizePaymentApprovalStatus(order) === PAYMENT_APPROVAL_STATUSES.APPROVED;
    }),
  [filteredOrders]);

  const filteredSales = useMemo(() =>
    normalizedSales.filter((sale) => inRange(sale.createdAt)),
  [normalizedSales, rangeBounds]);

  const onlineRevenue = recognizedRevenueOrders.reduce((sum, o) => sum + parseNumber(o.totalPrice), 0);
  const posRevenue    = filteredSales.reduce((sum, s) => sum + parseNumber(s.netTotal), 0);
  const combinedRevenue = onlineRevenue + posRevenue;

  const posCashTotal = filteredSales.filter((s) => s.paymentMethod === "cash").reduce((sum, s) => sum + parseNumber(s.netTotal), 0);
  const posCardTotal = filteredSales.filter((s) => s.paymentMethod === "card").reduce((sum, s) => sum + parseNumber(s.netTotal), 0);
  const voidedReceiptCount = filteredSales.filter((s) => s.voidSummary.voidedTotal > 0).length;
  const voidedAmount       = filteredSales.reduce((sum, s) => sum + parseNumber(s.voidSummary.voidedTotal), 0);
  const activeReceiptCount = filteredSales.filter((s) => s.status !== "voided").length;

  const productTotalsRaw = useMemo(() => {
    const map = new Map();
    recognizedRevenueOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (item.metadata?.type !== "product") return;
        const { productKey, variantKey } = resolveProductReportIdentity(item);
        if (!productKey) return;
        const key = variantKey ? `${productKey}::${variantKey}` : productKey;
        const entry = map.get(key) || { key, name: buildProductReportLabel(item, productKey), quantity: 0, revenue: 0 };
        const quantity = parseNumber(item.quantity);
        entry.quantity += quantity;
        entry.revenue  += parseNumber(item.price) * quantity;
        map.set(key, entry);
      });
    });
    return Array.from(map.values());
  }, [recognizedRevenueOrders]);

  const minQtyValue     = useMemo(() => Math.max(1, Math.floor(Number.parseInt(minQty, 10) || 1)), [minQty]);
  const minRevenueValue = useMemo(() => Math.max(0, Number(minRevenue) || 0), [minRevenue]);
  const productSearchTerm = useMemo(() => productSearch.toLowerCase().trim(), [productSearch]);
  const hasProductSales   = useMemo(() => productTotalsRaw.some((i) => i.quantity >= 1), [productTotalsRaw]);

  const visibleProductTotals = useMemo(() => {
    const compareByName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    const filtered = productTotalsRaw.filter((item) => {
      if (item.quantity < 1) return false;
      if (item.quantity < minQtyValue) return false;
      if (item.revenue < minRevenueValue) return false;
      if (productSearchTerm && !item.name.toLowerCase().includes(productSearchTerm)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      const name = compareByName(a, b);
      if (productSort === "qty-asc")      return (a.quantity - b.quantity) || name;
      if (productSort === "revenue-desc") return (b.revenue - a.revenue) || name;
      if (productSort === "revenue-asc")  return (a.revenue - b.revenue) || name;
      if (productSort === "name-asc")     return name;
      if (productSort === "name-desc")    return name * -1;
      return (b.quantity - a.quantity) || name;
    });
    return filtered;
  }, [productTotalsRaw, minQtyValue, minRevenueValue, productSearchTerm, productSort]);

  const visitsInRange = useMemo(() => {
    const normalized = (siteVisits || []).map((v) => ({ ...v, createdAt: parseDateValue(v.createdAt || v.timestamp) }));
    return normalized.filter((v) => inRange(v.createdAt));
  }, [siteVisits, rangeBounds]);

  const handleResetProductFilters = () => {
    setProductSort("qty-desc");
    setMinQty("1");
    setMinRevenue("");
    setProductSearch("");
  };

  return (
    <div className="admin-panel">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <header className="admin-panel__header">
        <div>
          <h2>Reports</h2>
          <p className="modal__meta">Online orders + POS performance by date range.</p>
        </div>
      </header>

      {/* ── Date filter bar ──────────────────────────────────────────── */}
      <div className="report-filters" role="search" aria-label="Date range filter">
        <label>
          From
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
          />
        </label>
        <label>
          To
          <input
            className="input"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date"
          />
        </label>
      </div>

      {/* ── KPI summary strip ────────────────────────────────────────── */}
      <div className="admin-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Total Revenue</p>
          <p className="admin-kpi__value">{moneyFormatter.format(combinedRevenue)}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Online</p>
          <p className="admin-kpi__value">{moneyFormatter.format(onlineRevenue)}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">POS</p>
          <p className="admin-kpi__value">{moneyFormatter.format(posRevenue)}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Transactions</p>
          <p className="admin-kpi__value">{filteredOrders.length + filteredSales.length}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Voided</p>
          <p className="admin-kpi__value">{moneyFormatter.format(voidedAmount)}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Site Visits</p>
          <p className="admin-kpi__value">{visitsInRange.length}</p>
        </div>
      </div>

      {/* ── Detail cards ─────────────────────────────────────────────── */}
      <div className="report-grid">

        <div className="report-card">
          <h3>Revenue</h3>
          <div className="report-stat">
            <span>Online orders</span>
            <strong>{moneyFormatter.format(onlineRevenue)}</strong>
          </div>
          <div className="report-stat">
            <span>POS sales</span>
            <strong>{moneyFormatter.format(posRevenue)}</strong>
          </div>
          <div className="report-stat report-stat--total">
            <span>Total</span>
            <strong>{moneyFormatter.format(combinedRevenue)}</strong>
          </div>
        </div>

        <div className="report-card">
          <h3>POS Payment Mix</h3>
          <div className="report-stat">
            <span>Cash</span>
            <strong>{moneyFormatter.format(posCashTotal)}</strong>
          </div>
          <div className="report-stat">
            <span>Card / EFT</span>
            <strong>{moneyFormatter.format(posCardTotal)}</strong>
          </div>
          <div className="report-stat report-stat--total">
            <span>POS transactions</span>
            <strong>{activeReceiptCount}</strong>
          </div>
        </div>

        <div className="report-card">
          <h3>Order counts</h3>
          <div className="report-stat">
            <span>Online orders</span>
            <strong>{filteredOrders.length}</strong>
          </div>
          <div className="report-stat">
            <span>POS receipts</span>
            <strong>{filteredSales.length}</strong>
          </div>
          <div className="report-stat report-stat--total">
            <span>All transactions</span>
            <strong>{filteredOrders.length + filteredSales.length}</strong>
          </div>
        </div>

        <div className="report-card">
          <h3>POS Voids</h3>
          <div className="report-stat">
            <span>Voided receipts</span>
            <strong>{voidedReceiptCount}</strong>
          </div>
          <div className="report-stat report-stat--total">
            <span>Voided amount</span>
            <strong>{moneyFormatter.format(voidedAmount)}</strong>
          </div>
        </div>

        {visitsInRange.length > 0 && (
          <div className="report-card">
            <h3>Site Visits</h3>
            <div className="report-stat report-stat--total">
              <span>Unique visits</span>
              <strong>{visitsInRange.length}</strong>
            </div>
          </div>
        )}

      </div>

      {/* ── Product totals ────────────────────────────────────────────── */}
      <div className="report-card report-card--wide">
        <h3>Product totals</h3>
        <p className="admin-panel__note" style={{ marginBottom: "1rem" }}>
          Online product orders only — bookings and POS excluded.
        </p>

        {/* Product filter controls */}
        <div className="report-product-controls">
          <label className="report-product-controls__field modal__meta">
            Search
            <input
              className="input"
              type="search"
              placeholder="Product or variant…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              aria-label="Filter products by name"
            />
          </label>
          <label className="report-product-controls__field modal__meta">
            Min qty
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              aria-label="Minimum quantity sold"
            />
          </label>
          <label className="report-product-controls__field modal__meta">
            Min revenue (R)
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={minRevenue}
              onChange={(e) => setMinRevenue(e.target.value)}
              aria-label="Minimum revenue"
            />
          </label>
          <label className="report-product-controls__field modal__meta">
            Sort by
            <select
              className="input"
              value={productSort}
              onChange={(e) => setProductSort(e.target.value)}
              aria-label="Sort products"
            >
              <option value="qty-desc">Qty — high to low</option>
              <option value="qty-asc">Qty — low to high</option>
              <option value="revenue-desc">Revenue — high to low</option>
              <option value="revenue-asc">Revenue — low to high</option>
              <option value="name-asc">Name A → Z</option>
              <option value="name-desc">Name Z → A</option>
            </select>
          </label>
          <div className="report-product-controls__actions">
            <button className="btn btn--secondary" type="button" onClick={handleResetProductFilters}>
              Clear filters
            </button>
          </div>
        </div>

        {/* Table */}
        {!hasProductSales ? (
          <p className="modal__meta">No product sales recorded in this date range.</p>
        ) : visibleProductTotals.length === 0 ? (
          <p className="modal__meta">No products match the current filters.</p>
        ) : (
          <div className="admin-table__wrapper">
            <table className="admin-table admin-table--compact">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Product / Variant</th>
                  <th scope="col">Qty sold</th>
                  <th scope="col">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {visibleProductTotals.map((item, index) => (
                  <tr key={item.key}>
                    <td style={{ color: "var(--admin-text-muted)", fontSize: "0.78rem" }}>{index + 1}</td>
                    <td><strong style={{ fontWeight: 600 }}>{item.name}</strong></td>
                    <td>{item.quantity}</td>
                    <td><strong>{moneyFormatter.format(item.revenue)}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(183,196,169,0.1)" }}>
                  <td colSpan={2} style={{ fontWeight: 700, paddingTop: "0.85rem", paddingBottom: "0.85rem" }}>
                    Totals
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {visibleProductTotals.reduce((s, i) => s + i.quantity, 0)}
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--color-accent)" }}>
                    {moneyFormatter.format(visibleProductTotals.reduce((s, i) => s + i.revenue, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

export default AdminReportsPage;
