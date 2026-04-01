/**
 * Shared API types between frontend and backend
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Ingredient-related types
export type Unit =
  | 'G'
  | 'KG'
  | 'ML'
  | 'L'
  | 'TSP'
  | 'TBSP'
  | 'CUP'
  | 'PCS';

export interface Ingredient {
  ingredientId: string;
  name: string;
  defaultUnit: Unit;
}

// A mapping between a recipe and an ingredient with additional details
export interface RecipeIngredient {
  recipeIngredientId: string;
  recipeId: string;
  ingredientId: string;
  amount: number;
  unit?: Unit;
  notes?: string;
}

// Step within a recipe, ordered and optionally timed
export interface Step {
  stepId: string;
  recipeId: string;
  stepNo: number;
  instruction: string;
  timerSec?: number;
}

// Tag associated with a recipe
export interface Tag {
  tagId: string;
  recipeId: string;
  name: string;
}

// A user saving a recipe as a favorite
export interface Favorite {
  favoriteId: string;
  userId: string;
  recipeId: string;
  savedAt: string; // ISO timestamp
}

// A user's review of a recipe
export interface Review {
  reviewId: string;
  userId: string;
  recipeId: string;
  stars: number;
  comment?: string;
  createdAt: string; // ISO timestamp
}

// A shopping list
export interface ShoppingList {
  listId: string; // UUID
  name: string;
  createdAt: string; // ISO timestamp
}

// An item in a shopping list
export interface ShoppingItem {
  itemId: string; // UUID
  listId: string; // UUID
  amount?: number;
  unit?: Unit;
  isPurchased: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// User subscription
export interface Subscription {
  subscriptionId: string; // UUID
  userId: string; // UUID
  subscriptionStartDate: string; // ISO timestamp
  subscriptionEndDate: string; // ISO timestamp
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// User profile with premium status
export interface User {
  userId: string; // UUID
  name: string;
  email: string;
  isPremium: boolean; // Computed: true if subscription exists and subscription_end_date > NOW()
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
