// Displays a static star rating, or an interactive one when onChange is provided.
export default function StarRating({ value, onChange, size = "md" }) {
  const stars = [1, 2, 3, 4, 5];
  const interactive = typeof onChange === "function";

  return (
    <div className={`star-rating star-rating-${size}`} role={interactive ? "radiogroup" : undefined} aria-label="Rating">
      {stars.map((star) => (
        <button
          type="button"
          key={star}
          className={star <= Math.round(value) ? "star filled" : "star"}
          onClick={interactive ? () => onChange(star) : undefined}
          disabled={!interactive}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
