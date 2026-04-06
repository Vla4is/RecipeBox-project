import pool from "./database";
import seedRecipes from "./seedRecipes";

function normalizeNicknameSeed(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 30);
}

function buildNicknameSeed(name: string) {
  const firstPart = name.trim().split(/\s+/).filter(Boolean)[0] || "";
  return normalizeNicknameSeed(firstPart) || normalizeNicknameSeed(name) || "chef";
}

async function createTables() {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

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

    if (await typeExists('recipe_diet_enum')) {
      console.log('recipe_diet_enum type already exists');
    } else {
      await pool.query(`
        CREATE TYPE recipe_diet_enum AS ENUM ('NONE', 'VEGETARIAN', 'VEGAN');
      `);
      console.log('Created recipe_diet_enum type');
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

    if (await typeExists('payment_status_enum')) {
      console.log('payment_status_enum type already exists');
    } else {
      await pool.query(`
        CREATE TYPE payment_status_enum AS ENUM ('SUCCEEDED', 'DECLINED', 'FAILED');
      `);
      console.log('Created payment_status_enum type');
    }

    if (await typeExists('payment_provider_enum')) {
      console.log('payment_provider_enum type already exists');
    } else {
      await pool.query(`
        CREATE TYPE payment_provider_enum AS ENUM ('MOCKCARD');
      `);
      console.log('Created payment_provider_enum type');
    }

    // ensure users table
    if (await tableExists('users')) {
      console.log('Users table already exists, skipping creation');
      const nicknameCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nickname'`
      );
      if (nicknameCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE users ADD COLUMN nickname VARCHAR(30)`);
        console.log('Added nickname column to users table');
      }

      const avatarCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'avatar_url'`
      );
      if (avatarCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
        console.log('Added avatar_url column to users table');
      }

      const changeCountCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nickname_change_count'`
      );
      if (changeCountCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE users ADD COLUMN nickname_change_count INT NOT NULL DEFAULT 0`);
        console.log('Added nickname_change_count column to users table');
      }

      const changedAtCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nickname_changed_at'`
      );
      if (changedAtCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE users ADD COLUMN nickname_changed_at TIMESTAMP`);
        console.log('Added nickname_changed_at column to users table');
      }
    } else {
      await pool.query(`
        CREATE TABLE users (
          userid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          nickname VARCHAR(30) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          avatar_url TEXT,
          password_hash VARCHAR(255) NOT NULL,
          nickname_change_count INT NOT NULL DEFAULT 0,
          nickname_changed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('Users table created successfully');
    }

    const usersMissingNicknames = await pool.query(
      `SELECT userid, name FROM users WHERE nickname IS NULL OR LENGTH(TRIM(nickname)) = 0 ORDER BY created_at ASC`
    );
    const takenNicknames = new Set<string>();
    const existingNicknames = await pool.query(
      `SELECT nickname FROM users WHERE nickname IS NOT NULL AND LENGTH(TRIM(nickname)) > 0`
    );
    for (const row of existingNicknames.rows as Array<{ nickname: string }>) {
      takenNicknames.add(row.nickname.toLowerCase());
    }

    for (const user of usersMissingNicknames.rows as Array<{ userid: string; name: string }>) {
      const base = buildNicknameSeed(user.name);
      let candidate = base;
      let suffix = 2;
      while (takenNicknames.has(candidate.toLowerCase())) {
        candidate = `${base}${suffix}`;
        suffix += 1;
      }

      takenNicknames.add(candidate.toLowerCase());
      await pool.query(`UPDATE users SET nickname = $1, updated_at = CURRENT_TIMESTAMP WHERE userid = $2::uuid`, [
        candidate,
        user.userid,
      ]);
    }

    await pool.query(`ALTER TABLE users ALTER COLUMN nickname SET NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_lower_unique ON users (LOWER(nickname))`);

    // ensure recipes table
    if (await tableExists('recipes')) {
      console.log('Recipes table already exists, skipping creation');
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_title_trgm ON recipes USING GIN (title gin_trgm_ops)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_description_trgm ON recipes USING GIN (description gin_trgm_ops)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_visibility_user ON recipes(visibility, userid)`);
      // ensure image_url column exists (added later)
      const colCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'image_url'`
      );
      if (colCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE recipes ADD COLUMN image_url TEXT`);
        console.log('Added image_url column to recipes table');
      }
      const thumbnailCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'thumbnail_url'`
      );
      if (thumbnailCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE recipes ADD COLUMN thumbnail_url TEXT`);
        console.log('Added thumbnail_url column to recipes table');
      }
      const youtubeUrlCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'youtube_url'`
      );
      if (youtubeUrlCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE recipes ADD COLUMN youtube_url TEXT`);
        console.log('Added youtube_url column to recipes table');
      }
      // ensure userid column exists (added later)
      const userIdCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'userid'`
      );
      if (userIdCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE recipes ADD COLUMN userid UUID REFERENCES users(userid) ON DELETE SET NULL`);
        console.log('Added userid column to recipes table');
      }
      const totalTimeCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'totaltimemin'`
      );
      if (totalTimeCheck.rows.length === 0) {
        await pool.query(`
          ALTER TABLE recipes
          ADD COLUMN totaltimemin INT GENERATED ALWAYS AS (
            COALESCE(proptimemin, 0) + COALESCE(cooktimemin, 0)
          ) STORED
        `);
        console.log('Added totaltimemin generated column to recipes table');
      }
      const dietTypeCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'diet_type'`
      );
      if (dietTypeCheck.rows.length === 0) {
        await pool.query(`
          ALTER TABLE recipes
          ADD COLUMN diet_type recipe_diet_enum NOT NULL DEFAULT 'NONE'
        `);
        console.log('Added diet_type column to recipes table');
      }
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_totaltimemin ON recipes(totaltimemin)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_recipes_diet_type ON recipes(diet_type)`);
    } else {
      await pool.query(`
        CREATE TABLE recipes (
          recipeid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userid UUID REFERENCES users(userid) ON DELETE SET NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          image_url TEXT,
          thumbnail_url TEXT,
          youtube_url TEXT,
          propTimeMin INT,
          cookTimeMin INT,
          totalTimeMin INT GENERATED ALWAYS AS (
            COALESCE(propTimeMin, 0) + COALESCE(cookTimeMin, 0)
          ) STORED,
          diet_type recipe_diet_enum NOT NULL DEFAULT 'NONE',
          servings INT,
          difficulty difficulty_enum,
          visibility visibility_enum,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`CREATE INDEX idx_recipes_title_trgm ON recipes USING GIN (title gin_trgm_ops)`);
      await pool.query(`CREATE INDEX idx_recipes_description_trgm ON recipes USING GIN (description gin_trgm_ops)`);
      await pool.query(`CREATE INDEX idx_recipes_visibility_user ON recipes(visibility, userid)`);
      await pool.query(`CREATE INDEX idx_recipes_totaltimemin ON recipes(totaltimemin)`);
      await pool.query(`CREATE INDEX idx_recipes_diet_type ON recipes(diet_type)`);
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
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tags_recipeid_name ON tags(recipeid, name)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tags_name_trgm ON tags USING GIN (name gin_trgm_ops)`);
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
      await pool.query(`CREATE INDEX idx_tags_recipeid_name ON tags(recipeid, name)`);
      await pool.query(`CREATE INDEX idx_tags_name_trgm ON tags USING GIN (name gin_trgm_ops)`);
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
      await pool.query(`
        DELETE FROM reviews r1
        USING reviews r2
        WHERE r1.reviewid <> r2.reviewid
          AND r1.userid = r2.userid
          AND r1.recipeid = r2.recipeid
          AND r1.created_at < r2.created_at
      `);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_recipe_unique ON reviews(userid, recipeid)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_recipe_created ON reviews(recipeid, created_at DESC)`);
    } else {
      await pool.query(`
        CREATE TABLE reviews (
          reviewid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
          recipeid UUID NOT NULL REFERENCES recipes(recipeid) ON DELETE CASCADE,
          stars INT NOT NULL CHECK (stars >= 1 AND stars <= 5),
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(userid, recipeid)
        );
      `);
      await pool.query(`CREATE INDEX idx_reviews_recipe_created ON reviews(recipeid, created_at DESC)`);
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

    // ensure subscriptions table
    if (await tableExists('subscriptions')) {
      console.log('Subscriptions table already exists, skipping creation');
      // ensure is_premium computed from subscription dates is working
      const columnCheck = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'subscription_start_date'`
      );
      if (columnCheck.rows.length === 0) {
        await pool.query(`ALTER TABLE subscriptions ADD COLUMN subscription_start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        console.log('Added subscription_start_date column to subscriptions table');
      }
    } else {
      await pool.query(`
        CREATE TABLE subscriptions (
          subscriptionid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userid UUID NOT NULL UNIQUE REFERENCES users(userid) ON DELETE CASCADE,
          subscription_start_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          subscription_end_date TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_userid ON subscriptions(userid)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(subscription_end_date)`);
      console.log('Subscriptions table created successfully');
    }

    if (await tableExists('payments')) {
      console.log('Payments table already exists, skipping creation');
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments(userid, created_at DESC)`);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_transaction_unique ON payments(provider_transaction_id)`);
    } else {
      await pool.query(`
        CREATE TABLE payments (
          paymentid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
          subscriptionid UUID REFERENCES subscriptions(subscriptionid) ON DELETE SET NULL,
          status payment_status_enum NOT NULL,
          provider payment_provider_enum NOT NULL,
          provider_transaction_id VARCHAR(255) NOT NULL,
          amount_cents INT NOT NULL CHECK (amount_cents > 0),
          currency VARCHAR(3) NOT NULL,
          cardholder_name VARCHAR(255) NOT NULL,
          card_brand VARCHAR(64) NOT NULL,
          card_last4 VARCHAR(4) NOT NULL,
          billing_email VARCHAR(255) NOT NULL,
          failure_reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await pool.query(`CREATE INDEX idx_payments_user_created ON payments(userid, created_at DESC)`);
      await pool.query(`CREATE UNIQUE INDEX idx_payments_provider_transaction_unique ON payments(provider_transaction_id)`);
      console.log('Payments table created successfully');
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

    const shouldAutoSeedRecipes = (process.env.AUTO_SEED_RECIPES || "true").toLowerCase() !== "false";
    if (shouldAutoSeedRecipes) {
      await seedRecipes(pool);
    } else {
      console.log("Skipping auto recipe seed (AUTO_SEED_RECIPES is explicitly set to 'false')");
    }
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

export default createTables;
