import { apiRequest } from "./api";

const TOKEN_KEY = "ecommerce_auth_token";
const USER_KEY = "ecommerce_auth_user";

export const register = (details) =>
  apiRequest("/api/auth/register", { method: "POST", body: JSON.stringify(details) });

export const login = async (details) => {
  const result = await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify(details) });
  localStorage.setItem(TOKEN_KEY, result.token);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  return result;
};

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
