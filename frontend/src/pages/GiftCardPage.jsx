import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata.js";

const GIFT_CARD_PUBLIC_FUNCTION_URL =
  "https://us-central1-bethanyblooms-89dcc.cloudfunctions.net/getGiftCardPublicHttp";

const currency = (value) => `R${Number(value || 0).toFixed(2)}`;
const normalizeGiftCardOptionQuantity = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(200, parsed);
};

function GiftCardPage() {
  const { giftCardId } = useParams();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").toString().trim();
  const [loading, setLoading] = useState(true);
  const [giftCard, setGiftCard] = useState(null);
  const [error, setError] = useState(null);

  const pageTitle = giftCard?.code ? `Gift Card ${giftCard.code} | Bethany Blooms` : "Gift Card | Bethany Blooms";
  usePageMetadata({
    title: pageTitle,
    description: "View, download, and print your Bethany Blooms gift card.",
    noIndex: true,
  });

  useEffect(() => {
    const resolvedGiftCardId = (giftCardId || "").toString().trim();
    if (!resolvedGiftCardId || !token) {
      setLoading(false);
      setError("This gift card link is incomplete. Please use the full link from your email.");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          giftCardId: resolvedGiftCardId,
          token,
        });
        const response = await fetch(`${GIFT_CARD_PUBLIC_FUNCTION_URL}?${query.toString()}`, {
          method: "GET",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.giftCard) {
          throw new Error((data?.error || "").toString().trim() || "Unable to load this gift card.");
        }
        if (!cancelled) {
          setGiftCard(data.giftCard);
        }
      } catch (loadError) {
        if (cancelled) return;
        if (loadError?.name === "AbortError") return;
        setError(loadError?.message || "Unable to load this gift card.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [giftCardId, token]);

  const optionRows = useMemo(
    () => (Array.isArray(giftCard?.selectedOptions) ? giftCard.selectedOptions : []),
    [giftCard?.selectedOptions],
  );
  const optionCount = useMemo(() => {
    if (Number.isFinite(Number(giftCard?.selectedOptionCount))) {
      return Math.max(0, Math.floor(Number(giftCard.selectedOptionCount)));
    }
    return optionRows.reduce((sum, option) => sum + normalizeGiftCardOptionQuantity(option?.quantity), 0);
  }, [giftCard?.selectedOptionCount, optionRows]);

  return (
    <section className="section section--tight gift-card-page">
      <div className="section__inner">
        <span className="badge">Gift Card</span>
        <h1>Bethany Blooms Gift Card</h1>
        {loading && <p className="empty-state">Loading gift card...</p>}
        {!loading && error && <p className="admin-panel__error">{error}</p>}

        {!loading && !error && giftCard && (
          <div className="gift-card-page__grid">
            <article className="gift-card-sheet">
              <div className="gift-card-sheet__header">
                <h2>{giftCard.code || "Gift Card"}</h2>
                <span className="badge badge--stock-in">{giftCard.status || "active"}</span>
              </div>
              <p className="gift-card-sheet__value">{currency(giftCard.value)}</p>
              <div className="gift-card-sheet__meta">
                <p>
                  <strong>Recipient:</strong> {giftCard.recipientName || "Gift recipient"}
                </p>
                <p>
                  <strong>Purchased by:</strong> {giftCard.purchaserName || "Customer"}
                </p>
                <p>
                  <strong>Expiry:</strong> {giftCard.expiresAt ? new Date(giftCard.expiresAt).toLocaleDateString("en-ZA") : "N/A"}
                </p>
              </div>
              {giftCard.message && (
                <div className="gift-card-sheet__message">
                  <strong>Message</strong>
                  <p>{giftCard.message}</p>
                </div>
              )}
              <div className="gift-card-sheet__options">
                <strong>Selected options ({optionCount})</strong>
                {optionRows.length > 0 ? (
                  <ul>
                    {optionRows.map((option) => (
                      <li key={option.id || option.label}>
                        <span>
                          {option.label}
                          {normalizeGiftCardOptionQuantity(option?.quantity) > 1
                            ? ` x${normalizeGiftCardOptionQuantity(option?.quantity)}`
                            : ""}
                        </span>
                        <span>{currency(option.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No options listed.</p>
                )}
              </div>
            </article>

            <aside className="gift-card-panel">
              <h3>Actions</h3>
              <div className="gift-card-panel__actions">
                {giftCard.downloadUrl ? (
                  <a className="btn btn--primary" href={giftCard.downloadUrl}>
                    Download PDF
                  </a>
                ) : (
                  <button className="btn btn--primary" type="button" disabled>
                    Download PDF
                  </button>
                )}
                <button className="btn btn--secondary" type="button" onClick={() => window.print()}>
                  Print Gift Card
                </button>
              </div>
              <div className="gift-card-panel__terms">
                <h4>Terms</h4>
                <p>
                  {(giftCard.terms || "")
                    .toString()
                    .trim() ||
                    "Valid for Bethany Blooms products/services until expiry. Non-refundable and not exchangeable for cash."}
                </p>
              </div>
              <div className="gift-card-panel__links">
                <Link className="btn btn--secondary" to="/products">
                  Back to products
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

export default GiftCardPage;
