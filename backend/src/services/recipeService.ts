import pool from "../database";

export interface RecipeRow {
  recipeid: string;
  userid: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  proptimemin: number | null;
  cooktimemin: number | null;
  servings: number | null;
  difficulty: string | null;
  visibility: string | null;
  created_at: Date;
  updated_at: Date;
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
  ingredients: RecipeDetailIngredient[];
  steps: RecipeDetailStep[];
  tags: string[];
}

export async function getPublicRecipes(): Promise<RecipeRow[]> {
  const res = await pool.query(
    `SELECT recipeid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at
     FROM recipes
     WHERE visibility = 'PUBLIC'
     ORDER BY created_at DESC`
  );
  return res.rows;
}

export interface SearchRecipesInput {
  searchTerm?: string;
  userid?: string;
  maxPrepTime?: number;
  maxCookTime?: number;
  difficulties?: Array<"EASY" | "MEDIUM" | "HARD">;
  limit?: number;
}

export interface RecipeTimeRanges {
  minPrepTime: number;
  maxPrepTime: number;
  minCookTime: number;
  maxCookTime: number;
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
       r.created_at DESC
     LIMIT $7`,
    [input.userid ?? null, normalizedTerm, pattern, maxPrep, maxCook, difficulties, safeLimit]
  );

  return res.rows;
}

export async function getRecipeTimeRanges(userid?: string): Promise<RecipeTimeRanges> {
  const res = await pool.query(
    `SELECT
       COALESCE(MIN(r.proptimemin), 0) AS "minPrepTime",
       COALESCE(MAX(r.proptimemin), 0) AS "maxPrepTime",
       COALESCE(MIN(r.cooktimemin), 0) AS "minCookTime",
       COALESCE(MAX(r.cooktimemin), 0) AS "maxCookTime"
     FROM recipes r
     WHERE (r.visibility = 'PUBLIC' OR ($1::uuid IS NOT NULL AND r.userid = $1::uuid))`,
    [userid ?? null]
  );

  const row = res.rows[0] as Record<string, unknown>;
  return {
    minPrepTime: Number(row.minPrepTime ?? 0),
    maxPrepTime: Number(row.maxPrepTime ?? 0),
    minCookTime: Number(row.minCookTime ?? 0),
    maxCookTime: Number(row.maxCookTime ?? 0),
  };
}

export async function getRecipeDetails(recipeId: string): Promise<RecipeDetail | null> {
  const recipeRes = await pool.query(
    `SELECT recipeid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at
     FROM recipes
     WHERE recipeid = $1 AND visibility = 'PUBLIC'`,
    [recipeId]
  );

  if (recipeRes.rows.length === 0) {
    return null;
  }

  const recipe = recipeRes.rows[0] as RecipeRow;

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
    ingredients: ingredientsRes.rows,
    steps: stepsRes.rows,
    tags: tagsRes.rows.map((row) => row.name),
  };
}

export interface CreateRecipeInput {
  userid?: string;
  title: string;
  description?: string;
  image_url?: string;
  prepTimeMin?: number;
  cookTimeMin?: number;
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
      `INSERT INTO recipes (userid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::difficulty_enum, $9::visibility_enum)
       RETURNING recipeid, userid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at`,
      [
        input.userid || null,
        input.title,
        input.description || null,
        input.image_url || null,
        input.prepTimeMin ?? null,
        input.cookTimeMin ?? null,
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
    `SELECT recipeid, userid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at
     FROM recipes
     WHERE userid = $1
     ORDER BY created_at DESC`,
    [userid]
  );
  return res.rows;
}

export async function getRecipeDetailsForOwner(recipeId: string, userid: string): Promise<RecipeDetail | null> {
  const recipeRes = await pool.query(
    `SELECT recipeid, userid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at
     FROM recipes
     WHERE recipeid = $1 AND userid = $2`,
    [recipeId, userid]
  );

  if (recipeRes.rows.length === 0) return null;
  const recipe = recipeRes.rows[0] as RecipeRow;

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
    ingredients: ingredientsRes.rows,
    steps: stepsRes.rows,
    tags: tagsRes.rows.map((row) => row.name),
  };
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
      `UPDATE recipes SET title = $1, description = $2, image_url = $3, proptimemin = $4, cooktimemin = $5, servings = $6, difficulty = $7::difficulty_enum, visibility = $8::visibility_enum, updated_at = CURRENT_TIMESTAMP
       WHERE recipeid = $9 AND userid = $10
       RETURNING recipeid, userid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at`,
      [
        input.title,
        input.description || null,
        input.image_url || null,
        input.prepTimeMin ?? null,
        input.cookTimeMin ?? null,
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
