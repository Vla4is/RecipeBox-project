import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import RecipeGridCard from "./RecipeGridCard";
import { getProfileHeroTheme } from "./profileHeroThemes";
import "./App.css";

type PublicProfile = {
  name: string;
  nickname: string;
  avatar_url: string | null;
  background_image_url: string | null;
  hero_color_key: string;
  isPremium: boolean;
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

  const handleBackToPrevious = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  useEffect(() => {
    const handle = (nickname || "").replace(/^@/, "").trim();
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
      <div className="profile-shell public-profile-shell">
        <div className="rd-state">
          <div className="rd-spinner" />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-shell public-profile-shell">
        <div className="rd-state">
          <p className="rd-state-msg">{error || "Profile not found"}</p>
        </div>
      </div>
    );
  }

  const heroTheme = getProfileHeroTheme(profile.hero_color_key);
  const heroStyle = profile.background_image_url
    ? { backgroundImage: `url(${profile.background_image_url})` }
    : { backgroundImage: heroTheme.gradient, backgroundColor: heroTheme.solid };
  const joinedDate = new Date(profile.createdAt);
  const joinedDateLabel = joinedDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const joinedMonth = joinedDate.toLocaleDateString(undefined, { month: "short" });
  const joinedDay = joinedDate.toLocaleDateString(undefined, { day: "numeric" });
  const joinedYear = joinedDate.toLocaleDateString(undefined, { year: "numeric" });
  const hasRecipes = recipes.length > 0;
  const displayName = profile.name?.trim() || `@${profile.nickname}`;

  return (
    <div className="profile-shell public-profile-shell">
      <motion.section
        className="rd-hero public-profile-hero"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.55 }}
      >
        <div className="rd-hero-img public-profile-hero-media" style={heroStyle} aria-hidden="true" />
        <div className="rd-hero-fade public-profile-hero-fade" />

        <div className="rd-hero-inner public-profile-hero-inner">
          <div className="rd-hero-top public-profile-hero-top">
            <button
              type="button"
              className="rd-back rd-back-btn"
              onClick={handleBackToPrevious}
            >
              <span className="rd-back-arrow">←</span> Back
            </button>

            {/* <span className="rd-save-btn public-profile-top-chip" aria-label="Public profile">
              Public profile
            </span> */}
          </div>

          <div className="public-profile-identity">
            <motion.div
              className="rd-author-strip public-profile-author-strip"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.12 }}
            >
              <div className="rd-author-link public-profile-author-card">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.nickname} className="rd-author-avatar public-profile-author-avatar" />
                ) : (
                  <span className="rd-author-avatar rd-author-avatar-fallback public-profile-author-avatar">
                    {profile.nickname.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="rd-author-copy ">
                  <span className="rd-author-label">Cookbook creator</span>
                  <span className="author-nickname-row">
                    <strong className="rd-author-nickname">@{profile.nickname}</strong>
                    {profile.isPremium ? (
                      <span className="premium-check-badge" aria-label="Premium member" title="Premium member">
                        ✓
                      </span>
                    ) : null}
                  </span>
                </span>
              </div>
            </motion.div>

            <motion.h1
              className="rd-title public-profile-title"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.15 }}
            >
              {displayName}
            </motion.h1>

            <motion.p
              className="rd-desc public-profile-desc"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.28 }}
            >
              {hasRecipes
                ? `Explore ${recipes.length} public recipe${recipes.length === 1 ? "" : "s"} shared by @${profile.nickname}.`
                : `@${profile.nickname} has not published recipes yet.`}
            </motion.p>

            <motion.div
              className="rd-pills public-profile-pills"
              aria-label="Profile stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.38 }}
            >
              <div className="rd-pill public-profile-pill">
                <span className="rd-pill-icon public-profile-pill-seal" aria-hidden="true">
                  <strong>{recipes.length}</strong>
                </span>
                <div className="public-profile-pill-copy">
                  <small>Public recipes</small>
                  <strong>{recipes.length === 1 ? "One dish shared" : "Shared cookbook"}</strong>
                </div>
              </div>
              <div className="rd-pill public-profile-pill">
                <span className="rd-pill-icon public-profile-pill-date" aria-hidden="true">
                  <small>{joinedMonth}</small>
                  <strong>{joinedDay}</strong>
                </span>
                <div className="public-profile-pill-copy">
                  <small>Joined {joinedYear}</small>
                  <strong>{joinedDateLabel}</strong>
                </div>
              </div>
            </motion.div>
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
              <span className="my-recipes-empty-icon">RC</span>
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
