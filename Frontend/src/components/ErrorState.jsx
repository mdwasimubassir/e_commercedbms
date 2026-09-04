export default function ErrorState({ message, onRetry }) {
  return (
    <div className="content-state compact">
      <h2>Something went wrong</h2>
      <p className="message error">{message}</p>
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  );
}
