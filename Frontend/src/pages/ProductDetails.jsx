import { useEffect, useState } from "react";
import ProductImage from "../components/ProductImage";
import { addToCart, getProduct } from "../services/productService";

const money = (price) => `$${Number(price).toFixed(2)}`;

export default function ProductDetails({ productId, user, onBack, onLogin }) {
  const [product, setProduct] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    getProduct(productId).then((data) => {
      if (!active) return;
      setProduct(data);
      setStatus("ready");
    }).catch((error) => {
      if (!active) return;
      setMessage(error.message || "Unable to load this product.");
      setStatus(error.message === "Product not found." ? "not-found" : "error");
    });
    return () => { active = false; };
  }, [productId]);

  async function handleAddToCart() {
    if (!user) { setMessage("Please sign in as a customer before adding an item to your cart."); return; }
    if (user.role !== "customer") { setMessage("Only customer accounts can use a cart."); return; }
    setAdding(true); setMessage("");
    try { const result = await addToCart(product.product_id); setMessage(result.message || "Product added to cart."); }
    catch (error) { setMessage(error.message); }
    finally { setAdding(false); }
  }

  if (status === "loading") return <section className="content-state"><h1>Loading product…</h1></section>;
  if (status === "not-found") return <section className="content-state"><h1>Product not found</h1><p>This product may have been removed.</p><button onClick={onBack}>Back to products</button></section>;
  if (status === "error") return <section className="content-state"><h1>Product is unavailable</h1><p>{message}</p><button onClick={onBack}>Back to products</button></section>;

  const inStock = Number(product.stock) > 0;
  return <section className="details-page"><button className="back-link" onClick={onBack}>← Back to products</button><article className="product-details">
    <ProductImage src={product.image} alt={product.name} large />
    <div className="details-content"><p className="category-tag">{product.category_name}</p><h1>{product.name}</h1><p className="details-price">{money(product.price)}</p><p className="details-description">{product.description || "No description available."}</p>
      <p><strong>Availability:</strong> <span className={inStock ? "in-stock" : "out-of-stock"}>{inStock ? `${product.stock} in stock` : "Out of stock"}</span></p>
      {product.seller_name && <p className="seller-info"><strong>Sold by:</strong> {product.seller_name}</p>}
      {inStock ? <button className="add-cart" onClick={handleAddToCart} disabled={adding}>{adding ? "Adding…" : "Add to cart"}</button> : <button disabled>Out of stock</button>}
      {!user && <button className="text-button login-prompt" onClick={onLogin}>Sign in to add to cart</button>}
      {message && <p className={message.includes("added") || message.includes("increased") ? "message success" : "message error"} role="status">{message}</p>}
    </div>
  </article></section>;
}
