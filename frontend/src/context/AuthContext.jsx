import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, getDocFromCache, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "../lib/firebase.js";

const AuthContext = createContext(null);
const ROLE_CACHE_KEY = "bethany-blooms-auth-role-cache-v1";
const ROLE_CACHE_LIMIT = 80;

function normalizeAuthEmail(value = "") {
  return (value || "").toString().trim().toLowerCase();
}

function normalizeRoleValue(value, fallback = "customer") {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "admin") return "admin";
  if (normalized === "customer") return "customer";
  return fallback;
}

function decodeJwtPayload(token = "") {
  const raw = (token || "").toString().trim();
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  const encodedPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (encodedPayload.length % 4 || 4)) % 4);
  try {
    const json = atob(`${encodedPayload}${padding}`);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function readRoleCache() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ROLE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRoleCache(cache = {}) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache persistence failures.
  }
}

function readCachedRole(uid = "") {
  const normalizedUid = (uid || "").toString().trim();
  if (!normalizedUid) return null;
  const cache = readRoleCache();
  const entry = cache[normalizedUid];
  if (!entry || typeof entry !== "object") return null;
  return normalizeRoleValue(entry.role, null);
}

function writeCachedRole(uid = "", role = "") {
  const normalizedUid = (uid || "").toString().trim();
  const normalizedRole = normalizeRoleValue(role, null);
  if (!normalizedUid || !normalizedRole) return;

  const cache = readRoleCache();
  cache[normalizedUid] = {
    role: normalizedRole,
    updatedAt: Date.now(),
  };
  const entries = Object.entries(cache)
    .sort((left, right) => Number(right?.[1]?.updatedAt || 0) - Number(left?.[1]?.updatedAt || 0))
    .slice(0, ROLE_CACHE_LIMIT);
  writeRoleCache(Object.fromEntries(entries));
}

function readRoleFromUserToken(firebaseUser) {
  const token =
    (firebaseUser?.accessToken || "").toString().trim() ||
    (firebaseUser?.stsTokenManager?.accessToken || "").toString().trim();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  return normalizeRoleValue(payload?.role, null);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(null);
  const [initError, setInitError] = useState(null);
  const [role, setRole] = useState("guest");
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState(null);
  const isMountedRef = useRef(true);

  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    try {
      const instance = getFirebaseAuth();
      setAuth(instance);
    } catch (error) {
      console.warn("Firebase not configured", error);
      setInitError(error);
      setLoading(false);
    }
  }, []);

  const loadRole = useCallback(
    async (firebaseUser) => {
      if (!isMountedRef.current) return "guest";

      if (!firebaseUser) {
        setRole("guest");
        setRoleLoading(false);
        setRoleError(null);
        return "guest";
      }

      const cachedRole = readCachedRole(firebaseUser.uid);
      const tokenRole = readRoleFromUserToken(firebaseUser);
      const fastResolvedRole = normalizeRoleValue(tokenRole || cachedRole, null);
      if (fastResolvedRole && isMountedRef.current) {
        setRole(fastResolvedRole);
      }
      if (tokenRole) {
        writeCachedRole(firebaseUser.uid, tokenRole);
      }

      if (!db) {
        const configError = new Error("Firestore is not configured.");
        const fallbackRole = fastResolvedRole || "customer";
        setRole(fallbackRole);
        setRoleLoading(false);
        setRoleError(configError);
        return fallbackRole;
      }

      setRoleLoading(true);
      setRoleError(null);

      try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const snapshot = await getDoc(userDocRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          const resolvedRole = normalizeRoleValue(data?.role, fastResolvedRole || "customer");
          const storedUid = (data?.uid || "").toString().trim();
          if (storedUid !== firebaseUser.uid) {
            await setDoc(
              userDocRef,
              {
                uid: firebaseUser.uid,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
          writeCachedRole(firebaseUser.uid, resolvedRole);
          if (isMountedRef.current) {
            setRole(resolvedRole);
          }
          return resolvedRole;
        }

        await setDoc(
          userDocRef,
          {
            uid: firebaseUser.uid,
            role: "customer",
            email: firebaseUser.email ?? "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        writeCachedRole(firebaseUser.uid, "customer");
        if (isMountedRef.current) {
          setRole("customer");
        }
        return "customer";
      } catch (error) {
        console.warn("Failed to load user role", error);
        const fallbackRole = fastResolvedRole || "customer";
        if (isMountedRef.current) {
          setRole(fallbackRole);
          setRoleError(error);
        }
        if (fastResolvedRole) {
          writeCachedRole(firebaseUser.uid, fastResolvedRole);
        }
        return fallbackRole;
      } finally {
        if (isMountedRef.current) {
          setRoleLoading(false);
        }
      }
    },
    [db],
  );

  const refreshRole = useCallback(() => {
    if (!auth?.currentUser) {
      setRole("guest");
      setRoleError(null);
      setRoleLoading(false);
      return Promise.resolve("guest");
    }
    return loadRole(auth.currentUser);
  }, [auth, loadRole]);

  useEffect(() => {
    if (!auth) return undefined;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isMountedRef.current) return;
      setUser(firebaseUser);
      loadRole(firebaseUser).finally(() => {
        if (isMountedRef.current) {
          setLoading(false);
        }
      });
    });
    return unsubscribe;
  }, [auth, loadRole]);

  const value = useMemo(
    () => ({
      user,
      loading: loading || roleLoading,
      initError,
      role,
      roleLoading,
      roleError,
      isAdmin: role === "admin",
      refreshRole,
      signIn: auth
        ? async (email, password) => {
            const credentials = await signInWithEmailAndPassword(
              auth,
              normalizeAuthEmail(email),
              (password || "").toString(),
            );
            const uid = credentials?.user?.uid || "";
            const cachedRole = readCachedRole(uid);
            const tokenRole = readRoleFromUserToken(credentials?.user);
            let fastResolvedRole = normalizeRoleValue(tokenRole || cachedRole, null);
            if (!fastResolvedRole && db && uid) {
              try {
                const cachedSnapshot = await getDocFromCache(doc(db, "users", uid));
                if (cachedSnapshot.exists()) {
                  fastResolvedRole = normalizeRoleValue(cachedSnapshot.data()?.role, null);
                }
              } catch {
                // Ignore cache miss and fall back to regular auth-state listener role load.
              }
            }
            if (fastResolvedRole && isMountedRef.current) {
              setRole(fastResolvedRole);
            }
            if (uid && fastResolvedRole) {
              writeCachedRole(uid, fastResolvedRole);
            }
            credentials.resolvedRole = fastResolvedRole || null;
            return credentials;
          }
        : () => Promise.reject(initError ?? new Error("Firebase not configured")),
      signUp: auth
        ? async (email, password) => {
            const normalizedEmail = normalizeAuthEmail(email);
            const credentials = await createUserWithEmailAndPassword(
              auth,
              normalizedEmail,
              (password || "").toString(),
            );
            if (db && credentials?.user?.uid) {
              const profileEmail = credentials.user.email ?? normalizedEmail;
              await setDoc(
                doc(db, "users", credentials.user.uid),
                {
                  uid: credentials.user.uid,
                  role: "customer",
                  email: profileEmail,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              );
              await setDoc(
                doc(db, "customerProfiles", credentials.user.uid),
                {
                  uid: credentials.user.uid,
                  email: profileEmail,
                  fullName: "",
                  phone: "",
                  addresses: [],
                  defaultAddressId: "",
                  preferences: {
                    marketingEmails: true,
                    orderUpdates: true,
                  },
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              );
            }
            return credentials;
          }
        : () => Promise.reject(initError ?? new Error("Firebase not configured")),
      resetPassword: auth
        ? (email) => sendPasswordResetEmail(auth, (email || "").toString().trim())
        : () => Promise.reject(initError ?? new Error("Firebase not configured")),
      signOut: auth ? () => signOut(auth) : () => Promise.resolve(),
    }),
    [auth, db, initError, loading, refreshRole, role, roleError, roleLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
