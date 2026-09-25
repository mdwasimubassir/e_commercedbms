import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import ErrorState from "../../components/ErrorState";
import EmptyState from "../../components/EmptyState";
import {
  getAdminStats,
  getAdminProducts,
  pauseProduct,
  unpauseProduct,
  deleteProductSafely,
  getAllSellers,
  approveSeller,
  rejectSeller,
  suspendSeller,
  reactivateSeller,
  deleteSellerSafely,
  getDeliverymen,
  approveDeliveryman,
  rejectDeliveryman,
  suspendDeliveryman,
  reactivateDeliveryman,
  deleteDeliverymanSafely,
} from "../../services/adminService";
import { useToast } from "../../context/ToastContext";
import { useLiveSync } from "../../hooks/useLiveSync";

const money = (val) => `$${Number(val || 0).toFixed(2)}`;
const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : "—");

export default function AdminDashboard() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  // Data states
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [deliverymen, setDeliverymen] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & search
  const [prodFilter, setProdFilter] = useState("all");
  const [prodSearch, setProdSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [sellerSearch, setSellerSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState("all");

  // Modals / Action states
  const [confirmModal, setConfirmModal] = useState(null); // { type, id, name, details, onConfirm }
  const [suspendModal, setSuspendModal] = useState(null); // { entityType: 'seller'|'deliveryman', id, name }
  const [suspendDuration, setSuspendDuration] = useState("0"); // 0 = indefinite, 7, 14, 30
  const [actionInProgress, setActionInProgress] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statsData, prodsData, sellersData, driversData] = await Promise.all([
        getAdminStats(),
        getAdminProducts(),
        getAllSellers(),
        getDeliverymen(),
      ]);
      setStats(statsData);
      setProducts(Array.isArray(prodsData) ? prodsData : []);
      setSellers(Array.isArray(sellersData) ? sellersData : []);
      setDeliverymen(Array.isArray(driversData) ? driversData : []);
      setError("");
    } catch (err) {
      if (!silent) setError(err.message || "Failed to load admin data.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  // Automatic real-time live synchronization
  useLiveSync(
    ["stats_updated", "order_updated", "product_updated", "seller_updated", "deliveryman_updated"],
    () => {
      loadData(true);
    },
    4000
  );

  // --- Handlers: Product Administration ---
  const handlePauseProduct = async (prod) => {
    try {
      await pauseProduct(prod.product_id);
      showToast(`Product "${prod.name}" paused. It is now hidden from public listings.`);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleUnpauseProduct = async (prod) => {
    try {
      await unpauseProduct(prod.product_id);
      showToast(`Product "${prod.name}" reactivated. It is now available in the store.`);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const promptDeleteProduct = (prod) => {
    setConfirmModal({
      title: "Permanently Delete Product",
      message: `Are you sure you want to permanently delete "${prod.name}"? This action cannot be undone.`,
      warning:
        prod.order_count > 0
          ? "Warning: This product has associated orders. Deletion will be blocked to preserve historical orders. Please pause it instead."
          : "Safe to delete: No orders depend on this product.",
      onConfirm: async () => {
        setActionInProgress(true);
        try {
          await deleteProductSafely(prod.product_id);
          showToast(`Product "${prod.name}" deleted successfully.`);
          setConfirmModal(null);
          loadData(true);
        } catch (e) {
          showToast(e.message, "error");
        } finally {
          setActionInProgress(false);
        }
      },
    });
  };

  // --- Handlers: Seller Administration ---
  const handleSellerApprove = async (s) => {
    try {
      await approveSeller(s.seller_id);
      showToast(`Seller "${s.name}" approved.`);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleSellerReject = async (s) => {
    try {
      await rejectSeller(s.seller_id);
      showToast(`Seller "${s.name}" rejected.`);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleSellerReactivate = async (s) => {
    try {
      await reactivateSeller(s.seller_id);
      showToast(`Seller "${s.name}" reactivated.`);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const promptSuspendSeller = (s) => {
    setSuspendModal({
      entityType: "seller",
      id: s.seller_id,
      name: s.name,
    });
    setSuspendDuration("0");
  };

  const submitSuspend = async () => {
    if (!suspendModal) return;
    setActionInProgress(true);
    const duration = Number(suspendDuration);
    try {
      if (suspendModal.entityType === "seller") {
        await suspendSeller(suspendModal.id, duration > 0 ? duration : null);
        showToast(
          `Seller "${suspendModal.name}" suspended ${duration > 0 ? `for ${duration} days` : "indefinitely"}.`
        );
      } else {
        await suspendDeliveryman(suspendModal.id, duration > 0 ? duration : null);
        showToast(
          `Deliveryman "${suspendModal.name}" suspended ${duration > 0 ? `for ${duration} days` : "indefinitely"}.`
        );
      }
      setSuspendModal(null);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setActionInProgress(false);
    }
  };

  const promptDeleteSeller = (s) => {
    setConfirmModal({
      title: "Permanently Delete Seller",
      message: `Are you sure you want to permanently delete seller "${s.name}" (${s.email})?`,
      warning:
        s.product_count > 0
          ? "Check: If this seller has products with customer orders, deletion will be safely rejected to prevent database corruption."
          : "Seller has no products. Safe to delete.",
      onConfirm: async () => {
        setActionInProgress(true);
        try {
          await deleteSellerSafely(s.seller_id);
          showToast(`Seller "${s.name}" permanently deleted.`);
          setConfirmModal(null);
          loadData(true);
        } catch (e) {
          showToast(e.message, "error");
        } finally {
          setActionInProgress(false);
        }
      },
    });
  };

  // --- Handlers: Deliveryman Administration ---
  const handleDriverApprove = async (d) => {
    try {
      await approveDeliveryman(d.deliveryman_id);
      showToast(`Deliveryman "${d.name}" approved.`);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleDriverReject = async (d) => {
    try {
      await rejectDeliveryman(d.deliveryman_id);
      showToast(`Deliveryman "${d.name}" rejected.`);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleDriverReactivate = async (d) => {
    try {
      await reactivateDeliveryman(d.deliveryman_id);
      showToast(`Deliveryman "${d.name}" reactivated.`);
      loadData(true);
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const promptSuspendDriver = (d) => {
    setSuspendModal({
      entityType: "deliveryman",
      id: d.deliveryman_id,
      name: d.name,
    });
    setSuspendDuration("0");
  };

  const promptDeleteDriver = (d) => {
    setConfirmModal({
      title: "Permanently Delete Deliveryman",
      message: `Are you sure you want to permanently delete "${d.name}"?`,
      warning: "Note: Deliverymen with order history cannot be deleted to maintain order records.",
      onConfirm: async () => {
        setActionInProgress(true);
        try {
          await deleteDeliverymanSafely(d.deliveryman_id);
          showToast(`Deliveryman "${d.name}" permanently deleted.`);
          setConfirmModal(null);
          loadData(true);
        } catch (e) {
          showToast(e.message, "error");
        } finally {
          setActionInProgress(false);
        }
      },
    });
  };

  if (loading) return <Spinner label="Loading admin dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={() => loadData(false)} />;

  // Filtered lists
  const filteredProducts = products.filter((p) => {
    if (prodFilter === "active" && p.status !== "active") return false;
    if (prodFilter === "paused" && p.status !== "paused") return false;
    if (prodSearch) {
      const q = prodSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.category_name.toLowerCase().includes(q) ||
        p.seller_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredSellers = sellers.filter((s) => {
    if (sellerFilter !== "all" && s.approval_status !== sellerFilter) return false;
    if (sellerSearch) {
      const q = sellerSearch.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredDrivers = deliverymen.filter((d) => {
    if (driverFilter !== "all" && d.approval_status !== driverFilter) return false;
    return true;
  });

  // Calculate highest sales day for chart scaling
  const maxSales = Math.max(...(stats?.sales_over_time?.map((s) => s.sales) || [1]), 100);

  return (
    <section className="admin-dashboard-container">
      <div className="admin-header-row">
        <div>
          <p className="eyebrow">Platform Administration</p>
          <h1>Admin Control Center</h1>
        </div>
        <div className="admin-header-badge">
          <span className="live-indicator-dot" /> Live Sync Active
        </div>
      </div>

      {/* Tabs */}
      <nav className="admin-tabs" role="tablist">
        <button
          className={`admin-tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          📊 Overview & Real-Time Stats
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "products" ? "active" : ""}`}
          onClick={() => setActiveTab("products")}
        >
          📦 Advanced: Products ({products.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "sellers" ? "active" : ""}`}
          onClick={() => setActiveTab("sellers")}
        >
          🏪 Advanced: Sellers ({sellers.length})
          {stats?.pending_seller_approvals > 0 && (
            <span className="tab-counter">{stats.pending_seller_approvals}</span>
          )}
        </button>
        <button
          className={`admin-tab-btn ${activeTab === "deliverymen" ? "active" : ""}`}
          onClick={() => setActiveTab("deliverymen")}
        >
          🚚 Advanced: Deliverymen ({deliverymen.length})
          {stats?.pending_deliveryman_approvals > 0 && (
            <span className="tab-counter">{stats.pending_deliveryman_approvals}</span>
          )}
        </button>
      </nav>

      {/* ==================================================== */}
      {/* TAB 1: OVERVIEW & REAL-TIME STATISTICS              */}
      {/* ==================================================== */}
      {activeTab === "overview" && stats && (
        <div className="admin-tab-content">
          {/* Top Key Metrics Grid */}
          <div className="stats-metric-grid">
            <div className="metric-card highlight">
              <span className="metric-label">Total Revenue</span>
              <strong className="metric-value">{money(stats.total_sales)}</strong>
              <span className="metric-sub">Today: {money(stats.sales_today)}</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Total Orders</span>
              <strong className="metric-value">{stats.total_orders}</strong>
              <span className="metric-sub">{stats.orders_today} placed today</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Registered Customers</span>
              <strong className="metric-value">{stats.total_customers}</strong>
              <span className="metric-sub">Active shoppers</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Sellers</span>
              <strong className="metric-value">{stats.total_sellers}</strong>
              <span className="metric-sub">
                {stats.active_sellers} Active · {stats.paused_sellers} Suspended
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Delivery Staff</span>
              <strong className="metric-value">{stats.total_deliverymen}</strong>
              <span className="metric-sub">{stats.active_deliverymen} Approved</span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Catalog Products</span>
              <strong className="metric-value">{stats.total_products}</strong>
              <span className="metric-sub">
                {stats.active_products} Active · {stats.paused_products} Paused
              </span>
            </div>

            <div className="metric-card alert">
              <span className="metric-label">Pending Approvals</span>
              <strong className="metric-value">
                {stats.pending_seller_approvals + stats.pending_deliveryman_approvals}
              </strong>
              <span className="metric-sub">
                {stats.pending_seller_approvals} Sellers · {stats.pending_deliveryman_approvals} Delivery
              </span>
            </div>

            <div className="metric-card">
              <span className="metric-label">Order Pipeline</span>
              <strong className="metric-value">{stats.pending_orders} Pending</strong>
              <span className="metric-sub">{stats.completed_orders} Completed</span>
            </div>
          </div>

          {/* Useful Real-Time Charts Section */}
          <div className="admin-charts-grid">
            {/* Chart 1: Sales over time (Last 7 Days) */}
            <div className="chart-card">
              <div className="chart-head">
                <h3>📈 Sales Over Time (Last 7 Days)</h3>
                <span className="hint">Daily gross sales</span>
              </div>
              <div className="svg-bar-chart-container">
                <svg viewBox="0 0 500 200" className="svg-bar-chart">
                  {/* Grid lines */}
                  <line x1="40" y1="20" x2="480" y2="20" stroke="#f1f5f9" strokeDasharray="3 3" />
                  <line x1="40" y1="80" x2="480" y2="80" stroke="#f1f5f9" strokeDasharray="3 3" />
                  <line x1="40" y1="140" x2="480" y2="140" stroke="#f1f5f9" strokeDasharray="3 3" />
                  <line x1="40" y1="160" x2="480" y2="160" stroke="#cbd5e1" />

                  {stats.sales_over_time?.map((item, idx) => {
                    const barWidth = 36;
                    const spacing = 58;
                    const x = 55 + idx * spacing;
                    const height = (item.sales / maxSales) * 130;
                    const y = 160 - Math.max(height, 4);

                    return (
                      <g key={item.day} className="chart-bar-group">
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={Math.max(height, 4)}
                          rx="4"
                          fill="#3b82f6"
                          className="bar-rect"
                        >
                          <title>{`${item.label}: ${money(item.sales)} (${item.orders} orders)`}</title>
                        </rect>
                        <text
                          x={x + barWidth / 2}
                          y={y - 6}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#64748b"
                          fontWeight="600"
                        >
                          {item.sales > 0 ? `$${Math.round(item.sales)}` : ""}
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y="180"
                          textAnchor="middle"
                          fontSize="11"
                          fill="#64748b"
                        >
                          {item.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Chart 2: Orders by Status Breakdown */}
            <div className="chart-card">
              <div className="chart-head">
                <h3>📦 Orders by Status</h3>
                <span className="hint">{stats.total_orders} total orders recorded</span>
              </div>
              <div className="status-bars-container">
                {stats.orders_by_status?.map((st) => {
                  const pct = stats.total_orders > 0 ? ((st.count / stats.total_orders) * 100).toFixed(1) : 0;
                  return (
                    <div key={st.status} className="status-progress-row">
                      <div className="status-row-info">
                        <span className="status-name-tag" style={{ borderLeftColor: st.color }}>
                          {st.status}
                        </span>
                        <strong className="status-count-val">
                          {st.count} <span className="pct">({pct}%)</span>
                        </strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${pct}%`, backgroundColor: st.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart 3: Platform Users Breakdown */}
            <div className="chart-card">
              <div className="chart-head">
                <h3>👥 Registered Platform Accounts</h3>
                <span className="hint">Verified unique emails</span>
              </div>
              <div className="user-distribution-grid">
                {stats.users_by_type?.map((u) => (
                  <div key={u.type} className="user-type-box" style={{ borderTopColor: u.color }}>
                    <span className="user-type-title">{u.type}</span>
                    <strong className="user-type-count">{u.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: ADVANCED PRODUCT ADMINISTRATION              */}
      {/* ==================================================== */}
      {activeTab === "products" && (
        <div className="admin-tab-content">
          <div className="section-toolbar">
            <div className="filter-button-group">
              <button
                className={`filter-btn ${prodFilter === "all" ? "active" : ""}`}
                onClick={() => setProdFilter("all")}
              >
                All ({products.length})
              </button>
              <button
                className={`filter-btn ${prodFilter === "active" ? "active" : ""}`}
                onClick={() => setProdFilter("active")}
              >
                Active ({products.filter((p) => p.status === "active").length})
              </button>
              <button
                className={`filter-btn ${prodFilter === "paused" ? "active" : ""}`}
                onClick={() => setProdFilter("paused")}
              >
                Paused ({products.filter((p) => p.status === "paused").length})
              </button>
            </div>

            <div className="search-box">
              <input
                type="text"
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
                placeholder="Search products or sellers…"
              />
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <EmptyState title="No products found" description="No products match the selected filter." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Sold</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Seller</th>
                    <th>Status</th>
                    <th>Orders</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const isPaused = p.status === "paused";
                    return (
                      <tr key={p.product_id} className={isPaused ? "row-paused" : ""}>
                        <td>
                          <strong>{p.name}</strong>
                          <span className="table-sub">Product ID: #{p.product_id}</span>
                        </td>
                        <td>
                          <span className="sold-count-badge">{p.sold_quantity ?? 0}</span>
                        </td>
                        <td>{p.category_name}</td>
                        <td>{money(p.price)}</td>
                        <td>
                          <span className={p.stock <= 5 ? "stock-low" : ""}>{p.stock}</span>
                        </td>
                        <td>
                          <span>{p.seller_name}</span>
                          <span className="table-sub">{p.seller_email}</span>
                        </td>
                        <td>
                          <span className={`badge ${isPaused ? "badge-paused" : "badge-active"}`}>
                            {isPaused ? "Paused" : "Active"}
                          </span>
                        </td>
                        <td>{p.order_count}</td>
                        <td className="table-actions">
                          {isPaused ? (
                            <button
                              type="button"
                              className="text-button btn-success"
                              onClick={() => handleUnpauseProduct(p)}
                            >
                              ▶ Unpause
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-button btn-warning"
                              onClick={() => handlePauseProduct(p)}
                            >
                              ⏸ Pause
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-button remove-link"
                            onClick={() => promptDeleteProduct(p)}
                          >
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: ADVANCED SELLER ADMINISTRATION               */}
      {/* ==================================================== */}
      {activeTab === "sellers" && (
        <div className="admin-tab-content">
          <div className="section-toolbar">
            <div className="filter-button-group">
              <button
                className={`filter-btn ${sellerFilter === "all" ? "active" : ""}`}
                onClick={() => setSellerFilter("all")}
              >
                All ({sellers.length})
              </button>
              <button
                className={`filter-btn ${sellerFilter === "pending" ? "active" : ""}`}
                onClick={() => setSellerFilter("pending")}
              >
                Pending ({sellers.filter((s) => s.approval_status === "pending").length})
              </button>
              <button
                className={`filter-btn ${sellerFilter === "approved" ? "active" : ""}`}
                onClick={() => setSellerFilter("approved")}
              >
                Active ({sellers.filter((s) => s.approval_status === "approved").length})
              </button>
              <button
                className={`filter-btn ${sellerFilter === "suspended" ? "active" : ""}`}
                onClick={() => setSellerFilter("suspended")}
              >
                Suspended ({sellers.filter((s) => s.approval_status === "suspended").length})
              </button>
              <button
                className={`filter-btn ${sellerFilter === "rejected" ? "active" : ""}`}
                onClick={() => setSellerFilter("rejected")}
              >
                Rejected ({sellers.filter((s) => s.approval_status === "rejected").length})
              </button>
            </div>

            <div className="search-box">
              <input
                type="text"
                value={sellerSearch}
                onChange={(e) => setSellerSearch(e.target.value)}
                placeholder="Search sellers by name or email…"
              />
            </div>
          </div>

          {filteredSellers.length === 0 ? (
            <EmptyState title="No sellers found" description="No sellers match the selected filter." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Seller</th>
                    <th>Phone</th>
                    <th>Registered</th>
                    <th>Products</th>
                    <th>Status</th>
                    <th>Suspension</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSellers.map((s) => {
                    const isPending = s.approval_status === "pending";
                    const isApproved = s.approval_status === "approved";
                    const isSuspended = s.approval_status === "suspended";
                    const isRejected = s.approval_status === "rejected";

                    return (
                      <tr key={s.seller_id}>
                        <td>
                          <strong>{s.name}</strong>
                          <span className="table-sub">{s.email}</span>
                        </td>
                        <td>{s.phone}</td>
                        <td>{formatDate(s.created_at)}</td>
                        <td>{s.product_count}</td>
                        <td>
                          <span
                            className={`badge ${
                              isApproved
                                ? "badge-active"
                                : isPending
                                ? "badge-pending"
                                : isSuspended
                                ? "badge-suspended"
                                : "badge-rejected"
                            }`}
                          >
                            {isApproved
                              ? "Active"
                              : isPending
                              ? "Pending"
                              : isSuspended
                              ? "Suspended"
                              : "Rejected"}
                          </span>
                        </td>
                        <td>
                          {isSuspended
                            ? s.suspended_until
                              ? `Until ${formatDate(s.suspended_until)}`
                              : "Indefinite"
                            : "—"}
                        </td>
                        <td className="table-actions">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                className="text-button btn-success"
                                onClick={() => handleSellerApprove(s)}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="text-button remove-link"
                                onClick={() => handleSellerReject(s)}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <button
                              type="button"
                              className="text-button btn-warning"
                              onClick={() => promptSuspendSeller(s)}
                            >
                              ⏸ Pause / Suspend
                            </button>
                          )}

                          {isSuspended && (
                            <button
                              type="button"
                              className="text-button btn-success"
                              onClick={() => handleSellerReactivate(s)}
                            >
                              ▶ Reactivate
                            </button>
                          )}

                          <button
                            type="button"
                            className="text-button remove-link"
                            onClick={() => promptDeleteSeller(s)}
                          >
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 4: ADVANCED DELIVERYMAN ADMINISTRATION          */}
      {/* ==================================================== */}
      {activeTab === "deliverymen" && (
        <div className="admin-tab-content">
          <div className="section-toolbar">
            <div className="filter-button-group">
              <button
                className={`filter-btn ${driverFilter === "all" ? "active" : ""}`}
                onClick={() => setDriverFilter("all")}
              >
                All ({deliverymen.length})
              </button>
              <button
                className={`filter-btn ${driverFilter === "pending" ? "active" : ""}`}
                onClick={() => setDriverFilter("pending")}
              >
                Pending ({deliverymen.filter((d) => d.approval_status === "pending").length})
              </button>
              <button
                className={`filter-btn ${driverFilter === "approved" ? "active" : ""}`}
                onClick={() => setDriverFilter("approved")}
              >
                Approved ({deliverymen.filter((d) => d.approval_status === "approved").length})
              </button>
              <button
                className={`filter-btn ${driverFilter === "suspended" ? "active" : ""}`}
                onClick={() => setDriverFilter("suspended")}
              >
                Suspended ({deliverymen.filter((d) => d.approval_status === "suspended").length})
              </button>
            </div>
          </div>

          {filteredDrivers.length === 0 ? (
            <EmptyState title="No deliverymen found" description="No deliverymen match the selected filter." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Phone</th>
                    <th>Area</th>
                    <th>Availability</th>
                    <th>Approval</th>
                    <th>Suspension</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map((d) => {
                    const isPending = d.approval_status === "pending";
                    const isApproved = d.approval_status === "approved";
                    const isSuspended = d.approval_status === "suspended";

                    return (
                      <tr key={d.deliveryman_id}>
                        <td>
                          <strong>{d.name}</strong>
                          <span className="table-sub">{d.email}</span>
                        </td>
                        <td>{d.phone}</td>
                        <td>{d.delivery_location || "Not specified"}</td>
                        <td>
                          <span className={`status-pill ${d.availability_status}`}>
                            {d.availability_status}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              isApproved
                                ? "badge-active"
                                : isPending
                                ? "badge-pending"
                                : isSuspended
                                ? "badge-suspended"
                                : "badge-rejected"
                            }`}
                          >
                            {d.approval_status}
                          </span>
                        </td>
                        <td>
                          {isSuspended
                            ? d.suspended_until
                              ? `Until ${formatDate(d.suspended_until)}`
                              : "Indefinite"
                            : "—"}
                        </td>
                        <td className="table-actions">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                className="text-button btn-success"
                                onClick={() => handleDriverApprove(d)}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="text-button remove-link"
                                onClick={() => handleDriverReject(d)}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <button
                              type="button"
                              className="text-button btn-warning"
                              onClick={() => promptSuspendDriver(d)}
                            >
                              ⏸ Suspend
                            </button>
                          )}

                          {isSuspended && (
                            <button
                              type="button"
                              className="text-button btn-success"
                              onClick={() => handleDriverReactivate(d)}
                            >
                              ▶ Reactivate
                            </button>
                          )}

                          <button
                            type="button"
                            className="text-button remove-link"
                            onClick={() => promptDeleteDriver(d)}
                          >
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="modal-backdrop">
          <div className="modal-box" role="dialog" aria-modal="true">
            <h3>{confirmModal.title}</h3>
            <p>{confirmModal.message}</p>
            {confirmModal.warning && (
              <p className="modal-warning-text">{confirmModal.warning}</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-danger"
                disabled={actionInProgress}
                onClick={confirmModal.onConfirm}
              >
                {actionInProgress ? "Deleting…" : "Yes, Permanently Delete"}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={actionInProgress}
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspension Duration Modal */}
      {suspendModal && (
        <div className="modal-backdrop">
          <div className="modal-box" role="dialog" aria-modal="true">
            <h3>Pause / Suspend {suspendModal.entityType === "seller" ? "Seller" : "Deliveryman"}</h3>
            <p>
              Temporarily or indefinitely pause account access for <strong>{suspendModal.name}</strong>.
            </p>
            <label className="modal-label">
              Suspension duration:
              <select
                value={suspendDuration}
                onChange={(e) => setSuspendDuration(e.target.value)}
                className="modal-select"
              >
                <option value="0">Indefinite (Until manually unpaused)</option>
                <option value="3">Temporary: 3 Days</option>
                <option value="7">Temporary: 7 Days (1 Week)</option>
                <option value="14">Temporary: 14 Days (2 Weeks)</option>
                <option value="30">Temporary: 30 Days (1 Month)</option>
              </select>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-warning"
                disabled={actionInProgress}
                onClick={submitSuspend}
              >
                {actionInProgress ? "Applying…" : "Confirm Suspension"}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={actionInProgress}
                onClick={() => setSuspendModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
