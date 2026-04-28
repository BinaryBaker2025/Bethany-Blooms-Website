import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext.jsx";
import { useModal } from "../context/ModalContext.jsx";
import {
  buildDirectProductCartItem,
  canDirectAddProductToCart,
  isGiftCardProduct,
  productHasVariants,
} from "../lib/productCart.js";

const CartIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M6 6h15l-1.6 8.4a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.6L5.1 3H2" />
    <circle cx="9.5" cy="20" r="1.2" />
    <circle cx="17.5" cy="20" r="1.2" />
  </svg>
);

const resolveCartType = (entry) => {
  if (!entry) return null;
  if (entry.metadata?.type === "workshop") return "workshop";
  return entry.itemType || "product";
};

function ProductCardActions({ product, productUrl, viewLabel = "View more" }) {
  const { items, addItem } = useCart();
  const { notifyCart } = useModal();
  const hasVariants = productHasVariants(product);
  const isGiftCard = isGiftCardProduct(product);
  const canDirectAdd = canDirectAddProductToCart(product);
  const viewText = product?.isSubscriptionPlan ? "Choose plan" : viewLabel;

  const handleAddToCart = () => {
    const cartItem = buildDirectProductCartItem(product);
    if (!cartItem) {
      notifyCart("Open the product details to choose options.");
      return;
    }

    const existingType = resolveCartType(items[0]);
    if (existingType && existingType !== "product") {
      notifyCart(
        "You can only have workshops or products in your cart at one time. Clear your cart to switch.",
      );
      return;
    }

    const stockQuantity = cartItem.metadata?.stockQuantity;
    const existingItem = items.find((entry) => entry.id === cartItem.id);
    const existingQuantity = Number(existingItem?.quantity) || 0;
    if (Number.isFinite(stockQuantity) && existingQuantity >= stockQuantity) {
      notifyCart(`Only ${stockQuantity} available for this item.`);
      return;
    }

    addItem(cartItem);
    notifyCart("Item added to cart");
  };

  return (
    <div className="product-card__purchase">
      {hasVariants && (
        <p className="product-card__variant-note">Variants available</p>
      )}
      {isGiftCard && !hasVariants && (
        <p className="product-card__variant-note">Options available</p>
      )}
      <div className="product-card__actions">
        <Link className="btn btn--secondary product-card__details-link" to={productUrl}>
          {viewText}
        </Link>
        {canDirectAdd && (
          <button
            className="btn btn--primary product-card__cart-button"
            type="button"
            onClick={handleAddToCart}
            aria-label={`Add ${product?.title || product?.name || "product"} to cart`}
            title="Add to cart"
          >
            <CartIcon />
          </button>
        )}
      </div>
    </div>
  );
}

export default ProductCardActions;
