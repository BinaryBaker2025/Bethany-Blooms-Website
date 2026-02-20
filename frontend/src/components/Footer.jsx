import { NavLink } from "react-router-dom";
import logo from "../assets/BethanyBloomsLogo.png";

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M14.2 8.4V6.7c0-.8.6-1.3 1.4-1.3H17V2h-2.3c-2.6 0-4.3 1.8-4.3 4.5v2H8v3.1h2.4V22h3.8V11.5h2.6L17 8.4h-2.8Z"
      fill="currentColor"
    />
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
  </svg>
);

function Footer() {
  const navLinks = [
    { to: "/", label: "Home" },
    { to: "/workshops", label: "Workshops" },
    { to: "/products", label: "Products" },
    { to: "/gallery", label: "Gallery" },
    { to: "/contact", label: "Contact" },
    { to: "/admin", label: "Admin" },
  ];

  return (
    <footer className="footer">
      <div className="footer__inner">
        <div>
          <NavLink to="/" className="brand" aria-label="Bethany Blooms home">
            <img
              src={logo}
              alt="Bethany Blooms logo"
              className="brand__logo"
              loading="lazy"
              width="120"
              height="60" decoding="async"/>
          </NavLink>
          <p className="footer__scripture">
            “You will be like a well-watered garden…” – Isaiah 58:11
          </p>
        </div>
        <nav className="footer__nav" aria-label="Footer navigation">
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div>
          <p>
            <strong>Stay in Bloom</strong>
          </p>
          <form className="newsletter" action="#" method="post">
            <label className="sr-only" htmlFor="newsletter-email">
              Email address
            </label>
            <input
              className="input"
              type="email"
              id="newsletter-email"
              name="email"
              placeholder="Email address"
              required
            />
            <button className="btn btn--primary" type="submit">
              Subscribe
            </button>
          </form>
        </div>
        <div>
          <p>
            <strong>Connect</strong>
          </p>
          <div className="footer__socials">
            <a
              href="https://www.facebook.com/share/1PnGmuhZoJ/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Bethany Blooms on Facebook"
            >
              <FacebookIcon />
            </a>
            <a
              href="https://www.instagram.com/bethany_bl.0oms?igsh=Mmp0bWZzNmlsY2dt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Bethany Blooms on Instagram"
            >
              <InstagramIcon />
            </a>
          </div>
        </div>
      </div>
      <p className="credits">
        © <span>{new Date().getFullYear()}</span> Bethany Blooms. Crafted with
        care in South Africa.
      </p>
    </footer>
  );
}

export default Footer;
