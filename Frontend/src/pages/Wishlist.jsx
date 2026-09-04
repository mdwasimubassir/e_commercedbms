import { useEffect, useState } from "react";
import ProductCard from "../components/ProductCard";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { getProducts } from "../services/productService";
import { getWishlist } from "../services/wishlistStorage";
import { useAuth } from "../context/AuthContext";
import { navigate } from "../utils/router";

// Wishlist is a client-only bonus feature (stored in localStorage, see
// services/wishlistStorage.js) since the database schema has no wishlist table.
export default function Wishlist() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    getProducts()
      .then((data) => {
        const savedIds = getWishlist(user.id).map(String);
        setProducts((Array.isArray(data) ? data : []).filter((p) => savedIds.includes(String(p.product_id))));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [user.id]);

  if (status === "loading") return <Spinner label="Loading wishlist…" />;
  if (status === "error") return <EmptyState title="Unable to load wishlist" />;
  if (products.length === 0) {
    return (
      <EmptyState
        title="Your wishlist is empty"
        description="Tap the heart on any product to save it here for later."
        action={<button onClick={() => navigate("/")}>Browse products</button>}
      />
    );
  }

  return (
    <section className="products-page">
      <p className="eyebrow">Saved for later</p>
      <h1>Your wishlist</h1>
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.product_id} product={product} onViewDetails={(id) => navigate(`/products/${id}`)} />
        ))}
      </div>
    </section>
  );
}
