
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import jwt from "jsonwebtoken";
import initializeDatabase from "./db-init";
import pool from "./database";
import { buildCookbookXml, getCookbookRecipes } from "./services/cookbookService";
import {
  createUser,
  authenticateUser,
  getCurrentUserProfile,
  getPublicUserProfileByNickname,
  updateUserPassword,
  updateUserProfile,
} from "./services/userService";
import {
  getPublicRecipes,
  createRecipe,
  getRecipeDetails,
  getUserRecipes,
  updateRecipe,
  deleteRecipe,
  getRecipeDetailsForOwner,
  getSavedRecipes,
  isRecipeSaved,
  saveRecipeForUser,
  removeSavedRecipeForUser,
  getRecipeTimeRanges,
  getHomeTagSections,
  getRecipeRatingSummary,
  setRecipeRating,
  normalizeRecipeDietType,
  getPublicRecipesByUser,
} from "./services/recipeService";
import { searchRecipes } from "./services/recipeSearchService";
import {
  getHomeRecommendations,
  recordRecipeEvent,
  recordAnonymousRecipeEvent,
  RecipeEventType,
} from "./services/recommendationService";
import {
  isUserPremium,
  getSubscriptionByUserId,
  createSubscription,
  renewSubscription,
  cancelSubscription,
} from "./services/subscriptionService";
import { processPremiumCheckout } from "./services/billingService";
import seedRecipes from "./seedRecipes";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));
app.use("/cookbook-assets", express.static(path.resolve(__dirname, "../public")));

// JWT auth middleware
interface AuthRequest extends Request {
  user?: { userid: string; email?: string };
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userid: string; email?: string };
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function getOptionalUser(req: Request): { userid: string; email?: string } | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userid: string; email?: string };
    return decoded;
  } catch {
    return null;
  }
}
// Login route must be after app is defined
app.post("/api/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const result = await authenticateUser(email, password);
    if (!result) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    return res.json(result);
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await getCurrentUserProfile(req.user!.userid);
    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ profile });
  } catch (err) {
    console.error("Error fetching current profile:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/me/profile", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, nickname, avatar_url } = req.body || {};
    if (!name || !nickname) {
      return res.status(400).json({ error: "name and nickname are required" });
    }

    const profile = await updateUserProfile(req.user!.userid, {
      name: String(name),
      nickname: String(nickname),
      avatar_url: typeof avatar_url === "string" && avatar_url.trim() ? avatar_url : null,
    });

    return res.json({ success: true, profile });
  } catch (err) {
    console.error("Error updating profile:", err);
    const typedErr = err as Error & { code?: string };

    if (
      typedErr.code === "PROFILE_VALIDATION_ERROR" ||
      typedErr.code === "NICKNAME_TAKEN" ||
      typedErr.code === "NICKNAME_CHANGE_LIMIT" ||
      typedErr.code === "NICKNAME_CHANGE_COOLDOWN"
    ) {
      return res.status(400).json({ error: typedErr.message });
    }

    if (typedErr.code === "USER_NOT_FOUND") {
      return res.status(404).json({ error: typedErr.message });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/me/password", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }

    await updateUserPassword(req.user!.userid, String(currentPassword), String(newPassword));
    return res.json({ success: true });
  } catch (err) {
    console.error("Error updating password:", err);
    const typedErr = err as Error & { code?: string };

    if (typedErr.code === "INVALID_PASSWORD" || typedErr.code === "PROFILE_VALIDATION_ERROR") {
      return res.status(400).json({ error: typedErr.message });
    }

    if (typedErr.code === "USER_NOT_FOUND") {
      return res.status(404).json({ error: typedErr.message });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/users/:nickname", async (req: Request, res: Response) => {
  try {
    const nickname = String(req.params.nickname || "");
    if (!nickname) {
      return res.status(400).json({ error: "nickname is required" });
    }

    const profile = await getPublicUserProfileByNickname(nickname);
    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    const recipes = await getPublicRecipesByUser(profile.userid);
    return res.json({ profile, recipes });
  } catch (err) {
    console.error("Error fetching public profile:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/", (_req: Request, res: Response) => {
  res.send("Hello from Node + TypeScript 🚀");
});

app.get("/api/hello", (_req: Request, res: Response) => {
  res.json({ message: "Bro Hello from the backend!" });
});

app.get("/cookbook.xml", async (req: Request, res: Response) => {
  try {
    const rawLimit = req.query.limit;
    const parsedLimit = Number(Array.isArray(rawLimit) ? rawLimit[0] : rawLimit);
    const recipes = await getCookbookRecipes(Number.isFinite(parsedLimit) ? parsedLimit : undefined);
    const xml = buildCookbookXml(recipes);

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.send(xml);
  } catch (err) {
    console.error("Error generating cookbook XML:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/admin/reseed-recipes", async (_req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM user_recipe_events");
    await pool.query("DELETE FROM steps");
    await pool.query("DELETE FROM favorites");
    await pool.query("DELETE FROM reviews");
    await pool.query("DELETE FROM recipe_ingredients");
    await pool.query("DELETE FROM recipes");
    await pool.query("DELETE FROM ingredients");
    await seedRecipes(pool);
    return res.json({ success: true, message: "Recipes reseeded successfully" });
  } catch (err) {
    console.error("Reseed error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


app.get("/api/recipes", async (_req: Request, res: Response) => {
  try {
    const recipes = await getPublicRecipes();
    return res.json({ recipes });
  } catch (err) {
    console.error("Error fetching recipes:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/recipes/time-ranges", async (req: Request, res: Response) => {
  try {
    const user = getOptionalUser(req);
    const ranges = await getRecipeTimeRanges(user?.userid);
    return res.json(ranges);
  } catch (err) {
    console.error("Error fetching recipe time ranges:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/recipes/home-sections", async (req: Request, res: Response) => {
  try {
    const rawTagLimit = req.query.tagLimit;
    const rawRecipesPerTag = req.query.recipesPerTag;

    const parsedTagLimit = Number(Array.isArray(rawTagLimit) ? rawTagLimit[0] : rawTagLimit);
    const parsedRecipesPerTag = Number(Array.isArray(rawRecipesPerTag) ? rawRecipesPerTag[0] : rawRecipesPerTag);

    const sections = await getHomeTagSections({
      tagLimit: Number.isFinite(parsedTagLimit) ? parsedTagLimit : undefined,
      recipesPerTag: Number.isFinite(parsedRecipesPerTag) ? parsedRecipesPerTag : undefined,
    });

    return res.json({ sections });
  } catch (err) {
    console.error("Error fetching home sections:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/recipes/search", async (req: Request, res: Response) => {
  try {
    const user = getOptionalUser(req);
    const rawQuery = req.query.q;
    const q = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery) || "";
    const rawMaxTotal = req.query.maxTotalTime;
    const rawDietType = req.query.dietType;
    const rawDifficulty = req.query.difficulty;
    const rawLimit = req.query.limit;

    const parsedMaxTotal = Number(Array.isArray(rawMaxTotal) ? rawMaxTotal[0] : rawMaxTotal);
    const parsedDietType = normalizeRecipeDietType(Array.isArray(rawDietType) ? rawDietType[0] : rawDietType);
    const parsedLimit = Number(Array.isArray(rawLimit) ? rawLimit[0] : rawLimit);
    const parsedDifficulties = (Array.isArray(rawDifficulty) ? rawDifficulty : [rawDifficulty])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.toUpperCase())
      .filter((v): v is "EASY" | "MEDIUM" | "HARD" => v === "EASY" || v === "MEDIUM" || v === "HARD");

    const recipes = await searchRecipes({
      searchTerm: String(q),
      userid: user?.userid,
      maxTotalTime: Number.isFinite(parsedMaxTotal) ? parsedMaxTotal : undefined,
      dietType: parsedDietType === "NONE" ? undefined : parsedDietType,
      difficulties: parsedDifficulties,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });

    return res.json({ recipes });
  } catch (err) {
    console.error("Error searching recipes:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/recipes/:recipeId", async (req: Request, res: Response) => {
  try {
    const user = getOptionalUser(req);
    const rawRecipeId = req.params.recipeId;
    const recipeId = Array.isArray(rawRecipeId) ? rawRecipeId[0] : rawRecipeId;

    if (!recipeId) {
      return res.status(400).json({ error: "recipeId is required" });
    }

    const details = await getRecipeDetails(recipeId, user?.userid);
    if (!details) {
      return res.status(404).json({ error: "Recipe not found" });
    }
    return res.json(details);
  } catch (err) {
    console.error("Error fetching recipe details:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/recipes/:recipeId/rating-summary", async (req: Request, res: Response) => {
  try {
    const user = getOptionalUser(req);
    const rawRecipeId = req.params.recipeId;
    const recipeId = Array.isArray(rawRecipeId) ? rawRecipeId[0] : rawRecipeId;

    if (!recipeId) {
      return res.status(400).json({ error: "recipeId is required" });
    }

    const details = await getRecipeDetails(recipeId, user?.userid);
    if (!details) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    const rating = await getRecipeRatingSummary(recipeId, user?.userid);
    return res.json({ rating });
  } catch (err) {
    console.error("Error fetching recipe rating summary:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/recipes/:recipeId/rating", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawRecipeId = req.params.recipeId;
    const recipeId = Array.isArray(rawRecipeId) ? rawRecipeId[0] : rawRecipeId;
    const rawStars = req.body?.stars;
    const stars = Number(rawStars);

    if (!recipeId) {
      return res.status(400).json({ error: "recipeId is required" });
    }

    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: "stars must be an integer from 1 to 5" });
    }

    const details = await getRecipeDetails(recipeId, req.user!.userid);
    if (!details) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    await setRecipeRating(
      req.user!.userid,
      recipeId,
      stars,
      typeof req.body?.comment === "string" ? req.body.comment : undefined
    );

    const rating = await getRecipeRatingSummary(recipeId, req.user!.userid);
    return res.json({ success: true, rating });
  } catch (err) {
    console.error("Error setting recipe rating:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/recipe-events", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { recipeId, eventType, countryCode } = req.body || {};
    const normalizedEventType = typeof eventType === "string" ? eventType.toUpperCase() : "";
    const allowedEventTypes: RecipeEventType[] = ["VIEW", "CLICK", "SAVE"];

    if (!recipeId || typeof recipeId !== "string") {
      return res.status(400).json({ error: "recipeId is required" });
    }

    if (!allowedEventTypes.includes(normalizedEventType as RecipeEventType)) {
      return res.status(400).json({ error: "eventType must be VIEW, CLICK, or SAVE" });
    }

    await recordRecipeEvent({
      userid: req.user!.userid,
      recipeid: recipeId,
      eventType: normalizedEventType as RecipeEventType,
      countryCode: typeof countryCode === "string" ? countryCode : undefined,
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Error recording recipe event:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/recipe-events/anonymous", async (req: Request, res: Response) => {
  try {
    const { sessionId, recipeId, eventType, countryCode } = req.body || {};
    const normalizedEventType = typeof eventType === "string" ? eventType.toUpperCase() : "";
    const allowedEventTypes: RecipeEventType[] = ["VIEW", "CLICK", "SAVE"];

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "sessionId is required" });
    }

    if (!recipeId || typeof recipeId !== "string") {
      return res.status(400).json({ error: "recipeId is required" });
    }

    if (!allowedEventTypes.includes(normalizedEventType as RecipeEventType)) {
      return res.status(400).json({ error: "eventType must be VIEW, CLICK, or SAVE" });
    }

    await recordAnonymousRecipeEvent({
      sessionId,
      recipeid: recipeId,
      eventType: normalizedEventType as RecipeEventType,
      countryCode: typeof countryCode === "string" ? countryCode : undefined,
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Error recording anonymous recipe event:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/recommendations/home", async (req: Request, res: Response) => {
  try {
    const user = getOptionalUser(req);
    const rawLimit = req.query.limit;
    const rawSessionId = req.query.sessionId;
    const parsedLimit = Number(Array.isArray(rawLimit) ? rawLimit[0] : rawLimit);
    const sessionId = typeof rawSessionId === "string" ? rawSessionId : undefined;
    
    const recommendations = await getHomeRecommendations(
      user?.userid,
      sessionId,
      Number.isFinite(parsedLimit) ? parsedLimit : 20
    );

    return res.json({ recommendations });
  } catch (err) {
    console.error("Error fetching home recommendations:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new recipe (authenticated)
app.post("/api/recipes", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, image_url, thumbnail_url, youtube_url, prepTimeMin, cookTimeMin, dietType, servings, difficulty, visibility, steps, ingredients, tags } = req.body || {};
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "title is required" });
    }
    const recipe = await createRecipe({
      userid: req.user!.userid,
      title: title.trim(),
      description: description || undefined,
      image_url: image_url || undefined,
      thumbnail_url: thumbnail_url || undefined,
      youtube_url: youtube_url || undefined,
      prepTimeMin: prepTimeMin ? Number(prepTimeMin) : undefined,
      cookTimeMin: cookTimeMin ? Number(cookTimeMin) : undefined,
      dietType: normalizeRecipeDietType(dietType),
      servings: servings ? Number(servings) : undefined,
      difficulty: difficulty || undefined,
      visibility: visibility || "PUBLIC",
      steps: steps || [],
      ingredients: ingredients || [],
      tags: tags || [],
    });
    return res.status(201).json({ recipe });
  } catch (err) {
    console.error("Create recipe error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get current user's recipes
app.get("/api/my-recipes", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const recipes = await getUserRecipes(req.user!.userid);
    return res.json({ recipes });
  } catch (err) {
    console.error("Error fetching user recipes:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/my-saved-recipes", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const recipes = await getSavedRecipes(req.user!.userid);
    return res.json({ recipes });
  } catch (err) {
    console.error("Error fetching saved recipes:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/saved-recipes/:recipeId/status", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = req.params.recipeId as string;
    const saved = await isRecipeSaved(req.user!.userid, recipeId);
    return res.json({ saved });
  } catch (err) {
    console.error("Error checking saved recipe status:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/saved-recipes/:recipeId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = req.params.recipeId as string;
    await saveRecipeForUser(req.user!.userid, recipeId);

    await recordRecipeEvent({
      userid: req.user!.userid,
      recipeid: recipeId,
      eventType: "SAVE",
      countryCode: typeof req.body?.countryCode === "string" ? req.body.countryCode : undefined,
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Error saving recipe:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/saved-recipes/:recipeId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = req.params.recipeId as string;
    await removeSavedRecipeForUser(req.user!.userid, recipeId);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error removing saved recipe:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get full details of a user's own recipe (for editing)
app.get("/api/my-recipes/:recipeId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = req.params.recipeId as string;
    const details = await getRecipeDetailsForOwner(recipeId, req.user!.userid);
    if (!details) {
      return res.status(404).json({ error: "Recipe not found or not yours" });
    }
    return res.json(details);
  } catch (err) {
    console.error("Error fetching own recipe details:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update a recipe (authenticated, owner only)
app.put("/api/recipes/:recipeId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = req.params.recipeId as string;
    const { title, description, image_url, thumbnail_url, youtube_url, prepTimeMin, cookTimeMin, dietType, servings, difficulty, visibility, steps, ingredients, tags } = req.body || {};
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "title is required" });
    }
    const recipe = await updateRecipe(recipeId, req.user!.userid, {
      title: title.trim(),
      description: description || undefined,
      image_url: image_url || undefined,
      thumbnail_url: thumbnail_url || undefined,
      youtube_url: youtube_url || undefined,
      prepTimeMin: prepTimeMin ? Number(prepTimeMin) : undefined,
      cookTimeMin: cookTimeMin ? Number(cookTimeMin) : undefined,
      dietType: normalizeRecipeDietType(dietType),
      servings: servings ? Number(servings) : undefined,
      difficulty: difficulty || undefined,
      visibility: visibility || "PUBLIC",
      steps: steps || [],
      ingredients: ingredients || [],
      tags: tags || [],
    });
    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found or not yours" });
    }
    return res.json({ recipe });
  } catch (err) {
    console.error("Update recipe error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a recipe (authenticated, owner only)
app.delete("/api/recipes/:recipeId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const recipeId = req.params.recipeId as string;
    const deleted = await deleteRecipe(recipeId, req.user!.userid);
    if (!deleted) {
      return res.status(404).json({ error: "Recipe not found or not yours" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete recipe error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Subscription endpoints
/**
 * Check if current user is premium
 */
app.get("/api/subscription/status", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const isPremium = await isUserPremium(req.user!.userid);
    return res.json({ isPremium });
  } catch (err) {
    console.error("Error checking premium status:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Get current subscription details
 */
app.get("/api/subscription/details", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const subscription = await getSubscriptionByUserId(req.user!.userid);
    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }
    return res.json({
      subscriptionId: subscription.subscriptionid,
      userId: subscription.userid,
      startDate: subscription.subscription_start_date,
      endDate: subscription.subscription_end_date,
      createdAt: subscription.created_at,
      updatedAt: subscription.updated_at,
    });
  } catch (err) {
    console.error("Error fetching subscription details:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Create a new subscription (simulate payment processed)
 * In a real app, this would be called after Stripe/PayPal validates payment
 */
app.post("/api/subscription/create", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Check if user already has an active subscription
    const existingSubscription = await getSubscriptionByUserId(req.user!.userid);
    if (existingSubscription) {
      const isPremium = await isUserPremium(req.user!.userid);
      if (isPremium) {
        return res.status(409).json({ error: "User already has an active subscription" });
      }
    }

    const subscription = await createSubscription(req.user!.userid);
    return res.status(201).json({
      success: true,
      subscription: {
        subscriptionId: subscription.subscriptionid,
        userId: subscription.userid,
        startDate: subscription.subscription_start_date,
        endDate: subscription.subscription_end_date,
        createdAt: subscription.created_at,
      },
    });
  } catch (err) {
    console.error("Error creating subscription:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Renew an existing subscription for another month
 */
app.post("/api/subscription/renew", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const subscription = await getSubscriptionByUserId(req.user!.userid);
    if (!subscription) {
      return res.status(404).json({ error: "No subscription found to renew" });
    }

    const renewed = await renewSubscription(req.user!.userid);
    return res.json({
      success: true,
      subscription: {
        subscriptionId: renewed.subscriptionid,
        userId: renewed.userid,
        startDate: renewed.subscription_start_date,
        endDate: renewed.subscription_end_date,
        updatedAt: renewed.updated_at,
      },
    });
  } catch (err) {
    console.error("Error renewing subscription:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Cancel a subscription (downgrade from premium)
 */
app.post("/api/subscription/cancel", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const subscription = await getSubscriptionByUserId(req.user!.userid);
    if (!subscription) {
      return res.status(404).json({ error: "No subscription found to cancel" });
    }

    await cancelSubscription(req.user!.userid);
    return res.json({ success: true, message: "Subscription cancelled successfully" });
  } catch (err) {
    console.error("Error cancelling subscription:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/billing/checkout", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const {
      mode,
      cardholderName,
      cardNumber,
      expiryMonth,
      expiryYear,
      cvc,
      billingEmail,
    } = req.body || {};

    const result = await processPremiumCheckout({
      userId: req.user!.userid,
      mode,
      cardholderName: String(cardholderName || ""),
      cardNumber: String(cardNumber || ""),
      expiryMonth: Number(expiryMonth),
      expiryYear: Number(expiryYear),
      cvc: String(cvc || ""),
      billingEmail: String(billingEmail || ""),
    });

    return res.status(201).json({
      success: true,
      payment: result.payment,
      subscription: result.subscription,
    });
  } catch (err) {
    console.error("Error processing billing checkout:", err);
    const typedErr = err as Error & { code?: string };

    if (typedErr.code === "BILLING_VALIDATION_ERROR") {
      return res.status(400).json({ error: typedErr.message });
    }

    if (typedErr.code === "PAYMENT_DECLINED") {
      return res.status(402).json({ error: typedErr.message });
    }

    if (typedErr.code === "SUBSCRIPTION_EXISTS") {
      return res.status(409).json({ error: typedErr.message });
    }

    if (typedErr.code === "SUBSCRIPTION_MISSING") {
      return res.status(404).json({ error: typedErr.message });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }

    const user = await createUser(name, email, password);

    return res.status(201).json({ user });
  } catch (err: any) {
    if (err && err.code === "USER_EXISTS") {
      return res.status(409).json({ error: "User with that email already exists" });
    }
    console.error("Registration error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
