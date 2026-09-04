import { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { getCart } from "../services/cartService";
import { createOrder } from "../services/orderService";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { navigate } from "../utils/router";

const money = (value) => `$${Number(value).toFixed(2)}`;
const TAX_RATE = 0.15;
const PAYMENT_METHODS = ["Credit Card", "Debit Card", "Cash on Delivery", "Mobile Banking"];

export default function Checkout() {
  const { refreshCartCount } = useCart();
  const { showToast } = useToast();

  const [cart, setCart] = useState(null);
  const [status, setStatus] = useState("loading");
  const [form, setForm] = useState({ shipping_address: "", payment_method: PAYMENT_METHODS[0] });
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    getCart()
      .then((data) => { setCart(data); setStatus("ready"); })
      .catch((requestError) => { setError(requestError.message); setStatus("error"); });
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!form.shipping_address.trim()) { setError("Please enter a shipping address."); return; }

    setPlacing(true);
    try {
      const result = await createOrder(form.payment_method, form.shipping_address.trim());
      refreshCartCount();
      showToast("Order placed!");
      navigate(`/orders/${result.order.order_id}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPlacing(false);
    }
  }

  if (status === "loading") return <Spinner label="Loading checkout…" />;
  if (status === "error") return <EmptyState title="Unable to load checkout" description={error} />;

  const items = cart?.items || [];
  if (items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add items to your cart before checking out."
        action={<button onClick={() => navigate("/")}>Browse products</button>}
      />
    );
  }

  const subtotal = Number(cart.total);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  return (
    <section className="checkout-page">
      <p className="eyebrow">Checkout</p>
      <h1>Confirm your order</h1>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={handleSubmit}>
          <label>
            Shipping address
            <textarea
              rows={3}
              placeholder="Street, city, postal code, country"
              value={form.shipping_address}
              onChange={(event) => setForm((f) => ({ ...f, shipping_address: event.target.value }))}
              required
            />
          </label>

          <fieldset className="payment-methods">
            <legend>Payment method</legend>
            {PAYMENT_METHODS.map((method) => (
              <label key={method} className={form.payment_method === method ? "role-option selected" : "role-option"}>
                <input
                  type="radio"
                  name="payment_method"
                  value={method}
                  checked={form.payment_method === method}
                  onChange={(event) => setForm((f) => ({ ...f, payment_method: event.target.value }))}
                />
                {method}
              </label>
            ))}
          </fieldset>

          {error && <p className="message error">{error}</p>}
          <button type="submit" disabled={placing}>{placing ? "Placing order…" : `Place order · ${money(subtotal)}`}</button>
          <p className="hint">Note: the order total charged is the item subtotal ({money(subtotal)}); the 15% tax shown below is an estimate for your reference and isn't added on the backend yet.</p>
        </form>

        <aside className="order-summary">
          <h2>Order summary</h2>
          <ul className="summary-item-list">
            {items.map((item) => (
              <li key={item.cart_item_id}>
                <span>{item.product_name} × {item.quantity}</span>
                <span>{money(item.subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="summary-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="summary-row"><span>Tax (15%, estimate)</span><span>{money(tax)}</span></div>
          <div className="summary-row summary-total"><span>Total (estimate)</span><span>{money(total)}</span></div>
        </aside>
      </div>
    </section>
  );
}
