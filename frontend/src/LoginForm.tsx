import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import "./App.css";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.03,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: "easeOut" as const },
  },
};

export default function LoginForm({ onLogin }: { onLogin?: (jwt: string) => void }) {
  const [form, setForm] = useState({ email: "", password: "" });
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
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      setSuccess("Login successful!");
      if (onLogin) onLogin(data.token);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="auth-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        whileHover={{ y: -4, boxShadow: "0 24px 72px rgba(0, 0, 0, 0.38)" }}
      >
        <motion.div
          className="auth-header"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="auth-logo">🍽️</div>
          <motion.h2 className="auth-title" variants={itemVariants}>Welcome Back</motion.h2>
          <motion.p className="auth-subtitle" variants={itemVariants}>
            Sign in to share and discover recipes
          </motion.p>
        </motion.div>
        <motion.form
          onSubmit={handleSubmit}
          className="auth-form"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className="auth-field" variants={itemVariants}>
            <label className="auth-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
              className="auth-input"
            />
          </motion.div>
          <motion.div className="auth-field" variants={itemVariants}>
            <label className="auth-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              className="auth-input"
            />
          </motion.div>
          <motion.button
            type="submit"
            disabled={loading}
            className="auth-btn"
            variants={itemVariants}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.985 }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </motion.button>
          {error && <motion.div className="auth-error" variants={itemVariants}>{error}</motion.div>}
          {success && <motion.div className="auth-success" variants={itemVariants}>{success}</motion.div>}
        </motion.form>
        <motion.div className="auth-footer" variants={itemVariants} initial="hidden" animate="visible">
          Don't have an account? <Link to="/register">Create one</Link>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
