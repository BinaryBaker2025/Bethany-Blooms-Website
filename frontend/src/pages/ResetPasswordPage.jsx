import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getFirebaseAuth, getFirebaseFunctions } from "../lib/firebase.js";
import { usePageMetadata } from "../hooks/usePageMetadata.js";

function ResetPasswordPage() {
  usePageMetadata({
    title: "Reset Password | Bethany Blooms",
    description: "Set a new password for your Bethany Blooms account.",
    noIndex: true,
  });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get("oobCode") || "";

  const [status, setStatus] = useState("verifying"); // verifying | ready | busy | done | error
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const accountEmail = useRef("");
  const redirectTimer = useRef(null);

  useEffect(() => {
    if (!oobCode) {
      setErrorMessage("This reset link is invalid or has already been used.");
      setStatus("error");
      return;
    }
    verifyPasswordResetCode(getFirebaseAuth(), oobCode)
      .then((email) => {
        accountEmail.current = email || "";
        setStatus("ready");
      })
      .catch(() => {
        setErrorMessage("This reset link has expired or already been used. Please request a new one.");
        setStatus("error");
      });
  }, [oobCode]);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    setErrorMessage("");
    setStatus("busy");
    try {
      await confirmPasswordReset(getFirebaseAuth(), oobCode, password);

      // Send branded confirmation email — fire and forget, don't block the redirect.
      if (accountEmail.current) {
        httpsCallable(
          getFirebaseFunctions(),
          "sendPasswordResetSuccessEmail",
        )({ email: accountEmail.current }).catch(() => {});
      }

      setStatus("done");
      redirectTimer.current = setTimeout(() => navigate("/account"), 3000);
    } catch {
      setErrorMessage("Unable to reset your password. The link may have expired — please request a new one.");
      setStatus("ready");
    }
  }

  return (
    <section className="section section--tight payment-status-page">
      <div className="section__inner payment-status-page__inner">
        <article className="payment-status-card">

          {status === "verifying" && (
            <>
              <header className="payment-status-card__header">
                <span className="badge">Please wait</span>
              </header>
              <h1>Verifying your link…</h1>
              <p className="payment-status-card__lead">Just a moment while we check your reset link.</p>
            </>
          )}

          {status === "error" && (
            <>
              <header className="payment-status-card__header">
                <span className="badge">Link invalid</span>
                <span className="payment-status-card__icon payment-status-card__icon--warn" aria-hidden="true">!</span>
              </header>
              <h1>Reset link expired</h1>
              <p className="payment-status-card__lead">{errorMessage}</p>
              <div className="cta-group payment-status-card__actions">
                <a className="btn btn--primary" href="/account">Back to sign in</a>
              </div>
            </>
          )}

          {(status === "ready" || status === "busy") && (
            <>
              <header className="payment-status-card__header">
                <span className="badge">New password</span>
              </header>
              <h1>Reset your password</h1>
              <p className="payment-status-card__lead">Choose a new password for your Bethany Blooms account.</p>
              <form onSubmit={handleSubmit} style={{ marginTop: "20px" }}>
                <div style={{ marginBottom: "14px" }}>
                  <label htmlFor="rp-password" style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
                    New password
                  </label>
                  <input
                    id="rp-password"
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={status === "busy"}
                  />
                </div>
                <div style={{ marginBottom: "20px" }}>
                  <label htmlFor="rp-confirm" style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
                    Confirm new password
                  </label>
                  <input
                    id="rp-confirm"
                    type="password"
                    className="input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={status === "busy"}
                  />
                </div>
                {errorMessage && (
                  <p className="account-auth__error" style={{ marginBottom: "14px" }}>{errorMessage}</p>
                )}
                <div className="cta-group payment-status-card__actions">
                  <button type="submit" className="btn btn--primary" disabled={status === "busy"}>
                    {status === "busy" ? "Saving…" : "Set new password"}
                  </button>
                </div>
              </form>
            </>
          )}

          {status === "done" && (
            <>
              <header className="payment-status-card__header">
                <span className="badge">Success</span>
              </header>
              <h1>Password updated</h1>
              <p className="payment-status-card__lead">
                Your password has been changed. A confirmation email is on its way. Taking you to sign in…
              </p>
              <div className="cta-group payment-status-card__actions">
                <a className="btn btn--primary" href="/account">Sign in now</a>
              </div>
            </>
          )}

        </article>
      </div>
    </section>
  );
}

export default ResetPasswordPage;
