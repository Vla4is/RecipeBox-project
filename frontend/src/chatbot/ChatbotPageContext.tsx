import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

export type ChatbotPageContextValue = {
  key: string;
  label: string;
  title: string;
  currentRecipeId?: string;
};

type ChatbotPageContextApi = {
  pageContext: ChatbotPageContextValue;
  setPageContext: (context: ChatbotPageContextValue) => void;
};

const DEFAULT_PAGE_CONTEXT: ChatbotPageContextValue = {
  key: "home-search",
  label: "Search",
  title: "Looking for something and not sure?",
};

const GENERIC_PAGE_CONTEXT: ChatbotPageContextValue = {
  key: "general",
  label: "RecipeBox",
  title: "Cooking companion",
};

const ChatbotPageContext = createContext<ChatbotPageContextApi | null>(null);

export function ChatbotPageContextProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [pageContext, setPageContext] = useState<ChatbotPageContextValue>(DEFAULT_PAGE_CONTEXT);

  useEffect(() => {
    if (location.pathname === "/") {
      setPageContext(DEFAULT_PAGE_CONTEXT);
      return;
    }

    if (!location.pathname.startsWith("/recipes/")) {
      setPageContext(GENERIC_PAGE_CONTEXT);
    }
  }, [location.pathname]);

  const value = useMemo(
    () => ({ pageContext, setPageContext }),
    [pageContext]
  );

  return (
    <ChatbotPageContext.Provider value={value}>
      {children}
    </ChatbotPageContext.Provider>
  );
}

export function useChatbotPageContext() {
  const context = useContext(ChatbotPageContext);
  if (!context) {
    throw new Error("useChatbotPageContext must be used inside ChatbotPageContextProvider");
  }
  return context;
}

