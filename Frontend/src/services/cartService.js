import { apiRequest } from "./api";

// Cart lives on the server (tied to the signed-in customer), so these all require auth.
export const getCart = () => apiRequest("/api/cart", { auth: true });

export const addCartItem = (productId, quantity = 1) =>
  apiRequest("/api/cart/items", { method: "POST", auth: true, body: { product_id: Number(productId), quantity } });

export const updateCartItem = (productId, quantity) =>
  apiRequest(`/api/cart/items/${productId}`, { method: "PUT", auth: true, body: { quantity } });

export const removeCartItem = (productId) =>
  apiRequest(`/api/cart/items/${productId}`, { method: "DELETE", auth: true });

export const clearCart = () => apiRequest("/api/cart", { method: "DELETE", auth: true });
