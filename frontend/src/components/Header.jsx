import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, matchPath, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection.js";
import logo from "../assets/BethanyBloomsLogo.png";

function Header() {
  const { totalCount } = useCart();
  const { openCart } = useModal();
  const { items: categoryItems } = useFirestoreCollection("productCategories", {
    orderByField: "name",
    orderDirection: "asc",
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const closeTimer = useRef(null);
  const location = useLocation();
  const categoryLinks = useMemo(
    () =>
      categoryItems
        .map((category) => {
          const name = (category.name || category.title || category.label || category.id || "").toString().trim();
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
    [categoryItems],
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
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const toggleDropdown = (label) => {
    setOpenDropdown((current) => (current === label ? null : label));
  };

  const closeDropdown = () => setOpenDropdown(null);

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
    <header>
      <nav className="nav" onMouseLeave={handleLeave}>
        <NavLink to="/" className="brand" aria-label="Bethany Blooms home">
          <img
            src={logo}
            alt="Bethany Blooms logo"
            className="brand__logo"
            loading="lazy"
            width="120"
            height="60"
          />
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
          {navItems.map((item) => {
            if (item.type === "link") {
              const { to, label, end } = item;
              return (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
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
                        onClick={closeDropdown}
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
        <div className="nav__actions">
          <button
            className="cart-button"
            type="button"
            onClick={openCart}
            aria-label="View cart"
          >
            <span>Cart</span>
            <span className="cart-count" aria-live="polite">
              {totalCount}
            </span>
          </button>
          <button
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
