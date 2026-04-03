export type RecipeDietType = "NONE" | "VEGETARIAN" | "VEGAN";
export type SearchDietFilter = Exclude<RecipeDietType, "NONE">;

export function normalizeRecipeDietType(value: unknown): RecipeDietType {
  const normalized = typeof value === "string" ? value.toUpperCase() : "NONE";
  if (normalized === "VEGAN") return "VEGAN";
  if (normalized === "VEGETARIAN") return "VEGETARIAN";
  return "NONE";
}

export function parseSearchDietFilter(value: string | null): SearchDietFilter | null {
  const normalized = normalizeRecipeDietType(value);
  return normalized === "NONE" ? null : normalized;
}

export function getRecipeDietBadge(value: unknown): {
  label: string;
  icon: string;
  className: string;
  bg: string;
  color: string;
} | null {
  const dietType = normalizeRecipeDietType(value);
  switch (dietType) {
    case "VEGAN":
      return {
        label: "Vegan",
        icon: "🌿",
        className: "diet-badge-vegan",
        bg: "#dcfce7",
        color: "#166534",
      };
    case "VEGETARIAN":
      return {
        label: "Vegetarian",
        icon: "🥬",
        className: "diet-badge-vegetarian",
        bg: "#fef3c7",
        color: "#92400e",
      };
    default:
      return null;
  }
}
