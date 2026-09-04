import { apiRequest } from "./api";
import { setStoredAuth, clearStoredAuth, getStoredUser, getStoredToken } from "./authStorage";

export const register = (details) => apiRequest("/api/auth/register", { method: "POST", body: details });

export async function login(details) {
  const result = await apiRequest("/api/auth/login", { method: "POST", body: details });
  setStoredAuth(result.token, result.user);
  return result;
}

export function logout() {
  clearStoredAuth();
}

export { getStoredUser, getStoredToken };
