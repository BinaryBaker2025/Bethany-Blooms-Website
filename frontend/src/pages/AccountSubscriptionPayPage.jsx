import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { SUBSCRIPTION_PAYFAST_PAYMENT_FUNCTION_ENDPOINT } from "../lib/functionEndpoints.js";

function submitPayfastForm(url, fields) {
  if (typeof document === "undefined") return;
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.style.display = "none";

  Object.entries(fields || {}).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

function AccountSubscriptionPayPage() {
  usePageMetadata({
    title: "Subscription Payment | Bethany Blooms",
    description: "Continue to PayFast to complete your flower subscription payment.",
  });

  const { invoiceId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").toString().trim();

  const [loadingState, setLoadingState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const normalizedInvoiceId = (invoiceId || "").toString().trim();
    if (!normalizedInvoiceId || !token) {
      setLoadingState("error");
      setErrorMessage("This payment link is incomplete. Request a new pay link from your account.");
      return undefined;
    }

    const abortController = new AbortController();

    const run = async () => {
      try {
        setLoadingState("loading");
        setErrorMessage("");
        const response = await fetch(SUBSCRIPTION_PAYFAST_PAYMENT_FUNCTION_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invoiceId: normalizedInvoiceId,
            token,
            returnUrl: `${window.location.origin}/account`,
            cancelUrl: `${window.location.origin}/account`,
          }),
          signal: abortController.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            (payload?.error || "").toString().trim() ||
              "Unable to prepare this subscription payment link.",
          );
        }
        if (!payload?.url || !payload?.fields) {
          throw new Error("PayFast payment payload was invalid.");
        }
        setLoadingState("redirecting");
        submitPayfastForm(payload.url, payload.fields);
      } catch (error) {
        if (abortController.signal.aborted) return;
        setLoadingState("error");
        setErrorMessage(
          error?.message || "Unable to continue to PayFast. Please request a new pay link.",
        );
      }
    };

    run();
    return () => abortController.abort();
  }, [invoiceId, token]);

  return (
    <section className="section section--tight payment-status-page payment-status-page--subscription">
      <div className="section__inner payment-status-page__inner">
        <div className="payment-status-card account-subscription-pay">
          <header className="payment-status-card__header">
            <span className="badge">Subscription payment</span>
            <span className="payment-status-card__icon payment-status-card__icon--pending" aria-hidden="true">
              PAY
            </span>
          </header>
          {loadingState === "loading" && (
            <>
              <h1>Preparing secure checkout</h1>
              <p className="payment-status-card__lead">We are preparing your PayFast payment. Please wait...</p>
            </>
          )}
          {loadingState === "redirecting" && (
            <>
              <h1>Redirecting to PayFast</h1>
              <p className="payment-status-card__lead">You are being redirected to complete payment.</p>
            </>
          )}
          {loadingState === "error" && (
            <>
              <h1>Payment link unavailable</h1>
              <p className="admin-panel__error payment-status-card__meta">{errorMessage}</p>
              <div className="cta-group payment-status-card__actions">
                <Link className="btn btn--primary" to="/account">
                  Back to account
                </Link>
                <Link className="btn btn--secondary" to="/cart">
                  Go to checkout
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default AccountSubscriptionPayPage;
