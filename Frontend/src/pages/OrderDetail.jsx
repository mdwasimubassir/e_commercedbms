import { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import ErrorState from "../components/ErrorState";
import StatusBadge from "../components/StatusBadge";
import ProductImage from "../components/ProductImage";
import { getOrder, cancelOrder } from "../services/orderService";
import { useToast } from "../context/ToastContext";
import { navigate } from "../utils/router";

const money = (value) => `$${Number(value).toFixed(2)}`;
const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

const STEPS = ["Pending", "Processing", "Shipped", "Delivered"];

export default function OrderDetail({ orderId }) {
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  function load() {
    setStatus("loading");
    getOrder(orderId)
      .then((data) => { setOrder(data); setStatus("ready"); })
      .catch((requestError) => { setError(requestError.message); setStatus("error"); });
  }

  useEffect(load, [orderId]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelOrder(orderId);
      showToast("Order cancelled");
      load();
    } catch (requestError) {
      showToast(requestError.message, "error");
    } finally {
      setCancelling(false);
    }
  }

  if (status === "loading") return <Spinner label="Loading order…" />;
  if (status === "error") return <ErrorState message={error} onRetry={load} />;

  const currentStepIndex = STEPS.indexOf(order.status);

  return (
    <section className="order-detail-page">
      <button className="back-link" onClick={() => navigate("/orders")}>← Back to orders</button>

      <div className="products-heading">
        <div>
          <p className="eyebrow">Order #{order.order_id}</p>
          <h1>Placed on {formatDate(order.order_date)}</h1>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status === "Cancelled" ? (
        <p className="message error">This order was cancelled.</p>
      ) : (
        <ol className="order-tracker">
          {STEPS.map((step, index) => (
            <li key={step} className={index <= currentStepIndex ? "tracker-step done" : "tracker-step"}>
              <span className="tracker-dot" />
              {step}
            </li>
          ))}
        </ol>
      )}

      <ul className="order-item-list">
        {order.items.map((item) => (
          <li key={item.order_item_id} className="cart-item">
            <ProductImage src={item.product_image} alt={item.product_name} />
            <div className="cart-item-info">
              <h3>{item.product_name}</h3>
              <p className="cart-item-price">{money(item.price)} × {item.quantity}</p>
            </div>
            <strong className="cart-item-subtotal">{money(item.subtotal)}</strong>
          </li>
        ))}
      </ul>

      <aside className="order-summary">
        <h2>Order details</h2>
        <div className="summary-row"><span>Payment method</span><span>{order.payment_method}</span></div>
        <div className="summary-row"><span>Shipping address</span><span>{order.shipping_address}</span></div>
        <div className="summary-row summary-total"><span>Total</span><span>{money(order.total_amount)}</span></div>
        {order.status === "Pending" && (
          <button className="text-button remove-link" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel this order"}
          </button>
        )}
      </aside>
    </section>
  );
}
