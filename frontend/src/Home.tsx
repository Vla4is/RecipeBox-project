import { useState, useRef, useEffect, useCallback, useMemo, type PointerEvent } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { motion, useMotionValue, animate } from "framer-motion";
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
  minPrepTime: number;
  maxPrepTime: number;
  minCookTime: number;
  maxCookTime: number;
}

type DifficultyFilter = "EASY" | "MEDIUM" | "HARD";

interface HomeViewState {
  searchTerm: string;
  maxPrepTime: number;
  maxCookTime: number;
  totalTime: number;
  selectedDifficulty: DifficultyFilter | null;
  showSearchResults: boolean;
}

const CARD_MIN_WIDTH = 260;
const GRID_GAP = 32;
const GRID_PADDING = 32;
const MAX_CAROUSEL_ITEMS = 14;
const HOME_VIEW_STATE_KEY = "itsystems_home_view_state_v1";

const DEFAULT_TIME_RANGES: RecipeTimeRanges = {
  minPrepTime: 0,
  maxPrepTime: 120,
  minCookTime: 0,
  maxCookTime: 120,
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
    const prepParam = parseOptionalNumber(urlParams.get("maxPrepTime"));
    const cookParam = parseOptionalNumber(urlParams.get("maxCookTime"));
    const difficultyParam = parseDifficultyFilter(urlParams.get("difficulty"));
    const hasAnyUrlFilter = qParam !== null || prepParam !== undefined || cookParam !== undefined || difficultyParam !== null;

    return {
      searchTerm: qParam ?? persisted.searchTerm ?? "",
      maxPrepTime: prepParam ?? persisted.maxPrepTime ?? DEFAULT_TIME_RANGES.maxPrepTime,
      maxCookTime: cookParam ?? persisted.maxCookTime ?? DEFAULT_TIME_RANGES.maxCookTime,
      totalTime: (prepParam ?? persisted.maxPrepTime ?? DEFAULT_TIME_RANGES.maxPrepTime) + (cookParam ?? persisted.maxCookTime ?? DEFAULT_TIME_RANGES.maxCookTime),
      selectedDifficulty: difficultyParam ?? persisted.selectedDifficulty ?? null,
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
  const [maxPrepTime, setMaxPrepTime] = useState(initialHomeViewState.maxPrepTime ?? DEFAULT_TIME_RANGES.maxPrepTime);
  const [maxCookTime, setMaxCookTime] = useState(initialHomeViewState.maxCookTime ?? DEFAULT_TIME_RANGES.maxCookTime);
  const [totalTime, setTotalTime] = useState(initialHomeViewState.totalTime ?? (DEFAULT_TIME_RANGES.maxPrepTime + DEFAULT_TIME_RANGES.maxCookTime));
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyFilter | null>(initialHomeViewState.selectedDifficulty ?? null);
  const [isSearchUiFocused, setIsSearchUiFocused] = useState(false);
  const gridContainerRef = useRef<HTMLDivElement>(null);
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
          minPrepTime: Number(rangesData?.minPrepTime ?? 0),
          maxPrepTime: Number(rangesData?.maxPrepTime ?? DEFAULT_TIME_RANGES.maxPrepTime),
          minCookTime: Number(rangesData?.minCookTime ?? 0),
          maxCookTime: Number(rangesData?.maxCookTime ?? DEFAULT_TIME_RANGES.maxCookTime),
        };

        setTimeRanges(nextRanges);

        const restoredMaxPrep = typeof initialHomeViewState.maxPrepTime === "number"
          ? clamp(initialHomeViewState.maxPrepTime, nextRanges.minPrepTime, nextRanges.maxPrepTime)
          : nextRanges.maxPrepTime;
        const restoredMaxCook = typeof initialHomeViewState.maxCookTime === "number"
          ? clamp(initialHomeViewState.maxCookTime, nextRanges.minCookTime, nextRanges.maxCookTime)
          : nextRanges.maxCookTime;

        const minTotal = nextRanges.minPrepTime + nextRanges.minCookTime;
        const maxTotal = nextRanges.maxPrepTime + nextRanges.maxCookTime;
        const restoredTotal = typeof initialHomeViewState.totalTime === "number"
          ? clamp(initialHomeViewState.totalTime, minTotal, maxTotal)
          : restoredMaxPrep + restoredMaxCook;

        setMaxPrepTime(restoredMaxPrep);
        setMaxCookTime(restoredMaxCook);
        setTotalTime(restoredTotal);
      })
      .catch(() => {
        setHomeSections([]);
        setDbRecipes([]);
        setRecommendedRecipes([]);
      })
      .finally(() => setLoading(false));
  }, [initialHomeViewState.maxCookTime, initialHomeViewState.maxPrepTime, initialHomeViewState.totalTime]);

  useEffect(() => {
    const viewState: HomeViewState = {
      searchTerm,
      maxPrepTime,
      maxCookTime,
      totalTime,
      selectedDifficulty,
      showSearchResults,
    };
    sessionStorage.setItem(HOME_VIEW_STATE_KEY, JSON.stringify(viewState));
  }, [searchTerm, maxPrepTime, maxCookTime, totalTime, selectedDifficulty, showSearchResults]);

  useEffect(() => {
    const term = searchTerm.trim();
    const prepFilterActive = maxPrepTime < timeRanges.maxPrepTime;
    const cookFilterActive = maxCookTime < timeRanges.maxCookTime;
    const difficultyFilterActive = selectedDifficulty !== null;

    const nextParams = new URLSearchParams();
    if (term.length > 0) nextParams.set("q", term);
    if (prepFilterActive) nextParams.set("maxPrepTime", String(maxPrepTime));
    if (cookFilterActive) nextParams.set("maxCookTime", String(maxCookTime));
    if (difficultyFilterActive && selectedDifficulty) nextParams.set("difficulty", selectedDifficulty);

    const currentQuery = searchParams.toString();
    const nextQuery = nextParams.toString();
    if (currentQuery !== nextQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchTerm, maxPrepTime, maxCookTime, selectedDifficulty, timeRanges.maxPrepTime, timeRanges.maxCookTime, searchParams, setSearchParams]);

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
    const prepFilterActive = maxPrepTime < timeRanges.maxPrepTime;
    const cookFilterActive = maxCookTime < timeRanges.maxCookTime;
    const difficultyFilterActive = selectedDifficulty !== null;
    const hasActiveFilters = term.length > 0 || prepFilterActive || cookFilterActive || difficultyFilterActive;
    // Trigger search if: text entered OR any filter active OR search bar is focused
    if (!hasActiveFilters && !isSearchUiFocused) {
      setShowSearchResults(false);
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const params = new URLSearchParams();
    params.set("q", term);
    params.set("maxPrepTime", String(maxPrepTime));
    params.set("maxCookTime", String(maxCookTime));
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
      setShowSearchResults(true);
    } catch {
      setSearchResults([]);
      setShowSearchResults(true);
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm, maxPrepTime, maxCookTime, selectedDifficulty, isSearchUiFocused, timeRanges.maxPrepTime, timeRanges.maxCookTime]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [runSearch]);

  const distributeTotalTime = useCallback((newTotalTime: number) => {
    const nextTotal = clamp(
      newTotalTime,
      timeRanges.minPrepTime + timeRanges.minCookTime,
      timeRanges.maxPrepTime + timeRanges.maxCookTime
    );

    const currentSum = maxPrepTime + maxCookTime;
    const ratio = currentSum > 0 ? maxPrepTime / currentSum : 0.5;

    let nextPrep = clamp(
      Math.round(nextTotal * ratio),
      timeRanges.minPrepTime,
      timeRanges.maxPrepTime
    );
    let nextCook = clamp(
      nextTotal - nextPrep,
      timeRanges.minCookTime,
      timeRanges.maxCookTime
    );

    const diff = nextTotal - (nextPrep + nextCook);
    if (diff > 0) {
      const cookRoom = timeRanges.maxCookTime - nextCook;
      const addCook = Math.min(cookRoom, diff);
      nextCook += addCook;
      nextPrep = clamp(nextTotal - nextCook, timeRanges.minPrepTime, timeRanges.maxPrepTime);
    }
    if (diff < 0) {
      const cookRemovable = nextCook - timeRanges.minCookTime;
      const removeCook = Math.min(cookRemovable, Math.abs(diff));
      nextCook -= removeCook;
      nextPrep = clamp(nextTotal - nextCook, timeRanges.minPrepTime, timeRanges.maxPrepTime);
    }

    setMaxPrepTime(nextPrep);
    setMaxCookTime(nextCook);
    setTotalTime(nextPrep + nextCook);
  }, [maxPrepTime, maxCookTime, timeRanges]);

  const handlePrepTimeChange = (value: number) => {
    const nextPrep = clamp(value, timeRanges.minPrepTime, timeRanges.maxPrepTime);
    setMaxPrepTime(nextPrep);
    setTotalTime(nextPrep + maxCookTime);
  };

  const handleCookTimeChange = (value: number) => {
    const nextCook = clamp(value, timeRanges.minCookTime, timeRanges.maxCookTime);
    setMaxCookTime(nextCook);
    setTotalTime(maxPrepTime + nextCook);
  };

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setMaxPrepTime(timeRanges.maxPrepTime);
    setMaxCookTime(timeRanges.maxCookTime);
    setTotalTime(timeRanges.maxPrepTime + timeRanges.maxCookTime);
    setSelectedDifficulty(null);
    setSearchResults([]);
    setShowSearchResults(false);
    setIsSearchUiFocused(false);
    setSearchParams(new URLSearchParams(), { replace: true });
    sessionStorage.removeItem(HOME_VIEW_STATE_KEY);
  }, [timeRanges.maxPrepTime, timeRanges.maxCookTime, setSearchParams]);

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

  const handleTagSectionClick = (tag: string) => {
    setSearchTerm(tag);
    setSelectedDifficulty(null);
    setShowSearchResults(true);
    setIsSearchUiFocused(true);
    window.scrollTo(0, 0);
  };

  const showExpandedSearchUi = isSearchUiFocused || showSearchResults;

  const visibleSearchRecipes = getFullRowItems(searchResults, containerWidth);
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
            />
            <button className="hero-search-btn" onClick={() => void runSearch()}>Search</button>
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
                <label htmlFor="prep-time">Prep Time (max)</label>
                <span>{timeRanges.minPrepTime} - {timeRanges.maxPrepTime} min</span>
              </div>
              <div className="time-input-row">
                <input
                  id="prep-time"
                  className="time-input"
                  type="number"
                  min={timeRanges.minPrepTime}
                  max={timeRanges.maxPrepTime}
                  value={maxPrepTime}
                  onChange={(e) => handlePrepTimeChange(Number(e.target.value))}
                />
                <input
                  className="time-slider"
                  type="range"
                  min={timeRanges.minPrepTime}
                  max={timeRanges.maxPrepTime}
                  value={maxPrepTime}
                  onChange={(e) => handlePrepTimeChange(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="time-input-group">
              <div className="time-input-head">
                <label htmlFor="cook-time">Cook Time (max)</label>
                <span>{timeRanges.minCookTime} - {timeRanges.maxCookTime} min</span>
              </div>
              <div className="time-input-row">
                <input
                  id="cook-time"
                  className="time-input"
                  type="number"
                  min={timeRanges.minCookTime}
                  max={timeRanges.maxCookTime}
                  value={maxCookTime}
                  onChange={(e) => handleCookTimeChange(Number(e.target.value))}
                />
                <input
                  className="time-slider"
                  type="range"
                  min={timeRanges.minCookTime}
                  max={timeRanges.maxCookTime}
                  value={maxCookTime}
                  onChange={(e) => handleCookTimeChange(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="time-input-group total-time-group">
              <div className="time-input-head">
                <label htmlFor="total-time">Total Time (prep + cook)</label>
                <span>
                  {timeRanges.minPrepTime + timeRanges.minCookTime} - {timeRanges.maxPrepTime + timeRanges.maxCookTime} min
                </span>
              </div>
              <div className="time-input-row total-row">
                <input
                  id="total-time"
                  className="time-input"
                  type="number"
                  min={timeRanges.minPrepTime + timeRanges.minCookTime}
                  max={timeRanges.maxPrepTime + timeRanges.maxCookTime}
                  value={totalTime}
                  onChange={(e) => distributeTotalTime(Number(e.target.value))}
                />
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
          {carouselRecipes.map((r) => (
            <motion.div
              key={r.recipeid}
              whileHover={{ scale: 1.05, boxShadow: "0 8px 32px #fff2" }}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{ minWidth: 260, maxWidth: 260, height: 320, position: "relative", borderRadius: 16, overflow: "hidden", margin: "0 0", background: "#222", display: "flex", alignItems: "flex-end", justifyContent: "center", touchAction: "none", cursor: "pointer" }}
              onMouseDown={(e) => {
                (e.currentTarget as any).__holdStartTime = Date.now();
              }}
              onClick={(e) => {
                // Check if mouse was held for more than 200ms
                const holdTime = Date.now() - ((e.currentTarget as any).__holdStartTime || 0);
                if (holdTime < 200) {
                  void trackRecipeClick(r.recipeid);
                  navigate(`/recipes/${r.recipeid}`);
                }
              }}
            >
              <img
                src={r.image_url || "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg"}
                alt={r.title}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
                draggable={false}
              />
              <div style={{ position: "absolute", top: 0, left: 0, width: "100%", padding: "8px", display: "flex", flexWrap: "wrap", gap: "4px", pointerEvents: "none" }}>
                {r.difficulty && (
                  <span style={{ background: r.difficulty === "EASY" ? "#4ade80" : r.difficulty === "MEDIUM" ? "#fbbf24" : "#f87171", color: "#000", fontSize: "11px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", textTransform: "uppercase" }}>{r.difficulty}</span>
                )}
                {r.tags && r.tags.slice(0, 2).map((tag) => (
                  <span key={tag} style={{ background: "#333", color: "#fff", fontSize: "10px", padding: "2px 6px", borderRadius: "4px" }}>{tag}</span>
                ))}
              </div>
              <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", background: "rgba(0,0,0,0.6)", color: "#fff", fontFamily: "monospace", fontWeight: 600, fontSize: 20, padding: "12px 0", textAlign: "center", pointerEvents: "none" }}>{r.title}</div>
            </motion.div>
          ))}
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
      </div>
      <div ref={gridContainerRef} className="recipe-grid-container">
        {loading || isSearching ? (
          <p className="recipe-grid-loading">Loading recipes...</p>
        ) : showSearchResults ? (
          visibleSearchRecipes.length === 0 ? (
            <p className="recipe-grid-loading">No recipes found for the current search and filters</p>
          ) : (
            <div className="recipe-grid">
              {visibleSearchRecipes.map(r => (
                <motion.div
                  key={r.recipeid}
                  className="recipe-card"
                  onClick={() => navigate(`/recipes/${r.recipeid}`)}
                  whileHover={{ scale: 1.03, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="recipe-card-img-wrap">
                    <img
                      src={r.image_url || "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg"}
                      alt={r.title}
                      className="recipe-card-img"
                      loading="lazy"
                      decoding="async"
                    />
                    {r.difficulty && (
                      <span className={`recipe-card-badge badge-${r.difficulty.toLowerCase()}`}>
                        {r.difficulty}
                      </span>
                    )}
                  </div>
                  <div className="recipe-card-body">
                    <h3 className="recipe-card-title">{r.title}</h3>
                    {r.description && (
                      <p className="recipe-card-desc">{r.description}</p>
                    )}
                    <div className="recipe-card-meta">
                      {r.proptimemin != null && (
                        <span className="recipe-card-meta-item">🥣 Prep {r.proptimemin} min</span>
                      )}
                      {r.cooktimemin != null && (
                        <span className="recipe-card-meta-item">🕐 {r.cooktimemin} min</span>
                      )}
                      {r.servings != null && (
                        <span className="recipe-card-meta-item">🍽️ {r.servings} servings</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
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
                  {section.recipes.map((r) => (
                    <motion.div
                      key={`${section.tag}-${r.recipeid}`}
                      className="recipe-card"
                      onClick={() => navigate(`/recipes/${r.recipeid}`)}
                      whileHover={{ scale: 1.03, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35 }}
                    >
                      <div className="recipe-card-img-wrap">
                        <img
                          src={r.image_url || "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg"}
                          alt={r.title}
                          className="recipe-card-img"
                          loading="lazy"
                          decoding="async"
                        />
                        {r.difficulty && (
                          <span className={`recipe-card-badge badge-${r.difficulty.toLowerCase()}`}>
                            {r.difficulty}
                          </span>
                        )}
                      </div>
                      <div className="recipe-card-body">
                        <h3 className="recipe-card-title">{r.title}</h3>
                        {r.description && (
                          <p className="recipe-card-desc">{r.description}</p>
                        )}
                        <div className="recipe-card-meta">
                          {r.proptimemin != null && (
                            <span className="recipe-card-meta-item">🥣 Prep {r.proptimemin} min</span>
                          )}
                          {r.cooktimemin != null && (
                            <span className="recipe-card-meta-item">🕐 {r.cooktimemin} min</span>
                          )}
                          {r.servings != null && (
                            <span className="recipe-card-meta-item">🍽️ {r.servings} servings</span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
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
  const [isHolding, setIsHolding] = useState(false);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const xAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const buttonHoldStartRef = useRef<number | null>(null);
  const didContinuousScrollRef = useRef(false);

  const syncScrollState = (position: number, dragLimit: number = maxDrag) => {
    const edgeTolerance = 0.5;
    setCanScrollLeft(position < -edgeTolerance);
    setCanScrollRight(position > -dragLimit + edgeTolerance);
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
      duration: isHolding ? 0 : 0.2,
      ease: "easeOut",
      onUpdate: (latest) => {
        syncScrollState(latest);
      },
      onComplete: () => {
        xAnimationRef.current = null;
      },
    });
  };

  const startContinuousScroll = (direction: "left" | "right") => {
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);

    buttonHoldStartRef.current = Date.now();
    didContinuousScrollRef.current = false;
    
    setIsHolding(true);
    
    scrollIntervalRef.current = setInterval(() => {
      didContinuousScrollRef.current = true;
      const distance = direction === "right" ? -90 : 90;
      scrollBy(distance);
    }, 35);
  };

  const stopContinuousScroll = () => {
    setIsHolding(false);
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  const handleButtonClick = (direction: "left" | "right") => {
    const holdDuration = buttonHoldStartRef.current ? Date.now() - buttonHoldStartRef.current : 0;
    const wasHoldInteraction = didContinuousScrollRef.current || holdDuration >= 140;

    buttonHoldStartRef.current = null;
    didContinuousScrollRef.current = false;

    if (wasHoldInteraction) return;

    if (direction === "left" && canScrollLeft) {
      scrollBy(340);
    }
    if (direction === "right" && canScrollRight) {
      scrollBy(-340);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(recalculate, 50);
    window.addEventListener("resize", recalculate);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", recalculate);
      stopContinuousScroll();
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
          dragElastic={0.08}
          dragPropagation={false}
          onDrag={() => {
            syncScrollState(x.get());
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
        onMouseDown={() => canScrollLeft && startContinuousScroll("left")}
        onMouseUp={stopContinuousScroll}
        onMouseLeave={stopContinuousScroll}
        onClick={() => handleButtonClick("left")}
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
        onMouseDown={() => canScrollRight && startContinuousScroll("right")}
        onMouseUp={stopContinuousScroll}
        onMouseLeave={stopContinuousScroll}
        onClick={() => handleButtonClick("right")}
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