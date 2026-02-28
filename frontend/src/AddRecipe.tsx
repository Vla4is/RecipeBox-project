import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

const DIFFICULTY_OPTIONS = ["EASY", "MEDIUM", "HARD"] as const;
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

export default function AddRecipe({ token }: { token: string }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    image_url: "",
    prepTimeMin: "",
    cookTimeMin: "",
    servings: "",
    difficulty: "EASY" as string,
    visibility: "PUBLIC" as string,
  });
  const [steps, setSteps] = useState<Step[]>([{ instruction: "", timerSec: "" }]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: "", amount: "", unit: "G", notes: "" },
  ]);
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreview(dataUrl);
      setForm({ ...form, image_url: dataUrl });
      setError("");
    };
    reader.onerror = () => {
      setError("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImagePreview(null);
    setForm({ ...form, image_url: "" });
  };

  const addStep = () => {
    setSteps([...steps, { instruction: "", timerSec: "" }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof Step, value: string) => {
    const updated = [...steps];
    updated[index][field] = value;
    setSteps(updated);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: "", amount: "", unit: "G", notes: "" }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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
        prepTimeMin: form.prepTimeMin ? Number(form.prepTimeMin) : undefined,
        cookTimeMin: form.cookTimeMin ? Number(form.cookTimeMin) : undefined,
        servings: form.servings ? Number(form.servings) : undefined,
        difficulty: form.difficulty,
        visibility: form.visibility,
        steps: filteredSteps,
        ingredients: filteredIngredients,
        tags: filteredTags,
      };
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create recipe");
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-recipe-page">
      <div className="add-recipe-card">
        <div className="auth-header">
          <div className="auth-logo">📝</div>
          <h2 className="auth-title">Add a Recipe</h2>
          <p className="auth-subtitle">Share your culinary creation with the community</p>
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
                  <button
                    type="button"
                    onClick={clearImage}
                    className="add-recipe-clear-img"
                  >
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

          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? "Publishing..." : "Publish Recipe"}
          </button>

          {error && <div className="auth-error">{error}</div>}
        </form>
      </div>
    </div>
  );
}
