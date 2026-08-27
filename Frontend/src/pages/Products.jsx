import { useEffect, useMemo, useState } from "react";
import ProductCard from "../components/ProductCard";
import { getProducts } from "../services/productService";

export default function Products({ onViewProduct }) {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    let active = true;
    getProducts().then((data) => {
      if (!active) return;
      setProducts(Array.isArray(data) ? data : []);
      setStatus("ready");
    }).catch((requestError) => {
      if (!active) return;
      setError(requestError.message || "Unable to load products.");
      setStatus("error");
    });
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => [...new Set(products.map((product) => product.category_name).filter(Boolean))].sort(), [products]);
  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => (category === "all" || product.category_name === category)
      && (!term || `${product.name} ${product.description || ""}`.toLowerCase().includes(term)));
  }, [products, query, category]);

  if (status === "loading") return <section className="content-state"><h1>Loading products…</h1><p>Please wait while we retrieve the catalogue.</p></section>;
  if (status === "error") return <section className="content-state"><h1>Products are unavailable</h1><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></section>;
  if (products.length === 0) return <section className="content-state"><h1>No products yet</h1><p>There are no products available at the moment.</p></section>;

  return <section className="products-page">
    <div className="products-heading"><div><p className="eyebrow">Catalogue</p><h1>Browse products</h1><p className="subtext">Find something you’ll love.</p></div></div>
    <div className="product-controls">
      <input aria-label="Search products" type="search" placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    </div>
    {filteredProducts.length === 0 ? <section className="content-state compact"><h2>No matching products</h2><p>Try another search or category.</p></section>
      : <div className="product-grid">{filteredProducts.map((product) => <ProductCard key={product.product_id} product={product} onViewDetails={onViewProduct} />)}</div>}
  </section>;
}
