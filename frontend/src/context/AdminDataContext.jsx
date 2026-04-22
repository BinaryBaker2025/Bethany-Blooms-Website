import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getFirebaseDb, getFirebaseStorage } from "../lib/firebase.js";
import { useAuth } from "./AuthContext.jsx";

const AdminDataContext = createContext(null);

function parseSortableWorkshopDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === "function") {
    try {
      const converted = value.toDate();
      return Number.isNaN(converted.getTime()) ? null : converted;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function resolveWorkshopSortDate(workshop = {}) {
  const explicitDate = parseSortableWorkshopDate(workshop?.scheduledFor);
  if (explicitDate) return explicitDate;
  const sessions = Array.isArray(workshop?.sessions) ? workshop.sessions : [];
  for (const session of sessions) {
    const directStart = parseSortableWorkshopDate(session?.start || session?.startDate);
    if (directStart) return directStart;
    const dateValue = (session?.date || "").toString().trim();
    const timeValue = (session?.time || "").toString().trim();
    if (!dateValue) continue;
    const parsed = parseSortableWorkshopDate(`${dateValue}T${timeValue || "00:00"}`);
    if (parsed) return parsed;
  }
  return null;
}

function sortWorkshops(items = []) {
  return [...items].sort((left, right) => {
    const leftDate = resolveWorkshopSortDate(left);
    const rightDate = resolveWorkshopSortDate(right);
    if (leftDate && rightDate) {
      return leftDate.getTime() - rightDate.getTime();
    }
    if (leftDate) return -1;
    if (rightDate) return 1;
    return (left?.title || left?.name || "").localeCompare(
      right?.title || right?.name || "",
      undefined,
      { sensitivity: "base" },
    );
  });
}

export function AdminDataProvider({ children }) {
  const { user, isAdmin, role } = useAuth();
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState(null);
  const [products, setProducts] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [productTags, setProductTags] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [workshopBookingEmailAudit, setWorkshopBookingEmailAudit] = useState([]);
  const [orders, setOrders] = useState([]);
  const [events, setEvents] = useState([]);
  const [cutFlowerBookings, setCutFlowerBookings] = useState([]);
  const [cutFlowerClasses, setCutFlowerClasses] = useState([]);
  const readyRef = useRef({
    products: false,
    productCategories: false,
    productTags: false,
    workshops: false,
    bookings: false,
    workshopBookingEmailAudit: false,
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
      setProductCategories([]);
      setProductTags([]);
      setWorkshops([]);
      setBookings([]);
      setWorkshopBookingEmailAudit([]);
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
      productCategories: false,
      productTags: false,
      workshops: false,
      bookings: false,
      workshopBookingEmailAudit: false,
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

    const categoriesUnsub = onSnapshot(
      query(collection(db, "productCategories"), orderBy("name", "asc")),
      (snapshot) => {
        setProductCategories(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("productCategories");
      },
      handleError,
    );

    const tagsUnsub = onSnapshot(
      query(collection(db, "productTags"), orderBy("name", "asc")),
      (snapshot) => {
        setProductTags(snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })));
        setInventoryError(null);
        markReady("productTags");
      },
      handleError,
    );

    const workshopsUnsub = onSnapshot(
      collection(db, "workshops"),
      (snapshot) => {
        const workshopDocs = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }));
        setWorkshops(sortWorkshops(workshopDocs));
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

    const workshopBookingEmailAuditUnsub = onSnapshot(
      query(collection(db, "workshopBookingEmailAudit"), orderBy("updatedAt", "desc")),
      (snapshot) => {
        setWorkshopBookingEmailAudit(
          snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() })),
        );
        setInventoryError(null);
        markReady("workshopBookingEmailAudit");
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
      categoriesUnsub();
      tagsUnsub();
      workshopsUnsub();
      bookingsUnsub();
      workshopBookingEmailAuditUnsub();
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
      productCategories,
      productTags,
      workshops,
      bookings,
      workshopBookingEmailAudit,
      orders,
      events,
      cutFlowerBookings,
      cutFlowerClasses,
    }),
    [
      bookings,
      workshopBookingEmailAudit,
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
      productCategories,
      productTags,
      role,
      storage,
      user,
      workshops,
    ],
  );

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (!context) throw new Error("useAdminData must be used within AdminDataProvider");
  return context;
}
