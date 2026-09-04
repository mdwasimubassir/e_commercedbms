import { useEffect, useMemo, useState } from "react";
import ProductCard from "../components/ProductCard";
import Spinner from "../components/Spinner";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import { getProducts } from "../services/productService";
import { useDebounce } from "../hooks/useDebounce";
import { navigate } from "../utils/router";

const SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc", label: "Name: A to Z" },
];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const [queryInput, setQueryInput] = useState("");
  const query = useDebounce(queryInput, 300);
  const [category, setCategory] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState("default");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    getProducts()
      .then((data) => {
        if (!active) return;
        setProducts(Array.isArray(data) ? data : []);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message || "Unable to load products.");
        setStatus("error");
      });
    return () => { active = false; };
  }, []);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category_name).filter(Boolean))].sort(),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    const priceLimit = maxPrice === "" ? null : Number(maxPrice);

    let result = products.filter((product) => {
      const matchesCategory = category === "all" || product.category_name === category;
      const matchesTerm = !term || `${product.name} ${product.description || ""}`.toLowerCase().includes(term);
      const matchesPrice = priceLimit === null || Number(product.price) <= priceLimit;
      const matchesStock = !inStockOnly || Number(product.stock) > 0;
      return matchesCategory && matchesTerm && matchesPrice && matchesStock;
    });

    if (sort === "price_asc") result = [...result].sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price_desc") result = [...result].sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "name_asc") result = [...result].sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }, [products, query, category, maxPrice, inStockOnly, sort]);

  if (status === "loading") return <Spinner label="Loading products…" />;
  if (status === "error") return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (products.length === 0) return <EmptyState title="No products yet" description="There are no products available at the moment." />;

  return (
    <section className="products-page">
      <div className="products-heading">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>Browse products</h1>
          <p className="subtext">Find something you'll love. Filters update instantly and stay in this page — no reload needed.</p>
        </div>
      </div>

      <div className="product-controls">
        <input
          aria-label="Search products"
          type="search"
          placeholder="Search products…"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
        />
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input
          aria-label="Maximum price"
          type="number"
          min="0"
          placeholder="Max price"
          value={maxPrice}
          onChange={(event) => setMaxPrice(event.target.value)}
        />
        <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}>
          {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <label className="checkbox-field">
          <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />
          In stock only
        </label>
      </div>

      {filteredProducts.length === 0 ? (
        <EmptyState title="No matching products" description="Try a different search, category, or price range." />
      ) : (
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <ProductCard key={product.product_id} product={product} onViewDetails={(id) => navigate(`/products/${id}`)} />
          ))}
        </div>
      )}
    </section>
  );
}
