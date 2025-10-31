import { useEffect, useRef } from "react";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";

const currency = (value) => `R${value}`;

function CartModal() {
  const { items, removeItem, totalPrice } = useCart();
  const { isCartOpen, closeCart } = useModal();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (isCartOpen) {
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [isCartOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && isCartOpen) {
        closeCart();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isCartOpen, closeCart]);

  return (
    <div
      className={`modal ${isCartOpen ? "is-active" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={isCartOpen ? "false" : "true"}
      aria-labelledby="cart-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeCart();
      }}
    >
      <div className="modal__content">
        <button
          ref={closeButtonRef}
          className="modal__close"
          type="button"
          onClick={closeCart}
          aria-label="Close cart"
        >
          &times;
        </button>
        <h2 className="modal__title" id="cart-title">
          Your Cart
        </h2>
        {items.length === 0 ? (
          <p className="empty-state">Your cart is currently empty. Add a DIY kit to begin crafting.</p>
        ) : (
          <ul className="modal__list">
            {items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.name}
                  <span className="badge">x{item.quantity}</span>
                </span>
                <span>
                  {currency(item.price * item.quantity)}
                  <button
                    className="remove-btn"
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.name} from cart`}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p>
          <strong>Total:</strong> <span>{currency(totalPrice)}</span>
        </p>
        <button className="btn btn--primary" type="button">
          Checkout (Demo)
        </button>
      </div>
    </div>
  );
}

export default CartModal;
