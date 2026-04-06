import { motion } from "framer-motion";
import { getRecipeDietBadge } from "./recipeDiet";

type RecipeCardData = {
  recipeid: string;
  title: string;
  description: string | null;
  image_url: string | null;
  proptimemin: number | null;
  cooktimemin: number | null;
  diet_type: string | null;
  servings: number | null;
  difficulty?: string | null;
};

type RecipeGridCardProps = {
  recipe: RecipeCardData;
  onClick: () => void;
  cardClassName?: string;
  transitionDuration?: number;
  showDifficultyBadge?: boolean;
  showDescription?: boolean;
};

const DEFAULT_IMAGE = "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg";

export default function RecipeGridCard({
  recipe,
  onClick,
  cardClassName = "",
  transitionDuration = 0.4,
  showDifficultyBadge = true,
  showDescription = true,
}: RecipeGridCardProps) {
  const dietBadge = getRecipeDietBadge(recipe.diet_type);
  const totalRecipeTime = (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0);

  return (
    <motion.div
      className={`recipe-card ${cardClassName}`.trim()}
      onClick={onClick}
      whileHover={{ scale: 1.03, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: transitionDuration }}
    >
      <div className="recipe-card-img-wrap">
        <img
          src={recipe.image_url || DEFAULT_IMAGE}
          alt={recipe.title}
          className="recipe-card-img"
          loading="lazy"
          decoding="async"
        />
        {showDifficultyBadge && recipe.difficulty ? (
          <span className={`recipe-card-badge badge-${recipe.difficulty.toLowerCase()}`}>
            {recipe.difficulty}
          </span>
        ) : null}
      </div>
      <div className="recipe-card-body">
        <h3 className="recipe-card-title">{recipe.title}</h3>
        {showDescription && recipe.description ? (
          <p className="recipe-card-desc">{recipe.description}</p>
        ) : null}
        <div className="recipe-card-meta">
          {totalRecipeTime > 0 ? (
            <span className="recipe-card-meta-item">⏱️ {totalRecipeTime} min</span>
          ) : null}
          {recipe.servings != null ? (
            <span className="recipe-card-meta-item">🍽️ {recipe.servings} servings</span>
          ) : null}
          {dietBadge ? (
            <span
              className={`recipe-card-meta-item recipe-card-diet-meta ${dietBadge.className}`}
              title={dietBadge.label}
              aria-label={dietBadge.label}
            >
              {dietBadge.icon}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
