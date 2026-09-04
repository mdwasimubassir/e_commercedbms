import { apiRequest } from "./api";

// Seller-only product management (backend infers seller_id from the JWT).
export const getSellerProducts = () => apiRequest("/api/seller/products", { auth: true });

export const createSellerProduct = (product) =>
  apiRequest("/api/seller/products", { method: "POST", auth: true, body: product });

export const updateSellerProduct = (productId, product) =>
  apiRequest(`/api/seller/products/${productId}`, { method: "PUT", auth: true, body: product });

export const deleteSellerProduct = (productId) =>
  apiRequest(`/api/seller/products/${productId}`, { method: "DELETE", auth: true });

export const getSellerOrders = () => apiRequest("/api/seller/orders", { auth: true });

export const updateSellerOrderStatus = (orderId, status) =>
  apiRequest(`/api/seller/orders/${orderId}/status`, { method: "PUT", auth: true, body: { status } });
