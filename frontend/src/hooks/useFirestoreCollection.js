import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase.js";

/**
 * Subscribe to a Firestore collection and keep local state in sync.
 * Falls back to the provided data if Firestore is unavailable or empty.
 */
export function useFirestoreCollection(
  collectionName,
  {
    orderByField = "createdAt",
    orderDirection = "desc",
    fallback = [],
    enabled = true,
    db: providedDb = null,
  } = {},
) {
  const [items, setItems] = useState(() => fallback);
  const [status, setStatus] = useState(() => {
    if (!enabled) return fallback.length ? "fallback" : "idle";
    return fallback.length ? "fallback" : "loading";
  });
  const [error, setError] = useState(null);
  const [source, setSource] = useState(() => (fallback.length ? "fallback" : null));
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);

  useEffect(() => {
    let unsubscribe;
    const fallbackData = fallbackRef.current;

    if (!enabled) {
      setItems(fallbackData);
      setSource(fallbackData.length ? "fallback" : null);
      setStatus(fallbackData.length ? "fallback" : "idle");
      setError(null);
      return undefined;
    }

    try {
      const db = providedDb || getFirebaseDb();
      const baseRef = collection(db, collectionName);
      const queryRef =
        orderByField && orderDirection
          ? query(baseRef, orderBy(orderByField, orderDirection))
          : baseRef;

      setStatus("loading");
      setError(null);

      unsubscribe = onSnapshot(
        queryRef,
        (snapshot) => {
          const docs = snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }));

          if (docs.length > 0) {
            setItems(docs);
            setSource("remote");
            setStatus("success");
          } else {
            const fallbackData = fallbackRef.current;
            setItems(fallbackData);
            setSource(fallbackData.length ? "fallback" : "remote-empty");
            setStatus(fallbackData.length ? "fallback" : "empty");
          }
        },
        (snapshotError) => {
          console.warn(`Failed to subscribe to ${collectionName}`, snapshotError);
          const fallbackData = fallbackRef.current;
          setItems(fallbackData);
          setSource(fallbackData.length ? "fallback" : "error");
          setError(snapshotError);
          setStatus(fallbackData.length ? "fallback" : "error");
        },
      );
    } catch (subscriptionError) {
      console.warn(`Firestore unavailable for ${collectionName}`, subscriptionError);
      setItems(fallbackData);
      setSource(fallbackData.length ? "fallback" : "error");
      setError(subscriptionError);
      setStatus(fallbackData.length ? "fallback" : "error");
    }

    return () => unsubscribe?.();
  }, [collectionName, enabled, orderByField, orderDirection, providedDb]);

  return {
    items,
    status,
    error,
    source,
    isFallback: source === "fallback",
  };
}
