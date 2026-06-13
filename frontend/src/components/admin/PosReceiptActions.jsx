function PosReceiptActions({
  receiptData,
  formatCurrency,
  emailReceiptRequested,
  onPrint,
  onNewSale,
  printerStatus = "disconnected",
  onConnectPrinter,
}) {
  const isConnected = printerStatus === "connected";
  const isPrinting = printerStatus === "printing";

  const statusDot = {
    connected: { color: "#4caf50", label: "Printer connected" },
    printing: { color: "#ff9800", label: "Printing…" },
    error: { color: "#f44336", label: "Printer error" },
    disconnected: { color: "#bbb", label: "No printer connected" },
  }[printerStatus] ?? { color: "#bbb", label: "Unknown" };

  return (
    <section className="pos-wizard__card pos-success-card">
      <div className="pos-success-card__eyebrow">Sale completed</div>
      <h3>Receipt {receiptData.receiptNumber}</h3>
      <p className="modal__meta">
        Processed on {receiptData.createdAt.toLocaleString("en-ZA")}
      </p>
      <div className="pos-success-card__stats">
        <div>
          <span>Total</span>
          <strong>{formatCurrency(receiptData.total)}</strong>
        </div>
        <div>
          <span>Payment</span>
          <strong style={{ textTransform: "capitalize" }}>{receiptData.paymentMethod}</strong>
        </div>
      </div>
      {emailReceiptRequested && receiptData.customer.email && (
        <p className="modal__meta">
          A receipt was requested for {receiptData.customer.email}.
        </p>
      )}

      {/* Printer status row */}
      <div className="pos-printer-status">
        <span
          className="pos-printer-status__dot"
          style={{ background: statusDot.color }}
          aria-hidden="true"
        />
        <span className="pos-printer-status__label">{statusDot.label}</span>
        {!isConnected && !isPrinting && (
          <button
            className="pos-printer-status__connect"
            type="button"
            onClick={onConnectPrinter}
          >
            Connect
          </button>
        )}
        {isConnected && (
          <button
            className="pos-printer-status__connect"
            type="button"
            onClick={onConnectPrinter}
          >
            Change
          </button>
        )}
      </div>

      <div className="pos-success-card__actions">
        <button
          className="btn btn--secondary"
          type="button"
          onClick={onPrint}
          disabled={isPrinting}
        >
          {isPrinting
            ? "Printing…"
            : isConnected
              ? "Print Receipt (USB)"
              : "Print Receipt"}
        </button>
        <button className="btn btn--primary" type="button" onClick={onNewSale}>
          New Sale
        </button>
      </div>
    </section>
  );
}

export default PosReceiptActions;
