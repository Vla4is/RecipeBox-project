import { Response } from "express";
import path from "path";
import dotenv from "dotenv";
import pool from "../database";
import { RecipeDetail } from "./recipeService";
import { searchRecipes } from "./recipeSearchService";

export type ChatbotRole = "user" | "assistant";

export interface ChatbotMessage {
  role: ChatbotRole;
  content: string;
  createdAt: string;
  recommendations?: ChatbotRecommendation[];
}

export interface ChatbotSession {
  sessionId: string;
  recipeId: string;
  title: string;
  updatedAt: string;
  messages: ChatbotMessage[];
}

export interface ChatbotHistorySession {
  sessionId: string;
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
  title: string;
  updatedAt: string;
  messageCount: number;
  latestPreview: string | null;
}

export interface ChatbotRecommendation {
  recipeId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  totalTime: number | null;
  dietType: string | null;
  difficulty: string | null;
  href: string;
}

type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatbotSearchDecision = {
  shouldSearch: boolean;
  query: string;
  maxTotalTime?: number;
  dietType?: "VEGAN" | "VEGETARIAN";
  difficulties?: Array<"EASY" | "MEDIUM" | "HARD">;
};

type ChatbotProviderName = "DeepSeek" | "OpenAI" | "Unknown" | "Not configured";

export interface ChatbotProviderSummary {
  provider: ChatbotProviderName;
  apiUrl: string | null;
  model: string | null;
  enabled: boolean;
  hasApiKey: boolean;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are RecipeBox's premium cooking assistant. Give concise, practical cooking advice based only on the recipe context and the user's question. If something is uncertain, say so clearly. You may use light Markdown such as bold text, short lists, and internal recipe links when helpful.";

const NO_CODE_SYSTEM_PROMPT = [
  "Hard boundary: never output programming code, code blocks, SQL, API examples, React/backend snippets, or technical implementation instructions.",
  "Do not use fenced code blocks or backtick code formatting.",
  "If the user asks for code or implementation details, politely refuse in one short sentence and redirect to cooking, recipe, substitution, timing, or RecipeBox recipe help.",
  "Stay in the domain of food and cooking. Warm emoji or smilies are okay sparingly.",
].join("\n");

function reloadChatbotEnv(): void {
  dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
    override: true,
  });
}

function normalizeEnvText(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\\n/g, "\n").trim();
}

function getEnvFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function getPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function isChatbotEnabled(): boolean {
  reloadChatbotEnv();
  return getEnvFlag("CHATBOT_ENABLED", false);
}

export function chatbotRequiresPremium(): boolean {
  reloadChatbotEnv();
  return getEnvFlag("CHATBOT_REQUIRE_PREMIUM", true);
}

export function getChatbotProviderSummary(): ChatbotProviderSummary {
  reloadChatbotEnv();
  const apiUrl = process.env.CHATBOT_API_URL?.trim() || null;
  const apiKey = process.env.CHATBOT_API_KEY?.trim() || "";
  const model = process.env.CHATBOT_MODEL?.trim() || null;
  const enabled = isChatbotEnabled();
  const hasApiKey = apiKey.length > 0;

  if (!apiUrl || !hasApiKey || !model) {
    return {
      provider: "Not configured",
      apiUrl,
      model,
      enabled,
      hasApiKey,
    };
  }

  const normalizedUrl = apiUrl.toLowerCase();
  const provider = normalizedUrl.includes("api.deepseek.com")
    ? "DeepSeek"
    : normalizedUrl.includes("api.openai.com")
      ? "OpenAI"
      : "Unknown";

  return {
    provider,
    apiUrl,
    model,
    enabled,
    hasApiKey,
  };
}

export function getChatbotHistoryDays(): number {
  reloadChatbotEnv();
  return getPositiveIntEnv("CHATBOT_HISTORY_DAYS", 30);
}

export function getChatbotMaxUserMessageChars(): number {
  reloadChatbotEnv();
  return getPositiveIntEnv("CHATBOT_MAX_USER_MESSAGE_CHARS", 1000);
}

function getChatbotMaxHistoryMessages(): number {
  reloadChatbotEnv();
  return getPositiveIntEnv("CHATBOT_MAX_HISTORY_MESSAGES", 12);
}

function getChatbotSearchLimit(): number {
  reloadChatbotEnv();
  return Math.min(getPositiveIntEnv("CHATBOT_SEARCH_LIMIT", 5), 8);
}

export function normalizeChatbotMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, getChatbotMaxUserMessageChars());
}

function makeSessionTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "Recipe chat";
  return normalized.length > 54 ? `${normalized.slice(0, 51)}...` : normalized;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeStoredRecommendations(value: unknown): ChatbotRecommendation[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const recommendations = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.recipeId !== "string" ||
        typeof candidate.title !== "string" ||
        typeof candidate.href !== "string"
      ) {
        return null;
      }

      return {
        recipeId: candidate.recipeId,
        title: candidate.title,
        description: typeof candidate.description === "string" ? candidate.description : null,
        imageUrl: typeof candidate.imageUrl === "string" ? candidate.imageUrl : null,
        totalTime: typeof candidate.totalTime === "number" ? candidate.totalTime : null,
        dietType: typeof candidate.dietType === "string" ? candidate.dietType : null,
        difficulty: typeof candidate.difficulty === "string" ? candidate.difficulty : null,
        href: candidate.href,
      };
    })
    .filter((item): item is ChatbotRecommendation => item !== null);

  return recommendations.length > 0 ? recommendations : undefined;
}

export async function cleanupExpiredChatbotSessions(): Promise<void> {
  await pool.query(
    `DELETE FROM chatbot_sessions
     WHERE expires_at <= NOW()`
  );
}

export async function getChatbotSessions(userId: string, recipeId: string): Promise<ChatbotSession[]> {
  await cleanupExpiredChatbotSessions();

  const sessionsRes = await pool.query(
    `SELECT sessionid, recipeid, title, updated_at
     FROM chatbot_sessions
     WHERE userid = $1::uuid AND recipeid = $2::uuid AND expires_at > NOW()
     ORDER BY updated_at DESC
     LIMIT 10`,
    [userId, recipeId]
  );

  if (sessionsRes.rows.length === 0) return [];

  const sessionIds = sessionsRes.rows.map((row) => row.sessionid);
  const messagesRes = await pool.query(
    `SELECT sessionid, role, content, recommendations, created_at
     FROM chatbot_messages
     WHERE sessionid = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [sessionIds]
  );

  const messagesBySession = new Map<string, ChatbotMessage[]>();
  for (const row of messagesRes.rows as Array<{
    sessionid: string;
    role: ChatbotRole;
    content: string;
    recommendations: unknown;
    created_at: Date;
  }>) {
    const messages = messagesBySession.get(row.sessionid) || [];
    const recommendations = row.role === "assistant"
      ? normalizeStoredRecommendations(row.recommendations)
      : undefined;
    messages.push({
      role: row.role,
      content: row.content,
      createdAt: toIso(row.created_at),
      ...(recommendations ? { recommendations } : {}),
    });
    messagesBySession.set(row.sessionid, messages);
  }

  return sessionsRes.rows.map((row) => ({
    sessionId: row.sessionid,
    recipeId: row.recipeid,
    title: row.title,
    updatedAt: toIso(row.updated_at),
    messages: messagesBySession.get(row.sessionid) || [],
  }));
}

export async function getAllChatbotSessions(userId: string): Promise<ChatbotHistorySession[]> {
  await cleanupExpiredChatbotSessions();

  const res = await pool.query(
    `SELECT
       s.sessionid,
       s.recipeid,
       s.title,
       s.updated_at,
       r.title AS recipe_title,
       COALESCE(r.thumbnail_url, r.image_url) AS recipe_image_url,
       COUNT(m.messageid)::int AS message_count,
       LEFT(REGEXP_REPLACE(
         COALESCE((ARRAY_AGG(m.content ORDER BY m.created_at DESC))[1], ''),
         '\\s+',
         ' ',
         'g'
       ), 180) AS latest_preview
     FROM chatbot_sessions s
     JOIN recipes r ON r.recipeid = s.recipeid
     LEFT JOIN chatbot_messages m ON m.sessionid = s.sessionid
     WHERE s.userid = $1::uuid
       AND s.expires_at > NOW()
     GROUP BY s.sessionid, s.recipeid, s.title, s.updated_at, r.title, r.thumbnail_url, r.image_url
     ORDER BY s.updated_at DESC
     LIMIT 50`,
    [userId]
  );

  return res.rows.map((row: {
    sessionid: string;
    recipeid: string;
    recipe_title: string;
    recipe_image_url: string | null;
    title: string;
    updated_at: Date;
    message_count: number;
    latest_preview: string | null;
  }) => ({
    sessionId: row.sessionid,
    recipeId: row.recipeid,
    recipeTitle: row.recipe_title,
    recipeImageUrl: row.recipe_image_url,
    title: row.title,
    updatedAt: toIso(row.updated_at),
    messageCount: row.message_count,
    latestPreview: row.latest_preview && row.latest_preview.trim() ? row.latest_preview.trim() : null,
  }));
}

export async function getOrCreateChatbotSession(input: {
  userId: string;
  recipeId: string;
  sessionId?: string;
  firstMessage: string;
}): Promise<string> {
  await cleanupExpiredChatbotSessions();
  const historyDays = getChatbotHistoryDays();

  if (input.sessionId) {
    const existing = await pool.query(
      `UPDATE chatbot_sessions
       SET updated_at = CURRENT_TIMESTAMP,
           expires_at = NOW() + ($4::int * INTERVAL '1 day')
       WHERE sessionid = $1::uuid
         AND userid = $2::uuid
         AND recipeid = $3::uuid
         AND expires_at > NOW()
       RETURNING sessionid`,
      [input.sessionId, input.userId, input.recipeId, historyDays]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].sessionid;
    }
  }

  const created = await pool.query(
    `INSERT INTO chatbot_sessions (userid, recipeid, title, expires_at)
     VALUES ($1::uuid, $2::uuid, $3, NOW() + ($4::int * INTERVAL '1 day'))
     RETURNING sessionid`,
    [input.userId, input.recipeId, makeSessionTitle(input.firstMessage), historyDays]
  );

  return created.rows[0].sessionid;
}

export async function saveChatbotMessage(input: {
  sessionId: string;
  role: ChatbotRole;
  content: string;
  recommendations?: ChatbotRecommendation[];
}): Promise<void> {
  const recommendations = input.role === "assistant" && input.recommendations?.length
    ? JSON.stringify(input.recommendations)
    : null;

  await pool.query(
    `INSERT INTO chatbot_messages (sessionid, role, content, recommendations)
     VALUES ($1::uuid, $2, $3, $4::jsonb)`,
    [input.sessionId, input.role, input.content, recommendations]
  );

  await pool.query(
    `UPDATE chatbot_sessions
     SET updated_at = CURRENT_TIMESTAMP
     WHERE sessionid = $1::uuid`,
    [input.sessionId]
  );
}

export async function getRecentChatbotMessages(sessionId: string): Promise<ProviderMessage[]> {
  const res = await pool.query(
    `SELECT role, content
     FROM chatbot_messages
     WHERE sessionid = $1::uuid
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, getChatbotMaxHistoryMessages()]
  );

  return res.rows
    .reverse()
    .map((row: { role: ChatbotRole; content: string }) => ({
      role: row.role,
      content: row.content,
    }));
}

function formatRecipeContext(details: RecipeDetail): string {
  const recipe = details.recipe;
  const totalTime = (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0);
  const ingredients = details.ingredients
    .map((ingredient) => {
      const quantity = [
        ingredient.amount == null ? "" : String(ingredient.amount),
        ingredient.unit || "",
      ].filter(Boolean).join(" ");
      const note = ingredient.notes ? ` (${ingredient.notes})` : "";
      return `- ${ingredient.name}${quantity ? `: ${quantity}` : ""}${note}`;
    })
    .join("\n");
  const steps = details.steps
    .map((step) => `Step ${step.stepno}: ${step.instruction}${step.timersec ? ` (${step.timersec}s timer)` : ""}`)
    .join("\n");

  return [
    `Recipe title: ${recipe.title}`,
    `Description: ${recipe.description || "Not provided"}`,
    `Prep time: ${recipe.proptimemin ?? "unknown"} minutes`,
    `Cook time: ${recipe.cooktimemin ?? "unknown"} minutes`,
    `Total time: ${totalTime || "unknown"} minutes`,
    `Diet: ${recipe.diet_type || "NONE"}`,
    `Servings: ${recipe.servings ?? "unknown"}`,
    `Difficulty: ${recipe.difficulty || "unknown"}`,
    `Tags: ${details.tags.length > 0 ? details.tags.join(", ") : "none"}`,
    `Ingredients:\n${ingredients || "No ingredients listed"}`,
    `Steps:\n${steps || "No steps listed"}`,
  ].join("\n");
}

function shouldSearchRecipes(message: string): boolean {
  const text = message.toLowerCase();
  return /\b(similar|alternative|alternatives|recommend|recommendation|suggest|suggestion|find|search|look|show|browse|other|another|instead|else|options|ideas|dish|dishes|cook next|what can i cook|recipe like|recipes like|quick|easy|simpler|simple|vegan|vegetarian|turkish|turkiye|turkey|italian|mexican|indian|thai|chinese|japanese|french|greek|spanish|american|british|canadian|vietnamese|moroccan|egyptian|croatian|dutch|filipino|irish|jamaican|kenyan|malaysian|polish|portuguese|russian|tunisian)\b/.test(text);
}

function extractMaxTotalTime(message: string): number | undefined {
  const text = message.toLowerCase();
  const match = text.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (match) {
    const minutes = Number(match[1]);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined;
  }

  if (/\b(quick|fast|speedy|rapid)\b/.test(text)) return 30;
  return undefined;
}

function extractDietType(message: string): "VEGAN" | "VEGETARIAN" | undefined {
  const text = message.toLowerCase();
  if (/\bvegan\b/.test(text)) return "VEGAN";
  if (/\bvegetarian|veggie|meatless\b/.test(text)) return "VEGETARIAN";
  return undefined;
}

function extractDifficulties(message: string): Array<"EASY" | "MEDIUM" | "HARD"> | undefined {
  const text = message.toLowerCase();
  if (/\beasy|simple|beginner\b/.test(text)) return ["EASY"];
  if (/\bmedium|moderate\b/.test(text)) return ["MEDIUM"];
  if (/\bhard|advanced|challenging\b/.test(text)) return ["HARD"];
  return undefined;
}

function buildSearchTerm(message: string, details: RecipeDetail): string {
  const lowerMessage = message.toLowerCase();
  const genericIntentOnly =
    /\b(similar|alternative|alternatives|other|another|instead|else|options|ideas|recommend|suggest|find|search)\b/.test(lowerMessage);
  const cuisineMatch = lowerMessage.match(/\b(turkish|turkiye|turkey|italian|mexican|indian|thai|chinese|japanese|french|greek|spanish|american|british|canadian|vietnamese|moroccan|egyptian|croatian|dutch|filipino|irish|jamaican|kenyan|malaysian|polish|portuguese|russian|tunisian)\b/);

  if (cuisineMatch) {
    return cuisineMatch[1] === "turkiye" || cuisineMatch[1] === "turkey" ? "turkish" : cuisineMatch[1];
  }

  if (genericIntentOnly && !/\b(any|all|whatever|random|different)\b/.test(lowerMessage)) {
    return [details.recipe.title, ...details.tags.slice(0, 4)].filter(Boolean).join(" ");
  }

  if (genericIntentOnly) {
    return "";
  }

  return message;
}

function normalizeSearchDecision(value: unknown): ChatbotSearchDecision | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const shouldSearch = candidate.shouldSearch === true;
  const query = typeof candidate.query === "string" ? candidate.query.trim().slice(0, 120) : "";
  const maxTotalTime = typeof candidate.maxTotalTime === "number" && Number.isFinite(candidate.maxTotalTime) && candidate.maxTotalTime > 0
    ? Math.min(Math.round(candidate.maxTotalTime), 300)
    : undefined;
  const dietType = candidate.dietType === "VEGAN" || candidate.dietType === "VEGETARIAN"
    ? candidate.dietType
    : undefined;
  const difficulties = Array.isArray(candidate.difficulties)
    ? candidate.difficulties.filter((item): item is "EASY" | "MEDIUM" | "HARD" =>
        item === "EASY" || item === "MEDIUM" || item === "HARD"
      )
    : undefined;

  return {
    shouldSearch,
    query,
    ...(maxTotalTime ? { maxTotalTime } : {}),
    ...(dietType ? { dietType } : {}),
    ...(difficulties && difficulties.length > 0 ? { difficulties } : {}),
  };
}

function parseDecisionJson(content: string): ChatbotSearchDecision | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;

  try {
    return normalizeSearchDecision(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function buildFallbackSearchDecision(message: string, details: RecipeDetail): ChatbotSearchDecision {
  if (!shouldSearchRecipes(message)) {
    return { shouldSearch: false, query: "" };
  }

  return {
    shouldSearch: true,
    query: buildSearchTerm(message, details),
    ...(extractMaxTotalTime(message) ? { maxTotalTime: extractMaxTotalTime(message) } : {}),
    ...(extractDietType(message) ? { dietType: extractDietType(message) } : {}),
    ...(extractDifficulties(message) ? { difficulties: extractDifficulties(message) } : {}),
  };
}

function buildExpandedSearchTerms(input: {
  decision: ChatbotSearchDecision;
  message: string;
  history: ProviderMessage[];
}): string[] {
  const terms = new Set<string>();
  const add = (term: string) => {
    const normalized = term.trim().toLowerCase();
    if (normalized.length > 0) terms.add(normalized);
  };
  const combinedText = [
    input.decision.query,
    input.message,
    ...input.history.slice(-6).map((item) => item.content),
  ].join(" ").toLowerCase();

  add(input.decision.query);

  if (/\b(tabule|tabbouleh|tabouli|tabbouli|mjadara|mujadara|mujaddara|mjadra|mjaddara)\b/.test(combinedText)) {
    add("turkish vegetarian");
    add("turkish side");
    add("salad");
    add("lentil rice");
    add("chickpea");
  }

  if (/\b(middle eastern|levant|levantine|lebanese|arabic)\b/.test(combinedText)) {
    add("turkish");
    add("turkish vegetarian");
    add("turkish side");
  }

  if (/\bsimilar\b|\bsomething like\b|\bnearby\b|\balternative\b/.test(combinedText)) {
    const cuisineMatch = combinedText.match(/\b(turkish|italian|mexican|indian|thai|chinese|japanese|french|greek|spanish|moroccan|egyptian|vietnamese)\b/);
    if (cuisineMatch) add(cuisineMatch[1]);
  }

  return Array.from(terms).slice(0, 6);
}

async function callNonStreamingProvider(messages: ProviderMessage[], temperature = 0): Promise<string> {
  const { apiUrl, apiKey, model } = getProviderConfig();
  const providerRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature,
    }),
  });

  if (!providerRes.ok) {
    const providerText = await providerRes.text().catch(() => "");
    throw new Error(`Chatbot search decider failed: ${providerRes.status} ${providerText.slice(0, 240)}`);
  }

  const payload = await providerRes.json() as {
    choices?: Array<{
      message?: { content?: unknown };
      delta?: { content?: unknown };
    }>;
  };

  return extractDelta(payload).trim();
}

async function decideChatbotRecipeSearch(input: {
  message: string;
  details: RecipeDetail;
  history: ProviderMessage[];
}): Promise<ChatbotSearchDecision> {
  const fallback = buildFallbackSearchDecision(input.message, input.details);
  const recentHistory = input.history.slice(-6);

  try {
    const content = await callNonStreamingProvider([
      {
        role: "system",
        content: [
          "You decide whether RecipeBox should search its recipe database before answering.",
          "Return strict JSON only, with no markdown and no commentary.",
          "Schema: {\"shouldSearch\": boolean, \"query\": string, \"maxTotalTime\"?: number, \"dietType\"?: \"VEGAN\" | \"VEGETARIAN\", \"difficulties\"?: [\"EASY\" | \"MEDIUM\" | \"HARD\"]}.",
          "Set shouldSearch=true when the user asks to find, look for, show, browse, recommend, compare, or switch to another recipe/dish/cuisine.",
          "Set shouldSearch=true when the user expresses a cuisine preference, dislikes the current cuisine, asks for easier/faster alternatives, or asks what they can cook with an ingredient.",
          "Set shouldSearch=false for pure cooking help about the current recipe, substitutions, technique, timing, or definitions, unless the user asks for another recipe.",
          "Preserve cuisine or ingredient words in query. Examples: Turkish/Turkiye -> turkish, chicken recipes -> chicken, any other recipe -> empty string.",
          "Be flexible with dish spellings and nearby cuisines. Examples: tabule/tabbouleh -> salad, herb, vegetarian, Turkish/Middle Eastern style; mjadara/mujaddara -> lentil, rice, vegetarian, Turkish/Middle Eastern style.",
          "For follow-ups like 'something similar', use recent user requests as context instead of only the currently open recipe.",
          "Never use the current recipe title as query unless the user explicitly asks for similar recipes.",
        ].join("\n"),
      },
      {
        role: "system",
        content: `Current recipe context:\n${formatRecipeContext(input.details)}`,
      },
      ...recentHistory,
      {
        role: "user",
        content: input.message,
      },
    ]);

    const decision = parseDecisionJson(content);
    if (!decision) return fallback;
    if (!decision.shouldSearch) return { shouldSearch: false, query: "" };
    return {
      shouldSearch: true,
      query: decision.query || fallback.query,
      ...(decision.maxTotalTime ? { maxTotalTime: decision.maxTotalTime } : fallback.maxTotalTime ? { maxTotalTime: fallback.maxTotalTime } : {}),
      ...(decision.dietType ? { dietType: decision.dietType } : fallback.dietType ? { dietType: fallback.dietType } : {}),
      ...(decision.difficulties?.length ? { difficulties: decision.difficulties } : fallback.difficulties?.length ? { difficulties: fallback.difficulties } : {}),
    };
  } catch (err) {
    console.warn("Falling back to deterministic chatbot search decision:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

function formatRecommendationContext(recommendations: ChatbotRecommendation[]): string {
  if (recommendations.length === 0) {
    return "Recipe catalog search results: no exact or nearby matches were found for this request. Do not claim the entire catalog has no options; ask for one broader direction such as cuisine, ingredient, course, diet, or difficulty.";
  }

  const rows = recommendations.map((recipe, index) => {
    const meta = [
      recipe.totalTime == null ? null : `${recipe.totalTime} min`,
      recipe.dietType,
      recipe.difficulty,
    ].filter(Boolean).join(", ");

    return [
      `${index + 1}. ${recipe.title}`,
      `URL path: ${recipe.href}`,
      meta ? `Details: ${meta}` : null,
      recipe.description ? `Description: ${recipe.description}` : null,
    ].filter(Boolean).join("\n");
  });

  return [
    "Recipe catalog search results from the app database:",
    ...rows,
    "Only recommend these recipes when suggesting app links. Do not invent recipe links or recipe IDs.",
    "When you mention a recommended recipe link in your reply, format it as Markdown: [Recipe title](/recipes/recipe-id).",
  ].join("\n\n");
}

export async function getChatbotSearchRecommendations(input: {
  userId: string;
  message: string;
  details: RecipeDetail;
  history?: ProviderMessage[];
}): Promise<ChatbotRecommendation[]> {
  const decision = await decideChatbotRecipeSearch({
    message: input.message,
    details: input.details,
    history: input.history || [],
  });

  if (!decision.shouldSearch) return [];

  const searchTerms = buildExpandedSearchTerms({
    decision,
    message: input.message,
    history: input.history || [],
  });
  const resultMap = new Map<string, Awaited<ReturnType<typeof searchRecipes>>[number]>();

  for (const searchTerm of searchTerms) {
    const results = await searchRecipes({
      searchTerm,
      userid: input.userId,
      maxTotalTime: decision.maxTotalTime,
      dietType: decision.dietType,
      difficulties: decision.difficulties,
      limit: getChatbotSearchLimit() + 2,
    });

    for (const recipe of results) {
      resultMap.set(recipe.recipeid, recipe);
    }

    if (resultMap.size >= getChatbotSearchLimit()) break;
  }

  return Array.from(resultMap.values())
    .filter((recipe) => recipe.recipeid !== input.details.recipe.recipeid)
    .slice(0, getChatbotSearchLimit())
    .map((recipe) => {
      const totalTime = (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0);
      return {
        recipeId: recipe.recipeid,
        title: recipe.title,
        description: recipe.description,
        imageUrl: recipe.thumbnail_url || recipe.image_url,
        totalTime: totalTime > 0 ? totalTime : null,
        dietType: recipe.diet_type,
        difficulty: recipe.difficulty,
        href: `/recipes/${recipe.recipeid}`,
      };
    });
}

function parseExampleMessages(): ProviderMessage[] {
  reloadChatbotEnv();
  const raw = process.env.CHATBOT_EXAMPLES_JSON;
  if (!raw || raw.trim() === "") return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [{ role: "system", content: `Response examples:\n${JSON.stringify(parsed)}` }];
    }

    const messages: ProviderMessage[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const candidate = item as { role?: unknown; content?: unknown };
      if (
        (candidate.role === "system" || candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string" &&
        candidate.content.trim()
      ) {
        messages.push({ role: candidate.role, content: candidate.content.trim() });
      }
    }

    if (messages.length > 0) return messages;
    return [{ role: "system", content: `Response examples:\n${JSON.stringify(parsed)}` }];
  } catch (err) {
    console.warn("Ignoring invalid CHATBOT_EXAMPLES_JSON:", err);
    return [];
  }
}

export async function buildProviderMessages(input: {
  details: RecipeDetail;
  history: ProviderMessage[];
  recommendations?: ChatbotRecommendation[];
}): Promise<ProviderMessage[]> {
  reloadChatbotEnv();
  const systemPrompt = normalizeEnvText(process.env.CHATBOT_SYSTEM_PROMPT) || DEFAULT_SYSTEM_PROMPT;
  return [
    { role: "system", content: systemPrompt },
    { role: "system", content: NO_CODE_SYSTEM_PROMPT },
    ...parseExampleMessages(),
    { role: "system", content: `Use this current page and recipe context:\n${formatRecipeContext(input.details)}` },
    ...(input.recommendations ? [{ role: "system" as const, content: formatRecommendationContext(input.recommendations) }] : []),
    ...input.history,
  ];
}

function getProviderConfig(): { apiUrl: string; apiKey: string; model: string } {
  reloadChatbotEnv();
  const apiUrl = process.env.CHATBOT_API_URL?.trim();
  const apiKey = process.env.CHATBOT_API_KEY?.trim();
  const model = process.env.CHATBOT_MODEL?.trim();

  if (!apiUrl || !apiKey || !model) {
    const error = new Error("Chatbot provider is not configured");
    (error as Error & { code?: string }).code = "CHATBOT_NOT_CONFIGURED";
    throw error;
  }

  return { apiUrl, apiKey, model };
}

function extractDelta(payload: unknown): string {
  const data = payload as {
    choices?: Array<{
      delta?: { content?: unknown };
      message?: { content?: unknown };
    }>;
  };
  const first = data.choices?.[0];
  const deltaContent = first?.delta?.content;
  if (typeof deltaContent === "string") return deltaContent;
  const messageContent = first?.message?.content;
  return typeof messageContent === "string" ? messageContent : "";
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function streamChatbotCompletion(input: {
  messages: ProviderMessage[];
  res: Response;
  sessionId: string;
}): Promise<string> {
  const { apiUrl, apiKey, model } = getProviderConfig();
  const providerRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: input.messages,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!providerRes.ok) {
    const providerText = await providerRes.text().catch(() => "");
    console.error("Chatbot provider error:", providerRes.status, providerText.slice(0, 500));
    throw new Error("The cooking assistant is unavailable right now");
  }

  let assistantText = "";
  writeSse(input.res, "session", { sessionId: input.sessionId });

  if (!providerRes.body) {
    throw new Error("The cooking assistant did not return a stream");
  }

  const reader = providerRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data) as unknown;
        const delta = extractDelta(parsed);
        if (!delta) continue;
        assistantText += delta;
        writeSse(input.res, "delta", { text: delta });
      } catch {
        continue;
      }
    }
  }

  return assistantText.trim();
}

export function sendChatbotSseDone(res: Response, sessionId: string): void {
  writeSse(res, "done", { sessionId });
}

export function sendChatbotSseRecommendations(res: Response, recipes: ChatbotRecommendation[]): void {
  if (recipes.length === 0) return;
  writeSse(res, "recommendations", { recipes });
}

export function sendChatbotSseError(res: Response, message: string): void {
  writeSse(res, "error", { error: message });
}
