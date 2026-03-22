import pool from "./database";
import seedRecipes from "./seedRecipes";

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

    if (await typeExists('recipe_event_type_enum')) {
      console.log('recipe_event_type_enum type already exists');
    } else {
      await pool.query(`
        CREATE TYPE recipe_event_type_enum AS ENUM ('VIEW', 'CLICK', 'SAVE');
      `);
      console.log('Created recipe_event_type_enum type');
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
      // ensure userid column exists (added later)
      const userIdCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'userid'`
      );
      if (userIdCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE recipes ADD COLUMN userid UUID REFERENCES users(userid) ON DELETE SET NULL`);
        console.log('Added userid column to recipes table');
      }
    } else {
      await pool.query(`
        CREATE TABLE recipes (
          recipeid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userid UUID REFERENCES users(userid) ON DELETE SET NULL,
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

    // ensure user_recipe_events table
    if (await tableExists('user_recipe_events')) {
      console.log('User recipe events table already exists, skipping creation');
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_recipe_events_user_created ON user_recipe_events(userid, created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_recipe_events_recipe ON user_recipe_events(recipeid)`);
    } else {
      await pool.query(`
        CREATE TABLE user_recipe_events (
          eventid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
          recipeid UUID NOT NULL REFERENCES recipes(recipeid) ON DELETE CASCADE,
          event_type recipe_event_type_enum NOT NULL,
          country_code VARCHAR(2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`CREATE INDEX idx_user_recipe_events_user_created ON user_recipe_events(userid, created_at DESC)`);
      await pool.query(`CREATE INDEX idx_user_recipe_events_recipe ON user_recipe_events(recipeid)`);
      console.log('User recipe events table created successfully');
    }

    // ensure anonymous_recipe_events table
    if (await tableExists('anonymous_recipe_events')) {
      console.log('Anonymous recipe events table already exists, skipping creation');
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_anon_recipe_events_session_created ON anonymous_recipe_events(session_id, created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_anon_recipe_events_recipe ON anonymous_recipe_events(recipeid)`);
    } else {
      await pool.query(`
        CREATE TABLE anonymous_recipe_events (
          eventid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id VARCHAR(255) NOT NULL,
          recipeid UUID NOT NULL REFERENCES recipes(recipeid) ON DELETE CASCADE,
          event_type recipe_event_type_enum NOT NULL,
          country_code VARCHAR(2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`CREATE INDEX idx_anon_recipe_events_session_created ON anonymous_recipe_events(session_id, created_at DESC)`);
      await pool.query(`CREATE INDEX idx_anon_recipe_events_recipe ON anonymous_recipe_events(recipeid)`);
      console.log('Anonymous recipe events table created successfully');
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

    const shouldAutoSeedRecipes = (process.env.AUTO_SEED_RECIPES || "false").toLowerCase() === "true";
    if (shouldAutoSeedRecipes) {
      await seedRecipes(pool);
    } else {
      console.log("Skipping auto recipe seed (AUTO_SEED_RECIPES is not 'true')");
    }
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

export default createTables;
