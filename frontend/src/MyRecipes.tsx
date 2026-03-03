import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import "./App.css";

interface RecipeRow {
  recipeid: string;
  title: string;
  description: string | null;
  image_url: string | null;
  proptimemin: number | null;
  cooktimemin: number | null;
  servings: number | null;
  difficulty: string | null;
  visibility: string | null;
  created_at: string;
}

function diffBadge(d: string | null) {
  switch (d?.toUpperCase()) {
    case "EASY":
      return { bg: "#e8f5e9", color: "#2e7d32", label: "Easy" };
    case "MEDIUM":
      return { bg: "#fff3e0", color: "#e65100", label: "Medium" };
    case "HARD":
      return { bg: "#fce4ec", color: "#c62828", label: "Hard" };
    default:
      return { bg: "#f5f5f5", color: "#616161", label: d || "" };
  }
}

export default function MyRecipes({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/my-recipes", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load recipes");
        setRecipes(data.recipes || []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, onUnauthorized]);

  const handleDelete = async (recipeId: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(recipeId);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setRecipes((prev) => prev.filter((r) => r.recipeid !== recipeId));
    } catch (err: any) {
      alert(err.message || "Failed to delete recipe");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="my-recipes-page">
        <div className="my-recipes-loading">
          <div className="rd-spinner" />
          <span>Loading your recipes...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-recipes-page">
        <div className="my-recipes-empty">
          <span className="my-recipes-empty-icon">😕</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-recipes-page">
      <div className="my-recipes-container">
        <div className="my-recipes-header">
          <div>
            <h1 className="my-recipes-title">My Recipes</h1>
            <p className="my-recipes-subtitle">
              {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} in your collection
            </p>
          </div>
          <Link to="/add-recipe" className="my-recipes-add-btn">
            + New Recipe
          </Link>
        </div>

        {recipes.length === 0 ? (
          <motion.div
            className="my-recipes-empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="my-recipes-empty-icon">📝</span>
            <h3>No recipes yet</h3>
            <p>Start sharing your culinary creations with the community!</p>
            <Link to="/add-recipe" className="my-recipes-add-btn" style={{ marginTop: 16 }}>
              Create Your First Recipe
            </Link>
          </motion.div>
        ) : (
          <motion.div
            className="my-recipes-grid"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
          >
            {recipes.map((recipe) => {
              const diff = diffBadge(recipe.difficulty);
              const totalTime = (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0) || null;
              return (
                <motion.div
                  key={recipe.recipeid}
                  className="my-recipe-card"
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
                  }}
                  whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}
                >
                  <div className="my-recipe-card-img-wrap">
                    <img
                      src={recipe.image_url || "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg"}
                      alt={recipe.title}
                      className="my-recipe-card-img"
                    />
                    <div className="my-recipe-card-badges">
                      <span
                        className="my-recipe-badge"
                        style={{ background: diff.bg, color: diff.color }}
                      >
                        {diff.label}
                      </span>
                      <span
                        className="my-recipe-badge"
                        style={{
                          background: recipe.visibility === "PUBLIC" ? "#e3f2fd" : "#fce4ec",
                          color: recipe.visibility === "PUBLIC" ? "#1565c0" : "#c62828",
                        }}
                      >
                        {recipe.visibility === "PUBLIC" ? "🌍 Public" : "🔒 Private"}
                      </span>
                    </div>
                  </div>

                  <div className="my-recipe-card-body">
                    <h3 className="my-recipe-card-title">{recipe.title}</h3>
                    {recipe.description && (
                      <p className="my-recipe-card-desc">
                        {recipe.description.length > 80
                          ? recipe.description.slice(0, 80) + "…"
                          : recipe.description}
                      </p>
                    )}

                    <div className="my-recipe-card-meta">
                      {totalTime != null && (
                        <span className="my-recipe-meta-item">⏱️ {totalTime} min</span>
                      )}
                      {recipe.servings != null && (
                        <span className="my-recipe-meta-item">🍽️ {recipe.servings} servings</span>
                      )}
                    </div>

                    <div className="my-recipe-card-date">
                      Added {new Date(recipe.created_at).toLocaleDateString()}
                    </div>

                    <div className="my-recipe-card-actions">
                      <button
                        className="my-recipe-action-btn my-recipe-edit-btn"
                        onClick={() => navigate(`/edit-recipe/${recipe.recipeid}`)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="my-recipe-action-btn my-recipe-view-btn"
                        onClick={() => navigate(`/recipes/${recipe.recipeid}`)}
                      >
                        👁️ View
                      </button>
                      <button
                        className="my-recipe-action-btn my-recipe-delete-btn"
                        onClick={() => handleDelete(recipe.recipeid, recipe.title)}
                        disabled={deletingId === recipe.recipeid}
                      >
                        {deletingId === recipe.recipeid ? "…" : "🗑️ Delete"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
