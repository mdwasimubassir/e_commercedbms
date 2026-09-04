import { useEffect, useState } from "react";
import Spinner from "../../components/Spinner";
import { getProducts, getProduct } from "../../services/productService";
import { createSellerProduct, updateSellerProduct } from "../../services/sellerService";
import { useToast } from "../../context/ToastContext";
import { navigate } from "../../utils/router";

const emptyForm = { name: "", description: "", price: "", stock: "", image: "", category_id: "" };

export default function SellerProductForm({ productId }) {
  const isEditing = Boolean(productId);
  const { showToast } = useToast();

  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // useEffect(() => {
  //   // There is no dedicated "list categories" endpoint in the backend, so we
  //   // derive the set of existing categories from the public product catalogue.
  //   getProducts().then((products) => {
  //     const unique = new Map();
  //     (Array.isArray(products) ? products : []).forEach((p) => unique.set(String(p.category_id), p.category_name));
  //     setCategories([...unique.entries()].map(([category_id, category_name]) => ({ category_id, category_name })));
  //   }).catch(() => {});
  // }, []);
  useEffect(() => {
    getProducts().then((products) => {
      const unique = new Map();
      (Array.isArray(products) ? products : []).forEach((p) => {
        if (p.category_id && p.category_name) {
          unique.set(String(p.category_id), p.category_name);
        }
      });

      const extracted = [...unique.entries()].map(([category_id, category_name]) => ({ category_id, category_name }));

      // Fallback to seeded categories if catalogue is currently empty
      if (extracted.length > 0) {
        setCategories(extracted);
      } else {
        setCategories([
          { category_id: "1", category_name: "Electronics" },
          { category_id: "2", category_name: "Clothing" },
          { category_id: "3", category_name: "Home & Kitchen" },
          { category_id: "4", category_name: "Books" }
        ]);
      }
    }).catch(() => {
      setCategories([
        { category_id: "1", category_name: "Electronics" },
        { category_id: "2", category_name: "Clothing" },
        { category_id: "3", category_name: "Home & Kitchen" },
        { category_id: "4", category_name: "Books" }
      ]);
    });
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    getProduct(productId)
      .then((product) => {
        setForm({
          name: product.name,
          description: product.description,
          price: String(product.price),
          stock: String(product.stock),
          image: product.image,
          category_id: String(product.category_id),
        });
        setLoading(false);
      })
      .catch((requestError) => { setError(requestError.message); setLoading(false); });
  }, [isEditing, productId]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.name.trim() || !form.description.trim() || !form.image.trim() || !form.category_id) {
      setError("Please fill in every field.");
      return;
    }
    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!Number.isFinite(price) || price < 0) { setError("Price must be a non-negative number."); return; }
    if (!Number.isInteger(stock) || stock < 0) { setError("Stock must be a non-negative whole number."); return; }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      stock,
      image: form.image.trim(),
      category_id: Number(form.category_id),
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateSellerProduct(productId, payload);
        showToast("Product updated");
      } else {
        await createSellerProduct(payload);
        showToast("Product created");
      }
      navigate("/seller/products");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading product…" />;

  return (
    <section className="auth-card seller-form">
      <p className="eyebrow">{isEditing ? "Edit product" : "New product"}</p>
      <h1>{isEditing ? "Update product details" : "Add a product"}</h1>

      <form onSubmit={handleSubmit} noValidate>
        <label>Name<input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} maxLength={200} required /></label>
        <label>Description<textarea rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} required /></label>
        <label>Image URL<input type="text" value={form.image} onChange={(e) => update("image", e.target.value)} placeholder="https://…" required /></label>

        <div className="form-row">
          <label>Price (USD)<input type="number" min="0" step="0.01" value={form.price} onChange={(e) => update("price", e.target.value)} required /></label>
          <label>Stock<input type="number" min="0" step="1" value={form.stock} onChange={(e) => update("stock", e.target.value)} required /></label>
        </div>

        <label>
          Category
          <select value={form.category_id} onChange={(e) => update("category_id", e.target.value)} required>
            <option value="" disabled>Select a category</option>
            {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
          </select>
        </label>
        {categories.length === 0 && (
          <p className="hint">No categories exist in the catalogue yet — ask an admin/DB owner to insert one into the `categories` table, or add a categories API endpoint (see the README's suggested improvements).</p>
        )}

        {error && <p className="message error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="text-button" onClick={() => navigate("/seller/products")}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving…" : isEditing ? "Save changes" : "Create product"}</button>
        </div>
      </form>
    </section>
  );
}
