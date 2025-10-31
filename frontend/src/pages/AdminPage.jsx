import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import Hero from "../components/Hero.jsx";
import Reveal from "../components/Reveal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getFirebaseDb } from "../lib/firebase.js";
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
};

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
  const [inventoryError, setInventoryError] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [productForm, setProductForm] = useState(INITIAL_PRODUCT_FORM);
  const [workshopForm, setWorkshopForm] = useState(INITIAL_WORKSHOP_FORM);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState(null);
  const [seedStatus, setSeedStatus] = useState(null);
  const [productStatus, setProductStatus] = useState(null);
  const [workshopStatus, setWorkshopStatus] = useState(null);

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

  const db = useMemo(() => {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }, []);

  const inventoryEnabled = Boolean(db && user && isAdmin);

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
      setInventoryLoading(false);
      return undefined;
    }

    setInventoryLoading(true);
    setInventoryError(null);

    const productsQuery = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const workshopsQuery = query(collection(db, "workshops"), orderBy("scheduledFor", "asc"));
    const bookingsQuery = query(collection(db, "bookings"), orderBy("createdAt", "desc"));

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

    return () => {
      unsubscribeProducts();
      unsubscribeWorkshops();
      unsubscribeBookings();
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
      setInventoryError("You do not have permission to manage products.");
      return;
    }
    if (!db) {
      setInventoryError("Firebase is not configured. Add credentials to .env.");
      return;
    }

    setInventoryError(null);
    setProductStatus(null);

    const name = productForm.name.trim();
    const title = productForm.title.trim() || name;
    const priceNumber = Number(productForm.price);
    const category = productForm.category.trim() || "kit";

    if (!name) {
      setInventoryError("Product name is required.");
      return;
    }

    const hasNumericPrice = Number.isFinite(priceNumber);
    const priceInput = productForm.price.trim();
    if (!hasNumericPrice && !priceInput) {
      setInventoryError("Please provide a price or price range.");
      return;
    }

    try {
      setStatusMessage("Saving product…");
      setProductStatus("Saving product…");
      await addDoc(collection(db, "products"), {
        name,
        title,
        description: productForm.description.trim(),
        price: hasNumericPrice ? priceNumber : priceInput,
        image: productForm.image.trim(),
        category,
        createdAt: serverTimestamp(),
      });
      setProductForm(INITIAL_PRODUCT_FORM);
      setStatusMessage("Product saved successfully.");
      setProductStatus("Product saved successfully.");
    } catch (error) {
      setInventoryError(error.message);
      setProductStatus(null);
    }
  };

  const handleCreateWorkshop = async (event) => {
    event.preventDefault();
    if (!isAdmin) {
      setInventoryError("You do not have permission to manage workshops.");
      return;
    }
    if (!db) {
      setInventoryError("Firebase is not configured. Add credentials to .env.");
      return;
    }

    setInventoryError(null);
    setWorkshopStatus(null);

    const title = workshopForm.title.trim();
    if (!title) {
      setInventoryError("Workshop title is required.");
      return;
    }

    const scheduleInput = workshopForm.scheduledFor.trim();
    if (!scheduleInput) {
      setInventoryError("Please provide a workshop date and time.");
      return;
    }

    const parsedDate = new Date(scheduleInput);
    if (Number.isNaN(parsedDate.getTime())) {
      setInventoryError("Workshop date must be a valid date/time.");
      return;
    }

    const priceNumber = Number(workshopForm.price);
    const priceValue = Number.isFinite(priceNumber) ? priceNumber : workshopForm.price.trim();

    try {
      setStatusMessage("Saving workshop…");
      setWorkshopStatus("Saving workshop…");
      await addDoc(collection(db, "workshops"), {
        title,
        description: workshopForm.description.trim(),
        scheduledFor: parsedDate.toISOString(),
        price: priceValue,
        location: workshopForm.location.trim(),
        createdAt: serverTimestamp(),
      });
      setWorkshopForm(INITIAL_WORKSHOP_FORM);
      setStatusMessage("Workshop saved.");
      setWorkshopStatus("Workshop saved.");
    } catch (error) {
      setInventoryError(error.message);
      setWorkshopStatus(null);
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
                  {seedLoading ? "Seeding…" : "Load Sample Products & Workshops"}
                </button>
                {seedStatus && !seedError && <p className="modal__meta admin-panel__status">{seedStatus}</p>}
                {seedError && <p className="modal__meta admin-panel__error">{seedError}</p>}
              </Reveal>

              <Reveal as="section" className="card admin-panel" delay={120}>
                <div className="admin-panel__header">
                  <h3 className="card__title">Products</h3>
                  {inventoryLoading && <span className="badge badge--muted">Syncing…</span>}
                </div>
                {!inventoryEnabled && (
                  <p className="modal__meta admin-panel__notice">
                    Add Firebase credentials and refresh to enable inventory management.
                  </p>
                )}
                <div className="admin-panel__content admin-panel__content--split">
                  <form className="admin-form" onSubmit={handleCreateProduct}>
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
                    <label className="sr-only" htmlFor="product-category">
                      Category
                    </label>
                    <select
                      className="input"
                      id="product-category"
                      value={productForm.category}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, category: event.target.value }))}
                    >
                      <option value="kit">DIY Kit</option>
                      <option value="cut-flower">Cut Flower Offering</option>
                      <option value="accessory">Accessory</option>
                    </select>
                    <input
                      className="input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="1"
                      placeholder="Price (numbers only)"
                      value={productForm.price}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, price: event.target.value }))}
                      required
                    />
                    <input
                      className="input"
                      placeholder="Image URL (optional)"
                      value={productForm.image}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, image: event.target.value }))}
                    />
                    <textarea
                      className="input textarea"
                      placeholder="Description"
                      value={productForm.description}
                      onChange={(event) => setProductForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                    <button className="btn btn--primary" type="submit" disabled={!inventoryEnabled}>
                      Add Product
                    </button>
                  </form>
                  <div className="admin-panel__list">
                    {productStatus && <p className="modal__meta admin-panel__status">{productStatus}</p>}
                    {products.length > 0 ? (
                      <ul className="modal__list">
                        {products.map((entry) => (
                          <li key={entry.id}>
                            <div>
                              <strong>{entry.title || entry.name}</strong>
                              {Number.isFinite(entry.price) && (
                                <span className="modal__meta"> — R{entry.price}</span>
                              )}
                              {entry.price && !Number.isFinite(entry.price) && (
                                <span className="modal__meta"> — {entry.price}</span>
                              )}
                              {entry.category && <p className="modal__meta">Category: {entry.category}</p>}
                              {entry.description && <p className="modal__meta">{entry.description}</p>}
                            </div>
                            <button
                              className="remove-btn"
                              type="button"
                              onClick={() => handleDeleteDocument("products", entry.id)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="modal__meta admin-panel__notice">No products in Firestore yet.</p>
                    )}
                  </div>
                </div>
              </Reveal>

              <Reveal as="section" className="card admin-panel" delay={240}>
                <div className="admin-panel__header">
                  <h3 className="card__title">Workshops</h3>
                  {inventoryLoading && <span className="badge badge--muted">Syncing…</span>}
                </div>
                <div className="admin-panel__content admin-panel__content--split">
                  <form className="admin-form" onSubmit={handleCreateWorkshop}>
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
                    <button className="btn btn--primary" type="submit" disabled={!inventoryEnabled}>
                      Add Workshop
                    </button>
                  </form>
                  <div className="admin-panel__list">
                    {workshopStatus && <p className="modal__meta admin-panel__status">{workshopStatus}</p>}
                    {workshopsList.length > 0 ? (
                      <ul className="modal__list">
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
                            <li key={entry.id}>
                              <div>
                                <strong>{entry.title || entry.name}</strong>
                                {entry.price && (
                                  <span className="modal__meta">
                                    {" "}
                                    — {Number.isFinite(entry.price) ? `R${entry.price}` : entry.price}
                                  </span>
                                )}
                                {entry.location && <p className="modal__meta">Location: {entry.location}</p>}
                                <p className="modal__meta">Scheduled: {dateLabel}</p>
                                {entry.description && <p className="modal__meta">{entry.description}</p>}
                              </div>
                              <button
                                className="remove-btn"
                                type="button"
                                onClick={() => handleDeleteDocument("workshops", entry.id)}
                              >
                                Remove
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="modal__meta admin-panel__notice">No workshops in Firestore yet.</p>
                    )}
                  </div>
                </div>
              </Reveal>

              <Reveal as="section" className="card admin-panel" delay={360}>
                <div className="admin-panel__header">
                  <h3 className="card__title">Workshop Bookings</h3>
                  {inventoryLoading && <span className="badge badge--muted">Syncing…</span>}
                </div>
                {bookings.length > 0 ? (
                  <ul className="modal__list">
                    {bookings.map((entry) => {
                      const submittedAt =
                        entry.createdAt && typeof entry.createdAt.toDate === "function"
                          ? bookingDateFormatter.format(entry.createdAt.toDate())
                          : "Pending";
                      return (
                        <li key={entry.id}>
                          <div>
                            <strong>{entry.name}</strong>
                            {entry.email && (
                              <p className="modal__meta">
                                <a href={`mailto:${entry.email}`}>{entry.email}</a>
                              </p>
                            )}
                            {entry.frame && <p className="modal__meta">Frame preference: {entry.frame}</p>}
                            {entry.notes && <p className="modal__meta">{entry.notes}</p>}
                            <p className="modal__meta">Received: {submittedAt}</p>
                          </div>
                          <button
                            className="remove-btn"
                            type="button"
                            onClick={() => handleDeleteDocument("bookings", entry.id)}
                          >
                            Archive
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="modal__meta admin-panel__notice">No workshop bookings recorded yet.</p>
                )}
              </Reveal>
            </div>
          )}
          {inventoryError && isAdmin && <p className="empty-state">{inventoryError}</p>}
        </div>
      </section>
    </>
  );
}

export default AdminPage;
