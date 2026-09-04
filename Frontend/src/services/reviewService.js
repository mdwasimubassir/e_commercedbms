import { apiRequest } from "./api";

// { product_id, review_count, average_rating, reviews: [...] }
export const getProductReviews = (productId) => apiRequest(`/api/products/${productId}/reviews`);

export const createReview = (productId, rating, comment) =>
  apiRequest("/api/reviews", { method: "POST", auth: true, body: { product_id: Number(productId), rating, comment } });

export const updateReview = (reviewId, rating, comment) =>
  apiRequest(`/api/reviews/${reviewId}`, { method: "PUT", auth: true, body: { rating, comment } });

export const deleteReview = (reviewId) => apiRequest(`/api/reviews/${reviewId}`, { method: "DELETE", auth: true });
