import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { navigate } from "../utils/router";

export default function Header() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);

  function go(path) {
    setMenuOpen(false);
    navigate(path);
  }

  function handleLogout() {
    logout();
    setMenuOpen(false);
    navigate("/");
  }

  return (
    <header className="site-header">
      <button className="brand" onClick={() => go("/")}>
        <span>EC</span>
        <p>E-Commerce<br />Portal</p>
      </button>

      <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle menu">☰</button>

      <nav className={menuOpen ? "open" : ""}>
        <button className="nav-link" onClick={() => go("/")}>Products</button>

        {user?.role === "customer" && (
          <>
            <button className="nav-link" onClick={() => go("/wishlist")}>Wishlist</button>
            <button className="nav-link" onClick={() => go("/orders")}>Orders</button>
            <button className="nav-link cart-link" onClick={() => go("/cart")}>
              Cart{itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
            </button>
          </>
        )}

        {user?.role === "seller" && (
          <>
            <button className="nav-link" onClick={() => go("/seller/dashboard")}>Dashboard</button>
            <button className="nav-link" onClick={() => go("/seller/products")}>My Products</button>
            <button className="nav-link" onClick={() => go("/seller/orders")}>Orders</button>
          </>
        )}

        {user && <button className="nav-link" onClick={() => go("/notifications")}>Notifications</button>}

        {user ? (
          <>
            <span className="user-label">{user.name}</span>
            <button className="nav-link" onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <button className="nav-link" onClick={() => go("/login")}>Sign in</button>
        )}
      </nav>
    </header>
  );
}
