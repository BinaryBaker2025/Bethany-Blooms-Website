import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, matchPath, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import logo from "../assets/BethanyBloomsLogo.png";

const PRODUCT_CATEGORY_CACHE_KEY = "bethany-blooms-product-categories-cache-v1";
const PRODUCT_CATEGORY_CACHE_LIMIT = 50;
const DEFAULT_PRODUCT_CATEGORIES = Object.freeze([
  { id: "cut-flowers", name: "Cut flowers", slug: "cut-flowers" },
  { id: "pressed-flower-diy", name: "Pressed flower DIY", slug: "pressed-flower-diy" },
  { id: "tubers-and-corms", name: "Tubers and Corms", slug: "tubers-and-corms" },
]);

const slugifyCategoryValue = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const normalizeCategoryEntry = (category) => {
  if (!category || typeof category !== "object") return null;
  const name = (category.name || category.title || category.label || category.id || "").toString().trim();
  if (!name) return null;
  const slugSeed = (category.slug || category.id || name).toString().trim();
  const slug = slugifyCategoryValue(slugSeed);
  if (!slug) return null;
  const id = (category.id || slug).toString().trim() || slug;
  return { id, name, slug };
};

const normalizeCategoryList = (categories = []) => {
  if (!Array.isArray(categories)) return [];
  const map = new Map();
  categories.forEach((entry) => {
    const normalized = normalizeCategoryEntry(entry);
    if (!normalized) return;
    if (map.has(normalized.slug)) return;
    map.set(normalized.slug, normalized);
  });
  return Array.from(map.values()).slice(0, PRODUCT_CATEGORY_CACHE_LIMIT);
};

const readCachedProductCategories = () => {
  if (typeof window === "undefined") return [...DEFAULT_PRODUCT_CATEGORIES];
  try {
    const raw = window.localStorage.getItem(PRODUCT_CATEGORY_CACHE_KEY);
    if (!raw) return [...DEFAULT_PRODUCT_CATEGORIES];
    const parsed = JSON.parse(raw);
    const normalized = normalizeCategoryList(parsed);
    return normalized.length ? normalized : [...DEFAULT_PRODUCT_CATEGORIES];
  } catch {
    return [...DEFAULT_PRODUCT_CATEGORIES];
  }
};

const writeCachedProductCategories = (categories = []) => {
  if (typeof window === "undefined") return;
  const normalized = normalizeCategoryList(categories);
  if (!normalized.length) return;
  try {
    window.localStorage.setItem(PRODUCT_CATEGORY_CACHE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore cache write failures.
  }
};

function Header() {
  const { totalCount } = useCart();
  const { openCart } = useModal();
  const { user } = useAuth();
  const [categoryFallback] = useState(() => readCachedProductCategories());
  const { items: categoryItems } = useFirestoreCollection("productCategories", {
    orderByField: "name",
    orderDirection: "asc",
    fallback: categoryFallback,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [collapseActionsIntoMenu, setCollapseActionsIntoMenu] = useState(false);
  const closeTimer = useRef(null);
  const headerRef = useRef(null);
  const navRef = useRef(null);
  const brandRef = useRef(null);
  const actionsRef = useRef(null);
  const cartButtonRef = useRef(null);
  const accountButtonRef = useRef(null);
  const menuToggleRef = useRef(null);
  const location = useLocation();
  const normalizedCategoryItems = useMemo(
    () => normalizeCategoryList(categoryItems),
    [categoryItems],
  );

  useEffect(() => {
    if (!normalizedCategoryItems.length) return;
    writeCachedProductCategories(normalizedCategoryItems);
  }, [normalizedCategoryItems]);

  const categoryLinks = useMemo(
    () =>
      normalizedCategoryItems
        .map((category) => {
          const name = (category.name || "").toString().trim();
          if (!name) return null;
          const slug = (category.slug || category.id || name).toString().trim();
          return {
            key: `category-${slug}`,
            to: { pathname: "/products", search: `?category=${encodeURIComponent(slug)}` },
            label: name,
            matchPath: "/products",
            matchSearch: slug,
          };
        })
        .filter(Boolean),
    [normalizedCategoryItems],
  );
  const navItems = useMemo(
    () => [
      { type: "link", to: "/", label: "Home", end: true },
      {
        type: "dropdown",
        label: "Bookings",
        links: [
          { to: "/workshops", label: "Workshops" },
          { to: "/cut-flowers", label: "Cut Flowers" },
        ],
      },
      { type: "link", to: "/events", label: "Events" },
      {
        type: "dropdown",
        label: "Shop",
        links: [
          {
            key: "products",
            to: "/products",
            label: "Products",
            end: true,
            matchPath: "/products",
            matchSearch: null,
          },
          ...categoryLinks,
        ],
      },
      { type: "link", to: "/gallery", label: "Gallery" },
      { type: "link", to: "/contact", label: "Contact" },
    ],
    [categoryLinks],
  );

  useEffect(() => {
    setMenuOpen(false);
    setOpenDropdown(null);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncHeaderHeight = () => {
      if (!headerRef.current) return;
      const headerHeight = Math.ceil(headerRef.current.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--site-header-height", `${headerHeight}px`);
    };

    syncHeaderHeight();
    window.addEventListener("resize", syncHeaderHeight);

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined" && headerRef.current) {
      resizeObserver = new ResizeObserver(syncHeaderHeight);
      resizeObserver.observe(headerRef.current);
    }

    return () => {
      window.removeEventListener("resize", syncHeaderHeight);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let frameId = null;
    let resizeObserver = null;
    const mobileQuery = window.matchMedia("(max-width: 768px)");

    const syncActionLayout = () => {
      const navNode = navRef.current;
      const brandNode = brandRef.current;
      const actionsNode = actionsRef.current;
      const cartNode = cartButtonRef.current;
      const accountNode = accountButtonRef.current;
      const menuNode = menuToggleRef.current;
      if (!navNode || !brandNode || !actionsNode || !cartNode || !accountNode || !menuNode) {
        return;
      }

      if (!mobileQuery.matches) {
        setCollapseActionsIntoMenu(false);
        return;
      }

      const navRect = navNode.getBoundingClientRect();
      const brandRect = brandNode.getBoundingClientRect();
      const actionsRect = actionsNode.getBoundingClientRect();
      const actionsStyles = window.getComputedStyle(actionsNode);
      const gapValue = Number.parseFloat(actionsStyles.columnGap || actionsStyles.gap || "0");
      const actionGap = Number.isFinite(gapValue) ? gapValue : 0;

      const cartWidth = cartNode.getBoundingClientRect().width || 0;
      const accountWidth = accountNode.getBoundingClientRect().width || 0;
      const menuWidth = menuNode.getBoundingClientRect().width || 0;
      const requiredWidth = cartWidth + accountWidth + menuWidth + actionGap * 2;
      const availableWidth = Math.max(0, navRect.width - brandRect.width - 12);

      const visibleActionChildren = Array.from(actionsNode.children).filter((child) => {
        const childStyles = window.getComputedStyle(child);
        return childStyles.display !== "none" && childStyles.visibility !== "hidden";
      });
      const firstTop = visibleActionChildren[0]?.getBoundingClientRect().top ?? 0;
      const hasWrappedActionButtons = visibleActionChildren.some(
        (child) => Math.abs(child.getBoundingClientRect().top - firstTop) > 2,
      );
      const isSecondNavRow = Math.abs(actionsRect.top - brandRect.top) > 6;
      const shouldCollapse = hasWrappedActionButtons || isSecondNavRow || requiredWidth > availableWidth;

      setCollapseActionsIntoMenu((current) => (current === shouldCollapse ? current : shouldCollapse));
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncActionLayout();
      });
    };

    scheduleSync();
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);
    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", scheduleSync);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(scheduleSync);
    }

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleSync);
      [
        navRef.current,
        brandRef.current,
        actionsRef.current,
        cartButtonRef.current,
        accountButtonRef.current,
        menuToggleRef.current,
      ].forEach((node) => {
        if (node) resizeObserver.observe(node);
      });
    }

    if (document?.fonts?.ready) {
      document.fonts.ready.then(scheduleSync).catch(() => {});
    }

    return () => {
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);
      if (typeof mobileQuery.removeEventListener === "function") {
        mobileQuery.removeEventListener("change", scheduleSync);
      } else if (typeof mobileQuery.removeListener === "function") {
        mobileQuery.removeListener(scheduleSync);
      }
      if (resizeObserver) resizeObserver.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [totalCount, menuOpen, user]);

  const toggleDropdown = (label) => {
    setOpenDropdown((current) => (current === label ? null : label));
  };

  const closeDropdown = () => setOpenDropdown(null);
  const closeAllMenus = () => {
    setMenuOpen(false);
    setOpenDropdown(null);
  };
  const openCartFromMenu = () => {
    closeAllMenus();
    openCart();
  };

  const handleEnter = (label) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }
    setOpenDropdown(label);
  };

  const handleLeave = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }
    closeTimer.current = setTimeout(() => setOpenDropdown(null), 100);
  };

  return (
    <header ref={headerRef} className="site-header">
      <nav ref={navRef} className="nav" onMouseLeave={handleLeave}>
        <NavLink ref={brandRef} to="/" className="brand" aria-label="Bethany Blooms home">
          <img
            src={logo}
            alt="Bethany Blooms logo"
            className="brand__logo"
            loading="lazy"
            width="120"
            height="60" decoding="async"/>
        </NavLink>
        <button
          className={`nav__overlay ${menuOpen ? "is-open" : ""}`}
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
        <div
          id="mobile-navigation"
          className={`nav__links ${menuOpen ? "is-open" : ""}`}
          data-nav-links=""
        >
          <div className="nav__mobile-header">
            <span>Menu</span>
            <button className="nav__mobile-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              &times;
            </button>
          </div>
          {collapseActionsIntoMenu && (
            <div className="nav__mobile-shortcuts">
              <button
                className="nav__mobile-shortcut"
                type="button"
                onClick={openCartFromMenu}
                aria-label="Open cart"
              >
                Cart ({totalCount})
              </button>
              <NavLink
                to="/account"
                className={({ isActive }) => `nav__mobile-shortcut ${isActive ? "active" : ""}`}
                onClick={closeAllMenus}
              >
                {user ? "Account" : "Sign in"}
              </NavLink>
            </div>
          )}
          {navItems.map((item) => {
            if (item.type === "link") {
              const { to, label, end } = item;
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => (isActive ? "active" : "")}
                  onClick={closeAllMenus}
                >
                  {label}
                </NavLink>
              );
            }

            if (item.type === "dropdown") {
              const isOpen = openDropdown === item.label;
              const isActive = item.links.some((link) => {
                const matchTarget =
                  link.matchPath || (typeof link.to === "string" ? link.to : link.to?.pathname);
                if (!matchTarget) return false;
                return matchPath({ path: matchTarget, end: link.end ?? false }, location.pathname);
              });
              const dropdownId = `${item.label.toLowerCase().replace(/\s+/g, "-")}-menu`;

              return (
                <div
                  key={item.label}
                  className={`nav__item nav__item--dropdown ${isOpen ? "is-open" : ""} ${
                    isActive ? "is-active" : ""
                  }`}
                  onMouseEnter={() => handleEnter(item.label)}
                  onMouseLeave={handleLeave}
                  onFocus={() => handleEnter(item.label)}
                  onBlur={handleLeave}
                >
                  <button
                    className="nav__trigger"
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={isOpen ? "true" : "false"}
                    aria-controls={dropdownId}
                    onClick={() => toggleDropdown(item.label)}
                  >
                    {item.label}
                    <span className="nav__caret" aria-hidden="true"></span>
                  </button>
                  <div className="nav__dropdown" id={dropdownId}>
                    {item.links.map((link) => (
                      <NavLink
                        key={link.key || (typeof link.to === "string" ? link.to : `${link.to?.pathname || ""}${link.to?.search || ""}`)}
                        to={link.to}
                        end={link.end}
                        className={({ isActive }) => {
                          if (Object.prototype.hasOwnProperty.call(link, "matchSearch")) {
                            if (!isActive) return "";
                            const searchParams = new URLSearchParams(location.search);
                            const activeCategory = searchParams.get("category");
                            const matches =
                              link.matchSearch === null
                                ? !activeCategory
                                : activeCategory === link.matchSearch;
                            return matches ? "active" : "";
                          }
                          return isActive ? "active" : "";
                        }}
                        onClick={closeAllMenus}
                      >
                        {link.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
        <div ref={actionsRef} className="nav__actions">
          <button
            ref={cartButtonRef}
            className={`cart-button ${collapseActionsIntoMenu ? "nav__action--overflow" : ""}`}
            type="button"
            onClick={openCart}
            aria-label="View cart"
          >
            <span>Cart</span>
            <span className="cart-count" aria-live="polite">
              {totalCount}
            </span>
          </button>
          <NavLink
            to="/account"
            ref={accountButtonRef}
            className={({ isActive }) =>
              `account-button ${isActive ? "is-active" : ""} ${
                collapseActionsIntoMenu ? "nav__action--overflow" : ""
              }`
            }
            aria-label={user ? "Open your account" : "Sign in or create an account"}
            title={user ? "Account" : "Login"}
          >
            <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              <path
                d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 2.25c-4.18 0-7.5 2.45-7.5 5.5 0 .41.34.75.75.75h13.5c.41 0 .75-.34.75-.75 0-3.05-3.32-5.5-7.5-5.5Z"
                fill="currentColor"
              />
            </svg>
            <span className="sr-only">{user ? "Account" : "Login"}</span>
          </NavLink>
          <button
            ref={menuToggleRef}
            className={`menu-toggle ${menuOpen ? "is-open" : ""}`}
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen ? "true" : "false"}
            aria-controls="mobile-navigation"
          >
            <span className="sr-only">Toggle navigation</span>
            <span className="menu-toggle__icon" aria-hidden="true"></span>
          </button>
        </div>
      </nav>
    </header>
  );
}

export default Header;
