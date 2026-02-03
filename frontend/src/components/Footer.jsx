import { NavLink } from "react-router-dom";
import logo from "../assets/BethanyBloomsLogo.png";

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
              href="https://www.facebook.com"
              aria-label="Bethany Blooms on Facebook"
            >
              Fb
            </a>
            <a
              href="https://www.instagram.com"
              aria-label="Bethany Blooms on Instagram"
            >
              Ig
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
