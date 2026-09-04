import ProductImage from "./ProductImage";
import { useAuth } from "../context/AuthContext";
import { isWishlisted, toggleWishlist } from "../services/wishlistStorage";
import { useState } from "react";

const shortDescription = (description) => (description?.length > 110 ? `${description.slice(0, 107)}…` : description || "No description available.");
const money = (price) => `$${Number(price).toFixed(2)}`;

export default function ProductCard({ product, onViewDetails }) {
  const { user } = useAuth();
  const inStock = Number(product.stock) > 0;
  const [wishlisted, setWishlisted] = useState(user?.role === "customer" && isWishlisted(user.id, product.product_id));

  function handleWishlistClick(event) {
    event.stopPropagation();
    setWishlisted(toggleWishlist(user.id, product.product_id));
  }

  return (
    <article className="product-card">
      <div className="product-image-wrap">
        <ProductImage src={product.image} alt={product.name} />
        {user?.role === "customer" && (
          <button
            className={wishlisted ? "wishlist-btn active" : "wishlist-btn"}
            onClick={handleWishlistClick}
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            title={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          >
            {wishlisted ? "♥" : "♡"}
          </button>
        )}
      </div>
      <div className="product-card-content">
        <p className="category-tag">{product.category_name}</p>
        <h2>{product.name}</h2>
        <p className="product-description">{shortDescription(product.description)}</p>
        <div className="product-meta">
          <strong>{money(product.price)}</strong>
          <span className={inStock ? "in-stock" : "out-of-stock"}>{inStock ? `${product.stock} in stock` : "Out of stock"}</span>
        </div>
        <button onClick={() => onViewDetails(product.product_id)}>View details</button>
      </div>
    </article>
  );
}
