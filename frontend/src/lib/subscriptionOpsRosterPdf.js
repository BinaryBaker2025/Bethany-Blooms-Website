const buildSubscriptionOpsRosterPdfDocument = async ({
  title = "Subscription Delivery Roster",
  cycleLabel = "",
  cycleMonth = "",
  scopeLabel = "",
  scopeKey = "",
  rowCount = 0,
  rows = [],
  contextLabel = "",
  contextValue = "",
} = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No subscription rows are available for PDF export.");
  }

  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const generatedAtLabel = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const marginX = 34;
  const topMargin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const hasContextLine = Boolean((contextLabel || "").toString().trim() && (contextValue || "").toString().trim());

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(47, 54, 36);
  doc.text(title || "Subscription Delivery Roster", marginX, topMargin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(95, 102, 89);
  doc.text(`Cycle: ${cycleLabel || cycleMonth || "-"}`, marginX, topMargin + 18);
  doc.text(`Scope: ${scopeLabel || "-"}`, marginX, topMargin + 34);
  doc.text(`Customers: ${rowCount}`, marginX + 210, hasContextLine ? topMargin + 50 : topMargin + 34);
  if (hasContextLine) {
    doc.text(`${contextLabel}: ${contextValue}`, marginX, topMargin + 50);
  }
  doc.text(`Generated: ${generatedAtLabel}`, pageWidth - marginX, topMargin + 18, {
    align: "right",
  });

  autoTable(doc, {
    startY: topMargin + (hasContextLine ? 68 : 52),
    margin: { left: marginX, right: marginX, bottom: 34 },
    head: [[
      "Customer",
      "Phone",
      "Delivery address",
      "Delivery date",
      "Plan",
      "Cycle invoice",
      "Status",
    ]],
    body: rows.map((row) => [
      row.customer || "-",
      row.phone || "-",
      row.delivery || "-",
      row.nextDelivery || "-",
      row.plan || "-",
      row.cycleInvoice || "-",
      row.status || "-",
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 6,
      valign: "top",
      overflow: "linebreak",
      lineColor: [229, 220, 204],
      lineWidth: 0.6,
      textColor: [47, 54, 36],
    },
    headStyles: {
      fillColor: [225, 232, 221],
      textColor: [47, 54, 36],
      fontStyle: "bold",
      lineColor: [209, 191, 167],
      lineWidth: 0.8,
      halign: "left",
      valign: "middle",
    },
    bodyStyles: {
      minCellHeight: 26,
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.16 },
      1: { cellWidth: contentWidth * 0.12, fontStyle: "bold" },
      2: { cellWidth: contentWidth * 0.2 },
      3: { cellWidth: contentWidth * 0.14, fontStyle: "bold" },
      4: { cellWidth: contentWidth * 0.14 },
      5: { cellWidth: contentWidth * 0.12 },
      6: { cellWidth: contentWidth * 0.12 },
    },
    theme: "grid",
    rowPageBreak: "avoid",
    didParseCell: (hookData) => {
      if (hookData.section !== "body") return;
      if (hookData.column.index === 0) {
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = [47, 54, 36];
      }
      if (hookData.column.index === 1) {
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = [85, 107, 47];
      }
      if (hookData.column.index === 2) {
        hookData.cell.styles.textColor = [72, 68, 58];
      }
      if (hookData.column.index === 3) {
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = [85, 107, 47];
      }
    },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(114, 120, 105);
      doc.text(
        `Generated ${generatedAtLabel}`,
        marginX,
        pageHeight - 14,
      );
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(114, 120, 105);
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - marginX, pageHeight - 14, {
      align: "right",
    });
  }

  const safeScope = (scopeKey || scopeLabel || "all-cycle")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const safeCycleMonth = (cycleMonth || "cycle").toString().trim() || "cycle";
  const filename = `subscription-roster-${safeScope || "all-cycle"}-${safeCycleMonth}.pdf`;

  return { doc, filename };
};

export async function downloadSubscriptionOpsRosterPdf(options = {}) {
  const { doc, filename } = await buildSubscriptionOpsRosterPdfDocument(options);
  doc.save(filename);
}

export async function printSubscriptionOpsRosterPdf(options = {}) {
  const { doc } = await buildSubscriptionOpsRosterPdfDocument(options);
  doc.autoPrint();

  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const printWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl);
    throw new Error("Allow pop-ups to print the subscription roster.");
  }
  printWindow.focus();
  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60000);
}
