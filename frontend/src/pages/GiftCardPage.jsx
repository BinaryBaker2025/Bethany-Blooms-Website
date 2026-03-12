import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import logo from "../assets/BethanyBloomsLogo.png";
import giftCardBackground from "../assets/Gemini_Generated_Image_466wr8466wr8466w.png";
import signature from "../assets/giftcard/signiture.png";
import { usePageMetadata } from "../hooks/usePageMetadata.js";

const GIFT_CARD_PUBLIC_FUNCTION_URL =
  "https://us-central1-bethanyblooms-89dcc.cloudfunctions.net/getGiftCardPublicHttp";

const currency = (value) => `R${Number(value || 0).toFixed(2)}`;
const normalizeGiftCardOptionQuantity = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(200, parsed);
};

const buildGiftCardInvitationLine = (giftCard = {}) => {
  const recipient = (giftCard?.recipientName || "Gift recipient").toString().trim() || "Gift recipient";
  const kind = (giftCard?.catalogItemRef?.kind || "").toString().trim().toLowerCase();
  if (giftCard?.isGiveaway) return "A Bethany Blooms gift from the flower farm.";
  if (kind === "product") {
    return `For ${recipient} to enjoy a Bethany Blooms gift chosen just for them.`;
  }
  if (kind) {
    return `For ${recipient} to book a Bethany Blooms experience when the time feels right.`;
  }
  return `For ${recipient} to enjoy the flower farm in their own time.`;
};

const getGiftCardRedemptionScopeLabel = (value = "") => {
  switch ((value || "").toString().trim().toLowerCase()) {
    case "instore":
      return "In-store only";
    case "online":
      return "Online only";
    case "both":
    default:
      return "In-store and online";
  }
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
    description: "View and download your Bethany Blooms gift card.",
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
  const isGiveawayCard = Boolean(giftCard?.isGiveaway);
  const optionCount = useMemo(() => {
    if (Number.isFinite(Number(giftCard?.selectedOptionCount))) {
      return Math.max(0, Math.floor(Number(giftCard.selectedOptionCount)));
    }
    return optionRows.reduce((sum, option) => sum + normalizeGiftCardOptionQuantity(option?.quantity), 0);
  }, [giftCard?.selectedOptionCount, optionRows]);
  const invitationLine = useMemo(() => buildGiftCardInvitationLine(giftCard), [giftCard]);
  const termsText =
    (giftCard?.terms || "").toString().trim() ||
    "Valid for Bethany Blooms products and experiences before expiry. Non-refundable and not exchangeable for cash.";
  const statusLabel = (giftCard?.status || "active").toString().trim();
  const recipientLabel = (giftCard?.recipientName || "Gift recipient").toString().trim() || "Gift recipient";
  const purchaserLabel = (giftCard?.purchaserName || "Customer").toString().trim() || "Customer";
  const issuedLabel = giftCard?.issuedAt
    ? new Date(giftCard.issuedAt).toLocaleDateString("en-ZA")
    : "N/A";
  const expiryLabel = giftCard?.expiresAt
    ? new Date(giftCard.expiresAt).toLocaleDateString("en-ZA")
    : "N/A";

  return (
    <section className="section section--tight gift-card-page">
      <div className="section__inner">
        <span className="badge">Gift Card</span>
        <h1>Bethany Blooms Gift Card</h1>
        {loading && <p className="empty-state">Loading gift card...</p>}
        {!loading && error && <p className="admin-panel__error">{error}</p>}

        {!loading && !error && giftCard && (
          <div className="gift-card-page__grid">
            <article
              className="gift-card-sheet"
              style={{
                "--gift-card-sheet-background": `url(${giftCardBackground})`,
              }}
            >
              <div className="gift-card-sheet__brand-row">
                <img
                  className="gift-card-sheet__logo"
                  src={logo}
                  alt="Bethany Blooms logo"
                  loading="lazy"
                  decoding="async"
                />
                <span className="gift-card-sheet__status">{statusLabel}</span>
              </div>
              <p className="gift-card-sheet__eyebrow">Bethany Blooms Flower Farm</p>
              <h2 className="gift-card-sheet__title">Flower Farm Gift Card</h2>
              <p className="gift-card-sheet__recipient-line">{invitationLine}</p>

              <div className="gift-card-sheet__hero">
                <div className="gift-card-sheet__hero-main">
                  <section className="gift-card-sheet__value-panel">
                    <span className="gift-card-sheet__section-label">Gifted amount</span>
                    <p className="gift-card-sheet__value">{currency(giftCard.value)}</p>
                    <p className="gift-card-sheet__value-note">
                      Redeemable for Bethany Blooms products and experiences before the expiry date shown on this card.
                    </p>
                  </section>

                  {giftCard.message && (
                    <div className="gift-card-sheet__message">
                      <span className="gift-card-sheet__section-label">Message</span>
                      <div className="gift-card-sheet__message-quote">
                        <span className="gift-card-sheet__message-mark" aria-hidden="true">
                          "
                        </span>
                        <p>{giftCard.message}</p>
                      </div>
                    </div>
                  )}
                </div>

                <aside className="gift-card-sheet__details">
                  <div className="gift-card-sheet__detail-block gift-card-sheet__detail-block--person">
                    <span>Recipient</span>
                    <strong className="gift-card-sheet__detail-name">{recipientLabel}</strong>
                  </div>
                  {!isGiveawayCard && (
                    <div className="gift-card-sheet__detail-block gift-card-sheet__detail-block--person">
                      <span>Purchased by</span>
                      <strong className="gift-card-sheet__detail-name">{purchaserLabel}</strong>
                    </div>
                  )}
                  <div className="gift-card-sheet__detail-block">
                    <span>Card code</span>
                    <strong>{giftCard.code || "Gift Card"}</strong>
                  </div>
                  <div className="gift-card-sheet__detail-block">
                    <span>Value</span>
                    <strong>{currency(giftCard.value)} ZAR</strong>
                  </div>
                  <div className="gift-card-sheet__detail-block">
                    <span>Redeemable</span>
                    <strong>{getGiftCardRedemptionScopeLabel(giftCard.redemptionScope)}</strong>
                  </div>
                  <div className="gift-card-sheet__detail-block">
                    <span>Expiry</span>
                    <strong>{expiryLabel}</strong>
                  </div>
                  <div className="gift-card-sheet__detail-block">
                    <span>Issued</span>
                    <strong>{issuedLabel}</strong>
                  </div>
                </aside>
              </div>

              <div className="gift-card-sheet__stack">
                <div className="gift-card-sheet__options">
                  <span className="gift-card-sheet__section-label">
                    Included selections ({optionCount})
                  </span>
                  {optionRows.length > 0 ? (
                    <ul>
                      {optionRows.map((option) => {
                        const quantity = normalizeGiftCardOptionQuantity(option?.quantity);
                        const amount = Number(option?.amount || 0);
                        const lineTotal = Number(option?.lineTotal ?? amount * quantity);
                        return (
                          <li key={option.id || option.label} className="gift-card-sheet__option-row">
                            <div className="gift-card-sheet__option-copy">
                              <strong>{option.label}</strong>
                              {quantity > 1 && (
                                <span>
                                  {quantity} x {currency(amount)}
                                </span>
                              )}
                            </div>
                            <strong className="gift-card-sheet__option-price">
                              {quantity > 1 ? currency(lineTotal) : currency(amount)}
                            </strong>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p>No options listed.</p>
                  )}
                </div>

                <div className="gift-card-sheet__terms">
                  <span className="gift-card-sheet__section-label">Terms</span>
                  <p>{termsText}</p>
                </div>
              </div>

              <div className="gift-card-sheet__footer">
                <div>
                  <p>2 Paul Roos Street, Unitas Park</p>
                  <p>079 267 0819</p>
                </div>
                <div className="gift-card-sheet__footer-signature">
                  <img
                    className="gift-card-sheet__signature"
                    src={signature}
                    alt="Bethany Blooms signature"
                    loading="lazy"
                    decoding="async"
                  />
                  <p className="gift-card-sheet__footer-note">Paid {issuedLabel}</p>
                </div>
              </div>
            </article>

            <aside className="gift-card-panel">
              <h3>Gift Card</h3>
              <p className="modal__meta">
                Download the single-page PDF version of this gift card.
              </p>
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
