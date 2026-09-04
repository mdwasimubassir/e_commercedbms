import { useState } from "react";
import RoleSelector from "../components/RoleSelector";
import { useAuth } from "../context/AuthContext";
import { navigate } from "../utils/router";

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ role: "customer", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form);
      navigate(form.role === "seller" ? "/seller/dashboard" : "/");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-card">
      <p className="eyebrow">Welcome back</p>
      <h1>Sign in to your account</h1>
      <p className="subtext">Choose the account type you registered with.</p>
      <form onSubmit={submit} noValidate>
        <RoleSelector value={form.role} onChange={(role) => update("role", role)} />
        <label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="current-password" required /></label>
        {error && <p className="message error" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="switch">New here? <button className="text-button" onClick={() => navigate("/register")}>Create an account</button></p>
    </section>
  );
}
