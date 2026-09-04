import { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as cartService from "../services/cartService";
import { useAuth } from "./AuthContext";

const CartContext = createContext(null);

// Keeps a lightweight "how many items are in my cart" count available
// everywhere (e.g. the header badge) without every page re-fetching it.
export function CartProvider({ children }) {
  const { user } = useAuth();
  const [itemCount, setItemCount] = useState(0);

  const refreshCartCount = useCallback(async () => {
    if (!user || user.role !== "customer") {
      setItemCount(0);
      return;
    }
    try {
      const cart = await cartService.getCart();
      const count = (cart.items || []).reduce((sum, item) => sum + Number(item.quantity), 0);
      setItemCount(count);
    } catch {
      setItemCount(0);
    }
  }, [user]);

  useEffect(() => {
    refreshCartCount();
  }, [refreshCartCount]);

  return (
    <CartContext.Provider value={{ itemCount, refreshCartCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
