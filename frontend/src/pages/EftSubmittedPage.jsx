import { useMemo, useState } from "react";
import { ref, uploadBytes } from "firebase/storage";
import { Link, useLocation } from "react-router-dom";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { getFirebaseStorage } from "../lib/firebase.js";
import {
  EFT_BANK_DETAILS,
  EFT_PROOF_ACCEPT,
  EFT_PROOF_MAX_SIZE_BYTES,
  buildOrderReference,
} from "../lib/paymentMethods.js";

const ATTACH_EFT_PROOF_URL =
  "https://us-central1-bethanyblooms-89dcc.cloudfunctions.net/attachEftPaymentProofHttp";

function EftSubmittedPage() {
  usePageMetadata({
    title: "EFT Submitted | Bethany Blooms",
    description: "Your EFT order is pending admin payment approval.",
  });

  const location = useLocation();
  const state = location.state || {};
  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const orderId = (state.orderId || params.get("orderId") || "").toString().trim();
  const orderNumber = state.orderNumber || params.get("orderNumber");
  const proofUploadToken = (state.proofUploadToken || params.get("proofUploadToken") || "")
    .toString()
    .trim();
  const proofUploadExpiresAt = (state.proofUploadExpiresAt || params.get("proofUploadExpiresAt") || "")
    .toString()
    .trim();
  const bankDetails = state.bankDetails || EFT_BANK_DETAILS;
  const orderReference = buildOrderReference(orderNumber);
  const [proofFile, setProofFile] = useState(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState("");
  const [proofSuccess, setProofSuccess] = useState("");

  const proofUploadExpiry = useMemo(() => {
    if (!proofUploadExpiresAt) return null;
    const parsed = new Date(proofUploadExpiresAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }, [proofUploadExpiresAt]);
  const proofUploadExpired =
    Boolean(proofUploadExpiry) && proofUploadExpiry.getTime() <= Date.now();
  const canUploadProof = Boolean(orderId && proofUploadToken && !proofUploadExpired);

  const handleProofFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setProofFile(file);
    setProofError("");
    setProofSuccess("");
  };

  const uploadProof = async () => {
    if (!canUploadProof) {
      setProofError(
        "Proof upload is unavailable for this session. Please contact support with your order number.",
      );
      return;
    }
    if (!proofFile) {
      setProofError("Please choose a PDF or image before uploading.");
      return;
    }
    if (proofFile.size > EFT_PROOF_MAX_SIZE_BYTES) {
      setProofError("Proof file is too large. Maximum size is 10MB.");
      return;
    }
    const contentType = (proofFile.type || "").toLowerCase();
    if (!(contentType === "application/pdf" || contentType.startsWith("image/"))) {
      setProofError("Unsupported file type. Upload a PDF or image.");
      return;
    }

    setProofUploading(true);
    setProofError("");
    setProofSuccess("");

    try {
      const storage = getFirebaseStorage();
      const safeName = (proofFile.name || "proof")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const storagePath = `eftProofs/${orderId}/${Date.now()}-${safeName || "proof"}`;
      await uploadBytes(ref(storage, storagePath), proofFile, {
        contentType: contentType || undefined,
      });

      const paymentProof = {
        storagePath,
        fileName: proofFile.name || "proof",
        contentType,
        size: proofFile.size,
      };

      const response = await fetch(ATTACH_EFT_PROOF_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId,
          proofUploadToken,
          paymentProof,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Unable to attach proof of payment.");
      }

      setProofSuccess(`Proof uploaded successfully: ${paymentProof.fileName}`);
    } catch (error) {
      setProofError(error.message || "Unable to upload proof of payment.");
    } finally {
      setProofUploading(false);
    }
  };

  return (
    <section className="section section--tight payment-status-page payment-status-page--eft">
      <div className="section__inner payment-status-page__inner">
        <article className="payment-status-card">
          <header className="payment-status-card__header">
            <span className="badge">EFT order created</span>
            <span className="payment-status-card__icon payment-status-card__icon--pending" aria-hidden="true">
              EFT
            </span>
          </header>
          <h1>Order received - awaiting payment approval</h1>
          <p className="payment-status-card__lead">
            Transfer using the bank details below, then upload proof of payment so our team can review it quickly.
          </p>

          <div className="payment-status-card__notice payment-status-card__notice--reference">
            Use this reference exactly: <strong>{orderReference}</strong>
          </div>

          <div className="payment-status-card__panel payment-status-card__bank-details">
            <h2>Bank details</h2>
            <div className="payment-status-card__details-grid">
              <p>
                <strong>Account Name:</strong> {bankDetails.accountName}
              </p>
              <p>
                <strong>Bank:</strong> {bankDetails.bankName}
              </p>
              <p>
                <strong>Account Type:</strong> {bankDetails.accountType}
              </p>
              <p>
                <strong>Account Number:</strong> {bankDetails.accountNumber}
              </p>
              <p>
                <strong>Branch Code:</strong> {bankDetails.branchCode}
              </p>
              <p>
                <strong>Reference:</strong> {orderReference}
              </p>
            </div>
          </div>

          <div className="payment-status-card__panel payment-status-card__proof">
            <h2>Upload proof of payment</h2>
            {canUploadProof ? (
              <>
                <p className="modal__meta">
                  Upload your proof so we can match your payment to <strong>{orderReference}</strong>.
                </p>
                <label className="checkout-eft-proof__field">
                  <span>Proof file (PDF or image, max 10MB)</span>
                  <input
                    className="input"
                    type="file"
                    accept={EFT_PROOF_ACCEPT}
                    onChange={handleProofFileChange}
                    disabled={proofUploading || Boolean(proofSuccess)}
                  />
                </label>
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={uploadProof}
                  disabled={proofUploading || Boolean(proofSuccess)}
                >
                  {proofUploading ? "Uploading proof..." : proofSuccess ? "Proof uploaded" : "Upload proof"}
                </button>
              </>
            ) : (
              <p className="modal__meta">
                We cannot upload proof from this session. Contact support and include your order number.
              </p>
            )}
            {proofUploadExpired && (
              <p className="admin-panel__error">This upload session has expired. Please contact support.</p>
            )}
            {proofError && <p className="admin-panel__error">{proofError}</p>}
            {proofSuccess && <p className="admin-save-indicator">{proofSuccess}</p>}
          </div>

          <p className="payment-status-card__meta">
            Admin must approve EFT payment before fulfilment. Need help? Contact {bankDetails.supportEmail}.
          </p>

          <div className="cta-group payment-status-card__actions">
            <Link className="btn btn--primary" to="/account">
              View my account
            </Link>
            <Link className="btn btn--secondary" to="/products">
              Continue shopping
            </Link>
            <Link className="btn btn--secondary" to="/contact">
              Contact support
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

export default EftSubmittedPage;
