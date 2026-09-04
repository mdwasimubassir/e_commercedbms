import { useEffect, useState } from "react";
import ProductImage from "../components/ProductImage";
import Spinner from "../components/Spinner";
import StarRating from "../components/StarRating";
import { getProduct } from "../services/productService";
import { getProductReviews, createReview } from "../services/reviewService";
import { addCartItem } from "../services/cartService";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { isWishlisted, toggleWishlist } from "../services/wishlistStorage";
import { navigate } from "../utils/router";

const money = (price) => `$${Number(price).toFixed(2)}`;

export default function ProductDetails({ productId }) {
  const { user } = useAuth();
  const { refreshCartCount } = useCart();
  const { showToast } = useToast();

  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);

  const [reviewData, setReviewData] = useState(null);
  const [reviewsStatus, setReviewsStatus] = useState("loading");
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [reviewError, setReviewError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setQuantity(1);
    getProduct(productId)
      .then((data) => {
        if (!active) return;
        setProduct(data);
        setStatus("ready");
        if (user?.role === "customer") setWishlisted(isWishlisted(user.id, data.product_id));
      })
      .catch((error) => {
        if (!active) return;
        setMessage(error.message || "Unable to load this product.");
        setStatus(error.message === "Product not found." ? "not-found" : "error");
      });
    return () => { active = false; };
  }, [productId, user]);

  useEffect(() => {
    let active = true;
    setReviewsStatus("loading");
    getProductReviews(productId)
      .then((data) => { if (active) { setReviewData(data); setReviewsStatus("ready"); } })
      .catch(() => { if (active) setReviewsStatus("error"); });
    return () => { active = false; };
  }, [productId]);

  async function handleAddToCart() {
    if (!user) { setMessage("Please sign in as a customer before adding an item to your cart."); return; }
    if (user.role !== "customer") { setMessage("Only customer accounts can use a cart."); return; }
    setAdding(true);
    setMessage("");
    try {
      const result = await addCartItem(product.product_id, quantity);
      showToast(result.message || "Added to cart");
      refreshCartCount();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAdding(false);
    }
  }

  function handleWishlistClick() {
    setWishlisted(toggleWishlist(user.id, product.product_id));
  }

  async function handleReviewSubmit(event) {
    event.preventDefault();
    setReviewError("");
    if (!reviewForm.comment.trim()) { setReviewError("Please write a short comment."); return; }
    setSubmittingReview(true);
    try {
      await createReview(productId, reviewForm.rating, reviewForm.comment.trim());
      const refreshed = await getProductReviews(productId);
      setReviewData(refreshed);
      setReviewForm({ rating: 5, comment: "" });
      showToast("Review posted");
    } catch (error) {
      setReviewError(error.message);
    } finally {
      setSubmittingReview(false);
    }
  }

  if (status === "loading") return <Spinner label="Loading product…" />;
  if (status === "not-found") {
    return (
      <section className="content-state">
        <h1>Product not found</h1>
        <p>This product may have been removed.</p>
        <button onClick={() => navigate("/")}>Back to products</button>
      </section>
    );
  }
  if (status === "error") {
    return (
      <section className="content-state">
        <h1>Product is unavailable</h1>
        <p>{message}</p>
        <button onClick={() => navigate("/")}>Back to products</button>
      </section>
    );
  }

  const inStock = Number(product.stock) > 0;

  return (
    <section className="details-page">
      <button className="back-link" onClick={() => navigate("/")}>← Back to products</button>
      <article className="product-details">
        <div className="product-image-wrap">
          <ProductImage src={product.image} alt={product.name} large />
          {user?.role === "customer" && (
            <button className={wishlisted ? "wishlist-btn active large" : "wishlist-btn large"} onClick={handleWishlistClick}>
              {wishlisted ? "♥ Saved" : "♡ Save"}
            </button>
          )}
        </div>
        <div className="details-content">
          <p className="category-tag">{product.category_name}</p>
          <h1>{product.name}</h1>
          {reviewData && reviewData.review_count > 0 && (
            <div className="rating-summary">
              <StarRating value={reviewData.average_rating} />
              <span>{reviewData.average_rating} ({reviewData.review_count} review{reviewData.review_count === 1 ? "" : "s"})</span>
            </div>
          )}
          <p className="details-price">{money(product.price)}</p>
          <p className="details-description">{product.description || "No description available."}</p>
          <p><strong>Availability:</strong> <span className={inStock ? "in-stock" : "out-of-stock"}>{inStock ? `${product.stock} in stock` : "Out of stock"}</span></p>
          {product.seller_name && <p className="seller-info"><strong>Sold by:</strong> {product.seller_name}</p>}

          {inStock ? (
            <div className="add-cart-row">
              <input
                type="number"
                min="1"
                max={product.stock}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Math.min(product.stock, Number(event.target.value) || 1)))}
                aria-label="Quantity"
              />
              <button className="add-cart" onClick={handleAddToCart} disabled={adding}>{adding ? "Adding…" : "Add to cart"}</button>
            </div>
          ) : (
            <button disabled>Out of stock</button>
          )}
          {!user && <button className="text-button login-prompt" onClick={() => navigate("/login")}>Sign in to add to cart</button>}
          {message && <p className={message.toLowerCase().includes("added") || message.toLowerCase().includes("increased") ? "message success" : "message error"} role="status">{message}</p>}
        </div>
      </article>

      <section className="reviews-section">
        <h2>Customer reviews</h2>
        {reviewsStatus === "loading" && <Spinner label="Loading reviews…" />}
        {reviewsStatus === "error" && <p className="message error">Unable to load reviews.</p>}
        {reviewsStatus === "ready" && (
          <>
            {reviewData.reviews.length === 0 ? (
              <p className="subtext">No reviews yet. Be the first to share your thoughts.</p>
            ) : (
              <ul className="review-list">
                {reviewData.reviews.map((review) => (
                  <li key={review.review_id} className="review-item">
                    <div className="review-item-head">
                      <strong>{review.customer_name}</strong>
                      <StarRating value={review.rating} size="sm" />
                    </div>
                    <p>{review.comment}</p>
                  </li>
                ))}
              </ul>
            )}

            {user?.role === "customer" && (
              <form className="review-form" onSubmit={handleReviewSubmit}>
                <h3>Write a review</h3>
                <p className="hint">You can only review products you've purchased and received.</p>
                <StarRating value={reviewForm.rating} onChange={(rating) => setReviewForm((f) => ({ ...f, rating }))} />
                <textarea
                  placeholder="Share your experience with this product…"
                  value={reviewForm.comment}
                  onChange={(event) => setReviewForm((f) => ({ ...f, comment: event.target.value }))}
                  rows={3}
                />
                {reviewError && <p className="message error">{reviewError}</p>}
                <button type="submit" disabled={submittingReview}>{submittingReview ? "Posting…" : "Post review"}</button>
              </form>
            )}
          </>
        )}
      </section>
    </section>
  );
}
