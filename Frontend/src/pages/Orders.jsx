import { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { getOrders } from "../services/orderService";
import { navigate } from "../utils/router";

const money = (value) => `$${Number(value).toFixed(2)}`;
const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    getOrders()
      .then((data) => { setOrders(Array.isArray(data) ? data : []); setStatus("ready"); })
      .catch((requestError) => { setError(requestError.message); setStatus("error"); });
  }, []);

  if (status === "loading") return <Spinner label="Loading your orders…" />;
  if (status === "error") return <ErrorState message={error} />;
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Once you place an order, it will show up here with live status tracking."
        action={<button onClick={() => navigate("/")}>Browse products</button>}
      />
    );
  }

  return (
    <section className="orders-page">
      <p className="eyebrow">Purchase history</p>
      <h1>Your orders</h1>

      <ul className="order-list">
        {orders.map((order) => (
          <li key={order.order_id} className="order-card" onClick={() => navigate(`/orders/${order.order_id}`)}>
            <div className="order-card-head">
              <div>
                <strong>Order #{order.order_id}</strong>
                <p className="hint">{formatDate(order.order_date)} · {order.items.length} item{order.items.length === 1 ? "" : "s"}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>
            <p className="order-card-total">{money(order.total_amount)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
