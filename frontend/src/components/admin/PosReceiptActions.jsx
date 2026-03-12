function PosReceiptActions({
  receiptData,
  formatCurrency,
  emailReceiptRequested,
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
          <strong>{receiptData.paymentMethod}</strong>
        </div>
      </div>
      {emailReceiptRequested && receiptData.customer.email && (
        <p className="modal__meta">
          A receipt was requested for {receiptData.customer.email}.
        </p>
      )}
      <div className="pos-success-card__actions">
        <button className="btn btn--secondary" type="button" onClick={onPrint}>
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
