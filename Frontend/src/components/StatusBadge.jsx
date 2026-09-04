const STATUS_CLASSES = {
  Pending: "status-pending",
  Processing: "status-processing",
  Shipped: "status-shipped",
  Delivered: "status-delivered",
  Cancelled: "status-cancelled",
};

export default function StatusBadge({ status }) {
  return <span className={`status-badge ${STATUS_CLASSES[status] || ""}`}>{status}</span>;
}
