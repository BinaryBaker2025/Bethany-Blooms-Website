import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Reveal from "../../components/Reveal.jsx";
import { AdminDataProvider } from "../../context/AdminDataContext.jsx";
import logo from "../../assets/BethanyBloomsLogo.png";

// ── Eye icon ──────────────────────────────────────────────────────────────────
const EyeIcon = ({ open = false }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none">
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7"/>
    {!open && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>
);

// ── SVG icon set ──────────────────────────────────────────────────────────────
function SvgIcon({ d, viewBox = "0 0 24 24", size = 18, className }) {
  return (
    <svg aria-hidden="true" viewBox={viewBox} width={size} height={size} fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      {d}
    </svg>
  );
}

const ICONS = {
  dashboard:       <><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z"/><path d="M9 21V12h6v9"/></>,
  orders:          <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 7h8M8 12h8M8 17h5"/></>,
  products:        <><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>,
  subscriptions:   <><path d="M17 2.1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
  subscriptionOps: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  shipping:        <><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  gift:            <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
  media:           <><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9l5-5 5 5 3-3 5 5"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/></>,
  workshops:       <><path d="M2 20h20"/><path d="M6 20V10l6-6 6 6v10"/><path d="M10 20v-5h4v5"/></>,
  cutFlowers:      <><path d="M12 22V12"/><path d="M12 12c0-5-4-9-9-9 0 5 2 8 5 9h4z"/><path d="M12 12c0-5 4-9 9-9 0 5-2 8-5 9h-4z"/><path d="M12 12c-3-4-3-9 0-12"/></>,
  events:          <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/></>,
  pos:             <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h.01M12 15h.01M17 15h.01M7 11h.01M12 11h.01M17 11h.01"/><path d="M7 7h10"/></>,
  cashUp:          <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  calendar:        <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  reports:         <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  emails:          <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></>,
  invoices:        <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  users:           <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  profile:         <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  signout:         <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  chevronDown:     <path d="m6 9 6 6 6-6"/>,
  menu:            <path d="M4 6h16M4 12h16M4 18h16"/>,
  close:           <path d="M18 6 6 18M6 6l12 12"/>,
};

// ── Nav structure — sections are always open, only child-groups are togglable ──
const NAV_SECTIONS = [
  {
    id: "overview",
    label: null, // no label for first section
    items: [
      { type: "link", id: "dashboard", to: "/admin", label: "Dashboard", end: true, icon: "dashboard" },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      { type: "link", id: "orders", to: "/admin/orders", label: "Orders", icon: "orders" },
      { type: "link", id: "products", to: "/admin/products", label: "Products", icon: "products" },
      { type: "link", id: "subscriptions", to: "/admin/subscriptions", label: "Subscription Plans", icon: "subscriptions" },
      { type: "link", id: "subscription-ops", to: "/admin/subscription-ops", label: "Subscription Ops", icon: "subscriptionOps" },
      { type: "link", id: "shipping", to: "/admin/shipping", label: "Shipping & Courier", icon: "shipping" },
      { type: "link", id: "commerce-gift-cards", to: "/admin/commerce/gift-cards/generate", label: "Gift Cards", icon: "gift" },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { type: "link", id: "media", to: "/admin/media", label: "Image Library", icon: "media" },
      {
        type: "group", id: "workshops", label: "Workshops", icon: "workshops",
        to: "/admin/workshops", end: true,
        children: [{ to: "/admin/workshops", label: "Workshops & Bookings", end: true }],
      },
      {
        type: "group", id: "cut-flowers", label: "Cut Flowers", icon: "cutFlowers",
        children: [
          { to: "/admin/cut-flowers/classes", label: "Classes" },
          { to: "/admin/cut-flowers/bookings", label: "Bookings" },
        ],
      },
      { type: "link", id: "events", to: "/admin/events", label: "Events", icon: "events" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        type: "group", id: "pos", label: "Point of Sale", icon: "pos",
        to: "/admin/pos", end: true,
        children: [
          { to: "/admin/pos", label: "POS Terminal", end: true },
          { to: "/admin/pos/cash-up", label: "Cash Up" },
        ],
      },
      { type: "link", id: "calendar", to: "/admin/calendar", label: "Calendar", icon: "calendar" },
      { type: "link", id: "reports", to: "/admin/reports", label: "Reports", icon: "reports" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { type: "link", id: "emails", to: "/admin/emails", label: "Email Preview", icon: "emails" },
      { type: "link", id: "invoices", to: "/admin/invoices", label: "Invoice Preview", icon: "invoices" },
      { type: "link", id: "users", to: "/admin/users", label: "Users", icon: "users" },
      { type: "link", id: "profile", to: "/admin/profile", label: "Profile", icon: "profile" },
    ],
  },
];

// ── Page title map ────────────────────────────────────────────────────────────
const PAGE_TITLE_MAP = [
  ["/admin/commerce/gift-cards", "Gift Cards"],
  ["/admin/subscription-ops", "Subscription Operations"],
  ["/admin/subscriptions", "Subscription Plans"],
  ["/admin/cut-flowers/classes", "Cut Flower Classes"],
  ["/admin/cut-flowers/bookings", "Cut Flower Bookings"],
  ["/admin/cut-flowers", "Cut Flowers"],
  ["/admin/pos/cash-up", "Cash Up"],
  ["/admin/orders", "Orders"],
  ["/admin/products", "Products"],
  ["/admin/shipping", "Shipping & Courier"],
  ["/admin/media", "Image Library"],
  ["/admin/workshops", "Workshops"],
  ["/admin/events", "Events"],
  ["/admin/pos", "Point of Sale"],
  ["/admin/calendar", "Calendar"],
  ["/admin/reports", "Reports"],
  ["/admin/emails", "Email Preview"],
  ["/admin/invoices", "Invoice Preview"],
  ["/admin/users", "Users"],
  ["/admin/profile", "Profile"],
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const toGroupStateKey = (sectionId, itemId) => `${sectionId}:${itemId}`;

const routeMatchesPath = (pathname = "", to = "", end = false) => {
  if (!to) return false;
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
};

const formatAdminAuthError = (error) => {
  const code = (error?.code || "").toString().trim().toLowerCase();
  if (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials")
    return "Incorrect email or password.";
  if (code === "auth/too-many-requests")
    return "Too many attempts. Please wait and try again.";
  if (code === "auth/user-disabled")
    return "This account has been disabled.";
  return error?.message || "Unable to sign in.";
};

// ── Component ─────────────────────────────────────────────────────────────────
function AdminLayout() {
  const { user, isAdmin, role, loading, initError, signIn, signOut, roleLoading } = useAuth();
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const location = useLocation();
  const navigate = useNavigate();

  const pathName = location.pathname || "";

  const pageTitle = useMemo(() => {
    if (pathName === "/admin") return "Dashboard";
    for (const [prefix, title] of PAGE_TITLE_MAP) {
      if (pathName.startsWith(prefix)) return title;
    }
    return "Admin";
  }, [pathName]);

  const userInitials = useMemo(() => {
    if (!user?.email) return "BB";
    const name = user.displayName;
    if (name) return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    return user.email.slice(0, 2).toUpperCase();
  }, [user?.email, user?.displayName]);

  // Auto-open groups when their route is active
  useEffect(() => {
    const groupsToOpen = {};
    NAV_SECTIONS.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type !== "group") return;
        const key = toGroupStateKey(section.id, item.id);
        const hasMatch =
          routeMatchesPath(pathName, item.to, item.end) ||
          (item.children || []).some((c) => routeMatchesPath(pathName, c.to, c.end));
        if (hasMatch) groupsToOpen[key] = true;
      });
    });
    if (Object.keys(groupsToOpen).length > 0) {
      setExpandedGroups((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(groupsToOpen).forEach((k) => {
          if (!next[k]) { next[k] = true; changed = true; }
        });
        return changed ? next : prev;
      });
    }
  }, [pathName]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthError(null);
    try {
      await signIn(loginForm.email, loginForm.password);
      setLoginForm({ email: "", password: "" });
      setShowPassword(false);
      navigate("/admin");
    } catch (err) {
      setAuthError(formatAdminAuthError(err));
    }
  };

  const handleSignOut = async () => {
    try { await signOut(); } finally { navigate("/", { replace: true }); }
  };

  const handleNavClick = () => setDrawerOpen(false);
  const toggleGroup = (sectionId, itemId) => {
    const key = toGroupStateKey(sectionId, itemId);
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Login gate ──────────────────────────────────────────────────────────────
  if (!user || !isAdmin) {
    return (
      <section className="section section--tight admin-auth">
        <div className="section__inner admin-auth__inner">
          <Reveal as="div" className="admin-auth__card">
            <div className="admin-auth__header">
              <img className="admin-auth__logo" src={logo} alt="Bethany Blooms logo" loading="lazy" decoding="async"/>
              <h2>Admin sign in</h2>
              <p>Sign in to manage orders, products, and customer records.</p>
            </div>
            {initError && (
              <p className="admin-auth__notice" role="alert">
                Firebase credentials missing. Add them to <code>.env</code> to activate admin login.
              </p>
            )}
            <form className="admin-auth__form" onSubmit={handleSignIn}>
              <label className="admin-auth__field" htmlFor="admin-email">
                <span>Email</span>
                <input className="input" id="admin-email" type="email" value={loginForm.email}
                  onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="name@bethanyblooms.co.za" autoComplete="email" required/>
              </label>
              <label className="admin-auth__field" htmlFor="admin-password">
                <span>Password</span>
                <div className="admin-auth__password-wrap">
                  <input className="input" id="admin-password" type={showPassword ? "text" : "password"}
                    value={loginForm.password}
                    onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Password" autoComplete="current-password" required/>
                  <button className="admin-auth__password-toggle" type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? "Hide password" : "Show password"}>
                    <EyeIcon open={showPassword}/>
                  </button>
                </div>
              </label>
              <button className="btn btn--primary admin-auth__submit" type="submit" disabled={loading || roleLoading}>
                {loading ? "Checking…" : "Sign In"}
              </button>
              {authError && <p className="admin-panel__error" role="alert">{authError}</p>}
            </form>
            <p className="admin-auth__helper">Need access? Ask the site owner to enable your account.</p>
          </Reveal>
        </div>
      </section>
    );
  }

  // ── Admin shell ─────────────────────────────────────────────────────────────
  return (
    <AdminDataProvider>
      <div className="adm-shell">

        {/* ── Sidebar ────────────────────────────────────────────────────────── */}
        <aside className={`adm-sidebar ${drawerOpen ? "is-open" : ""}`} aria-label="Admin navigation">

          {/* Brand header */}
          <div className="adm-sidebar__brand">
            <img src={logo} alt="" className="adm-sidebar__brand-logo" aria-hidden="true"/>
            <div className="adm-sidebar__brand-info">
              <span className="adm-sidebar__brand-name">Bethany Blooms</span>
              <span className="adm-sidebar__brand-role">{role ?? "Admin"}</span>
            </div>
            <button className="adm-sidebar__close" type="button" aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}>
              <SvgIcon d={ICONS.close} size={16}/>
            </button>
          </div>

          {/* Navigation — sections always open; only child-groups toggle */}
          <nav className="adm-nav" aria-label="Main navigation">
            {NAV_SECTIONS.map((section) => (
              <div className="adm-nav__section" key={section.id}>
                {section.label && (
                  <span className="adm-nav__section-label" aria-hidden="true">{section.label}</span>
                )}

                {section.items.map((item) => {
                  if (item.type === "link") {
                    return (
                      <NavLink key={item.id} to={item.to} end={item.end}
                        className={({ isActive }) => `adm-nav__item ${isActive ? "is-active" : ""}`}
                        onClick={handleNavClick}>
                        <SvgIcon d={ICONS[item.icon]} size={17} className="adm-nav__icon"/>
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  }

                  // Group (collapsible)
                  const groupKey = toGroupStateKey(section.id, item.id);
                  const isOpen = Boolean(expandedGroups[groupKey]);
                  const hasChildMatch = (item.children || []).some((c) =>
                    routeMatchesPath(pathName, c.to, c.end));
                  const isGroupActive = routeMatchesPath(pathName, item.to, item.end) || hasChildMatch;
                  const groupPanelId = `adm-group-${section.id}-${item.id}`;

                  return (
                    <div className="adm-nav__group" key={item.id}>
                      {item.to ? (
                        <div className={`adm-nav__group-head ${isGroupActive ? "is-active" : ""}`}>
                          <NavLink to={item.to} end={item.end}
                            className={({ isActive }) =>
                              `adm-nav__item adm-nav__item--group-link ${isActive || hasChildMatch ? "is-active" : ""}`
                            }
                            onClick={handleNavClick}>
                            <SvgIcon d={ICONS[item.icon]} size={17} className="adm-nav__icon"/>
                            <span>{item.label}</span>
                          </NavLink>
                          <button className={`adm-nav__toggle ${isOpen ? "is-open" : ""}`}
                            type="button" aria-expanded={isOpen} aria-controls={groupPanelId}
                            aria-label={`${isOpen ? "Collapse" : "Expand"} ${item.label}`}
                            onClick={() => toggleGroup(section.id, item.id)}>
                            <SvgIcon d={ICONS.chevronDown} size={14}/>
                          </button>
                        </div>
                      ) : (
                        <div className={`adm-nav__group-head ${isGroupActive ? "is-active" : ""}`}>
                          <span className={`adm-nav__item adm-nav__item--group-link ${isGroupActive ? "is-active" : ""}`}>
                            <SvgIcon d={ICONS[item.icon]} size={17} className="adm-nav__icon"/>
                            <span>{item.label}</span>
                          </span>
                          <button className={`adm-nav__toggle ${isOpen ? "is-open" : ""}`}
                            type="button" aria-expanded={isOpen} aria-controls={groupPanelId}
                            aria-label={`${isOpen ? "Collapse" : "Expand"} ${item.label}`}
                            onClick={() => toggleGroup(section.id, item.id)}>
                            <SvgIcon d={ICONS.chevronDown} size={14}/>
                          </button>
                        </div>
                      )}
                      <div className={`adm-nav__children ${isOpen ? "is-open" : ""}`} id={groupPanelId}>
                        <div>
                          {(item.children || []).map((child) => (
                            <NavLink key={child.to} to={child.to} end={child.end}
                              className={({ isActive }) => `adm-nav__child ${isActive ? "is-active" : ""}`}
                              onClick={handleNavClick}>
                              {child.label}
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Sign out */}
          <button className="adm-sidebar__signout" type="button" onClick={handleSignOut}>
            <SvgIcon d={ICONS.signout} size={16}/>
            Sign Out
          </button>
        </aside>

        {/* Backdrop */}
        <button className={`adm-backdrop ${drawerOpen ? "is-open" : ""}`} type="button"
          aria-label="Close navigation" aria-hidden={!drawerOpen}
          onClick={() => setDrawerOpen(false)} tabIndex={drawerOpen ? 0 : -1}/>

        {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
        <nav className="adm-bottom-nav" aria-label="Quick navigation">
          <NavLink to="/admin" end className={({ isActive }) => `adm-bottom-nav__btn ${isActive ? "is-active" : ""}`} onClick={handleNavClick}>
            <SvgIcon d={ICONS.dashboard} size={22}/>
            <span>Home</span>
          </NavLink>
          <NavLink to="/admin/orders" className={({ isActive }) => `adm-bottom-nav__btn ${isActive ? "is-active" : ""}`} onClick={handleNavClick}>
            <SvgIcon d={ICONS.orders} size={22}/>
            <span>Orders</span>
          </NavLink>
          <NavLink to="/admin/pos" end className={({ isActive }) => `adm-bottom-nav__btn ${isActive ? "is-active" : ""}`} onClick={handleNavClick}>
            <SvgIcon d={ICONS.pos} size={22}/>
            <span>POS</span>
          </NavLink>
          <NavLink to="/admin/products" className={({ isActive }) => `adm-bottom-nav__btn ${isActive ? "is-active" : ""}`} onClick={handleNavClick}>
            <SvgIcon d={ICONS.products} size={22}/>
            <span>Products</span>
          </NavLink>
          <button className={`adm-bottom-nav__btn ${drawerOpen ? "is-active" : ""}`}
            type="button" aria-label="Open full menu" aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((p) => !p)}>
            <SvgIcon d={ICONS.menu} size={22}/>
            <span>Menu</span>
          </button>
        </nav>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <div className="adm-main">
          <header className="adm-header">
            <div className="adm-header__left">
              <button className="adm-header__menu-btn" type="button" aria-label="Toggle navigation"
                onClick={() => setDrawerOpen((p) => !p)}>
                <SvgIcon d={ICONS.menu} size={20}/>
              </button>
              <h1 className="adm-header__title">{pageTitle}</h1>
            </div>
            <div className="adm-header__right">
              <div className="adm-header__avatar" title={user.email} aria-label={`Signed in as ${user.email}`}>
                {userInitials}
              </div>
              <button className="adm-header__signout btn btn--secondary" type="button" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </header>

          <main className="adm-content" id="main-content">
            <Outlet/>
          </main>
        </div>

      </div>
    </AdminDataProvider>
  );
}

export default AdminLayout;
