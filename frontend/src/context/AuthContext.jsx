import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "../lib/firebase.js";

const AuthContext = createContext(null);

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

      if (!db) {
        const configError = new Error("Firestore is not configured.");
        setRole("customer");
        setRoleLoading(false);
        setRoleError(configError);
        return "customer";
      }

      setRoleLoading(true);
      setRoleError(null);

      try {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const snapshot = await getDoc(userDocRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          const resolvedRole = typeof data.role === "string" ? data.role : "customer";
          if (isMountedRef.current) {
            setRole(resolvedRole);
          }
          return resolvedRole;
        }

        await setDoc(
          userDocRef,
          {
            role: "customer",
            email: firebaseUser.email ?? "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        if (isMountedRef.current) {
          setRole("customer");
        }
        return "customer";
      } catch (error) {
        console.warn("Failed to load user role", error);
        if (isMountedRef.current) {
          setRole("customer");
          setRoleError(error);
        }
        return "customer";
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
        ? (email, password) => signInWithEmailAndPassword(auth, email, password)
        : () => Promise.reject(initError ?? new Error("Firebase not configured")),
      signOut: auth ? () => signOut(auth) : () => Promise.resolve(),
    }),
    [auth, initError, loading, refreshRole, role, roleError, roleLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
