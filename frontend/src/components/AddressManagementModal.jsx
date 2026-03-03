import { useState, useMemo, useCallback } from "react";
import { doc, updateDoc, arrayUnion, arrayRemove, deleteField, serverTimestamp } from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase.js";
import { SA_PROVINCES } from "../lib/shipping.js";

const PROFILE_COLLECTION = "customerProfiles";
const MAX_ADDRESSES = 10;

export function AddressManagementModal({ userId, addresses = [], onSave, onClose, onAddressAdded }) {
  const [formMode, setFormMode] = useState("list"); // "list", "add", "edit"
  const [editingId, setEditingId] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  // Form state
  const [label, setLabel] = useState("");
  const [street, setStreet] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const editingAddress = useMemo(
    () => addresses.find((a) => a.id === editingId) || null,
    [addresses, editingId]
  );

  const addressCount = Array.isArray(addresses) ? addresses.length : 0;
  const canAddMore = addressCount < MAX_ADDRESSES;

  const resetForm = useCallback(() => {
    setLabel("");
    setStreet("");
    setSuburb("");
    setCity("");
    setProvince("");
    setPostalCode("");
    setEditingId(null);
    setFormError("");
  }, []);

  const startAdd = useCallback(() => {
    resetForm();
    setFormMode("add");
  }, [resetForm]);

  const startEdit = useCallback(
    (addressId) => {
      const address = addresses.find((a) => a.id === addressId);
      if (!address) return;
      setLabel(address.label || "");
      setStreet(address.street || "");
      setSuburb(address.suburb || "");
      setCity(address.city || "");
      setProvince(address.province || "");
      setPostalCode(address.postalCode || "");
      setEditingId(addressId);
      setFormMode("edit");
      setFormError("");
    },
    [addresses]
  );

  const validateForm = () => {
    if (!street.trim()) return "Street is required.";
    if (!suburb.trim()) return "Suburb is required.";
    if (!city.trim()) return "City is required.";
    if (!province.trim()) return "Province is required.";
    if (!postalCode.trim()) return "Postal code is required.";
    if (!/^\d{4}/.test(postalCode)) return "Postal code must start with 4 digits.";
    return "";
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!userId) {
      setFormError("User ID required.");
      return;
    }

    try {
      setFormBusy(true);
      setFormError("");
      const db = getFirebaseDb();
      const profileRef = doc(db, PROFILE_COLLECTION, userId);

      const addressData = {
        id: editingId || Date.now().toString(),
        label: label.trim() || "Address",
        street: street.trim(),
        suburb: suburb.trim(),
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim(),
      };

      if (formMode === "add") {
        await updateDoc(profileRef, {
          addresses: arrayUnion(addressData),
          updatedAt: serverTimestamp(),
        });
        setFormSuccess("Address added successfully!");
        if (onAddressAdded) {
          onAddressAdded(addressData);
        }
      } else if (formMode === "edit" && editingId) {
        // Remove old address and add updated one
        const oldAddress = addresses.find((a) => a.id === editingId);
        if (oldAddress) {
          await updateDoc(profileRef, {
            addresses: arrayRemove(oldAddress),
          });
        }
        await updateDoc(profileRef, {
          addresses: arrayUnion(addressData),
          updatedAt: serverTimestamp(),
        });
        setFormSuccess("Address updated successfully!");
      }

      resetForm();
      setTimeout(() => {
        setFormMode("list");
        setFormSuccess("");
      }, 1500);
    } catch (error) {
      console.error("Failed to save address:", error);
      setFormError(error?.message || "Failed to save address. Please try again.");
    } finally {
      setFormBusy(false);
    }
  };

  const handleDeleteAddress = async (addressId) => {
    if (!window.confirm("Delete this address?")) return;

    try {
      setFormBusy(true);
      setFormError("");
      const db = getFirebaseDb();
      const profileRef = doc(db, PROFILE_COLLECTION, userId);
      const addressToDelete = addresses.find((a) => a.id === addressId);

      if (addressToDelete) {
        await updateDoc(profileRef, {
          addresses: arrayRemove(addressToDelete),
          updatedAt: serverTimestamp(),
        });
        setFormSuccess("Address deleted successfully!");
        setTimeout(() => {
          setFormSuccess("");
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to delete address:", error);
      setFormError(error?.message || "Failed to delete address. Please try again.");
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <div className="modal is-active address-management-modal" role="dialog" aria-modal="true">
      <div className="modal__content address-management-modal__content">
        <button
          className="modal__close"
          type="button"
          onClick={onClose}
          aria-label="Close"
          disabled={formBusy}
        >
          ×
        </button>

        {formMode === "list" && (
          <>
            <h3 className="modal__title">Delivery Addresses</h3>

            {formError && <p className="modal__error">{formError}</p>}
            {formSuccess && <p className="modal__success">{formSuccess}</p>}

            {addressCount === 0 ? (
              <p className="modal__meta">No addresses yet. Add your first delivery address.</p>
            ) : (
              <div className="address-list">
                {addresses.map((address) => (
                  <div key={address.id} className="address-item">
                    <div className="address-item__content">
                      <p className="address-item__label">{address.label}</p>
                      <p className="address-item__text">
                        {address.street}, {address.suburb}
                      </p>
                      <p className="address-item__text">
                        {address.city}, {address.province} {address.postalCode}
                      </p>
                    </div>
                    <div className="address-item__actions">
                      <button
                        className="btn btn--secondary btn--small"
                        type="button"
                        onClick={() => startEdit(address.id)}
                        disabled={formBusy}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn--danger btn--small"
                        type="button"
                        onClick={() => handleDeleteAddress(address.id)}
                        disabled={formBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {addressCount >= MAX_ADDRESSES && (
              <p className="modal__meta" style={{ color: "#d97706" }}>
                Maximum {MAX_ADDRESSES} addresses reached.
              </p>
            )}

            <div className="modal__actions" style={{ marginTop: "1.5rem" }}>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={onClose}
                disabled={formBusy}
              >
                Close
              </button>
              {canAddMore && (
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={startAdd}
                  disabled={formBusy}
                >
                  Add New Address
                </button>
              )}
            </div>
          </>
        )}

        {(formMode === "add" || formMode === "edit") && (
          <>
            <h3 className="modal__title">
              {formMode === "add" ? "Add New Address" : "Edit Address"}
            </h3>

            {formError && <p className="modal__error">{formError}</p>}
            {formSuccess && <p className="modal__success">{formSuccess}</p>}

            <form className="admin-form" onSubmit={handleSaveAddress}>
              <label className="admin-form__field">
                Address Name (optional)
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., Home, Office, Apartment A"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={formBusy}
                  aria-label="Address name (optional)"
                />
              </label>

              <label className="admin-form__field">
                Street Address *
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., 123 Main Street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                  disabled={formBusy}
                  aria-label="Street address (required)"
                  aria-invalid={!street.trim() && formError.includes("Street") ? "true" : "false"}
                />
              </label>

              <label className="admin-form__field">
                Suburb *
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., Sandton"
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  required
                  disabled={formBusy}
                  aria-label="Suburb (required)"
                  aria-invalid={!suburb.trim() && formError.includes("Suburb") ? "true" : "false"}
                />
              </label>

              <label className="admin-form__field">
                City *
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., Johannesburg"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  disabled={formBusy}
                  aria-label="City (required)"
                  aria-invalid={!city.trim() && formError.includes("City") ? "true" : "false"}
                />
              </label>

              <label className="admin-form__field">
                Province *
                <select
                  className="input"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  required
                  disabled={formBusy}
                  aria-label="Province (required)"
                  aria-invalid={!province.trim() && formError.includes("Province") ? "true" : "false"}
                >
                  <option value="">Select province</option>
                  {SA_PROVINCES.map((prov) => (
                    <option key={prov.value} value={prov.value}>
                      {prov.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-form__field">
                Postal Code *
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., 2012 (4 digits)"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  required
                  disabled={formBusy}
                  maxLength="10"
                  aria-label="Postal code (required - 4 digits)"
                  aria-invalid={!postalCode.trim() && formError.includes("Postal") ? "true" : "false"}
                  aria-describedby={formError.includes("Postal") ? "postal-error" : undefined}
                />
                {formError.includes("Postal") && (
                  <span id="postal-error" className="field-error">{formError}</span>
                )}
              </label>

              <div className="modal__actions" style={{ marginTop: "1.5rem" }}>
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormMode("list");
                  }}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={formBusy}
                >
                  {formBusy
                    ? "Saving..."
                    : formMode === "add"
                      ? "Save Address"
                      : "Update Address"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
