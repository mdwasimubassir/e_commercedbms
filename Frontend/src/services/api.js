import { getStoredToken, clearStoredAuth } from "./authStorage";

const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

// A tiny wrapper around fetch() that:
// - Points at the backend (through Vite's dev proxy, or VITE_API_URL directly)
// - Automatically attaches the JWT (if the user is signed in)
// - Automatically JSON-encodes the body / JSON-decodes the response
// - Throws a normal Error with the backend's message so pages can show it
export async function apiRequest(path, { method = "GET", body, auth = false, headers = {} } = {}) {
  const baseUrl = import.meta.env.DEV && apiBaseUrl === "http://localhost:3000" ? "" : apiBaseUrl;

  const finalHeaders = { "Content-Type": "application/json", ...headers };

  if (auth) {
    const token = getStoredToken();
    if (!token) throw new Error("Please sign in to continue.");
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 No Content etc. — nothing to parse
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && auth) {
    // Token missing/expired/invalid — clear it so the UI drops back to "signed out".
    clearStoredAuth();
  }

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong. Please try again.");
  }

  return data;
}
