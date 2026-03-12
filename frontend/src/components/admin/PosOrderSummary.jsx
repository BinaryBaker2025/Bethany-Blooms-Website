function PosOrderSummary({
  cartItems,
  customer,
  notes,
  formatCurrency,
  pricing,
  resolvedPaymentMethod,
  giftCardMatches,
  discountAmount,
  cashReceived,
  changeDue,
}) {
  const paymentLabel =
    resolvedPaymentMethod === "gift-card"
      ? "Gift card"
      : resolvedPaymentMethod
        ? resolvedPaymentMethod.charAt(0).toUpperCase() + resolvedPaymentMethod.slice(1)
        : "Not selected";

  return (
    <section className="pos-wizard__card pos-summary-card">
      <div className="pos-summary-card__header">
        <div>
          <h3>Review this sale before completing checkout</h3>
          <p className="modal__meta">Nothing is written to Firestore until you confirm.</p>
        </div>
      </div>

      <div className="pos-summary-card__section">
        <h4>Order lines</h4>
        <ul className="pos-summary-card__items">
          {cartItems.map((item) => (
            <li key={item.key}>
              <span>
                {item.name} x{item.quantity}
              </span>
              <strong>{formatCurrency(item.price * item.quantity)}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div className="pos-summary-card__section">
        <h4>Customer</h4>
        <dl className="pos-summary-card__details">
          <div>
            <dt>Name</dt>
            <dd>{customer.name.trim() || "Walk-in customer"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{customer.email.trim() || "Not provided"}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{notes.trim() || "No notes"}</dd>
          </div>
        </dl>
      </div>

      <div className="pos-summary-card__section">
        <h4>Payment</h4>
        <dl className="pos-summary-card__details">
          <div>
            <dt>Method</dt>
            <dd>{paymentLabel}</dd>
          </div>
          {giftCardMatches.length > 0 && (
            <div>
              <dt>Gift cards applied</dt>
              <dd>-{formatCurrency(pricing.giftCardApplied)}</dd>
            </div>
          )}
          {discountAmount > 0 && (
            <div>
              <dt>Discount applied</dt>
              <dd>-{formatCurrency(discountAmount)}</dd>
            </div>
          )}
          {resolvedPaymentMethod === "cash" && (
            <>
              <div>
                <dt>Cash received</dt>
                <dd>{formatCurrency(cashReceived || 0)}</dd>
              </div>
              <div>
                <dt>Change due</dt>
                <dd>{formatCurrency(changeDue || 0)}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className="pos-summary-card__total">
        <span>Total due</span>
        <strong>{formatCurrency(pricing.amountDue)}</strong>
      </div>
    </section>
  );
}

export default PosOrderSummary;
