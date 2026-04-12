export const DEFAULT_HERO_COLOR_KEY = "golden_hour";

export const HERO_COLOR_KEYS = [
  "golden_hour",
  "ember",
  "ocean",
  "forest",
  "plum",
] as const;

export type HeroColorKey = typeof HERO_COLOR_KEYS[number];

export function isHeroColorKey(value: string): value is HeroColorKey {
  return HERO_COLOR_KEYS.includes(value as HeroColorKey);
}
