import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import "./App.css";

type ChatHistorySession = {
  sessionId: string;
  recipeId: string;
  recipeTitle: string;
  recipeImageUrl: string | null;
  title: string;
  updatedAt: string;
  messageCount: number;
  latestPreview: string | null;
};

async function safeJson<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as T));
}

function formatChatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ChatHistory({
  token,
  onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => void;
}) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatHistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetch("/api/chatbot/history", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const body = await safeJson<{ error?: string; sessions?: ChatHistorySession[] }>(res);
        if (res.status === 401) {
          onUnauthorized();
          return null;
        }
        if (res.status === 403) {
          setLocked(true);
          return [];
        }
        if (!res.ok) {
          throw new Error(body.error || "Failed to load chat history");
        }
        return Array.isArray(body.sessions) ? body.sessions : [];
      })
      .then((nextSessions) => {
        if (!nextSessions) return;
        setSessions(nextSessions);
      })
      .catch((err: Error) => setError(err.message || "Failed to load chat history"))
      .finally(() => setLoading(false));
  }, [token, onUnauthorized]);

  const totalMessages = useMemo(
    () => sessions.reduce((sum, session) => sum + session.messageCount, 0),
    [sessions]
  );

  const openSession = (session: ChatHistorySession) => {
    navigate(`/recipes/${session.recipeId}?chatSession=${encodeURIComponent(session.sessionId)}`);
  };

  if (loading) {
    return (
      <div className="chat-history-page">
        <div className="my-recipes-loading">
          <div className="rd-spinner" />
          <span>Loading chat history...</span>
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="chat-history-page">
        <div className="chat-history-container">
          <div className="chat-history-empty">
            <span>Premium</span>
            <h1>Premium chat history</h1>
            <p>Upgrade to view and continue your saved recipe assistant conversations.</p>
            <button type="button" onClick={() => navigate("/premium")}>
              View Premium
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chat-history-page">
        <div className="chat-history-container">
          <div className="chat-history-empty">
            <span>Unavailable</span>
            <h1>Could not load chats</h1>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-history-page">
      <div className="chat-history-container">
        <header className="chat-history-header">
          <div>
            <p className="chat-history-kicker">Recipe assistant</p>
            <h1>Chat History</h1>
            <p>
              {sessions.length === 0
                ? "Your saved recipe chats will appear here."
                : `${sessions.length} chat${sessions.length === 1 ? "" : "s"} across recipes, ${totalMessages} total message${totalMessages === 1 ? "" : "s"}.`}
            </p>
          </div>
          <button type="button" onClick={() => navigate("/")}>
            Browse recipes
          </button>
        </header>

        {sessions.length === 0 ? (
          <div className="chat-history-empty">
            <span>No chats yet</span>
            <h2>Ask from any recipe page</h2>
            <p>Once you start a premium assistant chat, it will show up here so you can continue it later.</p>
          </div>
        ) : (
          <motion.div
            className="chat-history-list"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {sessions.map((session) => (
              <motion.button
                key={session.sessionId}
                type="button"
                className="chat-history-card"
                onClick={() => openSession(session)}
                variants={{
                  hidden: { opacity: 0, y: 14 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.28 } },
                }}
              >
                {session.recipeImageUrl ? (
                  <img src={session.recipeImageUrl} alt="" />
                ) : (
                  <div className="chat-history-image-fallback">Chat</div>
                )}
                <div className="chat-history-card-body">
                  <div className="chat-history-card-topline">
                    <span>{formatChatDate(session.updatedAt)}</span>
                    <small>{session.messageCount} message{session.messageCount === 1 ? "" : "s"}</small>
                  </div>
                  <h2>{session.title}</h2>
                  <strong>{session.recipeTitle}</strong>
                  {session.latestPreview ? <p>{session.latestPreview}</p> : null}
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
