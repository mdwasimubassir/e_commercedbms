import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import ErrorState from "../../components/ErrorState";
import EmptyState from "../../components/EmptyState";
import { getSellerProducts, deleteSellerProduct } from "../../services/sellerService";
import { useToast } from "../../context/ToastContext";
import { navigate } from "../../utils/router";

const money = (value) => `$${Number(value).toFixed(2)}`;

export default function SellerProducts() {
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  function load() {
    setStatus("loading");
    getSellerProducts()
      .then((data) => { setProducts(Array.isArray(data) ? data : []); setStatus("ready"); })
      .catch((requestError) => { setError(requestError.message); setStatus("error"); });
  }

  useEffect(load, []);

  async function handleDelete(productId) {
    if (!window.confirm("Delete this product? This cannot be undone.")) return;
    setDeletingId(productId);
    try {
      await deleteSellerProduct(productId);
      showToast("Product deleted");
      load();
    } catch (requestError) {
      showToast(requestError.message, "error");
    } finally {
      setDeletingId(null);
    }
  }

  if (status === "loading") return <Spinner label="Loading your products…" />;
  if (status === "error") return <ErrorState message={error} onRetry={load} />;

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <section className="seller-products-page">
      <div className="products-heading">
        <div><p className="eyebrow">Inventory</p><h1>My products</h1></div>
        <button onClick={() => navigate("/seller/products/new")}>+ Add product</button>
      </div>

      <input className="table-search" type="search" placeholder="Search your products…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {filtered.length === 0 ? (
        <EmptyState title="No products yet" description="Add your first product to start selling." action={<button onClick={() => navigate("/seller/products/new")}>+ Add product</button>} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.product_id}>
                  <td>{product.name}</td>
                  <td>{product.category_name}</td>
                  <td>{money(product.price)}</td>
                  <td className={Number(product.stock) <= 5 ? "out-of-stock" : ""}>{product.stock}</td>
                  <td className="table-actions">
                    <button className="text-button" onClick={() => navigate(`/seller/products/${product.product_id}/edit`)}>Edit</button>
                    <button className="text-button remove-link" onClick={() => handleDelete(product.product_id)} disabled={deletingId === product.product_id}>
                      {deletingId === product.product_id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
