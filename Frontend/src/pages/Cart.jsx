import { useEffect, useState } from "react";
import ProductImage from "../components/ProductImage";
import Spinner from "../components/Spinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import { getCart, updateCartItem, removeCartItem, clearCart } from "../services/cartService";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { navigate } from "../utils/router";

const money = (value) => `$${Number(value).toFixed(2)}`;
const TAX_RATE = 0.15; // Kept in sync with the checkout summary shown before payment.

export default function Cart() {
  const { refreshCartCount } = useCart();
  const { showToast } = useToast();
  const [cart, setCart] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [busyProductId, setBusyProductId] = useState(null);

  function load() {
    setStatus("loading");
    getCart()
      .then((data) => { setCart(data); setStatus("ready"); })
      .catch((requestError) => { setError(requestError.message); setStatus("error"); });
  }

  useEffect(load, []);

  async function handleQuantityChange(productId, nextQuantity) {
    if (nextQuantity < 1) return;
    setBusyProductId(productId);
    try {
      await updateCartItem(productId, nextQuantity);
      load();
      refreshCartCount();
    } catch (requestError) {
      showToast(requestError.message, "error");
    } finally {
      setBusyProductId(null);
    }
  }

  async function handleRemove(productId) {
    setBusyProductId(productId);
    try {
      await removeCartItem(productId);
      load();
      refreshCartCount();
      showToast("Item removed from cart");
    } catch (requestError) {
      showToast(requestError.message, "error");
    } finally {
      setBusyProductId(null);
    }
  }

  async function handleClear() {
    try {
      await clearCart();
      load();
      refreshCartCount();
    } catch (requestError) {
      showToast(requestError.message, "error");
    }
  }

  if (status === "loading") return <Spinner label="Loading your cart…" />;
  if (status === "error") return <ErrorState message={error} onRetry={load} />;

  const items = cart?.items || [];
  if (items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Browse the catalogue and add something you like."
        action={<button onClick={() => navigate("/")}>Browse products</button>}
      />
    );
  }

  const subtotal = Number(cart.total);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  return (
    <section className="cart-page">
      <div className="products-heading">
        <div><p className="eyebrow">Your cart</p><h1>Shopping cart</h1></div>
        <button className="text-button" onClick={handleClear}>Clear cart</button>
      </div>

      <div className="cart-layout">
        <ul className="cart-item-list">
          {items.map((item) => (
            <li key={item.cart_item_id} className="cart-item">
              <ProductImage src={item.image} alt={item.product_name} />
              <div className="cart-item-info">
                <h3>{item.product_name}</h3>
                <p className="cart-item-price">{money(item.price)} each</p>
              </div>
              <div className="quantity-stepper">
                <button
                  onClick={() => handleQuantityChange(item.product_id, item.quantity - 1)}
                  disabled={busyProductId === item.product_id || item.quantity <= 1}
                >−</button>
                <span>{item.quantity}</span>
                <button
                  onClick={() => handleQuantityChange(item.product_id, item.quantity + 1)}
                  disabled={busyProductId === item.product_id}
                >+</button>
              </div>
              <strong className="cart-item-subtotal">{money(item.subtotal)}</strong>
              <button className="text-button remove-link" onClick={() => handleRemove(item.product_id)} disabled={busyProductId === item.product_id}>
                Remove
              </button>
            </li>
          ))}
        </ul>

        <aside className="order-summary">
          <h2>Order summary</h2>
          <div className="summary-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="summary-row"><span>Tax (15%)</span><span>{money(tax)}</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{money(total)}</span></div>
          <button className="checkout-btn" onClick={() => navigate("/checkout")}>Proceed to checkout</button>
        </aside>
      </div>
    </section>
  );
}
