import { useEffect, useMemo, useState } from "react";
import Spinner from "../../components/Spinner";
import ErrorState from "../../components/ErrorState";
import StatusBadge from "../../components/StatusBadge";
import { getSellerProducts, getSellerOrders } from "../../services/sellerService";
import { navigate } from "../../utils/router";

const money = (value) => `$${Number(value).toFixed(2)}`;
const LOW_STOCK_THRESHOLD = 5;

export default function SellerDashboard() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getSellerProducts(), getSellerOrders()])
      .then(([productData, orderData]) => {
        setProducts(Array.isArray(productData) ? productData : []);
        setOrders(Array.isArray(orderData) ? orderData : []);
        setStatus("ready");
      })
      .catch((requestError) => { setError(requestError.message); setStatus("error"); });
  }, []);

  // Revenue attributed to this seller: sum of their own item subtotals
  // within each order (an order can include other sellers' items too).
  const stats = useMemo(() => {
    const lowStock = products.filter((p) => Number(p.stock) <= LOW_STOCK_THRESHOLD);
    const pendingOrders = orders.filter((o) => o.status === "Pending" || o.status === "Processing");
    const grossRevenue = orders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + Number(item.subtotal), 0), 0);
    return { lowStock, pendingOrders, grossRevenue };
  }, [products, orders]);

  if (status === "loading") return <Spinner label="Loading your dashboard…" />;
  if (status === "error") return <ErrorState message={error} />;

  return (
    <section className="seller-dashboard">
      <p className="eyebrow">Seller</p>
      <h1>Dashboard overview</h1>

      <div className="stat-grid">
        <div className="stat-card"><span className="stat-label">Products listed</span><strong>{products.length}</strong></div>
        <div className="stat-card"><span className="stat-label">Gross revenue</span><strong>{money(stats.grossRevenue)}</strong></div>
        <div className="stat-card"><span className="stat-label">Orders to fulfil</span><strong>{stats.pendingOrders.length}</strong></div>
        <div className="stat-card warn"><span className="stat-label">Low stock items</span><strong>{stats.lowStock.length}</strong></div>
      </div>

      <div className="dashboard-columns">
        <div className="dashboard-panel">
          <div className="panel-head"><h2>Low stock alerts</h2><button className="text-button" onClick={() => navigate("/seller/products")}>Manage products</button></div>
          {stats.lowStock.length === 0 ? <p className="subtext">All products are well stocked.</p> : (
            <ul className="simple-list">
              {stats.lowStock.map((p) => (
                <li key={p.product_id}>
                  <span>{p.name}</span>
                  <span className="out-of-stock">{p.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dashboard-panel">
          <div className="panel-head"><h2>Recent orders</h2><button className="text-button" onClick={() => navigate("/seller/orders")}>View all</button></div>
          {orders.length === 0 ? <p className="subtext">No orders yet.</p> : (
            <ul className="simple-list">
              {orders.slice(0, 6).map((order) => (
                <li key={order.order_id}>
                  <span>Order #{order.order_id} · {order.customer.name}</span>
                  <StatusBadge status={order.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
