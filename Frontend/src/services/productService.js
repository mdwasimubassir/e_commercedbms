import { apiRequest } from "./api";
import { getStoredToken } from "./authService";

export const getProducts = () => apiRequest("/api/products");

export const getProduct = (productId) => apiRequest(`/api/products/${productId}`);

export const addToCart = (productId) => {
  const token = getStoredToken();
  if (!token) throw new Error("Please sign in as a customer to add items to your cart.");

  return apiRequest("/api/cart/items", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ product_id: Number(productId), quantity: 1 }),
  });
};
