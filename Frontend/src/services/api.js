const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function apiRequest(path, options = {}) {
  // Use the Vite proxy during development when the API is the local default.
  const baseUrl = import.meta.env.DEV && apiBaseUrl === "http://localhost:3000" ? "" : apiBaseUrl;
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong. Please try again.");
  return data;
}
