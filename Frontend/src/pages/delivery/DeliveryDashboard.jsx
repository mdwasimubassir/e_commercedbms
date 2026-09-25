import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import ErrorState from "../../components/ErrorState";
import EmptyState from "../../components/EmptyState";
import DeliveryChat from "../../components/DeliveryChat";
import { useToast } from "../../context/ToastContext";
import {
  getDeliveryDashboard,
  setAvailability,
  updateDelivery,
  respondToDeliveryRequest,
} from "../../services/deliveryService";
import { useLiveSync } from "../../hooks/useLiveSync";
import { navigate } from "../../utils/router";

function formatStatus(status) {
  if (!status) return "Assigned";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDatetimeForInput(isoDateString) {
  if (!isoDateString) return "";
  try {
    const d = new Date(isoDateString);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
}

export default function DeliveryDashboard() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Per-order interaction states
  const [actionLoading, setActionLoading] = useState({});
  const [etaValues, setEtaValues] = useState({});
  const [openChats, setOpenChats] = useState({});

  const loadDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await getDeliveryDashboard();
      setData(result);
      setError("");

      // Pre-fill ETA inputs for each order
      if (result?.orders) {
        const etas = {};
        result.orders.forEach((o) => {
          if (o.estimated_delivery_time) {
            etas[o.order_id] = formatDatetimeForInput(o.estimated_delivery_time);
          }
        });
        setEtaValues((prev) => ({ ...etas, ...prev }));
      }
    } catch (err) {
      setError(err.message || "Failed to load delivery dashboard.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useLiveSync(["order_updated", "deliveryman_updated"], () => {
    loadDashboard(true);
  }, 4000);

  const handleRespond = async (requestId, decision) => {
    setActionLoading((prev) => ({ ...prev, [`req_${requestId}`]: true }));
    try {
      await respondToDeliveryRequest(requestId, decision);
      toast.show(
        decision === "accept"
          ? "Delivery request accepted! Order assigned to you."
          : "Delivery request declined.",
        "success"
      );
      await loadDashboard(true);
    } catch (err) {
      toast.show(err.message || `Failed to ${decision} request.`, "error");
    } finally {
      setActionLoading((prev) => ({ ...prev, [`req_${requestId}`]: false }));
    }
  };

  const handleStatusChange = async (order, nextStatus) => {
    setActionLoading((prev) => ({ ...prev, [`status_${order.order_id}`]: true }));
    try {
      await updateDelivery(order.order_id, { delivery_status: nextStatus });
      toast.show(
        `Order #${order.order_id} marked as ${formatStatus(nextStatus)}!`,
        "success"
      );
      await loadDashboard(true);
    } catch (err) {
      toast.show(err.message || "Failed to update delivery status.", "error");
    } finally {
      setActionLoading((prev) => ({ ...prev, [`status_${order.order_id}`]: false }));
    }
  };

  const handleSaveEta = async (orderId) => {
    const rawVal = etaValues[orderId];
    if (!rawVal) {
      toast.show("Please select an estimated delivery time first.", "error");
      return;
    }

    setActionLoading((prev) => ({ ...prev, [`eta_${orderId}`]: true }));
    try {
      const isoString = new Date(rawVal).toISOString();
      await updateDelivery(orderId, { estimated_delivery_time: isoString });
      toast.show(`ETA for Order #${orderId} updated!`, "success");
      await loadDashboard(true);
    } catch (err) {
      toast.show(err.message || "Failed to save ETA.", "error");
    } finally {
      setActionLoading((prev) => ({ ...prev, [`eta_${orderId}`]: false }));
    }
  };

  const handleToggleAvailability = async (targetStatus) => {
    setActionLoading((prev) => ({ ...prev, availability: true }));
    try {
      await setAvailability(targetStatus);
      toast.show(`Your status is now ${targetStatus}.`, "success");
      await loadDashboard(true);
    } catch (err) {
      toast.show(err.message || "Failed to update availability.", "error");
    } finally {
      setActionLoading((prev) => ({ ...prev, availability: false }));
    }
  };

  const toggleChat = (orderId) => {
    setOpenChats((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  if (loading) {
    return <Spinner label="Loading delivery dashboard…" />;
  }

  if (error && !data) {
    const isSuspended = error.toLowerCase().includes("suspended");
    return (
      <EmptyState
        title={isSuspended ? "Deliveryman Account Suspended" : "Unable to load dashboard"}
        description={error}
        action={
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            {isSuspended && (
              <button onClick={() => navigate("/messages?support=admin&appeal=suspension")}>
                Contact Admin / Appeal Suspension
              </button>
            )}
            <button className="text-button" onClick={() => loadDashboard()}>
              Retry
            </button>
          </div>
        }
      />
    );
  }

  const me = data?.deliveryman || {};
  const requests = data?.requests || [];
  const orders = data?.orders || [];

  const getNextStatus = (current) => {
    const transitions = {
      assigned: "picked_up",
      picked_up: "out_for_delivery",
      out_for_delivery: "delivered",
    };
    return transitions[current || "assigned"] || null;
  };

  return (
    <section className="delivery-dashboard">
      <div className="delivery-header">
        <p className="eyebrow">Delivery Partner Portal</p>
        <h1>Welcome, {me.name || "Delivery Partner"}</h1>
      </div>

      {/* Profile & Status Card */}
      <div className="delivery-profile-card">
        <div className="profile-info-grid">
          <div className="profile-info-item">
            <span className="info-label">Contact Phone</span>
            <strong>{me.phone || "—"}</strong>
          </div>
          <div className="profile-info-item">
            <span className="info-label">Deliveryman home address</span>
            <strong>{me.delivery_location || "Bangladesh"}</strong>
          </div>
          <div className="profile-info-item">
            <span className="info-label">Approval</span>
            <span className={`status-badge status-${me.approval_status}`}>
              {me.approval_status || "Pending"}
            </span>
          </div>
          <div className="profile-info-item">
            <span className="info-label">Availability</span>
            <span className={`status-badge availability-${me.availability_status}`}>
              {me.availability_status || "offline"}
            </span>
          </div>
        </div>

        <div className="profile-actions">
          {me.availability_status === "offline" ? (
            <button
              type="button"
              className="btn-availability"
              disabled={actionLoading.availability}
              onClick={() => handleToggleAvailability("available")}
            >
              {actionLoading.availability ? "Updating…" : "Go Available"}
            </button>
          ) : me.availability_status === "available" ? (
            <button
              type="button"
              className="btn-availability btn-offline"
              disabled={actionLoading.availability}
              onClick={() => handleToggleAvailability("offline")}
            >
              {actionLoading.availability ? "Updating…" : "Go Offline"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-availability btn-busy"
              disabled
              title="You have active deliveries. Finish deliveries to go offline or available."
            >
              Busy (Active Deliveries)
            </button>
          )}
        </div>
      </div>

      {/* Delivery Requests Section */}
      <div className="delivery-section">
        <div className="section-title-row">
          <h2>Pending Delivery Requests</h2>
          <span className="count-badge">{requests.length}</span>
        </div>

        {requests.length === 0 ? (
          <EmptyState
            title="No pending requests"
            description="When sellers request delivery for their orders, they will appear here for your review."
          />
        ) : (
          <div className="delivery-cards-grid">
            {requests.map((r) => (
              <div className="delivery-request-card" key={r.delivery_request_id}>
                <div className="card-top">
                  <span className="order-tag">Order #{r.order_id}</span>
                  <span className="time-tag">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                  </span>
                </div>

                <div className="card-body">
                  <p>
                    <strong>Customer:</strong> {r.customer_name} ({r.customer_phone})
                  </p>
                  <p>
                    <strong>Shipping Address:</strong> {r.shipping_address}
                  </p>
                  {r.delivery_latitude && r.delivery_longitude && (
                    <p className="card-coords">
                      <span>📍 Lat: {Number(r.delivery_latitude).toFixed(4)}, Long: {Number(r.delivery_longitude).toFixed(4)}</span>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${r.delivery_latitude}&mlon=${r.delivery_longitude}#map=16/${r.delivery_latitude}/${r.delivery_longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="map-link"
                      >
                        View on OpenStreetMap ↗
                      </a>
                    </p>
                  )}
                </div>

                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-accept"
                    disabled={actionLoading[`req_${r.delivery_request_id}`]}
                    onClick={() => handleRespond(r.delivery_request_id, "accept")}
                  >
                    {actionLoading[`req_${r.delivery_request_id}`] ? "Accepting…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    className="btn-reject text-button remove-link"
                    disabled={actionLoading[`req_${r.delivery_request_id}`]}
                    onClick={() => handleRespond(r.delivery_request_id, "reject")}
                  >
                    {actionLoading[`req_${r.delivery_request_id}`] ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assigned Deliveries Section */}
      <div className="delivery-section">
        <div className="section-title-row">
          <h2>Assigned Deliveries</h2>
          <span className="count-badge">{orders.length}</span>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            title="No active deliveries"
            description="When you accept a delivery request, the assigned order will be tracked here."
          />
        ) : (
          <div className="assigned-orders-list">
            {orders.map((o) => {
              const currentStatus = o.delivery_status || "assigned";
              const nextStatus = getNextStatus(currentStatus);
              const isDelivered = currentStatus === "delivered";
              const isChatOpen = !!openChats[o.order_id];

              return (
                <div className="assigned-order-card" key={o.order_id}>
                  <div className="assigned-card-head">
                    <div>
                      <h3>Order #{o.order_id}</h3>
                      <span className="order-date-hint">
                        Placed on {o.order_date ? new Date(o.order_date).toLocaleDateString() : "—"}
                      </span>
                    </div>
                    <div className="status-group">
                      <span className={`status-badge status-${currentStatus}`}>
                        {formatStatus(currentStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="assigned-card-grid">
                    <div className="customer-info-box">
                      <h4>Customer Information</h4>
                      <p><strong>Name:</strong> {o.customer_name}</p>
                      <p><strong>Phone:</strong> {o.customer_phone}</p>
                      {o.customer_email && <p><strong>Email:</strong> {o.customer_email}</p>}
                      <p><strong>Payment:</strong> {o.payment_method}</p>
                      <p><strong>Address:</strong> {o.shipping_address}</p>

                      {o.delivery_latitude && o.delivery_longitude && (
                        <div className="coords-row">
                          <span>📍 Coordinates: {Number(o.delivery_latitude).toFixed(4)}, {Number(o.delivery_longitude).toFixed(4)}</span>
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${o.delivery_latitude}&mlon=${o.delivery_longitude}#map=16/${o.delivery_latitude}/${o.delivery_longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="map-link"
                          >
                            Open in OpenStreetMap ↗
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="delivery-controls-box">
                      <h4>Delivery Controls</h4>
                      
                      <div className="eta-control-group">
                        <label htmlFor={`eta_${o.order_id}`}>
                          Estimated Delivery Time (ETA):
                        </label>
                        <div className="eta-input-row">
                          <input
                            id={`eta_${o.order_id}`}
                            type="datetime-local"
                            value={etaValues[o.order_id] || ""}
                            onChange={(e) =>
                              setEtaValues((prev) => ({ ...prev, [o.order_id]: e.target.value }))
                            }
                            disabled={isDelivered}
                          />
                          {!isDelivered && (
                            <button
                              type="button"
                              className="btn-save-eta"
                              disabled={actionLoading[`eta_${o.order_id}`]}
                              onClick={() => handleSaveEta(o.order_id)}
                            >
                              {actionLoading[`eta_${o.order_id}`] ? "Saving…" : "Save ETA"}
                            </button>
                          )}
                        </div>
                        {o.estimated_delivery_time && (
                          <p className="current-eta-hint">
                            Current ETA: {new Date(o.estimated_delivery_time).toLocaleString()}
                          </p>
                        )}
                      </div>

                      <div className="status-transition-box">
                        <span className="transition-label">Update Delivery Status:</span>
                        {isDelivered ? (
                          <span className="delivered-tag">✓ Delivery Completed</span>
                        ) : nextStatus ? (
                          <button
                            type="button"
                            className="btn-status-advance"
                            disabled={actionLoading[`status_${o.order_id}`]}
                            onClick={() => handleStatusChange(o, nextStatus)}
                          >
                            {actionLoading[`status_${o.order_id}`]
                              ? "Updating…"
                              : `Mark as ${formatStatus(nextStatus)}`}
                          </button>
                        ) : null}
                      </div>

                      <div className="chat-toggle-box">
                        <button
                          type="button"
                          className="btn-toggle-chat"
                          onClick={() => toggleChat(o.order_id)}
                        >
                          {isChatOpen ? "▲ Hide Chat with Customer" : "💬 Message Customer ▼"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Chat */}
                  {isChatOpen && (
                    <div className="assigned-card-chat-wrapper">
                      <DeliveryChat orderId={o.order_id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
