import pool from "../database";
import type { RecipeRow } from "./recipeService";

export interface SearchRecipesInput {
  searchTerm?: string;
  userid?: string;
  maxPrepTime?: number;
  maxCookTime?: number;
  difficulties?: Array<"EASY" | "MEDIUM" | "HARD">;
  limit?: number;
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "to",
  "up",
  "was",
  "we",
  "with",
  "your",
]);

function extractSearchTokens(term: string): string[] {
  return term
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
}

export async function searchRecipes(input: SearchRecipesInput): Promise<RecipeRow[]> {
  const normalizedTerm = (input.searchTerm || "").trim();
  const searchTokens = extractSearchTokens(normalizedTerm);
  const tokenizedQuery = searchTokens.join(" ");
  const maxPrep = Number.isFinite(input.maxPrepTime) ? input.maxPrepTime : null;
  const maxCook = Number.isFinite(input.maxCookTime) ? input.maxCookTime : null;
  const difficulties = (input.difficulties || []).filter((d) => ["EASY", "MEDIUM", "HARD"].includes(d));
  const safeLimit = Math.min(Math.max(input.limit ?? 120, 1), 300);

  // If the user only typed filler words, avoid returning noisy "matches".
  if (normalizedTerm !== "" && tokenizedQuery === "") {
    return [];
  }

  const res = await pool.query(
    `WITH search_params AS (
       SELECT
         $1::uuid AS userid,
         $2::text AS raw_term,
         $3::text AS normalized_query,
         $4::text[] AS query_tokens,
         COALESCE(array_length($4::text[], 1), 0) AS token_count
     ),
     tag_rollup AS (
       SELECT t.recipeid,
              LOWER(string_agg(t.name, ' ' ORDER BY t.name)) AS tags_text
       FROM tags t
       GROUP BY t.recipeid
     ),
     rating AS (
       SELECT recipeid,
              ((AVG(stars)::float - 1) / 4) * (COUNT(*)::float / (COUNT(*)::float + 4)) AS rating_score
       FROM reviews
       GROUP BY recipeid
     ),
     ranked AS (
       SELECT
         r.recipeid,
         r.userid,
         r.title,
         r.description,
         r.image_url,
         r.proptimemin,
         r.cooktimemin,
         r.servings,
         r.difficulty,
         r.visibility,
         r.created_at,
         r.updated_at,
         COALESCE(tr.tags_text, '') AS tags_text,
         COALESCE(rt.rating_score, 0) AS rating_score,
         setweight(to_tsvector('english', COALESCE(r.title, '')), 'A') ||
         setweight(to_tsvector('simple', COALESCE(tr.tags_text, '')), 'A') ||
         setweight(to_tsvector('english', COALESCE(r.description, '')), 'B') AS search_document,
         (
           SELECT COUNT(*)
           FROM unnest(sp.query_tokens) AS token
           WHERE LOWER(r.title) LIKE '%' || token || '%'
              OR COALESCE(tr.tags_text, '') LIKE '%' || token || '%'
              OR LOWER(COALESCE(r.description, '')) LIKE '%' || token || '%'
         )::int AS token_hit_count,
         GREATEST(
           similarity(LOWER(r.title), sp.normalized_query),
           similarity(COALESCE(tr.tags_text, ''), sp.normalized_query),
           similarity(LOWER(COALESCE(r.description, '')), sp.normalized_query),
           word_similarity(sp.normalized_query, LOWER(r.title)),
           word_similarity(sp.normalized_query, COALESCE(tr.tags_text, '')),
           word_similarity(sp.normalized_query, LOWER(COALESCE(r.description, '')))
         ) AS best_similarity,
         CASE
           WHEN sp.normalized_query = '' THEN 0
           ELSE ts_rank_cd(
             setweight(to_tsvector('english', COALESCE(r.title, '')), 'A') ||
             setweight(to_tsvector('simple', COALESCE(tr.tags_text, '')), 'A') ||
             setweight(to_tsvector('english', COALESCE(r.description, '')), 'B'),
             plainto_tsquery('english', sp.normalized_query)
           )
         END AS text_rank,
         CASE
           WHEN LOWER(r.title) = sp.normalized_query THEN 1.6
           WHEN COALESCE(tr.tags_text, '') = sp.normalized_query THEN 1.45
           WHEN LOWER(r.title) LIKE '%' || sp.normalized_query || '%' THEN 0.95
           WHEN COALESCE(tr.tags_text, '') LIKE '%' || sp.normalized_query || '%' THEN 0.85
           WHEN LOWER(COALESCE(r.description, '')) LIKE '%' || sp.normalized_query || '%' THEN 0.35
           ELSE 0
         END AS phrase_bonus
       FROM recipes r
       CROSS JOIN search_params sp
       LEFT JOIN tag_rollup tr ON tr.recipeid = r.recipeid
       LEFT JOIN rating rt ON rt.recipeid = r.recipeid
       WHERE (r.visibility = 'PUBLIC' OR (sp.userid IS NOT NULL AND r.userid = sp.userid))
         AND ($5::int IS NULL OR COALESCE(r.proptimemin, 0) <= $5)
         AND ($6::int IS NULL OR COALESCE(r.cooktimemin, 0) <= $6)
         AND (COALESCE(array_length($7::difficulty_enum[], 1), 0) = 0 OR r.difficulty = ANY($7::difficulty_enum[]))
     )
     SELECT
       ranked.recipeid,
       ranked.userid,
       ranked.title,
       ranked.description,
       ranked.image_url,
       ranked.proptimemin,
       ranked.cooktimemin,
       ranked.servings,
       ranked.difficulty,
       ranked.visibility,
       ranked.created_at,
       ranked.updated_at
     FROM ranked
     CROSS JOIN search_params sp
     WHERE sp.raw_term = ''
       OR (
         phrase_bonus > 0
         OR token_hit_count > 0
         OR text_rank > 0
         OR best_similarity >= CASE
           WHEN LENGTH(sp.normalized_query) >= 10 THEN 0.2
           WHEN LENGTH(sp.normalized_query) >= 6 THEN 0.24
           ELSE 0.3
         END
       )
     ORDER BY
       (
         phrase_bonus
         + (text_rank * 4.4)
         + (
           CASE
             WHEN sp.token_count = 0 THEN 0
             ELSE (token_hit_count::float / sp.token_count) * 2.6
           END
         )
         + (best_similarity * 2.8)
       ) DESC,
       CASE
         WHEN sp.userid IS NOT NULL THEN rating_score
         ELSE 0
       END DESC,
       created_at DESC
     LIMIT $8`,
    [input.userid ?? null, normalizedTerm, tokenizedQuery, searchTokens, maxPrep, maxCook, difficulties, safeLimit]
  );

  return res.rows;
}
