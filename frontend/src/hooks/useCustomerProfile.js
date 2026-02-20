import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { getFirebaseDb } from "../lib/firebase.js";

const PROFILE_COLLECTION = "customerProfiles";
const MAX_PROFILE_ADDRESSES = 10;

const emptyProfile = {
  uid: "",
  email: "",
  fullName: "",
  phone: "",
  addresses: [],
  defaultAddressId: "",
  preferences: {
    marketingEmails: true,
    orderUpdates: true,
  },
};

const normalizeAddress = (value = {}) => {
  if (!value || typeof value !== "object") return null;
  const id = (value.id || "").toString().trim();
  const street = (value.street || "").toString().trim();
  const suburb = (value.suburb || "").toString().trim();
  const city = (value.city || "").toString().trim();
  const province = (value.province || "").toString().trim();
  const postalCode = (value.postalCode || "").toString().trim();
  const label = (value.label || "").toString().trim();

  if (!id || !street || !suburb || !city || !province || !postalCode) return null;

  return {
    id,
    label: label || "Address",
    street,
    suburb,
    city,
    province,
    postalCode,
  };
};

const normalizeAddresses = (addressesInput = []) => {
  const unique = new Map();
  (Array.isArray(addressesInput) ? addressesInput : [])
    .map((entry) => normalizeAddress(entry))
    .filter(Boolean)
    .forEach((address) => {
      if (!unique.has(address.id)) {
        unique.set(address.id, address);
      }
    });
  return Array.from(unique.values()).slice(0, MAX_PROFILE_ADDRESSES);
};

const normalizeProfilePayload = (input = {}, { uid = "", email = "" } = {}) => {
  const addresses = normalizeAddresses(input.addresses);
  const defaultAddressIdRaw = (input.defaultAddressId || "").toString().trim();
  const defaultAddressId =
    defaultAddressIdRaw && addresses.some((entry) => entry.id === defaultAddressIdRaw)
      ? defaultAddressIdRaw
      : addresses[0]?.id || "";

  return {
    uid,
    email,
    fullName: (input.fullName || "").toString().trim(),
    phone: (input.phone || "").toString().trim(),
    addresses,
    defaultAddressId,
    preferences: {
      marketingEmails: input.preferences?.marketingEmails !== false,
      orderUpdates: input.preferences?.orderUpdates !== false,
    },
    createdAt: input.createdAt || null,
    updatedAt: input.updatedAt || null,
  };
};

export function useCustomerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user?.uid || !db) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const profileRef = doc(db, PROFILE_COLLECTION, user.uid);
    setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() || {};
          setProfile(
            normalizeProfilePayload(data, {
              uid: user.uid,
              email: user.email || "",
            }),
          );
        } else {
          setProfile(
            normalizeProfilePayload(emptyProfile, {
              uid: user.uid,
              email: user.email || "",
            }),
          );
        }
        setLoading(false);
      },
      (snapshotError) => {
        console.warn("Failed to load customer profile", snapshotError);
        setError(snapshotError);
        setProfile(
          normalizeProfilePayload(emptyProfile, {
            uid: user.uid,
            email: user.email || "",
          }),
        );
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [db, user?.uid, user?.email]);

  const saveProfile = useCallback(
    async (input = {}) => {
      if (!user?.uid) {
        throw new Error("Sign in to save your profile.");
      }
      if (!db) {
        throw new Error("Firestore is not configured.");
      }

      const normalized = normalizeProfilePayload(input, {
        uid: user.uid,
        email: user.email || "",
      });
      const profileRef = doc(db, PROFILE_COLLECTION, user.uid);
      setSaving(true);
      setError(null);

      try {
        await setDoc(
          profileRef,
          {
            ...normalized,
            createdAt: profile?.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        return normalized;
      } catch (saveError) {
        console.warn("Failed to save customer profile", saveError);
        setError(saveError);
        throw saveError;
      } finally {
        setSaving(false);
      }
    },
    [db, profile?.createdAt, user?.uid, user?.email],
  );

  return {
    profile,
    loading,
    saving,
    error,
    saveProfile,
  };
}
