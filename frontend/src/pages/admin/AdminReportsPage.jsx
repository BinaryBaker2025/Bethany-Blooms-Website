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
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === "function") {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    } catch {
      return null;
    }
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

function AdminReportsPage() {
  usePageMetadata({
    title: "Admin - Reports",
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

  const rangeBounds = useMemo(() => {
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) {
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  }, [startDate, endDate]);

  const inRange = (dateValue) => {
    if (!dateValue || !rangeBounds.start || !rangeBounds.end) return false;
    return dateValue >= rangeBounds.start && dateValue <= rangeBounds.end;
  };

  const normalizedOrders = useMemo(() => {
    return (orders || []).map((order) => ({
      ...order,
      createdAt: parseDateValue(order.createdAt || order.paidAt || order.updatedAt),
    }));
  }, [orders]);

  const normalizedSales = useMemo(() => {
    return (posSales || []).map((sale) => ({
      ...sale,
      createdAt: parseDateValue(sale.createdAt || sale.updatedAt),
    }));
  }, [posSales]);

  const filteredOrders = useMemo(() => {
    return normalizedOrders.filter((order) => inRange(order.createdAt));
  }, [normalizedOrders, rangeBounds]);

  const recognizedRevenueOrders = useMemo(() => {
    return filteredOrders.filter((order) => {
      const paymentMethod = normalizePaymentMethod(order?.paymentMethod);
      if (paymentMethod !== PAYMENT_METHODS.EFT) return true;
      return (
        normalizePaymentApprovalStatus(order) ===
        PAYMENT_APPROVAL_STATUSES.APPROVED
      );
    });
  }, [filteredOrders]);

  const filteredSales = useMemo(() => {
    return normalizedSales.filter((sale) => inRange(sale.createdAt));
  }, [normalizedSales, rangeBounds]);

  const onlineRevenue = recognizedRevenueOrders.reduce(
    (sum, order) => sum + parseNumber(order.totalPrice, 0),
    0,
  );
  const posRevenue = filteredSales.reduce((sum, sale) => sum + parseNumber(sale.total, 0), 0);
  const combinedRevenue = onlineRevenue + posRevenue;

  const posCashTotal = filteredSales
    .filter((sale) => sale.paymentMethod === "cash")
    .reduce((sum, sale) => sum + parseNumber(sale.total, 0), 0);
  const posCardTotal = filteredSales
    .filter((sale) => sale.paymentMethod === "card")
    .reduce((sum, sale) => sum + parseNumber(sale.total, 0), 0);

  const popularItems = useMemo(() => {
    const map = new Map();

    filteredOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const isProduct = item.metadata?.type === "product";
        if (!isProduct) return;
        const key = item.id || item.name;
        if (!key) return;
        const entry = map.get(key) || { name: item.name || key, quantity: 0, revenue: 0 };
        const quantity = parseNumber(item.quantity, 0);
        entry.quantity += quantity;
        entry.revenue += parseNumber(item.price, 0) * quantity;
        map.set(key, entry);
      });
    });

    filteredSales.forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const isPosItem = item.type === "product" || item.type === "pos-product";
        if (!isPosItem) return;
        const key = item.id || item.name;
        if (!key) return;
        const entry = map.get(key) || { name: item.name || key, quantity: 0, revenue: 0 };
        const quantity = parseNumber(item.quantity, 0);
        entry.quantity += quantity;
        entry.revenue += parseNumber(item.price, 0) * quantity;
        map.set(key, entry);
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
  }, [filteredOrders, filteredSales]);

  const visitsInRange = useMemo(() => {
    const normalizedVisits = (siteVisits || []).map((visit) => ({
      ...visit,
      createdAt: parseDateValue(visit.createdAt || visit.timestamp),
    }));
    return normalizedVisits.filter((visit) => inRange(visit.createdAt));
  }, [siteVisits, rangeBounds]);

  return (
    <div className="admin-panel">
      <header className="admin-panel__header">
        <div>
          <h2>Reports</h2>
          <p className="modal__meta">Compare online and POS performance by date range.</p>
        </div>
      </header>

      <div className="report-filters">
        <label className="modal__meta">
          Start date
          <input className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="modal__meta">
          End date
          <input className="input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </div>

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
            <span>Card</span>
            <strong>{moneyFormatter.format(posCardTotal)}</strong>
          </div>
          <div className="report-stat">
            <span>POS transactions</span>
            <strong>{filteredSales.length}</strong>
          </div>
        </div>

        <div className="report-card">
          <h3>Orders</h3>
          <div className="report-stat">
            <span>Online orders</span>
            <strong>{filteredOrders.length}</strong>
          </div>
          <div className="report-stat">
            <span>POS receipts</span>
            <strong>{filteredSales.length}</strong>
          </div>
          <div className="report-stat">
            <span>Total transactions</span>
            <strong>{filteredOrders.length + filteredSales.length}</strong>
          </div>
        </div>

        <div className="report-card">
          <h3>Site visits</h3>
          {visitsInRange.length === 0 ? (
            <p className="modal__meta">No visit data yet. Connect analytics to enable this.</p>
          ) : (
            <div className="report-stat">
              <span>Visits</span>
              <strong>{visitsInRange.length}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="report-grid">
        <div className="report-card report-card--wide">
          <h3>Popular products</h3>
          {popularItems.length === 0 ? (
            <p className="modal__meta">No product sales recorded in this range.</p>
          ) : (
            <div className="admin-table__wrapper">
              <table className="admin-table admin-table--compact">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Qty sold</th>
                    <th scope="col">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {popularItems.map((item) => (
                    <tr key={item.name}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{moneyFormatter.format(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminReportsPage;
