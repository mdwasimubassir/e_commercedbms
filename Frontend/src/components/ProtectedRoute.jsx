import { useAuth } from "../context/AuthContext";
import { navigate } from "../utils/router";
import EmptyState from "./EmptyState";

// Wraps a page and only renders it if the signed-in user has an allowed role.
// Usage: <ProtectedRoute allowedRoles={["customer"]}><Cart /></ProtectedRoute>
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <EmptyState
        title="Please sign in"
        description="You need an account to view this page."
        action={<button onClick={() => navigate("/login")}>Sign in</button>}
      />
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <EmptyState
        title="Not available for your account"
        description={`This page is only available to ${allowedRoles.join(" or ")} accounts.`}
        action={<button onClick={() => navigate("/")}>Back to shop</button>}
      />
    );
  }

  return children;
}
