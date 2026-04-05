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

type CuisineProfile = {
  label: string;
  tag: string;
  flavor: string;
  pantry: string[];
  titleSuffixes: string[];
  servingNotes: string[];
};

type CookingStyle = {
  label: string;
  tag: string;
  titleForms: string[];
  descriptionNote: string;
};

const CUISINE_PROFILES: CuisineProfile[] = [
  {
    label: "Italian",
    tag: "italian",
    flavor: "bright garlic, tomato, and herb-driven flavor",
    pantry: ["basil", "parmesan", "olive oil", "tomato"],
    titleSuffixes: ["Pasta", "Skillet", "Bake", "Ragu"],
    servingNotes: ["finished with herbs and a spoon of sauce", "great for a cozy dinner with a crisp side salad"],
  },
  {
    label: "Mexican",
    tag: "mexican",
    flavor: "smoky spice, citrus, and savory depth",
    pantry: ["lime", "beans", "chili", "cilantro"],
    titleSuffixes: ["Tacos", "Rice Bowl", "Skillet", "Tray Bake"],
    servingNotes: ["easy to finish with lime and fresh herbs", "works well for a casual dinner spread"],
  },
  {
    label: "Mediterranean",
    tag: "mediterranean",
    flavor: "fresh herbs, lemon, and roasted vegetable sweetness",
    pantry: ["parsley", "lemon", "olive oil", "couscous"],
    titleSuffixes: ["Couscous Bowl", "Traybake", "Salad", "Roast"],
    servingNotes: ["best served warm with a bright finish", "easy to portion for lunch the next day"],
  },
  {
    label: "Asian",
    tag: "asian",
    flavor: "savory depth with aromatic garlic and fast high-heat cooking",
    pantry: ["garlic", "soy-style flavor", "sesame", "rice"],
    titleSuffixes: ["Stir-Fry", "Noodle Bowl", "Rice Bowl", "Pan"],
    servingNotes: ["tastes especially good straight from the wok", "holds texture well with a quick finishing toss"],
  },
  {
    label: "American",
    tag: "american",
    flavor: "comfort-focused flavor with golden edges and hearty textures",
    pantry: ["butter", "potato", "cheese", "pepper"],
    titleSuffixes: ["Skillet", "Bake", "Dinner Bowl", "Hash"],
    servingNotes: ["feels familiar and filling without needing many extras", "fits weeknight cooking especially well"],
  },
  {
    label: "Middle Eastern",
    tag: "middle-eastern",
    flavor: "warm spice, herbs, and savory roasted notes",
    pantry: ["cumin", "parsley", "lemon", "chickpeas"],
    titleSuffixes: ["Pilaf", "Roast Bowl", "Spiced Tray", "Warm Salad"],
    servingNotes: ["pairs naturally with yogurt or herbs", "lands well as a shared table dish"],
  },
  {
    label: "Indian",
    tag: "indian",
    flavor: "deep spice and silky sauce with a warming finish",
    pantry: ["cumin", "paprika", "coconut milk", "lentils"],
    titleSuffixes: ["Curry", "Masala Bowl", "Stew", "Spiced Rice"],
    servingNotes: ["gets even better after a short rest", "works beautifully with rice or flatbread"],
  },
  {
    label: "Thai",
    tag: "thai",
    flavor: "fragrant heat with coconut richness and fresh aromatics",
    pantry: ["coconut milk", "lime", "chili", "herbs"],
    titleSuffixes: ["Curry Bowl", "Noodles", "Coconut Stir-Fry", "Rice Bowl"],
    servingNotes: ["loves a squeeze of citrus before serving", "stays lively and aromatic in the bowl"],
  },
  {
    label: "Fusion",
    tag: "fusion",
    flavor: "layered flavor that borrows from more than one familiar pantry",
    pantry: ["garlic", "herbs", "chili", "citrus"],
    titleSuffixes: ["Bowl", "Skillet", "One-Pan Dinner", "Loaded Plate"],
    servingNotes: ["is flexible enough for ingredient swaps", "is especially useful for mixed pantry leftovers"],
  },
  {
    label: "Comfort Food",
    tag: "comfort-food",
    flavor: "rich, savory flavor with plenty of golden, cozy appeal",
    pantry: ["butter", "cheese", "potato", "creaminess"],
    titleSuffixes: ["Bake", "Skillet", "One-Pot Dinner", "Cozy Bowl"],
    servingNotes: ["delivers the kind of finish people expect from comfort cooking", "works best served hot and generous"],
  },
];

const COOKING_STYLES: CookingStyle[] = [
  { label: "One-Pot", tag: "one-pot", titleForms: ["One-Pot", "Cozy", "Weeknight"], descriptionNote: "The steps stay compact and low-fuss, so cleanup is easy." },
  { label: "Sheet Pan", tag: "baked", titleForms: ["Sheet Pan", "Roasted", "Golden"], descriptionNote: "Roasting builds caramelized edges and keeps the prep straightforward." },
  { label: "Skillet", tag: "pan-fry", titleForms: ["Skillet", "Sizzling", "Pan-Seared"], descriptionNote: "A hot pan does most of the work, building fast color and flavor." },
  { label: "Soup", tag: "cozy", titleForms: ["Velvety", "Brothy", "Comforting"], descriptionNote: "The texture leans spoonable and warming without feeling heavy." },
  { label: "Stew", tag: "hearty", titleForms: ["Slow-Simmered", "Hearty", "Rustic"], descriptionNote: "It is built around deeper simmered flavor and a fuller bite." },
  { label: "Salad", tag: "fresh", titleForms: ["Fresh", "Crunchy", "Bright"], descriptionNote: "The final dish stays lively, layered, and easy to serve cold or warm." },
  { label: "Wrap", tag: "quick", titleForms: ["Quick", "Handheld", "Loaded"], descriptionNote: "It is easy to portion and works well for lunch or meal prep." },
  { label: "Pasta", tag: "comfort", titleForms: ["Creamy", "Twirled", "Saucy"], descriptionNote: "The sauce is meant to cling well and keep every bite seasoned." },
  { label: "Curry", tag: "comfort", titleForms: ["Fragrant", "Spiced", "Silky"], descriptionNote: "It develops a saucy finish that feels richer than the effort involved." },
  { label: "Tacos", tag: "party", titleForms: ["Street-Style", "Zesty", "Loaded"], descriptionNote: "The finish is bold and flexible, so it works for groups or casual dinners." },
  { label: "Gnocchi", tag: "comfort", titleForms: ["Pillowy", "Golden", "Pan-Roasted"], descriptionNote: "It gets contrast from crisp edges against a soft center." },
  { label: "Noodle Bowl", tag: "quick", titleForms: ["Slurpable", "Savory", "Fast"], descriptionNote: "It comes together fast and leans on big flavor rather than long cook time." },
  { label: "Pilaf", tag: "healthy", titleForms: ["Toasted", "Herby", "Aromatic"], descriptionNote: "The grains carry the seasoning, making it feel complete as a main." },
  { label: "Stir-Fry", tag: "quick", titleForms: ["Wok-Style", "Glazed", "Flash-Cooked"], descriptionNote: "Everything cooks quickly to keep the texture crisp and the flavor direct." },
  { label: "Gratin", tag: "comfort", titleForms: ["Bubbly", "Golden", "Oven-Finished"], descriptionNote: "The top gets color while the center stays soft and rich." },
];

const DESCRIPTION_TEXTURES = [
  "Expect tender bites, balanced seasoning, and enough contrast to keep the plate interesting.",
  "The texture lands between hearty and polished, which helps it feel like a real saved favorite.",
  "It leans on browned edges, soft centers, and a finish that still tastes fresh.",
  "The payoff is a mix of comfort and clarity rather than a flat one-note result.",
  "Each component brings a little contrast, so the whole dish reads as layered instead of repetitive.",
  "It stays approachable while still giving the kind of texture variation people remember.",
];

const DESCRIPTION_USE_CASES = [
  "It fits weeknight cooking, but it also feels good enough to save and revisit later.",
  "This is the kind of recipe that works for both quick browsing and confident meal planning.",
  "It is easy to picture in recommendations because the ingredients are familiar without feeling generic.",
  "It works well in a home feed because the language, timing, and ingredients feel believable together.",
  "It is practical for repeat cooking, not just for filling a dataset.",
  "The result feels varied enough to improve both browsing and search quality.",
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

function humanizeIngredientName(name: string): string {
  return name
    .replace(/\b(Breast|Mince|Sauce|Flakes)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickCuisineProfile(index: number): CuisineProfile {
  return pick(CUISINE_PROFILES, index * 7 + 5);
}

function pickCookingStyle(index: number): CookingStyle {
  return pick(COOKING_STYLES, index * 11 + 17);
}

function pickPrimaryIngredients(ingredients: RecipeIngredientSeed[]): string[] {
  const distinct = Array.from(
    new Set(
      ingredients
        .map((ingredient) => humanizeIngredientName(ingredient.name))
        .filter((name) => !["Salt", "Black Pepper", "Olive Oil", "Sugar", "Garlic"].includes(name))
    )
  );

  return distinct.slice(0, 3);
}

function buildTitle(
  index: number,
  ingredients: RecipeIngredientSeed[],
  cuisine: CuisineProfile,
  style: CookingStyle
): string {
  const primary = pickPrimaryIngredients(ingredients);
  const lead = primary[0] || pick(["Vegetable", "Herb", "Market", "Garden"], index + 401);
  const secondary = primary[1];
  const styleWord = pick(style.titleForms, index + 419);
  const cuisineSuffix = pick(cuisine.titleSuffixes, index + 433);

  switch (index % 6) {
    case 0:
      return `${styleWord} ${lead} ${style.label}`;
    case 1:
      return secondary ? `${lead} and ${secondary} ${style.label}` : `${lead} ${style.label}`;
    case 2:
      return `${styleWord} ${lead} ${cuisineSuffix}`;
    case 3:
      return secondary ? `${lead} ${style.label} with ${secondary.toLowerCase()}` : `${lead} ${cuisineSuffix}`;
    case 4:
      return `${cuisine.label} ${lead} ${cuisineSuffix}`;
    default:
      return secondary ? `${styleWord} ${lead} with ${secondary.toLowerCase()}` : `${styleWord} ${lead} ${style.label}`;
  }
}

function buildDescription(
  index: number,
  title: string,
  dietType: RecipeDietType,
  ingredients: RecipeIngredientSeed[],
  cuisine: CuisineProfile,
  style: CookingStyle
): string {
  const primary = pickPrimaryIngredients(ingredients);
  const ingredientText =
    primary.length >= 2
      ? `${primary[0]}, ${primary[1]}, and ${primary[2] || pick(cuisine.pantry, index + 457)}`
      : `${primary[0] || "seasonal ingredients"} and ${pick(cuisine.pantry, index + 463)}`;
  const dietPhrase =
    dietType === "VEGAN"
      ? "It stays fully plant-based without losing richness."
      : dietType === "VEGETARIAN"
        ? "It keeps a vegetarian profile while still feeling complete and satisfying."
        : "It is built as a broadly appealing main that still keeps a distinct point of view.";

  return [
    `${title} brings together ${ingredientText} in a ${cuisine.flavor} profile.`,
    style.descriptionNote,
    pick(DESCRIPTION_TEXTURES, index + 479),
    dietPhrase,
    `${pick(cuisine.servingNotes, index + 503)} ${pick(DESCRIPTION_USE_CASES, index + 521)}`,
  ].join(" ");
}

function buildTags(
  index: number,
  dietType: RecipeDietType,
  difficulty: Difficulty,
  cuisine: CuisineProfile,
  style: CookingStyle,
  totalTime: number
): string[] {
  const tags = new Set<string>();
  tags.add(cuisine.tag);

  if (dietType === "VEGAN") {
    tags.add("vegan");
  } else if (dietType === "VEGETARIAN") {
    tags.add("vegetarian");
  }

  if (totalTime <= 30) {
    tags.add("quick");
  } else if (difficulty === "HARD") {
    tags.add("party");
  } else {
    tags.add(style.tag);
  }

  const fallbackPool = [
    style.tag,
    difficulty === "HARD" ? "crowd-pleaser" : difficulty === "MEDIUM" ? "weeknight" : "healthy",
    pick(OCCASION_TAGS, index + 547),
    pick(CUISINE_TAGS, index + 563),
  ];

  for (const tag of fallbackPool) {
    if (tags.size >= 4) break;
    tags.add(tag);
  }

  return Array.from(tags).slice(0, 4);
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
  const cuisine = pickCuisineProfile(index);
  const style = pickCookingStyle(index);
  const prepTime = 8 + Math.floor(rand(index + 101) * 38);
  const cookTime = 10 + Math.floor(rand(index + 117) * 72);
  const totalTime = prepTime + cookTime;
  const servings = 2 + Math.floor(rand(index + 131) * 6);
  const imageUrl = pick(IMAGE_POOL, index + 149);
  const daysAgo = Math.floor(rand(index * 163 + 997) * 360) + Math.floor(index / 7);
  const ingredients = buildIngredients(index, dietType);
  const steps = buildSteps(index);
  const title = buildTitle(index, ingredients, cuisine, style);
  const tags = buildTags(index, dietType, difficulty, cuisine, style, totalTime);
  const description = buildDescription(index, title, dietType, ingredients, cuisine, style);
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
