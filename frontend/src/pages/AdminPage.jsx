import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Reveal from "../components/Reveal.jsx";
import { useAdminData } from "../context/AdminDataContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { seedSampleData } from "../lib/seedData.js";

const INITIAL_PRODUCT_FORM = {
  name: "",
  title: "",
  description: "",
  price: "",
  image: "",
  category: "product",
};

const INITIAL_WORKSHOP_FORM = {
  title: "",
  description: "",
  scheduledFor: "",
  price: "",
  location: "",
  image: "",
  whatToExpect: "",
  bookingPricing: "",
  goodToKnow: "",
  cancellations: "",
  groupsInfo: "",
  careInfo: "",
  whyPeopleLove: "",
  ctaNote: "",
  sessions: [],
};

const DEFAULT_SLOT_CAPACITY = 10;
const ORDER_STATUSES = [
  "pending",
  "processing",
  "ready",
  "fulfilled",
  "cancelled",
];
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

const createEmptySession = () => ({
  id: `session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  date: "",
  time: "",
  capacity: String(DEFAULT_SLOT_CAPACITY),
  label: "",
});

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
  const productPreviewUrlRef = useRef(null);
  const uploadAsset = useUploadAsset(storage);

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

    if (!name) {
      setProductError("Product name is required.");
      return;
    }

    if (!productImageFile && !productForm.image.trim()) {
      setProductError("Please upload a product image.");
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
                <th scope="col">Updated</th>
                <th scope="col" className="admin-table__actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
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
  const [workshopForm, setWorkshopForm] = useState({
    ...INITIAL_WORKSHOP_FORM,
    sessions: [createEmptySession()],
  });
  const [editingWorkshopId, setEditingWorkshopId] = useState(null);
  const [workshopImageFile, setWorkshopImageFile] = useState(null);
  const [workshopImagePreview, setWorkshopImagePreview] = useState("");
  const [workshopSaving, setWorkshopSaving] = useState(false);
  const [workshopError, setWorkshopError] = useState(null);
  const workshopPreviewUrlRef = useRef(null);

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

  const openWorkshopModal = () => {
    setWorkshopForm({
      ...INITIAL_WORKSHOP_FORM,
      sessions: [createEmptySession()],
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

  const handleWorkshopSessionChange = (sessionId, field, value) => {
    setWorkshopForm((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.id === sessionId ? { ...session, [field]: value } : session
      ),
    }));
  };

  const handleAddWorkshopSession = () => {
    setWorkshopForm((prev) => ({
      ...prev,
      sessions: [...prev.sessions, createEmptySession()],
    }));
  };

  const handleRemoveWorkshopSession = (sessionId) => {
    setWorkshopForm((prev) => {
      const nextSessions = prev.sessions.filter(
        (session) => session.id !== sessionId
      );
      return {
        ...prev,
        sessions:
          nextSessions.length > 0 ? nextSessions : [createEmptySession()],
      };
    });
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
      whatToExpect: workshop.whatToExpect || "",
      bookingPricing: workshop.bookingPricing || "",
      goodToKnow: workshop.goodToKnow || "",
      cancellations: workshop.cancellations || "",
      groupsInfo: workshop.groupsInfo || "",
      careInfo: workshop.careInfo || "",
      whyPeopleLove: workshop.whyPeopleLove || "",
      ctaNote: workshop.ctaNote || "",
      sessions: (() => {
        const rawSessions = Array.isArray(workshop.sessions)
          ? workshop.sessions
          : [];
        if (rawSessions.length === 0) return [createEmptySession()];
        return rawSessions.map((session, index) => {
          const startDate = parseDateValue(
            session.start || workshop.scheduledFor
          );
          return {
            id: session.id || `session-${index}-${workshop.id}`,
            date: session.date || (startDate ? formatDateInput(startDate) : ""),
            time: session.time || (startDate ? formatTimeInput(startDate) : ""),
            capacity:
              session.capacity === undefined || session.capacity === null
                ? String(DEFAULT_SLOT_CAPACITY)
                : String(session.capacity),
            label: session.label || session.name || "",
          };
        });
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

    const sanitizedSessions = workshopForm.sessions
      .map((session) => {
        const dateValue = session.date?.trim();
        const timeValue = session.time?.trim();
        if (!dateValue || !timeValue) {
          return null;
        }
        const combinedDate = combineDateAndTime(dateValue, timeValue);
        if (!combinedDate) return null;
        const capacityNumber = Number(
          session.capacity || DEFAULT_SLOT_CAPACITY
        );
        return {
          id: session.id || createEmptySession().id,
          start: combinedDate.toISOString(),
          date: dateValue,
          time: timeValue,
          label:
            session.label?.trim() || bookingDateFormatter.format(combinedDate),
          capacity:
            Number.isFinite(capacityNumber) && capacityNumber > 0
              ? capacityNumber
              : DEFAULT_SLOT_CAPACITY,
        };
      })
      .filter(Boolean);

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

      <div className="admin-panel__content admin-panel__content--split">
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
                  {workshops.map((workshop) => {
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

            <div className="admin-session-panel admin-form__full">
              <div className="admin-session-panel__header">
                <h4>Workshop sessions</h4>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={handleAddWorkshopSession}
                >
                  <IconPlus aria-hidden="true" />
                </button>
              </div>
              {(workshopForm.sessions || []).map((session) => (
                <div className="admin-session-row" key={session.id}>
                  <div className="admin-session-field">
                    <label
                      className="admin-session-label"
                      htmlFor={`session-date-${session.id}`}
                    >
                      Date
                    </label>
                    <input
                      className="input"
                      type="date"
                      id={`session-date-${session.id}`}
                      value={session.date}
                      onChange={(event) =>
                        handleWorkshopSessionChange(
                          session.id,
                          "date",
                          event.target.value
                        )
                      }
                    />
                  </div>
                  <div className="admin-session-field">
                    <label
                      className="admin-session-label"
                      htmlFor={`session-time-${session.id}`}
                    >
                      Time
                    </label>
                    <input
                      className="input"
                      type="time"
                      id={`session-time-${session.id}`}
                      value={session.time}
                      onChange={(event) =>
                        handleWorkshopSessionChange(
                          session.id,
                          "time",
                          event.target.value
                        )
                      }
                    />
                  </div>
                  <div className="admin-session-field">
                    <label
                      className="admin-session-label"
                      htmlFor={`session-capacity-${session.id}`}
                    >
                      Capacity
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      id={`session-capacity-${session.id}`}
                      value={session.capacity}
                      onChange={(event) =>
                        handleWorkshopSessionChange(
                          session.id,
                          "capacity",
                          event.target.value
                        )
                      }
                    />
                  </div>
                  <div className="admin-session-field">
                    <label
                      className="admin-session-label"
                      htmlFor={`session-label-${session.id}`}
                    >
                      Label
                    </label>
                    <input
                      className="input"
                      id={`session-label-${session.id}`}
                      value={session.label}
                      onChange={(event) =>
                        handleWorkshopSessionChange(
                          session.id,
                          "label",
                          event.target.value
                        )
                      }
                      placeholder="Morning session, Mother's Day, etc."
                    />
                  </div>
                  <button
                    className="icon-btn icon-btn--danger admin-session-remove"
                    type="button"
                    onClick={() => handleRemoveWorkshopSession(session.id)}
                  >
                    <IconTrash aria-hidden="true" />
                  </button>
                </div>
              ))}
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

export function AdminOrdersView() {
  usePageMetadata({
    title: "Admin · Orders",
    description: "Review cart checkouts and fulfilment status.",
  });
  const { db, orders, inventoryLoading, inventoryError } = useAdminData();
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = setTimeout(() => setStatusMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [statusMessage]);

  const handleUpdateOrderStatus = async (orderId, nextStatus) => {
    if (!db) return;
    await updateDoc(doc(db, "orders", orderId), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    setStatusMessage("Order updated");
  };

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

      <Reveal as="div" className="admin-table__wrapper" delay={60}>
        {orders.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Items</th>
                <th scope="col">Total</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const createdAtLabel = order.createdAt?.toDate?.()
                  ? bookingDateFormatter.format(order.createdAt.toDate())
                  : "Pending";
                const total =
                  typeof order.totalPrice === "number"
                    ? order.totalPrice
                    : Number(order.totalPrice) || 0;
                return (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.id}</strong>
                      <p className="modal__meta">{createdAtLabel}</p>
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
                    <td>
                      <ul className="order-items">
                        {order.items?.map((item) => (
                          <li key={`${order.id}-${item.id}`}>
                            <strong>{item.name}</strong> ×{item.quantity || 1}
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
                    </td>
                    <td>{formatPriceLabel(total)}</td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="admin-panel__notice">No orders yet.</p>
        )}
        {inventoryLoading && <p className="modal__meta">Syncing orders…</p>}
        {inventoryError && (
          <p className="admin-panel__error">{inventoryError}</p>
        )}
        {statusMessage && (
          <p className="admin-panel__status">{statusMessage}</p>
        )}
      </Reveal>
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
