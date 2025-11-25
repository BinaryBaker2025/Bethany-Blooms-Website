import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Reveal from "../components/Reveal.jsx";
import { read, utils } from "xlsx";
import { useAdminData } from "../context/AdminDataContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { seedSampleData } from "../lib/seedData.js";
import { getFirebaseFunctions } from "../lib/firebase.js";
import {
  DEFAULT_SLOT_CAPACITY,
  AUTO_REPEAT_DAYS,
  createDateGroup,
  createTimeSlot,
} from "./admin/constants.js";

const INITIAL_PRODUCT_FORM = {
  name: "",
  title: "",
  description: "",
  price: "",
  image: "",
  category: "product",
  status: "live",
  quantity: "1",
  featured: false,
};

const INITIAL_WORKSHOP_FORM = {
  title: "",
  description: "",
  scheduledFor: "",
  price: "",
  location: "",
  image: "",
  status: "live",
  whatToExpect: "",
  bookingPricing: "",
  goodToKnow: "",
  cancellations: "",
  groupsInfo: "",
  careInfo: "",
  whyPeopleLove: "",
  ctaNote: "",
  dateGroups: [createDateGroup()],
  repeatWeekdays: false,
};

const INITIAL_EVENT_FORM = {
  title: "",
  description: "",
  location: "",
  date: "",
  time: "",
  image: "",
  workshopId: "",
  status: "live",
};

const INITIAL_CUT_FLOWER_BOOKING = {
  customerName: "",
  email: "",
  phone: "",
  occasion: "",
  location: "",
  budget: "",
  date: "",
  time: "",
  status: "new",
  notes: "",
};

const CUT_FLOWER_STATUS_OPTIONS = ["new", "proposal-sent", "confirmed", "in-progress", "fulfilled", "cancelled"];

const INITIAL_CUT_FLOWER_CLASS_FORM = {
  title: "",
  description: "",
  location: "",
  price: "",
  capacity: "",
  image: "",
  date: "",
  time: "",
  status: "live",
};
const ORDER_STATUSES = [
  "pending",
  "processing",
  "ready",
  "fulfilled",
  "cancelled",
];
const DELIVERY_METHODS = ["company", "courier"];
const COURIER_OPTIONS = [
  "The Courier Guy",
  "DSV",
  "Fastway",
  "Aramex",
  "PUDO",
  "PostNet",
  "uAfrica/Skynet",
  "Other",
];
const ADMIN_PAGE_SIZE = 100;
const MAX_FEATURED_PRODUCTS = 4;
const bookingDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});
const moneyFormatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 2,
});

const IconPlus = ({ title = "Add", ...props }) => (
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
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IconEdit = ({ title = "Edit", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M12.5 6.5l5 5" />
    <path d="M5 17.5l1.5-5 8-8a1.5 1.5 0 0 1 2.1 0l1.9 1.9a1.5 1.5 0 0 1 0 2.1l-8 8-5 1.5Z" />
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
    strokeWidth="1.6"
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

const IconImage = ({ title = "Image", ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-4-4-4 5-3-3-5 6" />
  </svg>
);

const IconStar = ({ title = "Featured", filled = false, ...props }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <title>{title}</title>
    <path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.9l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8Z" />
  </svg>
);

const IconCheck = ({ title = "Success", ...props }) => (
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
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);

const parseDateValue = (value) => {
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
};

const formatDateInput = (date) => date.toISOString().slice(0, 10);
const formatTimeInput = (date) => date.toISOString().slice(11, 16);

const combineDateAndTime = (dateInput, timeInput) => {
  if (!dateInput) return null;
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return null;
  if (timeInput) {
    const [hours, minutes] = timeInput.split(":").map(Number);
    if (Number.isFinite(hours)) base.setHours(hours);
    if (Number.isFinite(minutes)) base.setMinutes(minutes);
    base.setSeconds(0, 0);
  }
  return base;
};

const formatPriceLabel = (value) => {
  if (value === undefined || value === null) return "—";
  if (typeof value === "number") return moneyFormatter.format(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return moneyFormatter.format(numeric);
  return value;
};

const slugifyId = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const stripSheetLinkLabel = (value = "") =>
  value.toString().replace(/\s+link\s*$/i, "").trim();

const parseSheetPriceValue = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  const cleaned = String(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  if (!cleaned) return "";
  const parsed = Number(cleaned);
  if (Number.isFinite(parsed)) {
    return Math.round(parsed * 100) / 100;
  }
  return String(value).trim();
};

const getPrimarySession = (workshop) => {
  if (!Array.isArray(workshop.sessions)) return null;
  if (workshop.primarySessionId) {
    return (
      workshop.sessions.find(
        (session) => session.id === workshop.primarySessionId
      ) || null
    );
  }
  return workshop.sessions[0] || null;
};

const getSessionLabel = (session) => {
  if (!session) return "No session";
  if (session.label) return session.label;
  const dateTime = combineDateAndTime(session.date, session.time);
  if (!dateTime) return session.time || "Session";
  return bookingDateFormatter.format(dateTime);
};

function useUploadAsset(storage) {
  return async function uploadAsset(file, folder) {
    if (!storage) throw new Error("Firebase Storage is not configured.");
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
    const objectPath = `${folder}/${Date.now()}-${sanitizedName}`;
    const storageRef = ref(storage, objectPath);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  };
}

export function AdminDashboardView() {
  usePageMetadata({
    title: "Admin · Dashboard",
    description:
      "Quick stats for Bethany Blooms inventory, workshops, and orders.",
  });
  const { user } = useAuth();
  const {
    db,
    products,
    workshops,
    bookings,
    orders,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedStatus, setSeedStatus] = useState(null);
  const [seedError, setSeedError] = useState(null);

  const stats = useMemo(() => {
    const upcomingWorkshops = workshops.filter((workshop) => {
      const primary = getPrimarySession(workshop);
      if (!primary) return false;
      const parsed =
        combineDateAndTime(primary.date, primary.time) ||
        parseDateValue(primary.start);
      return parsed ? parsed >= new Date() : false;
    }).length;

    const confirmedBookings = bookings.length;
    const openOrders = orders.filter(
      (order) => order.status !== "fulfilled" && order.status !== "cancelled"
    ).length;
    const totalProducts = products.length;

    return [
      {
        id: "products",
        label: "Products",
        value: totalProducts,
        hint: "Live items",
      },
      {
        id: "workshops",
        label: "Workshops",
        value: upcomingWorkshops,
        hint: "Upcoming",
      },
      {
        id: "bookings",
        label: "Bookings",
        value: confirmedBookings,
        hint: "Latest 30 days",
      },
      {
        id: "orders",
        label: "Open Orders",
        value: openOrders,
        hint: "Needs attention",
      },
    ];
  }, [bookings.length, orders, products.length, workshops]);

  const quickLinks = [
    {
      to: "/admin/products",
      title: "Products",
      body: "Upload imagery & pricing",
    },
    {
      to: "/admin/workshops",
      title: "Workshops",
      body: "Session slots & bookings",
    },
    {
      to: "/admin/cut-flowers/classes",
      title: "Cut Flowers",
      body: "Custom blooms & installs",
    },
    {
      to: "/admin/events",
      title: "Events",
      body: "Pop-ups & launches",
    },
    { to: "/admin/orders", title: "Orders", body: "Manage payments" },
    { to: "/admin/profile", title: "Profile", body: "Account & sign out" },
  ];

  const upcomingSessions = useMemo(() => {
    const sessions = [];
    workshops.forEach((workshop) => {
      (workshop.sessions || []).forEach((session) => {
        const parsed =
          combineDateAndTime(session.date, session.time) ||
          parseDateValue(session.start);
        if (!parsed) return;
        sessions.push({
          id: `${workshop.id}-${session.id}`,
          workshop,
          session,
          date: parsed,
        });
      });
    });
    return sessions
      .filter((entry) => entry.date >= new Date())
      .sort((a, b) => a.date - b.date)
      .slice(0, 4);
  }, [workshops]);

  const recentOrders = useMemo(() => orders.slice(0, 4), [orders]);

  const handleSeedData = async () => {
    if (!db) {
      setSeedError("Firebase is not configured. Add credentials in .env.");
      return;
    }
    setSeedLoading(true);
    setSeedStatus("Loading sample data…");
    setSeedError(null);
    try {
      const { seededProducts, seededWorkshops } = await seedSampleData(db);
      if (!seededProducts && !seededWorkshops) {
        setSeedStatus("Sample data already present.");
      } else {
        setSeedStatus("Sample products & workshops added.");
      }
    } catch (error) {
      setSeedError(error.message);
      setSeedStatus(null);
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <div className="admin-dashboard">
      <Reveal as="section" className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <h2>Hi {user?.email || "admin"}</h2>
            <p className="admin-panel__note">
              Monitor what is live before jumping into edits.
            </p>
          </div>
          <div className="admin-panel__header-actions">
            <button
              className="btn btn--secondary"
              type="button"
              onClick={handleSeedData}
              disabled={seedLoading}
            >
              <IconPlus className="btn__icon" aria-hidden="true" />
              {seedLoading ? "Seeding…" : "Load Demo Data"}
            </button>
          </div>
        </div>
        <div className="admin-stats-grid">
          {stats.map((stat) => (
            <div key={stat.id} className="admin-stat-card">
              <p className="admin-stat-card__label">{stat.label}</p>
              <p className="admin-stat-card__value">{stat.value}</p>
              <p className="admin-stat-card__hint">{stat.hint}</p>
            </div>
          ))}
        </div>
        {seedStatus && <p className="admin-panel__status">{seedStatus}</p>}
        {seedError && <p className="admin-panel__error">{seedError}</p>}
      </Reveal>

      <Reveal as="section" className="admin-panel" delay={60}>
        <h3>Quick Links</h3>
        <div className="admin-quick-links">
          {quickLinks.map((link) => (
            <Link key={link.to} className="admin-quick-card" to={link.to}>
              <span>{link.title}</span>
              <p>{link.body}</p>
            </Link>
          ))}
        </div>
      </Reveal>

      <div className="admin-panel__content admin-panel__content--split">
        <Reveal as="section" className="admin-panel" delay={90}>
          <div className="admin-panel__header">
            <h3>Upcoming sessions</h3>
            {inventoryLoading && (
              <span className="badge badge--muted">Syncing…</span>
            )}
          </div>
          {upcomingSessions.length > 0 ? (
            <ul className="admin-panel__list">
              {upcomingSessions.map((entry) => (
                <li key={entry.id} className="admin-session-card">
                  <p>
                    <strong>{entry.workshop.title}</strong>
                    <span className="modal__meta">
                      {bookingDateFormatter.format(entry.date)}
                    </span>
                  </p>
                  <p className="modal__meta">
                    Capacity {entry.session.capacity || DEFAULT_SLOT_CAPACITY} ·{" "}
                    {entry.workshop.location || "Studio"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-panel__notice">No sessions scheduled yet.</p>
          )}
        </Reveal>

        <Reveal as="section" className="admin-panel" delay={120}>
          <div className="admin-panel__header">
            <h3>Recent orders</h3>
            {inventoryLoading && (
              <span className="badge badge--muted">Syncing…</span>
            )}
          </div>
          {recentOrders.length > 0 ? (
            <ul className="admin-panel__list">
              {recentOrders.map((order) => (
                <li key={order.id} className="admin-order-card">
                  <div>
                    <p>
                      <strong>{order.customer?.fullName || "Guest"}</strong>
                    </p>
                    <p className="modal__meta">
                      {order.customer?.email || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="modal__meta">
                      {order.items?.length || 0} item(s)
                    </p>
                    <p className="modal__meta">
                      {formatPriceLabel(order.totalPrice)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-panel__notice">No orders just yet.</p>
          )}
        </Reveal>
      </div>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
    </div>
  );
}

export function AdminProductsView() {
  usePageMetadata({
    title: "Admin · Products",
    description: "Manage Bethany Blooms product listings stored in Firebase.",
  });
  const {
    db,
    storage,
    products,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const [statusMessage, setStatusMessage] = useState(null);
  const [productForm, setProductForm] = useState(INITIAL_PRODUCT_FORM);
  const [editingProductId, setEditingProductId] = useState(null);
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [productImageFile, setProductImageFile] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [productError, setProductError] = useState(null);
  const [productSaving, setProductSaving] = useState(false);
  const [productPage, setProductPage] = useState(0);
  const productPreviewUrlRef = useRef(null);
  const productImportInputRef = useRef(null);
  const [productImporting, setProductImporting] = useState(false);
  const [featuredUpdatingId, setFeaturedUpdatingId] = useState(null);
  const uploadAsset = useUploadAsset(storage);
  const featuredProductCount = useMemo(
    () => products.filter((product) => product.featured).length,
    [products]
  );

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(
    () => () => {
      if (productPreviewUrlRef.current) {
        URL.revokeObjectURL(productPreviewUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(products.length / ADMIN_PAGE_SIZE) - 1);
    setProductPage((prev) => Math.min(prev, maxPage));
  }, [products.length]);

  const paginatedProducts = useMemo(() => {
    const start = productPage * ADMIN_PAGE_SIZE;
    return products.slice(start, start + ADMIN_PAGE_SIZE);
  }, [products, productPage]);

  const openProductModal = () => {
    setProductForm(INITIAL_PRODUCT_FORM);
    setProductImageFile(null);
    setProductImagePreview("");
    setEditingProductId(null);
    setProductError(null);
    setProductModalOpen(true);
  };

  const closeProductModal = () => {
    setProductModalOpen(false);
    setProductImageFile(null);
    setProductImagePreview("");
    setEditingProductId(null);
    setProductError(null);
    setProductSaving(false);
  };

  const handleProductImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (productPreviewUrlRef.current) {
      URL.revokeObjectURL(productPreviewUrlRef.current);
      productPreviewUrlRef.current = null;
    }
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        setProductError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(file);
      productPreviewUrlRef.current = preview;
      setProductImageFile(file);
      setProductImagePreview(preview);
    } else {
      setProductImageFile(null);
      setProductImagePreview(productForm.image || "");
    }
  };

  const handleEditProduct = (product) => {
    setProductForm({
      name: product.name || product.title || "",
      title: product.title || "",
      description: product.description || "",
      price:
        product.price === undefined || product.price === null
          ? ""
          : String(product.price),
      image: product.image || "",
      category: product.category || "product",
      status: product.status || "draft",
      quantity:
        product.quantity === undefined || product.quantity === null
          ? "1"
          : String(product.quantity),
      featured: Boolean(product.featured),
    });
    setProductImagePreview(product.image || "");
    setProductImageFile(null);
    setEditingProductId(product.id);
    setProductError(null);
    setProductModalOpen(true);
  };

  const handleDeleteProduct = async (productId) => {
    if (!db || !inventoryEnabled) return;
    await deleteDoc(doc(db, "products", productId));
    setStatusMessage("Product removed");
  };

  const handleProductImport = async (event) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    event.target.value = "";
    if (!db || !inventoryEnabled) {
      setProductError("You do not have permission to import products.");
      return;
    }
    setProductImporting(true);
    setProductError(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: "array" });
      if (!workbook.SheetNames.length) {
        throw new Error("No sheets were found in that spreadsheet.");
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = utils.sheet_to_json(sheet, { range: 1, defval: "" });
      if (!rows.length) {
        throw new Error("No product rows detected. Check that the sheet has a header row followed by products.");
      }
      const usedIds = new Set();
      let importedCount = 0;
      /* eslint-disable no-await-in-loop */
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rawName = row.Name || row.name || row["Product Name"] || row[0] || "";
        const cleanedName = stripSheetLinkLabel(rawName);
        if (!cleanedName) continue;
        const rawBarcode = (row.Barcode || row.barcode || "").toString().trim();
        const barcodeId = slugifyId(rawBarcode);
        const baseId =
          barcodeId ? `sku-${barcodeId}` : slugifyId(cleanedName) || `imported-${index + 1}`;
        let docId = baseId;
        if (usedIds.has(docId)) {
          let suffix = 2;
          while (usedIds.has(`${baseId}-${suffix}`)) {
            suffix += 1;
          }
          docId = `${baseId}-${suffix}`;
        }
        usedIds.add(docId);

        const qtyRaw = row.QTY ?? row.Qty ?? row.qty ?? 0;
        const qtyNumber = Number(qtyRaw);
        const quantity = Number.isFinite(qtyNumber) ? Math.max(0, Math.floor(qtyNumber)) : 0;
        const status = quantity > 0 ? "live" : "draft";
        const description = (row.Description || row.description || cleanedName).toString().trim();
        const category =
          (row.Category || row.category || "product").toString().trim() || "product";
        const priceValue = parseSheetPriceValue(row.Price ?? row.price ?? "");
        const normalizedPrice = priceValue === "" ? null : priceValue;

        const docRef = doc(collection(db, "products"), docId);
        let docExists = false;
        try {
          const existing = await getDoc(docRef);
          docExists = existing.exists();
        } catch (lookupError) {
          console.warn("Unable to check existing product", docId, lookupError);
        }
        const payload = {
          name: cleanedName,
          title: cleanedName,
          description,
          price: normalizedPrice,
          category,
          quantity,
          status,
          barcode: rawBarcode || null,
          updatedAt: serverTimestamp(),
        };
        if (!docExists) {
          payload.createdAt = serverTimestamp();
        }
        await setDoc(docRef, payload, { merge: true });
        importedCount += 1;
      }
      /* eslint-enable no-await-in-loop */
      setStatusMessage(
        `Imported ${importedCount} product${importedCount === 1 ? "" : "s"} from spreadsheet.`,
      );
    } catch (importError) {
      console.error(importError);
      setProductError(
        importError.message || "We couldn’t import products from the selected spreadsheet.",
      );
    } finally {
      setProductImporting(false);
    }
  };

  const handleToggleFeaturedProduct = async (product) => {
    if (!db || !inventoryEnabled || !product?.id) return;
    const isFeatured = Boolean(product.featured);
    const currentFeaturedCount = products.filter((entry) => entry.featured).length;
    if (!isFeatured && currentFeaturedCount >= MAX_FEATURED_PRODUCTS) {
      setProductError(
        `Only ${MAX_FEATURED_PRODUCTS} products can be featured. Unfeature one to continue.`
      );
      return;
    }
    setFeaturedUpdatingId(product.id);
    setProductError(null);
    try {
      await updateDoc(doc(db, "products", product.id), {
        featured: !isFeatured,
        updatedAt: serverTimestamp(),
      });
      setStatusMessage(
        !isFeatured
          ? "Product featured on the home page."
          : "Product removed from the featured list."
      );
    } catch (toggleError) {
      setProductError(toggleError.message);
    } finally {
      setFeaturedUpdatingId(null);
    }
  };

  const handleCreateProduct = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setProductError("You do not have permission to update products.");
      return;
    }

    const name = productForm.name.trim();
    const title = productForm.title.trim() || name;
    const priceNumber = Number(productForm.price);
    const priceValue = Number.isFinite(priceNumber)
      ? priceNumber
      : productForm.price.trim();
    const quantityNumber = Number(productForm.quantity);
    const quantityValue = Number.isFinite(quantityNumber)
      ? Math.max(0, Math.floor(quantityNumber))
      : 0;
    const derivedStatus =
      quantityValue <= 0 ? "draft" : productForm.status || "draft";

    if (!name) {
      setProductError("Product name is required.");
      return;
    }

    try {
      setProductSaving(true);
      setStatusMessage(
        editingProductId ? "Updating product…" : "Saving product…"
      );
      let imageUrl = productForm.image.trim();
      if (productImageFile) {
        imageUrl = await uploadAsset(productImageFile, "products");
      }

      const payload = {
        name,
        title,
        description: productForm.description.trim(),
        price: priceValue,
        image: imageUrl,
        category: productForm.category.trim() || "product",
        status: derivedStatus,
        quantity: quantityValue,
        featured: Boolean(productForm.featured),
        updatedAt: serverTimestamp(),
      };

      if (editingProductId) {
        await updateDoc(doc(db, "products", editingProductId), payload);
        setStatusMessage("Product updated");
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatusMessage("Product saved");
      }

      closeProductModal();
    } catch (error) {
      setProductError(error.message);
    } finally {
      setProductSaving(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Products</h2>
          <p className="admin-panel__note">
            Build your storefront inventory directly from Firestore.
          </p>
        </div>
        <div className="admin-panel__header-actions">
          <input
            ref={productImportInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleProductImport}
            style={{ display: "none" }}
          />
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => productImportInputRef.current?.click()}
            disabled={!inventoryEnabled || productImporting}
          >
            {productImporting ? "Importing…" : "Import Spreadsheet"}
          </button>
          <button
            className="btn btn--primary"
            type="button"
            onClick={openProductModal}
            disabled={!inventoryEnabled}
          >
            <IconPlus className="btn__icon" aria-hidden="true" />
            Add Product
          </button>
        </div>
      </Reveal>

      <Reveal as="div" className="admin-table__wrapper" delay={60}>
        {products.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Category</th>
                <th scope="col">Price</th>
                <th scope="col">Featured</th>
                <th scope="col">Updated</th>
                <th scope="col" className="admin-table__actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => {
                const updatedAt = product.updatedAt?.toDate?.()
                  ? bookingDateFormatter.format(product.updatedAt.toDate())
                  : "—";
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="admin-table__product">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.title || product.name}
                            className="admin-table__thumb"
                          />
                        ) : (
                          <span className="admin-table__thumb admin-table__thumb--placeholder">
                            <IconImage aria-hidden="true" />
                          </span>
                        )}
                        <div>
                          <strong>{product.title || product.name}</strong>
                          {product.description && (
                            <p className="modal__meta">{product.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{product.category || "product"}</td>
                    <td>{formatPriceLabel(product.price)}</td>
                    <td>
                      <button
                        className={`icon-btn icon-btn--featured${
                          product.featured ? " is-active" : ""
                        }`}
                        type="button"
                        aria-pressed={product.featured ? "true" : "false"}
                        onClick={() => handleToggleFeaturedProduct(product)}
                        disabled={!inventoryEnabled || featuredUpdatingId === product.id}
                        title={
                          product.featured
                            ? "Remove from home page features"
                            : "Feature on home page"
                        }
                      >
                        <IconStar filled={Boolean(product.featured)} aria-hidden="true" />
                      </button>
                    </td>
                    <td>{updatedAt}</td>
                    <td className="admin-table__actions">
                      <button
                        className="icon-btn"
                        type="button"
                        onClick={() => handleEditProduct(product)}
                      >
                        <IconEdit aria-hidden="true" />
                      </button>
                      <button
                        className="icon-btn icon-btn--danger"
                        type="button"
                        onClick={() => handleDeleteProduct(product.id)}
                      >
                        <IconTrash aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="admin-panel__notice">
            No products found. Add your first item.
          </p>
        )}
        <p className="modal__meta">
          {featuredProductCount}/{MAX_FEATURED_PRODUCTS} products featured on the home page.
        </p>
        <AdminPagination page={productPage} total={products.length} onPageChange={setProductPage} />
        {inventoryLoading && (
          <p className="modal__meta">Syncing latest products…</p>
        )}
        {inventoryError && (
          <p className="admin-panel__error">{inventoryError}</p>
        )}
        {statusMessage && (
          <p className="admin-panel__status">{statusMessage}</p>
        )}
      </Reveal>

      <div
        className={`modal admin-modal ${isProductModalOpen ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isProductModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeProductModal();
        }}
      >
        <div className="modal__content admin-modal__content">
          <button
            className="modal__close"
            type="button"
            aria-label="Close"
            onClick={closeProductModal}
          >
            &times;
          </button>
          <h3 className="modal__title">
            {editingProductId ? "Edit Product" : "Add Product"}
          </h3>
          <form className="admin-form" onSubmit={handleCreateProduct}>
            <div className="admin-file-input admin-form__full">
              <label htmlFor="product-image-upload" className="sr-only">
                Product image
              </label>
              <input
                key={editingProductId ?? "new-product"}
                className="input input--file"
                id="product-image-upload"
                type="file"
                accept="image/*"
                onChange={handleProductImageChange}
              />
              <p className="admin-panel__note">
                Upload JPG or PNG (max 3MB). A preview appears below.
              </p>
              {productImagePreview && (
                <img
                  src={productImagePreview}
                  alt="Product preview"
                  className="admin-preview"
                />
              )}
            </div>
            <input
              className="input"
              placeholder="Product name"
              value={productForm.name}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              required
            />
            <input
              className="input"
              placeholder="Display title (optional)"
              value={productForm.title}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
            />
            <select
              className="input"
              value={productForm.category}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  category: event.target.value,
                }))
              }
            >
              <option value="product">Product</option>
              <option value="kit">Kit</option>
              <option value="accessory">Accessory</option>
            </select>
            <select
              className="input"
              value={productForm.status}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  status: event.target.value,
                }))
              }
            >
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="archived">Archived</option>
            </select>
            <input
              className="input"
              placeholder="Price (numbers or text)"
              value={productForm.price}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  price: event.target.value,
                }))
              }
              required
            />
            <input
              className="input"
              type="number"
              min="0"
              placeholder="Quantity in stock"
              value={productForm.quantity}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  quantity: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Description"
              value={productForm.description}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
            <div className="admin-modal__actions admin-form__actions">
              <button
                className="btn btn--secondary"
                type="button"
                onClick={closeProductModal}
                disabled={productSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                type="submit"
                disabled={productSaving || !inventoryEnabled}
              >
                {productSaving
                  ? "Saving…"
                  : editingProductId
                  ? "Update Product"
                  : "Save Product"}
              </button>
            </div>
            {productError && (
              <p className="admin-panel__error">{productError}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export function AdminWorkshopsView() {
  usePageMetadata({
    title: "Admin · Workshops",
    description: "Manage Bethany Blooms workshops, sessions, and bookings.",
  });
  const {
    db,
    storage,
    workshops,
    bookings,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const uploadAsset = useUploadAsset(storage);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isWorkshopModalOpen, setWorkshopModalOpen] = useState(false);
  const [workshopForm, setWorkshopForm] = useState(INITIAL_WORKSHOP_FORM);
  const [editingWorkshopId, setEditingWorkshopId] = useState(null);
  const [workshopImageFile, setWorkshopImageFile] = useState(null);
  const [workshopImagePreview, setWorkshopImagePreview] = useState("");
  const [workshopSaving, setWorkshopSaving] = useState(false);
  const [workshopError, setWorkshopError] = useState(null);
  const workshopPreviewUrlRef = useRef(null);
  const [workshopPage, setWorkshopPage] = useState(0);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(
    () => () => {
      if (workshopPreviewUrlRef.current) {
        URL.revokeObjectURL(workshopPreviewUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(workshops.length / ADMIN_PAGE_SIZE) - 1);
    setWorkshopPage((prev) => Math.min(prev, maxPage));
  }, [workshops.length]);

  const paginatedWorkshops = useMemo(() => {
    const start = workshopPage * ADMIN_PAGE_SIZE;
    return workshops.slice(start, start + ADMIN_PAGE_SIZE);
  }, [workshops, workshopPage]);

  const openWorkshopModal = () => {
    setWorkshopForm({
      ...INITIAL_WORKSHOP_FORM,
    });
    setEditingWorkshopId(null);
    setWorkshopImageFile(null);
    setWorkshopImagePreview("");
    setWorkshopError(null);
    setWorkshopModalOpen(true);
  };

  const closeWorkshopModal = () => {
    setWorkshopModalOpen(false);
    setWorkshopImageFile(null);
    setWorkshopImagePreview("");
    setWorkshopError(null);
    setWorkshopSaving(false);
  };

  const handleWorkshopImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (workshopPreviewUrlRef.current) {
      URL.revokeObjectURL(workshopPreviewUrlRef.current);
      workshopPreviewUrlRef.current = null;
    }
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        setWorkshopError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(file);
      workshopPreviewUrlRef.current = preview;
      setWorkshopImageFile(file);
      setWorkshopImagePreview(preview);
    } else {
      setWorkshopImageFile(null);
      setWorkshopImagePreview(workshopForm.image || "");
    }
  };

  const handleDateGroupChange = (groupId, value) => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: (prev.dateGroups || []).map((group) =>
        group.id === groupId ? { ...group, date: value } : group
      ),
    }));
  };

  const handleAddDateGroup = () => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: [...(prev.dateGroups || []), createDateGroup()],
    }));
  };

  const handleRemoveDateGroup = (groupId) => {
    setWorkshopForm((prev) => {
      const remaining = (prev.dateGroups || []).filter(
        (group) => group.id !== groupId
      );
      return {
        ...prev,
        dateGroups: remaining.length > 0 ? remaining : [createDateGroup()],
      };
    });
  };

  const handleAddTimeSlot = (groupId) => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: (prev.dateGroups || []).map((group) =>
        group.id === groupId
          ? { ...group, times: [...(group.times || []), createTimeSlot()] }
          : group
      ),
    }));
  };

  const handleTimeSlotChange = (groupId, slotId, field, value) => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: (prev.dateGroups || []).map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          times: (group.times || []).map((slot) =>
            slot.id === slotId ? { ...slot, [field]: value } : slot
          ),
        };
      }),
    }));
  };

  const handleRemoveTimeSlot = (groupId, slotId) => {
    setWorkshopForm((prev) => ({
      ...prev,
      dateGroups: (prev.dateGroups || []).map((group) => {
        if (group.id !== groupId) return group;
        const remainingSlots = (group.times || []).filter(
          (slot) => slot.id !== slotId
        );
        return {
          ...group,
          times:
            remainingSlots.length > 0 ? remainingSlots : [createTimeSlot()],
        };
      }),
    }));
  };

  const handleEditWorkshop = (workshop) => {
    setEditingWorkshopId(workshop.id);
    setWorkshopForm({
      title: workshop.title || workshop.name || "",
      description: workshop.description || "",
      scheduledFor: workshop.scheduledFor || "",
      price:
        workshop.price === undefined || workshop.price === null
          ? ""
          : String(workshop.price),
      location: workshop.location || "",
      image: workshop.image || "",
      status: workshop.status || "live",
      whatToExpect: workshop.whatToExpect || "",
      bookingPricing: workshop.bookingPricing || "",
      goodToKnow: workshop.goodToKnow || "",
      cancellations: workshop.cancellations || "",
      groupsInfo: workshop.groupsInfo || "",
      careInfo: workshop.careInfo || "",
      whyPeopleLove: workshop.whyPeopleLove || "",
      ctaNote: workshop.ctaNote || "",
      repeatWeekdays: false,
      dateGroups: (() => {
        const rawSessions = Array.isArray(workshop.sessions)
          ? workshop.sessions
          : [];
        if (rawSessions.length === 0) return [createDateGroup()];
        const grouped = new Map();
        rawSessions.forEach((session, index) => {
          const startDate = parseDateValue(
            session.start || session.startDate || workshop.scheduledFor
          );
          const dateValue =
            session.date || (startDate ? formatDateInput(startDate) : "");
          const timeValue =
            session.time || (startDate ? formatTimeInput(startDate) : "");
          const slot = {
            id: session.id || `session-${index}-${workshop.id}`,
            time: timeValue,
            label: session.label || session.name || "",
            capacity:
              session.capacity === undefined || session.capacity === null
                ? String(DEFAULT_SLOT_CAPACITY)
                : String(session.capacity),
          };
          const dateKey = dateValue || `unscheduled-${index}`;
          if (!grouped.has(dateKey)) {
            grouped.set(dateKey, {
              id: `date-${dateKey}-${index}`,
              date: dateValue,
              times: [],
            });
          }
          grouped.get(dateKey).times.push(slot);
        });
        return Array.from(grouped.values())
          .sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date.localeCompare(b.date);
          })
          .map((group) => ({
            ...group,
            times: group.times.length > 0 ? group.times : [createTimeSlot()],
          }));
      })(),
    });
    setWorkshopImagePreview(workshop.image || "");
    setWorkshopImageFile(null);
    setWorkshopError(null);
    setWorkshopModalOpen(true);
  };

  const handleDeleteWorkshop = async (workshopId) => {
    if (!db || !inventoryEnabled) return;
    await deleteDoc(doc(db, "workshops", workshopId));
    setStatusMessage("Workshop removed");
  };

  const handleCreateWorkshop = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setWorkshopError("You do not have permission to manage workshops.");
      return;
    }

    if (!workshopForm.title.trim()) {
      setWorkshopError("Workshop title is required.");
      return;
    }

    if (!workshopImageFile && !workshopForm.image.trim()) {
      setWorkshopError("Please upload a workshop image.");
      return;
    }

    const addSessionFromSlot = (collection, dateValue, slot) => {
      const trimmedDate = dateValue?.trim();
      const trimmedTime = slot.time?.trim();
      if (!trimmedDate || !trimmedTime) {
        return;
      }
      const combinedDate = combineDateAndTime(trimmedDate, trimmedTime);
      if (!combinedDate) return;
      const capacityNumber = Number(slot.capacity || DEFAULT_SLOT_CAPACITY);
      collection.push({
        id:
          slot.id ||
          `session-${trimmedDate}-${trimmedTime}-${Math.random()
            .toString(16)
            .slice(2, 8)}`,
        start: combinedDate.toISOString(),
        date: trimmedDate,
        time: trimmedTime,
        label: slot.label?.trim() || bookingDateFormatter.format(combinedDate),
        capacity:
          Number.isFinite(capacityNumber) && capacityNumber > 0
            ? capacityNumber
            : DEFAULT_SLOT_CAPACITY,
      });
    };

    const dateGroups = Array.isArray(workshopForm.dateGroups)
      ? workshopForm.dateGroups
      : [];
    const sanitizedSessions = [];
    const manualDates = new Set();

    dateGroups.forEach((group) => {
      const dateValue = group.date?.trim();
      if (dateValue) manualDates.add(dateValue);
      (group.times || []).forEach((slot) =>
        addSessionFromSlot(sanitizedSessions, dateValue, slot)
      );
    });

    if (workshopForm.repeatWeekdays) {
      const sortedGroups = dateGroups
        .filter((group) => group.date?.trim())
        .sort((a, b) => a.date.localeCompare(b.date));
      if (sortedGroups.length > 0) {
        const templateGroup = sortedGroups[0];
        const templateDate = templateGroup.date;
        const templateTimes = templateGroup.times || [];
        const startDateLiteral = new Date(templateDate);
        if (!Number.isNaN(startDateLiteral.getTime())) {
          for (let offset = 1; offset <= AUTO_REPEAT_DAYS; offset += 1) {
            const nextDate = new Date(startDateLiteral);
            nextDate.setDate(nextDate.getDate() + offset);
            if (nextDate.getDay() === 0) continue; // skip Sundays
            const isoDate = formatDateInput(nextDate);
            if (manualDates.has(isoDate)) continue;
            manualDates.add(isoDate);
            templateTimes.forEach((slot) =>
              addSessionFromSlot(sanitizedSessions, isoDate, slot)
            );
          }
        }
      }
    }

    sanitizedSessions.sort((a, b) => {
      const aTime = new Date(a.start).getTime();
      const bTime = new Date(b.start).getTime();
      return aTime - bTime;
    });

    if (sanitizedSessions.length === 0) {
      setWorkshopError("Please add at least one session (date & time).");
      return;
    }

    const primarySession = sanitizedSessions[0];
    const priceNumber = Number(workshopForm.price);
    const priceValue = Number.isFinite(priceNumber)
      ? priceNumber
      : workshopForm.price.trim();

    try {
      setWorkshopSaving(true);
      setStatusMessage(
        editingWorkshopId ? "Updating workshop…" : "Saving workshop…"
      );
      let imageUrl = workshopForm.image.trim();
      if (workshopImageFile) {
        imageUrl = await uploadAsset(workshopImageFile, "workshops");
      }

      const payload = {
        title: workshopForm.title.trim(),
        description: workshopForm.description.trim(),
        scheduledFor: primarySession.start,
        primarySessionId: primarySession.id,
        price: priceValue,
        location: workshopForm.location.trim(),
        image: imageUrl,
        updatedAt: serverTimestamp(),
        whatToExpect: workshopForm.whatToExpect.trim(),
        bookingPricing: workshopForm.bookingPricing.trim(),
        goodToKnow: workshopForm.goodToKnow.trim(),
        cancellations: workshopForm.cancellations.trim(),
        groupsInfo: workshopForm.groupsInfo.trim(),
        careInfo: workshopForm.careInfo.trim(),
        whyPeopleLove: workshopForm.whyPeopleLove.trim(),
        ctaNote: workshopForm.ctaNote.trim(),
        sessions: sanitizedSessions,
        status: workshopForm.status || "draft",
      };

      if (editingWorkshopId) {
        await updateDoc(doc(db, "workshops", editingWorkshopId), payload);
        setStatusMessage("Workshop updated");
      } else {
        await addDoc(collection(db, "workshops"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatusMessage("Workshop saved");
      }

      closeWorkshopModal();
    } catch (error) {
      setWorkshopError(error.message);
    } finally {
      setWorkshopSaving(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--full">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Workshops & Bookings</h2>
          <p className="admin-panel__note">
            Create immersive experiences with custom slots and booking rules.
          </p>
        </div>
        <div className="admin-panel__header-actions">
          <button
            className="btn btn--primary"
            type="button"
            onClick={openWorkshopModal}
            disabled={!inventoryEnabled}
          >
            <IconPlus className="btn__icon" aria-hidden="true" />
            Add Workshop
          </button>
        </div>
      </Reveal>

      <div className="admin-stack">
        <Reveal as="section" className="admin-panel" delay={60}>
          <div className="admin-panel__header">
            <h3>Workshops</h3>
            {inventoryLoading && (
              <span className="badge badge--muted">Syncing…</span>
            )}
          </div>
          {workshops.length > 0 ? (
            <div className="admin-table__wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Listing</th>
                    <th scope="col">Next Session</th>
                    <th scope="col">Price</th>
                    <th scope="col" className="admin-table__actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedWorkshops.map((workshop) => {
                    const primarySession = getPrimarySession(workshop);
                    const sessionLabel = getSessionLabel(primarySession);
                    return (
                      <tr key={workshop.id}>
                        <td>
                          <div className="admin-table__product">
                            {workshop.image ? (
                              <img
                                src={workshop.image}
                                alt={workshop.title}
                                className="admin-table__thumb"
                              />
                            ) : (
                              <span className="admin-table__thumb admin-table__thumb--placeholder">
                                <IconImage aria-hidden="true" />
                              </span>
                            )}
                            <div>
                              <strong>{workshop.title}</strong>
                              {workshop.location && (
                                <p className="modal__meta">
                                  {workshop.location}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <p>{sessionLabel}</p>
                          {primarySession?.time && (
                            <p className="modal__meta">{primarySession.time}</p>
                          )}
                        </td>
                        <td>{formatPriceLabel(workshop.price)}</td>
                        <td className="admin-table__actions">
                          <button
                            className="icon-btn"
                            type="button"
                            onClick={() => handleEditWorkshop(workshop)}
                          >
                            <IconEdit aria-hidden="true" />
                          </button>
                          <button
                            className="icon-btn icon-btn--danger"
                            type="button"
                            onClick={() => handleDeleteWorkshop(workshop.id)}
                          >
                            <IconTrash aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-panel__notice">
              No workshops yet. Create one to start selling seats.
            </p>
          )}
          <AdminPagination page={workshopPage} total={workshops.length} onPageChange={setWorkshopPage} />
          {statusMessage && (
            <p className="admin-panel__status">{statusMessage}</p>
          )}
        </Reveal>

        <Reveal as="section" className="admin-panel" delay={90}>
          <div className="admin-panel__header">
            <h3>Bookings</h3>
            {inventoryLoading && (
              <span className="badge badge--muted">Syncing…</span>
            )}
          </div>
          {bookings.length > 0 ? (
            <div className="admin-table__wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Guest</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Details</th>
                    <th scope="col">Received</th>
                    <th scope="col" className="admin-table__actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((bookingEntry) => {
                    const submittedAt = bookingEntry.createdAt?.toDate?.()
                      ? bookingDateFormatter.format(
                          bookingEntry.createdAt.toDate()
                        )
                      : "Pending";
                    return (
                      <tr key={bookingEntry.id}>
                        <td>{bookingEntry.name || "—"}</td>
                        <td>
                          {bookingEntry.email ? (
                            <a href={`mailto:${bookingEntry.email}`}>
                              {bookingEntry.email}
                            </a>
                          ) : (
                            "—"
                          )}
                          {bookingEntry.phone && (
                            <p className="modal__meta">{bookingEntry.phone}</p>
                          )}
                        </td>
                        <td>
                          {bookingEntry.frame && (
                            <p className="modal__meta">
                              Frame: {bookingEntry.frame}
                            </p>
                          )}
                          {bookingEntry.notes && (
                            <p className="modal__meta">
                              Notes: {bookingEntry.notes}
                            </p>
                          )}
                        </td>
                        <td>{submittedAt}</td>
                        <td className="admin-table__actions">
                          <button
                            className="icon-btn icon-btn--danger"
                            type="button"
                            onClick={() => {
                              if (!db) return;
                              deleteDoc(doc(db, "bookings", bookingEntry.id));
                            }}
                          >
                            <IconTrash aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-panel__notice">
              Bookings will appear here once submitted.
            </p>
          )}
        </Reveal>
      </div>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}

      <div
        className={`modal admin-modal ${
          isWorkshopModalOpen ? "is-active" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isWorkshopModalOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeWorkshopModal();
        }}
      >
        <div className="modal__content admin-modal__content">
          <button
            className="modal__close"
            type="button"
            aria-label="Close"
            onClick={closeWorkshopModal}
          >
            &times;
          </button>
          <h3 className="modal__title">
            {editingWorkshopId ? "Edit Workshop" : "Add Workshop"}
          </h3>
          <form className="admin-form" onSubmit={handleCreateWorkshop}>
            <div className="admin-file-input admin-form__full">
              <label htmlFor="workshop-image-upload" className="sr-only">
                Workshop image
              </label>
              <input
                key={editingWorkshopId ?? "new-workshop"}
                className="input input--file"
                id="workshop-image-upload"
                type="file"
                accept="image/*"
                onChange={handleWorkshopImageChange}
              />
              <p className="admin-panel__note">
                Upload JPG or PNG (max 3MB). A preview appears below.
              </p>
              {workshopImagePreview && (
                <img
                  src={workshopImagePreview}
                  alt="Workshop preview"
                  className="admin-preview"
                />
              )}
            </div>
            <input
              className="input"
              placeholder="Workshop title"
              value={workshopForm.title}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
              required
            />
            <input
              className="input"
              placeholder="Price (numbers or text)"
              value={workshopForm.price}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  price: event.target.value,
                }))
              }
            />
            <input
              className="input"
              placeholder="Location"
              value={workshopForm.location}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  location: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Description"
              value={workshopForm.description}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
            <select
              className="input"
              value={workshopForm.status}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  status: event.target.value,
                }))
              }
            >
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="archived">Archived</option>
            </select>

            <div className="admin-session-panel admin-form__full">
              <div className="admin-session-panel__header">
                <h4>Workshop sessions</h4>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={handleAddDateGroup}
                  aria-label="Add date"
                >
                  <IconPlus aria-hidden="true" />
                </button>
              </div>
              <p className="admin-panel__note">
                Add one or more dates, then include every time slot offered on
                each day.
              </p>
              {(workshopForm.dateGroups || []).map((group, index) => (
                <div className="admin-session-date-group" key={group.id}>
                  <div className="admin-session-row admin-session-row--date">
                    <div className="admin-session-field admin-session-field--label">
                      <label
                        className="admin-session-label"
                        htmlFor={`session-date-${group.id}`}
                      >
                        Date #{index + 1}
                      </label>
                      <input
                        className="input"
                        type="date"
                        id={`session-date-${group.id}`}
                        value={group.date}
                        onChange={(event) =>
                          handleDateGroupChange(group.id, event.target.value)
                        }
                      />
                    </div>
                    {(workshopForm.dateGroups || []).length > 1 && (
                      <button
                        className="icon-btn icon-btn--danger admin-session-remove"
                        type="button"
                        onClick={() => handleRemoveDateGroup(group.id)}
                        aria-label={`Remove date ${index + 1}`}
                      >
                        <IconTrash aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="admin-session-panel__header admin-session-panel__header--sub">
                    <h5>Time slots</h5>
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={() => handleAddTimeSlot(group.id)}
                      aria-label="Add time slot"
                    >
                      <IconPlus aria-hidden="true" />
                    </button>
                  </div>
                  {(group.times || []).map((slot) => (
                    <div
                      className="admin-session-row admin-session-row--nested"
                      key={slot.id}
                    >
                      <div className="admin-session-field">
                        <label
                          className="admin-session-label"
                          htmlFor={`session-time-${slot.id}`}
                        >
                          Time
                        </label>
                        <input
                          className="input"
                          type="time"
                          id={`session-time-${slot.id}`}
                          value={slot.time}
                          onChange={(event) =>
                            handleTimeSlotChange(
                              group.id,
                              slot.id,
                              "time",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div className="admin-session-field">
                        <label
                          className="admin-session-label"
                          htmlFor={`session-label-${slot.id}`}
                        >
                          Label
                        </label>
                        <input
                          className="input"
                          id={`session-label-${slot.id}`}
                          value={slot.label}
                          onChange={(event) =>
                            handleTimeSlotChange(
                              group.id,
                              slot.id,
                              "label",
                              event.target.value
                            )
                          }
                          placeholder="Morning, Afternoon, etc."
                        />
                      </div>
                      <div className="admin-session-field">
                        <label
                          className="admin-session-label"
                          htmlFor={`session-capacity-${slot.id}`}
                        >
                          Capacity
                        </label>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          id={`session-capacity-${slot.id}`}
                          value={slot.capacity}
                          onChange={(event) =>
                            handleTimeSlotChange(
                              group.id,
                              slot.id,
                              "capacity",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <button
                        className="icon-btn icon-btn--danger admin-session-remove"
                        type="button"
                        onClick={() => handleRemoveTimeSlot(group.id, slot.id)}
                        aria-label="Remove time slot"
                      >
                        <IconTrash aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={workshopForm.repeatWeekdays}
                  onChange={(event) =>
                    setWorkshopForm((prev) => ({
                      ...prev,
                      repeatWeekdays: event.target.checked,
                    }))
                  }
                />
                <span>Auto-schedule future dates (Mon–Sat)</span>
              </label>
              <p className="admin-panel__note">
                When enabled, the first date’s time slots repeat for the next 90
                days, skipping Sundays.
              </p>
            </div>

            <textarea
              className="input textarea admin-form__full"
              placeholder="What to Expect"
              value={workshopForm.whatToExpect}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  whatToExpect: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Booking & Pricing details"
              value={workshopForm.bookingPricing}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  bookingPricing: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Good to Know"
              value={workshopForm.goodToKnow}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  goodToKnow: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Cancellations & Policies"
              value={workshopForm.cancellations}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  cancellations: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Groups & Private Events"
              value={workshopForm.groupsInfo}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  groupsInfo: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Caring for Your Art"
              value={workshopForm.careInfo}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  careInfo: event.target.value,
                }))
              }
            />
            <textarea
              className="input textarea admin-form__full"
              placeholder="Why people love our workshops"
              value={workshopForm.whyPeopleLove}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  whyPeopleLove: event.target.value,
                }))
              }
            />
            <input
              className="input admin-form__full"
              placeholder="CTA note (e.g. 'Book today to reserve your seat!')"
              value={workshopForm.ctaNote}
              onChange={(event) =>
                setWorkshopForm((prev) => ({
                  ...prev,
                  ctaNote: event.target.value,
                }))
              }
            />
            <div className="admin-modal__actions admin-form__actions">
              <button
                className="btn btn--secondary"
                type="button"
                onClick={closeWorkshopModal}
                disabled={workshopSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary"
                type="submit"
                disabled={!inventoryEnabled || workshopSaving}
              >
                {workshopSaving
                  ? "Saving…"
                  : editingWorkshopId
                  ? "Update Workshop"
                  : "Save Workshop"}
              </button>
            </div>
            {workshopError && (
              <p className="admin-panel__error">{workshopError}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export function AdminWorkshopsCalendarView() {
  usePageMetadata({
    title: "Admin · Calendar",
    description: "Overview of scheduled workshops, bookings, and events by date.",
  });
  const { bookings, events, inventoryLoading, inventoryError } = useAdminData();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    today.setDate(1);
    return today;
  });
  const [selectedDate, setSelectedDate] = useState(() =>
    formatDateInput(new Date())
  );

  const handleMonthChange = (offset) => {
    setVisibleMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + offset);
      return next;
    });
  };

  const bookingsByDate = useMemo(() => {
    const map = new Map();
    bookings.forEach((booking) => {
      const dateValue =
        booking.sessionDate ||
        (booking.createdAt?.toDate
          ? formatDateInput(booking.createdAt.toDate())
          : null);
      if (!dateValue) return;
      if (!map.has(dateValue)) {
        map.set(dateValue, []);
      }
      map.get(dateValue).push(booking);
    });
    return map;
  }, [bookings]);

  const eventsByDate = useMemo(() => {
    const map = new Map();
    events.forEach((eventDoc) => {
      const eventDate = parseDateValue(eventDoc.eventDate);
      if (!eventDate) return;
      const iso = formatDateInput(eventDate);
      if (!map.has(iso)) {
        map.set(iso, []);
      }
      map.get(iso).push(eventDoc);
    });
    return map;
  }, [events]);

  const monthMatrix = useMemo(() => {
    const matrix = [];
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = firstDay.getDay(); // Sunday start
    const startDate = new Date(year, month, 1 - offset);
    for (let week = 0; week < 6; week += 1) {
      const weekRow = [];
      for (let day = 0; day < 7; day += 1) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + week * 7 + day);
        const iso = formatDateInput(cellDate);
        weekRow.push({
          iso,
          label: cellDate.getDate(),
          isCurrentMonth: cellDate.getMonth() === month,
          isToday: iso === formatDateInput(new Date()),
          hasBookings: bookingsByDate.has(iso),
          hasEvents: eventsByDate.has(iso),
        });
      }
      matrix.push(weekRow);
    }
    return matrix;
  }, [visibleMonth, bookingsByDate, eventsByDate]);

  const activeBookings = bookingsByDate.get(selectedDate) || [];
  const activeEvents = eventsByDate.get(selectedDate) || [];

  const monthLabel = visibleMonth.toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
  });

  const selectedDateLabel = useMemo(() => {
    const parsed = new Date(selectedDate);
    if (Number.isNaN(parsed.getTime())) return selectedDate;
    return parsed.toLocaleString("en-ZA", { dateStyle: "long" });
  }, [selectedDate]);

  return (
    <div className="admin-panel admin-panel--full">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Studio Calendar</h2>
          <p className="admin-panel__note">
            Track workshops, private bookings, and cut flower installs in a single glance.
          </p>
        </div>
      </Reveal>

      {inventoryLoading && (
        <p className="modal__meta">Syncing latest workshops…</p>
      )}

      <div className="admin-calendar">
        <div className="card admin-calendar__panel">
          <div className="admin-calendar__header">
            <button
              className="btn btn--secondary admin-calendar__nav"
              type="button"
              onClick={() => handleMonthChange(-1)}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div>
              <h3>{monthLabel}</h3>
              <p className="modal__meta">Showing bookings & events for this month</p>
            </div>
            <button
              className="btn btn--secondary admin-calendar__nav"
              type="button"
              onClick={() => handleMonthChange(1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="admin-calendar__legend">
            <span>
              <span className="legend-dot legend-dot--booked" /> Booking days
            </span>
            <span>
              <span className="legend-dot legend-dot--event" /> Event days
            </span>
            <span>
              <span className="legend-dot legend-dot--today" /> Today
            </span>
            <span>
              <span className="legend-dot legend-dot--selected" /> Selected date
            </span>
          </div>

          <div className="admin-calendar__grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="admin-calendar__weekday">
                {label}
              </div>
            ))}
            {monthMatrix.flat().map((day) => (
              <button
                key={day.iso}
                type="button"
                className={`admin-calendar__cell ${
                  day.isCurrentMonth ? "" : "is-muted"
                } ${day.hasBookings ? "has-bookings" : ""} ${
                  day.hasEvents ? "has-events" : ""
                } ${
                  selectedDate === day.iso ? "is-selected" : ""
                } ${day.isToday ? "is-today" : ""}`}
                onClick={() => setSelectedDate(day.iso)}
              >
                <span>{day.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card admin-calendar__details">
          <div className="admin-calendar__details-header">
            <div>
              <h4>{selectedDateLabel}</h4>
              <p className="modal__meta">
                {activeBookings.length} booking
                {activeBookings.length === 1 ? "" : "s"} · {activeEvents.length} event
                {activeEvents.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="admin-calendar__details-group">
            <h5>Bookings</h5>
            {activeBookings.length > 0 ? (
              <ul>
                {activeBookings.map((booking) => (
                  <li key={booking.id}>
                    <div>
                      <strong>{booking.name}</strong>
                      <p className="modal__meta">
                        {booking.sessionLabel || "Session"} ·{" "}
                        {booking.frame || "Workshop"}
                      </p>
                    </div>
                    <div className="admin-calendar__details-actions">
                      <a href={`mailto:${booking.email}`}>{booking.email}</a>
                      {booking.notes && (
                        <p className="modal__meta">{booking.notes}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="modal__meta">
                No bookings recorded for this date yet.
              </p>
            )}
          </div>
          <div className="admin-calendar__details-group">
            <h5>Events</h5>
            {activeEvents.length > 0 ? (
              <ul>
                {activeEvents.map((eventDoc) => (
                  <li key={eventDoc.id}>
                    <div>
                      <strong>{eventDoc.title}</strong>
                      {eventDoc.location && (
                        <p className="modal__meta">{eventDoc.location}</p>
                      )}
                      {eventDoc.workshopTitle && (
                        <p className="modal__meta">
                          Linked workshop: {eventDoc.workshopTitle}
                        </p>
                      )}
                    </div>
                    <div className="admin-calendar__details-actions">
                      {eventDoc.workshopId && (
                        <Link to={`/workshops/${eventDoc.workshopId}`}>
                          View workshop
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="modal__meta">No events scheduled for this date.</p>
            )}
          </div>
        </div>
      </div>

      {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
    </div>
  );
}

export function AdminEventsView() {
  usePageMetadata({
    title: "Admin · Events",
    description: "Publish Bethany Blooms events and connect them to workshops.",
  });
  const {
    db,
    storage,
    events,
    workshops,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const uploadAsset = useUploadAsset(storage);
  const [eventForm, setEventForm] = useState(INITIAL_EVENT_FORM);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventImageFile, setEventImageFile] = useState(null);
  const [eventImagePreview, setEventImagePreview] = useState("");
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState(null);
  const [eventStatus, setEventStatus] = useState(null);
  const eventPreviewUrlRef = useRef(null);
  const [eventPage, setEventPage] = useState(0);

  useEffect(() => {
    if (!eventStatus) return undefined;
    const timeout = setTimeout(() => setEventStatus(null), 3200);
    return () => clearTimeout(timeout);
  }, [eventStatus]);

  useEffect(
    () => () => {
      if (eventPreviewUrlRef.current) {
        URL.revokeObjectURL(eventPreviewUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(normalizedEvents.length / ADMIN_PAGE_SIZE) - 1);
    setEventPage((prev) => Math.min(prev, maxPage));
  }, [normalizedEvents.length]);

  const workshopOptions = useMemo(
    () =>
      workshops.map((workshop) => ({
        id: workshop.id,
        title: workshop.title || workshop.name || "Untitled Workshop",
      })),
    [workshops]
  );

  const normalizedEvents = useMemo(() => {
    return events
      .map((eventDoc) => {
        const eventDate = parseDateValue(eventDoc.eventDate);
        return {
          ...eventDoc,
          eventDate,
          displayDate: eventDate
            ? bookingDateFormatter.format(eventDate)
            : "Date to be confirmed",
        };
      })
      .sort((a, b) => {
        if (!a.eventDate && !b.eventDate) return 0;
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return a.eventDate - b.eventDate;
      });
  }, [events]);

  const paginatedEvents = useMemo(() => {
    const start = eventPage * ADMIN_PAGE_SIZE;
    return normalizedEvents.slice(start, start + ADMIN_PAGE_SIZE);
  }, [normalizedEvents, eventPage]);

  const resetEventForm = () => {
    setEventForm(INITIAL_EVENT_FORM);
    setEditingEventId(null);
    setEventImageFile(null);
    setEventImagePreview("");
    setEventError(null);
  };

  const handleEventImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (eventPreviewUrlRef.current) {
      URL.revokeObjectURL(eventPreviewUrlRef.current);
      eventPreviewUrlRef.current = null;
    }
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        setEventError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(file);
      eventPreviewUrlRef.current = preview;
      setEventImageFile(file);
      setEventImagePreview(preview);
    } else {
      setEventImageFile(null);
      setEventImagePreview(eventForm.image || "");
    }
  };

  const handleEditEvent = (eventDoc) => {
    const eventDate = parseDateValue(eventDoc.eventDate);
    setEventForm({
      title: eventDoc.title || "",
      description: eventDoc.description || "",
      location: eventDoc.location || "",
      date: eventDate ? formatDateInput(eventDate) : "",
      time: eventDate ? formatTimeInput(eventDate) : "",
      image: eventDoc.image || "",
      workshopId: eventDoc.workshopId || "",
      status: eventDoc.status || "live",
    });
    setEventImagePreview(eventDoc.image || "");
    setEventImageFile(null);
    setEditingEventId(eventDoc.id);
    setEventError(null);
  };

  const handleDeleteEvent = async (eventId) => {
    if (!db || !inventoryEnabled) return;
    const confirmed = window.confirm("Delete this event? This cannot be undone.");
    if (!confirmed) return;
    await deleteDoc(doc(db, "events", eventId));
    setEventStatus("Event removed");
    if (editingEventId === eventId) {
      resetEventForm();
    }
  };

  const handleSaveEvent = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setEventError("You do not have permission to manage events.");
      return;
    }

    const title = eventForm.title.trim();
    if (!title) {
      setEventError("Event title is required.");
      return;
    }

    if (!eventForm.date.trim()) {
      setEventError("Event date is required.");
      return;
    }

    let imageUrl = eventForm.image.trim();
    setEventSaving(true);
    setEventError(null);

    try {
      if (eventImageFile) {
        imageUrl = await uploadAsset(eventImageFile, "events");
      }

      if (!imageUrl) {
        setEventError("Please upload an event image.");
        setEventSaving(false);
        return;
      }

      const combinedDate = combineDateAndTime(eventForm.date, eventForm.time);
      const linkedWorkshop = workshops.find(
        (workshop) => workshop.id === eventForm.workshopId
      );

      const payload = {
        title,
        description: eventForm.description.trim(),
        location: eventForm.location.trim(),
        eventDate: combinedDate ?? null,
        image: imageUrl,
        workshopId: linkedWorkshop?.id || null,
        workshopTitle: linkedWorkshop?.title || linkedWorkshop?.name || null,
        status: eventForm.status || "draft",
        updatedAt: serverTimestamp(),
      };

      if (editingEventId) {
        await updateDoc(doc(db, "events", editingEventId), payload);
        setEventStatus("Event updated");
      } else {
        await addDoc(collection(db, "events"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setEventStatus("Event added");
      }

      resetEventForm();
    } catch (saveError) {
      console.error(saveError);
      setEventError("We couldn’t save the event. Please try again.");
    } finally {
      setEventSaving(false);
    }
  };

  return (
    <section className="section section--tight">
      <div className="section__inner">
        <div className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h2>Events</h2>
              <p className="admin-panel__note">
                Share pop-ups, markets, and studio open days, then link a workshop so guests can book in one click.
              </p>
            </div>
            {eventStatus && <span className="badge badge--muted">{eventStatus}</span>}
          </div>
          {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
          <div className="admin-panel__content admin-panel__content--split">
            <div>
              <h3>{editingEventId ? "Edit Event" : "Create Event"}</h3>
              <form className="admin-form" onSubmit={handleSaveEvent}>
                <input
                  className="input"
                  placeholder="Event title"
                  value={eventForm.title}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  required
                />
                <input
                  className="input"
                  placeholder="Location"
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                />
                <select
                  className="input"
                  value={eventForm.status}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="archived">Archived</option>
                </select>
                <input
                  className="input"
                  type="date"
                  value={eventForm.date}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, date: e.target.value }))
                  }
                  required
                />
                <input
                  className="input"
                  type="time"
                  value={eventForm.time}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, time: e.target.value }))
                  }
                />
                <select
                  className="input"
                  value={eventForm.workshopId}
                  onChange={(e) =>
                    setEventForm((prev) => ({
                      ...prev,
                      workshopId: e.target.value,
                    }))
                  }
                >
                  <option value="">Link a workshop (optional)</option>
                  {workshopOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
                <textarea
                  className="input textarea admin-form__full"
                  placeholder="Event description"
                  value={eventForm.description}
                  onChange={(e) =>
                    setEventForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
                <div className="admin-file-input admin-form__full">
                  <label htmlFor="event-image-upload" className="sr-only">
                    Event image
                  </label>
                  <input
                    key={editingEventId ?? "new-event"}
                    className="input input--file"
                    id="event-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleEventImageChange}
                  />
                  <p className="admin-panel__note">Upload JPG or PNG (max 3MB).</p>
                  {(eventImagePreview || eventForm.image) && (
                    <img
                      src={eventImagePreview || eventForm.image}
                      alt="Event preview"
                      className="admin-preview"
                    />
                  )}
                </div>
                <div className="admin-form__actions">
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={resetEventForm}
                    disabled={eventSaving}
                  >
                    Reset
                  </button>
                  <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={eventSaving || !inventoryEnabled}
                  >
                    {eventSaving
                      ? "Saving…"
                      : editingEventId
                      ? "Update Event"
                      : "Create Event"}
                  </button>
                </div>
                {eventError && <p className="admin-panel__error">{eventError}</p>}
              </form>
            </div>
            <div>
              <h3>Scheduled Events</h3>
              {inventoryLoading && !events.length ? (
                <p className="admin-panel__note">Loading events…</p>
              ) : (
                <div className="admin-panel__list">
                  {normalizedEvents.length === 0 ? (
                    <p className="admin-panel__note">No events yet.</p>
                  ) : (
                    paginatedEvents.map((eventDoc) => (
                      <article className="admin-event-card" key={eventDoc.id}>
                        <div className="admin-event-card__info">
                          <p className="admin-event-card__date">{eventDoc.displayDate}</p>
                          <h4>{eventDoc.title}</h4>
                          {eventDoc.location && (
                            <p className="admin-event-card__meta">{eventDoc.location}</p>
                          )}
                          {eventDoc.workshopTitle && (
                            <p className="admin-event-card__meta">
                              Linked workshop: {eventDoc.workshopTitle}
                            </p>
                          )}
                        </div>
                        <div className="admin-event-card__actions">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            onClick={() => handleEditEvent(eventDoc)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn--primary"
                            type="button"
                            onClick={() => handleDeleteEvent(eventDoc.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              )}
              <AdminPagination page={eventPage} total={normalizedEvents.length} onPageChange={setEventPage} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AdminCutFlowerClassesView() {
  usePageMetadata({
    title: "Admin · Cut Flower Classes",
    description: "Create bookable cut flower sessions for customers.",
  });
  const {
    db,
    storage,
    cutFlowerClasses,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const uploadAsset = useUploadAsset(storage);
  const [classForm, setClassForm] = useState(INITIAL_CUT_FLOWER_CLASS_FORM);
  const [classImageFile, setClassImageFile] = useState(null);
  const [classImagePreview, setClassImagePreview] = useState("");
  const [editingClassId, setEditingClassId] = useState(null);
  const [classSaving, setClassSaving] = useState(false);
  const [classError, setClassError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const classPreviewUrlRef = useRef(null);
  const [classPage, setClassPage] = useState(0);

  const normalizedClasses = useMemo(() => {
    return cutFlowerClasses
      .map((doc) => {
        const eventDate = parseDateValue(doc.eventDate);
        return {
          ...doc,
          eventDate,
          displayDate: eventDate ? bookingDateFormatter.format(eventDate) : "Date to be confirmed",
          priceLabel: formatPriceLabel(doc.price),
        };
      })
      .sort((a, b) => {
        if (!a.eventDate && !b.eventDate) return 0;
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return a.eventDate - b.eventDate;
      });
  }, [cutFlowerClasses]);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3200);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(
    () => () => {
      if (classPreviewUrlRef.current) {
        URL.revokeObjectURL(classPreviewUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(normalizedClasses.length / ADMIN_PAGE_SIZE) - 1);
    setClassPage((prev) => Math.min(prev, maxPage));
  }, [normalizedClasses.length]);

  const paginatedClasses = useMemo(() => {
    const start = classPage * ADMIN_PAGE_SIZE;
    return normalizedClasses.slice(start, start + ADMIN_PAGE_SIZE);
  }, [normalizedClasses, classPage]);

  const resetClassForm = () => {
    setClassForm(INITIAL_CUT_FLOWER_CLASS_FORM);
    setClassImageFile(null);
    setClassImagePreview("");
    setEditingClassId(null);
    setClassError(null);
    setClassSaving(false);
  };

  const handleClassImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (classPreviewUrlRef.current) {
      URL.revokeObjectURL(classPreviewUrlRef.current);
      classPreviewUrlRef.current = null;
    }
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        setClassError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        return;
      }
      const preview = URL.createObjectURL(file);
      classPreviewUrlRef.current = preview;
      setClassImageFile(file);
      setClassImagePreview(preview);
    } else {
      setClassImageFile(null);
      setClassImagePreview(classForm.image || "");
    }
  };

  const handleEditClass = (classDoc) => {
    const eventDate = parseDateValue(classDoc.eventDate);
    setClassForm({
      title: classDoc.title || "",
      description: classDoc.description || "",
      location: classDoc.location || "",
      price: classDoc.price === undefined || classDoc.price === null ? "" : String(classDoc.price),
      capacity: classDoc.capacity === undefined || classDoc.capacity === null ? "" : String(classDoc.capacity),
      image: classDoc.image || "",
      date: eventDate ? formatDateInput(eventDate) : "",
      time: eventDate ? formatTimeInput(eventDate) : "",
      status: classDoc.status || "live",
    });
    setClassImagePreview(classDoc.image || "");
    setClassImageFile(null);
    setEditingClassId(classDoc.id);
    setClassError(null);
  };

  const handleDeleteClass = async (classId) => {
    if (!db || !inventoryEnabled) return;
    const confirmed = window.confirm("Delete this cut flower class? This cannot be undone.");
    if (!confirmed) return;
    await deleteDoc(doc(db, "cutFlowerClasses", classId));
    setStatusMessage("Class removed");
    if (editingClassId === classId) {
      resetClassForm();
    }
  };

  const handleSaveClass = async (event) => {
    event.preventDefault();
    if (!inventoryEnabled || !db) {
      setClassError("You do not have permission to manage cut flower classes.");
      return;
    }

    if (!classForm.title.trim()) {
      setClassError("Class title is required.");
      return;
    }

    if (!classForm.date.trim()) {
      setClassError("Event date is required.");
      return;
    }

    let imageUrl = classForm.image.trim();
    setClassSaving(true);
    setClassError(null);

    try {
      if (classImageFile) {
        imageUrl = await uploadAsset(classImageFile, "cut-flower-classes");
      }

      if (!imageUrl) {
        setClassError("Please upload an image for this class.");
        setClassSaving(false);
        return;
      }

      const eventDate = combineDateAndTime(classForm.date, classForm.time);
      const payload = {
        title: classForm.title.trim(),
        description: classForm.description.trim(),
        location: classForm.location.trim(),
        price:
          classForm.price === "" ? null : Number.isFinite(Number(classForm.price)) ? Number(classForm.price) : classForm.price,
        capacity:
          classForm.capacity === "" ? null : Number.isFinite(Number(classForm.capacity)) ? Number(classForm.capacity) : classForm.capacity,
        image: imageUrl,
        eventDate: eventDate ?? null,
        status: classForm.status || "draft",
        updatedAt: serverTimestamp(),
      };

      if (editingClassId) {
        await updateDoc(doc(db, "cutFlowerClasses", editingClassId), payload);
        setStatusMessage("Class updated");
      } else {
        await addDoc(collection(db, "cutFlowerClasses"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatusMessage("Class created");
      }

      resetClassForm();
    } catch (saveError) {
      console.error(saveError);
      setClassError("We couldn’t save the class. Please try again.");
    } finally {
      setClassSaving(false);
    }
  };

  return (
    <section className="section section--tight">
      <div className="section__inner">
        <div className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h2>Cut Flower Classes</h2>
              <p className="admin-panel__note">
                Publish bookable sessions for bouquets, styling experiences, and private floral classes.
              </p>
            </div>
            {statusMessage && <span className="badge badge--muted">{statusMessage}</span>}
          </div>
          {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
          <div className="admin-panel__content admin-panel__content--split">
            <div>
              <h3>{editingClassId ? "Edit Class" : "Create Class"}</h3>
              <form className="admin-form" onSubmit={handleSaveClass}>
                <input
                  className="input"
                  placeholder="Class title"
                  value={classForm.title}
                  onChange={(e) =>
                    setClassForm((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  required
                />
                <input
                  className="input"
                  placeholder="Location"
                  value={classForm.location}
                  onChange={(e) =>
                    setClassForm((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Price (numbers or text)"
                  value={classForm.price}
                  onChange={(e) =>
                    setClassForm((prev) => ({
                      ...prev,
                      price: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Capacity"
                  value={classForm.capacity}
                  onChange={(e) =>
                    setClassForm((prev) => ({
                      ...prev,
                      capacity: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                />
                <select
                  className="input"
                  value={classForm.status}
                  onChange={(e) =>
                    setClassForm((prev) => ({
                      ...prev,
                      status: e.target.value,
                    }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="archived">Archived</option>
                </select>
                <input
                  className="input"
                  type="date"
                  value={classForm.date}
                  onChange={(e) =>
                    setClassForm((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  required
                />
                <input
                  className="input"
                  type="time"
                  value={classForm.time}
                  onChange={(e) =>
                    setClassForm((prev) => ({
                      ...prev,
                      time: e.target.value,
                    }))
                  }
                />
                <textarea
                  className="input textarea admin-form__full"
                  placeholder="Description"
                  value={classForm.description}
                  onChange={(e) =>
                    setClassForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
                <div className="admin-file-input admin-form__full">
                  <label htmlFor="cutflower-class-image" className="sr-only">
                    Class image
                  </label>
                  <input
                    key={editingClassId ?? "new-class"}
                    className="input input--file"
                    id="cutflower-class-image"
                    type="file"
                    accept="image/*"
                    onChange={handleClassImageChange}
                  />
                  <p className="admin-panel__note">Upload JPG or PNG (max 3MB).</p>
                  {(classImagePreview || classForm.image) && (
                    <img
                      src={classImagePreview || classForm.image}
                      alt="Cut flower class preview"
                      className="admin-preview"
                    />
                  )}
                </div>
                <div className="admin-form__actions">
                  <button className="btn btn--secondary" type="button" onClick={resetClassForm} disabled={classSaving}>
                    Reset
                  </button>
                  <button className="btn btn--primary" type="submit" disabled={classSaving || !inventoryEnabled}>
                    {classSaving
                      ? "Saving…"
                      : editingClassId
                      ? "Update Class"
                      : "Create Class"}
                  </button>
                </div>
                {classError && <p className="admin-panel__error">{classError}</p>}
              </form>
            </div>
            <div>
              <h3>Scheduled Classes</h3>
              {inventoryLoading && !normalizedClasses.length ? (
                <p className="admin-panel__note">Loading cut flower classes…</p>
              ) : (
                <div className="admin-panel__list">
                  {normalizedClasses.length === 0 ? (
                    <p className="admin-panel__note">No cut flower classes yet.</p>
                  ) : (
                    paginatedClasses.map((classDoc) => (
                      <article className="admin-event-card" key={classDoc.id}>
                        <div className="admin-event-card__info">
                          <p className="admin-event-card__date">{classDoc.displayDate}</p>
                          <h4>{classDoc.title}</h4>
                          {classDoc.location && (
                            <p className="admin-event-card__meta">{classDoc.location}</p>
                          )}
                          {classDoc.priceLabel && (
                            <p className="admin-event-card__meta">Fee: {classDoc.priceLabel}</p>
                          )}
                          {classDoc.capacity && (
                            <p className="admin-event-card__meta">Capacity: {classDoc.capacity}</p>
                          )}
                        </div>
                        <div className="admin-event-card__actions">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            onClick={() => handleEditClass(classDoc)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn--primary"
                            type="button"
                            onClick={() => handleDeleteClass(classDoc.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              )}
              <AdminPagination page={classPage} total={normalizedClasses.length} onPageChange={setClassPage} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AdminCutFlowerBookingsView() {
  usePageMetadata({
    title: "Admin · Cut Flowers",
    description: "Track bespoke cut flower bookings separately from workshops.",
  });
  const {
    db,
    cutFlowerBookings,
    inventoryEnabled,
    inventoryLoading,
    inventoryError,
  } = useAdminData();
  const [formState, setFormState] = useState(INITIAL_CUT_FLOWER_BOOKING);
  const [editingId, setEditingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3200);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  const normalizedBookings = useMemo(() => {
    return cutFlowerBookings
      .map((booking) => {
        const eventDate = parseDateValue(booking.eventDate);
        return {
          ...booking,
          eventDate,
          displayDate: eventDate ? bookingDateFormatter.format(eventDate) : "Date to be confirmed",
        };
      })
      .sort((a, b) => {
        if (!a.eventDate && !b.eventDate) return 0;
        if (!a.eventDate) return 1;
        if (!b.eventDate) return -1;
        return a.eventDate - b.eventDate;
      });
  }, [cutFlowerBookings]);

  const resetForm = () => {
    setFormState(INITIAL_CUT_FLOWER_BOOKING);
    setEditingId(null);
    setFormError(null);
  };

  const handleEdit = (booking) => {
    const eventDate = parseDateValue(booking.eventDate);
    setFormState({
      customerName: booking.customerName || "",
      email: booking.email || "",
      phone: booking.phone || "",
      occasion: booking.occasion || "",
      location: booking.location || "",
      budget: booking.budget || "",
      notes: booking.notes || "",
      status: booking.status || "new",
      date: eventDate ? formatDateInput(eventDate) : "",
      time: eventDate ? formatTimeInput(eventDate) : "",
    });
    setEditingId(booking.id);
    setFormError(null);
  };

  const handleDelete = async (bookingId) => {
    if (!db || !inventoryEnabled) return;
    const confirmed = window.confirm("Delete this cut flower booking? This action cannot be undone.");
    if (!confirmed) return;
    await deleteDoc(doc(db, "cutFlowerBookings", bookingId));
    setStatusMessage("Cut flower booking removed");
    if (editingId === bookingId) {
      resetForm();
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!db || !inventoryEnabled) {
      setFormError("You do not have permission to manage cut flower bookings.");
      return;
    }

    if (!formState.customerName.trim()) {
      setFormError("Customer name is required.");
      return;
    }

    if (!formState.date.trim()) {
      setFormError("Please select an event date.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const eventDate = combineDateAndTime(formState.date, formState.time);
      const payload = {
        customerName: formState.customerName.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim(),
        occasion: formState.occasion.trim(),
        location: formState.location.trim(),
        budget: formState.budget.trim(),
        notes: formState.notes.trim(),
        status: formState.status || "new",
        eventDate: eventDate ?? null,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, "cutFlowerBookings", editingId), payload);
        setStatusMessage("Booking updated");
      } else {
        await addDoc(collection(db, "cutFlowerBookings"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setStatusMessage("Booking added");
      }

      resetForm();
    } catch (saveError) {
      console.error(saveError);
      setFormError("We couldn’t save the booking. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section section--tight">
      <div className="section__inner">
        <div className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h2>Cut Flower Bookings</h2>
              <p className="admin-panel__note">
                Manage requests for installations, weekly drops, and bespoke bouquets without mixing them into workshop
                bookings.
              </p>
            </div>
            {statusMessage && <span className="badge badge--muted">{statusMessage}</span>}
          </div>
          {inventoryError && <p className="admin-panel__error">{inventoryError}</p>}
          <div className="admin-panel__content admin-panel__content--split">
            <div>
              <h3>{editingId ? "Edit Booking" : "Create Booking"}</h3>
              <form className="admin-form" onSubmit={handleSave}>
                <input
                  className="input"
                  placeholder="Customer name"
                  value={formState.customerName}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      customerName: e.target.value,
                    }))
                  }
                  required
                />
                <input
                  className="input"
                  placeholder="Email"
                  value={formState.email}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Phone"
                  value={formState.phone}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Occasion / brief"
                  value={formState.occasion}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      occasion: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Location"
                  value={formState.location}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  placeholder="Budget (optional)"
                  value={formState.budget}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      budget: e.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  type="date"
                  value={formState.date}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  required
                />
                <input
                  className="input"
                  type="time"
                  value={formState.time}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      time: e.target.value,
                    }))
                  }
                />
                <select
                  className="input"
                  value={formState.status}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      status: e.target.value,
                    }))
                  }
                >
                  {CUT_FLOWER_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status.replace(/-/g, " ")}
                    </option>
                  ))}
                </select>
                <textarea
                  className="input textarea admin-form__full"
                  placeholder="Notes"
                  value={formState.notes}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                />
                <div className="admin-form__actions">
                  <button className="btn btn--secondary" type="button" onClick={resetForm} disabled={saving}>
                    Reset
                  </button>
                  <button className="btn btn--primary" type="submit" disabled={saving || !inventoryEnabled}>
                    {saving ? "Saving…" : editingId ? "Update Booking" : "Create Booking"}
                  </button>
                </div>
                {formError && <p className="admin-panel__error">{formError}</p>}
              </form>
            </div>
            <div>
              <h3>Upcoming Requests</h3>
              {inventoryLoading && !normalizedBookings.length ? (
                <p className="admin-panel__note">Loading cut flower bookings…</p>
              ) : (
                <div className="admin-panel__list">
                  {normalizedBookings.length === 0 ? (
                    <p className="admin-panel__note">No cut flower bookings yet.</p>
                  ) : (
                    normalizedBookings.map((booking) => (
                      <article className="admin-event-card" key={booking.id}>
                        <div className="admin-event-card__info">
                          <p className="admin-event-card__date">{booking.displayDate}</p>
                          <h4>{booking.customerName}</h4>
                          {booking.occasion && (
                            <p className="admin-event-card__meta">Occasion: {booking.occasion}</p>
                          )}
                          {booking.location && (
                            <p className="admin-event-card__meta">Location: {booking.location}</p>
                          )}
                          <p className="admin-event-card__meta">
                            Status: {booking.status ? booking.status.replace(/-/g, " ") : "new"}
                          </p>
                        </div>
                        <div className="admin-event-card__actions">
                          <button
                            className="btn btn--secondary"
                            type="button"
                            onClick={() => handleEdit(booking)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn--primary"
                            type="button"
                            onClick={() => handleDelete(booking.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AdminOrdersView() {
  usePageMetadata({
    title: "Admin · Orders",
    description: "Review cart checkouts and fulfilment status.",
  });
  const { db, orders, inventoryLoading, inventoryError } = useAdminData();
  const [statusMessage, setStatusMessage] = useState(null);
  const functionsInstance = useMemo(() => {
    try {
      return getFirebaseFunctions();
    } catch {
      return null;
    }
  }, []);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);
  const [trackingInput, setTrackingInput] = useState("");
  const trackingInputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [paymentUpdating, setPaymentUpdating] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState("company");
  const [courierName, setCourierName] = useState("");
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [ordersPage, setOrdersPage] = useState(0);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (pendingStatusUpdate) {
      trackingInputRef.current?.focus({ preventScroll: true });
    }
  }, [pendingStatusUpdate]);

  const needsTrackingLink = (status) => ["ready", "fulfilled"].includes(status);

  const normalizePaymentStatus = (order) =>
    (order?.payfast?.paymentStatus || order?.paymentStatus || "").toLowerCase() || "unknown";

  const normalizeDeliveryStatus = (order) => {
    if (order?.trackingLink) return "assigned";
    return "not-assigned";
  };

  const handleMarkPaymentReceived = async (order) => {
    if (!db || !order?.id) return;
    setPaymentUpdating(true);
    try {
      await updateDoc(doc(db, "orders", order.id), {
        paymentStatus: "paid",
        status: order.status === "pending" ? "processing" : order.status || "processing",
        paidAt: serverTimestamp(),
      });

      // Mark any linked bookings as paid
      const bookingRefs = [];
      if (order.items?.some((item) => item.metadata?.type === "workshop")) {
        const { getDocs, query, where } = await import("firebase/firestore");
        const bookingsQuery = query(collection(db, "bookings"), where("orderId", "==", order.id));
        const snapshot = await getDocs(bookingsQuery);
        snapshot.forEach((docSnap) => bookingRefs.push(docSnap.ref));
        if (bookingRefs.length) {
          const { writeBatch } = await import("firebase/firestore");
          const batch = writeBatch(db);
          bookingRefs.forEach((ref) =>
            batch.set(
              ref,
              { paid: true, paymentStatus: "paid", paidAt: serverTimestamp() },
              { merge: true },
            ),
          );
          await batch.commit();
        }
      }

      setStatusMessage("Payment marked as received");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setPaymentUpdating(false);
    }
  };

  const handleSaveDelivery = async () => {
    if (!db || !selectedOrder) return;
    if (deliveryMethod === "courier" && !courierName.trim()) {
      setStatusMessage("Select a courier before saving.");
      return;
    }
    setDeliverySaving(true);
    try {
      await updateDoc(doc(db, "orders", selectedOrder.id), {
        deliveryMethod,
        courierName: deliveryMethod === "courier" ? courierName.trim() : "",
        trackingLink: trackingInput.trim() || null,
        updatedAt: serverTimestamp(),
      });

      if (functionsInstance && selectedOrder?.customer?.email) {
        const sendOrderStatusEmail = httpsCallable(functionsInstance, "sendOrderStatusEmail");
        await sendOrderStatusEmail({
          customer: selectedOrder.customer,
          orderNumber: selectedOrder.orderNumber,
          status: selectedOrder.status || "updated",
          trackingLink: trackingInput.trim(),
        });
      }

      setStatusMessage("Delivery updated");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setDeliverySaving(false);
    }
  };

  const handleUpdateOrderStatus = async (
    orderId,
    nextStatus,
    trackingLinkOverride = null
  ) => {
    if (!db) return;
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) return;

    if (needsTrackingLink(nextStatus) && trackingLinkOverride === null) {
      setPendingStatusUpdate({
        orderId,
        status: nextStatus,
        existingLink: targetOrder.trackingLink || "",
      });
      setTrackingInput(targetOrder.trackingLink || "");
      return;
    }

    const normalizedLink =
      typeof trackingLinkOverride === "string"
        ? trackingLinkOverride.trim()
        : targetOrder.trackingLink || "";
    const fallbackLink = normalizedLink || targetOrder.trackingLink || "";
    const finalTrackingLink = needsTrackingLink(nextStatus)
      ? fallbackLink || null
      : targetOrder.trackingLink || null;

    await updateDoc(doc(db, "orders", orderId), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      trackingLink: finalTrackingLink,
    });
    setStatusMessage("Order updated");

    if (functionsInstance && targetOrder?.customer?.email) {
      try {
        const sendOrderStatusEmail = httpsCallable(
          functionsInstance,
          "sendOrderStatusEmail"
        );
        await sendOrderStatusEmail({
          status: nextStatus,
          orderNumber: targetOrder.orderNumber ?? null,
          trackingLink: finalTrackingLink || "",
          customer: targetOrder.customer,
        });
      } catch (error) {
        console.warn("Failed to send order status email", error);
        setStatusMessage("Order updated, but customer email failed to send.");
      }
    }

    setPendingStatusUpdate(null);
    setTrackingInput("");
  };

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" ? true : (order.status || "pending") === statusFilter;
      if (!matchesStatus) return false;
      if (!term) return true;
      const haystack = [
        order.id,
        order.orderNumber ? String(order.orderNumber) : "",
        order.customer?.fullName || "",
        order.customer?.email || "",
        order.customer?.phone || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, searchTerm, statusFilter]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredOrders.length / ADMIN_PAGE_SIZE) - 1);
    setOrdersPage((prev) => Math.min(prev, maxPage));
  }, [filteredOrders.length]);

  const paginatedOrders = useMemo(() => {
    const start = ordersPage * ADMIN_PAGE_SIZE;
    return filteredOrders.slice(start, start + ADMIN_PAGE_SIZE);
  }, [filteredOrders, ordersPage]);

  const kpi = useMemo(() => {
    const today = new Date();
    const isToday = (ts) => {
      if (!ts?.toDate) return false;
      const d = ts.toDate();
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    };
    const totalToday = orders.filter((o) => isToday(o.createdAt)).length;
    const statusCounts = orders.reduce(
      (acc, order) => {
        const status = order.status || "pending";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { pending: 0, processing: 0, ready: 0, fulfilled: 0, cancelled: 0 }
    );
    const paidCount = orders.filter((o) => normalizePaymentStatus(o) === "complete" || normalizePaymentStatus(o) === "paid").length;
    const failedPayments = orders.filter((o) => normalizePaymentStatus(o) === "failed").length;
    return { totalToday, statusCounts, paidCount, failedPayments };
  }, [orders]);

  const selectedOrder = selectedOrderId
    ? filteredOrders.find((order) => order.id === selectedOrderId) || null
    : null;

  useEffect(() => {
    if (selectedOrder) {
      setDeliveryMethod(selectedOrder.deliveryMethod || "company");
      setCourierName(selectedOrder.courierName || "");
      setTrackingInput(selectedOrder.trackingLink || "");
    }
  }, [selectedOrder]);

  return (
    <div className="admin-panel admin-panel--full">
      <Reveal as="div" className="admin-panel__header">
        <div>
          <h2>Orders</h2>
          <p className="admin-panel__note">
            Track everything added to cart, including workshop metadata.
          </p>
        </div>
      </Reveal>

      <Reveal as="div" className="admin-kpi-grid" delay={20}>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Orders Today</p>
          <p className="admin-kpi__value">{kpi.totalToday}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Pending</p>
          <p className="admin-kpi__value">{kpi.statusCounts.pending || 0}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Processing</p>
          <p className="admin-kpi__value">{kpi.statusCounts.processing || 0}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Ready / Fulfilled</p>
          <p className="admin-kpi__value">{(kpi.statusCounts.ready || 0) + (kpi.statusCounts.fulfilled || 0)}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Paid</p>
          <p className="admin-kpi__value">{kpi.paidCount}</p>
        </div>
        <div className="admin-kpi">
          <p className="admin-kpi__label">Failed Payments</p>
          <p className="admin-kpi__value">{kpi.failedPayments}</p>
        </div>
      </Reveal>

      <Reveal as="div" className="admin-filters" delay={40}>
        <div className="admin-filters__left">
          <label className="admin-filters__field">
            <span>Search</span>
            <input
              className="input"
              type="search"
              placeholder="Order #, name, email, phone"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="admin-filters__field">
            <span>Status</span>
            <select
              className="input"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Reveal>

      <Reveal as="div" className="admin-table__wrapper" delay={60}>
        {filteredOrders.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Amount</th>
                <th scope="col">Payment</th>
                <th scope="col">Order Status</th>
                <th scope="col">Delivery</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => {
                const createdAtLabel = order.createdAt?.toDate?.()
                  ? bookingDateFormatter.format(order.createdAt.toDate())
                  : "Pending";
                const total =
                  typeof order.totalPrice === "number"
                    ? order.totalPrice
                    : Number(order.totalPrice) || 0;
                const orderLabel = Number.isFinite(order.orderNumber)
                  ? `Order #${order.orderNumber}`
                  : "Order";
                const paymentStatus = normalizePaymentStatus(order);
                const deliveryStatus = normalizeDeliveryStatus(order);
                return (
                  <tr
                    key={order.id}
                    className={order.id === selectedOrderId ? "is-active" : ""}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <td>
                      <strong>{orderLabel}</strong>
                      <p className="modal__meta">{createdAtLabel}</p>
                      <p className="modal__meta">Ref: {order.id}</p>
                      {order.trackingLink && (
                        <p className="modal__meta">
                          <a
                            href={order.trackingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Tracking link
                          </a>
                        </p>
                      )}
                    </td>
                    <td>
                      <p>{order.customer?.fullName || "—"}</p>
                      <p className="modal__meta">
                        {order.customer?.email || "—"}
                      </p>
                      {order.customer?.phone && (
                        <p className="modal__meta">{order.customer.phone}</p>
                      )}
                    </td>
                    <td>{formatPriceLabel(total)}</td>
                    <td>
                      <span className={`admin-status admin-status--${paymentStatus}`}>
                        {paymentStatus}
                      </span>
                    </td>
                    <td>
                      <select
                        className="input"
                        value={order.status || "pending"}
                        onChange={(event) =>
                          handleUpdateOrderStatus(order.id, event.target.value)
                        }
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className="modal__meta">{deliveryStatus.replace(/-/g, " ")}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn--secondary"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedOrderId(order.id);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="admin-panel__notice">No orders yet.</p>
        )}
        <AdminPagination page={ordersPage} total={filteredOrders.length} onPageChange={setOrdersPage} />
        {inventoryLoading && <p className="modal__meta">Syncing orders…</p>}
        {inventoryError && (
          <p className="admin-panel__error">{inventoryError}</p>
        )}
        {statusMessage && (
          <p className="admin-panel__status">{statusMessage}</p>
        )}
      </Reveal>

      <div
        className={`modal order-detail-modal ${selectedOrder ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={selectedOrder ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedOrderId(null);
          }
        }}
      >
        {selectedOrder && (
          <div className="modal__content admin-order-detail">
            <button
              className="modal__close"
              type="button"
              aria-label="Close order details"
              onClick={() => setSelectedOrderId(null)}
            >
              &times;
            </button>
            <div className="admin-order-detail__header">
              <div>
                <p className="modal__meta">Ref: {selectedOrder.id}</p>
                <h3>
                  {Number.isFinite(selectedOrder.orderNumber)
                    ? `Order #${selectedOrder.orderNumber}`
                    : "Order"}
                </h3>
                <p className="modal__meta">
                  {selectedOrder.createdAt?.toDate?.()
                    ? bookingDateFormatter.format(selectedOrder.createdAt.toDate())
                    : "Pending"}
                </p>
              </div>
              <div className="admin-order-detail__chips">
                <span className={`admin-status admin-status--${normalizePaymentStatus(selectedOrder)}`}>
                  Payment: {normalizePaymentStatus(selectedOrder)}
                </span>
                <span className="admin-status">
                  Delivery: {normalizeDeliveryStatus(selectedOrder).replace(/-/g, " ")}
                </span>
                <span className="admin-status">Status: {selectedOrder.status || "pending"}</span>
              </div>
            </div>

            <div className="admin-order-detail__split">
              <div className="admin-order-detail__left">
                <div className="admin-order-detail__grid">
                  <div>
                    <h4>Customer</h4>
                    <p>{selectedOrder.customer?.fullName || "—"}</p>
                    <p className="modal__meta">{selectedOrder.customer?.email || "—"}</p>
                    {selectedOrder.customer?.phone && <p className="modal__meta">{selectedOrder.customer.phone}</p>}
                    {selectedOrder.customer?.address && <p className="modal__meta">{selectedOrder.customer.address}</p>}
                  </div>
                  <div>
                    <h4>Payment</h4>
                    <p className="modal__meta">Total: {formatPriceLabel(selectedOrder.totalPrice)}</p>
                    {selectedOrder.payfast?.paymentReference && (
                      <p className="modal__meta">Ref: {selectedOrder.payfast.paymentReference}</p>
                    )}
                    {selectedOrder.payfast?.paymentId && (
                      <p className="modal__meta">PayFast ID: {selectedOrder.payfast.paymentId}</p>
                    )}
                  </div>
                  <div>
                    <h4>Delivery</h4>
                    {selectedOrder.trackingLink ? (
                      <a
                        href={selectedOrder.trackingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="modal__meta"
                      >
                        Tracking link
                      </a>
                    ) : (
                      <p className="modal__meta">No tracking link yet</p>
                    )}
                    {selectedOrder.customer?.address && (
                      <p className="modal__meta">Ship to: {selectedOrder.customer.address}</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4>Items</h4>
                  <ul className="order-items">
                    {selectedOrder.items?.map((item) => (
                      <li key={`${selectedOrder.id}-${item.id}`}>
                        <strong>{item.name}</strong> ×{item.quantity || 1}
                        <span className="modal__meta">{formatPriceLabel(item.price)}</span>
                        {item.metadata?.type === "workshop" && (
                          <span className="modal__meta">
                            {item.metadata.sessionDayLabel ||
                              item.metadata.sessionLabel ||
                              "Session"}{" "}
                            · {item.metadata.attendeeCount || 1} attendee(s)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="admin-order-detail__right">
                <div className="admin-order-detail__actions">
                  <div className="admin-order-detail__actions-row">
                    <label>
                      Order Status
                      <select
                        className="input"
                        value={selectedOrder.status || "pending"}
                        onChange={(event) =>
                          handleUpdateOrderStatus(selectedOrder.id, event.target.value)
                        }
                      >
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() =>
                        setPendingStatusUpdate({
                          orderId: selectedOrder.id,
                          status: selectedOrder.status || "pending",
                          existingLink: selectedOrder.trackingLink || "",
                        })
                      }
                    >
                      {selectedOrder.trackingLink ? "Update Tracking" : "Add Tracking"}
                    </button>
                    <button
                      className="btn btn--primary"
                      type="button"
                      disabled={paymentUpdating}
                      onClick={() => handleMarkPaymentReceived(selectedOrder)}
                    >
                      {paymentUpdating ? "Updating…" : "Mark Payment Received"}
                    </button>
                  </div>
                  <div className="admin-order-detail__actions-grid">
                    <label>
                      Delivery Method
                      <select
                        className="input"
                        value={deliveryMethod}
                        onChange={(event) => setDeliveryMethod(event.target.value)}
                      >
                        {DELIVERY_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </label>
                    {deliveryMethod === "courier" && (
                      <>
                        <label>
                          Courier
                          <select
                            className="input"
                            value={courierName}
                            onChange={(event) => setCourierName(event.target.value)}
                          >
                            <option value="">Select courier</option>
                            {COURIER_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="admin-order-detail__wide">
                          Tracking Link
                          <input
                            className="input"
                            type="url"
                            value={trackingInput}
                            onChange={(event) => setTrackingInput(event.target.value)}
                            placeholder="https://courier.example/track/123"
                          />
                        </label>
                      </>
                    )}
                    {deliveryMethod === "company" && (
                      <label className="admin-order-detail__wide">
                        Tracking Link (optional)
                        <input
                          className="input"
                          type="url"
                          value={trackingInput}
                          onChange={(event) => setTrackingInput(event.target.value)}
                          placeholder="https://courier.example/track/123"
                        />
                      </label>
                    )}
                  </div>
                  <div className="admin-order-detail__actions-row">
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={deliverySaving}
                      onClick={handleSaveDelivery}
                    >
                      {deliverySaving ? "Saving…" : "Save Delivery"}
                    </button>
                  </div>
                  {selectedOrder.payfast?.gatewayResponse && (
                    <p className="modal__meta">
                      Gateway: {selectedOrder.payfast.gatewayResponse} · Amount verified:{" "}
                      {selectedOrder.payfast.validatedWithGateway ? "yes" : "no"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`modal ${pendingStatusUpdate ? "is-active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={pendingStatusUpdate ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setPendingStatusUpdate(null);
            setTrackingInput("");
          }
        }}
      >
        <div className="modal__content" style={{ maxWidth: "480px" }}>
          <button
            className="modal__close"
            type="button"
            onClick={() => {
              setPendingStatusUpdate(null);
              setTrackingInput("");
            }}
            aria-label="Close tracking dialog"
          >
            &times;
          </button>
          <h3 className="modal__title">Add Tracking Link</h3>
          <p className="modal__meta">
            Include a tracking link so your customer can follow their delivery.
            Leave blank if you’ll share it later.
          </p>
          <label>
            Tracking link
            <input
              ref={trackingInputRef}
              className="input"
              type="url"
              value={trackingInput}
              onChange={(event) => setTrackingInput(event.target.value)}
              placeholder="https://courier.example/track/123"
            />
          </label>
          <div className="admin-modal__actions">
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => {
                setPendingStatusUpdate(null);
                setTrackingInput("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                if (!pendingStatusUpdate) return;
                handleUpdateOrderStatus(
                  pendingStatusUpdate.orderId,
                  pendingStatusUpdate.status,
                  trackingInput
                );
              }}
            >
              Save Link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminProfileView() {
  usePageMetadata({
    title: "Admin · Profile",
    description: "Manage your admin authentication info.",
  });
  const { user, role, signOut, refreshRole } = useAuth();
  const [statusMessage, setStatusMessage] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const handleRefreshRole = async () => {
    setRoleLoading(true);
    try {
      await refreshRole();
      setStatusMessage("Role refreshed");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setRoleLoading(false);
    }
  };

  return (
    <div className="admin-panel admin-panel--narrow">
      <Reveal as="section" className="admin-panel" delay={30}>
        <h2>Profile</h2>
        <p className="modal__meta">Signed in as {user?.email}</p>
        <p className="modal__meta">
          <strong>Role:</strong> {role}
        </p>
        <p className="modal__meta">UID: {user?.uid}</p>
        {user?.metadata?.lastSignInTime && (
          <p className="modal__meta">
            Last sign-in: {user.metadata.lastSignInTime}
          </p>
        )}
        <div className="admin-profile__actions">
          <button
            className="btn btn--secondary"
            type="button"
            onClick={handleRefreshRole}
            disabled={roleLoading}
          >
            {roleLoading ? "Refreshing…" : "Refresh Role"}
          </button>
          <button className="btn btn--primary" type="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
        {statusMessage && (
          <p className="admin-panel__status">{statusMessage}</p>
        )}
      </Reveal>
    </div>
  );
}

export default AdminDashboardView;
function AdminPagination({ page, total, onPageChange, pageSize = ADMIN_PAGE_SIZE }) {
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="admin-pagination">
      <span className="admin-pagination__info">
        Showing {start}–{end} of {total}
      </span>
      <div className="admin-pagination__controls">
        <button
          className="admin-pagination__button"
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
        >
          Previous
        </button>
        <span className="admin-pagination__page">
          Page {page + 1} of {totalPages}
        </span>
        <button
          className="admin-pagination__button"
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
