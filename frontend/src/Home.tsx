import { useState, useRef, useEffect, useCallback, useMemo, type PointerEvent } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { motion, useMotionValue, animate } from "framer-motion";
import { getRecipeDietBadge, parseSearchDietFilter, type SearchDietFilter } from "./recipeDiet";
import "./App.css";

const categories = [
  "🍝 Pasta", "🥗 Salads", "🍰 Desserts", "🍣 Asian",
  "🥩 Grilled", "🌮 Mexican", "🍕 Pizza", "🥑 Vegan",
];

interface RecipeFromDB {
  recipeid: string;
  title: string;
  description: string | null;
  image_url: string | null;
  proptimemin: number | null;
  difficulty: string | null;
  cooktimemin: number | null;
  diet_type: string | null;
  servings: number | null;
}

interface HomeRecommendation extends RecipeFromDB {
  score?: number;
  reason?: string;
  tags?: string[];
}

interface HomeTagSection {
  tag: string;
  totalRecipes: number;
  recipes: RecipeFromDB[];
}

interface RecipeTimeRanges {
  minTotalTime: number;
  maxTotalTime: number;
}

type DifficultyFilter = "EASY" | "MEDIUM" | "HARD";
type SearchSort = "relevance" | "total-time-asc" | "total-time-desc" | "title-asc" | "title-desc";

interface HomeViewState {
  searchTerm: string;
  totalTime: number;
  selectedDiet: SearchDietFilter | null;
  selectedDifficulty: DifficultyFilter | null;
  searchSort: SearchSort;
  showSearchResults: boolean;
}

const CARD_MIN_WIDTH = 260;
const GRID_GAP = 32;
const GRID_PADDING = 32;
const MAX_CAROUSEL_ITEMS = 14;
const HOME_VIEW_STATE_KEY = "itsystems_home_view_state_v1";
const DEFAULT_CAROUSEL_IMAGE = "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg";
const SEARCH_FETCH_LIMIT = 60;
const SEARCH_INITIAL_VISIBLE = 12;
const SEARCH_LOAD_MORE_STEP = 12;

const DEFAULT_TIME_RANGES: RecipeTimeRanges = {
  minTotalTime: 0,
  maxTotalTime: 240,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getOrCreateSessionId(): string {
  let sessionId = localStorage.getItem("recipe_session_id");
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    localStorage.setItem("recipe_session_id", sessionId);
  }
  return sessionId;
}

function loadHomeViewState(): Partial<HomeViewState> {
  const raw = sessionStorage.getItem(HOME_VIEW_STATE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<HomeViewState>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function parseDifficultyFilter(value: string | null): DifficultyFilter | null {
  const upper = (value || "").toUpperCase();
  if (upper === "EASY" || upper === "MEDIUM" || upper === "HARD") return upper;
  return null;
}

function parseSearchSort(value: string | null): SearchSort {
  const normalized = (value || "").toLowerCase();
  if (
    normalized === "total-time-asc" ||
    normalized === "total-time-desc" ||
    normalized === "title-asc" ||
    normalized === "title-desc"
  ) {
    return normalized;
  }
  return "relevance";
}

function parseOptionalNumber(value: string | null): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function trackRecipeClick(recipeId: string): Promise<void> {
  const token = localStorage.getItem("jwt_token");
  
  try {
    if (token) {
      // Track CLICK event for logged-in users
      await fetch("/api/recipe-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipeId, eventType: "CLICK" }),
      });
    } else {
      // Track CLICK event for anonymous users with session ID
      const sessionId = getOrCreateSessionId();
      await fetch("/api/recipe-events/anonymous", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, recipeId, eventType: "CLICK" }),
      });
    }
  } catch {
    // Non-blocking analytics call.
  }
}

/** Calculate how many columns fit and trim to full rows only */
function getFullRowItems(items: RecipeFromDB[], containerWidth: number): RecipeFromDB[] {
  if (containerWidth <= 0 || items.length === 0) return items;
  const available = containerWidth - GRID_PADDING * 2;
  const cols = Math.max(1, Math.floor((available + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)));
  const fullRowCount = Math.floor(items.length / cols) * cols;
  return items.slice(0, fullRowCount || cols); // at least 1 row
}

function getTwoEqualRowsItems(items: RecipeFromDB[], containerWidth: number): RecipeFromDB[] {
  if (containerWidth <= 0 || items.length === 0) return [];
  const available = containerWidth - GRID_PADDING * 2;
  const cols = Math.max(1, Math.floor((available + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)));
  const required = cols * 2;
  if (items.length < required) return [];
  return items.slice(0, required);
}

function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const initialHomeViewState = useMemo(() => {
    const persisted = loadHomeViewState();
    const urlParams = new URLSearchParams(window.location.search);

    const qParam = urlParams.get("q");
    const totalTimeParam = parseOptionalNumber(urlParams.get("maxTotalTime"));
    const dietParam = parseSearchDietFilter(urlParams.get("dietType"));
    const difficultyParam = parseDifficultyFilter(urlParams.get("difficulty"));
    const sortParamRaw = urlParams.get("sort");
    const sortParam = parseSearchSort(sortParamRaw);
    const hasAnyUrlFilter =
      qParam !== null ||
      totalTimeParam !== undefined ||
      dietParam !== null ||
      difficultyParam !== null ||
      sortParam !== "relevance";

    return {
      searchTerm: qParam ?? persisted.searchTerm ?? "",
      totalTime: totalTimeParam ?? persisted.totalTime,
      selectedDiet: dietParam ?? persisted.selectedDiet ?? null,
      selectedDifficulty: difficultyParam ?? persisted.selectedDifficulty ?? null,
      searchSort: sortParamRaw !== null ? sortParam : (persisted.searchSort ?? "relevance"),
      showSearchResults: hasAnyUrlFilter ? true : (persisted.showSearchResults ?? false),
    };
  }, []);
  const navigate = useNavigate();
  const [dbRecipes, setDbRecipes] = useState<RecipeFromDB[]>([]);
  const [recommendedRecipes, setRecommendedRecipes] = useState<HomeRecommendation[]>([]);
  const [homeSections, setHomeSections] = useState<HomeTagSection[]>([]);
  const [searchResults, setSearchResults] = useState<RecipeFromDB[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialHomeViewState.searchTerm ?? "");
  const [showSearchResults, setShowSearchResults] = useState(initialHomeViewState.showSearchResults ?? false);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeRanges, setTimeRanges] = useState<RecipeTimeRanges>(DEFAULT_TIME_RANGES);
  const [totalTime, setTotalTime] = useState(initialHomeViewState.totalTime ?? DEFAULT_TIME_RANGES.maxTotalTime);
  const [selectedDiet, setSelectedDiet] = useState<SearchDietFilter | null>(initialHomeViewState.selectedDiet ?? null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyFilter | null>(initialHomeViewState.selectedDifficulty ?? null);
  const [searchSort, setSearchSort] = useState<SearchSort>(initialHomeViewState.searchSort ?? "relevance");
  const [displayedSearchCount, setDisplayedSearchCount] = useState(SEARCH_INITIAL_VISIBLE);
  const [isSearchUiFocused, setIsSearchUiFocused] = useState(false);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const searchLoadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const searchUiRef = useRef<HTMLDivElement>(null);
  const filterControlsRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const headers = getAuthHeaders();
    const token = localStorage.getItem("jwt_token");
    const sessionId = getOrCreateSessionId();
    
    const recommendationsUrl = token 
      ? "/api/recommendations/home?limit=14"
      : `/api/recommendations/home?limit=14&sessionId=${encodeURIComponent(sessionId)}`;

    Promise.all([
      fetch("/api/recipes/home-sections?tagLimit=5&recipesPerTag=24", { headers }).then((r) => r.json()),
      fetch("/api/recipes/time-ranges", { headers }).then((r) => r.json()),
      fetch(recommendationsUrl, { headers }).then((r) => r.json()),
    ])
      .then(([sectionsData, rangesData, recommendationsData]) => {
        const fetchedSections = Array.isArray(sectionsData.sections) ? sectionsData.sections : [];
        const allRecipes = fetchedSections.flatMap((section: HomeTagSection) => section.recipes || []);
        const fetchedRecommendations = Array.isArray(recommendationsData.recommendations)
          ? recommendationsData.recommendations
          : [];

        setHomeSections(fetchedSections);
        setDbRecipes(allRecipes);
        setRecommendedRecipes(fetchedRecommendations);

        const nextRanges: RecipeTimeRanges = {
          minTotalTime: Number(rangesData?.minTotalTime ?? 0),
          maxTotalTime: Number(rangesData?.maxTotalTime ?? DEFAULT_TIME_RANGES.maxTotalTime),
        };

        setTimeRanges(nextRanges);

        const restoredTotal = typeof initialHomeViewState.totalTime === "number"
          ? clamp(initialHomeViewState.totalTime, nextRanges.minTotalTime, nextRanges.maxTotalTime)
          : nextRanges.maxTotalTime;

        setTotalTime(restoredTotal);
      })
      .catch(() => {
        setHomeSections([]);
        setDbRecipes([]);
        setRecommendedRecipes([]);
      })
      .finally(() => setLoading(false));
  }, [initialHomeViewState.totalTime]);

  useEffect(() => {
    const viewState: HomeViewState = {
      searchTerm,
      totalTime,
      selectedDiet,
      selectedDifficulty,
      searchSort,
      showSearchResults,
    };
    sessionStorage.setItem(HOME_VIEW_STATE_KEY, JSON.stringify(viewState));
  }, [searchTerm, totalTime, selectedDiet, selectedDifficulty, searchSort, showSearchResults]);

  useEffect(() => {
    const term = searchTerm.trim();
    const totalTimeFilterActive = totalTime < timeRanges.maxTotalTime;
    const dietFilterActive = selectedDiet !== null;
    const difficultyFilterActive = selectedDifficulty !== null;

    const nextParams = new URLSearchParams();
    if (term.length > 0) nextParams.set("q", term);
    if (totalTimeFilterActive) nextParams.set("maxTotalTime", String(totalTime));
    if (dietFilterActive && selectedDiet) nextParams.set("dietType", selectedDiet);
    if (difficultyFilterActive && selectedDifficulty) nextParams.set("difficulty", selectedDifficulty);
    if (searchSort !== "relevance") nextParams.set("sort", searchSort);

    const currentQuery = searchParams.toString();
    const nextQuery = nextParams.toString();
    if (currentQuery !== nextQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchTerm, totalTime, selectedDiet, selectedDifficulty, searchSort, timeRanges.maxTotalTime, searchParams, setSearchParams]);

  const handleResize = useCallback(() => {
    if (gridContainerRef.current) {
      setContainerWidth(gridContainerRef.current.offsetWidth);
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  // Recalculate when recipes load
  useEffect(() => { handleResize(); }, [dbRecipes, searchResults, showSearchResults, handleResize]);

  const runSearch = useCallback(async () => {
    const term = searchTerm.trim();
    const totalTimeFilterActive = totalTime < timeRanges.maxTotalTime;
    const dietFilterActive = selectedDiet !== null;
    const difficultyFilterActive = selectedDifficulty !== null;
    const hasActiveFilters = term.length > 0 || totalTimeFilterActive || dietFilterActive || difficultyFilterActive;
    // Trigger search if: text entered OR any filter active OR search bar is focused
    if (!hasActiveFilters && !isSearchUiFocused) {
      setShowSearchResults(false);
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const params = new URLSearchParams();
    params.set("q", term);
    params.set("maxTotalTime", String(totalTime));
    params.set("limit", String(SEARCH_FETCH_LIMIT));
    if (selectedDiet) {
      params.set("dietType", selectedDiet);
    }
    if (selectedDifficulty) {
      params.set("difficulty", selectedDifficulty);
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/recipes/search?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      const fetchedRecipes = Array.isArray(data.recipes) ? data.recipes : [];
      const strictDifficultyRecipes = selectedDifficulty
        ? fetchedRecipes.filter((recipe: RecipeFromDB) => (recipe.difficulty || "").toUpperCase() === selectedDifficulty)
        : fetchedRecipes;
      setSearchResults(strictDifficultyRecipes);
      setDisplayedSearchCount(SEARCH_INITIAL_VISIBLE);
      setShowSearchResults(true);
    } catch {
      setSearchResults([]);
      setDisplayedSearchCount(SEARCH_INITIAL_VISIBLE);
      setShowSearchResults(true);
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm, totalTime, selectedDiet, selectedDifficulty, isSearchUiFocused, timeRanges.maxTotalTime]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [runSearch]);

  const handleTotalTimeChange = useCallback((value: number) => {
    setTotalTime(clamp(value, timeRanges.minTotalTime, timeRanges.maxTotalTime));
  }, [timeRanges.maxTotalTime, timeRanges.minTotalTime]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setTotalTime(timeRanges.maxTotalTime);
    setSelectedDiet(null);
    setSelectedDifficulty(null);
    setSearchResults([]);
    setDisplayedSearchCount(SEARCH_INITIAL_VISIBLE);
    setShowSearchResults(false);
    setIsSearchUiFocused(false);
    setSearchParams(new URLSearchParams(), { replace: true });
    sessionStorage.removeItem(HOME_VIEW_STATE_KEY);
  }, [timeRanges.maxTotalTime, setSearchParams]);

  useEffect(() => {
    const shouldReset = Boolean((location.state as { resetHome?: boolean } | null)?.resetHome);
    if (!shouldReset) return;

    clearFilters();
    window.scrollTo(0, 0);
    navigate("/", { replace: true, state: null });
  }, [location.state, clearFilters, navigate]);

  const toggleDifficulty = (difficulty: DifficultyFilter) => {
    setSelectedDifficulty((prev) => (prev === difficulty ? null : difficulty));
  };

  const toggleDiet = (diet: SearchDietFilter) => {
    setSelectedDiet((prev) => (prev === diet ? null : diet));
  };

  const handleTagSectionClick = (tag: string) => {
    setSearchTerm(tag);
    setSelectedDifficulty(null);
    setShowSearchResults(true);
    setIsSearchUiFocused(true);
    window.scrollTo(0, 0);
  };

  const showExpandedSearchUi = isSearchUiFocused || showSearchResults;

  const renderRecipeCard = (recipe: RecipeFromDB, key: string, transitionDuration = 0.4) => {
    const dietBadge = getRecipeDietBadge(recipe.diet_type);
    const totalRecipeTime = (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0);

    return (
      <motion.div
        key={key}
        className="recipe-card"
        onClick={() => navigate(`/recipes/${recipe.recipeid}`)}
        whileHover={{ scale: 1.03, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: transitionDuration }}
      >
        <div className="recipe-card-img-wrap">
          <img
            src={recipe.image_url || "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg"}
            alt={recipe.title}
            className="recipe-card-img"
            loading="lazy"
            decoding="async"
          />
          {dietBadge && (
            <span className={`recipe-card-badge recipe-card-diet-badge diet-badge ${dietBadge.className}`}>
              {dietBadge.icon} {dietBadge.label}
            </span>
          )}
          {!dietBadge && recipe.difficulty && (
            <span className={`recipe-card-badge badge-${recipe.difficulty.toLowerCase()}`}>
              {recipe.difficulty}
            </span>
          )}
        </div>
        <div className="recipe-card-body">
          <h3 className="recipe-card-title">{recipe.title}</h3>
          {recipe.description && (
            <p className="recipe-card-desc">{recipe.description}</p>
          )}
          <div className="recipe-card-meta">
            {totalRecipeTime > 0 && (
              <span className="recipe-card-meta-item">⏱️ {totalRecipeTime} min</span>
            )}
            {recipe.servings != null && (
              <span className="recipe-card-meta-item">🍽️ {recipe.servings} servings</span>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  const sortedSearchResults = useMemo(() => {
    if (searchResults.length <= 1 || searchSort === "relevance") {
      return searchResults;
    }

    const getTotalTime = (recipe: RecipeFromDB) => (recipe.proptimemin ?? 0) + (recipe.cooktimemin ?? 0);
    const next = [...searchResults];

    switch (searchSort) {
      case "total-time-asc":
        next.sort((a, b) => getTotalTime(a) - getTotalTime(b));
        break;
      case "total-time-desc":
        next.sort((a, b) => getTotalTime(b) - getTotalTime(a));
        break;
      case "title-asc":
        next.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "title-desc":
        next.sort((a, b) => b.title.localeCompare(a.title));
        break;
      default:
        break;
    }

    return next;
  }, [searchResults, searchSort]);

  const slicedSearchResults = sortedSearchResults.slice(0, displayedSearchCount);
  const visibleSearchRecipes = getFullRowItems(slicedSearchResults, containerWidth);
  const visibleHomeSections = useMemo(
    () => homeSections
      .map((section) => ({
        ...section,
        recipes: getTwoEqualRowsItems(section.recipes || [], containerWidth),
      }))
      .filter((section) => section.recipes.length > 0),
    [homeSections, containerWidth]
  );
  const carouselRecipes = useMemo(() => {
    const source = recommendedRecipes.length > 0 ? recommendedRecipes : dbRecipes;
    return source.slice(0, MAX_CAROUSEL_ITEMS);
  }, [recommendedRecipes, dbRecipes]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    type NetworkInfo = { effectiveType?: string; saveData?: boolean };
    const navigatorWithConnection = navigator as Navigator & { connection?: NetworkInfo };
    const connection = navigatorWithConnection.connection;

    if (connection?.saveData) return;

    const preloadLimit = connection?.effectiveType === "4g" ? 8 : 5;
    const preloadUrls = carouselRecipes
      .slice(0, preloadLimit)
      .map((recipe) => recipe.image_url || DEFAULT_CAROUSEL_IMAGE);

    preloadUrls.forEach((url) => {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    });
  }, [carouselRecipes]);

  useEffect(() => {
    if (!showSearchResults || isSearching) return;
    if (displayedSearchCount >= sortedSearchResults.length) return;
    if (!searchLoadMoreSentinelRef.current) return;

    const sentinel = searchLoadMoreSentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) return;

        setDisplayedSearchCount((prev) =>
          Math.min(prev + SEARCH_LOAD_MORE_STEP, sortedSearchResults.length)
        );
      },
      {
        root: null,
        rootMargin: "0px 0px 180px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [showSearchResults, isSearching, displayedSearchCount, sortedSearchResults.length]);

  return (
    <div className="home-page">

      {/* ===== HERO HEADER ===== */}
      <header className={`hero-header ${showExpandedSearchUi ? "hero-header-compact" : ""}`}>
        <div className="hero-bg">
          <img
            src="https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1920"
            alt="Delicious food background"
          />
        </div>
        <div className="hero-overlay" />
        <div className={`hero-content ${showExpandedSearchUi ? "hero-content-compact" : ""}`}>
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            🍳 Join Our Recipe Community
          </motion.div>

          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
          >
            Share Your Passion for <span className="accent">Cooking</span>
          </motion.h1>

          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
          >
            A vibrant community where home cooks share their favorite recipes. Discover meals from real people, share your creations, and connect through food.
          </motion.p>

          <motion.div
            className="hero-search hero-search-wide"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            ref={searchUiRef}
            onFocusCapture={() => setIsSearchUiFocused(true)}
            onBlurCapture={() => {
              window.setTimeout(() => {
                const active = document.activeElement;
                const inSearch = searchUiRef.current && active && searchUiRef.current.contains(active);
                const inFilters = filterControlsRef.current && active && filterControlsRef.current.contains(active);
                if (inSearch || inFilters) {
                  return;
                }
                setIsSearchUiFocused(false);
              }, 0);
            }}
          >
            <span className="hero-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search your and community recipes by tags, title, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchUiFocused(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void runSearch();
                }
              }}
            />
          </motion.div>

          <motion.div
            className="hero-filter-controls"
            ref={filterControlsRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: showExpandedSearchUi ? 1 : 0, y: showExpandedSearchUi ? 0 : -10, height: showExpandedSearchUi ? "auto" : 0 }}
            transition={{ duration: 0.35, delay: 0.78 }}
            aria-hidden={!showExpandedSearchUi}
            style={{ overflow: "hidden", pointerEvents: showExpandedSearchUi ? "auto" : "none" }}
          >
            <div className="difficulty-filter-row">
              <span className="difficulty-filter-label">Diet</span>
              <div className="difficulty-chip-list">
                {(["VEGETARIAN", "VEGAN"] as SearchDietFilter[]).map((diet) => (
                  <button
                    key={diet}
                    type="button"
                    className={`difficulty-chip ${selectedDiet === diet ? "difficulty-chip-active" : ""}`}
                    onClick={() => toggleDiet(diet)}
                    aria-pressed={selectedDiet === diet}
                  >
                    {diet === "VEGAN" ? "🌿 Vegan" : "🥬 Vegetarian"}
                  </button>
                ))}
              </div>
            </div>

            <div className="difficulty-filter-row">
              <span className="difficulty-filter-label">Difficulty</span>
              <div className="difficulty-chip-list">
                {(["EASY", "MEDIUM", "HARD"] as DifficultyFilter[]).map((difficulty) => (
                  <button
                    key={difficulty}
                    type="button"
                    className={`difficulty-chip ${selectedDifficulty === difficulty ? "difficulty-chip-active" : ""}`}
                    onClick={() => toggleDifficulty(difficulty)}
                    aria-pressed={selectedDifficulty === difficulty}
                  >
                    {difficulty}
                  </button>
                ))}
              </div>
            </div>

            <div className="time-input-group">
              <div className="time-input-head">
                <label htmlFor="total-time">Total Time (max)</label>
                <span>{timeRanges.minTotalTime} - {timeRanges.maxTotalTime} min</span>
              </div>
              <div className="time-input-row">
                <input
                  id="total-time"
                  className="time-input"
                  type="number"
                  min={timeRanges.minTotalTime}
                  max={timeRanges.maxTotalTime}
                  value={totalTime}
                  onChange={(e) => handleTotalTimeChange(Number(e.target.value))}
                />
                <input
                  className="time-slider"
                  type="range"
                  min={timeRanges.minTotalTime}
                  max={timeRanges.maxTotalTime}
                  value={totalTime}
                  onChange={(e) => handleTotalTimeChange(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="time-input-group total-time-group">
              <div className="time-input-row total-row">
                <button className="hero-search-btn filter-clear-btn" onClick={clearFilters}>Clear</button>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="hero-categories"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            {categories.map((cat, i) => (
              <motion.span
                key={cat}
                className="hero-cat-pill"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.95 + i * 0.06 }}
              >
                {cat}
              </motion.span>
            ))}
          </motion.div>

          <motion.div
            className="hero-stats"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.3 }}
          >
            <div className="hero-stat">
              <div className="hero-stat-number">1,200+</div>
              <div className="hero-stat-label">Recipes</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-number">85+</div>
              <div className="hero-stat-label">Cuisines</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-number">50k+</div>
              <div className="hero-stat-label">Community Members</div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ===== RECIPE SECTIONS ===== */}
      <div className={`carousel-section ${showSearchResults ? "carousel-section-hidden" : ""}`}>
        <Carousel>
          {carouselRecipes.map((r, index) => {
            const dietBadge = getRecipeDietBadge(r.diet_type);
            return (
              <motion.div
                key={r.recipeid}
                whileHover={{ scale: 1.05, boxShadow: "0 8px 32px #fff2" }}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                style={{ minWidth: 260, maxWidth: 260, height: 320, position: "relative", borderRadius: 16, overflow: "hidden", margin: "0 0", background: "#222", display: "flex", alignItems: "flex-end", justifyContent: "center", touchAction: "pan-y", cursor: "pointer" }}
                onMouseDown={(e) => {
                  (e.currentTarget as any).__holdStartTime = Date.now();
                }}
                onClick={(e) => {
                  const holdTime = Date.now() - ((e.currentTarget as any).__holdStartTime || 0);
                  if (holdTime < 200) {
                    void trackRecipeClick(r.recipeid);
                    navigate(`/recipes/${r.recipeid}`);
                  }
                }}
              >
                <img
                  src={r.image_url || DEFAULT_CAROUSEL_IMAGE}
                  alt={r.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
                  draggable={false}
                  loading={index < 5 ? "eager" : "lazy"}
                  fetchPriority={index < 3 ? "high" : "auto"}
                  decoding="async"
                />
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", padding: "8px", display: "flex", flexWrap: "wrap", gap: "4px", pointerEvents: "none" }}>
                  {dietBadge ? (
                    <span
                      style={{
                        background: dietBadge.bg,
                        color: dietBadge.color,
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "999px",
                      }}
                    >
                      {dietBadge.icon} {dietBadge.label}
                    </span>
                  ) : null}
                  {r.difficulty && (
                    <span style={{ background: r.difficulty === "EASY" ? "#4ade80" : r.difficulty === "MEDIUM" ? "#fbbf24" : "#f87171", color: "#000", fontSize: "11px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", textTransform: "uppercase" }}>{r.difficulty}</span>
                  )}
                  {r.tags && r.tags.slice(0, 2).map((tag) => (
                    <span key={tag} style={{ background: "#333", color: "#fff", fontSize: "10px", padding: "2px 6px", borderRadius: "4px" }}>{tag}</span>
                  ))}
                </div>
                <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", background: "rgba(0,0,0,0.6)", color: "#fff", fontFamily: "monospace", fontWeight: 600, fontSize: 20, padding: "12px 0", textAlign: "center", pointerEvents: "none" }}>{r.title}</div>
              </motion.div>
            );
          })}
        </Carousel>
      </div>

      {/* Compact feed: search results or curated tag sections */}
      <div style={{ width: "100%", padding: "16px 0 0" }}>
        <h2 className="section-heading">{showSearchResults ? "Matching Recipes" : "Top Picks by Category"}</h2>
        <p className="section-subheading">
          {showSearchResults
            ? "Same style, filtered instantly as you type"
            : "Curated from the most popular recipes to keep the page fast and focused"}
        </p>
        {showSearchResults && (
          <div className="search-results-toolbar">
            <span className="search-results-count">
              Showing {Math.min(visibleSearchRecipes.length, searchResults.length)} of {searchResults.length} recipes
            </span>
            <label className="search-sort-control">
              <span>Sort by</span>
              <select
                value={searchSort}
                onChange={(e) => setSearchSort(e.target.value as SearchSort)}
              >
                <option value="relevance">Relevance</option>
                <option value="total-time-asc">Total time: Low to high</option>
                <option value="total-time-desc">Total time: High to low</option>
                <option value="title-asc">Title: A to Z</option>
                <option value="title-desc">Title: Z to A</option>
              </select>
            </label>
          </div>
        )}
      </div>
      <div ref={gridContainerRef} className="recipe-grid-container">
        {loading || isSearching ? (
          <p className="recipe-grid-loading">Loading recipes...</p>
        ) : showSearchResults ? (
          visibleSearchRecipes.length === 0 ? (
            <p className="recipe-grid-loading">No recipes found for the current search and filters</p>
          ) : (
            <>
              <div className="recipe-grid">
                {visibleSearchRecipes.map((r) => renderRecipeCard(r, r.recipeid))}
              </div>
              {visibleSearchRecipes.length < searchResults.length && (
                <div
                  ref={searchLoadMoreSentinelRef}
                  className="search-load-more-sentinel"
                  aria-hidden="true"
                />
              )}
            </>
          )
        ) : visibleHomeSections.length === 0 ? (
          <p className="recipe-grid-loading">No featured categories available right now</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {visibleHomeSections.map((section) => (
              <div key={section.tag}>
                <button
                  type="button"
                  onClick={() => handleTagSectionClick(section.tag)}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    marginBottom: 12,
                    cursor: "pointer",
                    textTransform: "capitalize",
                    fontSize: 24,
                    fontWeight: 700,
                    color: "#1f2937",
                  }}
                >
                  #{section.tag}
                  <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 500, color: "#6b7280" }}>
                    {section.totalRecipes} recipes
                  </span>
                </button>
                <div className="recipe-grid">
                  {section.recipes.map((r) => renderRecipeCard(r, `${section.tag}-${r.recipeid}`, 0.35))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Carousel({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [maxDrag, setMaxDrag] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const canScrollLeftRef = useRef(false);
  const canScrollRightRef = useRef(true);
  const dragSyncRafRef = useRef<number | null>(null);
  const xAnimationRef = useRef<ReturnType<typeof animate> | null>(null);

  const syncScrollState = (position: number, dragLimit: number = maxDrag) => {
    const edgeTolerance = 0.5;
    const nextCanScrollLeft = position < -edgeTolerance;
    const nextCanScrollRight = position > -dragLimit + edgeTolerance;

    if (canScrollLeftRef.current !== nextCanScrollLeft) {
      canScrollLeftRef.current = nextCanScrollLeft;
      setCanScrollLeft(nextCanScrollLeft);
    }
    if (canScrollRightRef.current !== nextCanScrollRight) {
      canScrollRightRef.current = nextCanScrollRight;
      setCanScrollRight(nextCanScrollRight);
    }
  };

  const queueSyncScrollState = () => {
    if (dragSyncRafRef.current != null) return;
    dragSyncRafRef.current = window.requestAnimationFrame(() => {
      dragSyncRafRef.current = null;
      syncScrollState(x.get());
    });
  };

  const recalculate = () => {
    if (containerRef.current && trackRef.current) {
      const trackWidth = trackRef.current.scrollWidth;
      const containerWidth = containerRef.current.offsetWidth;
      const nextMaxDrag = Math.max(0, trackWidth - containerWidth);
      setMaxDrag(nextMaxDrag);

      const clampedX = Math.max(-nextMaxDrag, Math.min(0, x.get()));
      x.set(clampedX);
      syncScrollState(clampedX, nextMaxDrag);
    }
  };

  const scrollBy = (distance: number) => {
    const targetX = Math.max(-maxDrag, Math.min(0, x.get() + distance));

    if (xAnimationRef.current) {
      xAnimationRef.current.stop();
      xAnimationRef.current = null;
    }

    xAnimationRef.current = animate(x, targetX, {
      duration: 0.24,
      ease: "easeOut",
      onUpdate: (latest) => {
        syncScrollState(latest);
      },
      onComplete: () => {
        xAnimationRef.current = null;
      },
    });
  };

  useEffect(() => {
    const timeout = setTimeout(recalculate, 50);
    window.addEventListener("resize", recalculate);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", recalculate);
      if (dragSyncRafRef.current != null) {
        window.cancelAnimationFrame(dragSyncRafRef.current);
      }
      if (xAnimationRef.current) {
        xAnimationRef.current.stop();
      }
    };
  }, [children]);

  return (
    <div style={{ position: "relative", width: "100%", userSelect: "none" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", maxWidth: "100%", overflow: "hidden", padding: "32px 0", boxSizing: "border-box" }}
      >
        <motion.div
          ref={trackRef}
          style={{ display: "flex", gap: 32, cursor: "grab", padding: "8px 32px", width: "max-content", userSelect: "none", x }}
          drag="x"
          dragConstraints={{ left: -maxDrag, right: 0 }}
          whileTap={{ cursor: "grabbing" }}
          dragMomentum={true}
          dragTransition={{
            power: 0.22,
            timeConstant: 260,
            bounceStiffness: 620,
            bounceDamping: 44,
            modifyTarget: (target) => Math.max(-maxDrag, Math.min(0, target)),
          }}
          dragElastic={0.08}
          dragPropagation={false}
          onDrag={() => {
            queueSyncScrollState();
          }}
          onDragEnd={() => {
            syncScrollState(x.get());
          }}
          onPointerDownCapture={(e: PointerEvent<HTMLDivElement>) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
              e.preventDefault();
            }
          }}
        >
          {children}
        </motion.div>
      </div>

      {/* Left Arrow Button - Modern Style */}
      <motion.button
        onClick={() => canScrollLeft && scrollBy(340)}
        disabled={!canScrollLeft}
        style={{
          position: "absolute",
          left: "16px",
          top: "50%",
          width: "56px",
          height: "56px",
          borderRadius: "12px",
          background: canScrollLeft 
            ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
            : "linear-gradient(135deg, #999 0%, #666 100%)",
          color: "#fff",
          border: "none",
          fontSize: "24px",
          fontWeight: "bold",
          cursor: canScrollLeft ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          boxShadow: canScrollLeft ? "0 4px 16px rgba(102, 126, 234, 0.4)" : "none",
          transition: "all 0.2s ease",
          padding: 0,
        }}
        whileHover={canScrollLeft ? { scale: 1.1, boxShadow: "0 8px 24px rgba(102, 126, 234, 0.6)" } : {}}
        whileTap={canScrollLeft ? { scale: 0.95 } : {}}
        initial={{ y: "-50%" }}
        animate={{ y: "-50%" }}
      >
        ❮
      </motion.button>

      {/* Right Arrow Button - Modern Style */}
      <motion.button
        onClick={() => canScrollRight && scrollBy(-340)}
        disabled={!canScrollRight}
        style={{
          position: "absolute",
          right: "16px",
          top: "50%",
          width: "56px",
          height: "56px",
          borderRadius: "12px",
          background: canScrollRight 
            ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
            : "linear-gradient(135deg, #999 0%, #666 100%)",
          color: "#fff",
          border: "none",
          fontSize: "24px",
          fontWeight: "bold",
          cursor: canScrollRight ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          boxShadow: canScrollRight ? "0 4px 16px rgba(102, 126, 234, 0.4)" : "none",
          transition: "all 0.2s ease",
          padding: 0,
        }}
        whileHover={canScrollRight ? { scale: 1.1, boxShadow: "0 8px 24px rgba(102, 126, 234, 0.6)" } : {}}
        whileTap={canScrollRight ? { scale: 0.95 } : {}}
        initial={{ y: "-50%" }}
        animate={{ y: "-50%" }}
      >
        ❯
      </motion.button>
    </div>
  );
}

export default Home;
