import pool from "../database";

export interface RecipeRow {
  recipeid: string;
  userid: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  youtube_url: string | null;
  proptimemin: number | null;
  cooktimemin: number | null;
  diet_type: RecipeDietType;
  servings: number | null;
  difficulty: string | null;
  visibility: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RecipeAuthor {
  userid: string;
  nickname: string;
  name: string;
  avatar_url: string | null;
}

export type RecipeDietType = "NONE" | "VEGETARIAN" | "VEGAN";

export function normalizeRecipeDietType(value: unknown): RecipeDietType {
  const normalized = typeof value === "string" ? value.toUpperCase() : "NONE";
  if (normalized === "VEGAN") return "VEGAN";
  if (normalized === "VEGETARIAN") return "VEGETARIAN";
  return "NONE";
}

export interface RecipeDetailIngredient {
  recipeingredientid: string;
  ingredientid: string;
  name: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
}

export interface RecipeDetailStep {
  stepid: string;
  stepno: number;
  instruction: string;
  timersec: number | null;
}

export interface RecipeDetail {
  recipe: RecipeRow;
  author: RecipeAuthor | null;
  ingredients: RecipeDetailIngredient[];
  steps: RecipeDetailStep[];
  tags: string[];
}

export interface RecipeRatingSummary {
  averageRating: number;
  totalRatings: number;
  userRating: number | null;
}

export async function getPublicRecipes(): Promise<RecipeRow[]> {
  const res = await pool.query(
    `SELECT recipeid, title, description, image_url, thumbnail_url, youtube_url, proptimemin, cooktimemin, diet_type, servings, difficulty, visibility, created_at, updated_at
     FROM recipes
     WHERE visibility = 'PUBLIC'
     ORDER BY created_at DESC`
  );
  return res.rows;
}

export interface RecipeTimeRanges {
  minTotalTime: number;
  maxTotalTime: number;
}

export interface HomeTagSection {
  tag: string;
  totalRecipes: number;
  recipes: RecipeRow[];
}

export interface HomeTagSectionsInput {
  tagLimit?: number;
  recipesPerTag?: number;
}

export async function getHomeTagSections(input: HomeTagSectionsInput = {}): Promise<HomeTagSection[]> {
  const safeTagLimit = Math.min(Math.max(input.tagLimit ?? 5, 1), 10);
  const safeRecipesPerTag = Math.min(Math.max(input.recipesPerTag ?? 8, 1), 16);

  const res = await pool.query(
    `WITH recipe_popularity AS (
       SELECT recipeid,
              SUM(weight)::float AS popularity_score
       FROM (
         SELECT recipeid,
                CASE event_type
                  WHEN 'VIEW' THEN 1
                  WHEN 'CLICK' THEN 2
                  WHEN 'SAVE' THEN 4
                  ELSE 0
                END AS weight
         FROM user_recipe_events
         UNION ALL
         SELECT recipeid,
                CASE event_type
                  WHEN 'VIEW' THEN 1
                  WHEN 'CLICK' THEN 2
                  WHEN 'SAVE' THEN 4
                  ELSE 0
                END AS weight
         FROM anonymous_recipe_events
       ) all_events
       GROUP BY recipeid
     ),
     top_tags AS (
       SELECT LOWER(t.name) AS tag,
              COUNT(DISTINCT t.recipeid)::int AS recipe_count,
              COALESCE(SUM(rp.popularity_score), 0)::float AS tag_popularity
       FROM tags t
       JOIN recipes r ON r.recipeid = t.recipeid
       LEFT JOIN recipe_popularity rp ON rp.recipeid = t.recipeid
       WHERE r.visibility = 'PUBLIC'
       GROUP BY LOWER(t.name)
       ORDER BY (COALESCE(SUM(rp.popularity_score), 0) + COUNT(DISTINCT t.recipeid) * 2) DESC,
                LOWER(t.name) ASC
       LIMIT $1
     ),
     tagged_recipes AS (
       SELECT DISTINCT
         LOWER(t.name) AS tag,
         tt.recipe_count,
         r.recipeid,
         r.userid,
         r.title,
        r.description,
        r.image_url,
        r.thumbnail_url,
        r.youtube_url,
         r.proptimemin,
         r.cooktimemin,
         r.diet_type,
         r.servings,
         r.difficulty,
         r.visibility,
         r.created_at,
         r.updated_at,
         COALESCE(rp.popularity_score, 0)::float AS popularity_score
       FROM top_tags tt
       JOIN tags t ON LOWER(t.name) = tt.tag
       JOIN recipes r ON r.recipeid = t.recipeid
       LEFT JOIN recipe_popularity rp ON rp.recipeid = r.recipeid
       WHERE r.visibility = 'PUBLIC'
     ),
     ranked AS (
       SELECT tr.*, ROW_NUMBER() OVER (
         PARTITION BY tr.tag
         ORDER BY tr.popularity_score DESC, tr.created_at DESC
       ) AS rank_in_tag
       FROM tagged_recipes tr
     )
     SELECT tag,
            recipe_count,
            recipeid,
            userid,
            title,
            description,
            image_url,
            thumbnail_url,
            youtube_url,
            proptimemin,
            cooktimemin,
            diet_type,
            servings,
            difficulty,
            visibility,
            created_at,
            updated_at
     FROM ranked
     WHERE rank_in_tag <= $2
     ORDER BY tag ASC, rank_in_tag ASC`,
    [safeTagLimit, safeRecipesPerTag]
  );

  const grouped = new Map<string, HomeTagSection>();
  for (const row of res.rows as Array<RecipeRow & { tag: string; recipe_count: number }>) {
    const existing = grouped.get(row.tag);
    const recipe: RecipeRow = {
      recipeid: row.recipeid,
      userid: row.userid,
      title: row.title,
      description: row.description,
      image_url: row.image_url,
      thumbnail_url: row.thumbnail_url,
      youtube_url: row.youtube_url,
      proptimemin: row.proptimemin,
      cooktimemin: row.cooktimemin,
      diet_type: normalizeRecipeDietType(row.diet_type),
      servings: row.servings,
      difficulty: row.difficulty,
      visibility: row.visibility,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    if (!existing) {
      grouped.set(row.tag, {
        tag: row.tag,
        totalRecipes: Number(row.recipe_count) || 0,
        recipes: [recipe],
      });
      continue;
    }

    existing.recipes.push(recipe);
  }

  return Array.from(grouped.values());
}

export async function getRecipeTimeRanges(userid?: string): Promise<RecipeTimeRanges> {
  const res = await pool.query(
    `SELECT
       COALESCE(MIN(r.totaltimemin), 0) AS "minTotalTime",
       COALESCE(MAX(r.totaltimemin), 0) AS "maxTotalTime"
     FROM recipes r
     WHERE (r.visibility = 'PUBLIC' OR ($1::uuid IS NOT NULL AND r.userid = $1::uuid))`,
    [userid ?? null]
  );

  const row = res.rows[0] as Record<string, unknown>;
  return {
    minTotalTime: Number(row.minTotalTime ?? 0),
    maxTotalTime: Number(row.maxTotalTime ?? 0),
  };
}

export async function getRecipeDetails(recipeId: string, userid?: string): Promise<RecipeDetail | null> {
  const recipeRes = await pool.query(
    `SELECT r.recipeid,
            r.userid,
            r.title,
            r.description,
            r.image_url,
            r.thumbnail_url,
            r.youtube_url,
            r.proptimemin,
            r.cooktimemin,
            r.diet_type,
            r.servings,
            r.difficulty,
            r.visibility,
            r.created_at,
            r.updated_at,
            u.userid AS author_userid,
            u.nickname AS author_nickname,
            u.name AS author_name,
            u.avatar_url AS author_avatar_url
     FROM recipes r
     LEFT JOIN users u ON u.userid = r.userid
     WHERE r.recipeid = $1 AND (r.visibility = 'PUBLIC' OR ($2::uuid IS NOT NULL AND r.userid = $2::uuid))`,
    [recipeId, userid ?? null]
  );

  if (recipeRes.rows.length === 0) {
    return null;
  }

  const row = recipeRes.rows[0] as RecipeRow & {
    author_userid: string | null;
    author_nickname: string | null;
    author_name: string | null;
    author_avatar_url: string | null;
  };
  const recipe: RecipeRow = {
    recipeid: row.recipeid,
    userid: row.userid,
    title: row.title,
    description: row.description,
    image_url: row.image_url,
    thumbnail_url: row.thumbnail_url,
    youtube_url: row.youtube_url,
    proptimemin: row.proptimemin,
    cooktimemin: row.cooktimemin,
    diet_type: normalizeRecipeDietType(row.diet_type),
    servings: row.servings,
    difficulty: row.difficulty,
    visibility: row.visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const ingredientsRes = await pool.query(
    `SELECT ri.recipeingredientid, i.ingredientid, i.name, ri.amount, ri.unit, ri.notes
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.ingredientid = ri.ingredientid
     WHERE ri.recipeid = $1
     ORDER BY i.name ASC`,
    [recipeId]
  );

  const stepsRes = await pool.query(
    `SELECT stepid, stepno, instruction, timersec
     FROM steps
     WHERE recipeid = $1
     ORDER BY stepno ASC`,
    [recipeId]
  );

  const tagsRes = await pool.query(
    `SELECT name
     FROM tags
     WHERE recipeid = $1
     ORDER BY name ASC`,
    [recipeId]
  );

  return {
    recipe,
    author: row.author_userid && row.author_nickname && row.author_name
      ? {
          userid: row.author_userid,
          nickname: row.author_nickname,
          name: row.author_name,
          avatar_url: row.author_avatar_url ?? null,
        }
      : null,
    ingredients: ingredientsRes.rows,
    steps: stepsRes.rows,
    tags: tagsRes.rows.map((row) => row.name),
  };
}

export async function getRecipeRatingSummary(recipeId: string, userid?: string): Promise<RecipeRatingSummary> {
  const res = await pool.query(
    `SELECT
       COALESCE(AVG(stars)::float, 0) AS average_rating,
       COUNT(*)::int AS total_ratings,
       MAX(CASE WHEN userid = $2::uuid THEN stars ELSE NULL END)::int AS user_rating
     FROM reviews
     WHERE recipeid = $1::uuid`,
    [recipeId, userid ?? null]
  );

  const row = res.rows[0] as { average_rating: number | null; total_ratings: number; user_rating: number | null };
  return {
    averageRating: Number(row.average_rating || 0),
    totalRatings: Number(row.total_ratings || 0),
    userRating: row.user_rating == null ? null : Number(row.user_rating),
  };
}

export async function setRecipeRating(userid: string, recipeId: string, stars: number, comment?: string): Promise<void> {
  await pool.query(
    `INSERT INTO reviews (userid, recipeid, stars, comment)
     VALUES ($1::uuid, $2::uuid, $3::int, $4)
     ON CONFLICT (userid, recipeid)
     DO UPDATE SET
       stars = EXCLUDED.stars,
       comment = COALESCE(EXCLUDED.comment, reviews.comment),
       created_at = CURRENT_TIMESTAMP`,
    [userid, recipeId, stars, comment ?? null]
  );
}

export interface CreateRecipeInput {
  userid?: string;
  title: string;
  description?: string;
  image_url?: string;
  thumbnail_url?: string;
  youtube_url?: string;
  prepTimeMin?: number;
  cookTimeMin?: number;
  dietType?: RecipeDietType;
  servings?: number;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  visibility?: "PRIVATE" | "PUBLIC";
  steps?: Array<{ instruction: string; timerSec?: number }>;
  ingredients?: Array<{ name: string; amount?: number; unit?: string; notes?: string }>;
  tags?: string[];
}

export async function createRecipe(input: CreateRecipeInput): Promise<RecipeRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert main recipe
    const recipeRes = await client.query(
      `INSERT INTO recipes (userid, title, description, image_url, thumbnail_url, youtube_url, proptimemin, cooktimemin, diet_type, servings, difficulty, visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::recipe_diet_enum, $10, $11::difficulty_enum, $12::visibility_enum)
       RETURNING recipeid, userid, title, description, image_url, thumbnail_url, youtube_url, proptimemin, cooktimemin, diet_type, servings, difficulty, visibility, created_at, updated_at`,
      [
        input.userid || null,
        input.title,
        input.description || null,
        input.image_url || null,
        input.thumbnail_url || null,
        input.youtube_url || null,
        input.prepTimeMin ?? null,
        input.cookTimeMin ?? null,
        normalizeRecipeDietType(input.dietType),
        input.servings ?? null,
        input.difficulty || "EASY",
        input.visibility || "PUBLIC",
      ]
    );
    const recipe = recipeRes.rows[0];
    const recipeId = recipe.recipeid;

    // Insert steps
    if (input.steps && input.steps.length > 0) {
      for (let i = 0; i < input.steps.length; i++) {
        const step = input.steps[i];
        await client.query(
          `INSERT INTO steps (recipeid, stepno, instruction, timersec)
           VALUES ($1, $2, $3, $4)`,
          [recipeId, i + 1, step.instruction, step.timerSec ?? null]
        );
      }
    }

    // Insert ingredients (simplified - creates ingredient if not exists)
    if (input.ingredients && input.ingredients.length > 0) {
      for (const ing of input.ingredients) {
        // Check if ingredient exists
        let ingredientRes = await client.query(
          `SELECT ingredientid FROM ingredients WHERE LOWER(name) = LOWER($1)`,
          [ing.name]
        );
        
        let ingredientId: string;
        if (ingredientRes.rows.length > 0) {
          ingredientId = ingredientRes.rows[0].ingredientid;
        } else {
          // Create new ingredient with default unit
          const newIngRes = await client.query(
            `INSERT INTO ingredients (name, default_unit) VALUES ($1, $2::unit_enum) RETURNING ingredientid`,
            [ing.name, ing.unit || 'G']
          );
          ingredientId = newIngRes.rows[0].ingredientid;
        }

        // Link ingredient to recipe
        await client.query(
          `INSERT INTO recipe_ingredients (recipeid, ingredientid, amount, unit, notes)
           VALUES ($1, $2, $3, $4::unit_enum, $5)`,
          [recipeId, ingredientId, ing.amount ?? null, ing.unit || null, ing.notes || null]
        );
      }
    }

    // Insert tags
    if (input.tags && input.tags.length > 0) {
      for (const tagName of input.tags) {
        if (tagName.trim()) {
          await client.query(
            `INSERT INTO tags (recipeid, name) VALUES ($1, $2)`,
            [recipeId, tagName.trim()]
          );
        }
      }
    }

    await client.query('COMMIT');
    return recipe;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserRecipes(userid: string): Promise<RecipeRow[]> {
  const res = await pool.query(
    `SELECT recipeid, userid, title, description, image_url, thumbnail_url, youtube_url, proptimemin, cooktimemin, diet_type, servings, difficulty, visibility, created_at, updated_at
     FROM recipes
     WHERE userid = $1
     ORDER BY created_at DESC`,
    [userid]
  );
  return res.rows;
}

export async function getSavedRecipes(userid: string): Promise<RecipeRow[]> {
  const res = await pool.query(
    `SELECT r.recipeid, r.userid, r.title, r.description, r.image_url, r.thumbnail_url, r.youtube_url, r.proptimemin, r.cooktimemin, r.diet_type, r.servings, r.difficulty, r.visibility, r.created_at, r.updated_at
     FROM favorites f
     JOIN recipes r ON r.recipeid = f.recipeid
     WHERE f.userid = $1::uuid
       AND (r.visibility = 'PUBLIC' OR r.userid = $1::uuid)
     ORDER BY f.saved_at DESC`,
    [userid]
  );

  return res.rows;
}

export async function isRecipeSaved(userid: string, recipeId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1
     FROM favorites
     WHERE userid = $1::uuid AND recipeid = $2::uuid
     LIMIT 1`,
    [userid, recipeId]
  );

  return res.rows.length > 0;
}

export async function saveRecipeForUser(userid: string, recipeId: string): Promise<boolean> {
  const res = await pool.query(
    `INSERT INTO favorites (userid, recipeid)
     SELECT $1::uuid, $2::uuid
     WHERE EXISTS (
       SELECT 1
       FROM recipes r
       WHERE r.recipeid = $2::uuid
         AND (r.visibility = 'PUBLIC' OR r.userid = $1::uuid)
     )
       AND NOT EXISTS (
         SELECT 1
         FROM favorites f
         WHERE f.userid = $1::uuid AND f.recipeid = $2::uuid
       )
     RETURNING favoriteid`,
    [userid, recipeId]
  );

  return res.rows.length > 0;
}

export async function removeSavedRecipeForUser(userid: string, recipeId: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM favorites
     WHERE userid = $1::uuid AND recipeid = $2::uuid`,
    [userid, recipeId]
  );

  return (res.rowCount ?? 0) > 0;
}

export async function getRecipeDetailsForOwner(recipeId: string, userid: string): Promise<RecipeDetail | null> {
  const recipeRes = await pool.query(
    `SELECT r.recipeid,
            r.userid,
            r.title,
            r.description,
            r.image_url,
            r.thumbnail_url,
            r.youtube_url,
            r.proptimemin,
            r.cooktimemin,
            r.diet_type,
            r.servings,
            r.difficulty,
            r.visibility,
            r.created_at,
            r.updated_at,
            u.userid AS author_userid,
            u.nickname AS author_nickname,
            u.name AS author_name,
            u.avatar_url AS author_avatar_url
     FROM recipes r
     LEFT JOIN users u ON u.userid = r.userid
     WHERE r.recipeid = $1 AND r.userid = $2`,
    [recipeId, userid]
  );

  if (recipeRes.rows.length === 0) return null;
  const row = recipeRes.rows[0] as RecipeRow & {
    author_userid: string | null;
    author_nickname: string | null;
    author_name: string | null;
    author_avatar_url: string | null;
  };
  const recipe: RecipeRow = {
    recipeid: row.recipeid,
    userid: row.userid,
    title: row.title,
    description: row.description,
    image_url: row.image_url,
    thumbnail_url: row.thumbnail_url,
    youtube_url: row.youtube_url,
    proptimemin: row.proptimemin,
    cooktimemin: row.cooktimemin,
    diet_type: normalizeRecipeDietType(row.diet_type),
    servings: row.servings,
    difficulty: row.difficulty,
    visibility: row.visibility,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const ingredientsRes = await pool.query(
    `SELECT ri.recipeingredientid, i.ingredientid, i.name, ri.amount, ri.unit, ri.notes
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.ingredientid = ri.ingredientid
     WHERE ri.recipeid = $1
     ORDER BY i.name ASC`,
    [recipeId]
  );

  const stepsRes = await pool.query(
    `SELECT stepid, stepno, instruction, timersec
     FROM steps WHERE recipeid = $1 ORDER BY stepno ASC`,
    [recipeId]
  );

  const tagsRes = await pool.query(
    `SELECT name FROM tags WHERE recipeid = $1 ORDER BY name ASC`,
    [recipeId]
  );

  return {
    recipe,
    author: row.author_userid && row.author_nickname && row.author_name
      ? {
          userid: row.author_userid,
          nickname: row.author_nickname,
          name: row.author_name,
          avatar_url: row.author_avatar_url ?? null,
        }
      : null,
    ingredients: ingredientsRes.rows,
    steps: stepsRes.rows,
    tags: tagsRes.rows.map((row) => row.name),
  };
}

export async function getPublicRecipesByUser(userid: string): Promise<RecipeRow[]> {
  const res = await pool.query(
    `SELECT recipeid, userid, title, description, image_url, thumbnail_url, youtube_url, proptimemin, cooktimemin, diet_type, servings, difficulty, visibility, created_at, updated_at
     FROM recipes
     WHERE userid = $1::uuid AND visibility = 'PUBLIC'
     ORDER BY created_at DESC`,
    [userid]
  );

  return res.rows;
}

export async function updateRecipe(recipeId: string, userid: string, input: CreateRecipeInput): Promise<RecipeRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify ownership
    const check = await client.query(
      `SELECT recipeid FROM recipes WHERE recipeid = $1 AND userid = $2`,
      [recipeId, userid]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // Update main recipe
    const recipeRes = await client.query(
      `UPDATE recipes SET title = $1, description = $2, image_url = $3, thumbnail_url = $4, youtube_url = $5, proptimemin = $6, cooktimemin = $7, diet_type = $8::recipe_diet_enum, servings = $9, difficulty = $10::difficulty_enum, visibility = $11::visibility_enum, updated_at = CURRENT_TIMESTAMP
       WHERE recipeid = $12 AND userid = $13
       RETURNING recipeid, userid, title, description, image_url, thumbnail_url, youtube_url, proptimemin, cooktimemin, diet_type, servings, difficulty, visibility, created_at, updated_at`,
      [
        input.title,
        input.description || null,
        input.image_url || null,
        input.thumbnail_url || null,
        input.youtube_url || null,
        input.prepTimeMin ?? null,
        input.cookTimeMin ?? null,
        normalizeRecipeDietType(input.dietType),
        input.servings ?? null,
        input.difficulty || "EASY",
        input.visibility || "PUBLIC",
        recipeId,
        userid,
      ]
    );
    const recipe = recipeRes.rows[0];

    // Delete old steps, ingredients, tags and re-insert
    await client.query(`DELETE FROM steps WHERE recipeid = $1`, [recipeId]);
    await client.query(`DELETE FROM recipe_ingredients WHERE recipeid = $1`, [recipeId]);
    await client.query(`DELETE FROM tags WHERE recipeid = $1`, [recipeId]);

    // Insert steps
    if (input.steps && input.steps.length > 0) {
      for (let i = 0; i < input.steps.length; i++) {
        const step = input.steps[i];
        await client.query(
          `INSERT INTO steps (recipeid, stepno, instruction, timersec) VALUES ($1, $2, $3, $4)`,
          [recipeId, i + 1, step.instruction, step.timerSec ?? null]
        );
      }
    }

    // Insert ingredients
    if (input.ingredients && input.ingredients.length > 0) {
      for (const ing of input.ingredients) {
        let ingredientRes = await client.query(
          `SELECT ingredientid FROM ingredients WHERE LOWER(name) = LOWER($1)`,
          [ing.name]
        );
        let ingredientId: string;
        if (ingredientRes.rows.length > 0) {
          ingredientId = ingredientRes.rows[0].ingredientid;
        } else {
          const newIngRes = await client.query(
            `INSERT INTO ingredients (name, default_unit) VALUES ($1, $2::unit_enum) RETURNING ingredientid`,
            [ing.name, ing.unit || 'G']
          );
          ingredientId = newIngRes.rows[0].ingredientid;
        }
        await client.query(
          `INSERT INTO recipe_ingredients (recipeid, ingredientid, amount, unit, notes) VALUES ($1, $2, $3, $4::unit_enum, $5)`,
          [recipeId, ingredientId, ing.amount ?? null, ing.unit || null, ing.notes || null]
        );
      }
    }

    // Insert tags
    if (input.tags && input.tags.length > 0) {
      for (const tagName of input.tags) {
        if (tagName.trim()) {
          await client.query(
            `INSERT INTO tags (recipeid, name) VALUES ($1, $2)`,
            [recipeId, tagName.trim()]
          );
        }
      }
    }

    await client.query('COMMIT');
    return recipe;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteRecipe(recipeId: string, userid: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM recipes WHERE recipeid = $1 AND userid = $2`,
    [recipeId, userid]
  );
  return (res.rowCount ?? 0) > 0;
}
