import pool from "../database";
import type { RecipeRow } from "./recipeService";

export interface SearchRecipesInput {
  searchTerm?: string;
  userid?: string;
  maxPrepTime?: number;
  maxCookTime?: number;
  difficulties?: Array<"EASY" | "MEDIUM" | "HARD">;
  limit?: number;
}

export async function searchRecipes(input: SearchRecipesInput): Promise<RecipeRow[]> {
  const normalizedTerm = (input.searchTerm || "").trim();
  const pattern = `%${normalizedTerm}%`;
  const maxPrep = Number.isFinite(input.maxPrepTime) ? input.maxPrepTime : null;
  const maxCook = Number.isFinite(input.maxCookTime) ? input.maxCookTime : null;
  const difficulties = (input.difficulties || []).filter((d) => ["EASY", "MEDIUM", "HARD"].includes(d));
  const safeLimit = Math.min(Math.max(input.limit ?? 120, 1), 300);

  const res = await pool.query(
    `SELECT r.recipeid, r.userid, r.title, r.description, r.image_url, r.proptimemin, r.cooktimemin, r.servings, r.difficulty, r.visibility, r.created_at, r.updated_at
     FROM recipes r
     LEFT JOIN (
       SELECT recipeid,
              ((AVG(stars)::float - 1) / 4) * (COUNT(*)::float / (COUNT(*)::float + 4)) AS rating_score
       FROM reviews
       GROUP BY recipeid
     ) rating ON rating.recipeid = r.recipeid
     WHERE (r.visibility = 'PUBLIC' OR ($1::uuid IS NOT NULL AND r.userid = $1::uuid))
       AND (
         $2::text = ''
         OR EXISTS (
           SELECT 1
           FROM tags t
           WHERE t.recipeid = r.recipeid
             AND t.name ILIKE $3
         )
         OR r.title ILIKE $3
         OR COALESCE(r.description, '') ILIKE $3
       )
       AND ($4::int IS NULL OR COALESCE(r.proptimemin, 0) <= $4)
       AND ($5::int IS NULL OR COALESCE(r.cooktimemin, 0) <= $5)
       AND (COALESCE(array_length($6::difficulty_enum[], 1), 0) = 0 OR r.difficulty = ANY($6::difficulty_enum[]))
     ORDER BY
       CASE
         WHEN $2::text = '' THEN 0
         WHEN EXISTS (
           SELECT 1
           FROM tags t_exact
           WHERE t_exact.recipeid = r.recipeid
             AND LOWER(t_exact.name) = LOWER($2)
         ) THEN 0
         WHEN EXISTS (
           SELECT 1
           FROM tags t_like
           WHERE t_like.recipeid = r.recipeid
             AND t_like.name ILIKE $3
         ) THEN 1
         WHEN r.title ILIKE $3 THEN 2
         WHEN COALESCE(r.description, '') ILIKE $3 THEN 3
         ELSE 4
       END,
       CASE
         WHEN $1::uuid IS NOT NULL THEN COALESCE(rating.rating_score, 0)
         ELSE 0
       END DESC,
       r.created_at DESC
     LIMIT $7`,
    [input.userid ?? null, normalizedTerm, pattern, maxPrep, maxCook, difficulties, safeLimit]
  );

  return res.rows;
}
