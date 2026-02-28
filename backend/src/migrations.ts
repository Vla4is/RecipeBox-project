import pool from "./database";

async function createTables() {
  try {
    // helper to check table existence
    async function tableExists(name: string): Promise<boolean> {
      const res = await pool.query(
        `SELECT to_regclass('public.${name}') AS exists`
      );
      return res.rows[0].exists !== null;
    }

    // helper to check type existence
    async function typeExists(name: string): Promise<boolean> {
      const res = await pool.query(
        `SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = $1) AS exists`,
        [name]
      );
      return res.rows[0].exists;
    }

    // ensure enum types
    if (await typeExists('difficulty_enum')) {
      console.log('difficulty_enum type already exists');
    } else {
      await pool.query(`
        CREATE TYPE difficulty_enum AS ENUM ('EASY', 'MEDIUM', 'HARD');
      `);
      console.log('Created difficulty_enum type');
    }

    if (await typeExists('visibility_enum')) {
      console.log('visibility_enum type already exists');
    } else {
      await pool.query(`
        CREATE TYPE visibility_enum AS ENUM ('PRIVATE', 'PUBLIC');
      `);
      console.log('Created visibility_enum type');
    }

    if (await typeExists('unit_enum')) {
      console.log('unit_enum type already exists');
    } else {
      await pool.query(`
        CREATE TYPE unit_enum AS ENUM (
          'G', 'KG', 'ML', 'L', 'TSP', 'TBSP', 'CUP', 'PCS'
        );
      `);
      console.log('Created unit_enum type');
    }

    // ensure users table
    if (await tableExists('users')) {
      console.log('Users table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE users (
          userid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Users table created successfully');
    }

    // ensure recipes table
    if (await tableExists('recipes')) {
      console.log('Recipes table already exists, skipping creation');
      // ensure image_url column exists (added later)
      const colCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'image_url'`
      );
      if (colCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE recipes ADD COLUMN image_url TEXT`);
        console.log('Added image_url column to recipes table');
      }
    } else {
      await pool.query(`
        CREATE TABLE recipes (
          recipeid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          image_url TEXT,
          propTimeMin INT,
          cookTimeMin INT,
          servings INT,
          difficulty difficulty_enum,
          visibility visibility_enum,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Recipes table created successfully');
    }

    // ensure ingredient table
    if (await tableExists('ingredients')) {
      console.log('Ingredients table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE ingredients (
          ingredientid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          default_unit unit_enum NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Ingredients table created successfully');
    }

    // ensure recipe_ingredients join table
    if (await tableExists('recipe_ingredients')) {
      console.log('Recipe_ingredients table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE recipe_ingredients (
          recipeingredientid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          recipeid UUID NOT NULL REFERENCES recipes(recipeid) ON DELETE CASCADE,
          ingredientid UUID NOT NULL REFERENCES ingredients(ingredientid) ON DELETE CASCADE,
          amount DOUBLE PRECISION,
          unit unit_enum,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Recipe_ingredients table created successfully');
    }

    // ensure steps table
    if (await tableExists('steps')) {
      console.log('Steps table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE steps (
          stepid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          recipeid UUID NOT NULL REFERENCES recipes(recipeid) ON DELETE CASCADE,
          stepno INT NOT NULL,
          instruction TEXT NOT NULL,
          timersec INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Steps table created successfully');
    }

    // ensure tags table
    if (await tableExists('tags')) {
      console.log('Tags table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE tags (
          tagid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          recipeid UUID NOT NULL REFERENCES recipes(recipeid) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Tags table created successfully');
    }

    // ensure favorites table
    if (await tableExists('favorites')) {
      console.log('Favorites table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE favorites (
          favoriteid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
          recipeid UUID NOT NULL REFERENCES recipes(recipeid) ON DELETE CASCADE,
          saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Favorites table created successfully');
    }

    // ensure reviews table
    if (await tableExists('reviews')) {
      console.log('Reviews table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE reviews (
          reviewid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
          recipeid UUID NOT NULL REFERENCES recipes(recipeid) ON DELETE CASCADE,
          stars INT NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Reviews table created successfully');
    }

    // ensure shopping_list table
    if (await tableExists('shopping_list')) {
      console.log('Shopping list table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE shopping_list (
          listid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Shopping list table created successfully');
    }

    // ensure shopping_item table
    if (await tableExists('shopping_item')) {
      console.log('Shopping item table already exists, skipping creation');
    } else {
      await pool.query(`
        CREATE TABLE shopping_item (
          itemid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          listid UUID NOT NULL REFERENCES shopping_list(listid) ON DELETE CASCADE,
          amount REAL,
          unit unit_enum,
          ispurchased BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Shopping item table created successfully');
    }

    // Seed recipes if empty
    const recipeCount = await pool.query('SELECT COUNT(*) FROM recipes');
    if (parseInt(recipeCount.rows[0].count) === 0) {
      const seedRecipes = [
        { title: 'Chocolate Cake', description: 'Rich and decadent chocolate layer cake', image_url: 'https://images.pexels.com/photos/227432/pexels-photo-227432.jpeg', difficulty: 'MEDIUM', visibility: 'PUBLIC', prepTime: 30, cookTime: 45, servings: 8 },
        { title: 'Shrimp Pasta', description: 'Creamy garlic shrimp with linguine', image_url: 'https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg', difficulty: 'EASY', visibility: 'PUBLIC', prepTime: 15, cookTime: 20, servings: 4 },
        { title: 'Avocado Toast', description: 'Smashed avocado on sourdough with toppings', image_url: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg', difficulty: 'EASY', visibility: 'PUBLIC', prepTime: 5, cookTime: 5, servings: 2 },
        { title: 'Tomato Soup', description: 'Classic creamy tomato soup with basil', image_url: 'https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg', difficulty: 'EASY', visibility: 'PUBLIC', prepTime: 10, cookTime: 30, servings: 4 },
        { title: 'Falafel Wrap', description: 'Crispy falafel with tahini and fresh veggies', image_url: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg', difficulty: 'MEDIUM', visibility: 'PUBLIC', prepTime: 20, cookTime: 15, servings: 4 },
        { title: 'Sushi Rolls', description: 'Fresh salmon and avocado maki rolls', image_url: 'https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg', difficulty: 'HARD', visibility: 'PUBLIC', prepTime: 40, cookTime: 20, servings: 4 },
        { title: 'Chicken Quesadilla', description: 'Cheesy grilled chicken quesadilla', image_url: 'https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg', difficulty: 'EASY', visibility: 'PUBLIC', prepTime: 10, cookTime: 10, servings: 2 },
        { title: 'Apple Pie', description: 'Classic American apple pie with flaky crust', image_url: 'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg', difficulty: 'MEDIUM', visibility: 'PUBLIC', prepTime: 30, cookTime: 50, servings: 8 },
        { title: 'Banana Bread', description: 'Moist banana bread with walnuts', image_url: 'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg', difficulty: 'EASY', visibility: 'PUBLIC', prepTime: 15, cookTime: 60, servings: 8 },
        { title: 'Veggie Stir Fry', description: 'Colorful vegetables in a savory sauce', image_url: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg', difficulty: 'EASY', visibility: 'PUBLIC', prepTime: 15, cookTime: 10, servings: 3 },
        { title: 'Lemon Tart', description: 'Tangy lemon curd in a buttery shell', image_url: 'https://images.pexels.com/photos/227432/pexels-photo-227432.jpeg', difficulty: 'HARD', visibility: 'PUBLIC', prepTime: 30, cookTime: 35, servings: 6 },
        { title: 'Pulled Pork', description: 'Slow-cooked BBQ pulled pork', image_url: 'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg', difficulty: 'MEDIUM', visibility: 'PUBLIC', prepTime: 20, cookTime: 360, servings: 10 },
        { title: 'Eggplant Parmesan', description: 'Crispy breaded eggplant with marinara', image_url: 'https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg', difficulty: 'MEDIUM', visibility: 'PUBLIC', prepTime: 25, cookTime: 40, servings: 6 },
        { title: 'Chicken Shawarma', description: 'Spiced grilled chicken with garlic sauce', image_url: 'https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg', difficulty: 'MEDIUM', visibility: 'PUBLIC', prepTime: 20, cookTime: 25, servings: 4 },
        { title: 'Berry Parfait', description: 'Layered yogurt with fresh berries and granola', image_url: 'https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg', difficulty: 'EASY', visibility: 'PUBLIC', prepTime: 10, cookTime: 0, servings: 2 },
        { title: 'Spinach Quiche', description: 'Savory spinach and cheese quiche', image_url: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg', difficulty: 'MEDIUM', visibility: 'PUBLIC', prepTime: 20, cookTime: 40, servings: 6 },
        { title: 'Pad Thai', description: 'Classic Thai stir-fried rice noodles', image_url: 'https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg', difficulty: 'MEDIUM', visibility: 'PUBLIC', prepTime: 20, cookTime: 15, servings: 4 },
        { title: 'Beef Tacos', description: 'Seasoned ground beef tacos with salsa', image_url: 'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg', difficulty: 'EASY', visibility: 'PUBLIC', prepTime: 10, cookTime: 15, servings: 4 },
        { title: 'Mushroom Risotto', description: 'Creamy arborio rice with wild mushrooms', image_url: 'https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg', difficulty: 'HARD', visibility: 'PUBLIC', prepTime: 15, cookTime: 35, servings: 4 },
        { title: 'Crème Brûlée', description: 'Vanilla custard with caramelized sugar top', image_url: 'https://images.pexels.com/photos/227432/pexels-photo-227432.jpeg', difficulty: 'HARD', visibility: 'PUBLIC', prepTime: 20, cookTime: 45, servings: 4 },
        { title: 'Greek Moussaka', description: 'Layered eggplant, meat, and béchamel', image_url: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg', difficulty: 'HARD', visibility: 'PUBLIC', prepTime: 30, cookTime: 60, servings: 8 },
      ];

      for (const r of seedRecipes) {
        await pool.query(
          `INSERT INTO recipes (title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility) VALUES ($1, $2, $3, $4, $5, $6, $7::difficulty_enum, $8::visibility_enum)`,
          [r.title, r.description, r.image_url, r.prepTime, r.cookTime, r.servings, r.difficulty, r.visibility]
        );
      }
      console.log(`Seeded ${seedRecipes.length} recipes`);
    }
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

export default createTables;
