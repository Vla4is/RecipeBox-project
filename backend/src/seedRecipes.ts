import { Pool, PoolClient } from "pg";

type Difficulty = "EASY" | "MEDIUM" | "HARD";
type Unit = "G" | "KG" | "ML" | "L" | "TSP" | "TBSP" | "CUP" | "PCS";

interface IngredientSeed {
  name: string;
  defaultUnit: Unit;
}

interface RecipeBlueprint {
  title: string;
  description: string;
  imageUrl: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: Difficulty;
  tags: string[];
  ingredients: Array<{ name: string; amount: number; unit: Unit; notes?: string }>;
  steps: Array<{ instruction: string; timerSec: number }>;
  daysAgo: number;
}

const IMAGE_POOL = [
  "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg",
  "https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg",
  "https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg",
  "https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg",
  "https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg",
  "https://images.pexels.com/photos/70497/pexels-photo-70497.jpeg",
  "https://images.pexels.com/photos/262959/pexels-photo-262959.jpeg",
  "https://images.pexels.com/photos/5938/food-salad-healthy-lunch.jpg",
  "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg",
  "https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg",
  "https://images.pexels.com/photos/699953/pexels-photo-699953.jpeg",
  "https://images.pexels.com/photos/1099680/pexels-photo-1099680.jpeg",
];

const TITLE_PREFIX = [
  "Smoky",
  "Creamy",
  "Crispy",
  "Golden",
  "Zesty",
  "Fiery",
  "Rustic",
  "Tangy",
  "Savory",
  "Bold",
  "Fresh",
  "Silky",
];

const TITLE_MAIN = [
  "Chicken Bowl",
  "Beef Skillet",
  "Veggie Pasta",
  "Tofu Wrap",
  "Rice Pot",
  "Bean Stew",
  "Mushroom Toast",
  "Seafood Mix",
  "Noodle Plate",
  "Potato Bake",
  "Lentil Pot",
  "Couscous Bowl",
  "Chickpea Curry",
  "Pesto Gnocchi",
  "Spicy Tacos",
  "Garden Salad",
  "Roasted Tray",
  "Stuffed Peppers",
  "Herb Soup",
  "Sweet Crumble",
];

const CUISINE_TAGS = [
  "italian",
  "mexican",
  "mediterranean",
  "asian",
  "american",
  "middle-eastern",
  "indian",
  "thai",
  "fusion",
  "comfort-food",
];

const STYLE_TAGS = [
  "quick",
  "weeknight",
  "high-protein",
  "budget",
  "family",
  "party",
  "meal-prep",
  "spicy",
  "mild",
  "one-pot",
  "baked",
  "pan-fry",
  "healthy",
  "hearty",
  "vegetarian",
  "vegan",
  "gluten-free",
  "comfort",
  "fresh",
  "creamy",
];

const INGREDIENT_LIBRARY: IngredientSeed[] = [
  { name: "Chicken Breast", defaultUnit: "G" },
  { name: "Ground Beef", defaultUnit: "G" },
  { name: "Tofu", defaultUnit: "G" },
  { name: "Chickpeas", defaultUnit: "G" },
  { name: "Lentils", defaultUnit: "G" },
  { name: "Pasta", defaultUnit: "G" },
  { name: "Rice", defaultUnit: "G" },
  { name: "Couscous", defaultUnit: "G" },
  { name: "Tomato Sauce", defaultUnit: "ML" },
  { name: "Coconut Milk", defaultUnit: "ML" },
  { name: "Greek Yogurt", defaultUnit: "G" },
  { name: "Bell Pepper", defaultUnit: "PCS" },
  { name: "Onion", defaultUnit: "PCS" },
  { name: "Garlic", defaultUnit: "PCS" },
  { name: "Olive Oil", defaultUnit: "TBSP" },
  { name: "Butter", defaultUnit: "G" },
  { name: "Lemon", defaultUnit: "PCS" },
  { name: "Spinach", defaultUnit: "G" },
  { name: "Mushrooms", defaultUnit: "G" },
  { name: "Potato", defaultUnit: "PCS" },
  { name: "Cheese", defaultUnit: "G" },
  { name: "Chili Flakes", defaultUnit: "TSP" },
  { name: "Paprika", defaultUnit: "TSP" },
  { name: "Cumin", defaultUnit: "TSP" },
  { name: "Salt", defaultUnit: "TSP" },
  { name: "Black Pepper", defaultUnit: "TSP" },
  { name: "Flour", defaultUnit: "G" },
  { name: "Egg", defaultUnit: "PCS" },
  { name: "Milk", defaultUnit: "ML" },
  { name: "Sugar", defaultUnit: "G" },
  { name: "Basil", defaultUnit: "PCS" },
  { name: "Cilantro", defaultUnit: "PCS" },
  { name: "Parsley", defaultUnit: "PCS" },
];

const STEP_ACTIONS = [
  "Heat oil and toast aromatics",
  "Add base ingredients and stir well",
  "Simmer until flavors combine",
  "Finish with herbs and seasoning",
  "Roast until edges turn golden",
  "Fold sauce through the mixture",
  "Sear on high heat for texture",
  "Rest briefly before serving",
];

function rand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function pick<T>(arr: T[], seed: number): T {
  const index = Math.floor(rand(seed) * arr.length);
  return arr[index];
}

function uniqueTags(seed: number): string[] {
  const tags = new Set<string>();
  tags.add(pick(CUISINE_TAGS, seed + 1));
  tags.add(pick(STYLE_TAGS, seed + 2));
  tags.add(pick(STYLE_TAGS, seed + 3));
  tags.add(pick(STYLE_TAGS, seed + 4));
  tags.add(pick(STYLE_TAGS, seed + 5));
  return Array.from(tags);
}

function recipeDifficulty(index: number): Difficulty {
  if (index % 6 === 0) {
    return "HARD";
  }
  if (index % 2 === 0) {
    return "MEDIUM";
  }
  return "EASY";
}

function amountForUnit(unit: Unit, seed: number): number {
  if (unit === "PCS") {
    return 1 + Math.floor(rand(seed) * 5);
  }
  if (unit === "TSP") {
    return 1 + Math.floor(rand(seed) * 3);
  }
  if (unit === "TBSP") {
    return 1 + Math.floor(rand(seed) * 4);
  }
  if (unit === "ML") {
    return 60 + Math.floor(rand(seed) * 400);
  }
  return 80 + Math.floor(rand(seed) * 600);
}

function generateBlueprint(index: number): RecipeBlueprint {
  const title = `${pick(TITLE_PREFIX, index + 11)} ${pick(TITLE_MAIN, index + 29)}`;
  const tags = uniqueTags(index);
  const prepTime = 8 + Math.floor(rand(index + 101) * 45);
  const cookTime = 6 + Math.floor(rand(index + 117) * 90);
  const servings = 2 + Math.floor(rand(index + 131) * 7);
  const difficulty = recipeDifficulty(index);
  const imageUrl = pick(IMAGE_POOL, index + 149);
  const daysAgo = Math.floor(rand(index * 163 + 997) * 300) + Math.floor(index / 8);

  const ingredientCount = 5 + Math.floor(rand(index + 179) * 3);
  const ingredients: RecipeBlueprint["ingredients"] = [];
  for (let i = 0; i < ingredientCount; i += 1) {
    const ingredient = pick(INGREDIENT_LIBRARY, index * 19 + i * 7 + 3);
    ingredients.push({
      name: ingredient.name,
      unit: ingredient.defaultUnit,
      amount: amountForUnit(ingredient.defaultUnit, index * 23 + i * 5 + 1),
      notes: i % 3 === 0 ? "seeded" : undefined,
    });
  }

  const stepCount = 4 + Math.floor(rand(index + 197) * 3);
  const steps: RecipeBlueprint["steps"] = [];
  for (let i = 0; i < stepCount; i += 1) {
    steps.push({
      instruction: `${pick(STEP_ACTIONS, index * 13 + i * 17)} (${i + 1}/${stepCount}).`,
      timerSec: 60 + Math.floor(rand(index * 31 + i * 37 + 2) * 900),
    });
  }

  const description = `Autogenerated recipe dataset entry #${index + 1}. Built for search and recommendation testing with tags: ${tags.join(", ")}.`;

  return {
    title,
    description,
    imageUrl,
    prepTime,
    cookTime,
    servings,
    difficulty,
    tags,
    ingredients,
    steps,
    daysAgo,
  };
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
  ingredient: IngredientSeed
): Promise<string> {
  const key = ingredient.name.toLowerCase();
  const cached = ingredientCache.get(key);
  if (cached) {
    return cached;
  }

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

async function insertRecipeGraph(client: PoolClient, recipe: RecipeBlueprint, ingredientCache: Map<string, string>): Promise<void> {
  const createdAt = new Date(Date.now() - recipe.daysAgo * 24 * 60 * 60 * 1000);

  const recipeInsert = await client.query(
    `INSERT INTO recipes (title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::difficulty_enum, 'PUBLIC'::visibility_enum, $8, $8)
     RETURNING recipeid`,
    [
      recipe.title,
      recipe.description,
      recipe.imageUrl,
      recipe.prepTime,
      recipe.cookTime,
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

  for (const ingredientItem of recipe.ingredients) {
    const ingredientId = await ensureIngredient(client, ingredientCache, {
      name: ingredientItem.name,
      defaultUnit: ingredientItem.unit,
    });

    await client.query(
      `INSERT INTO recipe_ingredients (recipeid, ingredientid, amount, unit, notes)
       VALUES ($1::uuid, $2::uuid, $3, $4::unit_enum, $5)`,
      [recipeId, ingredientId, ingredientItem.amount, ingredientItem.unit, ingredientItem.notes || null]
    );
  }
}

export default async function seedRecipes(pool: Pool): Promise<void> {
  const targetRecipeCount = 240;
  const recipeCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM recipes`);
  const existingRecipeCount = Number(recipeCountRes.rows[0].count || 0);

  if (existingRecipeCount >= targetRecipeCount) {
    console.log(`Skipping auto recipe seed. Existing recipes: ${existingRecipeCount}`);
    return;
  }

  const recipesToCreate = targetRecipeCount - existingRecipeCount;
  const blueprints: RecipeBlueprint[] = [];
  for (let i = 0; i < recipesToCreate; i += 1) {
    blueprints.push(generateBlueprint(existingRecipeCount + i));
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ingredientCache = await loadIngredientCache(client);

    for (const blueprint of blueprints) {
      await insertRecipeGraph(client, blueprint, ingredientCache);
    }

    await client.query("COMMIT");
    console.log(`Auto-seeded ${recipesToCreate} recipes with tags, steps, ingredients, and images.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
