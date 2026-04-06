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
          <motion.h2 className="auth-title" variants={itemVariants}>Join Our Community</motion.h2>
          <motion.p className="auth-subtitle" variants={itemVariants}>
            Start sharing your recipes with thousands of home cooks
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
          </motion.div>
          <motion.div className="auth-field" variants={itemVariants}>
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
          </motion.div>
          <motion.div className="auth-field" variants={itemVariants}>
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
          </motion.div>
          <motion.button
            type="submit"
            disabled={loading}
            className="auth-btn"
            variants={itemVariants}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.985 }}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </motion.button>
          {error && (
            <motion.div
              className="auth-error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              className="auth-success"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {success}
            </motion.div>
          )}
        </motion.form>
        <motion.div className="auth-footer" variants={itemVariants} initial="hidden" animate="visible">
          Already have an account? <Link to="/login">Sign in</Link>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
