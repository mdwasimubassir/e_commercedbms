import { apiRequest } from "./api";

export const getNotifications = () => apiRequest("/api/notifications", { auth: true });

export const markNotificationRead = (notificationId) =>
  apiRequest(`/api/notifications/${notificationId}/read`, { method: "PUT", auth: true });

export const deleteNotification = (notificationId) =>
  apiRequest(`/api/notifications/${notificationId}`, { method: "DELETE", auth: true });
