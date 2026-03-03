import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  canPosSaleLineBeVoided,
  canPosSaleLinePartialVoid,
  canPosSaleLineWholeVoidOnly,
  formatPosSaleStatusLabel,
  getNormalizedPosSaleItems,
  getPosSaleNetTotal,
  isGiftCardPosSale,
} from "../../lib/posSales.js";

const moneyFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

const formatCurrency = (value) => moneyFormatter.format(Number(value || 0));

function PosVoidDialog({ open, sale, functionsInstance, onClose, onVoided }) {
  const normalizedItems = useMemo(() => getNormalizedPosSaleItems(sale), [sale]);
  const giftCardSale = useMemo(() => isGiftCardPosSale(sale), [sale]);
  const lineItemCapable = useMemo(
    () => !giftCardSale && normalizedItems.some((item) => canPosSaleLineBeVoided(item)),
    [giftCardSale, normalizedItems],
  );
  const [mode, setMode] = useState("full-sale");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [selectedQuantities, setSelectedQuantities] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !sale) return;
    setMode(lineItemCapable ? "line-items" : "full-sale");
    setReason("");
    setPin("");
    setSaving(false);
    setError("");
    setSelectedQuantities(
      Object.fromEntries(
        normalizedItems.map((item) => [item.lineId, 0]),
      ),
    );
  }, [lineItemCapable, normalizedItems, open, sale]);

  if (!open || !sale) return null;

  const handleClose = () => {
    if (saving) return;
    onClose?.();
  };

  const handleQuantityChange = (lineId, nextValue, maxValue) => {
    const parsed = Number.parseInt(nextValue, 10);
    const safeValue = Number.isFinite(parsed) ? Math.max(0, Math.min(maxValue, parsed)) : 0;
    setSelectedQuantities((prev) => ({
      ...prev,
      [lineId]: safeValue,
    }));
  };

  const handleWholeLineToggle = (lineId, remainingQuantity) => {
    setSelectedQuantities((prev) => ({
      ...prev,
      [lineId]: prev[lineId] > 0 ? 0 : remainingQuantity,
    }));
  };

  const selectedLineItems = normalizedItems
    .map((item) => ({
      lineId: item.lineId,
      quantity: Number.parseInt(selectedQuantities[item.lineId], 10) || 0,
    }))
    .filter((entry) => entry.quantity > 0);

  const handleSubmit = async () => {
    if (!functionsInstance) {
      setError("Cloud Functions are not available.");
      return;
    }
    if (!reason.trim()) {
      setError("Enter a reason for the void.");
      return;
    }
    if (!pin.trim()) {
      setError("Enter your admin PIN.");
      return;
    }
    if (mode === "line-items" && selectedLineItems.length === 0) {
      setError("Select at least one line item to void.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const callable = httpsCallable(functionsInstance, "adminVoidPosSale");
      const response = await callable({
        saleId: sale.id,
        reason: reason.trim(),
        pin: pin.trim(),
        mode,
        lineItems: mode === "line-items" ? selectedLineItems : [],
      });
      onVoided?.(response?.data || null);
      onClose?.();
    } catch (voidError) {
      setError(voidError?.message || "Unable to void this sale.");
    } finally {
      setSaving(false);
    }
  };

  const lineItemWarning = giftCardSale
    ? "This receipt used a gift card. Only a full-sale void is allowed so the card can be reactivated cleanly."
    : !lineItemCapable
      ? "Line-item void is unavailable for this receipt. Use a full-sale void instead."
      : "Select the lines to void. Products allow partial quantities; service lines void as a whole line only.";

  return (
    <div
      className="modal is-active admin-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-void-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="modal__content pos-void-dialog">
        <button className="modal__close" type="button" onClick={handleClose} aria-label="Close">
          &times;
        </button>
        <h3 className="modal__title" id="pos-void-title">
          Void receipt {sale.receiptNumber || sale.id}
        </h3>
        <div className="pos-void-dialog__summary">
          <p className="modal__meta">
            Status: <strong>{formatPosSaleStatusLabel(sale.status)}</strong>
          </p>
          <p className="modal__meta">
            Net total: <strong>{formatCurrency(getPosSaleNetTotal(sale))}</strong>
          </p>
        </div>

        <div className="pos-void-dialog__mode">
          <label className="admin-checkbox">
            <input
              type="radio"
              name="pos-void-mode"
              checked={mode === "full-sale"}
              onChange={() => setMode("full-sale")}
            />
            Full receipt void
          </label>
          <label className="admin-checkbox">
            <input
              type="radio"
              name="pos-void-mode"
              checked={mode === "line-items"}
              onChange={() => {
                if (lineItemCapable) {
                  setMode("line-items");
                }
              }}
              disabled={!lineItemCapable}
            />
            Line-item void
          </label>
          <p className="modal__meta">{lineItemWarning}</p>
        </div>

        <div className="pos-void-dialog__items">
          {normalizedItems.map((item) => {
            const remainingQuantity = item.netQuantity;
            const supportsPartial = canPosSaleLinePartialVoid(item);
            const supportsWholeLineOnly = canPosSaleLineWholeVoidOnly(item);
            const supportsAny = canPosSaleLineBeVoided(item);
            return (
              <div className="pos-void-dialog__item" key={item.lineId}>
                <div className="pos-void-dialog__item-main">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="modal__meta">
                      <span>Remaining: {remainingQuantity}</span>
                      <span>Line total: {formatCurrency(item.price * remainingQuantity)}</span>
                    </div>
                  </div>
                  {mode === "line-items" && (
                    <div className="pos-void-dialog__item-control">
                      {supportsPartial && (
                        <input
                          className="input"
                          type="number"
                          min="0"
                          max={remainingQuantity}
                          value={selectedQuantities[item.lineId] || 0}
                          onChange={(event) =>
                            handleQuantityChange(item.lineId, event.target.value, remainingQuantity)
                          }
                        />
                      )}
                      {!supportsPartial && supportsWholeLineOnly && (
                        <label className="admin-checkbox">
                          <input
                            type="checkbox"
                            checked={Number(selectedQuantities[item.lineId] || 0) > 0}
                            onChange={() => handleWholeLineToggle(item.lineId, remainingQuantity)}
                          />
                          Void full line
                        </label>
                      )}
                      {!supportsAny && (
                        <span className="modal__meta">Use full-sale void</span>
                      )}
                    </div>
                  )}
                </div>
                {mode === "line-items" && !supportsPartial && supportsWholeLineOnly && (
                  <p className="modal__meta">This line can only be voided in full.</p>
                )}
                {mode === "line-items" && !supportsAny && (
                  <p className="modal__meta">
                    This line does not have enough linked data for a safe line-item reversal.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="pos-void-dialog__fields">
          <label className="modal__meta">
            Reason
            <textarea
              className="input"
              rows="3"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="Explain why this void is required."
            />
          </label>
          <label className="modal__meta">
            Admin PIN
            <input
              className="input"
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D+/g, ""))}
              placeholder="Enter your POS PIN"
            />
          </label>
        </div>

        {error && <p className="admin-panel__error">{error}</p>}

        <div className="admin-form__actions">
          <button className="btn btn--secondary" type="button" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn--primary" type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? "Voiding..." : "Confirm void"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PosVoidDialog;
