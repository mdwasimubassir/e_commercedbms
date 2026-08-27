import ProductImage from "./ProductImage";

const shortDescription = (description) => description?.length > 110 ? `${description.slice(0, 107)}…` : description || "No description available.";
const money = (price) => `$${Number(price).toFixed(2)}`;

export default function ProductCard({ product, onViewDetails }) {
  const inStock = Number(product.stock) > 0;
  return <article className="product-card">
    <ProductImage src={product.image} alt={product.name} />
    <div className="product-card-content">
      <p className="category-tag">{product.category_name}</p>
      <h2>{product.name}</h2>
      <p className="product-description">{shortDescription(product.description)}</p>
      <div className="product-meta"><strong>{money(product.price)}</strong><span className={inStock ? "in-stock" : "out-of-stock"}>{inStock ? `${product.stock} in stock` : "Out of stock"}</span></div>
      <button onClick={() => onViewDetails(product.product_id)}>View details</button>
    </div>
  </article>;
}
