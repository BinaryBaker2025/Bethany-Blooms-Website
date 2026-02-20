import { useMemo, useState } from "react";
import { deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { usePageMetadata } from "../../hooks/usePageMetadata.js";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection.js";
import { getFirebaseDb, getFirebaseFunctions } from "../../lib/firebase.js";
import { SA_PROVINCES, formatShippingAddress } from "../../lib/shipping.js";

const EMPTY_ADDRESS = Object.freeze({
  label: "",
  street: "",
  suburb: "",
  city: "",
  province: "",
  postalCode: "",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "customer", label: "Customer" },
];

const SORT_OPTIONS = [
  { value: "updated-desc", label: "Updated (newest)" },
  { value: "email-asc", label: "Email (A-Z)" },
  { value: "role-asc", label: "Role" },
  { value: "name-asc", label: "Name (A-Z)" },
];

const IconUser = ({ title = "Customer", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M20 21a8 8 0 0 0-16 0" />
    <circle cx="12" cy="8" r="4" />
  </svg>
);

const IconShield = ({ title = "Admin", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M12 3 5 6v6c0 5 3.5 8.5 7 9 3.5-.5 7-4 7-9V6l-7-3Z" />
  </svg>
);

const IconTrash = ({ title = "Delete", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal is-active admin-modal" role="dialog" aria-modal="true" aria-labelledby="users-confirm-title">
      <div className="modal__content">
        <button className="modal__close" type="button" onClick={onCancel} aria-label="Close">
          x
        </button>
        <h3 className="modal__title" id="users-confirm-title">
          {title}
        </h3>
        <p>{message}</p>
        <div className="admin-form__actions" style={{ marginTop: "1.5rem" }}>
          <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn--primary" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const toText = (value, maxLength = 160) => (value || "").toString().trim().slice(0, maxLength);

const normalizeRole = (value) => {
  const normalized = (value || "").toString().trim().toLowerCase();
  return normalized === "admin" ? "admin" : "customer";
};

const createAddressId = () => `addr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeAddress = (value = {}) => ({
  id: toText(value.id || "", 120),
  label: toText(value.label || "", 120),
  street: toText(value.street || value.streetAddress || "", 220),
  suburb: toText(value.suburb || "", 120),
  city: toText(value.city || "", 120),
  province: toText(value.province || "", 80),
  postalCode: toText(value.postalCode || value.postcode || "", 10),
});

const sanitizeAddresses = (addresses = []) => {
  const next = [];
  const seenIds = new Set();
  for (const entry of Array.isArray(addresses) ? addresses : []) {
    const normalized = normalizeAddress(entry);
    if (!normalized.street && !normalized.suburb && !normalized.city && !normalized.province) continue;
    let safeId = normalized.id || createAddressId();
    if (seenIds.has(safeId)) safeId = createAddressId();
    seenIds.add(safeId);
    next.push({
      ...normalized,
      id: safeId,
      label: normalized.label || "Saved address",
    });
    if (next.length >= 10) break;
  }
  return next;
};

export function AdminUsersView() {
  usePageMetadata({
    title: "Admin - Users",
    description: "Manage user roles, profiles, communication preferences, and addresses.",
  });

  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);

  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);

  const { items: users, status, error: usersError } = useFirestoreCollection("users", {
    orderByField: null,
    orderDirection: null,
  });

  const { items: customerProfiles, status: profileStatus, error: profilesError } = useFirestoreCollection(
    "customerProfiles",
    {
      orderByField: null,
      orderDirection: null,
    },
  );
  const {
    items: subscriptionCustomerSettings,
    status: subscriptionSettingsStatus,
    error: subscriptionSettingsError,
  } = useFirestoreCollection("subscriptionCustomerSettings", {
    orderByField: null,
    orderDirection: null,
  });

  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("customer");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [userSaving, setUserSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, targetId: null });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [roleFilter, setRoleFilter] = useState("all");
  const [sortOption, setSortOption] = useState("updated-desc");
  const [searchQuery, setSearchQuery] = useState("");

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [eftEligibilitySaving, setEftEligibilitySaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileStatusMessage, setProfileStatusMessage] = useState("");
  const [editingUserId, setEditingUserId] = useState("");
  const [eftEligibilityDraft, setEftEligibilityDraft] = useState(false);
  const [eftEligibilityReason, setEftEligibilityReason] = useState("");
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    phone: "",
    preferences: {
      marketingEmails: true,
      orderUpdates: true,
    },
    addresses: [],
    defaultAddressId: "",
  });
  const [addressDraftMode, setAddressDraftMode] = useState("add");
  const [editingAddressId, setEditingAddressId] = useState("");
  const [addressDraft, setAddressDraft] = useState(EMPTY_ADDRESS);

  const profileByUid = useMemo(() => {
    const map = new Map();
    for (const profile of customerProfiles) {
      const key = toText(profile.uid || profile.id || "", 120);
      if (!key) continue;
      map.set(key, profile);
    }
    return map;
  }, [customerProfiles]);

  const subscriptionSettingsByUid = useMemo(() => {
    const map = new Map();
    for (const settings of subscriptionCustomerSettings) {
      const key = toText(settings.uid || settings.id || "", 120);
      if (!key) continue;
      map.set(key, settings);
    }
    return map;
  }, [subscriptionCustomerSettings]);

  const mergedUsers = useMemo(() => {
    return users.map((userDoc) => {
      const uid = toText(userDoc.uid || userDoc.id || "", 120) || userDoc.id;
      const profile = profileByUid.get(uid) || {};
      const subscriptionSettings = subscriptionSettingsByUid.get(uid) || {};
      const addresses = sanitizeAddresses(profile.addresses || []);
      const requestedDefaultAddressId = toText(profile.defaultAddressId || "", 120);
      const defaultAddressId = addresses.some((entry) => entry.id === requestedDefaultAddressId)
        ? requestedDefaultAddressId
        : addresses[0]?.id || "";
      const updatedDate =
        userDoc.updatedAt?.toDate?.() ||
        profile.updatedAt?.toDate?.() ||
        userDoc.createdAt?.toDate?.() ||
        profile.createdAt?.toDate?.() ||
        null;

      return {
        id: uid,
        uid,
        email: toText(userDoc.email || profile.email || "", 200),
        role: normalizeRole(userDoc.role),
        fullName: toText(profile.fullName || "", 160),
        phone: toText(profile.phone || "", 40),
        preferences: {
          marketingEmails: profile?.preferences?.marketingEmails !== false,
          orderUpdates: profile?.preferences?.orderUpdates !== false,
        },
        eftApproved: Boolean(subscriptionSettings?.eftApproved),
        eftApprovalReason: toText(subscriptionSettings?.reason || "", 500),
        addresses,
        defaultAddressId,
        updatedDate,
        updatedMs: updatedDate instanceof Date ? updatedDate.getTime() : 0,
      };
    });
  }, [profileByUid, subscriptionSettingsByUid, users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const compareText = (left, right) => left.localeCompare(right, "en", { sensitivity: "base" });

    const filtered = mergedUsers.filter((userDoc) => {
      if (roleFilter !== "all" && userDoc.role !== roleFilter) return false;
      if (!query) return true;
      const searchable = [userDoc.email, userDoc.uid, userDoc.fullName, userDoc.phone];
      return searchable
        .map((value) => (value || "").toString().toLowerCase())
        .some((value) => value.includes(query));
    });

    return filtered.sort((left, right) => {
      if (sortOption === "email-asc") {
        return compareText(left.email || "", right.email || "");
      }
      if (sortOption === "role-asc") {
        const roleCmp = compareText(left.role || "", right.role || "");
        if (roleCmp !== 0) return roleCmp;
        return compareText(left.email || "", right.email || "");
      }
      if (sortOption === "name-asc") {
        const leftName = left.fullName || left.email || left.uid;
        const rightName = right.fullName || right.email || right.uid;
        return compareText(leftName, rightName);
      }
      return (right.updatedMs || 0) - (left.updatedMs || 0);
    });
  }, [mergedUsers, roleFilter, searchQuery, sortOption]);

  const activeEditUser = useMemo(
    () => mergedUsers.find((entry) => entry.id === editingUserId) || null,
    [editingUserId, mergedUsers],
  );

  const friendlyStatus =
    status === "loading" || profileStatus === "loading" || subscriptionSettingsStatus === "loading"
      ? "Loading users..."
      : status === "error" || profileStatus === "error" || subscriptionSettingsStatus === "error"
        ? "Could not load users."
        : null;

  const resetUserForm = () => {
    setNewUserEmail("");
    setNewUserRole("customer");
    setNewUserPassword("");
    setError(null);
    setMessage(null);
  };

  const setAddressDraftFromAddress = (address) => {
    const normalized = normalizeAddress(address || {});
    setAddressDraft({
      label: normalized.label || "",
      street: normalized.street || "",
      suburb: normalized.suburb || "",
      city: normalized.city || "",
      province: normalized.province || "",
      postalCode: normalized.postalCode || "",
    });
  };

  const resetAddressDraft = () => {
    setAddressDraft(EMPTY_ADDRESS);
    setAddressDraftMode("add");
    setEditingAddressId("");
  };

  const openProfileModal = (userDoc) => {
    if (!userDoc?.id) return;
    const addresses = sanitizeAddresses(userDoc.addresses || []);
    const defaultAddressId = addresses.some((entry) => entry.id === userDoc.defaultAddressId)
      ? userDoc.defaultAddressId
      : addresses[0]?.id || "";
    setEditingUserId(userDoc.id);
    setProfileForm({
      fullName: userDoc.fullName || "",
      phone: userDoc.phone || "",
      preferences: {
        marketingEmails: userDoc.preferences?.marketingEmails !== false,
        orderUpdates: userDoc.preferences?.orderUpdates !== false,
      },
      addresses,
      defaultAddressId,
    });
    setEftEligibilityDraft(Boolean(userDoc.eftApproved));
    setEftEligibilityReason((userDoc.eftApprovalReason || "").toString());
    resetAddressDraft();
    setProfileError("");
    setProfileStatusMessage("");
    setProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setEditingUserId("");
    setProfileError("");
    setProfileStatusMessage("");
    setEftEligibilityDraft(false);
    setEftEligibilityReason("");
    resetAddressDraft();
  };

  const handleSetRole = async (userId, nextRole) => {
    if (!db || !userId) return;
    setUpdatingId(userId);
    setError(null);
    setMessage(null);
    try {
      await updateDoc(doc(db, "users", userId), {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });
      setMessage(`Updated role to ${nextRole}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRowOpen = (userDoc) => {
    openProfileModal(userDoc);
  };

  const handleRowKeyDown = (event, userDoc) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProfileModal(userDoc);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!db || !userId) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteDoc(doc(db, "users", userId));
      setMessage("User deleted. Remove the auth account separately if needed.");
      closeProfileModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteBusy(false);
      setDeleteDialog({ open: false, targetId: null });
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    if (!db) {
      setError("Firestore is not available.");
      return;
    }
    if (!functionsInstance) {
      setError("Cloud Functions not available.");
      return;
    }

    const email = newUserEmail.trim();
    const password = newUserPassword;
    const role = newUserRole.trim() || "customer";

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    setUserSaving(true);
    setError(null);
    setMessage(null);
    try {
      const createUser = httpsCallable(functionsInstance, "createUserWithRole");
      await createUser({ email, password, role });
      setMessage("User created in Auth and Firestore.");
      resetUserForm();
      setUserModalOpen(false);
    } catch (err) {
      const code = err.code || err.message || "";
      if (code.includes("permission-denied") || code.includes("unauthenticated")) {
        setError("You need an admin account with a Firestore user record to create users.");
      } else if (code.includes("invalid-argument")) {
        setError(err.message || "Check email and password (min 6 chars).");
      } else {
        setError(err.message || "Failed to create user.");
      }
    } finally {
      setUserSaving(false);
    }
  };

  const handleProfileFieldChange = (field) => (event) => {
    const value = event.target.value;
    setProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePreferenceChange = (field) => (event) => {
    const checked = event.target.checked;
    setProfileForm((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        [field]: checked,
      },
    }));
  };

  const handleAddressDraftChange = (field) => (event) => {
    const value = event.target.value;
    setAddressDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const startEditAddress = (address) => {
    if (!address?.id) return;
    setAddressDraftMode("edit");
    setEditingAddressId(address.id);
    setAddressDraftFromAddress(address);
    setProfileError("");
    setProfileStatusMessage("");
  };

  const removeDraftAddress = (addressId) => {
    const targetId = toText(addressId, 120);
    if (!targetId) return;
    setProfileForm((prev) => {
      const nextAddresses = prev.addresses.filter((entry) => entry.id !== targetId);
      const nextDefaultAddressId =
        prev.defaultAddressId === targetId ? nextAddresses[0]?.id || "" : prev.defaultAddressId;
      return {
        ...prev,
        addresses: nextAddresses,
        defaultAddressId: nextDefaultAddressId,
      };
    });
    if (targetId === editingAddressId) {
      resetAddressDraft();
    }
    setProfileError("");
    setProfileStatusMessage("");
  };

  const setDraftDefaultAddress = (addressId) => {
    const targetId = toText(addressId, 120);
    if (!targetId) return;
    setProfileForm((prev) => ({
      ...prev,
      defaultAddressId: targetId,
    }));
    setProfileError("");
    setProfileStatusMessage("");
  };

  const commitAddressDraft = () => {
    const label = toText(addressDraft.label || "", 120) || "Saved address";
    const street = toText(addressDraft.street || "", 220);
    const suburb = toText(addressDraft.suburb || "", 120);
    const city = toText(addressDraft.city || "", 120);
    const province = toText(addressDraft.province || "", 80);
    const postalCode = toText(addressDraft.postalCode || "", 10);

    if (!label || !street || !suburb || !city || !province || !postalCode) {
      setProfileError("Complete all address fields before saving.");
      return;
    }
    if (!/^\d{4}$/.test(postalCode)) {
      setProfileError("Postal code must be 4 digits.");
      return;
    }
    if (addressDraftMode === "add" && profileForm.addresses.length >= 10) {
      setProfileError("You can save up to 10 addresses.");
      return;
    }

    if (addressDraftMode === "edit") {
      const targetAddressId = toText(editingAddressId, 120);
      if (!targetAddressId) {
        setProfileError("Address could not be found.");
        return;
      }
      setProfileForm((prev) => ({
        ...prev,
        addresses: prev.addresses.map((entry) =>
          entry.id === targetAddressId
            ? {
                ...entry,
                label,
                street,
                suburb,
                city,
                province,
                postalCode,
              }
            : entry,
        ),
      }));
      setProfileError("");
      setProfileStatusMessage("Address updated in draft. Save profile to persist.");
      resetAddressDraft();
      return;
    }

    const nextAddress = {
      id: createAddressId(),
      label,
      street,
      suburb,
      city,
      province,
      postalCode,
    };
    setProfileForm((prev) => ({
      ...prev,
      addresses: [...prev.addresses, nextAddress],
      defaultAddressId: prev.defaultAddressId || nextAddress.id,
    }));
    setProfileError("");
    setProfileStatusMessage("Address added in draft. Save profile to persist.");
    resetAddressDraft();
  };

  const handleSaveProfile = async () => {
    if (!functionsInstance) {
      setProfileError("Cloud Functions not available.");
      return;
    }
    if (!editingUserId) {
      setProfileError("No user selected.");
      return;
    }

    const addresses = sanitizeAddresses(profileForm.addresses || []);
    if (addresses.some((address) => !/^\d{4}$/.test(toText(address.postalCode || "", 10)))) {
      setProfileError("Each postal code must be 4 digits.");
      return;
    }
    const defaultAddressId =
      addresses.some((entry) => entry.id === profileForm.defaultAddressId)
        ? profileForm.defaultAddressId
        : addresses[0]?.id || "";

    setProfileSaving(true);
    setProfileError("");
    setProfileStatusMessage("");
    try {
      const callable = httpsCallable(functionsInstance, "adminUpdateUserProfile");
      await callable({
        userId: editingUserId,
        profile: {
          fullName: toText(profileForm.fullName || "", 160),
          phone: toText(profileForm.phone || "", 40),
          preferences: {
            marketingEmails: profileForm.preferences.marketingEmails !== false,
            orderUpdates: profileForm.preferences.orderUpdates !== false,
          },
          addresses,
          defaultAddressId,
        },
      });
      setProfileForm((prev) => ({
        ...prev,
        addresses,
        defaultAddressId,
      }));
      setProfileStatusMessage("Profile updated.");
      setMessage("User profile updated.");
    } catch (err) {
      setProfileError(err?.message || "Unable to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveEftEligibility = async () => {
    if (!functionsInstance) {
      setProfileError("Cloud Functions not available.");
      return;
    }
    if (!editingUserId) {
      setProfileError("No user selected.");
      return;
    }
    setEftEligibilitySaving(true);
    setProfileError("");
    setProfileStatusMessage("");
    try {
      const callable = httpsCallable(functionsInstance, "adminSetSubscriptionEftEligibility");
      await callable({
        userId: editingUserId,
        approved: Boolean(eftEligibilityDraft),
        reason: toText(eftEligibilityReason || "", 500),
      });
      setProfileStatusMessage(
        `Subscription EFT ${eftEligibilityDraft ? "approved" : "disabled"} for this account.`,
      );
      setMessage(
        `Subscription EFT ${eftEligibilityDraft ? "approved" : "disabled"} for user ${editingUserId}.`,
      );
    } catch (err) {
      setProfileError(err?.message || "Unable to update subscription EFT eligibility.");
    } finally {
      setEftEligibilitySaving(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <div className="admin-panel__header">
        <div>
          <h2>Users</h2>
          <p className="admin-panel__note">Manage account roles, profile details, communication preferences, and addresses.</p>
        </div>
        <div className="admin-panel__header-actions">
          <button className="btn btn--primary" type="button" onClick={() => setUserModalOpen(true)}>
            Add User
          </button>
        </div>
      </div>

      <div className="admin-users-toolbar">
        <label className="admin-users-toolbar__field admin-users-toolbar__field--search" htmlFor="admin-users-search">
          Search
          <input
            id="admin-users-search"
            className="input"
            type="search"
            placeholder="Email, UID, name, phone..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <label className="admin-users-toolbar__field" htmlFor="admin-users-role-filter">
          Role
          <select
            id="admin-users-role-filter"
            className="input"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            {ROLE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-users-toolbar__field" htmlFor="admin-users-sort">
          Sort
          <select
            id="admin-users-sort"
            className="input"
            value={sortOption}
            onChange={(event) => setSortOption(event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="admin-users-table__hint">Click any user row to open profile and account actions.</p>

      <div className="admin-table__wrapper">
        {users.length > 0 ? (
          <table className="admin-table admin-users-table">
            <thead>
              <tr>
                <th scope="col">Email / UID</th>
                <th scope="col">Role</th>
                <th scope="col">Sub EFT</th>
                <th scope="col">Name</th>
                <th scope="col">Phone</th>
                <th scope="col">Preferences</th>
                <th scope="col">Address count</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((userDoc) => {
                const updated = userDoc.updatedDate ? DATE_FORMATTER.format(userDoc.updatedDate) : "-";
                const roleLabel = userDoc.role === "admin" ? "Admin" : "Customer";
                const preferencesSummary = `${userDoc.preferences?.marketingEmails !== false ? "Marketing on" : "Marketing off"} | ${userDoc.preferences?.orderUpdates !== false ? "Order updates on" : "Order updates off"}`;
                return (
                  <tr
                    key={userDoc.id}
                    className="admin-users-table__row admin-table__row--clickable"
                    onClick={() => handleRowOpen(userDoc)}
                    onKeyDown={(event) => handleRowKeyDown(event, userDoc)}
                    tabIndex={0}
                    aria-label={`Open user ${userDoc.email || userDoc.uid}`}
                  >
                    <td>
                      <div className="admin-users-row__identity">
                        <strong>{userDoc.email || "No email"}</strong>
                        <p className="modal__meta">UID: {userDoc.uid || userDoc.id}</p>
                      </div>
                    </td>
                    <td>
                      <span className={`admin-users-role-chip ${userDoc.role === "admin" ? "is-admin" : "is-customer"}`}>
                        {roleLabel}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-users-role-chip ${userDoc.eftApproved ? "is-admin" : "is-customer"}`}
                        title={userDoc.eftApproved ? "Subscription EFT approved" : "Subscription EFT not approved"}
                      >
                        {userDoc.eftApproved ? "Approved" : "Not approved"}
                      </span>
                    </td>
                    <td>{userDoc.fullName || "Not set"}</td>
                    <td>{userDoc.phone || "Not set"}</td>
                    <td>{preferencesSummary}</td>
                    <td>{userDoc.addresses.length}</td>
                    <td>{updated}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="admin-panel__notice">{friendlyStatus || "No users found."}</p>
        )}
        {users.length > 0 && filteredUsers.length === 0 && (
          <p className="admin-panel__notice">No users match the selected filters.</p>
        )}
        {message && <p className="admin-panel__status">{message}</p>}
        {(error || usersError || profilesError || subscriptionSettingsError) && (
          <p className="admin-panel__error">
            {error ||
              usersError?.message ||
              profilesError?.message ||
              subscriptionSettingsError?.message}
          </p>
        )}
      </div>

      <div
        className={`modal admin-modal ${userModalOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={userModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setUserModalOpen(false);
            resetUserForm();
          }
        }}
      >
        <div className="modal__content admin-modal__content">
          <button
            className="modal__close"
            type="button"
            aria-label="Close"
            onClick={() => {
              setUserModalOpen(false);
              resetUserForm();
            }}
          >
            x
          </button>
          <h3 className="modal__title">Create user</h3>
          <form className="admin-form" onSubmit={handleCreateUser}>
            <input
              className="input"
              type="email"
              placeholder="Email (required)"
              value={newUserEmail}
              onChange={(event) => setNewUserEmail(event.target.value)}
            />
            <select
              className="input"
              value={newUserRole}
              onChange={(event) => setNewUserRole(event.target.value)}
            >
              <option value="customer">Customer</option>
              <option value="admin">Admin</option>
            </select>
            <input
              className="input"
              type="password"
              placeholder="Password (min 6 characters)"
              value={newUserPassword}
              onChange={(event) => setNewUserPassword(event.target.value)}
            />
            <div className="admin-form__actions">
              <button className="btn btn--secondary" type="button" onClick={resetUserForm}>
                Reset
              </button>
              <button className="btn btn--primary" type="submit" disabled={userSaving}>
                {userSaving ? "Saving..." : "Save User"}
              </button>
            </div>
            {error && <p className="admin-panel__error">{error}</p>}
            <p className="modal__meta">Note: This creates the Firebase Auth user and matching Firestore user document.</p>
          </form>
        </div>
      </div>

      <div
        className={`modal admin-modal admin-users-modal ${profileModalOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={profileModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeProfileModal();
          }
        }}
      >
        <div className="modal__content admin-modal__content admin-users-modal__content">
          <button className="modal__close" type="button" aria-label="Close" onClick={closeProfileModal}>
            x
          </button>
          <h3 className="modal__title">Edit user profile</h3>

          <section className="admin-users-modal__section">
            <h4>Account</h4>
            <div className="admin-users-account-grid">
              <p><strong>UID:</strong> {activeEditUser?.uid || editingUserId || "-"}</p>
              <p><strong>Email:</strong> {activeEditUser?.email || "No email"}</p>
              <p><strong>Role:</strong> {(activeEditUser?.role || "customer").toString()}</p>
            </div>
            <div className="admin-users-eft-approval">
              <label className="admin-users-checkbox">
                <input
                  type="checkbox"
                  checked={eftEligibilityDraft}
                  onChange={(event) => setEftEligibilityDraft(event.target.checked)}
                  disabled={eftEligibilitySaving}
                />
                Subscription EFT approved
              </label>
              <label>
                Approval note (optional)
                <input
                  className="input"
                  type="text"
                  maxLength={500}
                  value={eftEligibilityReason}
                  onChange={(event) => setEftEligibilityReason(event.target.value)}
                  disabled={eftEligibilitySaving}
                  placeholder="Reason or internal note"
                />
              </label>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={handleSaveEftEligibility}
                disabled={!editingUserId || eftEligibilitySaving}
              >
                {eftEligibilitySaving ? "Saving EFT..." : "Save EFT approval"}
              </button>
            </div>
            <div className="admin-users-modal__account-actions">
              <button
                className={`icon-btn ${activeEditUser?.role === "customer" ? "is-active" : ""}`}
                type="button"
                title="Set as customer"
                aria-label="Set as customer"
                onClick={() => handleSetRole(editingUserId, "customer")}
                disabled={!editingUserId || updatingId === editingUserId || activeEditUser?.role === "customer"}
              >
                <IconUser />
              </button>
              <button
                className={`icon-btn ${activeEditUser?.role === "admin" ? "is-active" : ""}`}
                type="button"
                title="Set as admin"
                aria-label="Set as admin"
                onClick={() => handleSetRole(editingUserId, "admin")}
                disabled={!editingUserId || updatingId === editingUserId || activeEditUser?.role === "admin"}
              >
                <IconShield />
              </button>
              <button
                className="icon-btn icon-btn--danger"
                type="button"
                title="Delete user"
                aria-label="Delete user"
                onClick={() => setDeleteDialog({ open: true, targetId: editingUserId })}
                disabled={!editingUserId || updatingId === editingUserId}
              >
                <IconTrash />
              </button>
            </div>
          </section>

          <section className="admin-users-modal__section">
            <h4>Customer information</h4>
            <div className="admin-form__section-grid">
              <label>
                Full name
                <input className="input" type="text" value={profileForm.fullName} onChange={handleProfileFieldChange("fullName")} maxLength={160} />
              </label>
              <label>
                Phone
                <input className="input" type="text" value={profileForm.phone} onChange={handleProfileFieldChange("phone")} maxLength={40} />
              </label>
            </div>
          </section>

          <section className="admin-users-modal__section">
            <h4>Communication preferences</h4>
            <div className="admin-users-preferences">
              <label className="admin-users-checkbox">
                <input type="checkbox" checked={profileForm.preferences.marketingEmails !== false} onChange={handlePreferenceChange("marketingEmails")} />
                Marketing emails
              </label>
              <label className="admin-users-checkbox">
                <input type="checkbox" checked={profileForm.preferences.orderUpdates !== false} onChange={handlePreferenceChange("orderUpdates")} />
                Order updates
              </label>
            </div>
          </section>

          <section className="admin-users-modal__section">
            <h4>Saved addresses</h4>
            <p className="modal__meta">{profileForm.addresses.length}/10 saved</p>
            <div className="admin-users-address-list">
              {profileForm.addresses.length ? profileForm.addresses.map((address) => {
                const isDefault = profileForm.defaultAddressId === address.id;
                const formattedAddress = formatShippingAddress(address);
                return (
                  <article className={`admin-users-address-card ${isDefault ? "is-default" : ""}`} key={address.id}>
                    <div className="admin-users-address-card__title">
                      <strong>{address.label || "Saved address"}{isDefault ? " (Default)" : ""}</strong>
                    </div>
                    <p className="modal__meta">{formattedAddress || "No address details"}</p>
                    <div className="admin-users-address-card__actions">
                      <button className="btn btn--secondary" type="button" disabled={isDefault} onClick={() => setDraftDefaultAddress(address.id)}>Set default</button>
                      <button className="btn btn--secondary" type="button" onClick={() => startEditAddress(address)}>Edit</button>
                      <button className="btn btn--secondary" type="button" onClick={() => removeDraftAddress(address.id)}>Remove</button>
                    </div>
                  </article>
                );
              }) : <p className="modal__meta">No saved addresses yet.</p>}
            </div>

            <div className="admin-users-address-editor">
              <div className="admin-users-address-editor__header">
                <h5>{addressDraftMode === "edit" ? "Edit address" : "Add address"}</h5>
                {addressDraftMode === "edit" && <button className="btn btn--secondary" type="button" onClick={resetAddressDraft}>Cancel edit</button>}
              </div>
              <div className="admin-users-address-grid">
                <label>
                  Address label
                  <input className="input" type="text" placeholder="Home, Work, Farm..." value={addressDraft.label} onChange={handleAddressDraftChange("label")} />
                </label>
                <label className="admin-users-address-grid__full">
                  Street address
                  <input className="input" type="text" value={addressDraft.street} onChange={handleAddressDraftChange("street")} />
                </label>
                <label>
                  Suburb
                  <input className="input" type="text" value={addressDraft.suburb} onChange={handleAddressDraftChange("suburb")} />
                </label>
                <label>
                  City
                  <input className="input" type="text" value={addressDraft.city} onChange={handleAddressDraftChange("city")} />
                </label>
                <label>
                  Province
                  <select className="input" value={addressDraft.province} onChange={handleAddressDraftChange("province")}>
                    <option value="">Select province</option>
                    {SA_PROVINCES.map((province) => (
                      <option key={province.value} value={province.value}>{province.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Postal code
                  <input className="input" type="text" pattern="\d{4}" maxLength={4} value={addressDraft.postalCode} onChange={handleAddressDraftChange("postalCode")} placeholder="0000" />
                </label>
              </div>
              <div className="admin-form__actions">
                <button className="btn btn--secondary" type="button" onClick={resetAddressDraft}>Clear</button>
                <button className="btn btn--primary" type="button" onClick={commitAddressDraft} disabled={profileSaving || (addressDraftMode === "add" && profileForm.addresses.length >= 10)}>{addressDraftMode === "edit" ? "Update address" : "Add address"}</button>
              </div>
            </div>
          </section>

          <div className="admin-form__actions">
            <button className="btn btn--secondary" type="button" onClick={closeProfileModal}>Close</button>
            <button className="btn btn--primary" type="button" onClick={handleSaveProfile} disabled={profileSaving}>{profileSaving ? "Saving..." : "Save profile"}</button>
          </div>
          {profileStatusMessage && <p className="admin-panel__status admin-users-modal__message">{profileStatusMessage}</p>}
          {profileError && <p className="admin-panel__error admin-users-modal__message">{profileError}</p>}
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete User"
        message="Are you sure you want to delete this user record This does not delete their auth account."
        confirmLabel="Delete"
        busy={deleteBusy}
        onCancel={() => setDeleteDialog({ open: false, targetId: null })}
        onConfirm={() => handleDeleteUser(deleteDialog.targetId)}
      />
    </div>
  );
}
