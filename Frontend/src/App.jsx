import { useEffect, useState } from "react";
import Login from "./pages/Login";
import ProductDetails from "./pages/ProductDetails";
import Products from "./pages/Products";
import Register from "./pages/Register";
import { getStoredUser, login, logout, register } from "./services/authService";

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return pathname;
}

export default function App() {
  const pathname = usePathname();
  const [user, setUser] = useState(getStoredUser);
  const productMatch = pathname.match(/^\/products\/([^/]+)$/);

  async function handleLogin(details) {
    const result = await login(details);
    setUser(result.user);
    navigate("/products");
  }
  function handleLogout() {
    logout();
    setUser(null);
    navigate("/products");
  }

  let content;
  if (productMatch) content = <ProductDetails productId={productMatch[1]} user={user} onBack={() => navigate("/products")} onLogin={() => navigate("/login")} />;
  else if (pathname === "/login") content = <Login onLogin={handleLogin} onShowRegister={() => navigate("/register")} />;
  else if (pathname === "/register") content = <Register onRegister={register} onShowLogin={() => navigate("/login")} />;
  else content = <Products onViewProduct={(id) => navigate(`/products/${id}`)} />;

  return <main className="app-shell">
    <header className="site-header"><button className="brand" onClick={() => navigate("/products")}><span>EC</span><p>E-Commerce<br />Portal</p></button><nav>
      <button className="nav-link" onClick={() => navigate("/products")}>Products</button>
      {user ? <><span className="user-label">{user.name}</span><button className="nav-link" onClick={handleLogout}>Log out</button></>
        : <button className="nav-link" onClick={() => navigate("/login")}>Sign in</button>}
    </nav></header>
    {content}
  </main>;
}
