import { useRef, useState } from "react";
import "./PosDesign.css";

// ── SVG Icon primitive ────────────────────────────────────────────
function Ico({ d, size = 16, stroke = 1.75, fill = "none", className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      {[].concat(d).map((path, i) => <path key={i} d={path} />)}
    </svg>
  );
}

const ICO = {
  search:     "M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z",
  x:          "M18 6L6 18M6 6l12 12",
  trash:      ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  plus:       "M12 5v14M5 12h14",
  minus:      "M5 12h14",
  cart:       ["M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z","M3 6h18","M16 10a4 4 0 01-8 0"],
  cash:       ["M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z","M12 6v1.5M12 16.5V18M9.17 9.17A3 3 0 0112 8c1.66 0 3 1.12 3 2.5 0 1.74-1.75 2.5-3 2.5-1.38 0-3 .86-3 2.5C9 17.14 10.34 18 12 18c1.38 0 3-.86 3-2.5"],
  creditCard: ["M1 4h22v16H1z","M1 9h22","M5 15h4","M13 15h6"],
  calendar:   ["M8 2v4","M16 2v4","M3 8h18","M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"],
  clock:      ["M12 2a10 10 0 100 20A10 10 0 0012 2z","M12 6v6l4 2"],
  phone:      "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.15 12 19.79 19.79 0 011.05 3.4 2 2 0 013 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z",
  chevDown:   "M6 9l6 6 6-6",
  chevRight:  "M9 18l6-6-6-6",
  lock:       ["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z","M7 11V7a5 5 0 0110 0v4"],
  leaf:       "M17 8C8 10 5.9 16.17 3.82 19c0 0 1.94-2.5 5.18-3a5 5 0 00-2 7c4.43.44 13-4 13-16 0 0-5 3-10 1",
  scissors:   ["M6 3a3 3 0 100 6 3 3 0 000-6z","M6 15a3 3 0 100 6 3 3 0 000-6z","M20 4L8.12 15.88","M14.47 14.48L20 20","M3.18 3.17l3.64 3.63"],
  users:      ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2","M9 11a4 4 0 100-8 4 4 0 000 8z","M23 21v-2a4 4 0 00-3-3.87","M16 3.13a4 4 0 010 7.75"],
  package:    ["M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"],
  image:      ["M21 19a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h4l2-3h4l2 3h4a2 2 0 012 2z","M12 13a3 3 0 100-6 3 3 0 000 6z"],
  upload:     ["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4","M17 8l-5-5-5 5","M12 3v12"],
  tag:        ["M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z","M7 7h.01"],
  warning:    ["M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z","M12 9v4","M12 17h.01"],
  check:      "M20 6L9 17l-5-5",
};

function Icon({ name, size = 16, stroke = 1.75 }) {
  const d = ICO[name] || ICO.package;
  return <Ico d={d} size={size} stroke={stroke} />;
}

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(n ?? 0);

const today = new Date().toISOString().split("T")[0];

// ── Mock Data ─────────────────────────────────────────────────────
const TABS = [
  { id: "all",       label: "All Items" },
  { id: "coffee",    label: "Coffee" },
  { id: "drinks",    label: "Drinks" },
  { id: "food",      label: "Food" },
  { id: "add-ons",   label: "Add-ons" },
  { id: "services",  label: "Services" },
  { id: "bookings",  label: "Bookings" },
];

const PRODUCTS = [
  { id: "p1",  name: "Double Shot Espresso",    category: "coffee",  price: 28, qty: 1000000, imageUrl: "https://picsum.photos/seed/espresso/400/300" },
  { id: "p2",  name: "Cappuccino",              category: "coffee",  price: 42, qty: 1000000, imageUrl: "https://picsum.photos/seed/cappuccino/400/300" },
  { id: "p3",  name: "Flat White",              category: "coffee",  price: 36, qty: 1000000, imageUrl: null },
  { id: "p4",  name: "Caffè Latte",             category: "coffee",  price: 38, qty: 1000000, imageUrl: null },
  { id: "p5",  name: "Mocha",                   category: "coffee",  price: 48, qty: 1000000, imageUrl: "https://picsum.photos/seed/mocha/400/300" },
  { id: "p6",  name: "Iced Latte",              category: "coffee",  price: 45, qty: 1000000, imageUrl: null },
  { id: "p7",  name: "Chai Latte",              category: "coffee",  price: 46, qty: 1000000, imageUrl: null },
  { id: "p8",  name: "Red Cappuccino",          category: "coffee",  price: 44, qty: 1000000, imageUrl: null },
  { id: "p9",  name: "Hot Chocolate",           category: "coffee",  price: 48, qty: 1000000, imageUrl: null },
  { id: "p10", name: "Five Roses / Rooibos",    category: "coffee",  price: 24, qty: 1000000, imageUrl: null },
  { id: "p11", name: "Juice",                   category: "drinks",  price: 35, qty: 1000000, imageUrl: "https://picsum.photos/seed/juice/400/300" },
  { id: "p12", name: "Still / Sparkling Water", category: "drinks",  price: 20, qty: 1000000, imageUrl: null },
  { id: "p13", name: "Soft Drinks",             category: "drinks",  price: 24, qty: 1000000, imageUrl: null },
  { id: "p14", name: "Croissant",               category: "food",    price: 40, qty: 1000000, imageUrl: "https://picsum.photos/seed/croissant/400/300" },
  { id: "p15", name: "Cheese Croissant",        category: "food",    price: 45, qty: 1000000, imageUrl: null },
  { id: "p16", name: "Muffin",                  category: "food",    price: 28, qty: 1000000, imageUrl: "https://picsum.photos/seed/muffin/400/300" },
  { id: "p17", name: "Scone with Jam & Cheese", category: "food",    price: 35, qty: 1000000, imageUrl: null },
  { id: "p18", name: "Banana Bread",            category: "food",    price: 25, qty: 1000000, imageUrl: null },
  { id: "p19", name: "Brownie",                 category: "food",    price: 38, qty: 1000000, imageUrl: "https://picsum.photos/seed/brownie/400/300" },
  { id: "p20", name: "Chocolate Croissant",     category: "food",    price: 45, qty: 1000000, imageUrl: null },
  { id: "p21", name: "Cheese Toasted Sandwich", category: "food",    price: 30, qty: 1000000, imageUrl: null },
  { id: "p22", name: "Ham & Cheese Toasted",    category: "food",    price: 38, qty: 1000000, imageUrl: null },
  { id: "p23", name: "Chicken Mayo Toasted",    category: "food",    price: 45, qty: 1000000, imageUrl: null },
  { id: "p24", name: "Cheese Griller Hotdog",   category: "food",    price: 35, qty: 1000000, imageUrl: null },
  { id: "p25", name: "Extra Shot",              category: "add-ons", price: 9,  qty: 1000000, imageUrl: null },
  { id: "p26", name: "Almond / Oat Milk",       category: "add-ons", price: 9,  qty: 1000000, imageUrl: null },
  { id: "p27", name: "Flavoured Syrup",         category: "add-ons", price: 9,  qty: 1000000, imageUrl: null, variants: ["Vanilla", "Caramel", "Hazelnut"] },
];

const BOOKINGS = [
  {
    id: "b1",
    customer: "Nandi Dlamini",
    workshop: "Dried Flower Wreath",
    attendees: 2,
    status: "confirmed",
    date: "2026-06-07",
    time: "10:00 – 12:30",
    phone: "+27 82 341 7823",
    total: 560,
  },
  {
    id: "b2",
    customer: "Pieter van der Merwe",
    workshop: "Seasonal Arrangement",
    attendees: 1,
    status: "pending",
    date: "2026-06-07",
    time: "14:00 – 16:00",
    phone: "+27 71 908 5541",
    total: 280,
  },
  {
    id: "b3",
    customer: "Amahle Khumalo-Sithole",
    workshop: "Pressed Botanical Art",
    attendees: 3,
    status: "partial",
    date: "2026-06-07",
    time: "09:00 – 11:30",
    phone: "+27 63 224 9107",
    total: 840,
  },
];

// ── Image upload helper component ─────────────────────────────────
function ImageUpload({ imageUrl, onImageChange }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(imageUrl || null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    onImageChange?.(file, url);
  }

  if (preview) {
    return (
      <div className="pos-img-preview">
        <img src={preview} alt="Product preview" />
        <button className="pos-img-preview-remove" onClick={() => { setPreview(null); onImageChange?.(null, null); }} type="button">
          <Icon name="x" size={13} />
        </button>
      </div>
    );
  }

  return (
    <label className="pos-img-upload">
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} />
      <span className="pos-img-upload-icon"><Icon name="upload" size={22} /></span>
      <span className="pos-img-upload-text">Click to upload a photo</span>
      <span className="pos-img-upload-sub">JPG, PNG or WEBP · up to 5 MB</span>
    </label>
  );
}

// ── Variant Selection Modal ───────────────────────────────────────
function VariantModal({ product, onAdd, onClose }) {
  return (
    <div className="pos-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="pos-modal-header">
          <h2 className="pos-modal-title">{product.name}</h2>
          <button className="pos-modal-close" onClick={onClose}><Icon name="x" size={15} /></button>
        </div>
        <div className="pos-modal-body">
          {(product.variants || []).map((v) => (
            <div key={v} className="pos-variant-row">
              <div className="pos-variant-info">
                <span className="pos-variant-label">{v}</span>
                <span className="pos-variant-meta">{fmt(product.price)} · In stock</span>
              </div>
              <button className="pos-variant-add-btn" onClick={() => { onAdd(product, v); onClose(); }}>
                Add
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Cash Up Modal ─────────────────────────────────────────────────
function CashUpModal({ onClose }) {
  const [unlocked, setUnlocked]   = useState(false);
  const [pin, setPin]             = useState("");
  const [date, setDate]           = useState(today);
  const [pinError, setPinError]   = useState(false);

  function handleUnlock(e) {
    e.preventDefault();
    if (pin.length < 4) { setPinError(true); return; }
    setUnlocked(true);
    setPinError(false);
  }

  const stats = [
    { label: "Cash",             value: "R 1 240.00" },
    { label: "Card",             value: "R 3 820.00" },
    { label: "Retail Total",     value: "R 5 060.00" },
    { label: "Service Total",    value: "R 1 960.00" },
    { label: "EFT Paid",         value: "R   840.00" },
    { label: "EFT Outstanding",  value: "R   560.00" },
  ];

  return (
    <div className="pos-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--md" onClick={(e) => e.stopPropagation()}>
        <div className="pos-modal-header">
          <h2 className="pos-modal-title">{unlocked ? "Cash Up Summary" : "Cash Up"}</h2>
          <button className="pos-modal-close" onClick={onClose}><Icon name="x" size={15} /></button>
        </div>

        <div className="pos-modal-body">
          {!unlocked ? (
            <>
              <div className="pos-cashup-info">
                <div className="pos-cashup-info-icon"><Icon name="lock" size={22} /></div>
                <p className="pos-cashup-info-title">Enter your PIN to continue</p>
                <p className="pos-cashup-info-desc">
                  Review today&apos;s trading summary, reconcile your float, and close the day.
                </p>
              </div>
              <div className="pos-input-block">
                <label className="pos-input-label">Date</label>
                <input className="pos-input-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="pos-input-block">
                <label className="pos-input-label">Admin PIN</label>
                <input
                  className="pos-input-field"
                  type="password"
                  placeholder="········"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setPinError(false); }}
                  style={pinError ? { borderColor: "var(--p-error)" } : {}}
                />
                {pinError && <span style={{ fontSize: "0.78rem", color: "var(--p-error)" }}>Enter at least 4 digits.</span>}
              </div>
              <button className="pos-btn-primary" onClick={handleUnlock}>
                Unlock Cash Up
              </button>
            </>
          ) : (
            <>
              <div className="pos-cashup-date-display">
                <span className="pos-cashup-date-label">Trading Date</span>
                <span className="pos-cashup-date-value">{new Date(date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>

              <div className="pos-cashup-stats">
                {stats.map((s) => (
                  <div key={s.label} className="pos-cashup-stat">
                    <span className="pos-cashup-stat-label">{s.label}</span>
                    <span className="pos-cashup-stat-value">{s.value}</span>
                  </div>
                ))}
              </div>

              <div className="pos-cashup-summary">
                <div>
                  <div className="pos-cashup-summary-label">Collected Total</div>
                  <div className="pos-cashup-summary-count">17 transactions</div>
                </div>
                <span className="pos-cashup-summary-total">R 7 020</span>
              </div>

              <div className="pos-cashup-pending">
                <div>
                  <div className="pos-cashup-pending-label">Amount Still To Be Paid</div>
                </div>
                <span className="pos-cashup-pending-total">R 560</span>
              </div>

              <div className="pos-cashup-actions">
                <button className="pos-btn-ghost" onClick={onClose}>Close</button>
                <button className="pos-cashup-confirm-btn" onClick={onClose}>Confirm Cash Up</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cart Component (shared between sidebar & mobile drawer) ───────
function PosCart({ cartItems, onQtyChange, onRemove, bookingLine, onRemoveBooking, asModal = false }) {
  const [payMode, setPayMode]       = useState(null);
  const [cash, setCash]             = useState("");

  const subtotal    = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const serviceTotal = bookingLine ? bookingLine.services.reduce((s, sv) => s + sv.price, 0) : 0;
  const total       = subtotal + serviceTotal;
  const hasItems    = cartItems.length > 0 || !!bookingLine;
  const cashNum     = parseFloat(cash) || 0;
  const change      = cashNum - total;

  return (
    <div className="pos-cart" style={asModal ? { borderRadius: 0, border: "none", boxShadow: "none" } : {}}>
      {/* Header */}
      <div className="pos-cart-header">
        <div>
          <p className="pos-cart-title">POS Cart</p>
          <p className="pos-cart-count">
            {cartItems.length === 0 && !bookingLine
              ? "No items"
              : `${cartItems.length} item${cartItems.length !== 1 ? "s" : ""}${bookingLine ? " + booking" : ""}`}
          </p>
        </div>
        <span className="pos-cart-subtotal">{fmt(total)}</span>
      </div>

      {/* Active booking block */}
      {bookingLine && (
        <div className="pos-booking-block">
          <div className="pos-booking-block-top">
            <p className="pos-booking-block-name">{bookingLine.customer}</p>
            <button className="pos-remove-btn" onClick={onRemoveBooking}><Icon name="x" size={13} /></button>
          </div>
          <div className="pos-booking-block-detail">
            <div className="pos-booking-block-row">
              <span className="pos-booking-block-label">Workshop</span>
              <span className="pos-booking-block-value">{bookingLine.workshop}</span>
            </div>
            <div className="pos-booking-block-row">
              <span className="pos-booking-block-label">Slot</span>
              <span className="pos-booking-block-value">{bookingLine.time}</span>
            </div>
            <div className="pos-booking-block-row">
              <span className="pos-booking-block-label">Attendees</span>
              <span className="pos-booking-block-value">{bookingLine.attendees}</span>
            </div>
          </div>
        </div>
      )}

      {/* Item list */}
      {!hasItems ? (
        <div className="pos-cart-empty">
          <div className="pos-cart-empty-icon"><Icon name="cart" size={22} /></div>
          <p className="pos-cart-empty-title">Cart is empty</p>
          <p className="pos-cart-empty-sub">Tap a product or booking to add it</p>
        </div>
      ) : (
        <div className="pos-item-list">
          {/* Service line items from booking */}
          {bookingLine?.services.map((sv) => (
            <div key={sv.id} className="pos-service-item">
              <div className="pos-service-item-left">
                <div className="pos-service-icon"><Icon name="leaf" size={14} /></div>
                <div>
                  <div className="pos-service-name">{sv.name}</div>
                  {sv.variant && <div className="pos-service-variant">{sv.variant}</div>}
                </div>
              </div>
              <span className="pos-service-price">{fmt(sv.price)}</span>
            </div>
          ))}

          {/* Retail items */}
          {cartItems.map((item) => (
            <div key={item.lineId} className="pos-retail-item">
              <div className="pos-retail-item-upper">
                <div className="pos-retail-item-info">
                  <span className="pos-retail-item-name">{item.name}</span>
                  {item.variant && <span className="pos-retail-item-variant">{item.variant}</span>}
                  <span className="pos-retail-item-unit">{fmt(item.price)} each</span>
                </div>
                <button className="pos-trash-btn" onClick={() => onRemove(item.lineId)}>
                  <Icon name="trash" size={13} stroke={1.75} />
                </button>
              </div>
              <div className="pos-retail-item-lower">
                <div className="pos-qty-controls">
                  <button className="pos-qty-btn" onClick={() => onQtyChange(item.lineId, -1)} disabled={item.qty <= 1}>
                    <Icon name="minus" size={13} />
                  </button>
                  <span className="pos-qty-num">{item.qty}</span>
                  <button className="pos-qty-btn" onClick={() => onQtyChange(item.lineId, 1)}>
                    <Icon name="plus" size={13} />
                  </button>
                </div>
                <span className="pos-line-total">{fmt(item.price * item.qty)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment footer */}
      <div className="pos-payment-footer">
        {/* Cash panel */}
        {payMode === "cash" && (
          <div className="pos-cash-panel">
            <div className="pos-cash-panel-header">
              <span className="pos-cash-panel-label">Cash tendered</span>
              <span className="pos-cash-panel-due">{fmt(total)} due</span>
            </div>
            <div className="pos-currency-wrap">
              <span className="pos-currency-sym">R</span>
              <input
                className="pos-currency-input"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
              />
            </div>
            {cash && cashNum >= total && (
              <div className="pos-change-row">
                <span className="pos-change-label">Change due</span>
                <span className="pos-change-amount">{fmt(change)}</span>
              </div>
            )}
            {cash && cashNum < total && (
              <p className="pos-insufficient">Short by {fmt(total - cashNum)}</p>
            )}
          </div>
        )}

        {/* Payment buttons */}
        <button
          className="pos-pay-btn pos-pay-btn--cash"
          disabled={!hasItems}
          onClick={() => setPayMode(payMode === "cash" ? null : "cash")}
        >
          <Icon name="cash" size={18} />
          {payMode === "cash" ? "Confirm Cash Payment" : "Charge Cash"}
        </button>
        <button
          className="pos-pay-btn pos-pay-btn--card"
          disabled={!hasItems}
          onClick={() => setPayMode(null)}
        >
          <Icon name="creditCard" size={18} />
          Charge Card
        </button>
      </div>
    </div>
  );
}

// ── Mobile Cart Drawer ────────────────────────────────────────────
function MobileCartDrawer({ onClose, ...cartProps }) {
  return (
    <div className="pos-overlay" onClick={onClose}>
      <div
        className="pos-modal pos-modal--md"
        style={{ maxHeight: "calc(100dvh - 24px)", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <PosCart {...cartProps} asModal />
      </div>
    </div>
  );
}

// ── Manage Product Modal (image upload) ───────────────────────────
function ManageProductModal({ onClose }) {
  const [form, setForm]         = useState({ name: "", category: "coffee", price: "", qty: "1000000" });
  const [imgFile, setImgFile]   = useState(null);
  const [imgPreview, setImgPreview] = useState(null);

  return (
    <div className="pos-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="pos-modal-header">
          <h2 className="pos-modal-title">Add POS Product</h2>
          <button className="pos-modal-close" onClick={onClose}><Icon name="x" size={15} /></button>
        </div>
        <div className="pos-modal-body">
          <div className="pos-input-block">
            <label className="pos-input-label">Product Photo</label>
            <ImageUpload
              imageUrl={imgPreview}
              onImageChange={(file, url) => { setImgFile(file); setImgPreview(url); }}
            />
          </div>
          <div className="pos-input-block">
            <label className="pos-input-label">Name</label>
            <input className="pos-input-field" type="text" placeholder="e.g. Cappuccino" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="pos-input-block">
            <label className="pos-input-label">Category</label>
            <select className="pos-input-field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={{ color: "var(--p-t1)", background: "var(--p-card)", cursor: "pointer" }}>
              <option value="coffee">Coffee</option>
              <option value="drinks">Drinks</option>
              <option value="food">Food</option>
              <option value="add-ons">Add-ons</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            <div className="pos-input-block">
              <label className="pos-input-label">Price (R)</label>
              <input className="pos-input-field" type="number" inputMode="decimal" placeholder="0.00" value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="pos-input-block">
              <label className="pos-input-label">Stock Qty</label>
              <input className="pos-input-field" type="number" inputMode="numeric" placeholder="1000000" value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
          </div>
          <button className="pos-btn-primary" style={{ marginTop: 4 }} onClick={onClose}>
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
let lineIdCounter = 100;

export default function PosDesign() {
  const [activeTab, setActiveTab]         = useState("all");
  const [search, setSearch]               = useState("");
  const [bookingDate, setBookingDate]     = useState(today);
  const [cartItems, setCartItems]         = useState([
    { lineId: "l1", id: "p1", name: "Double Shot Espresso", price: 28, qty: 2 },
    { lineId: "l2", id: "p14", name: "Croissant",           price: 40, qty: 1 },
  ]);
  const [bookingLine, setBookingLine]     = useState(null);
  const [variantModal, setVariantModal]   = useState(null);
  const [showCashUp, setShowCashUp]       = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showManageProduct, setShowManageProduct] = useState(false);

  // Filtering
  const filtered = PRODUCTS.filter((p) => {
    if (activeTab === "services" || activeTab === "bookings") return false;
    const matchesTab = activeTab === "all" || p.category === activeTab;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  function addToCart(product, variant = null) {
    const key = product.id + (variant || "");
    const exists = cartItems.find((i) => i.id === product.id && i.variant === variant);
    if (exists) {
      setCartItems((prev) => prev.map((i) =>
        i.id === product.id && i.variant === variant ? { ...i, qty: i.qty + 1 } : i
      ));
    } else {
      lineIdCounter++;
      setCartItems((prev) => [...prev, {
        lineId: `l${lineIdCounter}`,
        id: product.id,
        name: product.name + (variant ? ` — ${variant}` : ""),
        variant: variant || null,
        price: product.price,
        qty: 1,
      }]);
    }
  }

  function handleProductTap(product) {
    if (product.variants?.length) { setVariantModal(product); return; }
    addToCart(product);
  }

  function handleBookingTap(booking) {
    setBookingLine({
      ...booking,
      services: [{ id: "sv1", name: booking.workshop, variant: `${booking.attendees} attendee${booking.attendees !== 1 ? "s" : ""}`, price: booking.total }],
    });
  }

  function handleQtyChange(lineId, delta) {
    setCartItems((prev) =>
      prev.map((i) => i.lineId === lineId ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    );
  }
  function handleRemove(lineId) { setCartItems((prev) => prev.filter((i) => i.lineId !== lineId)); }

  const cartProps = { cartItems, onQtyChange: handleQtyChange, onRemove: handleRemove, bookingLine, onRemoveBooking: () => setBookingLine(null) };
  const cartTotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0) + (bookingLine?.total ?? 0);
  const hasCart   = cartItems.length > 0 || !!bookingLine;

  const showingBookings  = activeTab === "bookings";
  const showingServices  = activeTab === "services";
  const isDateToday      = bookingDate === today;

  return (
    <div className="pos-root">
      <div className="pos-layout">

        {/* ── LEFT COLUMN ── */}
        <div className="pos-catalog">

          {/* Page header */}
          <div className="pos-page-header">
            <div className="pos-page-header-left">
              <h1 className="pos-page-title">Point of Sale</h1>
              <p className="pos-page-subtitle">Bethany Blooms Studio · {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}</p>
            </div>
            <button className="pos-cashup-btn" onClick={() => setShowCashUp(true)}>
              <Icon name="tag" size={15} />
              Perform Cash Up
            </button>
          </div>

          {/* Tab strip */}
          <div className="pos-tabs">
            <div className="pos-tab-row">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`pos-pill${activeTab === t.id ? " pos-pill--active" : ""}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
              <button className="pos-pill" onClick={() => setShowManageProduct(true)}>
                + Manage Products
              </button>
            </div>

            {/* Sub-tabs for services */}
            {showingServices && (
              <div className="pos-tab-row pos-tab-row--sub">
                {["All services", "Workshops", "Classes", "Events"].map((sub) => (
                  <button key={sub} className="pos-pill pos-pill--sub pos-pill--active">{sub}</button>
                ))}
              </div>
            )}

            {/* Booking date controls */}
            {showingBookings && (
              <div className="pos-booking-controls">
                <p className="pos-booking-info">Showing open bookings for the selected date.</p>
                <p className="pos-booking-info">Select a booking to attach it to the current sale.</p>
                <div className="pos-date-row">
                  <input
                    className="pos-date-input"
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                  />
                  {!isDateToday && (
                    <button className="pos-today-btn" onClick={() => setBookingDate(today)}>Today</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          {!showingBookings && (
            <div className="pos-search-wrap">
              <span className="pos-search-icon"><Icon name="search" size={16} /></span>
              <input
                className="pos-search"
                type="search"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}

          {/* Grid */}
          <div className="pos-grid-wrap">
            {showingBookings ? (
              <div className="pos-grid">
                {BOOKINGS.map((b) => (
                  <button key={b.id} className="pos-booking-card" onClick={() => handleBookingTap(b)}>
                    <div className="pos-booking-top">
                      <div className="pos-booking-icon-box"><Icon name="leaf" size={20} /></div>
                      <span className={`pos-status-badge pos-status-badge--${b.status}`}>{b.status}</span>
                    </div>
                    <div className="pos-booking-body">
                      <span className="pos-booking-name">{b.customer}</span>
                      <details className="pos-booking-details">
                        <summary>
                          {b.attendees} attendee{b.attendees !== 1 ? "s" : ""}
                          <Icon name="chevDown" size={13} />
                        </summary>
                        <div className="pos-booking-details-body">
                          <div className="pos-booking-meta">
                            <div className="pos-booking-meta-row"><Icon name="scissors" size={12} />{b.workshop}</div>
                          </div>
                        </div>
                      </details>
                      <div className="pos-booking-meta">
                        <div className="pos-booking-meta-row"><Icon name="calendar" size={12} />{new Date(b.date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}</div>
                        <div className="pos-booking-meta-row"><Icon name="phone" size={12} />{b.phone}</div>
                        <div className="pos-booking-meta-row"><Icon name="clock" size={12} />{b.time}</div>
                      </div>
                    </div>
                    <div className="pos-booking-footer">
                      <span className="pos-booking-total">{fmt(b.total)}</span>
                      <span className="pos-booking-add-btn" role="presentation"><Icon name="plus" size={15} /></span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="pos-grid">
                {filtered.length === 0 ? (
                  <div className="pos-empty">
                    <div className="pos-empty-icon"><Icon name="search" size={22} /></div>
                    <p className="pos-empty-title">No products found</p>
                    <p className="pos-empty-sub">Try a different search or category</p>
                  </div>
                ) : (
                  filtered.map((p) => {
                    const oos = p.qty <= 0;
                    return (
                      <button
                        key={p.id}
                        className={`pos-product-card${oos ? " pos-product-card--oos" : ""}`}
                        onClick={() => !oos && handleProductTap(p)}
                        disabled={oos}
                      >
                        <div className="pos-product-img">
                          {p.imageUrl
                            ? <img src={p.imageUrl} alt={p.name} />
                            : <span className="pos-product-letter">{p.name.charAt(0).toUpperCase()}</span>
                          }
                          {(oos || p.variants) && (
                            <span className={`pos-product-badge${oos ? " pos-product-badge--oos" : ""}`}>
                              {oos ? "OOS" : "VAR"}
                            </span>
                          )}
                        </div>
                        <div className="pos-product-body">
                          <span className="pos-product-name">{p.name}</span>
                          <span className="pos-product-price">{fmt(p.price)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN — Cart ── */}
        <div className="pos-cart-col">
          <PosCart {...cartProps} />
        </div>
      </div>

      {/* ── Mobile bottom bar ── */}
      <div className="pos-mobile-bar">
        <button
          className="pos-mobile-bar-btn"
          disabled={!hasCart}
          onClick={() => setShowMobileCart(true)}
        >
          <span className="pos-mobile-bar-left">
            <Icon name="cart" size={18} />
            Continue
          </span>
          <span className="pos-mobile-bar-right">
            {!hasCart ? "Cart empty" : bookingLine && cartItems.length === 0 ? "Booking" : fmt(cartTotal)}
          </span>
        </button>
      </div>

      {/* ── Modals ── */}
      {variantModal && (
        <VariantModal
          product={variantModal}
          onAdd={addToCart}
          onClose={() => setVariantModal(null)}
        />
      )}
      {showCashUp && <CashUpModal onClose={() => setShowCashUp(false)} />}
      {showMobileCart && <MobileCartDrawer onClose={() => setShowMobileCart(false)} {...cartProps} />}
      {showManageProduct && <ManageProductModal onClose={() => setShowManageProduct(false)} />}
    </div>
  );
}
