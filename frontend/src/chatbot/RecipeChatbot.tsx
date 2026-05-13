import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useChatbotPageContext } from "./ChatbotPageContext";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  createdAt?: string;
  recommendations?: ChatRecommendation[];
};

type ChatRecommendation = {
  recipeId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  totalTime: number | null;
  dietType: string | null;
  difficulty: string | null;
  href: string;
};

type ChatSession = {
  sessionId: string;
  recipeId?: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type SseEvent = {
  event: string;
  data: string;
};

const MARKDOWN_LINK_PATTERN = String.raw`\[([^\]\n]{1,200})\]\s*\(\s*([^\s)]+)\s*\)`;
const LOOSE_MARKDOWN_LINK_PATTERN = String.raw`([^\[\]\n()]{2,120})\]\s*\(\s*([^\s)]+)\s*\)`;
const BARE_LINK_PATTERN = String.raw`(https?:\/\/[^\s<>()]+|\/[A-Za-z0-9][^\s<>()]*)`;
const LINK_SEPARATOR_PATTERN = String.raw`(?:[-:\u2013\u2014]|\u00e2\u20ac[\u201c\u201d])`;
const MOBILE_CHATBOT_QUERY = "(max-width: 600px)";

export type ChatbotContextConfig = {
  key: string;
  label: string;
  title: string;
  historyEndpoint: string;
  messagesEndpoint: string;
  currentRecipeId?: string;
  assistantLabel?: string;
  heading?: string;
  introMessage?: string;
  lockedTitle?: string;
  lockedMessage?: string;
  unavailableMessage?: string;
  continuePlaceholder?: string;
  newPlaceholder?: string;
  ariaLabel?: string;
};

const DEFAULT_INTRO_MESSAGE =
  "Ask for substitutions, timing help, similar recipes, or ways to adapt this recipe to what you have.";

function getToken(): string | null {
  return localStorage.getItem("jwt_token");
}

function isMobileChatbotViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_CHATBOT_QUERY).matches;
}

function getInitialChatbotOpen(persistent: boolean): boolean {
  return persistent ? !isMobileChatbotViewport() : false;
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

function getRecipeMeta(recipe: ChatRecommendation): string {
  return [
    recipe.totalTime == null ? null : `${recipe.totalTime} min`,
    recipe.dietType && recipe.dietType !== "NONE" ? recipe.dietType.toLowerCase() : null,
    recipe.difficulty ? recipe.difficulty.toLowerCase() : null,
  ].filter(Boolean).join(" • ");
}

function getSessionPreview(session: ChatSession): string {
  const latest = [...(session.messages || [])].reverse().find((message) => message.content.trim());
  return latest?.content.replace(/\s+/g, " ").trim() || "No messages yet";
}

function smilieToEmoji(value: string): string {
  switch (value.toLowerCase()) {
    case ":)":
    case ":-)":
      return "🙂";
    case ":(":
    case ":-(":
      return "🙁";
    case ";)":
    case ";-)":
      return "😉";
    case ":d":
    case ":-d":
      return "😄";
    case "<3":
      return "❤️";
    default:
      return value;
  }
}

function normalizeChatLinkHref(href: string): string {
  const normalizedHref = href.trim().replace(/^["']|["']$/g, "");
  if (normalizedHref.startsWith("/") && !normalizedHref.startsWith("//")) return normalizedHref;
  try {
    const url = new URL(normalizedHref);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return normalizedHref;
  }
}

function isInternalChatHref(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;

  try {
    return typeof window !== "undefined" && new URL(href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function isSafeExternalHref(href: string): boolean {
  try {
    const protocol = new URL(href).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:";
  } catch {
    return false;
  }
}

function splitTrailingPunctuation(href: string): { href: string; trailing: string } {
  const match = href.match(/^(.+?)([.,;:!?]+|\u201d)?$/);
  return {
    href: match?.[1] || href,
    trailing: match?.[2] || "",
  };
}

function renderChatLink(label: string, href: string, key: string): ReactNode {
  const cleanedLabel = label.trim().replace(/^[\s,.;:–—-]+/, "");
  const cleanedHref = href.trim().replace(/^["']|["']$/g, "");

  if (isInternalChatHref(cleanedHref)) {
    const to = normalizeChatLinkHref(cleanedHref);
    return (
      <Link key={key} to={to} className="recipe-chatbot-inline-link">
        {cleanedLabel || to}
      </Link>
    );
  }

  if (isSafeExternalHref(cleanedHref)) {
    return (
      <a key={key} href={cleanedHref} className="recipe-chatbot-inline-link" target="_blank" rel="noreferrer">
        {cleanedLabel || cleanedHref}
      </a>
    );
  }

  return cleanedLabel || cleanedHref;
}

function renderInlineContent(content: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];

  // Unescape provider-escaped brackets/parentheses so markdown links like
  // "[Title](/recipes/uuid)" or escaped "\[Title\]\(/recipes/uuid\)" match.
  let safeContent = content
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\//g, "/");

  const inlinePattern = new RegExp(
    `(${MARKDOWN_LINK_PATTERN})|(${LOOSE_MARKDOWN_LINK_PATTERN})|(${BARE_LINK_PATTERN})|(\\*\\*([^*\\n]+)\\*\\*)|(\\*([^*\\n]+)\\*)|(<3|:-?\\)|:-?\\(|;-?\\)|:-?D)`,
    "g"
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(safeContent)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(safeContent.slice(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      nodes.push(renderChatLink(match[2], match[3], `${keyPrefix}-link-${match.index}`));
    } else if (match[5] && match[6]) {
      nodes.push(renderChatLink(match[5], match[6], `${keyPrefix}-loose-link-${match.index}`));
    } else if (match[8]) {
      const { href, trailing } = splitTrailingPunctuation(match[8]);
      nodes.push(renderChatLink(href, href, `${keyPrefix}-bare-link-${match.index}`));
      if (trailing) nodes.push(trailing);
    } else if (match[10]) {
      nodes.push(<strong key={`${keyPrefix}-bold-${match.index}`}>{match[10]}</strong>);
    } else if (match[12]) {
      nodes.push(<em key={`${keyPrefix}-italic-${match.index}`}>{match[12]}</em>);
    } else if (match[13]) {
      nodes.push(smilieToEmoji(match[13]));
    }

    lastIndex = inlinePattern.lastIndex;
  }

  if (lastIndex < safeContent.length) {
    nodes.push(safeContent.slice(lastIndex));
  }

  return nodes;
}

function renderRecipeLinkList(lines: string[], startIndex: number): { block: ReactNode; nextIndex: number } | null {
  const itemPattern = new RegExp(
    `^\\s*(?:[-*]\\s+|\\d+\\.\\s+)?(?:${MARKDOWN_LINK_PATTERN}|${LOOSE_MARKDOWN_LINK_PATTERN})\\s*(?:${LINK_SEPARATOR_PATTERN}\\s*)?(.*)$`
  );
  const items: ReactNode[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const match = lines[i].match(itemPattern);
    if (!match) break;

    const label = match[1] || match[3];
    const href = match[2] || match[4];
    const description = match[5]?.trim();

    if (!label || !href) break;

    items.push(
      <li key={`rec-link-item-${i}`}>
        {renderChatLink(label, href, `rec-link-${i}`)}
        {description ? <> {renderInlineContent(description, `rec-link-desc-${i}`)}</> : null}
      </li>
    );
    i += 1;
  }

  if (items.length === 0) return null;

  return {
    block: <ul key={`rec-link-list-${startIndex}`} className="recipe-chatbot-rich-list recipe-chatbot-rich-link-list">{items}</ul>,
    nextIndex: i - 1,
  };
}

function renderAssistantContent(content: string): ReactNode {
  const normalized = content
    .replace(/```+/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const numberedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    const recipeLinkList = renderRecipeLinkList(lines, i);

    if (recipeLinkList) {
      blocks.push(recipeLinkList.block);
      i = recipeLinkList.nextIndex;
      continue;
    }

    if (bulletMatch) {
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^\s*[-*]\s+(.+)$/);
        if (!itemMatch) break;
        items.push(
          <li key={`ul-item-${i}`}>
            {renderInlineContent(itemMatch[1], `ul-${i}`)}
          </li>
        );
        i += 1;
      }
      i -= 1;
      blocks.push(<ul key={`ul-${i}`} className="recipe-chatbot-rich-list">{items}</ul>);
      continue;
    }

    if (numberedMatch) {
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^\s*\d+\.\s+(.+)$/);
        if (!itemMatch) break;
        items.push(
          <li key={`ol-item-${i}`}>
            {renderInlineContent(itemMatch[1], `ol-${i}`)}
          </li>
        );
        i += 1;
      }
      i -= 1;
      blocks.push(<ol key={`ol-${i}`} className="recipe-chatbot-rich-list">{items}</ol>);
      continue;
    }

    if (line.trim().length === 0) {
      blocks.push(<div key={`gap-${i}`} className="recipe-chatbot-rich-gap" />);
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="recipe-chatbot-rich-paragraph">
        {renderInlineContent(line, `p-${i}`)}
      </p>
    );
  }

  return <div className="recipe-chatbot-rich-text">{blocks}</div>;
}

export function Chatbot({
  context,
  initialSessionId,
  onUnauthorized,
  alwaysOpen = false,
  resetOnContextChange = true,
}: {
  context: ChatbotContextConfig;
  initialSessionId?: string | null;
  onUnauthorized?: () => void;
  alwaysOpen?: boolean;
  resetOnContextChange?: boolean;
}) {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const handledInitialSessionRef = useRef<string | null>(null);
  const messagesLengthRef = useRef(0);
  const suppressSelectLatestRef = useRef(false);
  const [isOpen, setIsOpen] = useState(() => getInitialChatbotOpen(alwaysOpen));
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");

  const token = getToken();
  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) || null;

  useEffect(() => {
    messagesLengthRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    document.body.classList.toggle("recipe-chatbot-body-locked", isOpen && (!alwaysOpen || isMobileChatbotViewport()));
    return () => {
      document.body.classList.remove("recipe-chatbot-body-locked");
    };
  }, [alwaysOpen, isOpen]);

  const assistantLabel = context.assistantLabel || "Premium assistant";
  const heading = context.heading || "Cook smarter";
  const introMessage = context.introMessage || DEFAULT_INTRO_MESSAGE;
  const lockedTitle = context.lockedTitle || "Premium cooking guidance";
  const lockedMessage = context.lockedMessage || "Unlock recipe-aware tips, substitutions, and timing help while you cook.";
  const unavailableMessage = context.unavailableMessage || "The assistant is unavailable for this context";
  const continuePlaceholder = context.continuePlaceholder || "Continue this chat...";
  const newPlaceholder = context.newPlaceholder || "Ask for a cooking tip...";
  const ariaLabel = context.ariaLabel || "Premium cooking assistant";

  useEffect(() => {
    if (!resetOnContextChange) return;
    handledInitialSessionRef.current = null;
    setIsOpen(Boolean(initialSessionId));
    setIsHistoryOpen(false);
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
    setDraft("");
    setLoadingHistory(false);
    setSending(false);
    setLocked(false);
    setError("");
  }, [context.key, initialSessionId, resetOnContextChange]);

  useEffect(() => {
    if (!initialSessionId || handledInitialSessionRef.current === initialSessionId) return;
    setIsOpen(true);
  }, [initialSessionId]);

  const refreshHistory = useCallback(async ({
    selectLatest,
    selectSessionId,
  }: {
    selectLatest: boolean;
    selectSessionId?: string | null;
  }) => {
    const currentToken = getToken();
    if (!currentToken) {
      setLocked(true);
      return;
    }

    setLoadingHistory(true);
    setError("");
    try {
      const res = await fetch(context.historyEndpoint, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const body = await res.json().catch(() => ({} as { error?: string; sessions?: ChatSession[] }));

      if (res.status === 401) {
        onUnauthorized?.();
        navigate("/login");
        return;
      }
      if (res.status === 403) {
        setLocked(true);
        return;
      }
      if (res.status === 404) {
        setSessions([]);
        setActiveSessionId(null);
        setError(body.error || "Chat history is unavailable here");
        return;
      }
      if (!res.ok) {
        throw new Error(body.error || "Failed to load chat history");
      }

      const nextSessions = Array.isArray(body.sessions) ? body.sessions : [];
      setLocked(false);
      setSessions(nextSessions);

      if (selectSessionId) {
        const selectedSession = nextSessions.find((session: ChatSession) => session.sessionId === selectSessionId);
        handledInitialSessionRef.current = selectSessionId;
        if (selectedSession) {
          setActiveSessionId(selectedSession.sessionId);
          setMessages(selectedSession.messages || []);
          return;
        }
        setActiveSessionId(null);
        setMessages([]);
        return;
      }

      if (selectLatest && nextSessions.length > 0) {
        setActiveSessionId(nextSessions[0].sessionId);
        setMessages(nextSessions[0].messages || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat history");
    } finally {
      setLoadingHistory(false);
    }
  }, [context.historyEndpoint, navigate, onUnauthorized]);

  useEffect(() => {
    if (!isOpen) return;
    const shouldSelectInitial =
      initialSessionId && handledInitialSessionRef.current !== initialSessionId;
    void refreshHistory({
      selectLatest: messagesLengthRef.current === 0 && !shouldSelectInitial && !suppressSelectLatestRef.current,
      selectSessionId: shouldSelectInitial ? initialSessionId : undefined,
    });
  }, [isOpen, context.key, initialSessionId, refreshHistory]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const handleMessagesScroll = () => {
    const element = messagesContainerRef.current;
    if (!element) return;

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, ChatSession[]>();
    for (const session of sessions) {
      const label = formatHistoryDate(session.updatedAt);
      const list = groups.get(label) || [];
      list.push(session);
      groups.set(label, list);
    }
    return Array.from(groups.entries());
  }, [sessions]);

  const handleResumeSession = (session: ChatSession) => {
    setActiveSessionId(session.sessionId);
    setMessages(session.messages || []);
    setIsHistoryOpen(false);
    setError("");
  };

  const handleNewChat = () => {
    suppressSelectLatestRef.current = true;
    setActiveSessionId(null);
    setMessages([]);
    setIsHistoryOpen(false);
    setError("");
  };

  const handleSend = async () => {
    const text = draft.trim();
    const currentToken = getToken();
    if (!text || sending) return;

    if (!currentToken) {
      navigate("/login");
      return;
    }

    setDraft("");
    setSending(true);
    setError("");
    setLocked(false);
    suppressSelectLatestRef.current = false;
    shouldAutoScrollRef.current = true;

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(context.messagesEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          message: text,
          sessionId: activeSessionId,
          currentRecipeId: context.currentRecipeId,
        }),
      });

      if (res.status === 401) {
        onUnauthorized?.();
        navigate("/login");
        return;
      }

      if (res.status === 403) {
        setLocked(true);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      if (res.status === 404) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error || unavailableMessage);
      }

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error || "The assistant could not answer right now");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let pendingRecommendations: ChatRecommendation[] | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const parsed = parseSseBlock(block);
          if (!parsed) continue;

          const data = JSON.parse(parsed.data) as {
            text?: string;
            sessionId?: string;
            error?: string;
            recipes?: ChatRecommendation[];
          };
          if (parsed.event === "session" && data.sessionId) {
            setActiveSessionId(data.sessionId);
          }
          if (parsed.event === "recommendations" && Array.isArray(data.recipes)) {
            pendingRecommendations = data.recipes;
          }
          if (parsed.event === "delta" && data.text) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: `${last.content}${data.text}` };
              }
              return next;
            });
          }
          if (parsed.event === "error") {
            throw new Error(data.error || "The assistant could not answer right now");
          }
          if (parsed.event === "done") {
            const recommendations = pendingRecommendations;
            if (recommendations && recommendations.length > 0) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, recommendations };
                }
                return next;
              });
            }
          }
        }
      }

      await refreshHistory({ selectLatest: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The assistant could not answer right now";
      setError(message);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.content.trim() === "") {
          next[next.length - 1] = { role: "assistant", content: "I could not answer that one. Please try again in a moment." };
        }
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`recipe-chatbot ${alwaysOpen ? "recipe-chatbot-persistent" : ""}`}>
      <AnimatePresence>
        {isOpen && (
          <motion.section
            className={`recipe-chatbot-panel ${isHistoryOpen ? "recipe-chatbot-panel-history-open" : ""}`}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            aria-label={ariaLabel}
          >
            <div className="recipe-chatbot-head">
              <div>
                <span className="recipe-chatbot-kicker">{assistantLabel}</span>
                <h2>{heading}</h2>
              </div>
              <button
                type="button"
                className="recipe-chatbot-icon-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close recipe assistant"
              >
                ×
              </button>
            </div>

            <div className="recipe-chatbot-context">
              <span>{context.label}</span>
              <strong>{context.title}</strong>
            </div>

            {locked || !token ? (
              <div className="recipe-chatbot-locked">
                <span className="recipe-chatbot-lock-icon">✦</span>
                <h3>{lockedTitle}</h3>
                <p>{lockedMessage}</p>
                <div className="recipe-chatbot-lock-actions">
                  {!token ? (
                    <button type="button" onClick={() => navigate("/login")}>Login</button>
                  ) : null}
                  <button type="button" onClick={() => navigate("/premium")}>Upgrade</button>
                </div>
              </div>
            ) : (
              <>
                <div className="recipe-chatbot-toolbar">
                  <button
                    type="button"
                    className={`recipe-chatbot-history-toggle ${isHistoryOpen ? "is-open" : ""}`}
                    onClick={() => setIsHistoryOpen((open) => !open)}
                    aria-expanded={isHistoryOpen}
                  >
                    <span className="recipe-chatbot-history-toggle-copy">
                      <strong>History</strong>
                      <small>{sessions.length === 0 ? "No saved chats" : `${sessions.length} saved chat${sessions.length === 1 ? "" : "s"}`}</small>
                    </span>
                    <span className="recipe-chatbot-history-toggle-meta">
                      <b>{sessions.length}</b>
                    </span>
                  </button>
                  <button type="button" className="recipe-chatbot-new-btn" onClick={handleNewChat}>
                    New
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {isHistoryOpen && (
                    <motion.div
                      className="recipe-chatbot-history"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {loadingHistory ? (
                        <div className="recipe-chatbot-history-state">
                          <span className="recipe-chatbot-history-state-mark">...</span>
                          <strong>Loading history</strong>
                          <p>Finding your saved cooking chats.</p>
                        </div>
                      ) : groupedSessions.length === 0 ? (
                        <div className="recipe-chatbot-history-state">
                          <span className="recipe-chatbot-history-state-mark">+</span>
                          <strong>No saved chats yet</strong>
                          <p>Start a conversation and it will appear here.</p>
                        </div>
                      ) : (
                        groupedSessions.map(([label, group]) => (
                          <div key={label} className="recipe-chatbot-history-group">
                            <span className="recipe-chatbot-history-date">{label}</span>
                            {group.map((session) => (
                              <button
                                key={session.sessionId}
                                type="button"
                                className={session.sessionId === activeSessionId ? "is-active" : ""}
                                onClick={() => handleResumeSession(session)}
                              >
                                <span className="recipe-chatbot-history-session-main">
                                  <strong>{session.title}</strong>
                                  <small>{getSessionPreview(session)}</small>
                                </span>
                                <span className="recipe-chatbot-history-session-meta">
                                  {session.messages.length}
                                </span>
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div
                  className="recipe-chatbot-messages"
                  ref={messagesContainerRef}
                  onScroll={handleMessagesScroll}
                >
                  {messages.length === 0 ? (
                    <div className="recipe-chatbot-empty">
                      <span>Ask away</span>
                      <p>{introMessage}</p>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`recipe-chatbot-message-wrap recipe-chatbot-message-wrap-${message.role}`}
                      >
                        <div
                          className={`recipe-chatbot-message recipe-chatbot-message-${message.role}`}
                        >
                          {message.content
                            ? message.role === "assistant"
                              ? renderAssistantContent(message.content)
                              : message.content
                            : message.role === "assistant"
                              ? "Thinking..."
                              : ""}
                        </div>
                        {message.role === "assistant" && message.recommendations && message.recommendations.length > 0 ? (
                          <div className="recipe-chatbot-recommendations" aria-label="Suggested recipes">
                            <span>Suggested recipes</span>
                            {message.recommendations.map((recipe) => (
                              <button
                                key={recipe.recipeId}
                                type="button"
                                className="recipe-chatbot-rec-card"
                                onClick={() => navigate(normalizeChatLinkHref(recipe.href))}
                              >
                                {recipe.imageUrl ? (
                                  <img src={recipe.imageUrl} alt="" />
                                ) : (
                                  <div className="recipe-chatbot-rec-image-fallback">Recipe</div>
                                )}
                                <div>
                                  <strong>{recipe.title}</strong>
                                  <small>{getRecipeMeta(recipe) || "Open recipe"}</small>
                                  {recipe.description ? <p>{recipe.description}</p> : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {error ? <p className="recipe-chatbot-error">{error}</p> : null}

                <form
                  className="recipe-chatbot-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSend();
                  }}
                >
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={activeSession ? continuePlaceholder : newPlaceholder}
                    rows={2}
                    maxLength={1000}
                    disabled={sending}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <button type="submit" disabled={sending || draft.trim().length === 0}>
                    {sending ? "..." : "Send"}
                  </button>
                </form>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>

        <motion.button
          type="button"
          className="recipe-chatbot-fab"
          onClick={() => setIsOpen((open) => !open)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          aria-label={isOpen ? "Close recipe assistant" : "Open recipe assistant"}
          aria-expanded={isOpen}
        >
          <span>✦</span>
          <strong>Ask</strong>
        </motion.button>
    </div>
  );
}

export function PersistentChatbotCompanion({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const location = useLocation();
  const { pageContext } = useChatbotPageContext();
  const initialSessionId = new URLSearchParams(location.search).get("chatSession");

  const context = useMemo<ChatbotContextConfig>(() => ({
    key: pageContext.key,
    label: pageContext.label,
    title: pageContext.title,
    currentRecipeId: pageContext.currentRecipeId,
    historyEndpoint: "/api/chatbot/companion/history",
    messagesEndpoint: "/api/chatbot/companion/messages",
    assistantLabel: pageContext.currentRecipeId ? "Recipe assistant" : "Search assistant",
    heading: pageContext.currentRecipeId ? "Cook this recipe" : "Find what to cook",
    introMessage: pageContext.currentRecipeId
      ? DEFAULT_INTRO_MESSAGE
      : "Tell me what you feel like eating, what ingredients you have, or how much time you want to spend.",
    lockedTitle: pageContext.currentRecipeId ? "Premium cooking guidance" : "Premium search guidance",
    lockedMessage: pageContext.currentRecipeId
      ? "Unlock recipe-aware tips, substitutions, and timing help while you cook."
      : "Unlock recipe discovery help when you know the mood, ingredients, or time limit but not the exact recipe.",
    unavailableMessage: "The assistant is unavailable right now",
    continuePlaceholder: pageContext.currentRecipeId ? "Ask about this recipe..." : "Keep narrowing the search...",
    newPlaceholder: pageContext.currentRecipeId ? "Ask about this recipe..." : "Ask what to cook tonight...",
    ariaLabel: "Persistent cooking assistant",
  }), [pageContext]);

  return (
    <Chatbot
      context={context}
      initialSessionId={initialSessionId}
      onUnauthorized={onUnauthorized}
      alwaysOpen
      resetOnContextChange={false}
    />
  );
}

export default function RecipeChatbot({
  recipeId,
  recipeTitle,
  initialSessionId,
  onUnauthorized,
}: {
  recipeId: string;
  recipeTitle: string;
  initialSessionId?: string | null;
  onUnauthorized?: () => void;
}) {
  const context = useMemo<ChatbotContextConfig>(() => ({
    key: `recipe:${recipeId}`,
    label: "Recipe",
    title: recipeTitle,
    historyEndpoint: `/api/chatbot/recipes/${recipeId}/history`,
    messagesEndpoint: `/api/chatbot/recipes/${recipeId}/messages`,
    introMessage: DEFAULT_INTRO_MESSAGE,
    lockedTitle: "Premium cooking guidance",
    lockedMessage: "Unlock recipe-aware tips, substitutions, and timing help while you cook.",
    unavailableMessage: "The assistant is unavailable for this recipe",
    continuePlaceholder: "Continue this recipe chat...",
    newPlaceholder: "Ask for a cooking tip...",
    ariaLabel: "Premium recipe assistant",
  }), [recipeId, recipeTitle]);

  return (
    <Chatbot
      context={context}
      initialSessionId={initialSessionId}
      onUnauthorized={onUnauthorized}
    />
  );
}
