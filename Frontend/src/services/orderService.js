import { apiRequest } from "./api";

export const createOrder = (paymentMethod, shippingAddress) =>
  apiRequest("/api/orders", {
    method: "POST",
    auth: true,
    body: { payment_method: paymentMethod, shipping_address: shippingAddress },
  });

export const getOrders = () => apiRequest("/api/orders", { auth: true });

export const getOrder = (orderId) => apiRequest(`/api/orders/${orderId}`, { auth: true });

export const cancelOrder = (orderId) => apiRequest(`/api/orders/${orderId}/cancel`, { method: "PUT", auth: true });
