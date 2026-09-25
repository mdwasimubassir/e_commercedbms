// Session-based auth helpers for reading/writing the signed-in user + JWT in sessionStorage.
// Scoped to the current tab/window so:
// 1. New tabs or copy-pasting the link opens the default guest dashboard without auto-login.
// 2. Closing the browser/tab clears the session automatically.
const TOKEN_KEY = "ecommerce_auth_token";
const USER_KEY = "ecommerce_auth_user";
const SESSION_INTENT_KEY = "ecommerce_auth_session_intent";

/**
 * Safely parses the payload of a JWT.
 * Returns null if token is missing, not a 3-part JWT, or has malformed payload.
 */
function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonStr);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Validates that a JWT token is well-formed and has not expired.
 */
export function isTokenValid(token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  // Check expiration if exp claim is present
  if (payload.exp && typeof payload.exp === "number") {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    // Allow a 5-second clock skew buffer
    if (nowInSeconds >= payload.exp - 5) {
      return false;
    }
  }

  return true;
}

export function clearStoredAuth() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SESSION_INTENT_KEY);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SESSION_INTENT_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
}

export function getStoredToken() {
  try {
    // Clean any legacy persistent localStorage auth on sight
    if (typeof localStorage !== "undefined" && localStorage.getItem(TOKEN_KEY)) {
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(SESSION_INTENT_KEY);
      } catch (_) {}
    }

    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    if (!isTokenValid(token)) {
      clearStoredAuth();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const token = getStoredToken();
    if (!token) {
      clearStoredAuth();
      return null;
    }

    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw || sessionStorage.getItem(SESSION_INTENT_KEY) !== "interactive-login") {
      clearStoredAuth();
      return null;
    }

    const user = JSON.parse(raw);
    if (!user || typeof user !== "object" || !user.id || !user.role) {
      clearStoredAuth();
      return null;
    }

    // Verify token claims match user object to prevent fake/mismatched session
    const payload = decodeJwtPayload(token);
    if (payload) {
      if (payload.sub && String(payload.sub) !== String(user.id)) {
        clearStoredAuth();
        return null;
      }
      if (payload.role && payload.role !== user.role) {
        clearStoredAuth();
        return null;
      }
    }

    return user;
  } catch {
    clearStoredAuth();
    return null;
  }
}

export function setStoredAuth(token, user) {
  try {
    if (!token || !user) {
      clearStoredAuth();
      return;
    }
    // Save to tab-specific sessionStorage only
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_INTENT_KEY, "interactive-login");

    // Ensure localStorage never keeps credentials across tabs or browser restarts
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SESSION_INTENT_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

