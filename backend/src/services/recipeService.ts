import pool from "../database";

export interface RecipeRow {
  recipeid: string;
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
      `INSERT INTO recipes (title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7::difficulty_enum, $8::visibility_enum)
       RETURNING recipeid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at`,
      [
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
