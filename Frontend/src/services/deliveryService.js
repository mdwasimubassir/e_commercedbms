import { apiRequest } from "./api";

export const getDeliveryDashboard = () => apiRequest("/api/delivery/dashboard", { auth: true });
export const setAvailability = (availability_status) => apiRequest("/api/delivery/availability", { method: "PATCH", auth: true, body: { availability_status } });
export const updateDelivery = (orderId, body) => apiRequest(`/api/delivery/orders/${orderId}`, { method: "PATCH", auth: true, body });
export const respondToDeliveryRequest = (requestId, decision) => apiRequest(`/api/delivery/requests/${requestId}`, { method: "PATCH", auth: true, body: { decision } });

export const getOrderParticipants = (orderId) =>
  apiRequest(`/api/delivery-messages/order-participants?orderId=${orderId}`, { auth: true });

export const getDeliveryMessages = (arg, maybeRole, maybeId) => {
  let query = "";
  if (typeof arg === "object" && arg !== null) {
    const params = new URLSearchParams();
    if (arg.orderId) params.append("orderId", arg.orderId);
    if (arg.recipientRole) params.append("recipientRole", arg.recipientRole);
    if (arg.recipientId) params.append("recipientId", arg.recipientId);
    if (arg.support) params.append("support", arg.support);
    query = params.toString() ? `?${params.toString()}` : "";
  } else if (arg) {
    const params = new URLSearchParams();
    params.append("orderId", arg);
    if (maybeRole) params.append("recipientRole", maybeRole);
    if (maybeId) params.append("recipientId", maybeId);
    query = `?${params.toString()}`;
  }
  return apiRequest(`/api/delivery-messages${query}`, { auth: true });
};

export const sendDeliveryMessage = (arg, message, recipient_role, recipient_id) => {
  let body = {};
  if (typeof arg === "object" && arg !== null) {
    body = arg;
  } else {
    body = { order_id: arg, message, recipient_role, recipient_id };
  }
  return apiRequest("/api/delivery-messages", {
    method: "POST",
    auth: true,
    body
  });
};

export const getUnreadMessageCount = () => apiRequest("/api/delivery-messages/unread-count", { auth: true });
export const getConversations = () => apiRequest("/api/delivery-messages/conversations", { auth: true });
export const markDeliveryMessagesRead = (arg, recipientRole, recipientId) => {
  let body = {};
  if (typeof arg === "object" && arg !== null) {
    body = arg;
  } else {
    body = { orderId: arg, recipientRole, recipientId };
  }
  return apiRequest("/api/delivery-messages/read", { method: "PATCH", auth: true, body });
};

export const deleteDeliveryMessage = (messageId) =>
  apiRequest(`/api/delivery-messages/${messageId}`, { method: "DELETE", auth: true });

export const deleteConversationMessages = (target, params = {}) => {
  const query = new URLSearchParams(params).toString();
  return apiRequest(`/api/delivery-messages/conversations/${target}${query ? `?${query}` : ""}`, {
    method: "DELETE",
    auth: true
  });
};


