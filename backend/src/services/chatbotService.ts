import { Response } from "express";
import pool from "../database";
import { RecipeDetail } from "./recipeService";
import { searchRecipes } from "./recipeSearchService";

export type ChatbotRole = "user" | "assistant";

export interface ChatbotMessage {
  role: ChatbotRole;
  content: string;
  createdAt: string;
}

export interface ChatbotSession {
  sessionId: string;
  recipeId: string;
  title: string;
  updatedAt: string;
  messages: ChatbotMessage[];
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

const DEFAULT_SYSTEM_PROMPT =
  "You are RecipeBox's premium cooking assistant. Give concise, practical cooking advice based only on the recipe context and the user's question. If something is uncertain, say so clearly.";

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
  return getEnvFlag("CHATBOT_ENABLED", false);
}

export function chatbotRequiresPremium(): boolean {
  return getEnvFlag("CHATBOT_REQUIRE_PREMIUM", true);
}

export function getChatbotHistoryDays(): number {
  return getPositiveIntEnv("CHATBOT_HISTORY_DAYS", 30);
}

export function getChatbotMaxUserMessageChars(): number {
  return getPositiveIntEnv("CHATBOT_MAX_USER_MESSAGE_CHARS", 1000);
}

function getChatbotMaxHistoryMessages(): number {
  return getPositiveIntEnv("CHATBOT_MAX_HISTORY_MESSAGES", 12);
}

function getChatbotSearchLimit(): number {
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
    `SELECT sessionid, role, content, created_at
     FROM chatbot_messages
     WHERE sessionid = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [sessionIds]
  );

  const messagesBySession = new Map<string, ChatbotMessage[]>();
  for (const row of messagesRes.rows as Array<{ sessionid: string; role: ChatbotRole; content: string; created_at: Date }>) {
    const messages = messagesBySession.get(row.sessionid) || [];
    messages.push({
      role: row.role,
      content: row.content,
      createdAt: toIso(row.created_at),
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
}): Promise<void> {
  await pool.query(
    `INSERT INTO chatbot_messages (sessionid, role, content)
     VALUES ($1::uuid, $2, $3)`,
    [input.sessionId, input.role, input.content]
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
  return /\b(similar|alternative|alternatives|recommend|recommendation|suggest|suggestion|find|search|other|another|instead|else|options|ideas|cook next|what can i cook|recipe like|recipes like|quick|vegan|vegetarian)\b/.test(text);
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

  if (genericIntentOnly) {
    return [details.recipe.title, ...details.tags.slice(0, 4)].filter(Boolean).join(" ");
  }

  return message;
}

function formatRecommendationContext(recommendations: ChatbotRecommendation[]): string {
  if (recommendations.length === 0) {
    return "Recipe catalog search results: no strong matches were found for this request.";
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
  ].join("\n\n");
}

export async function getChatbotSearchRecommendations(input: {
  userId: string;
  message: string;
  details: RecipeDetail;
}): Promise<ChatbotRecommendation[]> {
  if (!shouldSearchRecipes(input.message)) return [];

  const results = await searchRecipes({
    searchTerm: buildSearchTerm(input.message, input.details),
    userid: input.userId,
    maxTotalTime: extractMaxTotalTime(input.message),
    dietType: extractDietType(input.message),
    difficulties: extractDifficulties(input.message),
    limit: getChatbotSearchLimit() + 2,
  });

  return results
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
  const systemPrompt = process.env.CHATBOT_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;
  return [
    { role: "system", content: systemPrompt },
    ...parseExampleMessages(),
    { role: "system", content: `Use this current page and recipe context:\n${formatRecipeContext(input.details)}` },
    ...(input.recommendations ? [{ role: "system" as const, content: formatRecommendationContext(input.recommendations) }] : []),
    ...input.history,
  ];
}

function getProviderConfig(): { apiUrl: string; apiKey: string; model: string } {
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
