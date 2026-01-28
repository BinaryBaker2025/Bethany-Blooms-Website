
import Hero from "../components/Hero.jsx";
import HeroCarousel from "../components/HeroCarousel.jsx";
import TestimonialCarousel from "../components/TestimonialCarousel.jsx";
import { IconCheck, IconEdit, IconImage, IconPlus, IconTrash } from "../components/admin/AdminIcons.jsx";
import { usePageMetadata } from "../hooks/usePageMetadata.js";
import heroBackground from "../assets/hero-flowers.svg";
import workshopBanner from "../assets/photos/workshop-banner.jpg";
import workshopDetails from "../assets/photos/workshop-table-details-2.png";
import workshopGuests from "../assets/photos/workshop-guests-smiling.jpg";
import workshopTable from "../assets/photos/workshop-table-long.jpg";

const HERO_SLIDES = [
  {
    id: "design-hero-home",
    title: "Pressed Flower Keepsakes",
    description: "Curated florals, handmade frames, and botanical artistry for every moment.",
    background: heroBackground,
    mediaImage: workshopTable,
    mediaAlt: "Pressed floral styling on a long table",
    primaryCta: { label: "Shop collection", href: "/products" },
    secondaryCta: { label: "Book a workshop", href: "/workshops", variant: "secondary" },
  },
  {
    id: "design-hero-workshop",
    title: "Workshop Season",
    description: "Host or join a creative studio session guided by Bethany Blooms.",
    background: heroBackground,
    mediaImage: workshopGuests,
    mediaAlt: "Workshop guests smiling together",
    primaryCta: { label: "View dates", href: "/workshops" },
    secondaryCta: { label: "Contact us", href: "/contact", variant: "secondary" },
  },
];

const TESTIMONIALS = [
  {
    quote: "The workshop felt luxurious from start to finish. Every detail was thoughtful.",
    author: "Sharon L.",
  },
  {
    quote: "Bethany Blooms made our launch unforgettable. The florals were stunning.",
    author: "Studio Muse",
  },
  {
    quote: "A calm, creative experience with so much beauty and care.",
    author: "Hannah D.",
  },
];

function DesignSystemPage() {
  usePageMetadata({
    title: "Design System | Bethany Blooms",
    description: "Design system reference for shared UI components and admin layouts.",
  });

  return (
    <section className="section section--tight design-system">
      <div className="section__inner design-system__inner">
        <header className="design-system__header">
          <span className="badge">Design System</span>
          <h1>Admin + Core UI Reference</h1>
          <p>
            This page mirrors every reusable component, layout, and UI pattern across the site. Adjust any shared class
            here (buttons, inputs, cards, tables, modals, admin layouts) and the rest of the UI will follow.
          </p>
        </header>

        <div className="design-system__grid">
          <section className="design-system__panel design-system__panel--wide">
            <h2>Hero</h2>
            <Hero variant="home" background={heroBackground} media={<img src={workshopBanner} alt="Workshop banner" />}>
              <span className="badge">Seasonal Spotlight</span>
              <h1>Pressed Flower Workshops</h1>
              <p>Bring the Bethany Blooms studio experience to your next celebration.</p>
              <div className="cta-group">
                <button className="btn btn--primary" type="button">
                  Reserve a seat
                </button>
                <button className="btn btn--secondary" type="button">
                  View details
                </button>
              </div>
            </Hero>
          </section>

          <section className="design-system__panel design-system__panel--wide">
            <h2>Hero Carousel</h2>
            <HeroCarousel slides={HERO_SLIDES} autoAdvanceMs={12000} />
          </section>

          <section className="design-system__panel">
            <h2>Testimonials</h2>
            <TestimonialCarousel testimonials={TESTIMONIALS} />
          </section>

          <section className="design-system__panel">
            <h2>Buttons + Icons</h2>
            <div className="design-system__row">
              <button className="btn btn--primary" type="button">
                Primary
              </button>
              <button className="btn btn--secondary" type="button">
                Secondary
              </button>
              <button className="btn btn--primary btn--small" type="button">
                Small
              </button>
              <button className="btn btn--secondary" type="button" disabled>
                Disabled
              </button>
              <button className="btn btn--icon" type="button" aria-label="Icon button">
                <span className="btn__icon" aria-hidden="true">
                  <IconPlus />
                </span>
              </button>
              <button className="icon-btn" type="button" aria-label="Edit">
                <IconEdit />
              </button>
              <button className="icon-btn icon-btn--danger" type="button" aria-label="Delete">
                <IconTrash />
              </button>
              <button className="icon-btn icon-btn--featured is-active" type="button" aria-label="Featured">
                <IconCheck />
              </button>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Badges + Status</h2>
            <div className="design-system__row">
              <span className="badge">Bethany Blooms</span>
              <span className="badge badge--muted">Muted</span>
              <span className="badge badge--success">Success</span>
              <span className="badge badge--stock-in">In stock</span>
              <span className="badge badge--stock-low">Low stock</span>
              <span className="badge badge--stock-out">Out of stock</span>
              <span className="admin-status admin-status--paid">Paid</span>
              <span className="admin-status admin-status--complete">Complete</span>
              <span className="admin-status admin-status--failed">Failed</span>
              <span className="admin-status admin-status--stock-low">Low</span>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Forms</h2>
            <div className="design-system__split">
              <form className="contact-panel contact-panel--form">
                <h3>Contact Form</h3>
                <p className="contact-panel__subtitle">Uses the storefront form styling.</p>
                <div className="contact-form contact-form--card">
                  <div className="contact-form__row">
                    <div className="contact-form__field">
                      <label htmlFor="design-name">Full name</label>
                      <input className="input" id="design-name" type="text" placeholder="Jane Doe" />
                    </div>
                    <div className="contact-form__field">
                      <label htmlFor="design-email">Email</label>
                      <input className="input" id="design-email" type="email" placeholder="hello@bethanyblooms.co.za" />
                    </div>
                  </div>
                  <div className="contact-form__field">
                    <label htmlFor="design-topic">Topic</label>
                    <select className="input" id="design-topic">
                      <option>Workshop enquiry</option>
                      <option>Custom order</option>
                      <option>Press and media</option>
                    </select>
                  </div>
                  <div className="contact-form__field">
                    <label htmlFor="design-message">Message</label>
                    <textarea className="input textarea" id="design-message" placeholder="Tell us about your idea." />
                  </div>
                  <button className="btn btn--primary" type="button">
                    Send message
                  </button>
                </div>
              </form>

              <form className="admin-form">
                <label className="admin-form__field">
                  Full name
                  <input className="input" type="text" placeholder="Jane Doe" />
                </label>
                <label className="admin-form__field">
                  Email address
                  <input className="input" type="email" placeholder="hello@bethanyblooms.co.za" />
                </label>
                <label className="admin-form__field">
                  Category
                  <select className="input">
                    <option>Pressed florals</option>
                    <option>Workshops</option>
                    <option>Events</option>
                  </select>
                </label>
                <label className="admin-form__field">
                  Upload image
                  <input className="input input--file" type="file" />
                </label>
                <label className="admin-form__field admin-form__full">
                  Notes
                  <textarea className="input textarea" placeholder="Add optional notes or internal details." />
                </label>
                <div className="admin-form__inline">
                  <input className="input" type="text" placeholder="Inline value" />
                  <button className="btn btn--secondary btn--small" type="button">
                    Save inline
                  </button>
                </div>
                <label className="admin-checkbox">
                  <input type="checkbox" defaultChecked />
                  <span>Enable this option</span>
                </label>
              </form>
            </div>
          </section>
          <section className="design-system__panel">
            <h2>Cards + Grids</h2>
            <div className="cards-grid">
              <article className="card product-card product-card--link">
                <span className="product-card__category">Pressed Florals</span>
                <div className="product-card__media" aria-hidden="true">
                  <img className="product-card__image" src={workshopTable} alt="" />
                  <span className="badge badge--stock-in product-card__badge">In Stock</span>
                </div>
                <p className="card__title">Floral Keepsake</p>
                <p className="card__price">R 520</p>
                <p className="product-card__description">
                  A preserved botanical piece with layered textures and luxe framing.
                </p>
                <div className="card__actions">
                  <button className="btn btn--primary btn--small" type="button">
                    Add to cart
                  </button>
                  <button className="btn btn--secondary btn--small" type="button">
                    View
                  </button>
                </div>
              </article>

              <article className="card cut-flower-card">
                <div className="cut-flower-card__media">
                  <img src={workshopTable} alt="Cut flower class" />
                  <span className="cut-flower-card__badge">14 Feb</span>
                  <span className="cut-flower-card__price-tag">R 650</span>
                </div>
                <div className="cut-flower-card__body">
                  <div className="cut-flower-card__heading">
                    <h3 className="card__title">Bouquet Bar</h3>
                    <p className="cut-flower-card__location">Bethany Blooms Studio</p>
                  </div>
                  <p className="cut-flower-card__summary">
                    Build your own bouquet with seasonal stems and styling guidance.
                  </p>
                  <div className="cut-flower-card__details">
                    <div className="cut-flower-card__detail">
                      <span className="cut-flower-card__detail-label">Booking</span>
                      <span className="cut-flower-card__detail-value">12 seats per slot</span>
                    </div>
                    <div className="cut-flower-card__detail">
                      <span className="cut-flower-card__detail-label">Times</span>
                      <span className="cut-flower-card__detail-value">10:00, 13:00</span>
                    </div>
                    <div className="cut-flower-card__detail">
                      <span className="cut-flower-card__detail-label">Options</span>
                      <span className="cut-flower-card__detail-value">3 bouquet sizes</span>
                    </div>
                  </div>
                  <div className="card__actions">
                    <button className="btn btn--primary" type="button">
                      Book This Session
                    </button>
                  </div>
                </div>
              </article>

              <div className="admin-stat-card">
                <p className="admin-stat-card__label">Revenue</p>
                <p className="admin-stat-card__value">R 48k</p>
                <p className="admin-stat-card__hint">Last 30 days</p>
              </div>

              <button className="admin-quick-card" type="button">
                <h4>New Order</h4>
                <p>Review the latest order queue.</p>
              </button>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Process + Editorial Blocks</h2>
            <div className="cut-flowers-process">
              <div className="cut-flowers-process__media">
                <img src={workshopDetails} alt="Workshop table details" />
              </div>
              <div className="cut-flowers-process__steps">
                <span className="badge">The Process</span>
                <h3>Bookings, Simplified</h3>
                <ol>
                  <li>
                    <h4>Pick a date</h4>
                    <p>Choose from curated seasonal sessions.</p>
                  </li>
                  <li>
                    <h4>Confirm details</h4>
                    <p>Add attendee counts and preferences.</p>
                  </li>
                  <li>
                    <h4>Create together</h4>
                    <p>Enjoy guided floral styling in-studio.</p>
                  </li>
                </ol>
              </div>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Gallery</h2>
            <div className="gallery">
              {[workshopTable, workshopGuests, workshopDetails].map((src) => (
                <div className="gallery__item" key={src}>
                  <button className="gallery__button" type="button">
                    <img src={src} alt="Gallery preview" />
                    <span className="gallery__overlay">View</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Admin Layout</h2>
            <div className="admin-shell design-system__admin-shell">
              <aside className="admin-sidebar">
                <div className="admin-sidebar__header">
                  <span className="badge badge--muted">ADMIN</span>
                </div>
                <nav className="admin-sidebar__nav">
                  <a className="active" href="#design-admin">
                    Dashboard
                  </a>
                  <a href="#design-admin">Products</a>
                  <a href="#design-admin">Orders</a>
                  <a href="#design-admin">Workshops</a>
                  <a href="#design-admin">Reports</a>
                </nav>
                <button className="btn btn--secondary admin-sidebar__signout" type="button">
                  Sign Out
                </button>
              </aside>
              <div className="admin-shell__main">
                <header className="admin-shell__header">
                  <div>
                    <p className="admin-shell__title">Admin Portal</p>
                    <p className="admin-shell__subtitle">Signed in as admin@bethanyblooms.co.za</p>
                  </div>
                  <button className="btn btn--secondary" type="button">
                    Sign Out
                  </button>
                </header>
                <main className="admin-shell__content">
                  <div className="admin-panel admin-panel--full">
                    <div className="admin-panel__header">
                      <div>
                        <h3>Weekly Overview</h3>
                        <p className="admin-panel__note">Latest booking and order activity.</p>
                      </div>
                      <button className="btn btn--secondary btn--small" type="button">
                        Export
                      </button>
                    </div>
                    <div className="admin-panel__content">
                      <div className="admin-kpi-grid">
                        <div className="admin-kpi">
                          <p className="admin-kpi__label">Orders</p>
                          <p className="admin-kpi__value">128</p>
                        </div>
                        <div className="admin-kpi">
                          <p className="admin-kpi__label">Workshops</p>
                          <p className="admin-kpi__value">6</p>
                        </div>
                        <div className="admin-kpi">
                          <p className="admin-kpi__label">Events</p>
                          <p className="admin-kpi__value">3</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </section>
          <section className="design-system__panel">
            <h2>Admin Filters + Tabs</h2>
            <div className="admin-filters">
              <div className="admin-filters__left">
                <label className="admin-filters__field">
                  <span>Status</span>
                  <select className="input">
                    <option>All</option>
                    <option>Pending</option>
                    <option>Paid</option>
                  </select>
                </label>
                <label className="admin-filters__field">
                  <span>Search</span>
                  <input className="input" type="text" placeholder="Search orders" />
                </label>
              </div>
              <div className="admin-filters__right">
                <button className="btn btn--secondary btn--small" type="button">
                  Reset
                </button>
              </div>
            </div>

            <div className="admin-tabs">
              <button className="admin-tab is-active" type="button">
                Overview
              </button>
              <button className="admin-tab" type="button">
                Details
              </button>
              <button className="admin-tab" type="button">
                Settings
              </button>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Admin Tables + Pagination</h2>
            <div className="admin-table__wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>#1042</td>
                    <td>Amelia K.</td>
                    <td>
                      <span className="admin-status admin-status--paid">Paid</span>
                    </td>
                    <td>R 980</td>
                    <td className="admin-table__actions">
                      <button className="icon-btn" type="button" aria-label="Edit">
                        <IconEdit />
                      </button>
                      <button className="icon-btn icon-btn--danger" type="button" aria-label="Delete">
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                  <tr className="is-active">
                    <td>#1043</td>
                    <td>Jack P.</td>
                    <td>
                      <span className="admin-status admin-status--failed">Failed</span>
                    </td>
                    <td>R 640</td>
                    <td className="admin-table__actions">
                      <button className="icon-btn" type="button" aria-label="Edit">
                        <IconEdit />
                      </button>
                      <button className="icon-btn icon-btn--danger" type="button" aria-label="Delete">
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="admin-pagination">
              <span className="admin-pagination__info">Page 1 of 6</span>
              <div className="admin-pagination__controls">
                <button className="admin-pagination__button" type="button" disabled>
                  Prev
                </button>
                <span className="admin-pagination__page">1</span>
                <button className="admin-pagination__button" type="button">
                  Next
                </button>
              </div>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Admin Calendar</h2>
            <div className="admin-calendar">
              <div className="admin-calendar__panel">
                <div className="admin-calendar__header">
                  <h3>February 2026</h3>
                  <div>
                    <button className="btn btn--secondary admin-calendar__nav" type="button">
                      <span aria-hidden="true">&lt;</span>
                    </button>
                    <button className="btn btn--secondary admin-calendar__nav" type="button">
                      <span aria-hidden="true">&gt;</span>
                    </button>
                  </div>
                </div>
                <div className="admin-calendar__legend">
                  <span>
                    <span className="legend-dot legend-dot--booked" /> Bookings
                  </span>
                  <span>
                    <span className="legend-dot legend-dot--event" /> Events
                  </span>
                  <span>
                    <span className="legend-dot legend-dot--today" /> Today
                  </span>
                </div>
                <div className="admin-calendar__grid">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                    <span className="admin-calendar__weekday" key={day}>
                      {day}
                    </span>
                  ))}
                  {Array.from({ length: 14 }).map((_, index) => (
                    <button
                      key={`day-${index}`}
                      className={`admin-calendar__cell${index % 7 === 0 ? " is-muted" : ""}${
                        index === 5 ? " has-bookings" : ""
                      }${index === 8 ? " has-events" : ""}${index === 10 ? " is-selected" : ""}`}
                      type="button"
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div className="admin-calendar__details">
                <div className="admin-calendar__details-header">
                  <h4>Selected day</h4>
                  <span className="badge badge--muted">2 items</span>
                </div>
                <div className="admin-calendar__details-group">
                  <h5>Bookings</h5>
                  <ul>
                    <li>
                      10:00 - Bouquet Bar <span className="modal__meta">3 seats</span>
                    </li>
                    <li>
                      13:00 - Styling Masterclass <span className="modal__meta">5 seats</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Admin Media Library</h2>
            <section className="admin-media">
              <div className="admin-media__grid">
                {[workshopTable, workshopGuests].map((src) => (
                  <article className="admin-media__card" key={src}>
                    <img className="admin-media__thumb" src={src} alt="Media item" loading="lazy" />
                    <div className="admin-media__body">
                      <strong className="admin-media__filename">workshop-image.jpg</strong>
                      <div className="admin-media__buttons">
                        <button className="icon-btn" type="button" aria-label="Copy link">
                          <IconCheck />
                        </button>
                        <button className="icon-btn icon-btn--danger" type="button" aria-label="Delete">
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                <article className="admin-media__card">
                  <div className="admin-media__thumb admin-media__thumb--empty">
                    <IconImage aria-hidden="true" />
                  </div>
                  <div className="admin-media__body">
                    <strong className="admin-media__filename">placeholder.png</strong>
                    <div className="admin-media__buttons">
                      <button className="icon-btn" type="button" aria-label="Copy link">
                        <IconCheck />
                      </button>
                      <button className="icon-btn icon-btn--danger" type="button" aria-label="Delete">
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </section>
          <section className="design-system__panel">
            <h2>Admin Sessions + Chips</h2>
            <div className="admin-session-panel">
              <div className="admin-session-row">
                <div className="admin-session-field">
                  <label className="admin-session-label">Start time</label>
                  <input className="input" type="time" defaultValue="10:00" />
                </div>
                <div className="admin-session-field">
                  <label className="admin-session-label">End time</label>
                  <input className="input" type="time" defaultValue="13:00" />
                </div>
                <button className="icon-btn icon-btn--danger admin-session-remove" type="button">
                  <IconTrash />
                </button>
              </div>
              <div className="admin-repeat-days">
                <label className="admin-repeat-day">
                  <input type="checkbox" defaultChecked />
                  <span>Mon</span>
                </label>
                <label className="admin-repeat-day">
                  <input type="checkbox" />
                  <span>Tue</span>
                </label>
                <label className="admin-repeat-day">
                  <input type="checkbox" defaultChecked />
                  <span>Wed</span>
                </label>
                <label className="admin-repeat-day">
                  <input type="checkbox" />
                  <span>Thu</span>
                </label>
                <label className="admin-repeat-day">
                  <input type="checkbox" />
                  <span>Fri</span>
                </label>
              </div>
            </div>
            <div className="admin-chip-grid">
              <label className="admin-chip is-active">
                <input type="checkbox" defaultChecked />
                <span>Featured</span>
              </label>
              <label className="admin-chip">
                <input type="checkbox" />
                <span>New arrival</span>
              </label>
              <label className="admin-chip">
                <input type="checkbox" />
                <span>Limited run</span>
              </label>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Feedback + Notices</h2>
            <p className="admin-panel__status">Saved successfully.</p>
            <p className="admin-panel__error">There was an issue saving this update.</p>
            <p className="admin-panel__notice">No results found.</p>
            <p className="admin-save-indicator">Changes saved.</p>
            <p className="empty-state">Empty states look like this.</p>
          </section>

          <section className="design-system__panel">
            <h2>Modals</h2>
            <div className="modal is-active design-system__modal">
              <div className="modal__content">
                <button className="modal__close" type="button" aria-label="Close">
                  x
                </button>
                <h3 className="modal__title">Modal Title</h3>
                <ul className="modal__list">
                  <li>
                    <div>
                      Item name
                      <span className="modal__meta">Supporting detail</span>
                    </div>
                    <span>R 420</span>
                  </li>
                </ul>
                <button className="btn btn--primary" type="button">
                  Confirm
                </button>
              </div>
            </div>

            <div className="modal is-active admin-modal design-system__modal">
              <div className="modal__content admin-modal__content">
                <h3>Admin Modal</h3>
                <form className="admin-form">
                  <label className="admin-form__field">
                    Title
                    <input className="input" type="text" placeholder="New listing" />
                  </label>
                  <div className="admin-modal__actions">
                    <button className="btn btn--secondary" type="button">
                      Cancel
                    </button>
                    <button className="btn btn--primary" type="button">
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>Cart Toast</h2>
            <div className="cart-toast">
              <div className="cart-toast__content">
                Added to cart
                <div className="cart-toast__actions">
                  <button className="cart-toast__link" type="button">
                    View cart
                  </button>
                  <button className="cart-toast__close" type="button">
                    x
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="design-system__panel">
            <h2>POS Components</h2>
            <div className="pos-layout">
              <div>
                <div className="pos-toolbar">
                  <div className="pos-toolbar__row pos-toolbar__row--search">
                    <input className="input pos-search" placeholder="Search products" />
                    <span className="pos-toolbar__count">12 items</span>
                  </div>
                  <div className="pos-toolbar__row">
                    <div className="pos-toolbar__categories">
                      <button className="pos-category-chip is-active" type="button">
                        All
                      </button>
                      <button className="pos-category-chip" type="button">
                        Workshops
                      </button>
                      <button className="pos-category-chip" type="button">
                        Products
                      </button>
                    </div>
                  </div>
                </div>
                <div className="pos-grid">
                  <article className="pos-item-card">
                    <div>
                      <strong>Pressed Floral Kit</strong>
                      <p className="pos-item-card__field">R 450</p>
                    </div>
                    <button className="btn btn--primary btn--small" type="button">
                      Add
                    </button>
                  </article>
                  <article className="pos-item-card">
                    <div>
                      <strong>Workshop Seat</strong>
                      <p className="pos-item-card__field">R 650</p>
                    </div>
                    <button className="btn btn--primary btn--small" type="button">
                      Add
                    </button>
                  </article>
                </div>
              </div>

              <aside className="pos-cart">
                <div className="pos-cart__panel">
                  <div className="pos-cart__list">
                    <div className="pos-cart__item">
                      <div className="pos-cart__info">
                        <p className="pos-cart__name">Pressed Floral Kit</p>
                        <p className="pos-cart__meta">R 450</p>
                      </div>
                      <div className="pos-cart__controls">
                        <div className="pos-cart__stepper">
                          <button className="pos-cart__stepper-btn" type="button">
                            -
                          </button>
                          <input className="pos-cart__input" type="number" defaultValue="1" />
                          <button className="pos-cart__stepper-btn" type="button">
                            +
                          </button>
                        </div>
                        <button className="icon-btn icon-btn--danger pos-cart__remove" type="button">
                          <IconTrash />
                        </button>
                      </div>
                      <span className="pos-cart__line-total">R 450</span>
                    </div>
                  </div>
                  <div className="pos-checkout__totals">
                    <div>
                      <span>Subtotal</span>
                      <span>R 450</span>
                    </div>
                    <div>
                      <strong>Total</strong>
                      <strong>R 450</strong>
                    </div>
                  </div>
                  <button className="btn btn--primary" type="button">
                    Checkout
                  </button>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export default DesignSystemPage;
