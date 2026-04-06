import pool from "../database";
import { normalizeRecipeDietType, type RecipeDietType, type RecipeRow } from "./recipeService";

export interface SearchRecipesInput {
  searchTerm?: string;
  userid?: string;
  maxTotalTime?: number;
  dietType?: Exclude<RecipeDietType, "NONE">;
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
  const maxTotal = Number.isFinite(input.maxTotalTime) ? input.maxTotalTime : null;
  const dietType = normalizeRecipeDietType(input.dietType);
  const activeDietType = dietType === "NONE" ? null : dietType;
  const difficulties = (input.difficulties || []).filter((d) => ["EASY", "MEDIUM", "HARD"].includes(d));
  const safeLimit = Math.min(Math.max(input.limit ?? 120, 1), 300);

  // If the user only typed filler words, avoid returning noisy "matches".
  if (normalizedTerm !== "" && tokenizedQuery === "") {
    return [];
  }

  const dietSearchTextSql = `CASE
    WHEN r.diet_type = 'VEGAN' THEN 'vegan vegetarian plant-based'
    WHEN r.diet_type = 'VEGETARIAN' THEN 'vegetarian meatless'
    ELSE ''
  END`;

  const res = await pool.query(
    `WITH search_params AS (
       SELECT
         $1::uuid AS userid,
         $2::text AS raw_term,
         $3::text AS normalized_query,
         $4::text[] AS query_tokens,
         LENGTH($3::text) AS normalized_query_length,
         COALESCE(array_length($4::text[], 1), 0) AS token_count,
         CASE
           WHEN COALESCE(array_length($4::text[], 1), 0) = 0 THEN NULL
           ELSE (
             SELECT string_agg(token || ':*', ' & ')
             FROM unnest($4::text[]) AS token
           )
         END AS prefix_query_text
     ),
     tag_rollup AS (
       SELECT t.recipeid,
              LOWER(string_agg(t.name, ' ' ORDER BY t.name)) AS tags_text,
              array_agg(LOWER(t.name) ORDER BY t.name) AS tag_names
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
         r.thumbnail_url,
         r.youtube_url,
         r.proptimemin,
         r.cooktimemin,
         r.diet_type,
         r.servings,
         r.difficulty,
         r.visibility,
         ${dietSearchTextSql} AS diet_search_text,
         r.created_at,
         r.updated_at,
         COALESCE(tr.tags_text, '') AS tags_text,
         COALESCE(tr.tag_names, ARRAY[]::text[]) AS tag_names,
         COALESCE(rt.rating_score, 0) AS rating_score,
         CASE
           WHEN sp.normalized_query = '' OR sp.normalized_query_length < 3 THEN 0
           ELSE ts_rank_cd(
              setweight(to_tsvector('english', COALESCE(r.title, '')), 'A') ||
              setweight(to_tsvector('simple', COALESCE(tr.tags_text, '')), 'A') ||
              setweight(to_tsvector('english', COALESCE(r.description, '')), 'B') ||
              setweight(to_tsvector('simple', ${dietSearchTextSql}), 'B'),
             websearch_to_tsquery('english', sp.normalized_query)
           )
         END AS fulltext_rank,
         CASE
           WHEN sp.prefix_query_text IS NULL OR sp.normalized_query_length < 2 THEN 0
           ELSE ts_rank_cd(
             setweight(to_tsvector('simple', COALESCE(r.title, '')), 'A') ||
             setweight(to_tsvector('simple', COALESCE(tr.tags_text, '')), 'A') ||
             setweight(to_tsvector('simple', COALESCE(r.description, '')), 'B') ||
             setweight(to_tsvector('simple', ${dietSearchTextSql}), 'B'),
             to_tsquery('simple', sp.prefix_query_text)
           )
         END AS prefix_rank,
         CASE WHEN sp.normalized_query <> '' AND LOWER(r.title) = sp.normalized_query THEN 1 ELSE 0 END AS exact_title_match,
         CASE WHEN sp.normalized_query <> '' AND sp.normalized_query = ANY(COALESCE(tr.tag_names, ARRAY[]::text[])) THEN 1 ELSE 0 END AS exact_tag_match,
         CASE
           WHEN sp.normalized_query_length < 2 THEN 0
           WHEN LOWER(r.title) LIKE sp.normalized_query || '%' THEN 1
           ELSE 0
         END AS title_prefix_match,
         CASE
           WHEN sp.normalized_query_length < 2 THEN 0
           WHEN EXISTS (
             SELECT 1
             FROM unnest(COALESCE(tr.tag_names, ARRAY[]::text[])) AS tag_name
             WHERE tag_name LIKE sp.normalized_query || '%'
           ) THEN 1
           ELSE 0
         END AS tag_prefix_match,
         CASE
           WHEN sp.normalized_query_length < 3 THEN 0
           WHEN LOWER(r.title) LIKE '%' || sp.normalized_query || '%' THEN 1
           ELSE 0
         END AS title_phrase_match,
         CASE
           WHEN sp.normalized_query_length < 3 THEN 0
           WHEN COALESCE(tr.tags_text, '') LIKE '%' || sp.normalized_query || '%' THEN 1
           ELSE 0
         END AS tag_phrase_match,
         CASE
           WHEN sp.normalized_query_length < 4 THEN 0
           ELSE GREATEST(
             word_similarity(sp.normalized_query, LOWER(r.title)),
             word_similarity(sp.normalized_query, COALESCE(tr.tags_text, '')),
             similarity(LOWER(r.title), sp.normalized_query),
             similarity(COALESCE(tr.tags_text, ''), sp.normalized_query),
             CASE
               WHEN sp.normalized_query_length >= 6 THEN similarity(LOWER(COALESCE(r.description, '')), sp.normalized_query)
               ELSE 0
             END,
             CASE
               WHEN sp.normalized_query_length >= 6 THEN similarity(${dietSearchTextSql}, sp.normalized_query)
               ELSE 0
             END
           )
         END AS fuzzy_score
       FROM recipes r
       CROSS JOIN search_params sp
       LEFT JOIN tag_rollup tr ON tr.recipeid = r.recipeid
       LEFT JOIN rating rt ON rt.recipeid = r.recipeid
       WHERE (r.visibility = 'PUBLIC' OR (sp.userid IS NOT NULL AND r.userid = sp.userid))
         AND ($5::int IS NULL OR r.totaltimemin <= $5)
         AND (
           $6::recipe_diet_enum IS NULL
           OR ($6::recipe_diet_enum = 'VEGETARIAN' AND r.diet_type IN ('VEGETARIAN', 'VEGAN'))
           OR ($6::recipe_diet_enum = 'VEGAN' AND r.diet_type = 'VEGAN')
         )
         AND (COALESCE(array_length($7::difficulty_enum[], 1), 0) = 0 OR r.difficulty = ANY($7::difficulty_enum[]))
     )
     SELECT
       ranked.recipeid,
       ranked.userid,
       ranked.title,
       ranked.description,
       ranked.image_url,
       ranked.thumbnail_url,
       ranked.youtube_url,
       ranked.proptimemin,
       ranked.cooktimemin,
       ranked.diet_type,
       ranked.servings,
       ranked.difficulty,
       ranked.visibility,
       ranked.created_at,
       ranked.updated_at
     FROM ranked
     CROSS JOIN search_params sp
     WHERE sp.raw_term = ''
       OR (
         exact_title_match = 1
         OR exact_tag_match = 1
         OR title_prefix_match = 1
         OR tag_prefix_match = 1
         OR title_phrase_match = 1
         OR tag_phrase_match = 1
         OR fulltext_rank > 0
         OR prefix_rank > 0
         OR (
           sp.normalized_query_length >= 4
           AND fuzzy_score >= CASE
             WHEN sp.normalized_query_length >= 10 THEN 0.24
             WHEN sp.normalized_query_length >= 7 THEN 0.3
             WHEN sp.normalized_query_length >= 5 THEN 0.38
             ELSE 0.5
           END
         )
       )
     ORDER BY
       (
         (exact_title_match * 140)
         + (exact_tag_match * 120)
         + (title_prefix_match * 60)
         + (tag_prefix_match * 52)
         + (title_phrase_match * 24)
         + (tag_phrase_match * 20)
         + (fulltext_rank * 18)
         + (prefix_rank * 14)
         + (fuzzy_score * 10)
       ) DESC,
       CASE
         WHEN sp.userid IS NOT NULL THEN rating_score
         ELSE 0
       END DESC,
       created_at DESC
     LIMIT $8`,
    [input.userid ?? null, normalizedTerm, tokenizedQuery, searchTokens, maxTotal, activeDietType, difficulties, safeLimit]
  );

  return res.rows;
}
