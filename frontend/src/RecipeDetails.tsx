import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useParams, useNavigate } from "react-router-dom";
import { getRecipeDietBadge } from "./recipeDiet";
import { getYouTubeEmbedUrl } from "./youtube";
import "./App.css";

type Recipe = {
  recipeid: string;
  title: string;
  description: string | null;
  image_url: string | null;
  youtube_url: string | null;
  proptimemin: number | null;
  cooktimemin: number | null;
  diet_type: string | null;
  servings: number | null;
  difficulty: string | null;
};

type Ingredient = {
  recipeingredientid: string;
  ingredientid: string;
  name: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
};

type Step = {
  stepid: string;
  stepno: number;
  instruction: string;
  timersec: number | null;
};

type RecipeDetailsResponse = {
  recipe: Recipe;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
};

type RecipeRatingSummary = {
  averageRating: number;
  totalRatings: number;
  userRating: number | null;
};

async function safeJson<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as T));
}

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem("recipe_session_id");
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    localStorage.setItem("recipe_session_id", sessionId);
  }
  return sessionId;
}

function formatTimer(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m} min`;
}

function difficultyColor(d: string | null) {
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

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function RecipeDetails() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<RecipeDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [rating, setRating] = useState<RecipeRatingSummary>({
    averageRating: 0,
    totalRatings: 0,
    userRating: null,
  });
  const [ratingLoading, setRatingLoading] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  const handleBackToPrevious = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  const handleTagClick = (tag: string) => {
    const value = tag.trim();
    if (!value) return;
    navigate(`/?q=${encodeURIComponent(value)}`);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!recipeId) {
      setError("Recipe not found");
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("jwt_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/recipes/${recipeId}`, { headers })
      .then(async (res) => {
        const body = await safeJson<RecipeDetailsResponse & { error?: string }>(res);
        if (!res.ok) throw new Error(body.error || "Failed to load recipe");
        setData(body);
        
        const token = localStorage.getItem("jwt_token");
        if (token) {
          // Track VIEW event for logged-in users
          try {
            await fetch("/api/recipe-events", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ recipeId, eventType: "VIEW" }),
            });
          } catch {
            // Non-blocking analytics
          }
        } else {
          // Track VIEW event for anonymous users with session ID
          const sessionId = getOrCreateSessionId();
          try {
            await fetch("/api/recipe-events/anonymous", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ sessionId, recipeId, eventType: "VIEW" }),
            });
          } catch {
            // Non-blocking analytics
          }
        }
      })
      .catch((err: Error) => setError(err.message || "Failed to load recipe"))
      .finally(() => setLoading(false));
  }, [recipeId]);

  useEffect(() => {
    if (!recipeId) return;
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      setIsSaved(false);
      return;
    }

    fetch(`/api/saved-recipes/${recipeId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return;
        const body = await safeJson<{ saved?: boolean }>(res);
        setIsSaved(Boolean(body.saved));
      })
      .catch(() => {
        // Non-blocking for status indicator.
      });
  }, [recipeId]);

  useEffect(() => {
    if (!recipeId) return;

    const token = localStorage.getItem("jwt_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/recipes/${recipeId}/rating-summary`, { headers })
      .then(async (res) => {
        if (!res.ok) return;
        const body = await safeJson<{ rating?: RecipeRatingSummary }>(res);
        if (!body?.rating) return;

        setRating({
          averageRating: Number(body.rating.averageRating || 0),
          totalRatings: Number(body.rating.totalRatings || 0),
          userRating: body.rating.userRating == null ? null : Number(body.rating.userRating),
        });
      })
      .catch(() => {
        // Non-blocking for rating display.
      });
  }, [recipeId]);

  const handleToggleSaved = async () => {
    if (!recipeId) return;
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      navigate("/login");
      return;
    }

    setSaveLoading(true);
    try {
      const res = await fetch(`/api/saved-recipes/${recipeId}`, {
        method: isSaved ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await safeJson<{ error?: string }>(res);
        throw new Error(body.error || "Failed to update saved recipe");
      }
      setIsSaved((prev) => !prev);
    } catch {
      // Keep UI stable on transient errors.
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRateRecipe = async (stars: number) => {
    if (!recipeId) return;

    const token = localStorage.getItem("jwt_token");
    if (!token) {
      navigate("/login");
      return;
    }

    setRatingLoading(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/rating`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stars }),
      });

      const body = await safeJson<{ error?: string; rating?: RecipeRatingSummary }>(res);
      if (!res.ok) {
        if (res.status === 401) {
          navigate("/login");
          return;
        }
        throw new Error(body.error || "Failed to submit rating");
      }

      if (body?.rating) {
        setRating({
          averageRating: Number(body.rating.averageRating || 0),
          totalRatings: Number(body.rating.totalRatings || 0),
          userRating: body.rating.userRating == null ? null : Number(body.rating.userRating),
        });
      }
    } catch {
      // Keep UI stable on transient errors.
    } finally {
      setRatingLoading(false);
    }
  };

  /* ---------- LOADING ---------- */
  if (loading) {
    return (
      <div className="rd-state">
        <div className="rd-spinner" />
        <span>Loading recipe...</span>
      </div>
    );
  }

  /* ---------- ERROR ---------- */
  if (error || !data) {
    return (
      <div className="rd-state">
        <span className="rd-state-icon">😕</span>
        <p className="rd-state-msg">{error || "Recipe not found"}</p>
        <button
          type="button"
          className="rd-state-link"
          onClick={handleBackToPrevious}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          ← Back to community
        </button>
      </div>
    );
  }

  const { recipe, ingredients, steps, tags } = data;
  const diff = difficultyColor(recipe.difficulty);
  const dietBadge = getRecipeDietBadge(recipe.diet_type);
  const totalTime =
    (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0) || null;
  const youtubeEmbedUrl = getYouTubeEmbedUrl(recipe.youtube_url);

  return (
    <div className="rd-page">
      {/* ========== HERO ========== */}
      <motion.section
        className="rd-hero"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.55 }}
      >
        <img
          className="rd-hero-img"
          src={recipe.image_url || "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg"}
          alt={recipe.title}
        />
        <div className="rd-hero-fade" />

        <div className="rd-hero-inner">
          <div className="rd-hero-top">
            <button
              type="button"
              className="rd-back rd-back-btn"
              onClick={handleBackToPrevious}
            >
              <span className="rd-back-arrow">←</span> Community Recipes
            </button>

            <button
              type="button"
              onClick={handleToggleSaved}
              disabled={saveLoading}
              className={`rd-save-btn ${isSaved ? "rd-save-btn-saved" : ""}`}
            >
              {saveLoading ? "Updating..." : isSaved ? "Saved ✓" : "Save Recipe"}
            </button>
          </div>

          <motion.h1
            className="rd-title"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
          >
            {recipe.title}
          </motion.h1>

          {recipe.description && (
            <motion.p
              className="rd-desc"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.28 }}
            >
              {recipe.description}
            </motion.p>
          )}

          {/* quick-stat pills */}
          <motion.div
            className="rd-pills"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.38 }}
          >
            {recipe.proptimemin != null && (
              <div className="rd-pill">
                <span className="rd-pill-icon">🧑‍🍳</span>
                <div><strong>{recipe.proptimemin}</strong> min<br /><small>Prep</small></div>
              </div>
            )}
            {recipe.cooktimemin != null && (
              <div className="rd-pill">
                <span className="rd-pill-icon">🔥</span>
                <div><strong>{recipe.cooktimemin}</strong> min<br /><small>Cook</small></div>
              </div>
            )}
            {totalTime != null && (
              <div className="rd-pill">
                <span className="rd-pill-icon">⏱️</span>
                <div><strong>{totalTime}</strong> min<br /><small>Total</small></div>
              </div>
            )}
            {recipe.servings != null && (
              <div className="rd-pill">
                <span className="rd-pill-icon">🍽️</span>
                <div><strong>{recipe.servings}</strong><br /><small>Servings</small></div>
              </div>
            )}
            {dietBadge && (
              <div
                className="rd-pill"
                style={{ background: dietBadge.bg, borderColor: dietBadge.color + "44" }}
              >
                <span className="rd-pill-icon">{dietBadge.icon}</span>
                <div style={{ color: dietBadge.color }}><strong>{dietBadge.label}</strong><br /><small>Diet</small></div>
              </div>
            )}
            {recipe.difficulty && (
              <div
                className="rd-pill"
                style={{ background: diff.bg, borderColor: diff.color + "44" }}
              >
                <span className="rd-pill-icon">📌</span>
                <div style={{ color: diff.color }}><strong>{diff.label}</strong><br /><small>Difficulty</small></div>
              </div>
            )}
          </motion.div>

          {tags.length > 0 && (
            <motion.div
              className="rd-tags"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.48 }}
            >
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="rd-tag rd-tag-btn"
                  onClick={() => handleTagClick(t)}
                  aria-label={`Search recipes by tag ${t}`}
                >
                  {t}
                </button>
              ))}
            </motion.div>
          )}

          <motion.div
            className="rd-rating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.54 }}
          >
            <div className="rd-rating-summary">
              <span className="rd-rating-title">Rate this recipe</span>
              <span className="rd-rating-meta">
                {rating.totalRatings > 0
                  ? `${rating.averageRating.toFixed(1)} / 5 (${rating.totalRatings} rating${rating.totalRatings === 1 ? "" : "s"})`
                  : "No ratings yet"}
              </span>
            </div>

            <div
              className="rd-rating-stars"
              role="group"
              aria-label="Rate this recipe"
              onMouseLeave={() => setHoverRating(null)}
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const selectedValue = hoverRating ?? rating.userRating ?? 0;
                const active = star <= selectedValue;
                return (
                  <button
                    key={star}
                    type="button"
                    className={`rd-rating-star ${active ? "rd-rating-star-active" : ""}`}
                    onMouseEnter={() => setHoverRating(star)}
                    onClick={() => handleRateRecipe(star)}
                    disabled={ratingLoading}
                    aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
                  >
                    ★
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </motion.section>

      {youtubeEmbedUrl && (
        <motion.section
          className="rd-video-shell"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          <button
            type="button"
            className={`rd-video-toggle`}
            onClick={() => setIsVideoOpen((prev) => !prev)}
            aria-expanded={isVideoOpen}
            aria-controls="recipe-video-panel"
          >
            <div className="rd-video-toggle-main">
              <span className="rd-video-play">▶</span>
              <div>
                <span className="rd-video-kicker">Watch the recipe</span>
                <strong className="rd-video-title">See the full technique before you start cooking</strong>
                <span className="rd-video-note">Perfect for texture, timing, and plating cues.</span>
              </div>
            </div>
            <span className="rd-video-chevron">{isVideoOpen ? "−" : "+"}</span>
          </button>

          <AnimatePresence initial={false}>
            {isVideoOpen && (
              <motion.div
                id="recipe-video-panel"
                className="rd-video-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: "easeInOut" }}
              >
                <div className="rd-video-frame">
                  <iframe
                    src={youtubeEmbedUrl}
                    title={`${recipe.title} YouTube video`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      )}

      {/* ========== BODY ========== */}
      <div className="rd-body">
        {/* -- Ingredients -- */}
        <motion.aside
          className="rd-card rd-ingredients-card"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.h2 variants={fadeUp} className="rd-card-heading">
            <span className="rd-card-heading-icon">🥄</span> Ingredients
            {ingredients.length > 0 && (
              <span className="rd-card-count">{ingredients.length}</span>
            )}
          </motion.h2>

          {ingredients.length === 0 ? (
            <p className="rd-empty">No ingredients listed yet.</p>
          ) : (
            <ul className="rd-ing-list">
              {ingredients.map((ing) => (
                <motion.li key={ing.recipeingredientid} variants={fadeUp} className="rd-ing-item">
                  <span className="rd-ing-dot" />
                  <div className="rd-ing-body">
                    <span className="rd-ing-name">{ing.name}</span>
                    {(ing.amount != null || ing.unit) && (
                      <span className="rd-ing-qty">
                        {ing.amount != null && ing.amount}
                        {ing.unit ? ` ${ing.unit}` : ""}
                      </span>
                    )}
                    {ing.notes && <span className="rd-ing-note">{ing.notes}</span>}
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.aside>

        {/* -- Instructions -- */}
        <motion.section
          className="rd-card rd-steps-card"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.h2 variants={fadeUp} className="rd-card-heading">
            <span className="rd-card-heading-icon">📋</span> Instructions
            {steps.length > 0 && (
              <span className="rd-card-count">{steps.length} steps</span>
            )}
          </motion.h2>

          {steps.length === 0 ? (
            <p className="rd-empty">No steps listed yet.</p>
          ) : (
            <div className="rd-steps-list">
              {steps.map((step) => (
                <motion.div key={step.stepid} variants={fadeUp} className="rd-step">
                  <div className="rd-step-badge">{step.stepno}</div>
                  <div className="rd-step-body">
                    <p className="rd-step-text">{step.instruction}</p>
                    {step.timersec != null && (
                      <span className="rd-step-timer">⏲ {formatTimer(step.timersec)}</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
}
