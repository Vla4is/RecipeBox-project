import pool from "../database";
import { RecipeRow } from "./recipeService";

export type RecipeEventType = "VIEW" | "CLICK" | "SAVE";

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
}

interface CandidateRow extends RecipeRow {
  popularity_score: number;
}

interface TagPreferenceRow {
  name: string;
  weight: number;
}

interface DifficultyPreferenceRow {
  difficulty: string;
  weight: number;
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

  if (!userid && !sessionId) {
    return rankForAnonymous(candidates, safeLimit);
  }

  if (sessionId && !userid) {
    // Anonymous user with session history
    const [seenRecipeIds, tagPrefs, difficultyPrefs, recipeTags] = await Promise.all([
      fetchAnonymousSeenRecipes(sessionId),
      fetchAnonymousTagPreferences(sessionId),
      fetchAnonymousDifficultyPreferences(sessionId),
      fetchCandidateTags(candidates.map((candidate) => candidate.recipeid)),
    ]);

    return rankForUser({
      candidates,
      safeLimit,
      seenRecipeIds,
      tagPrefs,
      difficultyPrefs,
      recipeTags,
    });
  }

  if (!userid) {
    return rankForAnonymous(candidates, safeLimit);
  }

  const [seenRecipeIds, tagPrefs, difficultyPrefs, recipeTags] = await Promise.all([
    fetchUserSeenRecipes(userid),
    fetchUserTagPreferences(userid),
    fetchUserDifficultyPreferences(userid),
    fetchCandidateTags(candidates.map((candidate) => candidate.recipeid)),
  ]);

  return rankForUser({
    candidates,
    safeLimit,
    seenRecipeIds,
    tagPrefs,
    difficultyPrefs,
    recipeTags,
  });
}

async function fetchCandidates(): Promise<CandidateRow[]> {
  const res = await pool.query(
    `SELECT r.recipeid, r.userid, r.title, r.description, r.image_url, r.proptimemin, r.cooktimemin, r.servings, r.difficulty, r.visibility, r.created_at, r.updated_at,
            COALESCE(popularity.popularity_score, 0) AS popularity_score
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
              CASE e.event_type
                WHEN 'VIEW' THEN 1
                WHEN 'CLICK' THEN 2
                WHEN 'SAVE' THEN 4
                ELSE 0
              END
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
              CASE e.event_type
                WHEN 'VIEW' THEN 1
                WHEN 'CLICK' THEN 2
                WHEN 'SAVE' THEN 4
                ELSE 0
              END
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
              CASE e.event_type
                WHEN 'VIEW' THEN 1
                WHEN 'CLICK' THEN 2
                WHEN 'SAVE' THEN 4
                ELSE 0
              END
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
              CASE e.event_type
                WHEN 'VIEW' THEN 1
                WHEN 'CLICK' THEN 2
                WHEN 'SAVE' THEN 4
                ELSE 0
              END
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

function rankForAnonymous(candidates: CandidateRow[], limit: number): RecommendationRow[] {
  const maxPopularity = getMaxPopularity(candidates);
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);

  return shuffled
    .map((candidate) => {
      const popularityScore = normalizedPopularity(candidate.popularity_score, maxPopularity);
      const freshnessScore = calculateFreshnessScore(candidate.created_at);
      const score = 0.6 * popularityScore + 0.4 * freshnessScore;

      return {
        ...toRecipeRow(candidate),
        score,
        reason: popularityScore > 0.1 ? "Trending recipe" : "Popular pick",
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
}): RecommendationRow[] {
  const { candidates, safeLimit, seenRecipeIds, tagPrefs, difficultyPrefs, recipeTags } = params;

  const maxPopularity = getMaxPopularity(candidates);
  const maxTagWeight = sumMapValues(tagPrefs);
  const maxDifficultyWeight = sumMapValues(difficultyPrefs);

  const personalized = candidates
    .filter((candidate) => !seenRecipeIds.has(candidate.recipeid))
    .map((candidate) => {
      const tags = recipeTags.get(candidate.recipeid) || [];
      const tagScore = computeTagScore(tags, tagPrefs, maxTagWeight);
      const difficultyScore = computeDifficultyScore(candidate.difficulty, difficultyPrefs, maxDifficultyWeight);
      const popularityScore = normalizedPopularity(candidate.popularity_score, maxPopularity);
      const freshnessScore = calculateFreshnessScore(candidate.created_at);

      const hasPersonalSignals = maxTagWeight > 0 || maxDifficultyWeight > 0;
      const score = hasPersonalSignals
        ? 0.5 * tagScore + 0.2 * difficultyScore + 0.2 * popularityScore + 0.1 * freshnessScore
        : 0.6 * popularityScore + 0.4 * freshnessScore;

      return {
        ...toRecipeRow(candidate),
        score,
        reason: chooseReason(tagScore, difficultyScore, popularityScore, freshnessScore),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit);

  if (personalized.length >= safeLimit) {
    return personalized;
  }

  const usedRecipeIds = new Set(personalized.map((item) => item.recipeid));
  const fallback = rankForAnonymous(candidates, safeLimit * 2)
    .filter((item) => !usedRecipeIds.has(item.recipeid))
    .slice(0, safeLimit - personalized.length);

  return [...personalized, ...fallback];
}

function chooseReason(tagScore: number, difficultyScore: number, popularityScore: number, freshnessScore: number): string {
  const components = [
    { key: "tag", value: tagScore, reason: "Matches your recent interests" },
    { key: "difficulty", value: difficultyScore, reason: "Matches your preferred difficulty" },
    { key: "popularity", value: popularityScore, reason: "Trending with users" },
    { key: "freshness", value: freshnessScore, reason: "Recently published" },
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
    proptimemin: candidate.proptimemin,
    cooktimemin: candidate.cooktimemin,
    servings: candidate.servings,
    difficulty: candidate.difficulty,
    visibility: candidate.visibility,
    created_at: candidate.created_at,
    updated_at: candidate.updated_at,
  };
}
