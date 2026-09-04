import { apiRequest } from "./api";

// Public catalog endpoints (no auth required).
export const getProducts = () => apiRequest("/api/products");

export const getProduct = (productId) => apiRequest(`/api/products/${productId}`);
