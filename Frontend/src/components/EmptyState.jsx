export default function EmptyState({ title, description, action }) {
  return (
    <div className="content-state compact">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
