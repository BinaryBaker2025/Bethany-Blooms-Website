import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getFirebaseDb, getFirebaseStorage } from "../lib/firebase.js";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import { seedSampleData } from "../lib/seedData.js";
import heroBackground from "../assets/hero-flowers.svg";

const INITIAL_PRODUCT_FORM = {
  name: "",
  title: "",
  description: "",
  price: "",
  image: "",
  category: "kit",
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
};

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

function AdminPage() {
  usePageMetadata({
    title: "Bethany Blooms Admin",
    description: "Manage shop products, workshop listings, and bookings with Firebase-backed tools.",
  });

  const { user, loading, initError, signIn, signOut, isAdmin, role, roleLoading } = useAuth();
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [products, setProducts] = useState([]);
  const [workshopsList, setWorkshopsList] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventoryError, setInventoryError] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [productForm, setProductForm] = useState(INITIAL_PRODUCT_FORM);
  const [workshopForm, setWorkshopForm] = useState(INITIAL_WORKSHOP_FORM);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState(null);
  const [seedStatus, setSeedStatus] = useState(null);
  const [productStatus, setProductStatus] = useState(null);
  const [workshopStatus, setWorkshopStatus] = useState(null);
  const [productSaving, setProductSaving] = useState(false);
  const [workshopSaving, setWorkshopSaving] = useState(false);
  const [productError, setProductError] = useState(null);
  const [workshopError, setWorkshopError] = useState(null);
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [isWorkshopModalOpen, setWorkshopModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingWorkshopId, setEditingWorkshopId] = useState(null);
  const [productImageFile, setProductImageFile] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState("");
  const [workshopImageFile, setWorkshopImageFile] = useState(null);
  const [workshopImagePreview, setWorkshopImagePreview] = useState("");
  const productPreviewUrlRef = useRef(null);
  const workshopPreviewUrlRef = useRef(null);

  useEffect(() => {
    if (!productStatus) return undefined;
    const timeout = setTimeout(() => setProductStatus(null), 4000);
    return () => clearTimeout(timeout);
  }, [productStatus]);

  useEffect(() => {
    if (!workshopStatus) return undefined;
    const timeout = setTimeout(() => setWorkshopStatus(null), 4000);
    return () => clearTimeout(timeout);
  }, [workshopStatus]);

  useEffect(() => () => {
    if (productPreviewUrlRef.current) {
      URL.revokeObjectURL(productPreviewUrlRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (workshopPreviewUrlRef.current) {
      URL.revokeObjectURL(workshopPreviewUrlRef.current);
    }
  }, []);

  useEffect(() => {
    if (productImageFile) return;
    setProductImagePreview(productForm.image ? productForm.image : "");
  }, [productForm.image, productImageFile]);

  useEffect(() => {
    if (workshopImageFile) return;
    setWorkshopImagePreview(workshopForm.image ? workshopForm.image : "");
  }, [workshopForm.image, workshopImageFile]);

  const openProductModal = () => {
    setProductError(null);
    setProductStatus(null);
    setEditingProductId(null);
    setProductForm(INITIAL_PRODUCT_FORM);
    if (productPreviewUrlRef.current) {
      URL.revokeObjectURL(productPreviewUrlRef.current);
      productPreviewUrlRef.current = null;
    }
    setProductImageFile(null);
    setProductImagePreview("");
    setProductModalOpen(true);
  };

  const closeProductModal = () => {
    setProductModalOpen(false);
    setProductError(null);
    setProductStatus(null);
    setProductSaving(false);
    setEditingProductId(null);
    if (productPreviewUrlRef.current) {
      URL.revokeObjectURL(productPreviewUrlRef.current);
      productPreviewUrlRef.current = null;
    }
    setProductImageFile(null);
    setProductImagePreview("");
    setProductForm(INITIAL_PRODUCT_FORM);
  };

  const openWorkshopModal = () => {
    setWorkshopError(null);
    setWorkshopStatus(null);
    setWorkshopSaving(false);
    setEditingWorkshopId(null);
    setWorkshopForm(INITIAL_WORKSHOP_FORM);
    if (workshopPreviewUrlRef.current) {
      URL.revokeObjectURL(workshopPreviewUrlRef.current);
      workshopPreviewUrlRef.current = null;
    }
    setWorkshopImageFile(null);
    setWorkshopImagePreview("");
    setWorkshopModalOpen(true);
  };

  const closeWorkshopModal = () => {
    setWorkshopModalOpen(false);
    setWorkshopError(null);
    setWorkshopStatus(null);
    setWorkshopSaving(false);
    setEditingWorkshopId(null);
    if (workshopPreviewUrlRef.current) {
      URL.revokeObjectURL(workshopPreviewUrlRef.current);
      workshopPreviewUrlRef.current = null;
    }
    setWorkshopImageFile(null);
    setWorkshopImagePreview("");
    setWorkshopForm(INITIAL_WORKSHOP_FORM);
  };

  const handleProductImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (productPreviewUrlRef.current) {
      URL.revokeObjectURL(productPreviewUrlRef.current);
      productPreviewUrlRef.current = null;
    }
    if (file) {
      setProductError(null);
      if (file.size > 3 * 1024 * 1024) {
        setProductError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        setProductImageFile(null);
        setProductImagePreview(productForm.image || "");
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

  const handleWorkshopImageChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    if (workshopPreviewUrlRef.current) {
      URL.revokeObjectURL(workshopPreviewUrlRef.current);
      workshopPreviewUrlRef.current = null;
    }
    if (file) {
      setWorkshopError(null);
      if (file.size > 3 * 1024 * 1024) {
        setWorkshopError("Please choose an image smaller than 3MB.");
        event.target.value = "";
        setWorkshopImageFile(null);
        setWorkshopImagePreview(workshopForm.image || "");
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

  const handleEditProduct = (product) => {
    setProductError(null);
    setProductStatus(null);
    setEditingProductId(product.id);
    setProductForm({
      name: product.name || product.title || "",
      title: product.title || "",
      description: product.description || "",
      price:
        product.price === undefined || product.price === null
          ? ""
          : String(product.price),
      image: product.image || "",
      category: product.category || "kit",
    });
    if (productPreviewUrlRef.current) {
      URL.revokeObjectURL(productPreviewUrlRef.current);
      productPreviewUrlRef.current = null;
    }
    setProductImageFile(null);
    setProductImagePreview(product.image || "");
    setProductModalOpen(true);
  };

  const handleEditWorkshop = (workshop) => {
    setWorkshopError(null);
    setWorkshopStatus(null);
    setEditingWorkshopId(workshop.id);
    const scheduledValue = (() => {
      if (!workshop.scheduledFor) return "";
      if (typeof workshop.scheduledFor === "string") {
        return workshop.scheduledFor.slice(0, 16);
      }
      if (workshop.scheduledFor?.toDate?.()) {
        return workshop.scheduledFor.toDate().toISOString().slice(0, 16);
      }
      return "";
    })();

    setWorkshopForm({
      title: workshop.title || workshop.name || "",
      description: workshop.description || "",
      scheduledFor: scheduledValue,
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
    });
    if (workshopPreviewUrlRef.current) {
      URL.revokeObjectURL(workshopPreviewUrlRef.current);
      workshopPreviewUrlRef.current = null;
    }
    setWorkshopImageFile(null);
    setWorkshopImagePreview(workshop.image || "");
    setWorkshopModalOpen(true);
  };

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

  const uploadAsset = async (file, folder) => {
    if (!storage) {
      throw new Error("Firebase storage is not configured.");
    }
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
    const objectPath = `${folder}/${Date.now()}-${sanitizedName}`;
    const storageRef = ref(storage, objectPath);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return getDownloadURL(storageRef);
  };

  const bookingDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [],
  );

  useEffect(() => {
    if (!db || !user || !isAdmin) {
      setProducts([]);
      setWorkshopsList([]);
      setBookings([]);
      setOrders([]);
      setInventoryLoading(false);
      return undefined;
    }

    setInventoryLoading(true);
    setInventoryError(null);

    const productsQuery = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const workshopsQuery = query(collection(db, "workshops"), orderBy("scheduledFor", "asc"));
    const bookingsQuery = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"));

    const unsubscribeProducts = onSnapshot(
      productsQuery,
      (snapshot) => {
        setProducts(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setInventoryError(null);
        setInventoryLoading(false);
      },
      (error) => {
        setInventoryError(error.message);
        setInventoryLoading(false);
      },
    );

    const unsubscribeWorkshops = onSnapshot(
      workshopsQuery,
      (snapshot) => {
        setWorkshopsList(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setInventoryError(null);
        setInventoryLoading(false);
      },
      (error) => {
        setInventoryError(error.message);
        setInventoryLoading(false);
      },
    );

    const unsubscribeBookings = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        setBookings(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setInventoryError(null);
        setInventoryLoading(false);
      },
      (error) => {
        setInventoryError(error.message);
        setInventoryLoading(false);
      },
    );

    const unsubscribeOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOrders(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        setInventoryError(null);
        setInventoryLoading(false);
      },
      (error) => {
        setInventoryError(error.message);
        setInventoryLoading(false);
      },
    );

    return () => {
      unsubscribeProducts();
      unsubscribeWorkshops();
      unsubscribeBookings();
      unsubscribeOrders();
    };
  }, [db, isAdmin, user]);

  const handleSignIn = async (event) => {
    event.preventDefault();
    setAuthError(null);
    try {
      await signIn(loginForm.email, loginForm.password);
      setLoginForm({ email: "", password: "" });
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleCreateProduct = async (event) => {
    event.preventDefault();
    if (!isAdmin) {
      setProductError("You do not have permission to manage products.");
      return;
    }
    if (!db) {
      setProductError("Firebase is not configured. Add credentials to .env.");
      return;
    }

    setInventoryError(null);
    setProductError(null);
    setProductStatus(null);

    const name = productForm.name.trim();
    const title = productForm.title.trim() || name;
    const priceNumber = Number(productForm.price);
    const category = productForm.category.trim() || "kit";

    if (!name) {
      setProductError("Product name is required.");
      return;
    }

    const hasNumericPrice = Number.isFinite(priceNumber);
    const priceInput = productForm.price.trim();
    if (!hasNumericPrice && !priceInput) {
      setProductError("Please provide a price or price range.");
      return;
    }
    if (!productImageFile && !productForm.image.trim()) {
      setProductError("Please upload a product image.");
      return;
    }

    try {
      setStatusMessage(editingProductId ? "Updating product…" : "Saving product…");
      setProductStatus(editingProductId ? "Updating product…" : "Saving product…");
      setProductSaving(true);

      let imageUrl = productForm.image.trim();
      if (productImageFile) {
        imageUrl = await uploadAsset(productImageFile, "products");
      }

      const basePayload = {
        name,
        title,
        description: productForm.description.trim(),
        price: hasNumericPrice ? priceNumber : priceInput,
        image: imageUrl,
        category,
        updatedAt: serverTimestamp(),
      };

      let successMessage;
      if (editingProductId) {
        await updateDoc(doc(db, "products", editingProductId), basePayload);
        successMessage = "Product updated successfully.";
      } else {
        await addDoc(collection(db, "products"), {
          ...basePayload,
          createdAt: serverTimestamp(),
        });
        successMessage = "Product saved successfully.";
      }

      setProductForm(INITIAL_PRODUCT_FORM);
      setEditingProductId(null);
      if (productPreviewUrlRef.current) {
        URL.revokeObjectURL(productPreviewUrlRef.current);
        productPreviewUrlRef.current = null;
      }
      setProductImageFile(null);
      setProductImagePreview("");
      closeProductModal();
      setStatusMessage(successMessage);
      setProductStatus(successMessage);
    } catch (error) {
      setInventoryError(error.message);
      setProductError(error.message);
      setProductStatus(null);
    } finally {
      setProductSaving(false);
    }
  };

  const handleCreateWorkshop = async (event) => {
    event.preventDefault();
    if (!isAdmin) {
      setWorkshopError("You do not have permission to manage workshops.");
      return;
    }
    if (!db) {
      setWorkshopError("Firebase is not configured. Add credentials to .env.");
      return;
    }

    setInventoryError(null);
    setWorkshopError(null);
    setWorkshopStatus(null);

    const title = workshopForm.title.trim();
    if (!title) {
      setWorkshopError("Workshop title is required.");
      return;
    }

    const scheduleInput = workshopForm.scheduledFor.trim();
    if (!scheduleInput) {
      setWorkshopError("Please provide a workshop date and time.");
      return;
    }

    const parsedDate = new Date(scheduleInput);
    if (Number.isNaN(parsedDate.getTime())) {
      setWorkshopError("Workshop date must be a valid date/time.");
      return;
    }

    const priceNumber = Number(workshopForm.price);
    const priceValue = Number.isFinite(priceNumber) ? priceNumber : workshopForm.price.trim();
    if (!workshopImageFile && !workshopForm.image.trim()) {
      setWorkshopError("Please upload a workshop image.");
      return;
    }

    try {
      setStatusMessage(editingWorkshopId ? "Updating workshop…" : "Saving workshop…");
      setWorkshopStatus(editingWorkshopId ? "Updating workshop…" : "Saving workshop…");
      setWorkshopSaving(true);

      let imageUrl = workshopForm.image.trim();
      if (workshopImageFile) {
        imageUrl = await uploadAsset(workshopImageFile, "workshops");
      }

      const basePayload = {
        title,
        description: workshopForm.description.trim(),
        scheduledFor: parsedDate.toISOString(),
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
      };

      let successMessage;
      if (editingWorkshopId) {
        await updateDoc(doc(db, "workshops", editingWorkshopId), basePayload);
        successMessage = "Workshop updated.";
      } else {
        await addDoc(collection(db, "workshops"), {
          ...basePayload,
          createdAt: serverTimestamp(),
        });
        successMessage = "Workshop saved.";
      }

      setWorkshopForm(INITIAL_WORKSHOP_FORM);
      setEditingWorkshopId(null);
      if (workshopPreviewUrlRef.current) {
        URL.revokeObjectURL(workshopPreviewUrlRef.current);
        workshopPreviewUrlRef.current = null;
      }
      setWorkshopImageFile(null);
      setWorkshopImagePreview("");
      closeWorkshopModal();
      setStatusMessage(successMessage);
      setWorkshopStatus(successMessage);
    } catch (error) {
      setInventoryError(error.message);
      setWorkshopError(error.message);
      setWorkshopStatus(null);
    } finally {
      setWorkshopSaving(false);
    }
  };

  const handleDeleteDocument = async (collectionName, id) => {
    if (!db) return;
    if (!isAdmin) {
      setInventoryError("You do not have permission to update inventory.");
      return;
    }
    try {
      setStatusMessage("Deleting...");
      await deleteDoc(doc(db, collectionName, id));
      setStatusMessage("Removed.");
    } catch (error) {
      setInventoryError(error.message);
    }
  };

  const handleSeedData = async () => {
    if (!db) {
      setInventoryError("Firebase is not configured. Add credentials to .env.");
      return;
    }
    setSeedLoading(true);
    setSeedError(null);
    setSeedStatus("Loading sample data…");
    let seeded = false;
    try {
      const { seededProducts, seededWorkshops } = await seedSampleData(db);
      if (!seededProducts && !seededWorkshops) {
        setStatusMessage("Sample data already present.");
        setSeedStatus("Sample data already present.");
      } else {
        setStatusMessage("Sample data loaded successfully.");
        setSeedStatus("Sample data loaded successfully.");
        seeded = true;
      }
    } catch (error) {
      console.warn("Seed data failed", error);
      setSeedError(error.message);
      setSeedStatus(null);
    } finally {
      setSeedLoading(false);
      if (seeded) {
        setTimeout(() => setSeedStatus(null), 4000);
      }
    }
  };

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Customer";

  return (
    <>
      <section className="section section--tight">
        <div className="section__inner">
          <Hero variant="contact" background={heroBackground}>
            <h1>Studio Admin</h1>
            <p>
              Manage products, workshop listings, and customer bookings in one place. Authentication is powered by
              Firebase—configure your project to enable secure access.
            </p>
          </Hero>
        </div>
      </section>

      <section className="section section--tight">
        <div className="section__inner">
          {!user ? (
            <Reveal as="div">
              <h2>Admin Sign In</h2>
              {initError && (
                <p className="empty-state">
                  Firebase credentials missing. Add them to <code>.env</code> to activate admin login.
                </p>
              )}
              <form className="contact-form" onSubmit={handleSignIn}>
                <label className="sr-only" htmlFor="admin-email">
                  Email
                </label>
                <input
                  className="input"
                  id="admin-email"
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Admin email"
                  required
                />
                <label className="sr-only" htmlFor="admin-password">
                  Password
                </label>
                <input
                  className="input"
                  id="admin-password"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Password"
                  required
                />
                <button className="btn btn--primary" type="submit" disabled={loading}>
                  {loading ? "Checking..." : "Sign In"}
                </button>
                {authError && <p className="empty-state">{authError}</p>}
              </form>
            </Reveal>
          ) : roleLoading ? (
            <Reveal as="article" className="card">
              <h3 className="card__title">Checking Permissions</h3>
              <p className="empty-state">Hold on a moment while we confirm your access level.</p>
            </Reveal>
          ) : !isAdmin ? (
            <div className="cards-grid">
              <Reveal as="article" className="card">
                <h3 className="card__title">Account</h3>
                <p>Signed in as {user.email}</p>
                <p>
                  <strong>Role:</strong> {roleLabel}
                </p>
                <button className="btn btn--secondary" type="button" onClick={signOut}>
                  Sign Out
                </button>
              </Reveal>
              <Reveal as="article" className="card" delay={120}>
                <h3 className="card__title">Limited Access</h3>
                <p className="empty-state">
                  Thanks for signing in. This area is reserved for admin accounts. Contact the site owner if you need
                  elevated access.
                </p>
              </Reveal>
            </div>
          ) : (
            <div className="admin-dashboard">
              <Reveal as="section" className="card admin-panel">
                <div className="admin-panel__header">
                  <div>
                    <h3 className="card__title">Account</h3>
                    <p className="modal__meta">{user.email}</p>
                  </div>
                  <button className="btn btn--secondary" type="button" onClick={signOut}>
                    Sign Out
                  </button>
                </div>
                <p className="modal__meta">
                  <strong>Role:</strong> {roleLabel}
                </p>
                {statusMessage && <p className="modal__meta">{statusMessage}</p>}
              </Reveal>

              <Reveal as="section" className="card admin-panel" delay={60}>
                <div className="admin-panel__header">
                  <h3 className="card__title">Sample Data</h3>
                </div>
                <p className="modal__meta">
                  Need demo products or workshops? Load a starter set into Firestore with one click. Safe to rerun—existing
                  data stays untouched.
                </p>
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={handleSeedData}
                  disabled={seedLoading}
                >
                  <IconPlus className="btn__icon" aria-hidden="true" />
                  <span>{seedLoading ? "Seeding…" : "Load Sample Products & Workshops"}</span>
                </button>
                {seedStatus && !seedError && <p className="modal__meta admin-panel__status">{seedStatus}</p>}
                {seedError && <p className="modal__meta admin-panel__error">{seedError}</p>}
              </Reveal>

              <Reveal as="section" className="card admin-panel" delay={120}>
                <div className="admin-panel__header">
                  <h3 className="card__title">Products</h3>
                  <div className="admin-panel__header-actions">
                    {inventoryLoading && <span className="badge badge--muted">Syncing…</span>}
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={openProductModal}
                      disabled={!inventoryEnabled}
                    >
                      <IconPlus className="btn__icon" aria-hidden="true" />
                      <span>Add Product</span>
                    </button>
                  </div>
                </div>
                {!inventoryEnabled && (
                  <p className="modal__meta admin-panel__notice">
                    Add Firebase credentials and refresh to enable inventory management.
                  </p>
                )}
                {productSaving ? (
                  <div className="admin-save-indicator admin-save-indicator--working" role="status">
                    <span className="admin-spinner" aria-hidden="true"></span>
                    <span>{editingProductId ? "Updating product…" : "Saving product…"}</span>
                  </div>
                ) : (
                  productStatus && (
                    <div className="admin-save-indicator" role="status">
                      <IconCheck className="btn__icon" aria-hidden="true" />
                      <span>{productStatus}</span>
                    </div>
                  )
                )}
                {productError && <p className="admin-panel__error">{productError}</p>}
                <div className="admin-table__wrapper">
                  {products.length > 0 ? (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th scope="col">Image</th>
                          <th scope="col">Name</th>
                          <th scope="col">Category</th>
                          <th scope="col">Price</th>
                          <th scope="col">Description</th>
                          <th scope="col" className="admin-table__actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              {entry.image ? (
                                <img
                                  src={entry.image}
                                  alt={`${entry.title || entry.name || "Product"} preview`}
                                  className="admin-table__thumb"
                                />
                              ) : (
                                <span className="admin-table__thumb admin-table__thumb--placeholder">
                                  <IconImage aria-hidden="true" />
                                </span>
                              )}
                            </td>
                            <td>{entry.title || entry.name}</td>
                            <td>{entry.category || "—"}</td>
                            <td>
                              {Number.isFinite(entry.price) ? `R${entry.price}` : entry.price || "—"}
                            </td>
                            <td>{entry.description || "—"}</td>
                            <td className="admin-table__actions">
                              <button
                                className="icon-btn"
                                type="button"
                                onClick={() => handleEditProduct(entry)}
                                aria-label={`Edit ${entry.title || entry.name}`}
                              >
                                <IconEdit aria-hidden="true" />
                              </button>
                              <button
                                className="icon-btn icon-btn--danger"
                                type="button"
                                onClick={() => handleDeleteDocument("products", entry.id)}
                                aria-label={`Delete ${entry.title || entry.name}`}
                              >
                                <IconTrash aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="modal__meta admin-panel__notice">No products in Firestore yet.</p>
                  )}
                </div>
              </Reveal>

              <Reveal as="section" className="card admin-panel" delay={240}>
                <div className="admin-panel__header">
                  <h3 className="card__title">Workshops</h3>
                  <div className="admin-panel__header-actions">
                    {inventoryLoading && <span className="badge badge--muted">Syncing…</span>}
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={openWorkshopModal}
                      disabled={!inventoryEnabled}
                    >
                      <IconPlus className="btn__icon" aria-hidden="true" />
                      <span>Add Workshop</span>
                    </button>
                  </div>
                </div>
                {workshopSaving ? (
                  <div className="admin-save-indicator admin-save-indicator--working" role="status">
                    <span className="admin-spinner" aria-hidden="true"></span>
                    <span>{editingWorkshopId ? "Updating workshop…" : "Saving workshop…"}</span>
                  </div>
                ) : (
                  workshopStatus && (
                    <div className="admin-save-indicator" role="status">
                      <IconCheck className="btn__icon" aria-hidden="true" />
                      <span>{workshopStatus}</span>
                    </div>
                  )
                )}
                {workshopError && <p className="admin-panel__error">{workshopError}</p>}
                <div className="admin-table__wrapper">
                  {workshopsList.length > 0 ? (
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th scope="col">Image</th>
                          <th scope="col">Title</th>
                          <th scope="col">Scheduled</th>
                          <th scope="col">Price</th>
                          <th scope="col">Location</th>
                          <th scope="col">Description</th>
                          <th scope="col" className="admin-table__actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workshopsList.map((entry) => {
                          const scheduledDate =
                            typeof entry.scheduledFor === "string"
                              ? new Date(entry.scheduledFor)
                              : entry.scheduledFor?.toDate?.()
                                ? entry.scheduledFor.toDate()
                                : null;
                          const hasValidSchedule =
                            scheduledDate instanceof Date && !Number.isNaN(scheduledDate.getTime());
                          const dateLabel = hasValidSchedule
                            ? bookingDateFormatter.format(scheduledDate)
                            : "Date to be confirmed";
                          return (
                            <tr key={entry.id}>
                              <td>
                                {entry.image ? (
                                  <img
                                    src={entry.image}
                                    alt={`${entry.title || entry.name || "Workshop"} preview`}
                                    className="admin-table__thumb"
                                  />
                                ) : (
                                  <span className="admin-table__thumb admin-table__thumb--placeholder">
                                    <IconImage aria-hidden="true" />
                                  </span>
                                )}
                              </td>
                              <td>{entry.title || entry.name}</td>
                              <td>{dateLabel}</td>
                              <td>
                                {entry.price
                                  ? Number.isFinite(entry.price)
                                    ? `R${entry.price}`
                                    : entry.price
                                  : "—"}
                              </td>
                              <td>{entry.location || "—"}</td>
                              <td>{entry.description || "—"}</td>
                              <td className="admin-table__actions">
                                <button
                                  className="icon-btn"
                                  type="button"
                                  onClick={() => handleEditWorkshop(entry)}
                                  aria-label={`Edit ${entry.title || entry.name}`}
                                >
                                  <IconEdit aria-hidden="true" />
                                </button>
                                <button
                                  className="icon-btn icon-btn--danger"
                                  type="button"
                                  onClick={() => handleDeleteDocument("workshops", entry.id)}
                                  aria-label={`Delete ${entry.title || entry.name}`}
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
                    <p className="modal__meta admin-panel__notice">No workshops in Firestore yet.</p>
                  )}
                </div>
              </Reveal>

              <Reveal as="section" className="card admin-panel" delay={360}>
                <div className="admin-panel__header">
                  <h3 className="card__title">Workshop Bookings</h3>
                  {inventoryLoading && <span className="badge badge--muted">Syncing…</span>}
                </div>
                {bookings.length > 0 ? (
                  <div className="admin-table__wrapper">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th scope="col">Guest</th>
                          <th scope="col">Email</th>
                          <th scope="col">Frame</th>
                          <th scope="col">Notes</th>
                          <th scope="col">Received</th>
                          <th scope="col" className="admin-table__actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.map((entry) => {
                          const submittedAt =
                            entry.createdAt && typeof entry.createdAt.toDate === "function"
                              ? bookingDateFormatter.format(entry.createdAt.toDate())
                              : "Pending";
                          return (
                            <tr key={entry.id}>
                              <td>{entry.name || "—"}</td>
                              <td>
                                {entry.email ? (
                                  <a href={`mailto:${entry.email}`}>{entry.email}</a>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>{entry.frame || "—"}</td>
                              <td>{entry.notes || "—"}</td>
                              <td>{submittedAt}</td>
                              <td className="admin-table__actions">
                                <button
                                  className="icon-btn icon-btn--danger"
                                  type="button"
                                  onClick={() => handleDeleteDocument("bookings", entry.id)}
                                  aria-label={`Archive booking for ${entry.name || "guest"}`}
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
                  <p className="modal__meta admin-panel__notice">No workshop bookings recorded yet.</p>
                )}
              </Reveal>

              <Reveal as="section" className="card admin-panel" delay={480}>
                <div className="admin-panel__header">
                  <h3 className="card__title">Orders</h3>
                  {inventoryLoading && <span className="badge badge--muted">Syncing…</span>}
                </div>
                <div className="admin-table__wrapper">
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
                          const createdAtLabel = order.createdAt?.toDate
                            ? bookingDateFormatter.format(order.createdAt.toDate())
                            : "Pending";
                          const orderTotal = typeof order.totalPrice === "number" ? order.totalPrice : 0;
                          return (
                            <tr key={order.id}>
                              <td>
                                <strong>{order.id}</strong>
                                <p className="modal__meta">{createdAtLabel}</p>
                              </td>
                              <td>
                                <p>{order.customer?.fullName || "—"}</p>
                                <p className="modal__meta">{order.customer?.email || "—"}</p>
                                <p className="modal__meta">{order.customer?.phone || "—"}</p>
                                {order.customer?.address && <p className="modal__meta">{order.customer.address}</p>}
                              </td>
                              <td>
                                <ul className="order-items">
                                  {order.items?.map((item) => {
                                    const unitPrice = typeof item.price === "number" ? item.price : Number(item.price) || 0;
                                    const itemTotal = unitPrice * (item.quantity ?? 1);
                                    return (
                                      <li key={item.id}>
                                        <strong>{item.name}</strong> ×{item.quantity}
                                        <span className="modal__meta">R{itemTotal.toFixed(2)}</span>
                                        {item.metadata?.type === "workshop" && (
                                          <>
                                            <span className="modal__meta">
                                              {item.metadata.scheduledDateLabel || "Date TBC"} · {item.metadata.attendeeCount} attendee(s)
                                            </span>
                                            {item.metadata.framePreference && (
                                              <span className="modal__meta">
                                                Frame: {item.metadata.framePreference}
                                              </span>
                                            )}
                                            {typeof item.metadata.perAttendeePrice === "number" && (
                                              <span className="modal__meta">
                                                R{item.metadata.perAttendeePrice.toFixed(2)} per attendee
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </td>
                              <td>R{orderTotal.toFixed(2)}</td>
                              <td>{order.status || "pending"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="modal__meta admin-panel__notice">No orders have been placed yet.</p>
                  )}
                </div>
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
                <div className="modal__content">
                  <button className="modal__close" type="button" onClick={closeProductModal} aria-label="Close">
                    &times;
                  </button>
                  <h3 className="modal__title">{editingProductId ? "Edit Product" : "Add Product"}</h3>
                  <form className="admin-form" onSubmit={handleCreateProduct}>
                    <div className="admin-file-input">
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
                      <p className="admin-panel__note">Upload JPG or PNG (max 3MB). A preview appears below.</p>
                      {productImagePreview && (
                        <img src={productImagePreview} alt="Product preview" className="admin-preview" />
                      )}
                    </div>
                    <input
                      className="input"
                      placeholder="Product name"
                      value={productForm.name}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                    />
                    <input
                      className="input"
                      placeholder="Display title (optional)"
                      value={productForm.title}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, title: event.target.value }))}
                    />
                    <label className="sr-only" htmlFor="product-category-modal">
                      Category
                    </label>
                    <select
                      className="input"
                      id="product-category-modal"
                      value={productForm.category}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, category: event.target.value }))}
                    >
                      <option value="kit">DIY Kit</option>
                      <option value="cut-flower">Cut Flower Offering</option>
                      <option value="accessory">Accessory</option>
                    </select>
                    <input
                      className="input"
                      placeholder="Price (numbers or text)"
                      value={productForm.price}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, price: event.target.value }))}
                      required
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Description"
                      value={productForm.description}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                    <div className="admin-modal__actions">
                      <button className="btn btn--secondary" type="button" onClick={closeProductModal} disabled={productSaving}>
                        Cancel
                      </button>
                      <button className="btn btn--primary" type="submit" disabled={!inventoryEnabled || productSaving}>
                        {productSaving ? "Saving…" : editingProductId ? "Update Product" : "Save Product"}
                      </button>
                    </div>
                    {(productSaving || productStatus) && (
                      <div
                        className={`admin-save-indicator ${productSaving ? "admin-save-indicator--working" : ""}`}
                        role="status"
                      >
                        {productSaving ? (
                          <span className="admin-spinner" aria-hidden="true"></span>
                        ) : (
                          <IconCheck className="btn__icon" aria-hidden="true" />
                        )}
                        <span>{productSaving ? "Uploading product…" : productStatus}</span>
                      </div>
                    )}
                    {productError && <p className="admin-panel__error">{productError}</p>}
                  </form>
                </div>
              </div>

              <div
                className={`modal admin-modal ${isWorkshopModalOpen ? "is-active" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-hidden={isWorkshopModalOpen ? "false" : "true"}
                onClick={(event) => {
                  if (event.target === event.currentTarget) closeWorkshopModal();
                }}
              >
                <div className="modal__content">
                  <button className="modal__close" type="button" onClick={closeWorkshopModal} aria-label="Close">
                    &times;
                  </button>
                  <h3 className="modal__title">{editingWorkshopId ? "Edit Workshop" : "Add Workshop"}</h3>
                  <form className="admin-form" onSubmit={handleCreateWorkshop}>
                    <div className="admin-file-input">
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
                      <p className="admin-panel__note">Upload JPG or PNG (max 3MB). A preview appears below.</p>
                      {workshopImagePreview && (
                        <img src={workshopImagePreview} alt="Workshop preview" className="admin-preview" />
                      )}
                    </div>
                    <input
                      className="input"
                      placeholder="Workshop title"
                      value={workshopForm.title}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, title: event.target.value }))}
                      required
                    />
                    <input
                      className="input"
                      type="datetime-local"
                      placeholder="Scheduled for"
                      value={workshopForm.scheduledFor}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, scheduledFor: event.target.value }))}
                      required
                    />
                    <input
                      className="input"
                      placeholder="Price (numbers or text)"
                      value={workshopForm.price}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, price: event.target.value }))}
                    />
                    <input
                      className="input"
                      placeholder="Location"
                      value={workshopForm.location}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, location: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Description"
                      value={workshopForm.description}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="What to Expect (each line shows as text; use '-' for bullet points)"
                      value={workshopForm.whatToExpect}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, whatToExpect: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Booking & Pricing details"
                      value={workshopForm.bookingPricing}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, bookingPricing: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Good to Know information"
                      value={workshopForm.goodToKnow}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, goodToKnow: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Cancellations & Policies"
                      value={workshopForm.cancellations}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, cancellations: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Groups & Private Events"
                      value={workshopForm.groupsInfo}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, groupsInfo: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Caring for Your Art"
                      value={workshopForm.careInfo}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, careInfo: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Why People Love Our Workshops"
                      value={workshopForm.whyPeopleLove}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, whyPeopleLove: event.target.value }))}
                    />
                    <input
                      className="input"
                      placeholder="Call-to-action note (e.g. 'Book today to reserve your seat!')"
                      value={workshopForm.ctaNote}
                      onChange={(event) => setWorkshopForm((prev) => ({ ...prev, ctaNote: event.target.value }))}
                    />
                    <div className="admin-modal__actions">
                      <button className="btn btn--secondary" type="button" onClick={closeWorkshopModal} disabled={workshopSaving}>
                        Cancel
                      </button>
                      <button className="btn btn--primary" type="submit" disabled={!inventoryEnabled || workshopSaving}>
                        {workshopSaving ? "Saving…" : editingWorkshopId ? "Update Workshop" : "Save Workshop"}
                      </button>
                    </div>
                    {(workshopSaving || workshopStatus) && (
                      <div
                        className={`admin-save-indicator ${workshopSaving ? "admin-save-indicator--working" : ""}`}
                        role="status"
                      >
                        {workshopSaving ? (
                          <span className="admin-spinner" aria-hidden="true"></span>
                        ) : (
                          <IconCheck className="btn__icon" aria-hidden="true" />
                        )}
                        <span>{workshopSaving ? "Uploading workshop…" : workshopStatus}</span>
                      </div>
                    )}
                    {workshopError && <p className="admin-panel__error">{workshopError}</p>}
                  </form>
                </div>
              </div>
            </div>
          )}
          {inventoryError && isAdmin && <p className="empty-state">{inventoryError}</p>}
        </div>
      </section>
    </>
  );
}

export default AdminPage;
