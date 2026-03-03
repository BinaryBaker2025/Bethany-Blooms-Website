import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import PosVoidDialog from "../../components/admin/PosVoidDialog.jsx";
import { useAdminData } from "../../context/AdminDataContext.jsx";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection.js";
import { usePageMetadata } from "../../hooks/usePageMetadata.js";
import { getFirebaseFunctions } from "../../lib/firebase.js";
import {
  formatPosSaleStatusLabel,
  getPosSaleDateKey,
  getPosSaleNetDiscountAmount,
  getPosSaleNetTotal,
  getPosSaleStatusBadgeClass,
  normalizePosSaleStatus,
  parsePosDateValue,
} from "../../lib/posSales.js";
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

const formatSaleTime = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const normalizeSalePaymentMethod = (value = "") => {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "cash") return "cash";
  if (normalized === "card") return "card";
  if (normalized === "gift-card") return "gift-card";
  return normalized || "unknown";
};

const getCashupStatus = (cashup = null) => {
  const status = (cashup?.status || "").toString().trim().toLowerCase();
  if (cashup?.reviewRequired || status === "review-needed") return "review-needed";
  if (status === "completed") return "completed";
  return "draft";
};

const buildCashupLiveTotals = (sales = []) => {
  const normalizedSales = (Array.isArray(sales) ? sales : []).map((sale) => ({
    status: normalizePosSaleStatus(sale?.status),
    paymentMethod: normalizeSalePaymentMethod(sale?.paymentMethod),
    netTotal: parseNumber(getPosSaleNetTotal(sale), 0),
    netDiscountAmount: parseNumber(getPosSaleNetDiscountAmount(sale), 0),
    voidedTotal: parseNumber(sale?.voidSummary?.voidedTotal, 0),
  }));
  const activeSales = normalizedSales.filter((sale) => sale.status !== "voided");
  return {
    cashTotal: activeSales
      .filter((sale) => sale.paymentMethod === "cash")
      .reduce((sum, sale) => sum + sale.netTotal, 0),
    cardTotal: activeSales
      .filter((sale) => sale.paymentMethod === "card")
      .reduce((sum, sale) => sum + sale.netTotal, 0),
    discountTotal: normalizedSales.reduce((sum, sale) => sum + sale.netDiscountAmount, 0),
    total: activeSales.reduce((sum, sale) => sum + sale.netTotal, 0),
    count: activeSales.length,
    voidedCount: normalizedSales.filter((sale) => sale.voidedTotal > 0).length,
    voidedTotal: normalizedSales.reduce((sum, sale) => sum + sale.voidedTotal, 0),
  };
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

const formatSaleItemLine = (item) => {
  if (!item || typeof item !== "object") return "";
  const quantity = Math.max(1, parseNumber(item.quantity, 1));
  const name = (item.name || "").toString().trim() || "Item";
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : null;
  const variantLabel = (metadata?.variantLabel || "").toString().trim();
  const optionLabel = (metadata?.optionLabel || "").toString().trim();
  const sessionLabel = (metadata?.sessionLabel || "").toString().trim();
  const detailParts = [];
  if (variantLabel) detailParts.push(`Variant: ${variantLabel}`);
  if (optionLabel) detailParts.push(`Option: ${optionLabel}`);
  if (sessionLabel) detailParts.push(`Session: ${sessionLabel}`);
  const detailSuffix = detailParts.length ? ` (${detailParts.join(", ")})` : "";
  return `${quantity} x ${name}${detailSuffix}`;
};

const getSaleItemLines = (sale) => {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const lines = items.map((item) => formatSaleItemLine(item)).filter(Boolean);
  return lines.length > 0 ? lines : ["-"];
};

const getSaleItemsDisplayText = (sale) => {
  return getSaleItemLines(sale).join("\n");
};

const loadImageAsDataUrl = async (imageUrl) => {
  if (!imageUrl || typeof window === "undefined") return "";
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === "string" ? reader.result : "");
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
};

const drawSummaryCard = ({ doc, x, y, width, title, rows }) => {
  const rowHeight = 16;
  const cardHeight = 34 + rows.length * rowHeight + 10;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(209, 191, 167);
  doc.roundedRect(x, y, width, cardHeight, 10, 10, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(47, 54, 36);
  doc.text(title, x + 12, y + 20);
  let rowY = y + 38;
  rows.forEach((row) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(95, 102, 89);
    doc.text(row.label, x + 12, rowY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(47, 54, 36);
    doc.text(row.value, x + width - 12, rowY, { align: "right" });
    rowY += rowHeight;
  });
  return y + cardHeight;
};

const downloadCashupPdf = async ({ cashup, sales, logoUrl }) => {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 34;
  const topMargin = 32;
  const contentWidth = pageWidth - marginX * 2;

  const totals =
    cashup?.reviewRequired && cashup?.reviewCurrentTotals
      ? cashup.reviewCurrentTotals
      : cashup?.totals || {};
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
  const completedBy = (cashup?.updatedBy?.email || cashup?.createdBy?.email || "").toString().trim();
  const notes = (cashup?.notes || "").toString().trim();
  const logoDataUrl = await loadImageAsDataUrl(logoUrl);

  let cursorY = topMargin;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(209, 191, 167);
  doc.roundedRect(marginX, cursorY, contentWidth, 94, 12, 12, "FD");
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", marginX + 14, cursorY + 16, 118, 36, undefined, "FAST");
    } catch {
      // Ignore image rendering issues and continue with text header only.
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(47, 54, 36);
  doc.text("POS Cash Up", pageWidth - marginX - 12, cursorY + 24, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(73, 78, 65);
  doc.text(getCashupStatus(cashup) === "review-needed" ? "Review needed" : "Completed", pageWidth - marginX - 12, cursorY + 42, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(cashupDate, pageWidth - marginX - 12, cursorY + 58, { align: "right" });
  doc.text(`Saved ${savedAtLabel}`, pageWidth - marginX - 12, cursorY + 72, { align: "right" });
  if (completedBy) {
    doc.text(`By ${completedBy}`, pageWidth - marginX - 12, cursorY + 86, { align: "right" });
  }
  cursorY += 112;

  const summaryGap = 14;
  const summaryCardWidth = (contentWidth - summaryGap) / 2;
  const cashSummaryBottom = drawSummaryCard({
    doc,
    x: marginX,
    y: cursorY,
    width: summaryCardWidth,
    title: "Cash Summary",
    rows: [
      { label: "Opening float", value: moneyFormatter.format(openingFloat) },
      { label: "Cash sales", value: moneyFormatter.format(cashSales) },
      { label: "Expected cash", value: moneyFormatter.format(expectedCash) },
      { label: "Cash counted", value: moneyFormatter.format(cashCounted) },
      { label: "Variance", value: moneyFormatter.format(variance) },
    ],
  });
  const salesSummaryBottom = drawSummaryCard({
    doc,
    x: marginX + summaryCardWidth + summaryGap,
    y: cursorY,
    width: summaryCardWidth,
    title: "Sales Summary",
    rows: [
      { label: "Total sales", value: moneyFormatter.format(totalSales) },
      { label: "Card sales", value: moneyFormatter.format(cardSales) },
      { label: "Discounts", value: `-${moneyFormatter.format(discounts)}` },
      { label: "Transactions", value: `${transactionCount}` },
    ],
  });
  cursorY = Math.max(cashSummaryBottom, salesSummaryBottom) + 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(47, 54, 36);
  doc.text("POS Sales", marginX, cursorY);
  const salesTableBody = sales.length
    ? sales.map((sale) => [
        (sale.receiptNumber || sale.id || "-").toString(),
        formatSaleTime(sale.createdAt),
        formatPosSaleStatusLabel(sale.status),
        (sale.paymentMethod || "-").toString(),
        getSaleItemsDisplayText(sale),
        moneyFormatter.format(getPosSaleNetTotal(sale)),
      ])
    : [[
        {
          content: "No POS sales recorded for this date.",
          colSpan: 6,
          styles: {
            halign: "center",
            textColor: [98, 103, 90],
            fontStyle: "italic",
          },
        },
      ]];

  autoTable(doc, {
    startY: cursorY + 8,
    margin: { left: marginX, right: marginX },
    head: [["Receipt", "Time", "Status", "Payment", "Items", "Total"]],
    body: salesTableBody,
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 6,
      valign: "top",
      lineColor: [229, 220, 204],
      lineWidth: 0.6,
      overflow: "linebreak",
      textColor: [47, 54, 36],
    },
    headStyles: {
      fillColor: [225, 232, 221],
      textColor: [47, 54, 36],
      fontStyle: "bold",
      lineColor: [209, 191, 167],
      lineWidth: 0.8,
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 62 },
      2: { cellWidth: 76 },
      3: { cellWidth: 62 },
      4: { cellWidth: 175 },
      5: { cellWidth: 80, halign: "right" },
    },
  });
  cursorY = (doc.lastAutoTable?.finalY || cursorY) + 14;

  if (notes) {
    const noteLines = doc.splitTextToSize(notes, contentWidth - 24);
    const noteHeight = Math.max(72, 40 + noteLines.length * 11);
    if (cursorY + noteHeight > pageHeight - 52) {
      doc.addPage();
      cursorY = topMargin;
    }
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(209, 191, 167);
    doc.roundedRect(marginX, cursorY, contentWidth, noteHeight, 10, 10, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(47, 54, 36);
    doc.text("Notes", marginX + 12, cursorY + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(73, 78, 65);
    doc.text(noteLines, marginX + 12, cursorY + 40);
  }

  const generatedAtLabel = new Date().toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(114, 120, 105);
  doc.text(`Generated ${generatedAtLabel} by Bethany Blooms POS`, pageWidth - marginX, pageHeight - 20, {
    align: "right",
  });

  const filenameDate = (cashup?.dateKey || cashup?.date || toLocalDateKey(new Date())).toString();
  doc.save(`cash-up-${filenameDate}.pdf`);
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
  const [downloadingCashupId, setDownloadingCashupId] = useState(null);
  const [voidSaleTarget, setVoidSaleTarget] = useState(null);

  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const normalizedSales = useMemo(() => {
    return (posSales || []).map((sale) => {
      const createdAt = parsePosDateValue(sale.createdAt || sale.updatedAt);
      return {
        ...sale,
        createdAt,
        dateKey: getPosSaleDateKey(sale) || (createdAt ? toLocalDateKey(createdAt) : ""),
        status: normalizePosSaleStatus(sale.status),
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
    return buildCashupLiveTotals(salesForDay);
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

  const activeCashupStatus = getCashupStatus(activeCashup);
  const activeCashupReviewTotals =
    activeCashup?.reviewCurrentTotals && typeof activeCashup.reviewCurrentTotals === "object"
      ? activeCashup.reviewCurrentTotals
      : null;

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

  const handleDownloadPdf = async (cashup) => {
    if (!cashup || downloadingCashupId) return;
    const cashupId = cashup.id || `${cashup.dateKey || cashup.date || "cashup"}`;
    setErrorMessage(null);
    setDownloadingCashupId(cashupId);
    try {
      const logoUrl = logo ? new URL(logo, window.location.href).toString() : "";
      const salesForCashup = normalizedSales.filter(
        (sale) => sale.dateKey === (cashup.dateKey || cashup.date),
      );
      await downloadCashupPdf({
        cashup,
        sales: salesForCashup,
        logoUrl,
      });
    } catch (error) {
      setErrorMessage(error?.message || "Unable to generate the cash-up PDF. Please try again.");
    } finally {
      setDownloadingCashupId(null);
    }
  };

  const handleVoidCompleted = (result) => {
    setVoidSaleTarget(null);
    setErrorMessage(null);
    setStatusMessage(
      result?.reviewTriggered
        ? "Sale voided. The related cash-up now needs review."
        : "Sale voided successfully.",
    );
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
        dateKey: selectedDate,
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
          voidedCount: cashTotals.voidedCount,
          voidedTotal: cashTotals.voidedTotal,
        },
        notes: notes.trim(),
        status: "completed",
        reviewRequired: false,
        reviewReason: null,
        reviewTriggeredAt: null,
        reviewTriggeredByVoidId: null,
        reviewTriggeredByUid: null,
        reviewTriggeredByEmail: null,
        reviewCurrentTotals: null,
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
          <span
            className={`badge ${
              activeCashupStatus === "review-needed"
                ? "badge--stock-pending"
                : cashupsForDay.length
                  ? "badge--success"
                  : "badge--muted"
            }`}
          >
            {activeCashupStatus === "review-needed"
              ? "Review needed"
              : cashupsForDay.length
                ? "Completed"
                : "Not completed"}
          </span>
          <span className="modal__meta">
            {cashupsForDay.length ? `Last saved ${formatDateTime(activeCashup?.updatedAt || activeCashup?.createdAt)}` : "Save a cash-up to complete the day."}
          </span>
        </div>
      </header>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
      {activeCashupStatus === "review-needed" && (
        <div className="cashup-review-banner">
          <div>
            <strong>This cash-up needs review.</strong>
            <p className="modal__meta">
              A receipt was voided after this cash-up was saved. Review the live totals below and save again to clear the flag.
            </p>
          </div>
          {activeCashupReviewTotals && (
            <div className="cashup-review-banner__stats">
              <span>Saved total {moneyFormatter.format(parseNumber(activeCashup?.totals?.total, 0))}</span>
              <span>Current total {moneyFormatter.format(parseNumber(activeCashupReviewTotals.total, 0))}</span>
              <span>Voided {moneyFormatter.format(parseNumber(activeCashupReviewTotals.voidedTotal, 0))}</span>
            </div>
          )}
        </div>
      )}

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
              <div>
                <span>Voided receipts</span>
                <strong>{cashTotals.voidedCount}</strong>
              </div>
              <div>
                <span>Voided amount</span>
                <strong>{moneyFormatter.format(cashTotals.voidedTotal)}</strong>
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
              <table className="admin-table admin-table--compact cashup-pos-sales-table">
                <thead>
                  <tr>
                    <th scope="col">Receipt</th>
                    <th scope="col">Time</th>
                    <th scope="col">Status</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Items</th>
                    <th scope="col">Total</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {salesForDay.map((sale) => {
                    const itemLines = getSaleItemLines(sale);
                    return (
                      <tr key={sale.id || sale.receiptNumber}>
                        <td data-label="Receipt">{sale.receiptNumber || sale.id}</td>
                        <td data-label="Time">{formatSaleTime(sale.createdAt)}</td>
                        <td data-label="Status">
                          <span className={`badge ${getPosSaleStatusBadgeClass(sale.status)}`}>
                            {formatPosSaleStatusLabel(sale.status)}
                          </span>
                        </td>
                        <td data-label="Payment">{sale.paymentMethod || "-"}</td>
                        <td data-label="Items">
                          <div className="cashup-sales-items">
                            {itemLines.map((line, index) => (
                              <span
                                key={`${sale.id || sale.receiptNumber || "sale"}-line-${index}`}
                                className="cashup-sales-items__line"
                              >
                                {line}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td data-label="Total">{moneyFormatter.format(getPosSaleNetTotal(sale))}</td>
                        <td className="admin-table__actions cashup-actions" data-label="Actions">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            onClick={() => setVoidSaleTarget(sale)}
                            disabled={!functionsInstance}
                          >
                            Void / Correct
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
                  const cardSales = parseNumber(cashup.totals?.card, 0);
                  const totalSales = parseNumber(cashup.totals?.total, 0);
                  const currentTotals =
                    cashup.reviewCurrentTotals && typeof cashup.reviewCurrentTotals === "object"
                      ? cashup.reviewCurrentTotals
                      : null;
                  const cashupStatus = getCashupStatus(cashup);
                  const isDownloadingPdf = downloadingCashupId === cashup.id;
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
                        <span className={`badge ${cashupStatus === "review-needed" ? "badge--stock-pending" : "badge--success"}`}>
                          {cashupStatus === "review-needed" ? "Review needed" : "Completed"}
                        </span>
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
                          <span>Card sales</span>
                          <strong>{moneyFormatter.format(cardSales)}</strong>
                        </div>
                        <div>
                          <span>Total sales</span>
                          <strong>{moneyFormatter.format(totalSales)}</strong>
                        </div>
                      </div>
                      {currentTotals && cashupStatus === "review-needed" && (
                        <div className="cashup-review-grid">
                          <div>
                            <span>Current cash</span>
                            <strong>{moneyFormatter.format(parseNumber(currentTotals.cash, 0))}</strong>
                          </div>
                          <div>
                            <span>Current card</span>
                            <strong>{moneyFormatter.format(parseNumber(currentTotals.card, 0))}</strong>
                          </div>
                          <div>
                            <span>Current total</span>
                            <strong>{moneyFormatter.format(parseNumber(currentTotals.total, 0))}</strong>
                          </div>
                          <div>
                            <span>Current count</span>
                            <strong>{parseNumber(currentTotals.count, 0)}</strong>
                          </div>
                          <div>
                            <span>Voided receipts</span>
                            <strong>{parseNumber(currentTotals.voidedCount, 0)}</strong>
                          </div>
                          <div>
                            <span>Voided amount</span>
                            <strong>{moneyFormatter.format(parseNumber(currentTotals.voidedTotal, 0))}</strong>
                          </div>
                        </div>
                      )}
                      <div className="cashup-card-item__actions">
                        <button className="btn btn--secondary" type="button" onClick={() => handleEditCashup(cashup)}>
                          Edit
                        </button>
                        <button
                          className="btn btn--primary"
                          type="button"
                          onClick={() => handleDownloadPdf(cashup)}
                          disabled={Boolean(downloadingCashupId)}
                        >
                          {isDownloadingPdf ? "Generating..." : "Download PDF"}
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
                      <th scope="col">Card sales</th>
                      <th scope="col">Total sales</th>
                      <th scope="col">Status</th>
                      <th scope="col">Current total</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashupsForDay.map((cashup) => {
                      const savedAt = cashup.updatedAt || cashup.createdAt;
                      const expectedCash = getCashupExpected(cashup);
                      const variance = getCashupVariance(cashup);
                      const cardSales = parseNumber(cashup.totals?.card, 0);
                      const totalSales = parseNumber(cashup.totals?.total, 0);
                      const currentTotals =
                        cashup.reviewCurrentTotals && typeof cashup.reviewCurrentTotals === "object"
                          ? cashup.reviewCurrentTotals
                          : null;
                      const cashupStatus = getCashupStatus(cashup);
                      const isDownloadingPdf = downloadingCashupId === cashup.id;
                      return (
                        <tr key={cashup.id} className={cashup.id === editingCashupId ? "is-active" : ""}>
                          <td data-label="Date">{formatDateLabel(cashup.dateKey || cashup.date)}</td>
                          <td data-label="Saved">
                            {savedAt ? savedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "-"}
                          </td>
                          <td data-label="Expected">{moneyFormatter.format(expectedCash)}</td>
                          <td data-label="Counted">{moneyFormatter.format(parseNumber(cashup.cashCounted, 0))}</td>
                          <td data-label="Variance">{moneyFormatter.format(variance)}</td>
                          <td data-label="Card sales">{moneyFormatter.format(cardSales)}</td>
                          <td data-label="Total sales">{moneyFormatter.format(totalSales)}</td>
                          <td data-label="Status">
                            <span className={`badge ${cashupStatus === "review-needed" ? "badge--stock-pending" : "badge--success"}`}>
                              {cashupStatus === "review-needed" ? "Review needed" : "Completed"}
                            </span>
                          </td>
                          <td data-label="Current total">
                            {currentTotals
                              ? moneyFormatter.format(parseNumber(currentTotals.total, 0))
                              : "-"}
                          </td>
                          <td className="admin-table__actions cashup-actions" data-label="Actions">
                            <button className="btn btn--secondary" type="button" onClick={() => handleEditCashup(cashup)}>
                              Edit
                            </button>
                            <button
                              className="btn btn--primary"
                              type="button"
                              onClick={() => handleDownloadPdf(cashup)}
                              disabled={Boolean(downloadingCashupId)}
                            >
                              {isDownloadingPdf ? "Generating..." : "Download PDF"}
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

      <PosVoidDialog
        open={Boolean(voidSaleTarget)}
        sale={voidSaleTarget}
        functionsInstance={functionsInstance}
        onClose={() => setVoidSaleTarget(null)}
        onVoided={handleVoidCompleted}
      />
    </div>
  );
}

export default AdminPosCashUpPage;
