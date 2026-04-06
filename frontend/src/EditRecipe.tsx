import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { processImage } from "./imageUpload";
import { normalizeRecipeDietType } from "./recipeDiet";
import { getYouTubeEmbedUrl, getYouTubeThumbnailUrl } from "./youtube";
import "./App.css";

const DIFFICULTY_OPTIONS = ["EASY", "MEDIUM", "HARD"] as const;
const DIET_OPTIONS = ["NONE", "VEGETARIAN", "VEGAN"] as const;
const VISIBILITY_OPTIONS = ["PUBLIC", "PRIVATE"] as const;
const UNIT_OPTIONS = ["G", "KG", "ML", "L", "TSP", "TBSP", "CUP", "PCS"] as const;

interface Step {
  instruction: string;
  timerSec: string;
}

interface Ingredient {
  name: string;
  amount: string;
  unit: string;
  notes: string;
}

export default function EditRecipe({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const navigate = useNavigate();
  const { recipeId } = useParams<{ recipeId: string }>();
  const [form, setForm] = useState({
    title: "",
    description: "",
    image_url: "",
    thumbnail_url: "",
    youtube_url: "",
    prepTimeMin: "",
    cookTimeMin: "",
    servings: "",
    dietType: "NONE" as string,
    difficulty: "EASY" as string,
    visibility: "PUBLIC" as string,
  });
  const [steps, setSteps] = useState<Step[]>([{ instruction: "", timerSec: "" }]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: "", amount: "", unit: "G", notes: "" },
  ]);
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const youtubeEmbedUrl = getYouTubeEmbedUrl(form.youtube_url);
  const youtubeThumbnailUrl = getYouTubeThumbnailUrl(form.youtube_url);

  // Load existing recipe data
  useEffect(() => {
    if (!recipeId) return;
    fetch(`/api/my-recipes/${recipeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load recipe");
        const r = data.recipe;
        setForm({
          title: r.title || "",
          description: r.description || "",
          image_url: r.image_url || "",
          thumbnail_url: r.thumbnail_url || "",
          youtube_url: r.youtube_url || "",
          prepTimeMin: r.proptimemin != null ? String(r.proptimemin) : "",
          cookTimeMin: r.cooktimemin != null ? String(r.cooktimemin) : "",
          servings: r.servings != null ? String(r.servings) : "",
          dietType: normalizeRecipeDietType(r.diet_type),
          difficulty: r.difficulty || "EASY",
          visibility: r.visibility || "PUBLIC",
        });
        if (r.image_url) setImagePreview(r.image_url);

        if (data.steps && data.steps.length > 0) {
          setSteps(
            data.steps.map((s: any) => ({
              instruction: s.instruction || "",
              timerSec: s.timersec != null ? String(s.timersec) : "",
            }))
          );
        }

        if (data.ingredients && data.ingredients.length > 0) {
          setIngredients(
            data.ingredients.map((i: any) => ({
              name: i.name || "",
              amount: i.amount != null ? String(i.amount) : "",
              unit: i.unit || "G",
              notes: i.notes || "",
            }))
          );
        }

        if (data.tags && data.tags.length > 0) {
          setTags(data.tags.join(", "));
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [recipeId, token, onUnauthorized]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB");
      return;
    }
    void (async () => {
      try {
        const processedImage = await processImage(file, {
          width: 1200,
          height: 1200,
          quality: 0.72,
        });
        const processedThumbnail = await processImage(file, {
          width: 480,
          height: 320,
          quality: 0.64,
        });
        setImagePreview(processedImage);
        setForm({ ...form, image_url: processedImage, thumbnail_url: processedThumbnail });
        setError("");
      } catch {
        setError("Failed to process image file");
      }
    })();
  };

  const clearImage = () => {
    setImagePreview(null);
    setForm({ ...form, image_url: "", thumbnail_url: "" });
  };

  const addStep = () => setSteps([...steps, { instruction: "", timerSec: "" }]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const updateStep = (i: number, field: keyof Step, value: string) => {
    const u = [...steps];
    u[i][field] = value;
    setSteps(u);
  };

  const addIngredient = () =>
    setIngredients([...ingredients, { name: "", amount: "", unit: "G", notes: "" }]);
  const removeIngredient = (i: number) =>
    setIngredients(ingredients.filter((_, idx) => idx !== i));
  const updateIngredient = (i: number, field: keyof Ingredient, value: string) => {
    const u = [...ingredients];
    u[i][field] = value;
    setIngredients(u);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.youtube_url.trim() && !youtubeEmbedUrl) {
      setError("Please enter a valid YouTube link");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const filteredSteps = steps
        .filter((s) => s.instruction.trim())
        .map((s) => ({
          instruction: s.instruction,
          timerSec: s.timerSec ? Number(s.timerSec) : undefined,
        }));
      const filteredIngredients = ingredients
        .filter((i) => i.name.trim())
        .map((i) => ({
          name: i.name,
          amount: i.amount ? Number(i.amount) : undefined,
          unit: i.unit || undefined,
          notes: i.notes || undefined,
        }));
      const filteredTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t);

      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description || undefined,
        image_url: form.image_url || undefined,
        thumbnail_url: form.thumbnail_url || undefined,
        youtube_url: form.youtube_url.trim() || undefined,
        prepTimeMin: form.prepTimeMin ? Number(form.prepTimeMin) : undefined,
        cookTimeMin: form.cookTimeMin ? Number(form.cookTimeMin) : undefined,
        dietType: normalizeRecipeDietType(form.dietType),
        servings: form.servings ? Number(form.servings) : undefined,
        difficulty: form.difficulty,
        visibility: form.visibility,
        steps: filteredSteps,
        ingredients: filteredIngredients,
        tags: filteredTags,
      };

      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update recipe");
      navigate("/my-recipes");
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="add-recipe-page">
        <div className="my-recipes-loading">
          <div className="rd-spinner" />
          <span>Loading recipe...</span>
        </div>
      </div>
    );
  }

  if (error && !form.title) {
    return (
      <div className="add-recipe-page">
        <div className="my-recipes-empty">
          <span className="my-recipes-empty-icon">😕</span>
          <p>{error}</p>
          <Link to="/my-recipes" className="rd-state-link">← Back to My Recipes</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="add-recipe-page">
      <div className="add-recipe-card">
        <div className="auth-header">
          <div className="auth-logo">✏️</div>
          <h2 className="auth-title">Edit Recipe</h2>
          <p className="auth-subtitle">Update your recipe details</p>
        </div>

        <form onSubmit={handleSubmit} className="add-recipe-form">
          {/* Basic Info Section */}
          <div className="add-recipe-section">
            <h3 className="add-recipe-section-title">Basic Information</h3>

            <div className="auth-field">
              <label className="auth-label" htmlFor="recipe-title">Title *</label>
              <input
                id="recipe-title"
                name="title"
                placeholder="e.g. Grandma's Chocolate Cake"
                value={form.title}
                onChange={handleChange}
                required
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="recipe-description">Description</label>
              <textarea
                id="recipe-description"
                name="description"
                placeholder="A brief description of your recipe..."
                value={form.description}
                onChange={handleChange}
                rows={3}
                className="auth-input add-recipe-textarea"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="recipe-image">Recipe Photo</label>
              <div className="add-recipe-upload-zone">
                <input
                  id="recipe-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="add-recipe-file-input"
                />
                <label htmlFor="recipe-image" className="add-recipe-upload-label">
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="preview" className="add-recipe-preview-img" />
                      <span className="add-recipe-upload-text">Click to change photo</span>
                    </>
                  ) : (
                    <>
                      <span className="add-recipe-upload-icon">📷</span>
                      <span className="add-recipe-upload-text">Click to upload photo</span>
                      <span className="add-recipe-upload-hint">or drag & drop</span>
                    </>
                  )}
                </label>
                {imagePreview && (
                  <button type="button" onClick={clearImage} className="add-recipe-clear-img">
                    ✕ Remove
                  </button>
                )}
              </div>
            </div>

            <div className="add-recipe-row">
              <div className="auth-field">
                <label className="auth-label" htmlFor="recipe-prep">Prep Time (min)</label>
                <input
                  id="recipe-prep"
                  name="prepTimeMin"
                  type="number"
                  min={0}
                  placeholder="15"
                  value={form.prepTimeMin}
                  onChange={handleChange}
                  className="auth-input"
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="recipe-cook">Cook Time (min)</label>
                <input
                  id="recipe-cook"
                  name="cookTimeMin"
                  type="number"
                  min={0}
                  placeholder="30"
                  value={form.cookTimeMin}
                  onChange={handleChange}
                  className="auth-input"
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="recipe-servings">Servings</label>
                <input
                  id="recipe-servings"
                  name="servings"
                  type="number"
                  min={1}
                  placeholder="4"
                  value={form.servings}
                  onChange={handleChange}
                  className="auth-input"
                />
              </div>
            </div>

            <div className="auth-field add-recipe-standalone-field">
              <label className="auth-label">Diet Label</label>
              <div className="diet-radio-group" role="radiogroup" aria-label="Diet label">
                {DIET_OPTIONS.map((diet) => {
                  const checked = form.dietType === diet;
                  const icon = diet === "VEGAN" ? "🌿" : diet === "VEGETARIAN" ? "🥬" : "🍽️";
                  const label = diet === "NONE" ? "No label" : diet.charAt(0) + diet.slice(1).toLowerCase();

                  return (
                    <label
                      key={diet}
                      className={`diet-radio-option ${checked ? "diet-radio-option-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="dietType"
                        value={diet}
                        checked={checked}
                        onChange={handleChange}
                        className="diet-radio-input"
                      />
                      <span className="diet-radio-icon" aria-hidden="true">{icon}</span>
                      <span className="diet-radio-label">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="recipe-youtube-url">YouTube Video</label>
              <input
                id="recipe-youtube-url"
                name="youtube_url"
                type="url"
                placeholder="Paste a YouTube link for a live preview"
                value={form.youtube_url}
                onChange={handleChange}
                className="auth-input"
              />
              <p className="add-recipe-helper-text">
                Supports `youtube.com`, `youtu.be`, Shorts, and embed links.
              </p>

              {form.youtube_url.trim() && (
                youtubeEmbedUrl ? (
                  <div className="add-recipe-video-preview">
                    <div className="add-recipe-video-preview-head">
                      <span className="add-recipe-video-preview-badge">▶</span>
                      <div>
                        <strong>Live video preview</strong>
                        <p>The recipe page will show this in an expandable “Watch the recipe” panel.</p>
                      </div>
                    </div>
                    <div className="add-recipe-video-frame">
                      <iframe
                        src={youtubeEmbedUrl}
                        title="YouTube video preview"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                    {youtubeThumbnailUrl && (
                      <div className="add-recipe-video-preview-foot">
                        <img src={youtubeThumbnailUrl} alt="YouTube thumbnail preview" />
                        <span>Previewing the linked YouTube video.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="add-recipe-helper-text add-recipe-helper-text-error">
                    This doesn&apos;t look like a valid YouTube link yet.
                  </p>
                )
              )}
            </div>

            <div className="add-recipe-row">
              <div className="auth-field">
                <label className="auth-label" htmlFor="recipe-difficulty">Difficulty</label>
                <select
                  id="recipe-difficulty"
                  name="difficulty"
                  value={form.difficulty}
                  onChange={handleChange}
                  className="auth-input add-recipe-select"
                >
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="recipe-visibility">Visibility</label>
                <select
                  id="recipe-visibility"
                  name="visibility"
                  value={form.visibility}
                  onChange={handleChange}
                  className="auth-input add-recipe-select"
                >
                  {VISIBILITY_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Ingredients Section */}
          <div className="add-recipe-section">
            <h3 className="add-recipe-section-title">Ingredients</h3>
            {ingredients.map((ing, idx) => (
              <div key={idx} className="add-recipe-list-item">
                <div className="add-recipe-list-item-fields">
                  <input
                    type="text"
                    placeholder="Ingredient name"
                    value={ing.name}
                    onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                    className="auth-input"
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={ing.amount}
                    onChange={(e) => updateIngredient(idx, "amount", e.target.value)}
                    className="auth-input"
                    style={{ flex: 1 }}
                    step="0.1"
                  />
                  <select
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                    className="auth-input add-recipe-select"
                    style={{ flex: 1 }}
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={ing.notes}
                    onChange={(e) => updateIngredient(idx, "notes", e.target.value)}
                    className="auth-input"
                    style={{ flex: 2 }}
                  />
                </div>
                {ingredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeIngredient(idx)}
                    className="add-recipe-remove-btn"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addIngredient} className="add-recipe-add-btn">
              + Add Ingredient
            </button>
          </div>

          {/* Steps Section */}
          <div className="add-recipe-section">
            <h3 className="add-recipe-section-title">Instructions</h3>
            {steps.map((step, idx) => (
              <div key={idx} className="add-recipe-list-item">
                <div className="add-recipe-step-number">{idx + 1}</div>
                <div className="add-recipe-list-item-fields">
                  <textarea
                    placeholder="Step instruction..."
                    value={step.instruction}
                    onChange={(e) => updateStep(idx, "instruction", e.target.value)}
                    className="auth-input add-recipe-textarea"
                    rows={2}
                    style={{ flex: 3 }}
                  />
                  <input
                    type="number"
                    placeholder="Timer (sec)"
                    value={step.timerSec}
                    onChange={(e) => updateStep(idx, "timerSec", e.target.value)}
                    className="auth-input"
                    style={{ flex: 1 }}
                    min={0}
                  />
                </div>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    className="add-recipe-remove-btn"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addStep} className="add-recipe-add-btn">
              + Add Step
            </button>
          </div>

          {/* Tags Section */}
          <div className="add-recipe-section">
            <h3 className="add-recipe-section-title">Tags</h3>
            <div className="auth-field">
              <label className="auth-label" htmlFor="recipe-tags">Tags (comma-separated)</label>
              <input
                id="recipe-tags"
                type="text"
                placeholder="e.g. dessert, chocolate, easy"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="auth-input"
              />
            </div>
          </div>

          <div className="edit-recipe-btn-row">
            <button type="submit" disabled={saving} className="auth-btn">
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="edit-recipe-cancel-btn"
              onClick={() => navigate("/my-recipes")}
            >
              Cancel
            </button>
          </div>

          {error && <div className="auth-error">{error}</div>}
        </form>
      </div>
    </div>
  );
}
