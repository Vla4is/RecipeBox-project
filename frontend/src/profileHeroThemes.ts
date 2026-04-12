export const DEFAULT_HERO_COLOR_KEY = "golden_hour";

export const PROFILE_HERO_THEMES = [
  {
    key: "golden_hour",
    label: "Golden Hour",
    solid: "#d89b2b",
    gradient: "linear-gradient(135deg, #f4c542 0%, #d9861a 100%)",
    glow: "rgba(255, 213, 79, 0.42)",
  },
  {
    key: "ember",
    label: "Ember",
    solid: "#c85e34",
    gradient: "linear-gradient(135deg, #f08a4b 0%, #b64024 100%)",
    glow: "rgba(240, 138, 75, 0.38)",
  },
  {
    key: "ocean",
    label: "Ocean",
    solid: "#2f6f9f",
    gradient: "linear-gradient(135deg, #5da8d8 0%, #28567a 100%)",
    glow: "rgba(93, 168, 216, 0.34)",
  },
  {
    key: "forest",
    label: "Forest",
    solid: "#3f7750",
    gradient: "linear-gradient(135deg, #72b685 0%, #2f5f3f 100%)",
    glow: "rgba(114, 182, 133, 0.32)",
  },
  {
    key: "plum",
    label: "Plum",
    solid: "#7b4c82",
    gradient: "linear-gradient(135deg, #b06fb9 0%, #5c3563 100%)",
    glow: "rgba(176, 111, 185, 0.34)",
  },
] as const;

export type ProfileHeroTheme = (typeof PROFILE_HERO_THEMES)[number];
export type HeroColorKey = ProfileHeroTheme["key"];

export function getProfileHeroTheme(key: string | null | undefined): ProfileHeroTheme {
  return PROFILE_HERO_THEMES.find((theme) => theme.key === key) ?? PROFILE_HERO_THEMES[0];
}
