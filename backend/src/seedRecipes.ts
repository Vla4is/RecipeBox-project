import { Pool, PoolClient } from "pg";
import fs from "fs";
import path from "path";

type Difficulty = "EASY" | "MEDIUM" | "HARD";
type Unit = "G" | "KG" | "ML" | "L" | "TSP" | "TBSP" | "CUP" | "PCS";
type RecipeDietType = "NONE" | "VEGETARIAN" | "VEGAN";

interface SeedDataset {
  source: string;
  fetchedAt: string;
  recipes: RecipeSeed[];
}

interface RecipeSeed {
  sourceId: string;
  title: string;
  description: string;
  imageUrl: string;
  thumbnailUrl: string;
  originalImageUrl: string | null;
  sourceUrl: string | null;
  youtubeUrl: string | null;
  category: string | null;
  area: string | null;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: Difficulty;
  dietType: RecipeDietType;
  tags: string[];
  ingredients: RecipeIngredientSeed[];
  steps: RecipeStepSeed[];
  daysAgo: number;
}

interface RecipeIngredientSeed {
  name: string;
  amount: number | null;
  unit: Unit | null;
  defaultUnit: Unit;
  notes: string | null;
}

interface RecipeStepSeed {
  instruction: string;
  timerSec: number | null;
}

const DATASET_PATH = path.resolve(__dirname, "../seed-data/themealdb-recipes.json");

function loadSeedDataset(): SeedDataset {
  if (!fs.existsSync(DATASET_PATH)) {
    throw new Error(`Missing TheMealDB seed snapshot at ${DATASET_PATH}`);
  }

  const parsed = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8")) as SeedDataset;
  if (!Array.isArray(parsed.recipes) || parsed.recipes.length === 0) {
    throw new Error(`TheMealDB seed snapshot has no recipes: ${DATASET_PATH}`);
  }

  return parsed;
}

async function loadIngredientCache(client: PoolClient): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const res = await client.query(`SELECT ingredientid, name FROM ingredients`);

  for (const row of res.rows as Array<{ ingredientid: string; name: string }>) {
    cache.set(row.name.toLowerCase(), row.ingredientid);
  }

  return cache;
}

async function ensureIngredient(
  client: PoolClient,
  ingredientCache: Map<string, string>,
  ingredient: RecipeIngredientSeed
): Promise<string> {
  const key = ingredient.name.toLowerCase();
  const cached = ingredientCache.get(key);
  if (cached) return cached;

  const insert = await client.query(
    `INSERT INTO ingredients (name, default_unit)
     VALUES ($1, $2::unit_enum)
     RETURNING ingredientid`,
    [ingredient.name, ingredient.defaultUnit]
  );

  const id = insert.rows[0].ingredientid as string;
  ingredientCache.set(key, id);
  return id;
}

function createdAtFor(recipe: RecipeSeed): Date {
  const safeDaysAgo = Number.isFinite(recipe.daysAgo) ? Math.max(0, recipe.daysAgo) : 0;
  return new Date(Date.now() - safeDaysAgo * 24 * 60 * 60 * 1000);
}

async function insertRecipeGraph(
  client: PoolClient,
  recipe: RecipeSeed,
  ingredientCache: Map<string, string>
): Promise<void> {
  const createdAt = createdAtFor(recipe);

  const recipeInsert = await client.query(
    `INSERT INTO recipes (
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
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8::recipe_diet_enum,
       $9,
       $10::difficulty_enum,
       'PUBLIC'::visibility_enum,
       $11,
       $11
     )
     RETURNING recipeid`,
    [
      recipe.title,
      recipe.description,
      recipe.imageUrl,
      recipe.thumbnailUrl,
      recipe.youtubeUrl,
      recipe.prepTime,
      recipe.cookTime,
      recipe.dietType,
      recipe.servings,
      recipe.difficulty,
      createdAt,
    ]
  );

  const recipeId = recipeInsert.rows[0].recipeid as string;

  for (const tag of recipe.tags) {
    await client.query(`INSERT INTO tags (recipeid, name) VALUES ($1::uuid, $2)`, [recipeId, tag]);
  }

  for (let i = 0; i < recipe.steps.length; i += 1) {
    const step = recipe.steps[i];
    await client.query(
      `INSERT INTO steps (recipeid, stepno, instruction, timersec)
       VALUES ($1::uuid, $2, $3, $4)`,
      [recipeId, i + 1, step.instruction, step.timerSec]
    );
  }

  for (const ingredient of recipe.ingredients) {
    const ingredientId = await ensureIngredient(client, ingredientCache, ingredient);

    await client.query(
      `INSERT INTO recipe_ingredients (recipeid, ingredientid, amount, unit, notes)
       VALUES ($1::uuid, $2::uuid, $3, $4::unit_enum, $5)`,
      [recipeId, ingredientId, ingredient.amount, ingredient.unit, ingredient.notes]
    );
  }
}

export default async function seedRecipes(pool: Pool): Promise<void> {
  const dataset = loadSeedDataset();
  const targetRecipeCount = dataset.recipes.length;
  const recipeCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM recipes`);
  const existingRecipeCount = Number(recipeCountRes.rows[0].count || 0);

  if (existingRecipeCount >= targetRecipeCount) {
    console.log(`Skipping TheMealDB seed. Existing recipes: ${existingRecipeCount}`);
    return;
  }

  const recipesToCreate = dataset.recipes.slice(existingRecipeCount);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const ingredientCache = await loadIngredientCache(client);

    for (const recipe of recipesToCreate) {
      await insertRecipeGraph(client, recipe, ingredientCache);
    }

    await client.query("COMMIT");
    console.log(
      `Auto-seeded ${recipesToCreate.length} real recipes from ${dataset.source} snapshot (${dataset.fetchedAt}).`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
