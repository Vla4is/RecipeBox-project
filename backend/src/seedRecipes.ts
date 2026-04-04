import { Pool, PoolClient } from "pg";
import fs from "fs";
import path from "path";

type Difficulty = "EASY" | "MEDIUM" | "HARD";
type Unit = "G" | "KG" | "ML" | "L" | "TSP" | "TBSP" | "CUP" | "PCS";
type RecipeDietType = "NONE" | "VEGETARIAN" | "VEGAN";

interface IngredientSeed {
  name: string;
  defaultUnit: Unit;
  diets?: RecipeDietType[];
}

interface RecipeIngredientSeed {
  name: string;
  amount: number;
  unit: Unit;
  notes?: string;
}

interface RecipeBlueprint {
  title: string;
  description: string;
  imageUrl: string;
  youtubeUrl: string | null;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: Difficulty;
  dietType: RecipeDietType;
  tags: string[];
  ingredients: RecipeIngredientSeed[];
  steps: Array<{ instruction: string; timerSec: number }>;
  daysAgo: number;
}

const TARGET_RECIPE_COUNT = 480;
const IMAGE_WIDTH = 1280;
const IMAGE_QUALITY = 78;

const YOUTUBE_VIDEOS = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=9No-FiEInLA",
  "https://www.youtube.com/watch?v=1-SJGQ2HLp8",
  "https://www.youtube.com/watch?v=4aZr5hZXP_s",
  "https://www.youtube.com/watch?v=V-_O7nl0Ii0",
  "https://www.youtube.com/watch?v=ZJy1ajvMU1k",
];

const REMOTE_IMAGE_POOL = [
  pexelsImage(1640777),
  pexelsImage(461382),
  pexelsImage(357756),
  pexelsImage(1437267),
  pexelsImage(376464),
  pexelsImage(70497),
  pexelsImage(262959),
  pexelsImage(5938, "jpg"),
  pexelsImage(1279330),
  pexelsImage(958545),
  pexelsImage(699953),
  pexelsImage(1099680),
  pexelsImage(1267320),
  pexelsImage(262978),
  pexelsImage(2233729),
  pexelsImage(1435904),
  pexelsImage(257816),
  pexelsImage(2097090),
  pexelsImage(1435895),
  pexelsImage(1213710),
];

const TITLE_STYLE = [
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
  "Roasted",
  "Bright",
  "Cozy",
  "Caramelized",
  "Herby",
  "Charred",
  "Velvety",
  "Punchy",
];

const TITLE_METHOD = [
  "Sheet Pan",
  "One-Pot",
  "Skillet",
  "Traybake",
  "Bowl",
  "Bake",
  "Soup",
  "Stew",
  "Salad",
  "Wrap",
  "Pasta",
  "Curry",
  "Tacos",
  "Gnocchi",
  "Noodle Bowl",
  "Pilaf",
  "Stir-Fry",
  "Gratin",
];

const TITLE_CORE = [
  "Chicken",
  "Lemon Herb Chicken",
  "Spiced Beef",
  "Crispy Tofu",
  "Chickpea",
  "Lentil",
  "Mushroom",
  "Roasted Pepper",
  "Spinach Ricotta",
  "Coconut Curry",
  "Harissa Vegetable",
  "Garlic Butter Potato",
  "Tomato Basil",
  "Pesto Veggie",
  "Black Bean",
  "Sweet Corn",
  "Mediterranean Couscous",
  "Sesame Noodle",
  "Roasted Cauliflower",
  "Creamy Pumpkin",
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

const OCCASION_TAGS = [
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
  "gluten-free",
  "comfort",
  "fresh",
  "creamy",
  "cozy",
  "crowd-pleaser",
];

const DESCRIPTION_OPENERS = [
  "Built for busy nights, this recipe lands in the sweet spot between comfort and speed.",
  "This seeded recipe is intentionally realistic, with overlapping keywords to stress search ranking.",
  "A balanced plate with strong pantry familiarity, designed to feel believable in recommendations.",
  "Great for testing discovery because it shares ingredients and language with several neighboring recipes.",
  "This one leans into weeknight cooking: approachable steps, flexible timing, and familiar flavors.",
  "Designed as a high-signal sample recipe, it mixes specific culinary language with broader search terms.",
];

const DESCRIPTION_MIDDLES = [
  "Expect layered flavor, a clear texture payoff, and enough variation for the recommendation engine to find close matches.",
  "It uses a familiar ingredient set with just enough overlap to create interesting near-duplicates in the dataset.",
  "The wording intentionally includes searchable phrases around texture, timing, and serving style.",
  "Tags and timing are tuned to create useful clusters for category, difficulty, and diet-based discovery.",
  "It reads like a real recipe card instead of placeholder content, which makes testing much more honest.",
  "Its description is long enough to exercise text search without collapsing into obvious templated noise.",
];

const DESCRIPTION_CLOSERS = [
  "Serve it fresh from the pan, meal-prep it for later, or surface it in \"top picks\" for a fast visual check.",
  "This should behave well in both keyword search and recommendation blends focused on popularity and relevance.",
  "It is especially useful when testing partial matches, dietary filters, and title-description overlap.",
  "Use it to validate recommendations against cuisine tags, difficulty balance, and repeated ingredient families.",
  "It works well as seeded content for both the carousel and category-based recipe browsing.",
  "The result is intentionally polished enough to feel real while still being deterministic for testing.",
];

const STEP_ACTIONS = [
  "Heat the pan and bloom the aromatics until fragrant",
  "Add the base ingredients and toss to coat everything evenly",
  "Stir in the sauce and simmer until the texture settles",
  "Roast until the edges deepen in color and pick up caramelization",
  "Fold in the greens and let them soften just enough",
  "Finish with citrus, herbs, and a final seasoning check",
  "Build contrast with a fast sear for color and texture",
  "Let everything rest briefly so the flavors pull together",
  "Layer the components and cook until the center turns tender",
  "Reduce the mixture slightly so the sauce clings better",
];

const VEGAN_INGREDIENTS: IngredientSeed[] = [
  { name: "Tofu", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Chickpeas", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Lentils", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Pasta", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Rice", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Couscous", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Tomato Sauce", defaultUnit: "ML", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Coconut Milk", defaultUnit: "ML", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Bell Pepper", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Onion", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Garlic", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Olive Oil", defaultUnit: "TBSP", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Lemon", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Spinach", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Mushrooms", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Potato", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Chili Flakes", defaultUnit: "TSP", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Paprika", defaultUnit: "TSP", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Cumin", defaultUnit: "TSP", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Salt", defaultUnit: "TSP", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Black Pepper", defaultUnit: "TSP", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Sugar", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Basil", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Cilantro", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Parsley", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Cauliflower", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Zucchini", defaultUnit: "PCS", diets: ["VEGAN", "VEGETARIAN"] },
  { name: "Black Beans", defaultUnit: "G", diets: ["VEGAN", "VEGETARIAN"] },
];

const VEGETARIAN_EXTRA_INGREDIENTS: IngredientSeed[] = [
  { name: "Greek Yogurt", defaultUnit: "G", diets: ["VEGETARIAN"] },
  { name: "Butter", defaultUnit: "G", diets: ["VEGETARIAN"] },
  { name: "Cheese", defaultUnit: "G", diets: ["VEGETARIAN"] },
  { name: "Egg", defaultUnit: "PCS", diets: ["VEGETARIAN"] },
  { name: "Milk", defaultUnit: "ML", diets: ["VEGETARIAN"] },
  { name: "Ricotta", defaultUnit: "G", diets: ["VEGETARIAN"] },
  { name: "Parmesan", defaultUnit: "G", diets: ["VEGETARIAN"] },
];

const OMNIVORE_EXTRA_INGREDIENTS: IngredientSeed[] = [
  { name: "Chicken Breast", defaultUnit: "G", diets: ["NONE"] },
  { name: "Ground Beef", defaultUnit: "G", diets: ["NONE"] },
  { name: "Salmon", defaultUnit: "G", diets: ["NONE"] },
  { name: "Shrimp", defaultUnit: "G", diets: ["NONE"] },
  { name: "Turkey Mince", defaultUnit: "G", diets: ["NONE"] },
];

const INGREDIENT_LIBRARY: IngredientSeed[] = [
  ...VEGAN_INGREDIENTS,
  ...VEGETARIAN_EXTRA_INGREDIENTS,
  ...OMNIVORE_EXTRA_INGREDIENTS,
];

function pexelsImage(id: number, extension: "jpeg" | "jpg" = "jpeg"): string {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.${extension}?auto=compress&cs=tinysrgb&w=${IMAGE_WIDTH}&fm=webp&q=${IMAGE_QUALITY}`;
}

function loadSeedImagePool(): string[] {
  const localFolder = resolveSeedImageFolder();
  if (localFolder) {
    const files = Array.from({ length: 30 }, (_, index) => `food_${index + 1}.jpg`)
      .filter((fileName) => {
        const filePath = path.join(localFolder, fileName);
        try {
          const stat = fs.statSync(filePath);
          return stat.isFile() && stat.size > 0;
        } catch {
          return false;
        }
      })
      .map((fileName) => `/seed-images/${fileName}`);

    if (files.length > 0) {
      console.log(`Using ${files.length} local seed images from ${localFolder} (food_1.jpg to food_30.jpg when present)`);
      return files;
    }

    console.warn(`Seed image folder found but no usable food_1.jpg to food_30.jpg files were available in ${localFolder}`);
  }

  console.warn("Falling back to remote seed image URLs because no local seed images were available.");
  return REMOTE_IMAGE_POOL;
}

function resolveSeedImageFolder(): string | null {
  const candidates = [
    path.resolve(__dirname, "../../frontend/public/seed-images"),
    path.resolve(process.cwd(), "frontend/public/seed-images"),
    path.resolve(process.cwd(), "../frontend/public/seed-images"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

const IMAGE_POOL = loadSeedImagePool();

function rand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function pick<T>(arr: T[], seed: number): T {
  const index = Math.floor(rand(seed) * arr.length);
  return arr[index];
}

function pickManyUnique<T>(arr: T[], count: number, seed: number): T[] {
  const picked: T[] = [];
  const used = new Set<number>();
  let cursor = 0;

  while (picked.length < Math.min(count, arr.length)) {
    const index = Math.floor(rand(seed + cursor * 17) * arr.length);
    if (!used.has(index)) {
      used.add(index);
      picked.push(arr[index]);
    }
    cursor += 1;
  }

  return picked;
}

function recipeDifficulty(index: number): Difficulty {
  if (index % 7 === 0) return "HARD";
  if (index % 3 === 0) return "MEDIUM";
  return "EASY";
}

function recipeDietType(index: number): RecipeDietType {
  if (index % 9 === 0 || index % 9 === 4) return "VEGAN";
  if (index % 5 === 0 || index % 5 === 3) return "VEGETARIAN";
  return "NONE";
}

function amountForUnit(unit: Unit, seed: number): number {
  if (unit === "PCS") return 1 + Math.floor(rand(seed) * 5);
  if (unit === "TSP") return 1 + Math.floor(rand(seed) * 3);
  if (unit === "TBSP") return 1 + Math.floor(rand(seed) * 4);
  if (unit === "ML") return 80 + Math.floor(rand(seed) * 420);
  return 100 + Math.floor(rand(seed) * 550);
}

function buildTitle(index: number): string {
  const style = pick(TITLE_STYLE, index + 11);
  const core = pick(TITLE_CORE, index + 37);
  const method = pick(TITLE_METHOD, index + 71);

  switch (index % 5) {
    case 0:
      return `${style} ${core} ${method}`;
    case 1:
      return `${core} with ${style.toLowerCase()} finish`;
    case 2:
      return `${style} ${method} with ${core.toLowerCase()}`;
    case 3:
      return `${core} ${method}`;
    default:
      return `${style} ${core}`;
  }
}

function buildDescription(index: number, title: string, dietType: RecipeDietType, tags: string[]): string {
  const dietPhrase =
    dietType === "VEGAN"
      ? "It is fully plant-based and tuned for vegan filtering."
      : dietType === "VEGETARIAN"
        ? "It stays vegetarian while still reading like a hearty everyday meal."
        : "It sits in the general mixed-diet bucket for broader recommendation coverage.";

  return [
    pick(DESCRIPTION_OPENERS, index + 101),
    `${title} is seeded with tags like ${tags.slice(0, 4).join(", ")} to create meaningful overlap across search results.`,
    pick(DESCRIPTION_MIDDLES, index + 149),
    dietPhrase,
    pick(DESCRIPTION_CLOSERS, index + 197),
  ].join(" ");
}

function buildTags(index: number, dietType: RecipeDietType, difficulty: Difficulty): string[] {
  const tags = new Set<string>();
  tags.add(pick(CUISINE_TAGS, index + 1));
  for (const tag of pickManyUnique(OCCASION_TAGS, 4, index + 13)) {
    tags.add(tag);
  }

  tags.add(difficulty.toLowerCase());
  if (dietType === "VEGAN") {
    tags.add("vegan");
    tags.add("vegetarian");
    tags.add("plant-based");
  } else if (dietType === "VEGETARIAN") {
    tags.add("vegetarian");
  } else {
    tags.add(index % 2 === 0 ? "protein-packed" : "chef-favorite");
  }

  if (index % 4 === 0) tags.add("quick");
  if (index % 6 === 0) tags.add("meal-prep");
  if (index % 8 === 0) tags.add("comfort");

  return Array.from(tags);
}

function ingredientPoolForDiet(dietType: RecipeDietType): IngredientSeed[] {
  if (dietType === "VEGAN") return VEGAN_INGREDIENTS;
  if (dietType === "VEGETARIAN") return [...VEGAN_INGREDIENTS, ...VEGETARIAN_EXTRA_INGREDIENTS];
  return INGREDIENT_LIBRARY;
}

function buildIngredients(index: number, dietType: RecipeDietType): RecipeIngredientSeed[] {
  const pool = ingredientPoolForDiet(dietType);
  const ingredientCount = 6 + Math.floor(rand(index + 233) * 4);
  return pickManyUnique(pool, ingredientCount, index * 19 + 3).map((ingredient, ingredientIndex) => ({
    name: ingredient.name,
    unit: ingredient.defaultUnit,
    amount: amountForUnit(ingredient.defaultUnit, index * 23 + ingredientIndex * 5 + 1),
    notes: ingredientIndex % 4 === 0 ? pick(["finely chopped", "for serving", "divided", "to taste"], index * 41 + ingredientIndex) : undefined,
  }));
}

function buildSteps(index: number): Array<{ instruction: string; timerSec: number }> {
  const stepCount = 4 + Math.floor(rand(index + 271) * 4);
  const steps: Array<{ instruction: string; timerSec: number }> = [];

  for (let i = 0; i < stepCount; i += 1) {
    const action = pick(STEP_ACTIONS, index * 13 + i * 17);
    const detail = pick(
      [
        "Keep the heat steady so the texture stays controlled",
        "Scrape the pan well to pull in all the flavor",
        "Taste before the final minute and adjust seasoning",
        "Let the sauce thicken just enough to coat the spoon",
        "Look for golden edges rather than a hard sear",
        "Aim for a soft center with a little bite left",
      ],
      index * 31 + i * 7
    );

    steps.push({
      instruction: `${action}. ${detail}.`,
      timerSec: 75 + Math.floor(rand(index * 29 + i * 37 + 2) * 840),
    });
  }

  return steps;
}

function buildYoutubeUrl(index: number): string | null {
  return index % 6 === 0 ? pick(YOUTUBE_VIDEOS, index + 307) : null;
}

function generateBlueprint(index: number): RecipeBlueprint {
  const difficulty = recipeDifficulty(index);
  const dietType = recipeDietType(index);
  const tags = buildTags(index, dietType, difficulty);
  const title = buildTitle(index);
  const prepTime = 8 + Math.floor(rand(index + 101) * 38);
  const cookTime = 10 + Math.floor(rand(index + 117) * 72);
  const servings = 2 + Math.floor(rand(index + 131) * 6);
  const imageUrl = pick(IMAGE_POOL, index + 149);
  const daysAgo = Math.floor(rand(index * 163 + 997) * 360) + Math.floor(index / 7);
  const ingredients = buildIngredients(index, dietType);
  const steps = buildSteps(index);
  const description = buildDescription(index, title, dietType, tags);
  const youtubeUrl = buildYoutubeUrl(index);

  return {
    title,
    description,
    imageUrl,
    youtubeUrl,
    prepTime,
    cookTime,
    servings,
    difficulty,
    dietType,
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

async function insertRecipeGraph(client: PoolClient, recipe: RecipeBlueprint, ingredientCache: Map<string, string>): Promise<void> {
  const createdAt = new Date(Date.now() - recipe.daysAgo * 24 * 60 * 60 * 1000);

  const recipeInsert = await client.query(
    `INSERT INTO recipes (
       title,
       description,
       image_url,
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
       $7::recipe_diet_enum,
       $8,
       $9::difficulty_enum,
       'PUBLIC'::visibility_enum,
       $10,
       $10
     )
     RETURNING recipeid`,
    [
      recipe.title,
      recipe.description,
      recipe.imageUrl,
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

  for (const ingredientItem of recipe.ingredients) {
    const ingredientMeta =
      INGREDIENT_LIBRARY.find((item) => item.name === ingredientItem.name) ||
      ({ name: ingredientItem.name, defaultUnit: ingredientItem.unit } as IngredientSeed);

    const ingredientId = await ensureIngredient(client, ingredientCache, ingredientMeta);

    await client.query(
      `INSERT INTO recipe_ingredients (recipeid, ingredientid, amount, unit, notes)
       VALUES ($1::uuid, $2::uuid, $3, $4::unit_enum, $5)`,
      [recipeId, ingredientId, ingredientItem.amount, ingredientItem.unit, ingredientItem.notes || null]
    );
  }
}

export default async function seedRecipes(pool: Pool): Promise<void> {
  const recipeCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM recipes`);
  const existingRecipeCount = Number(recipeCountRes.rows[0].count || 0);

  if (existingRecipeCount >= TARGET_RECIPE_COUNT) {
    console.log(`Skipping auto recipe seed. Existing recipes: ${existingRecipeCount}`);
    return;
  }

  const recipesToCreate = TARGET_RECIPE_COUNT - existingRecipeCount;
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
    console.log(
      `Auto-seeded ${recipesToCreate} recipes with richer titles, descriptions, diet metadata, video links, and optimized image URLs.`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
