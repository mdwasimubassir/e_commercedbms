export default function Spinner({ label = "Loading…" }) {
  return (
    <div className="spinner-block" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
