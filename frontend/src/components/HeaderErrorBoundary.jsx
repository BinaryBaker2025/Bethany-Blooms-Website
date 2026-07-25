import { Component } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/BethanyBloomsLogo.png";

class HeaderErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Bethany Blooms header render failed.", {
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <header className="site-header site-header--fallback">
        <nav className="nav" aria-label="Fallback navigation">
          <Link className="brand" to="/" aria-label="Bethany Blooms home">
            <img
              src={logo}
              alt="Bethany Blooms"
              className="brand__logo"
              loading="eager"
              width="120"
              height="60"
              decoding="async"
            />
          </Link>
          <div className="header-fallback__links">
            <Link to="/">Home</Link>
            <Link to="/products">Shop</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </nav>
      </header>
    );
  }
}

export default HeaderErrorBoundary;
