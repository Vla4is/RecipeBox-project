import pool from "../database";
import { RecipeRow } from "./recipeService";

export type RecipeEventType = "VIEW" | "CLICK" | "SAVE";

// Regularization constants to prevent overfitting
// Caps the max weight that any single preference signal (tags or difficulty) can accumulate
// Prevents power users from getting locked into overly narrow recommendations
const MAX_TAG_WEIGHT_REGULARIZATION = 50;      // Cap on max total tag weight
const MAX_DIFFICULTY_WEIGHT_REGULARIZATION = 25; // Cap on max total difficulty weight

export interface RecordRecipeEventInput {
  userid: string;
  recipeid: string;
  eventType: RecipeEventType;
  countryCode?: string;
}

export interface RecordAnonymousEventInput {
  sessionId: string;
  recipeid: string;
  eventType: RecipeEventType;
  countryCode?: string;
}

export interface RecommendationRow extends RecipeRow {
  score: number;
  reason: string;
  tags?: string[];
}

interface CandidateRow extends RecipeRow {
  popularity_score: number;
  rating_score: number;
}

interface TagPreferenceRow {
  name: string;
  weight: number;
}

interface DifficultyPreferenceRow {
  difficulty: string;
  weight: number;
}

interface AnonymousClickCountRow {
  click_count: number;
}

export async function recordRecipeEvent(input: RecordRecipeEventInput): Promise<void> {
  await pool.query(
    `INSERT INTO user_recipe_events (userid, recipeid, event_type, country_code)
     VALUES ($1::uuid, $2::uuid, $3::recipe_event_type_enum, $4)`,
    [input.userid, input.recipeid, input.eventType, normalizeCountryCode(input.countryCode)]
  );
}

export async function recordAnonymousRecipeEvent(input: RecordAnonymousEventInput): Promise<void> {
  await pool.query(
    `INSERT INTO anonymous_recipe_events (session_id, recipeid, event_type, country_code)
     VALUES ($1, $2::uuid, $3::recipe_event_type_enum, $4)`,
    [input.sessionId, input.recipeid, input.eventType, normalizeCountryCode(input.countryCode)]
  );
}

export async function getHomeRecommendations(userid?: string, sessionId?: string, limit = 20): Promise<RecommendationRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 40);
  const candidates = await fetchCandidates();
  const recipeTags = await fetchCandidateTags(candidates.map((candidate) => candidate.recipeid));

  if (!userid && !sessionId) {
    return rankForAnonymous(candidates, safeLimit, recipeTags);
  }

  if (sessionId && !userid) {
    // Anonymous user with session history
    const [seenRecipeIds, tagPrefs, difficultyPrefs, anonymousRecentClickCount] = await Promise.all([
      fetchAnonymousSeenRecipes(sessionId),
      fetchAnonymousTagPreferences(sessionId),
      fetchAnonymousDifficultyPreferences(sessionId),
      fetchAnonymousRecentClickCount(sessionId),
    ]);

    return rankForUser({
      candidates,
      safeLimit,
      seenRecipeIds,
      tagPrefs,
      difficultyPrefs,
      recipeTags,
      isAnonymous: true,
      anonymousRecentClickCount,
    });
  }

  if (userid) {
    const [seenRecipeIds, tagPrefs, difficultyPrefs] = await Promise.all([
      fetchUserSeenRecipes(userid),
      fetchUserTagPreferences(userid),
      fetchUserDifficultyPreferences(userid),
    ]);

    return rankForUser({
      candidates,
      safeLimit,
      seenRecipeIds,
      tagPrefs,
      difficultyPrefs,
      recipeTags,
      isAnonymous: false,
      anonymousRecentClickCount: 0,
    });
  }

  return rankForAnonymous(candidates, safeLimit, recipeTags);
}

async function fetchCandidates(): Promise<CandidateRow[]> {
  const res = await pool.query(
    `SELECT r.recipeid, r.userid, r.title, r.description, r.image_url, r.youtube_url, r.proptimemin, r.cooktimemin, r.diet_type, r.servings, r.difficulty, r.visibility, r.created_at, r.updated_at,
            COALESCE(popularity.popularity_score, 0) AS popularity_score,
            COALESCE(rating.rating_score, 0) AS rating_score
     FROM recipes r
     LEFT JOIN (
       SELECT recipeid,
              SUM(
                CASE event_type
                  WHEN 'VIEW' THEN 1
                  WHEN 'CLICK' THEN 2
                  WHEN 'SAVE' THEN 4
                  ELSE 0
                END
              )::float AS popularity_score
       FROM user_recipe_events
       GROUP BY recipeid
     ) AS popularity ON popularity.recipeid = r.recipeid
     LEFT JOIN (
       SELECT recipeid,
              ((AVG(stars)::float - 1) / 4) * (COUNT(*)::float / (COUNT(*)::float + 4)) AS rating_score
       FROM reviews
       GROUP BY recipeid
     ) AS rating ON rating.recipeid = r.recipeid
     WHERE r.visibility = 'PUBLIC'
     LIMIT 300`
  );

  return res.rows.sort(() => Math.random() - 0.5);
}

async function fetchUserSeenRecipes(userid: string): Promise<Set<string>> {
  const res = await pool.query(
    `SELECT DISTINCT recipeid
     FROM user_recipe_events
     WHERE userid = $1::uuid
     ORDER BY recipeid`,
    [userid]
  );

  return new Set<string>(res.rows.map((row) => row.recipeid));
}

async function fetchAnonymousSeenRecipes(sessionId: string): Promise<Set<string>> {
  const res = await pool.query(
    `SELECT DISTINCT recipeid
     FROM anonymous_recipe_events
     WHERE session_id = $1
     ORDER BY recipeid`,
    [sessionId]
  );

  return new Set<string>(res.rows.map((row) => row.recipeid));
}

async function fetchUserTagPreferences(userid: string): Promise<Map<string, number>> {
  const res = await pool.query(
    `SELECT t.name,
            SUM(
              (
                CASE e.event_type
                  WHEN 'VIEW' THEN 1
                  WHEN 'CLICK' THEN 2
                  WHEN 'SAVE' THEN 4
                  ELSE 0
                END
              )
              * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - e.created_at)) / 86400, 0) / 18)
            )::float AS weight
     FROM user_recipe_events e
     JOIN tags t ON t.recipeid = e.recipeid
     WHERE e.userid = $1::uuid
       AND e.created_at >= NOW() - INTERVAL '120 days'
     GROUP BY t.name
     ORDER BY weight DESC
     LIMIT 12`,
    [userid]
  );

  const map = new Map<string, number>();
  for (const row of res.rows as TagPreferenceRow[]) {
    map.set(row.name.toLowerCase(), Number(row.weight));
  }
  return map;
}

async function fetchAnonymousTagPreferences(sessionId: string): Promise<Map<string, number>> {
  const res = await pool.query(
    `SELECT t.name,
            SUM(
              (
                CASE e.event_type
                  WHEN 'VIEW' THEN 1
                  WHEN 'CLICK' THEN 8
                  WHEN 'SAVE' THEN 0
                  ELSE 0
                END
              )
              * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - e.created_at)) / 86400, 0) / 6)
            )::float AS weight
     FROM anonymous_recipe_events e
     JOIN tags t ON t.recipeid = e.recipeid
     WHERE e.session_id = $1
       AND e.created_at >= NOW() - INTERVAL '120 days'
     GROUP BY t.name
     ORDER BY weight DESC
     LIMIT 12`,
    [sessionId]
  );

  const map = new Map<string, number>();
  for (const row of res.rows as TagPreferenceRow[]) {
    map.set(row.name.toLowerCase(), Number(row.weight));
  }
  return map;
}

async function fetchUserDifficultyPreferences(userid: string): Promise<Map<string, number>> {
  const res = await pool.query(
    `SELECT r.difficulty,
            SUM(
              (
                CASE e.event_type
                  WHEN 'VIEW' THEN 1
                  WHEN 'CLICK' THEN 2
                  WHEN 'SAVE' THEN 4
                  ELSE 0
                END
              )
              * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - e.created_at)) / 86400, 0) / 28)
            )::float AS weight
     FROM user_recipe_events e
     JOIN recipes r ON r.recipeid = e.recipeid
     WHERE e.userid = $1::uuid
       AND e.created_at >= NOW() - INTERVAL '120 days'
       AND r.difficulty IS NOT NULL
     GROUP BY r.difficulty
     ORDER BY weight DESC`,
    [userid]
  );

  const map = new Map<string, number>();
  for (const row of res.rows as DifficultyPreferenceRow[]) {
    map.set(row.difficulty, Number(row.weight));
  }
  return map;
}

async function fetchAnonymousDifficultyPreferences(sessionId: string): Promise<Map<string, number>> {
  const res = await pool.query(
    `SELECT r.difficulty,
            SUM(
              (
                CASE e.event_type
                  WHEN 'VIEW' THEN 1
                  WHEN 'CLICK' THEN 8
                  WHEN 'SAVE' THEN 0
                  ELSE 0
                END
              )
              * EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - e.created_at)) / 86400, 0) / 8)
            )::float AS weight
     FROM anonymous_recipe_events e
     JOIN recipes r ON r.recipeid = e.recipeid
     WHERE e.session_id = $1
       AND e.created_at >= NOW() - INTERVAL '120 days'
       AND r.difficulty IS NOT NULL
     GROUP BY r.difficulty
     ORDER BY weight DESC`,
    [sessionId]
  );

  const map = new Map<string, number>();
  for (const row of res.rows as DifficultyPreferenceRow[]) {
    map.set(row.difficulty, Number(row.weight));
  }
  return map;
}

async function fetchAnonymousRecentClickCount(sessionId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS click_count
     FROM anonymous_recipe_events
     WHERE session_id = $1
       AND event_type = 'CLICK'
       AND created_at >= NOW() - INTERVAL '14 days'`,
    [sessionId]
  );

  const row = res.rows[0] as AnonymousClickCountRow | undefined;
  return Number(row?.click_count || 0);
}

async function fetchCandidateTags(recipeIds: string[]): Promise<Map<string, string[]>> {
  if (recipeIds.length === 0) {
    return new Map<string, string[]>();
  }

  const res = await pool.query(
    `SELECT recipeid, name
     FROM tags
     WHERE recipeid = ANY($1::uuid[])`,
    [recipeIds]
  );

  const map = new Map<string, string[]>();
  for (const row of res.rows as Array<{ recipeid: string; name: string }>) {
    const tags = map.get(row.recipeid) || [];
    tags.push(row.name.toLowerCase());
    map.set(row.recipeid, tags);
  }
  return map;
}

function rankForAnonymous(candidates: CandidateRow[], limit: number, recipeTags: Map<string, string[]>): RecommendationRow[] {
  const maxPopularity = getMaxPopularity(candidates);
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);

  return shuffled
    .map((candidate) => {
      const popularityScore = normalizedPopularity(candidate.popularity_score, maxPopularity);
      const ratingScore = clamp01(Number(candidate.rating_score) || 0);
      const freshnessScore = calculateFreshnessScore(candidate.created_at);
      const score = 0.55 * popularityScore + 0.25 * freshnessScore + 0.2 * ratingScore;

      return {
        ...toRecipeRow(candidate),
        score,
        reason: ratingScore > 0.75 ? "Highly rated by users" : (popularityScore > 0.1 ? "Trending recipe" : "Popular pick"),
        tags: recipeTags.get(candidate.recipeid) || [],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function rankForUser(params: {
  candidates: CandidateRow[];
  safeLimit: number;
  seenRecipeIds: Set<string>;
  tagPrefs: Map<string, number>;
  difficultyPrefs: Map<string, number>;
  recipeTags: Map<string, string[]>;
  isAnonymous: boolean;
  anonymousRecentClickCount: number;
}): RecommendationRow[] {
  const {
    candidates,
    safeLimit,
    seenRecipeIds,
    tagPrefs,
    difficultyPrefs,
    recipeTags,
    isAnonymous,
    anonymousRecentClickCount,
  } = params;

  const maxPopularity = getMaxPopularity(candidates);
  // Apply regularization caps to prevent overfitting to power users' extreme preferences
  const rawMaxTagWeight = sumMapValues(tagPrefs);
  const rawMaxDifficultyWeight = sumMapValues(difficultyPrefs);
  const maxTagWeight = Math.min(rawMaxTagWeight, MAX_TAG_WEIGHT_REGULARIZATION);
  const maxDifficultyWeight = Math.min(rawMaxDifficultyWeight, MAX_DIFFICULTY_WEIGHT_REGULARIZATION);

  const personalized = candidates
    .filter((candidate) => !seenRecipeIds.has(candidate.recipeid))
    .map((candidate) => {
      const tags = recipeTags.get(candidate.recipeid) || [];
      const tagScore = computeTagScore(tags, tagPrefs, maxTagWeight);
      const difficultyScore = computeDifficultyScore(candidate.difficulty, difficultyPrefs, maxDifficultyWeight);
      const popularityScore = normalizedPopularity(candidate.popularity_score, maxPopularity);
      const ratingScore = clamp01(Number(candidate.rating_score) || 0);
      const freshnessScore = calculateFreshnessScore(candidate.created_at);

      const hasPersonalSignals = maxTagWeight > 0 || maxDifficultyWeight > 0;
      const popularityFirstScore = 0.58 * popularityScore + 0.22 * freshnessScore + 0.2 * ratingScore;
      const personalScore = 0.68 * tagScore + 0.07 * difficultyScore + 0.1 * popularityScore + 0.05 * freshnessScore + 0.1 * ratingScore;

      let score: number;
      if (!hasPersonalSignals) {
        score = popularityFirstScore;
      } else if (!isAnonymous) {
        // Ratings are intentionally strong for logged-in users.
        score = 0.42 * tagScore + 0.08 * difficultyScore + 0.15 * popularityScore + 0.1 * freshnessScore + 0.25 * ratingScore;
      } else {
        // Anonymous users start popularity-first, then quickly adapt after a few clicks.
        const adaptFactor = clamp01(Math.log1p(anonymousRecentClickCount) / Math.log(9));
        score = (1 - adaptFactor) * popularityFirstScore + adaptFactor * personalScore;
      }

      return {
        ...toRecipeRow(candidate),
        score,
        reason: chooseReason(tagScore, difficultyScore, popularityScore, freshnessScore, ratingScore),
        tags: recipeTags.get(candidate.recipeid) || [],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit);

  if (personalized.length >= safeLimit) {
    return personalized;
  }

  const usedRecipeIds = new Set(personalized.map((item) => item.recipeid));
  const fallback = rankForAnonymous(candidates, safeLimit * 2, recipeTags)
    .filter((item) => !usedRecipeIds.has(item.recipeid))
    .slice(0, safeLimit - personalized.length);

  return [...personalized, ...fallback];
}

function chooseReason(tagScore: number, difficultyScore: number, popularityScore: number, freshnessScore: number, ratingScore: number): string {
  const components = [
    { key: "tag", value: tagScore, reason: "Matches your recent interests" },
    { key: "difficulty", value: difficultyScore, reason: "Matches your preferred difficulty" },
    { key: "popularity", value: popularityScore, reason: "Trending with users" },
    { key: "freshness", value: freshnessScore, reason: "Recently published" },
    { key: "rating", value: ratingScore, reason: "Highly rated by users" },
  ];

  components.sort((a, b) => b.value - a.value);
  return components[0].reason;
}

function computeTagScore(tags: string[], tagPrefs: Map<string, number>, maxTagWeight: number): number {
  if (tags.length === 0 || maxTagWeight === 0) {
    return 0;
  }

  let score = 0;
  for (const tag of tags) {
    score += tagPrefs.get(tag) || 0;
  }
  return clamp01(score / maxTagWeight);
}

function computeDifficultyScore(
  difficulty: string | null,
  difficultyPrefs: Map<string, number>,
  maxDifficultyWeight: number
): number {
  if (!difficulty || maxDifficultyWeight === 0) {
    return 0;
  }

  const weight = difficultyPrefs.get(difficulty) || 0;
  return clamp01(weight / maxDifficultyWeight);
}

function getMaxPopularity(candidates: CandidateRow[]): number {
  return candidates.reduce((max, candidate) => Math.max(max, Number(candidate.popularity_score) || 0), 0);
}

function normalizedPopularity(score: number, maxPopularity: number): number {
  if (maxPopularity <= 0) {
    return 0;
  }
  return clamp01(Number(score) / maxPopularity);
}

function calculateFreshnessScore(createdAt: Date): number {
  const createdTime = new Date(createdAt).getTime();
  const ageInDays = Math.max(0, (Date.now() - createdTime) / (1000 * 60 * 60 * 24));
  return Math.exp(-ageInDays / 45);
}

function sumMapValues(map: Map<string, number>): number {
  let sum = 0;
  for (const value of map.values()) {
    sum += value;
  }
  return sum;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function normalizeCountryCode(countryCode?: string): string | null {
  if (!countryCode) {
    return null;
  }

  const value = countryCode.trim().toUpperCase();
  if (value.length !== 2) {
    return null;
  }

  return value;
}

function toRecipeRow(candidate: CandidateRow): RecipeRow {
  return {
    recipeid: candidate.recipeid,
    userid: candidate.userid,
    title: candidate.title,
    description: candidate.description,
    image_url: candidate.image_url,
    youtube_url: candidate.youtube_url,
    proptimemin: candidate.proptimemin,
    cooktimemin: candidate.cooktimemin,
    diet_type: candidate.diet_type,
    servings: candidate.servings,
    difficulty: candidate.difficulty,
    visibility: candidate.visibility,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
}
