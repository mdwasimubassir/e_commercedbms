import { useState } from "react";
import RoleSelector from "../components/RoleSelector";

const initialForm = { role: "customer", name: "", email: "", phone: "", password: "" };

export default function Register({ onRegister, onShowLogin }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const result = await onRegister(form);
      setSuccess(result.message || "Registration successful. You can now sign in.");
      setForm(initialForm);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return <section className="auth-card">
    <p className="eyebrow">Get started</p>
    <h1>Create your account</h1>
    <p className="subtext">Register as a customer or seller.</p>
    <form onSubmit={submit} noValidate>
      <RoleSelector value={form.role} onChange={(role) => update("role", role)} />
      <label>Full name<input type="text" value={form.name} onChange={(event) => update("name", event.target.value)} autoComplete="name" maxLength="150" required /></label>
      <label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required /></label>
      <label>Phone<input type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" maxLength="30" required /></label>
      <label>Password <span className="hint">(8–72 characters)</span><input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" minLength="8" maxLength="72" required /></label>
      {error && <p className="message error" role="alert">{error}</p>}
      {success && <p className="message success" role="status">{success}</p>}
      <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
    </form>
    <p className="switch">Already have an account? <button className="text-button" onClick={onShowLogin}>Sign in</button></p>
  </section>;
}
