import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection.js";
import { usePageMetadata } from "../../hooks/usePageMetadata.js";
import logo from "../../assets/BethanyBloomsLogo.png";

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

const formatDateLabel = (dateKey) => {
  if (!dateKey) return "-";
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-ZA", { dateStyle: "medium" });
};

const formatDateTime = (date) => {
  if (!date) return "-";
  return date.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const getCashupExpected = (cashup) => {
  const storedExpected = parseNumber(cashup?.expectedCash, NaN);
  if (Number.isFinite(storedExpected)) return storedExpected;
  const openingValue = parseNumber(cashup?.openingFloat, 0);
  const cashTotal = parseNumber(cashup?.totals?.cash, 0);
  return openingValue + cashTotal;
};

const getCashupVariance = (cashup) => {
  const storedVariance = parseNumber(cashup?.variance, NaN);
  if (Number.isFinite(storedVariance)) return storedVariance;
  const expectedCash = getCashupExpected(cashup);
  const countedValue = parseNumber(cashup?.cashCounted, 0);
  return countedValue - expectedCash;
};

const buildCashupReportHtml = ({ cashup, sales, logoUrl }) => {
  const totals = cashup?.totals || {};
  const cashSales = parseNumber(totals.cash, 0);
  const cardSales = parseNumber(totals.card, 0);
  const discounts = parseNumber(totals.discounts, 0);
  const totalSales = parseNumber(totals.total, 0);
  const transactionCount = Number.isFinite(parseNumber(totals.count, NaN))
    ? parseNumber(totals.count, 0)
    : sales.length;
  const openingFloat = parseNumber(cashup?.openingFloat, 0);
  const cashCounted = parseNumber(cashup?.cashCounted, 0);
  const expectedCash = getCashupExpected(cashup);
  const variance = getCashupVariance(cashup);
  const cashupDate = formatDateLabel(cashup?.dateKey || cashup?.date);
  const savedAtLabel = formatDateTime(cashup?.updatedAt || cashup?.createdAt);
  const completedBy = cashup?.updatedBy?.email || cashup?.createdBy?.email || "";
  const notes = cashup?.notes ? escapeHtml(cashup.notes) : "";

  const salesRows = sales.length
    ? sales
        .map((sale) => {
          const timeLabel = sale.createdAt
            ? sale.createdAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
            : "-";
          const itemsLabel = sale.items?.length
            ? sale.items
                .map((item) => `${item.quantity} x ${item.name}`)
                .join(", ")
            : "-";
          return `
            <tr>
              <td>${escapeHtml(sale.receiptNumber || sale.id || "-")}</td>
              <td>${escapeHtml(timeLabel)}</td>
              <td>${escapeHtml(sale.paymentMethod || "-")}</td>
              <td>${escapeHtml(itemsLabel)}</td>
              <td>${escapeHtml(moneyFormatter.format(parseNumber(sale.total, 0)))}</td>
            </tr>
          `;
        })
        .join("")
    : `
        <tr>
          <td class="empty" colspan="5">No POS sales recorded for this date.</td>
        </tr>
      `;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>POS Cash Up</title>
        <style>
          :root {
            color-scheme: only light;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            font-family: "Source Sans 3", "Source Sans Pro", "Helvetica Neue", Arial, sans-serif;
            background: #f5ead7;
            color: #2f3624;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          h1, h2, h3 {
            font-family: "Droid Serif", Georgia, serif;
            margin: 0 0 0.5rem;
          }
          .page {
            max-width: 980px;
            margin: 0 auto;
            padding: 32px 28px 40px;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1.5rem;
            padding: 20px 24px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid rgba(85, 107, 47, 0.15);
            margin-bottom: 20px;
          }
          .header img {
            width: 150px;
            height: auto;
            border-radius: 14px;
            box-shadow: 0 12px 30px -20px rgba(58, 58, 58, 0.45);
          }
          .header .meta {
            text-align: right;
          }
          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 999px;
            background: rgba(167, 199, 161, 0.35);
            color: #2f3624;
            font-size: 0.85rem;
            font-weight: 600;
          }
          .grid {
            display: grid;
            gap: 16px;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          }
          .card {
            background: rgba(255, 255, 255, 0.95);
            border: 1px solid rgba(85, 107, 47, 0.15);
            border-radius: 18px;
            padding: 16px 18px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 1rem;
            margin: 0.4rem 0;
          }
          .row span {
            color: rgba(47, 54, 36, 0.75);
            font-size: 0.95rem;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.95rem;
            margin-top: 0.75rem;
          }
          th, td {
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid rgba(85, 107, 47, 0.12);
          }
          th {
            background: rgba(167, 199, 161, 0.2);
            font-weight: 600;
          }
          .empty {
            text-align: center;
            color: rgba(47, 54, 36, 0.65);
            padding: 16px;
          }
          .notes {
            margin-top: 0.5rem;
            color: rgba(47, 54, 36, 0.75);
            white-space: pre-wrap;
          }
          .footer {
            margin-top: 24px;
            font-size: 0.85rem;
            color: rgba(47, 54, 36, 0.6);
            text-align: right;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <header class="header">
            <div>
              ${logoUrl ? `<img src="${logoUrl}" alt="Bethany Blooms" loading="lazy" decoding="async"/>` : ""}
            </div>
            <div class="meta">
              <h1>POS Cash Up</h1>
              <div class="badge">Completed</div>
              <div>${escapeHtml(cashupDate)}</div>
              <div>Saved ${escapeHtml(savedAtLabel)}</div>
              ${completedBy ? `<div>By ${escapeHtml(completedBy)}</div>` : ""}
            </div>
          </header>

          <section class="grid">
            <div class="card">
              <h2>Cash Summary</h2>
              <div class="row"><span>Opening float</span><strong>${escapeHtml(
                moneyFormatter.format(openingFloat),
              )}</strong></div>
              <div class="row"><span>Cash sales</span><strong>${escapeHtml(
                moneyFormatter.format(cashSales),
              )}</strong></div>
              <div class="row"><span>Expected cash</span><strong>${escapeHtml(
                moneyFormatter.format(expectedCash),
              )}</strong></div>
              <div class="row"><span>Cash counted</span><strong>${escapeHtml(
                moneyFormatter.format(cashCounted),
              )}</strong></div>
              <div class="row"><span>Variance</span><strong>${escapeHtml(
                moneyFormatter.format(variance),
              )}</strong></div>
            </div>
            <div class="card">
              <h2>Sales Summary</h2>
              <div class="row"><span>Total sales</span><strong>${escapeHtml(
                moneyFormatter.format(totalSales),
              )}</strong></div>
              <div class="row"><span>Card sales</span><strong>${escapeHtml(
                moneyFormatter.format(cardSales),
              )}</strong></div>
              <div class="row"><span>Discounts</span><strong>-${escapeHtml(
                moneyFormatter.format(discounts),
              )}</strong></div>
              <div class="row"><span>Transactions</span><strong>${escapeHtml(
                transactionCount,
              )}</strong></div>
            </div>
          </section>

          <section class="card">
            <h2>POS Sales</h2>
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Time</th>
                  <th>Payment</th>
                  <th>Items</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${salesRows}
              </tbody>
            </table>
          </section>

          ${notes ? `<section class="card"><h2>Notes</h2><div class="notes">${notes}</div></section>` : ""}

          <div class="footer">Generated by Bethany Blooms POS</div>
        </div>
      </body>
    </html>
  `;
};

const openPrintFrame = (html) => {
  if (typeof document === "undefined") return false;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
  return true;
};

function AdminPosCashUpPage() {
  usePageMetadata({
    title: "Admin - POS Cash Up",
    description: "Close out daily POS totals, cash balance, and variances.",
  });

  const { db, user, inventoryEnabled, inventoryLoading, inventoryError } = useAdminData();
  const { items: posSales } = useFirestoreCollection("posSales", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });
  const { items: posCashups } = useFirestoreCollection("posCashups", {
    orderByField: "createdAt",
    orderDirection: "desc",
  });

  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));
  const [openingFloat, setOpeningFloat] = useState("");
  const [cashCounted, setCashCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [editingCashupId, setEditingCashupId] = useState(null);
  const [useLatestCashup, setUseLatestCashup] = useState(true);

  const normalizedSales = useMemo(() => {
    return (posSales || []).map((sale) => {
      const createdAt = parseDateValue(sale.createdAt || sale.updatedAt);
      return {
        ...sale,
        createdAt,
        dateKey: createdAt ? toLocalDateKey(createdAt) : "",
      };
    });
  }, [posSales]);

  const normalizedCashups = useMemo(() => {
    return (posCashups || []).map((cashup) => {
      const createdAt = parseDateValue(cashup.createdAt || cashup.updatedAt);
      const updatedAt = parseDateValue(cashup.updatedAt || cashup.createdAt);
      const dateKey = cashup.date || (createdAt ? toLocalDateKey(createdAt) : "");
      return {
        ...cashup,
        createdAt,
        updatedAt,
        dateKey,
      };
    });
  }, [posCashups]);

  const salesForDay = useMemo(() => {
    return normalizedSales.filter((sale) => sale.dateKey === selectedDate);
  }, [normalizedSales, selectedDate]);

  const cashTotals = useMemo(() => {
    const cashSales = salesForDay.filter((sale) => sale.paymentMethod === "cash");
    const cardSales = salesForDay.filter((sale) => sale.paymentMethod === "card");
    const cashTotal = cashSales.reduce((sum, sale) => sum + parseNumber(sale.total, 0), 0);
    const cardTotal = cardSales.reduce((sum, sale) => sum + parseNumber(sale.total, 0), 0);
    const discountTotal = salesForDay.reduce((sum, sale) => {
      const discountAmount = parseNumber(sale.discount?.amount ?? 0, 0);
      return sum + discountAmount;
    }, 0);
    const total = cashTotal + cardTotal;
    return {
      cashTotal,
      cardTotal,
      discountTotal,
      total,
      count: salesForDay.length,
    };
  }, [salesForDay]);

  const cashSummary = useMemo(() => {
    const openingValue = parseNumber(openingFloat, 0);
    const countedValue = parseNumber(cashCounted, NaN);
    const expectedCash = openingValue + cashTotals.cashTotal;
    const variance = Number.isFinite(countedValue) ? countedValue - expectedCash : null;
    return {
      openingValue,
      countedValue,
      expectedCash,
      variance,
    };
  }, [cashCounted, cashTotals.cashTotal, openingFloat]);

  const cashupsForDay = useMemo(() => {
    return normalizedCashups
      .filter((cashup) => cashup.dateKey === selectedDate)
      .sort((a, b) => {
        const aTime = (a.updatedAt || a.createdAt)?.getTime?.() || 0;
        const bTime = (b.updatedAt || b.createdAt)?.getTime?.() || 0;
        return bTime - aTime;
      });
  }, [normalizedCashups, selectedDate]);

  const activeCashup = useMemo(() => {
    if (!cashupsForDay.length) return null;
    return cashupsForDay.find((cashup) => cashup.id === editingCashupId) || cashupsForDay[0];
  }, [cashupsForDay, editingCashupId]);

  useEffect(() => {
    if (!useLatestCashup) return;
    if (!selectedDate) return;
    if (!cashupsForDay.length) {
      setEditingCashupId(null);
      setOpeningFloat("");
      setCashCounted("");
      setNotes("");
      return;
    }
    const cashup = cashupsForDay[0];
    setEditingCashupId(cashup?.id || null);
    setOpeningFloat(
      cashup?.openingFloat === undefined || cashup?.openingFloat === null
        ? ""
        : String(cashup.openingFloat),
    );
    setCashCounted(
      cashup?.cashCounted === undefined || cashup?.cashCounted === null
        ? ""
        : String(cashup.cashCounted),
    );
    setNotes(cashup?.notes || "");
  }, [cashupsForDay, selectedDate, useLatestCashup]);

  const handleStartNewCashup = () => {
    setUseLatestCashup(false);
    setEditingCashupId(null);
    setOpeningFloat("");
    setCashCounted("");
    setNotes("");
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleDateChange = (event) => {
    setSelectedDate(event.target.value);
    setUseLatestCashup(true);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleEditCashup = (cashup) => {
    if (!cashup) return;
    setUseLatestCashup(false);
    setSelectedDate(cashup.dateKey || cashup.date || selectedDate);
    setEditingCashupId(cashup.id || null);
    setOpeningFloat(
      cashup.openingFloat === undefined || cashup.openingFloat === null
        ? ""
        : String(cashup.openingFloat),
    );
    setCashCounted(
      cashup.cashCounted === undefined || cashup.cashCounted === null
        ? ""
        : String(cashup.cashCounted),
    );
    setNotes(cashup.notes || "");
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleDownloadPdf = (cashup) => {
    if (!cashup) return;
    const logoUrl = logo ? new URL(logo, window.location.href).toString() : "";
    const salesForCashup = normalizedSales.filter(
      (sale) => sale.dateKey === (cashup.dateKey || cashup.date),
    );
    const reportHtml = buildCashupReportHtml({
      cashup,
      sales: salesForCashup,
      logoUrl,
    });
    const frameOpened = openPrintFrame(reportHtml);
    if (!frameOpened) {
      setErrorMessage("Unable to open the PDF preview. Please try again.");
    }
  };

  const handleSaveCashup = async (event) => {
    event.preventDefault();
    if (!db || !inventoryEnabled) {
      setErrorMessage("You do not have permission to save cash-ups.");
      return;
    }

    const countedValue = parseNumber(cashCounted, NaN);
    if (!selectedDate) {
      setErrorMessage("Please select a date.");
      return;
    }
    if (!Number.isFinite(countedValue)) {
      setErrorMessage("Enter the cash counted in the till.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const payload = {
        date: selectedDate,
        openingFloat: parseNumber(openingFloat, 0),
        cashCounted: countedValue,
        expectedCash: cashSummary.expectedCash,
        variance: cashSummary.variance ?? 0,
        totals: {
          cash: cashTotals.cashTotal,
          card: cashTotals.cardTotal,
          discounts: cashTotals.discountTotal,
          total: cashTotals.total,
          count: cashTotals.count,
        },
        notes: notes.trim(),
        status: "completed",
        updatedAt: serverTimestamp(),
        updatedBy: {
          uid: user?.uid || null,
          email: user?.email || null,
        },
      };

      if (editingCashupId) {
        await updateDoc(doc(db, "posCashups", editingCashupId), payload);
        setStatusMessage("Cash-up updated.");
      } else {
        const docRef = await addDoc(collection(db, "posCashups"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: {
            uid: user?.uid || null,
            email: user?.email || null,
          },
        });
        setEditingCashupId(docRef.id);
        setStatusMessage("Cash-up saved.");
      }
      setUseLatestCashup(true);
    } catch (error) {
      setErrorMessage(error.message || "Unable to save cash-up.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-panel">
      <header className="admin-panel__header cashup-header">
        <div>
          <h2>POS Cash Up</h2>
          <p className="modal__meta">Review the day's POS totals and confirm the cash balance.</p>
        </div>
        <div className="cashup-header__status">
          <span className={`badge ${cashupsForDay.length ? "badge--success" : "badge--muted"}`}>
            {cashupsForDay.length ? "Completed" : "Not completed"}
          </span>
          <span className="modal__meta">
            {cashupsForDay.length ? `Last saved ${formatDateTime(activeCashup?.updatedAt || activeCashup?.createdAt)}` : "Save a cash-up to complete the day."}
          </span>
        </div>
      </header>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}

      <div className="admin-panel__content cashup-grid">
        <div className="cashup-card">
          <h3>Day Summary</h3>
          <label className="modal__meta cashup-field">
            Cash-up date
            <input
              className="input"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
            />
          </label>
          {inventoryLoading ? (
            <p className="modal__meta">Loading POS sales...</p>
          ) : (
            <div className="cashup-stats">
              <div>
                <span>Cash sales</span>
                <strong>{moneyFormatter.format(cashTotals.cashTotal)}</strong>
              </div>
              <div>
                <span>Card sales</span>
                <strong>{moneyFormatter.format(cashTotals.cardTotal)}</strong>
              </div>
              <div>
                <span>Discounts</span>
                <strong>-{moneyFormatter.format(cashTotals.discountTotal)}</strong>
              </div>
              <div>
                <span>Total sales</span>
                <strong>{moneyFormatter.format(cashTotals.total)}</strong>
              </div>
              <div>
                <span>Transactions</span>
                <strong>{cashTotals.count}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="cashup-card">
          <h3>Cash Balance</h3>
          {editingCashupId ? (
            <p className="modal__meta">
              Editing cash-up saved {formatDateTime(activeCashup?.updatedAt || activeCashup?.createdAt)}.
            </p>
          ) : (
            <p className="modal__meta">Save a cash-up to mark the day as completed.</p>
          )}
          <form className="admin-form" onSubmit={handleSaveCashup}>
            <label className="modal__meta">
              Opening float
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={openingFloat}
                onChange={(event) => setOpeningFloat(event.target.value)}
              />
            </label>
            <label className="modal__meta">
              Cash counted
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={cashCounted}
                onChange={(event) => setCashCounted(event.target.value)}
                required
              />
            </label>
            <div className="cashup-variance">
              <div>
                <span>Expected cash</span>
                <strong>{moneyFormatter.format(cashSummary.expectedCash)}</strong>
              </div>
              <div>
                <span>Variance</span>
                <strong>
                  {cashSummary.variance === null
                    ? "-"
                    : moneyFormatter.format(cashSummary.variance)}
                </strong>
              </div>
            </div>
            <label className="modal__meta">
              Notes
              <textarea
                className="input"
                rows="3"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            {errorMessage && <p className="admin-panel__error">{errorMessage}</p>}
            {statusMessage && <p className="admin-panel__status">{statusMessage}</p>}
            <div className="admin-form__actions">
              {editingCashupId && (
                <button className="btn btn--secondary" type="button" onClick={handleStartNewCashup}>
                  New cash up
                </button>
              )}
              <button className="btn btn--primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : editingCashupId ? "Update cash up" : "Save cash up"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="admin-panel__content cashup-grid">
        <div className="cashup-card cashup-card--wide">
          <h3>POS Sales ({selectedDate})</h3>
          {salesForDay.length === 0 ? (
            <p className="modal__meta">No POS sales recorded for this date.</p>
          ) : (
            <div className="admin-table__wrapper">
              <table className="admin-table admin-table--compact">
                <thead>
                  <tr>
                    <th scope="col">Receipt</th>
                    <th scope="col">Time</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesForDay.map((sale) => (
                    <tr key={sale.id || sale.receiptNumber}>
                      <td>{sale.receiptNumber || sale.id}</td>
                      <td>{sale.createdAt ? sale.createdAt.toLocaleTimeString("en-ZA") : "-"}</td>
                      <td>{sale.paymentMethod || "-"}</td>
                      <td>{moneyFormatter.format(parseNumber(sale.total, 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="cashup-card cashup-card--wide">
          <h3>Saved Cash-Ups</h3>
          {cashupsForDay.length === 0 ? (
            <p className="modal__meta">No cash-ups saved for this date.</p>
          ) : (
            <>
              <div className="cashup-cards">
                {cashupsForDay.map((cashup) => {
                  const savedAt = cashup.updatedAt || cashup.createdAt;
                  const expectedCash = getCashupExpected(cashup);
                  const variance = getCashupVariance(cashup);
                  const totalSales = parseNumber(cashup.totals?.total, 0);
                  return (
                    <article
                      key={cashup.id}
                      className={`cashup-card-item ${cashup.id === editingCashupId ? "is-active" : ""}`}
                    >
                      <div className="cashup-card-item__header">
                        <div>
                          <h4>{formatDateLabel(cashup.dateKey || cashup.date)}</h4>
                          <p className="modal__meta">
                            Saved {savedAt ? savedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "-"}
                          </p>
                        </div>
                        <span className="badge badge--success">Completed</span>
                      </div>
                      <div className="cashup-card-item__grid">
                        <div>
                          <span>Expected</span>
                          <strong>{moneyFormatter.format(expectedCash)}</strong>
                        </div>
                        <div>
                          <span>Counted</span>
                          <strong>{moneyFormatter.format(parseNumber(cashup.cashCounted, 0))}</strong>
                        </div>
                        <div>
                          <span>Variance</span>
                          <strong>{moneyFormatter.format(variance)}</strong>
                        </div>
                        <div>
                          <span>Total sales</span>
                          <strong>{moneyFormatter.format(totalSales)}</strong>
                        </div>
                      </div>
                      <div className="cashup-card-item__actions">
                        <button className="btn btn--secondary" type="button" onClick={() => handleEditCashup(cashup)}>
                          Edit
                        </button>
                        <button className="btn btn--primary" type="button" onClick={() => handleDownloadPdf(cashup)}>
                          Download PDF
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="admin-table__wrapper cashup-table">
                <table className="admin-table admin-table--compact">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Saved</th>
                      <th scope="col">Expected</th>
                      <th scope="col">Counted</th>
                      <th scope="col">Variance</th>
                      <th scope="col">Total sales</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashupsForDay.map((cashup) => {
                      const savedAt = cashup.updatedAt || cashup.createdAt;
                      const expectedCash = getCashupExpected(cashup);
                      const variance = getCashupVariance(cashup);
                      const totalSales = parseNumber(cashup.totals?.total, 0);
                      return (
                        <tr key={cashup.id} className={cashup.id === editingCashupId ? "is-active" : ""}>
                          <td>{formatDateLabel(cashup.dateKey || cashup.date)}</td>
                          <td>{savedAt ? savedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                          <td>{moneyFormatter.format(expectedCash)}</td>
                          <td>{moneyFormatter.format(parseNumber(cashup.cashCounted, 0))}</td>
                          <td>{moneyFormatter.format(variance)}</td>
                          <td>{moneyFormatter.format(totalSales)}</td>
                          <td>
                            <span className="badge badge--success">Completed</span>
                          </td>
                          <td className="admin-table__actions cashup-actions">
                            <button className="btn btn--secondary" type="button" onClick={() => handleEditCashup(cashup)}>
                              Edit
                            </button>
                            <button className="btn btn--primary" type="button" onClick={() => handleDownloadPdf(cashup)}>
                              Download PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPosCashUpPage;
