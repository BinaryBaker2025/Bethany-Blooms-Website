import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Reveal from "../../components/Reveal.jsx";
import { AdminDataProvider } from "../../context/AdminDataContext.jsx";
import logo from "../../assets/BethanyBloomsLogo.png";

const EyeIcon = ({ open = false }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    {!open && (
      <path
        d="M4 20 20 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

const NAV_LINKS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/media", label: "Image Library" },
  { to: "/admin/workshops", label: "Workshops & Bookings", end: true },
  { to: "/admin/workshops/calendar", label: "Calendar" },
  { to: "/admin/cut-flowers/classes", label: "Cut Flower Classes" },
  { to: "/admin/cut-flowers/bookings", label: "Cut Flower Bookings" },
  { to: "/admin/events", label: "Events" },
  { to: "/admin/emails", label: "Email Preview" },
  { to: "/admin/pos", label: "POS", end: true },
  { to: "/admin/pos/cash-up", label: "POS Cash Up" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/orders", label: "Orders" },
  { to: "/admin/shipping", label: "Shipping & Courier" },
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
  const [showPassword, setShowPassword] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search, location.hash]);

  const handleSignIn = async (event) => {
    event.preventDefault();
    setAuthError(null);
    try {
      await signIn(loginForm.email, loginForm.password);
      setLoginForm({ email: "", password: "" });
      setShowPassword(false);
      navigate("/admin");
    } catch (error) {
      setAuthError(error.message);
    }
  };

  if (!user || !isAdmin) {
    return (
      <section className="section section--tight admin-auth">
        <div className="section__inner admin-auth__inner">
          <Reveal as="div" className="admin-auth__card">
            <div className="admin-auth__header">
              <img className="admin-auth__logo" src={logo} alt="Bethany Blooms logo" loading="lazy" decoding="async"/>
              <h2>Admin Sign In</h2>
              <p>Secure access to orders, workshops, and the full product catalog.</p>
            </div>
            {initError && (
              <p className="admin-auth__notice" role="alert">
                Firebase credentials missing. Add them to <code>.env</code> to activate admin login.
              </p>
            )}
            <form className="admin-auth__form" onSubmit={handleSignIn}>
              <label className="admin-auth__field" htmlFor="admin-email">
                <span>Admin email</span>
                <input
                  className="input"
                  id="admin-email"
                  type="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  placeholder="name@bethanyblooms.co.za"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="admin-auth__field" htmlFor="admin-password">
                <span>Password</span>
                <div className="admin-auth__password-wrap">
                  <input
                    className="input"
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                    placeholder="Password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    className="admin-auth__password-toggle"
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </label>
              <button
                className="btn btn--primary admin-auth__submit"
                type="submit"
                disabled={loading || roleLoading}
              >
                {loading ? "Checking..." : "Sign In"}
              </button>
              {authError && (
                <p className="admin-panel__error" role="alert">
                  {authError}
                </p>
              )}
            </form>
            <p className="admin-auth__helper">
              Need access? Ask the site owner to enable your admin account.
            </p>
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
              <NavLink key={to} to={to} end={end} onClick={() => setDrawerOpen(false)}>
                {label}
              </NavLink>
            ))}
          </nav>
          <button className="btn btn--secondary admin-sidebar__signout" type="button" onClick={signOut}>
            Sign Out
          </button>
        </aside>
        <button
          className={`admin-sidebar__overlay ${drawerOpen ? "is-open" : ""}`}
          type="button"
          aria-label="Close menu"
          aria-hidden={!drawerOpen}
          onClick={() => setDrawerOpen(false)}
          tabIndex={drawerOpen ? 0 : -1}
        />

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
