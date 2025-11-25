import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getFirebaseDb, getFirebaseStorage } from "../lib/firebase.js";
import { useAuth } from "./AuthContext.jsx";

const AdminDataContext = createContext(null);

export function AdminDataProvider({ children }) {
  const { user, isAdmin, role } = useAuth();
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState(null);
  const [products, setProducts] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [events, setEvents] = useState([]);
  const [cutFlowerBookings, setCutFlowerBookings] = useState([]);
  const [cutFlowerClasses, setCutFlowerClasses] = useState([]);
  const readyRef = useRef({
    products: false,
    workshops: false,
    bookings: false,
    orders: false,
    events: false,
    cutFlowerBookings: false,
    cutFlowerClasses: false,
  });

  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);

  const storage = useMemo(() => {
    try {
      return getFirebaseStorage();
    } catch {
      return null;
    }
  }, []);

  const inventoryEnabled = Boolean(db && user && isAdmin);

  useEffect(() => {
    if (!inventoryEnabled) {
      setProducts([]);
      setWorkshops([]);
      setBookings([]);
      setOrders([]);
      setEvents([]);
      setCutFlowerBookings([]);
      setCutFlowerClasses([]);
      setInventoryLoading(false);
      setInventoryError(null);
      return undefined;
    }

    setInventoryLoading(true);
    readyRef.current = {
      products: false,
      workshops: false,
      bookings: false,
      orders: false,
      events: false,
      cutFlowerBookings: false,
      cutFlowerClasses: false,
    };

    const markReady = (key) => {
      if (readyRef.current[key]) return;
      readyRef.current[key] = true;
      if (Object.values(readyRef.current).every(Boolean)) {
        setInventoryLoading(false);
      }
    };

    const handleError = (error) => {
      console.error("[AdminData]", error);
      setInventoryError(error.message);
      setInventoryLoading(false);
    };

    const productsUnsub = onSnapshot(
      query(collection(db, "products"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setProducts(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("products");
      },
      handleError,
    );

    const workshopsUnsub = onSnapshot(
      query(collection(db, "workshops"), orderBy("scheduledFor", "asc")),
      (snapshot) => {
        setWorkshops(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("workshops");
      },
      handleError,
    );

    const bookingsUnsub = onSnapshot(
      query(collection(db, "bookings"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setBookings(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("bookings");
      },
      handleError,
    );

    const ordersUnsub = onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setOrders(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("orders");
      },
      handleError,
    );

    const eventsUnsub = onSnapshot(
      query(collection(db, "events"), orderBy("eventDate", "asc")),
      (snapshot) => {
        setEvents(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("events");
      },
      handleError,
    );

    const cutFlowerBookingsUnsub = onSnapshot(
      query(collection(db, "cutFlowerBookings"), orderBy("eventDate", "asc")),
      (snapshot) => {
        setCutFlowerBookings(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("cutFlowerBookings");
      },
      handleError,
    );

    const cutFlowerClassesUnsub = onSnapshot(
      query(collection(db, "cutFlowerClasses"), orderBy("eventDate", "asc")),
      (snapshot) => {
        setCutFlowerClasses(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("cutFlowerClasses");
      },
      handleError,
    );

    return () => {
      productsUnsub();
      workshopsUnsub();
      bookingsUnsub();
      ordersUnsub();
      eventsUnsub();
      cutFlowerBookingsUnsub();
      cutFlowerClassesUnsub();
    };
  }, [db, inventoryEnabled, user, isAdmin]);

  const value = useMemo(
    () => ({
      db,
      storage,
      user,
      isAdmin,
      role,
      inventoryEnabled,
      inventoryLoading,
      inventoryError,
      setInventoryError,
      products,
      workshops,
      bookings,
      orders,
      events,
      cutFlowerBookings,
      cutFlowerClasses,
    }),
    [
      bookings,
      db,
      inventoryEnabled,
      inventoryError,
      inventoryLoading,
      isAdmin,
      orders,
      events,
      cutFlowerBookings,
      cutFlowerClasses,
      products,
      role,
      storage,
      user,
      workshops,
    ],
  );

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) throw new Error("useAdminData must be used within AdminDataProvider");
  return context;
}
