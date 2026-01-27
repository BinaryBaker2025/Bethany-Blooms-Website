import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Reveal from "../../components/Reveal.jsx";
import { AdminDataProvider } from "../../context/AdminDataContext.jsx";

const NAV_LINKS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/media", label: "Image Library" },
  { to: "/admin/workshops", label: "Workshops & Bookings" },
  { to: "/admin/workshops/calendar", label: "Calendar" },
  { to: "/admin/cut-flowers/classes", label: "Cut Flower Classes" },
  { to: "/admin/cut-flowers/bookings", label: "Cut Flower Bookings" },
  { to: "/admin/events", label: "Events" },
  { to: "/admin/pos", label: "POS" },
  { to: "/admin/pos/cash-up", label: "POS Cash Up" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/orders", label: "Orders" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/profile", label: "Profile" },
];

function AdminLayout() {
  const {
    user,
    isAdmin,
    role,
    loading,
    initError,
    signIn,
    signOut,
    roleLoading,
  } = useAuth();
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleSignIn = async (event) => {
    event.preventDefault();
    setAuthError(null);
    try {
      await signIn(loginForm.email, loginForm.password);
      setLoginForm({ email: "", password: "" });
      navigate("/admin");
    } catch (error) {
      setAuthError(error.message);
    }
  };

  if (!user || !isAdmin) {
    return (
      <section className="section section--tight">
        <div className="section__inner">
          <Reveal as="div">
            <h2>Admin Sign In</h2>
            {initError && (
              <p className="empty-state">
                Firebase credentials missing. Add them to <code>.env</code> to
                activate admin login.
              </p>
            )}
            <form className="contact-form contact-form--stack" onSubmit={handleSignIn}>
              <label className="sr-only" htmlFor="admin-email">
                Email
              </label>
              <input
                className="input"
                id="admin-email"
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                }
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
                onChange={(event) =>
                  setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="Password"
                required
              />
              <button className="btn btn--primary" type="submit" disabled={loading || roleLoading}>
                {loading ? "Checking..." : "Sign In"}
              </button>
              {authError && <p className="admin-panel__error">{authError}</p>}
            </form>
          </Reveal>
        </div>
      </section>
    );
  }

  return (
    <AdminDataProvider>
      <div className="admin-shell">
        <aside className={`admin-sidebar ${drawerOpen ? "is-open" : ""}`}>
          <div className="admin-sidebar__header">
            <span className="badge badge--muted">{role?.toUpperCase()}</span>
            <button className="menu-toggle admin-sidebar__close" type="button" onClick={() => setDrawerOpen(false)}>
              <span className="sr-only">Close menu</span>
              <span className="menu-toggle__icon" aria-hidden="true"></span>
            </button>
          </div>
          <nav className="admin-sidebar__nav">
            {NAV_LINKS.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}>
                {label}
              </NavLink>
            ))}
          </nav>
          <button className="btn btn--secondary admin-sidebar__signout" type="button" onClick={signOut}>
            Sign Out
          </button>
        </aside>

        <div className="admin-shell__main">
          <header className="admin-shell__header">
            <button
              className="menu-toggle admin-shell__menu"
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
            >
              <span className="sr-only">Toggle admin menu</span>
              <span className="menu-toggle__icon" aria-hidden="true"></span>
            </button>
            <div>
              <p className="admin-shell__title">Admin Portal</p>
              <p className="admin-shell__subtitle">Signed in as {user.email}</p>
            </div>
            <button className="btn btn--secondary" type="button" onClick={signOut}>
              Sign Out
            </button>
          </header>
          <main className="admin-shell__content">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminDataProvider>
  );
}

export default AdminLayout;
