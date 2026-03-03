# Functional Requirements - Recipe Management System

## 1. System Overview

The Recipe Management System is a full-stack web application that allows users to create, share, and manage recipes. Users can browse public recipes, save recipes to their collection, organize ingredients, and manage shopping lists.

---

## 2. User Management

### 2.1 User Registration
- **FR 2.1.1** Users can create a new account by providing:
  - Full name
  - Email address
  - Password
- **FR 2.1.2** Email validation ensures no duplicate accounts exist
- **FR 2.1.3** Passwords are securely hashed using scrypt algorithm before storage
- **FR 2.1.4** Password requirements (if any) should be validated on registration

### 2.2 User Authentication
- **FR 2.2.1** Users can log in with email and password
- **FR 2.2.2** Successful authentication generates a JWT token for session management
- **FR 2.2.3** JWT tokens are stored locally in the browser for persistent sessions
- **FR 2.2.4** Users can log out, which clears the JWT token from local storage
- **FR 2.2.5** Failed login attempts return appropriate error messages

### 2.3 Session Management
- **FR 2.3.1** JWT tokens expire after a defined period (implementation time TBD)
- **FR 2.3.2** Expired tokens prevent access to authenticated endpoints
- **FR 2.3.3** Session persists across page refreshes via localStorage

---

## 3. Recipe Management

### 3.1 Recipe Creation
- **FR 3.1.1** Authenticated users can create new recipes by providing:
  - Title (required, non-empty)
  - Description (optional)
  - Image URL (optional)
  - Preparation time in minutes (optional)
  - Cook time in minutes (optional)
  - Number of servings (optional)
  - Difficulty level (optional)
  - Visibility setting (PUBLIC or PRIVATE, default: PUBLIC)
  - Ingredients list (with amounts and units)
  - Step-by-step instructions
  - Tags for categorization

### 3.2 Recipe Reading/Browsing
- **FR 3.2.1** Unauthenticated users can browse all public recipes
- **FR 3.2.2** Public recipes are displayed in a list sorted by creation date (newest first)
- **FR 3.2.3** Users can view detailed recipe information including:
  - Recipe title, description, and image
  - Ingredients with amounts and units
  - Step-by-step cooking instructions with optional timers
  - Tags associated with the recipe
  - Difficulty level, prep time, cook time, and servings
- **FR 3.2.4** Authenticated users can view their own recipes (PUBLIC and PRIVATE)
- **FR 3.2.5** Authenticated users cannot view other users' PRIVATE recipes

### 3.3 Recipe Editing
- **FR 3.3.1** Recipe owners can edit their own recipes
- **FR 3.3.2** Edit operations update all recipe fields:
  - Title, description, image URL
  - Timing information (prep time, cook time)
  - Servings and difficulty level
  - Visibility settings
  - Ingredients with amounts and units
  - Instructions steps (can be reordered)
  - Tags
- **FR 3.3.3** Only the recipe owner can edit a recipe
- **FR 3.3.4** Changes are persisted to the database immediately

### 3.4 Recipe Deletion
- **FR 3.4.1** Recipe owners can delete their own recipes
- **FR 3.4.2** Only the recipe owner can delete a recipe
- **FR 3.4.3** Deletion removes the recipe and all associated data (ingredients, steps, tags)

### 3.5 Recipe Visibility
- **FR 3.5.1** Recipes can be marked as PUBLIC (visible to all users) or PRIVATE (visible only to owner)
- **FR 3.5.2** Visibility can be changed at any time during recipe editing
- **FR 3.5.3** Only PUBLIC recipes appear in the public recipe list

---

## 4. Recipe Details (Ingredients, Steps, Tags)

### 4.1 Ingredients Management
- **FR 4.1.1** Each recipe can have multiple ingredients
- **FR 4.1.2** Ingredients must include:
  - Ingredient name
  - Amount (quantity)
  - Unit of measurement (G, KG, ML, L, TSP, TBSP, CUP, PCS)
  - Optional notes (e.g., "finely chopped")
- **FR 4.1.3** Ingredient list is sorted alphabetically for consistency
- **FR 4.1.4** Each ingredient can be added, modified, or removed during recipe creation/editing
- **FR 4.1.5** A system of predefined ingredients reduces duplication

### 4.2 Steps Management
- **FR 4.2.1** Each recipe contains ordered cooking steps
- **FR 4.2.2** Each step includes:
  - Step number (auto-assigned based on order)
  - Instruction text (required)
  - Optional timer in seconds (for cooking timers)
- **FR 4.2.3** Steps are displayed in sequential order during recipe viewing
- **FR 4.2.4** Steps can be reordered during recipe editing
- **FR 4.2.5** Timers help users track cooking time for specific steps

### 4.3 Tags Management
- **FR 4.3.1** Recipes can have multiple descriptive tags
- **FR 4.3.2** Tags are free-text and user-defined
- **FR 4.3.3** Tags are sorted alphabetically when displayed
- **FR 4.3.4** Tags help with recipe categorization (e.g., "vegetarian", "quick", "dessert")

---

## 5. Navigation and Routing

### 5.1 Pages
- **FR 5.1.1** Home page (/) displays:
  - Navigation bar
  - List of public recipes or a featured view
  - Option to search/filter recipes
  - Login/Register links for unauthenticated users
  
- **FR 5.1.2** Registration page (/register) - for unauthenticated users only
  - Form to create a new account
  - Auto-redirects to home if user is already logged in
  
- **FR 5.1.3** Login page (/login) - for unauthenticated users only
  - Form for email and password
  - Auto-redirects to home if user is already logged in
  
- **FR 5.1.4** Add Recipe page (/add-recipe) - for authenticated users only
  - Form to create a new recipe
  - Requires authentication
  
- **FR 5.1.5** My Recipes page (/my-recipes) - for authenticated users only
  - Displays all recipes created by the logged-in user
  - Options to edit or delete each recipe
  - Requires authentication
  
- **FR 5.1.6** Edit Recipe page (/edit-recipe/:recipeId) - for authenticated users only
  - Pre-populated form with existing recipe data
  - Only accessible by recipe owner
  - Requires authentication
  
- **FR 5.1.7** Recipe Details page (/recipes/:recipeId) - public
  - Full recipe details including ingredients, steps, and tags
  - Accessible to all users (PUBLIC recipes)
  - Author's recipes visible only to author

### 5.2 Navigation Bar
- **FR 5.2.1** Navigation bar is persistent across all pages
- **FR 5.2.2** For unauthenticated users, displays:
  - Home link
  - Login link
  - Register link
  
- **FR 5.2.3** For authenticated users, displays:
  - Home link
  - My Recipes link
  - Add Recipe link
  - Logout button
  - User profile/name (optional)
  
- **FR 5.2.4** Logout clears the JWT token and redirects to home page

### 5.3 Access Control
- **FR 5.3.1** Protected routes redirect unauthenticated users to login page
- **FR 5.3.2** Authentication-only pages (Add Recipe, My Recipes, Edit Recipe) require valid JWT token
- **FR 5.3.3** Registration and Login pages are only accessible to logged-out users
- **FR 5.3.4** Public pages (Home, Recipe Details) are accessible to all users

---

## 6. Data Types and Enumerations

### 6.1 Units of Measurement
- Grams (G)
- Kilograms (KG)
- Milliliters (ML)
- Liters (L)
- Teaspoons (TSP)
- Tablespoons (TBSP)
- Cups (CUP)
- Pieces (PCS)

### 6.2 Difficulty Levels
- Easy
- Medium
- Hard
- (Custom levels may be supported)

### 6.3 Recipe Visibility
- PUBLIC (visible to all users)
- PRIVATE (visible only to owner)

---

## 7. Future Features (Planned)

### 7.1 Favorites System
- **FR 7.1.1** Users can save recipes as favorites
- **FR 7.1.2** Favorite recipes are persisted for each user
- **FR 7.1.3** Users can view their list of favorite recipes

### 7.2 Review and Rating System
- **FR 7.2.1** Users can leave reviews on recipes with a 5-star rating
- **FR 7.2.2** Reviews can include optional text comments
- **FR 7.2.3** Multiple reviews are aggregated and displayed on recipe detail page
- **FR 7.2.4** Average rating is calculated from all user reviews

### 7.3 Shopping List Management
- **FR 7.3.1** Users can create named shopping lists
- **FR 7.3.2** Users can add ingredients to shopping lists with amounts and units
- **FR 7.3.3** Shopping list items can be marked as purchased/unpurchased
- **FR 7.3.4** Shopping lists are created and modified by timestamp
- **FR 7.3.5** Users can view and manage their shopping lists

---

## 8. Error Handling

### 8.1 Validation Errors
- **FR 8.1.1** Empty or invalid recipe titles are rejected
- **FR 8.1.2** Invalid email formats are rejected during registration
- **FR 8.1.3** Numeric fields are validated for proper types
- **FR 8.1.4** Appropriate error messages are returned to the user

### 8.2 Authentication Errors
- **FR 8.2.1** Missing or invalid JWT tokens return 401 Unauthorized
- **FR 8.2.2** Expired tokens are rejected
- **FR 8.2.3** Failed login attempts return appropriate error messages

### 8.3 Authorization Errors
- **FR 8.3.1** Attempts to edit/delete others' recipes return 403 Forbidden
- **FR 8.3.2** Access to non-existent recipes returns 404 Not Found

---

## 9. API Endpoints Summary

### Authentication
- `POST /api/login` - User login
- `POST /api/register` - User registration (if implemented)

### Recipe Management (Public)
- `GET /api/recipes` - List all public recipes
- `GET /api/recipes/:recipeId` - Get single recipe details

### Recipe Management (Authenticated)
- `POST /api/recipes` - Create new recipe
- `GET /api/my-recipes` - Get user's recipes
- `GET /api/my-recipes/:recipeId` - Get user's recipe details (for editing)
- `PUT /api/recipes/:recipeId` - Update recipe
- `DELETE /api/recipes/:recipeId` - Delete recipe

---

## 10. Non-Functional Requirements

### 10.1 Performance
- Recipe list should load within 2 seconds
- Recipe detail pages should load within 1 second
- Image loading should be optimized

### 10.2 Security
- All passwords must be hashed using scrypt
- JWT tokens should be used for authentication
- HTTPS should be used in production
- Input validation on both frontend and backend

### 10.3 Scalability
- Database should support pagination for recipe lists (future enhancement)
- API should handle concurrent requests efficiently

### 10.4 Compatibility
- Frontend supports modern browsers (Chrome, Firefox, Safari, Edge)
- Uses React 18+ with TypeScript
- Backend uses Node.js 18+

---

## 11. Data Storage

### 11.1 Database Schema
- **Users Table**: userid, name, email, password_hash, created_at, updated_at
- **Recipes Table**: recipeid, userid, title, description, image_url, proptimemin, cooktimemin, servings, difficulty, visibility, created_at, updated_at
- **Ingredients Table**: ingredientid, name, defaultunit
- **Recipe Ingredients Table**: recipeingredientid, recipeid, ingredientid, amount, unit, notes
- **Steps Table**: stepid, recipeid, stepno, instruction, timersec
- **Tags Table**: tagid, recipeid, name
- **Favorites Table**: favoriteid, userid, recipeid, savedat (future)
- **Reviews Table**: reviewid, userid, recipeid, stars, comment, createdat (future)
- **Shopping Lists Table**: listid, name, createdat (future)
- **Shopping Items Table**: itemid, listid, amount, unit, ispurchased, createdat, updatedat (future)

---

## 12. Assumptions and Constraints

- PostgreSQL is used as the database
- Users are identified by unique email addresses
- Recipes are permanently deleted when removed (no soft delete)
- No collaborative recipe editing (one owner per recipe)
- Image URLs are external (not stored as binary)
- Recipe creation timestamp cannot be manually set
- Only authenticated users can create recipes

