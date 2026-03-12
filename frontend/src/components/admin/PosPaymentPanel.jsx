function PosPaymentPanel({
  formatCurrency,
  pricing,
  showGiftCardSection,
  onToggleGiftCardSection,
  giftCardCodeInput,
  onGiftCardCodeChange,
  onLookupGiftCard,
  giftCardLookupLoading,
  canLookupGiftCard,
  giftCardLookupError,
  giftCardMatches,
  onRemoveGiftCard,
  showDiscountSection,
  onToggleDiscountSection,
  discountType,
  onDiscountTypeChange,
  discountValue,
  onDiscountValueChange,
  paymentMethod,
  onPaymentMethodChange,
  paymentMethodResolved,
  cashReceived,
  onCashReceivedChange,
  cashStats,
  paymentError,
  disabled = false,
  onBack,
  onNext,
  nextDisabled,
}) {
  const fullyCoveredByGiftCard = pricing.amountDue <= 0 && giftCardMatches.length > 0;

  return (
    <section className="pos-wizard__card pos-payment-panel">
      <div className="pos-payment-panel__body">
        <div className="pos-collapsible">
          <div className="pos-collapsible__toggle pos-collapsible__toggle--yn">
            <span className="pos-collapsible__label">Gift Card</span>
            <div className="pos-yn-group" role="group" aria-label="Use gift card?">
              <button
                className={`pos-yn-btn ${!showGiftCardSection ? "pos-yn-btn--active-no" : ""}`}
                type="button"
                onClick={() => onToggleGiftCardSection("no")}
                disabled={disabled}
              >No</button>
              <button
                className={`pos-yn-btn ${showGiftCardSection ? "pos-yn-btn--active-yes" : ""}`}
                type="button"
                onClick={() => onToggleGiftCardSection("yes")}
                disabled={disabled}
              >Yes</button>
            </div>
          </div>
          {showGiftCardSection && (
            <div className="pos-collapsible__content">
              <label className="modal__meta">
                Apply a gift card?
                <div className="pos-payment-panel__input-row">
                  <input
                    className="input"
                    placeholder="Gift card code"
                    value={giftCardCodeInput}
                    onChange={(event) => onGiftCardCodeChange(event.target.value)}
                    disabled={disabled}
                  />
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={onLookupGiftCard}
                    disabled={disabled || giftCardLookupLoading || !canLookupGiftCard}
                  >
                    {giftCardLookupLoading ? "Checking..." : "Lookup"}
                  </button>
                </div>
              </label>
              {giftCardLookupError && <p className="pos-inline-error">{giftCardLookupError}</p>}
              {giftCardMatches.length > 0 && (
                <div className="pos-chip-list">
                  {giftCardMatches.map((match) => (
                    <span key={`${match.giftCardId}-${match.code}`} className="pos-chip">
                      <span>{match.code}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveGiftCard(match.code)}
                        disabled={disabled}
                        aria-label={`Remove ${match.code}`}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {fullyCoveredByGiftCard && (
                <div className="pos-warning-banner">
                  Gift card covers the full amount - no additional payment needed
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pos-collapsible">
          <div className="pos-collapsible__toggle pos-collapsible__toggle--yn">
            <span className="pos-collapsible__label">Discount</span>
            <div className="pos-yn-group" role="group" aria-label="Apply discount?">
              <button
                className={`pos-yn-btn ${!showDiscountSection ? "pos-yn-btn--active-no" : ""}`}
                type="button"
                onClick={() => onToggleDiscountSection("no")}
                disabled={disabled}
              >No</button>
              <button
                className={`pos-yn-btn ${showDiscountSection ? "pos-yn-btn--active-yes" : ""}`}
                type="button"
                onClick={() => onToggleDiscountSection("yes")}
                disabled={disabled}
              >Yes</button>
            </div>
          </div>
          {showDiscountSection && (
            <div className="pos-collapsible__content pos-discount">
              <label className="modal__meta">
                Discount type
                <select
                  className="input"
                  value={discountType}
                  onChange={(event) => onDiscountTypeChange(event.target.value)}
                  disabled={disabled}
                >
                  <option value="none">None</option>
                  <option value="amount">Amount (R)</option>
                  <option value="percent">Percent (%)</option>
                </select>
              </label>
              {discountType !== "none" && (
                <label className="modal__meta">
                  {discountType === "amount" ? "Discount amount" : "Discount percent"}
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step={discountType === "amount" ? "0.01" : "1"}
                    max={discountType === "percent" ? "100" : undefined}
                    value={discountValue}
                    onChange={(event) => onDiscountValueChange(event.target.value)}
                    disabled={disabled}
                  />
                </label>
              )}
            </div>
          )}
        </div>

        <div className="pos-checkout__section">
          <div className="pos-checkout__section-title">
            <h4>Order Total</h4>
          </div>
          <div className="pos-checkout__totals">
            <div>
              <span>Subtotal</span>
              <strong>{formatCurrency(pricing.cartSubtotal)}</strong>
            </div>
            <div>
              <span>Gift card applied</span>
              <strong>-{formatCurrency(pricing.giftCardApplied)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>-{formatCurrency(pricing.discountAmount)}</strong>
            </div>
            <div className="pos-checkout__divider" />
            <div className="pos-checkout__total-row">
              <span>Amount due</span>
              <strong>{formatCurrency(pricing.amountDue)}</strong>
            </div>
          </div>
        </div>

        <div className="pos-checkout__section">
          <div className="pos-checkout__section-title">
            <h4>Payment Method</h4>
          </div>

          <div className="pos-method-group" role="group" aria-label="Payment method">
            <button
              className={`pos-method-button ${paymentMethod === "card" ? "is-active" : ""}`}
              type="button"
              onClick={() => onPaymentMethodChange("card")}
              disabled={disabled || fullyCoveredByGiftCard}
            >
              Card
            </button>
            <button
              className={`pos-method-button ${paymentMethod === "cash" ? "is-active" : ""}`}
              type="button"
              onClick={() => onPaymentMethodChange("cash")}
              disabled={disabled || fullyCoveredByGiftCard}
            >
              Cash
            </button>
            <button
              className={`pos-method-button ${
                paymentMethodResolved === "gift-card" ? "is-active" : ""
              }`}
              type="button"
              disabled
            >
              Gift card
            </button>
          </div>

          {fullyCoveredByGiftCard && (
            <p className="modal__meta">
              Payment method is automatically set to gift-card because no amount remains due.
            </p>
          )}

          {paymentMethod === "cash" && !fullyCoveredByGiftCard && (
            <div className="pos-cash">
              <label className="modal__meta">
                Cash received
                <input
                  className={`input ${paymentError ? "pos-input--error" : ""}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashReceived}
                  onChange={(event) => onCashReceivedChange(event.target.value)}
                  disabled={disabled}
                />
              </label>
              <div className="pos-cash__summary">
                <span className="modal__meta">Change due</span>
                <strong>{formatCurrency(cashStats.changeDue || 0)}</strong>
              </div>
            </div>
          )}

          {paymentError && <p className="pos-inline-error">{paymentError}</p>}
        </div>
      </div>

      <div className="pos-wizard__actions">
        <button className="btn btn--secondary" type="button" onClick={onBack} disabled={disabled}>
          Back
        </button>
        <button
          className="btn btn--primary"
          type="button"
          onClick={onNext}
          disabled={disabled || nextDisabled}
        >
          Review &amp; Confirm &rarr;
        </button>
      </div>
    </section>
  );
}

export default PosPaymentPanel;
