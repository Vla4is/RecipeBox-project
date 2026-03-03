import { useState } from "react";
import { Link } from "react-router-dom";
import "./App.css";

export default function RegistrationForm() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      setSuccess("Account created! You can now sign in.");
      setForm({ name: "", email: "", password: "" });
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">🍽️</div>
          <h2 className="auth-title">Join Our Community</h2>
          <p className="auth-subtitle">Start sharing your recipes with thousands of home cooks</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-name">Name</label>
            <input
              id="reg-name"
              name="name"
              placeholder="Your name"
              value={form.name}
              onChange={handleChange}
              required
              className="auth-input"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
              className="auth-input"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              name="password"
              type="password"
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              className="auth-input"
            />
          </div>
          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? "Creating Account..." : "Create Account"}
          </button>
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}
        </form>
        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
