import { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as authService from "../services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authService.getStoredUser());

  useEffect(() => {
    function handleAuthSync() {
      setUser(authService.getStoredUser());
    }

    window.addEventListener("auth:change", handleAuthSync);
    return () => {
      window.removeEventListener("auth:change", handleAuthSync);
    };
  }, []);

  const login = useCallback(async (details) => {
    const result = await authService.login(details);
    setUser(result.user);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:change"));
    }
    return result;
  }, []);

  const register = useCallback((details) => authService.register(details), []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:change"));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook so pages just do: const { user, login, logout } = useAuth();
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
