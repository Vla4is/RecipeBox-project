
import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import initializeDatabase from "./db-init";
import { createUser, authenticateUser } from "./services/userService";
import { getPublicRecipes, createRecipe, getRecipeDetails, getUserRecipes, updateRecipe, deleteRecipe, getRecipeDetailsForOwner } from "./services/recipeService";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// JWT auth middleware
interface AuthRequest extends Request {
  user?: { userid: string; email: string; name: string };
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userid: string; email: string; name: string };
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
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

app.get("/", (_req: Request, res: Response) => {
  res.send("Hello from Node + TypeScript 🚀");
});

app.get("/api/hello", (_req: Request, res: Response) => {
  res.json({ message: "Bro Hello from the backend!" });
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

app.get("/api/recipes/:recipeId", async (req: Request, res: Response) => {
  try {
    const rawRecipeId = req.params.recipeId;
    const recipeId = Array.isArray(rawRecipeId) ? rawRecipeId[0] : rawRecipeId;

    if (!recipeId) {
      return res.status(400).json({ error: "recipeId is required" });
    }

    const details = await getRecipeDetails(recipeId);
    if (!details) {
      return res.status(404).json({ error: "Recipe not found" });
    }
    return res.json(details);
  } catch (err) {
    console.error("Error fetching recipe details:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new recipe (authenticated)
app.post("/api/recipes", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, image_url, prepTimeMin, cookTimeMin, servings, difficulty, visibility, steps, ingredients, tags } = req.body || {};
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "title is required" });
    }
    const recipe = await createRecipe({
      userid: req.user!.userid,
      title: title.trim(),
      description: description || undefined,
      image_url: image_url || undefined,
      prepTimeMin: prepTimeMin ? Number(prepTimeMin) : undefined,
      cookTimeMin: cookTimeMin ? Number(cookTimeMin) : undefined,
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
    const { title, description, image_url, prepTimeMin, cookTimeMin, servings, difficulty, visibility, steps, ingredients, tags } = req.body || {};
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "title is required" });
    }
    const recipe = await updateRecipe(recipeId, req.user!.userid, {
      title: title.trim(),
      description: description || undefined,
      image_url: image_url || undefined,
      prepTimeMin: prepTimeMin ? Number(prepTimeMin) : undefined,
      cookTimeMin: cookTimeMin ? Number(cookTimeMin) : undefined,
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
