import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { ToastProvider } from "./context/ToastContext";
import { usePathname, matchPath } from "./utils/router";
import Header from "./components/Header";
import ProtectedRoute from "./components/ProtectedRoute";
import EmptyState from "./components/EmptyState";

import Products from "./pages/Products";
import ProductDetails from "./pages/ProductDetails";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Wishlist from "./pages/Wishlist";
import Notifications from "./pages/Notifications";
import SellerDashboard from "./pages/seller/SellerDashboard";
import SellerProducts from "./pages/seller/SellerProducts";
import SellerProductForm from "./pages/seller/SellerProductForm";
import SellerOrders from "./pages/seller/SellerOrders";

// Every route the app understands, in the order they should be checked.
// `params` lets a page read the piece captured by ":name" in the pattern.
const ROUTES = [
  { pattern: "/", render: () => <Products /> },
  { pattern: "/products/:id", render: (params) => <ProductDetails productId={params.id} /> },
  { pattern: "/login", render: () => <Login /> },
  { pattern: "/register", render: () => <Register /> },
  { pattern: "/cart", render: () => <ProtectedRoute allowedRoles={["customer"]}><Cart /></ProtectedRoute> },
  { pattern: "/checkout", render: () => <ProtectedRoute allowedRoles={["customer"]}><Checkout /></ProtectedRoute> },
  { pattern: "/orders", render: () => <ProtectedRoute allowedRoles={["customer"]}><Orders /></ProtectedRoute> },
  { pattern: "/orders/:id", render: (params) => <ProtectedRoute allowedRoles={["customer"]}><OrderDetail orderId={params.id} /></ProtectedRoute> },
  { pattern: "/wishlist", render: () => <ProtectedRoute allowedRoles={["customer"]}><Wishlist /></ProtectedRoute> },
  { pattern: "/notifications", render: () => <ProtectedRoute allowedRoles={["customer", "seller"]}><Notifications /></ProtectedRoute> },
  { pattern: "/seller/dashboard", render: () => <ProtectedRoute allowedRoles={["seller"]}><SellerDashboard /></ProtectedRoute> },
  { pattern: "/seller/products", render: () => <ProtectedRoute allowedRoles={["seller"]}><SellerProducts /></ProtectedRoute> },
  { pattern: "/seller/products/new", render: () => <ProtectedRoute allowedRoles={["seller"]}><SellerProductForm /></ProtectedRoute> },
  { pattern: "/seller/products/:id/edit", render: (params) => <ProtectedRoute allowedRoles={["seller"]}><SellerProductForm productId={params.id} /></ProtectedRoute> },
  { pattern: "/seller/orders", render: () => <ProtectedRoute allowedRoles={["seller"]}><SellerOrders /></ProtectedRoute> },
];

function RouteOutlet() {
  const pathname = usePathname();

  for (const route of ROUTES) {
    const params = matchPath(route.pattern, pathname);
    if (params) return route.render(params);
  }

  return <EmptyState title="Page not found" description="The page you're looking for doesn't exist." />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CartProvider>
          <main className="app-shell">
            <Header />
            <RouteOutlet />
          </main>
        </CartProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
