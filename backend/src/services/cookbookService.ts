import { getPublicRecipes, getRecipeDetails, getRecipeRatingSummary, type RecipeDetail } from "./recipeService";

export interface CookbookRecipeEntry {
  detail: RecipeDetail;
  averageRating: number;
  totalRatings: number;
}

export async function getCookbookRecipes(limit?: number): Promise<CookbookRecipeEntry[]> {
  const recipes = await getPublicRecipes();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit as number)) : recipes.length;
  const selectedRecipes = recipes
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, safeLimit);

  const cookbookRecipes = await Promise.all(
    selectedRecipes.map(async (recipe) => {
      const [detail, rating] = await Promise.all([
        getRecipeDetails(recipe.recipeid),
        getRecipeRatingSummary(recipe.recipeid),
      ]);

      if (!detail) {
        return null;
      }

      return {
        detail,
        averageRating: rating.averageRating,
        totalRatings: rating.totalRatings,
      };
    })
  );

  return cookbookRecipes.filter((entry): entry is CookbookRecipeEntry => entry !== null);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatOptionalText(value: string | null | undefined): string {
  return value ? escapeXml(value) : "";
}

function formatNumber(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function formatTagSlug(tag: string): string {
  const normalized = tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "tag";
}

function recipeToXml(entry: CookbookRecipeEntry): string {
  const { detail, averageRating, totalRatings } = entry;
  const { recipe, ingredients, steps, tags } = detail;
  const totalTime =
    (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0) > 0
      ? (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0)
      : null;

  return [
    `  <recipe id="${escapeXml(recipe.recipeid)}">`,
    `    <title>${escapeXml(recipe.title)}</title>`,
    `    <description>${formatOptionalText(recipe.description)}</description>`,
    `    <difficulty>${formatOptionalText(recipe.difficulty)}</difficulty>`,
    `    <visibility>${formatOptionalText(recipe.visibility)}</visibility>`,
    `    <servings>${formatNumber(recipe.servings)}</servings>`,
    `    <prepTimeMin>${formatNumber(recipe.proptimemin)}</prepTimeMin>`,
    `    <cookTimeMin>${formatNumber(recipe.cooktimemin)}</cookTimeMin>`,
    `    <totalTimeMin>${formatNumber(totalTime)}</totalTimeMin>`,
    `    <imageUrl>${formatOptionalText(recipe.image_url)}</imageUrl>`,
    `    <createdAt>${escapeXml(recipe.created_at.toISOString())}</createdAt>`,
    `    <updatedAt>${escapeXml(recipe.updated_at.toISOString())}</updatedAt>`,
    `    <rating average="${averageRating.toFixed(1)}" count="${totalRatings}" />`,
    `    <ingredients count="${ingredients.length}">`,
    ...ingredients.map(
      (ingredient) =>
        `      <ingredient id="${escapeXml(ingredient.ingredientid)}" amount="${formatNumber(ingredient.amount)}" unit="${formatOptionalText(ingredient.unit)}" notes="${formatOptionalText(ingredient.notes)}">${escapeXml(ingredient.name)}</ingredient>`
    ),
    `    </ingredients>`,
    `    <steps count="${steps.length}">`,
    ...steps.map(
      (step) =>
        `      <step number="${step.stepno}" timerSec="${formatNumber(step.timersec)}">${escapeXml(step.instruction)}</step>`
    ),
    `    </steps>`,
    `    <tags count="${tags.length}">`,
    ...tags.map((tag) => `      <tag slug="${escapeXml(formatTagSlug(tag))}">${escapeXml(tag)}</tag>`),
    `    </tags>`,
    `  </recipe>`,
  ].join("\n");
}

export function buildCookbookXml(recipes: CookbookRecipeEntry[]): string {
  const generatedAt = new Date().toISOString();

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<?xml-stylesheet type="text/xsl" href="/cookbook-assets/cookbook.xsl"?>`,
    `<cookbook generatedAt="${generatedAt}" recipeCount="${recipes.length}" title="Recipe Collection Cookbook">`,
    `  <meta>`,
    `    <appName>IT Systems Project</appName>`,
    `    <subtitle>Printable cookbook generated from public recipes</subtitle>`,
    `  </meta>`,
    `  <recipes>`,
    ...recipes.map(recipeToXml),
    `  </recipes>`,
    `</cookbook>`,
    ``,
  ].join("\n");
}
