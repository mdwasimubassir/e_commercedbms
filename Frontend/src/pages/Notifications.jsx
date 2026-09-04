import { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import { getNotifications, markNotificationRead, deleteNotification } from "../services/notificationService";

const formatDate = (value) => new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  function load() {
    setStatus("loading");
    getNotifications()
      .then((data) => { setNotifications(Array.isArray(data) ? data : []); setStatus("ready"); })
      .catch((requestError) => { setError(requestError.message); setStatus("error"); });
  }

  useEffect(load, []);

  async function handleMarkRead(id) {
    await markNotificationRead(id).catch(() => {});
    load();
  }

  async function handleDelete(id) {
    await deleteNotification(id).catch(() => {});
    load();
  }

  if (status === "loading") return <Spinner label="Loading notifications…" />;
  if (status === "error") return <ErrorState message={error} onRetry={load} />;
  if (notifications.length === 0) return <EmptyState title="No notifications" description="You're all caught up." />;

  return (
    <section className="orders-page">
      <p className="eyebrow">Updates</p>
      <h1>Notifications</h1>

      <ul className="notification-list">
        {notifications.map((notification) => (
          <li key={notification.notification_id} className={notification.status === "Read" ? "notification-item read" : "notification-item"}>
            <div>
              <p>{notification.message}</p>
              <span className="hint">{formatDate(notification.notification_date)}</span>
            </div>
            <div className="notification-actions">
              {notification.status !== "Read" && (
                <button className="text-button" onClick={() => handleMarkRead(notification.notification_id)}>Mark read</button>
              )}
              <button className="text-button remove-link" onClick={() => handleDelete(notification.notification_id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
