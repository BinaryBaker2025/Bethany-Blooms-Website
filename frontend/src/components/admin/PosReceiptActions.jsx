function PosReceiptActions({
  receiptData,
  formatCurrency,
  emailReceiptRequested,
  printerBridgeUrl,
  printerName,
  onPrinterBridgeUrlChange,
  onPrinterNameChange,
  onSavePrinterSettings,
  printerSettingsSaving = false,
  onPrint,
  onNewSale,
}) {
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

      <details className="pos-printer-bridge">
        <summary>
          <span className="pos-printer-bridge__label">Printer settings</span>
          <span>{printerBridgeUrl || "Not configured"}</span>
        </summary>
        <p className="modal__meta">
          These settings are saved for every POS device.
        </p>
        <label className="pos-printer-bridge__field">
          <span>Bridge URL</span>
          <input
            className="input"
            type="text"
            value={printerBridgeUrl}
            onChange={(event) => onPrinterBridgeUrlChange(event.target.value)}
            placeholder="http://127.0.0.1:8787"
          />
        </label>
        <label className="pos-printer-bridge__field">
          <span>Printer name</span>
          <input
            className="input"
            type="text"
            value={printerName}
            onChange={(event) => onPrinterNameChange(event.target.value)}
            placeholder="Optional if Windows default is the POS printer"
          />
        </label>
        <button
          className="btn btn--secondary"
          type="button"
          onClick={onSavePrinterSettings}
          disabled={printerSettingsSaving}
        >
          {printerSettingsSaving ? "Saving..." : "Save for all POS devices"}
        </button>
      </details>

      <div className="pos-success-card__actions">
        <button
          className="btn btn--secondary"
          type="button"
          onClick={onPrint}
        >
          Print Receipt
        </button>
        <button className="btn btn--primary" type="button" onClick={onNewSale}>
          New Sale
        </button>
      </div>
    </section>
  );
}

export default PosReceiptActions;
