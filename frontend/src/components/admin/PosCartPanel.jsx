function PosCartPanel({
  title = "Order",
  cartItems,
  subtotal,
  formatCurrency,
  onRemoveItem,
  onChangeQuantity,
  onAdjustQuantity,
  stockIssuesByKey,
  disabled = false,
  emptyMessage = "Add items to start a sale.",
  footerContent = null,
}) {
  return (
    <section className="pos-wizard__card">
      <div className="pos-cart-panel__header">
        <div>
          <h3>{title}</h3>
          <p className="modal__meta">
            {cartItems.length} {cartItems.length === 1 ? "line" : "lines"}
          </p>
        </div>
      </div>

      {cartItems.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        <ul className="pos-cart__list">
          {cartItems.map((item) => {
            const stockIssue = stockIssuesByKey.get(item.key) || null;
            const itemCanBeRemoved = !(item?.metadata?.giftCardLinked && item?.metadata?.giftCardId);
            const isBookingLine =
              item.type === "workshop-booking" || item.type === "cut-flower-booking";
            return (
              <li
                key={item.key}
                className={`pos-cart__item ${stockIssue ? "is-warning" : ""}`}
              >
                <div className="pos-cart__row">
                  <div className="pos-cart__info">
                    <p className="pos-cart__name">{item.name}</p>
                    <div className="pos-cart__meta">
                      {item.metadata?.variantLabel && <span>Variant: {item.metadata.variantLabel}</span>}
                      {item.metadata?.optionLabel && <span>Option: {item.metadata.optionLabel}</span>}
                      {item.metadata?.sessionLabel && <span>Session: {item.metadata.sessionLabel}</span>}
                      {item.metadata?.giftCardCode && <span>Gift card: {item.metadata.giftCardCode}</span>}
                      {isBookingLine && <span>Booking will be marked paid on checkout</span>}
                    </div>
                    {stockIssue && (
                      <p className="pos-cart__stock-warning">
                        Only {stockIssue.available} in stock
                      </p>
                    )}
                  </div>
                  <div className="pos-cart__line-total">
                    {formatCurrency(item.price * item.quantity)}
                  </div>
                </div>
                <div className="pos-cart__controls">
                  <div className="pos-cart__field">
                    <span className="pos-cart__label">Qty</span>
                    <div className="pos-cart__stepper">
                      <button
                        className="pos-cart__stepper-btn"
                        type="button"
                        onClick={() => onAdjustQuantity(item.key, -1)}
                        aria-label={`Decrease ${item.name} quantity`}
                        disabled={disabled}
                      >
                        -
                      </button>
                      <input
                        className="input pos-cart__input"
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) => onChangeQuantity(item.key, event.target.value)}
                        disabled={disabled}
                      />
                      <button
                        className="pos-cart__stepper-btn"
                        type="button"
                        onClick={() => onAdjustQuantity(item.key, 1)}
                        aria-label={`Increase ${item.name} quantity`}
                        disabled={disabled}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {itemCanBeRemoved && (
                    <button
                      className="icon-btn icon-btn--danger pos-cart__remove"
                      type="button"
                      onClick={() => onRemoveItem(item.key)}
                      aria-label={`Remove ${item.name}`}
                      disabled={disabled}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="pos-cart-panel__footer">
        <div className="pos-cart-panel__subtotal">
          <span>Subtotal</span>
          <strong>{formatCurrency(subtotal)}</strong>
        </div>
        {footerContent}
      </footer>
    </section>
  );
}

export default PosCartPanel;
