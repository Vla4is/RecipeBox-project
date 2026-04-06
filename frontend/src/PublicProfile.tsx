import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import RecipeGridCard from "./RecipeGridCard";
import "./App.css";

type PublicProfile = {
  userid: string;
  name: string;
  nickname: string;
  avatar_url: string | null;
  createdAt: string;
};

type Recipe = {
  recipeid: string;
  title: string;
  description: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  proptimemin: number | null;
  cooktimemin: number | null;
  diet_type: string | null;
  servings: number | null;
  difficulty: string | null;
};

async function safeJson<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as T));
}

export default function PublicProfile() {
  const { nickname } = useParams<{ nickname: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!nickname) {
      setError("Profile not found");
      setLoading(false);
      return;
    }

    if (!nickname.startsWith("@")) {
      setError("Profile not found");
      setLoading(false);
      return;
    }

    const handle = nickname.slice(1).trim();
    if (!handle) {
      setError("Profile not found");
      setLoading(false);
      return;
    }

    fetch(`/api/users/${encodeURIComponent(handle)}`)
      .then(async (res) => {
        const body = await safeJson<{ error?: string; profile?: PublicProfile; recipes?: Recipe[] }>(res);
        if (!res.ok || !body.profile) {
          throw new Error(body.error || "Failed to load profile");
        }
        setProfile(body.profile);
        setRecipes(Array.isArray(body.recipes) ? body.recipes : []);
      })
      .catch((err: Error) => setError(err.message || "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [nickname]);

  if (loading) {
    return (
      <div className="profile-shell">
        <div className="rd-state">
          <div className="rd-spinner" />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-shell">
        <div className="rd-state">
          <p className="rd-state-msg">{error || "Profile not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-shell">
      <motion.section
        className="public-profile-hero public-profile-hero-recipe"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.55 }}
      >
        <div className="public-profile-hero-gradient" aria-hidden="true" />
        <div className="public-profile-hero-fade" />
        <div className="public-profile-hero-inner">
          <div className="public-profile-topline">
            <span className="public-profile-kicker">Cookbook Profile</span>
            <span className="public-profile-top-meta">
              Member since {new Date(profile.createdAt).toLocaleDateString()}
            </span>
          </div>

          <div className="public-profile-identity">
            <div className="profile-avatar-wrap public-profile-avatar-wrap">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.nickname} className="profile-avatar public-profile-avatar-large" />
              ) : (
                <div className="profile-avatar profile-avatar-fallback public-profile-avatar-large">
                  {profile.nickname.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="profile-hero-copy public-profile-copy">
              <h1>{profile.name || `@${profile.nickname}`}</h1>
              <p className="profile-handle">@{profile.nickname}</p>
              <p className="public-profile-cover-note">Future cover customization area</p>
              <p className="profile-public-summary public-profile-summary-on-hero">
                {recipes.length > 0
                  ? "A growing public cookbook from this community cook, collected in one recipe-style showcase."
                  : "This profile is live and ready. The first public recipes will land here soon."}
              </p>
            </div>
          </div>

          <div className="public-profile-pills">
            <div className="public-profile-pill">
              <span className="public-profile-pill-icon">🍽️</span>
              <div>
                <strong>{recipes.length}</strong>
                <small>Public recipes</small>
              </div>
            </div>
            <div className="public-profile-pill">
              <span className="public-profile-pill-icon">👤</span>
              <div>
                <strong>{profile.avatar_url ? "Custom" : "Signature"}</strong>
                <small>{profile.avatar_url ? "Avatar set" : "Monogram style"}</small>
              </div>
            </div>
            <div className="public-profile-pill">
              <span className="public-profile-pill-icon">📅</span>
              <div>
                <strong>{new Date(profile.createdAt).getFullYear()}</strong>
                <small>Member since</small>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="profile-recipes-section">
        <div className="profile-card-head">
          <h2>Public recipes</h2>
          <p>Everything this cook has shared with the community.</p>
        </div>

        {recipes.length === 0 ? (
          <div className="public-profile-empty">
            <div className="public-profile-empty-copy">
              <span className="my-recipes-empty-icon">🍽️</span>
              <h3>No public recipes yet</h3>
              <p>
                This cook has not published anything yet, but the profile is ready and the recipe shelf will appear here as soon as something goes public.
              </p>
            </div>
            <div className="public-profile-placeholder-grid" aria-hidden="true">
              {[1, 2, 3].map((item) => (
                <div key={item} className="public-profile-placeholder-card">
                  <div className="public-profile-placeholder-image" />
                  <div className="public-profile-placeholder-line public-profile-placeholder-line-title" />
                  <div className="public-profile-placeholder-line" />
                  <div className="public-profile-placeholder-line public-profile-placeholder-line-short" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="public-profile-recipe-grid">
            {recipes.map((recipe) => (
              <RecipeGridCard
                key={recipe.recipeid}
                recipe={recipe}
                onClick={() => navigate(`/recipes/${recipe.recipeid}`)}
                cardClassName="public-profile-recipe-card"
                transitionDuration={0.3}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
