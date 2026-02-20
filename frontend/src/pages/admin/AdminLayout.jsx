import { useEffect, useMemo, useState } from "react";
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

const NAV_SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    defaultOpen: false,
    items: [
      { type: "link", id: "dashboard", to: "/admin", label: "Dashboard", end: true },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    defaultOpen: true,
    items: [
      { type: "link", id: "orders", to: "/admin/orders", label: "Orders" },
      { type: "link", id: "products", to: "/admin/products", label: "Products" },
      {
        type: "link",
        id: "subscriptions",
        to: "/admin/subscriptions",
        label: "Subscription Plans",
      },
      {
        type: "link",
        id: "subscription-ops",
        to: "/admin/subscription-ops",
        label: "Subscription Ops",
      },
      { type: "link", id: "shipping", to: "/admin/shipping", label: "Shipping & Courier" },
    ],
  },
  {
    id: "content",
    label: "Content",
    defaultOpen: false,
    items: [
      { type: "link", id: "media", to: "/admin/media", label: "Image Library" },
      {
        type: "group",
        id: "workshops",
        label: "Workshops",
        to: "/admin/workshops",
        end: true,
        children: [
          { to: "/admin/workshops", label: "Workshops & Bookings", end: true },
        ],
      },
      {
        type: "group",
        id: "cut-flowers",
        label: "Cut Flowers",
        children: [
          { to: "/admin/cut-flowers/classes", label: "Classes" },
          { to: "/admin/cut-flowers/bookings", label: "Bookings" },
        ],
      },
      { type: "link", id: "events", to: "/admin/events", label: "Events" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    defaultOpen: true,
    items: [
      {
        type: "group",
        id: "pos",
        label: "POS",
        to: "/admin/pos",
        end: true,
        children: [
          { to: "/admin/pos", label: "POS", end: true },
          { to: "/admin/pos/cash-up", label: "Cash Up" },
        ],
      },
      { type: "link", id: "calendar", to: "/admin/calendar", label: "Calendar" },
      { type: "link", id: "reports", to: "/admin/reports", label: "Reports" },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    defaultOpen: false,
    items: [
      { type: "link", id: "emails", to: "/admin/emails", label: "Email Preview" },
      { type: "link", id: "invoices", to: "/admin/invoices", label: "Invoice Preview" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    defaultOpen: false,
    items: [
      { type: "link", id: "users", to: "/admin/users", label: "Users" },
      { type: "link", id: "profile", to: "/admin/profile", label: "Profile" },
    ],
  },
];

const createInitialExpandedSections = () =>
  NAV_SECTIONS.reduce((accumulator, section) => {
    accumulator[section.id] = Boolean(section.defaultOpen);
    return accumulator;
  }, {});

const toGroupStateKey = (sectionId = "", itemId = "") => `${sectionId}:${itemId}`;

const routeMatchesPath = (pathname = "", to = "", end = false) => {
  if (!to) return false;
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
};

const navItemMatchesPath = (item, pathname = "") => {
  if (!item || !pathname) return false;
  if (item.type === "link") {
    return routeMatchesPath(pathname, item.to, item.end);
  }
  if (item.type === "group") {
    if (routeMatchesPath(pathname, item.to, item.end)) return true;
    return (item.children || []).some((child) =>
      routeMatchesPath(pathname, child.to, child.end),
    );
  }
  return false;
};

const formatAdminAuthError = (error) => {
  const code = (error?.code || "").toString().trim().toLowerCase();
  if (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") {
    return "Incorrect email/password, or this account does not exist in Firebase Authentication.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (code === "auth/user-disabled") {
    return "This account has been disabled.";
  }
  return error?.message || "Unable to sign in.";
};

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
  const [expandedSections, setExpandedSections] = useState(() => createInitialExpandedSections());
  const [expandedGroups, setExpandedGroups] = useState({});
  const location = useLocation();
  const navigate = useNavigate();

  const pathName = location.pathname || "";

  const currentActiveMap = useMemo(() => {
    const sectionMatchMap = {};
    const groupMatchMap = {};
    NAV_SECTIONS.forEach((section) => {
      const sectionHasMatch = section.items.some((item) => {
        if (item.type === "group") {
          const key = toGroupStateKey(section.id, item.id);
          const hasMatch = navItemMatchesPath(item, pathName);
          groupMatchMap[key] = hasMatch;
          return hasMatch;
        }
        return navItemMatchesPath(item, pathName);
      });
      sectionMatchMap[section.id] = sectionHasMatch;
    });
    return {
      sections: sectionMatchMap,
      groups: groupMatchMap,
    };
  }, [pathName]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const sectionsToOpen = Object.entries(currentActiveMap.sections).filter(([, isActive]) => isActive);
    if (sectionsToOpen.length > 0) {
      setExpandedSections((previous) => {
        const next = { ...previous };
        let changed = false;
        sectionsToOpen.forEach(([sectionId]) => {
          if (!next[sectionId]) {
            next[sectionId] = true;
            changed = true;
          }
        });
        return changed ? next : previous;
      });
    }

    const groupsToOpen = Object.entries(currentActiveMap.groups).filter(([, isActive]) => isActive);
    if (groupsToOpen.length > 0) {
      setExpandedGroups((previous) => {
        const next = { ...previous };
        let changed = false;
        groupsToOpen.forEach(([groupKey]) => {
          if (!next[groupKey]) {
            next[groupKey] = true;
            changed = true;
          }
        });
        return changed ? next : previous;
      });
    }
  }, [currentActiveMap]);

  const handleSignIn = async (event) => {
    event.preventDefault();
    setAuthError(null);
    try {
      await signIn(loginForm.email, loginForm.password);
      setLoginForm({ email: "", password: "" });
      setShowPassword(false);
      navigate("/admin");
    } catch (error) {
      setAuthError(formatAdminAuthError(error));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate("/", { replace: true });
    }
  };

  const handleNavClick = () => setDrawerOpen(false);

  const handleToggleSection = (sectionId) => {
    setExpandedSections((previous) => ({
      ...previous,
      [sectionId]: !previous[sectionId],
    }));
  };

  const handleToggleGroup = (sectionId, itemId) => {
    const key = toGroupStateKey(sectionId, itemId);
    setExpandedGroups((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
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
          <nav className="admin-sidebar__nav" aria-label="Admin sections">
            {NAV_SECTIONS.map((section) => {
              const sectionExpanded = Boolean(expandedSections[section.id]);
              const sectionPanelId = `admin-sidebar-section-${section.id}`;
              return (
                <section className="admin-sidebar__section" key={section.id}>
                  <button
                    className={`admin-sidebar__section-toggle ${sectionExpanded ? "is-open" : ""}`}
                    type="button"
                    aria-expanded={sectionExpanded}
                    aria-controls={sectionPanelId}
                    onClick={() => handleToggleSection(section.id)}
                  >
                    <span>{section.label}</span>
                    <span className="admin-sidebar__chevron" aria-hidden="true">
                      &#9662;
                    </span>
                  </button>
                  <div
                    className={`admin-sidebar__section-body ${sectionExpanded ? "is-open" : ""}`}
                    id={sectionPanelId}
                  >
                    {section.items.map((item) => {
                      if (item.type === "link") {
                        return (
                          <NavLink
                            key={item.id}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                              `admin-sidebar__link ${isActive ? "active" : ""}`
                            }
                            onClick={handleNavClick}
                          >
                            {item.label}
                          </NavLink>
                        );
                      }

                      const groupKey = toGroupStateKey(section.id, item.id);
                      const groupExpanded = Boolean(expandedGroups[groupKey]);
                      const hasChildMatch = (item.children || []).some((child) =>
                        routeMatchesPath(pathName, child.to, child.end),
                      );
                      const parentOrChildActive =
                        routeMatchesPath(pathName, item.to, item.end) || hasChildMatch;
                      const groupPanelId = `admin-sidebar-group-${section.id}-${item.id}`;

                      return (
                        <div className="admin-sidebar__group" key={item.id}>
                          <div
                            className={`admin-sidebar__group-head ${parentOrChildActive ? "is-active" : ""}`}
                          >
                            {item.to ? (
                              <NavLink
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                  `admin-sidebar__group-link ${isActive || hasChildMatch ? "active" : ""}`
                                }
                                onClick={handleNavClick}
                              >
                                {item.label}
                              </NavLink>
                            ) : (
                              <span className={`admin-sidebar__group-label ${hasChildMatch ? "is-active" : ""}`}>
                                {item.label}
                              </span>
                            )}
                            <button
                              className={`admin-sidebar__group-toggle ${groupExpanded ? "is-open" : ""}`}
                              type="button"
                              aria-label={`Toggle ${item.label}`}
                              aria-expanded={groupExpanded}
                              aria-controls={groupPanelId}
                              onClick={() => handleToggleGroup(section.id, item.id)}
                            >
                              <span className="admin-sidebar__chevron" aria-hidden="true">
                                &#9662;
                              </span>
                            </button>
                          </div>
                          <div
                            className={`admin-sidebar__group-children ${groupExpanded ? "is-open" : ""}`}
                            id={groupPanelId}
                          >
                            {(item.children || []).map((child) => (
                              <NavLink
                                key={`${item.id}-${child.to}`}
                                to={child.to}
                                end={child.end}
                                className={({ isActive }) =>
                                  `admin-sidebar__sublink ${isActive ? "active" : ""}`
                                }
                                onClick={handleNavClick}
                              >
                                {child.label}
                              </NavLink>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </nav>
          <button className="btn btn--secondary admin-sidebar__signout" type="button" onClick={handleSignOut}>
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
            <button className="btn btn--secondary" type="button" onClick={handleSignOut}>
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

