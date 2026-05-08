import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  createdAt?: string;
};

type ChatSession = {
  sessionId: string;
  recipeId: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type SseEvent = {
  event: string;
  data: string;
};

const INTRO_MESSAGE =
  "Ask for substitutions, timing help, plating ideas, or ways to adapt this recipe to what you have.";

function getToken(): string | null {
  return localStorage.getItem("jwt_token");
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

export default function RecipeChatbot({ recipeId, recipeTitle }: { recipeId: string; recipeTitle: string }) {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState("");

  const token = useMemo(() => getToken(), [isOpen]);
  const activeSession = sessions.find((session) => session.sessionId === activeSessionId) || null;

  const refreshHistory = async (selectLatest: boolean) => {
    const currentToken = getToken();
    if (!currentToken) {
      setLocked(true);
      return;
    }

    setLoadingHistory(true);
    setError("");
    try {
      const res = await fetch(`/api/chatbot/recipes/${recipeId}/history`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const body = await res.json().catch(() => ({} as { error?: string; sessions?: ChatSession[] }));

      if (res.status === 403) {
        setLocked(true);
        return;
      }
      if (res.status === 404) {
        setDisabled(true);
        return;
      }
      if (!res.ok) {
        throw new Error(body.error || "Failed to load chat history");
      }

      const nextSessions = Array.isArray(body.sessions) ? body.sessions : [];
      setLocked(false);
      setDisabled(false);
      setSessions(nextSessions);

      if (selectLatest && nextSessions.length > 0) {
        setActiveSessionId(nextSessions[0].sessionId);
        setMessages(nextSessions[0].messages || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat history");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void refreshHistory(messages.length === 0);
  }, [isOpen, recipeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

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

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`/api/chatbot/recipes/${recipeId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          message: text,
          sessionId: activeSessionId,
        }),
      });

      if (res.status === 403) {
        setLocked(true);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error || "The assistant could not answer right now");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const parsed = parseSseBlock(block);
          if (!parsed) continue;

          const data = JSON.parse(parsed.data) as { text?: string; sessionId?: string; error?: string };
          if (parsed.event === "session" && data.sessionId) {
            setActiveSessionId(data.sessionId);
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
        }
      }

      await refreshHistory(false);
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

  if (disabled) return null;

  return (
    <div className="recipe-chatbot">
      <AnimatePresence>
        {isOpen && (
          <motion.section
            className={`recipe-chatbot-panel ${isHistoryOpen ? "recipe-chatbot-panel-history-open" : ""}`}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            aria-label="Premium recipe assistant"
          >
            <div className="recipe-chatbot-head">
              <div>
                <span className="recipe-chatbot-kicker">Premium assistant</span>
                <h2>Cook smarter</h2>
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
              <span>Recipe</span>
              <strong>{recipeTitle}</strong>
            </div>

            {locked || !token ? (
              <div className="recipe-chatbot-locked">
                <span className="recipe-chatbot-lock-icon">✦</span>
                <h3>Premium cooking guidance</h3>
                <p>Unlock recipe-aware tips, substitutions, and timing help while you cook.</p>
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
                    <span>History</span>
                    <strong>{sessions.length}</strong>
                    <i>{isHistoryOpen ? "⌃" : "⌄"}</i>
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
                        <p className="recipe-chatbot-muted">Loading history...</p>
                      ) : groupedSessions.length === 0 ? (
                        <p className="recipe-chatbot-muted">No saved chats for this recipe yet.</p>
                      ) : (
                        groupedSessions.map(([label, group]) => (
                          <div key={label} className="recipe-chatbot-history-group">
                            <span>{label}</span>
                            {group.map((session) => (
                              <button
                                key={session.sessionId}
                                type="button"
                                className={session.sessionId === activeSessionId ? "is-active" : ""}
                                onClick={() => handleResumeSession(session)}
                              >
                                <strong>{session.title}</strong>
                                <small>{session.messages.length} messages</small>
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="recipe-chatbot-messages">
                  {messages.length === 0 ? (
                    <div className="recipe-chatbot-empty">
                      <span>Ask away</span>
                      <p>{INTRO_MESSAGE}</p>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`recipe-chatbot-message recipe-chatbot-message-${message.role}`}
                      >
                        {message.content || (message.role === "assistant" ? "Thinking..." : "")}
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
                    placeholder={activeSession ? "Continue this recipe chat..." : "Ask for a cooking tip..."}
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
      >
        <span>✦</span>
        <strong>Ask</strong>
      </motion.button>
    </div>
  );
}
