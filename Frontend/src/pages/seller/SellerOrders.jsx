import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import ErrorState from "../../components/ErrorState";
import EmptyState from "../../components/EmptyState";
import StatusBadge from "../../components/StatusBadge";
import { getSellerOrders, updateSellerOrderStatus } from "../../services/sellerService";
import { useToast } from "../../context/ToastContext";

const money = (value) => `$${Number(value).toFixed(2)}`;
const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// Mirrors the backend's allowed seller-initiated transitions in sellerController.js.
const NEXT_STATUS = { Pending: "Processing", Processing: "Shipped", Shipped: "Delivered" };

export default function SellerOrders() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  function load() {
    setStatus("loading");
    getSellerOrders()
      .then((data) => { setOrders(Array.isArray(data) ? data : []); setStatus("ready"); })
      .catch((requestError) => { setError(requestError.message); setStatus("error"); });
  }

  useEffect(load, []);

  async function handleAdvance(order) {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;
    setUpdatingId(order.order_id);
    try {
      await updateSellerOrderStatus(order.order_id, nextStatus);
      showToast(`Order #${order.order_id} marked as ${nextStatus}`);
      load();
    } catch (requestError) {
      showToast(requestError.message, "error");
    } finally {
      setUpdatingId(null);
    }
  }

  if (status === "loading") return <Spinner label="Loading orders…" />;
  if (status === "error") return <ErrorState message={error} onRetry={load} />;
  if (orders.length === 0) return <EmptyState title="No orders yet" description="Orders containing your products will show up here." />;

  return (
    <section className="seller-orders-page">
      <p className="eyebrow">Fulfilment</p>
      <h1>Customer orders</h1>

      <ul className="order-list">
        {orders.map((order) => {
          const nextStatus = NEXT_STATUS[order.status];
          return (
            <li key={order.order_id} className="order-card seller-order-card">
              <div className="order-card-head">
                <div>
                  <strong>Order #{order.order_id}</strong>
                  <p className="hint">{formatDate(order.order_date)} · {order.customer.name} ({order.customer.email})</p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <ul className="simple-list">
                {order.items.map((item) => (
                  <li key={item.order_item_id}>
                    <span>{item.product_name} × {item.quantity}</span>
                    <span>{money(item.subtotal)}</span>
                  </li>
                ))}
              </ul>

              <div className="order-card-foot">
                <span className="hint">Shipping to: {order.shipping_address}</span>
                {nextStatus ? (
                  <button onClick={() => handleAdvance(order)} disabled={updatingId === order.order_id}>
                    {updatingId === order.order_id ? "Updating…" : `Mark as ${nextStatus}`}
                  </button>
                ) : (
                  <span className="hint">No further action available.</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
