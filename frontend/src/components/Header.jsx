import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import logo from "../assets/BethanyBloomsLogo.png";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/workshops", label: "Workshops" },
  { to: "/kits", label: "DIY Kits" },
  { to: "/cut-flowers", label: "Cut Flowers" },
  { to: "/gallery", label: "Gallery" },
  { to: "/contact", label: "Contact" },
];

function Header() {
  const { totalCount } = useCart();
  const { openCart } = useModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header>
      <nav className="nav">
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
          className="menu-toggle"
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen ? "true" : "false"}
          aria-controls="mobile-navigation"
        >
          Menu
        </button>
        <div
          id="mobile-navigation"
          className={`nav__links ${menuOpen ? "is-open" : ""}`}
          data-nav-links=""
        >
          {LINKS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {label}
            </NavLink>
          ))}
        </div>
        <div className="nav__actions">
          <button
            className="cart-button"
            type="button"
            onClick={openCart}
            aria-label="Open cart"
          >
            <span>Cart</span>
            <span className="cart-count" aria-live="polite">
              {totalCount}
            </span>
          </button>
        </div>
      </nav>
    </header>
  );
}

export default Header;
