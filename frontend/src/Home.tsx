import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
  difficulty: string | null;
  cooktimemin: number | null;
  servings: number | null;
}

const recipesSet1 = [
  { id: 1, title: "Blueberry Pancakes", image: "https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg" },
  { id: 2, title: "Grilled Salmon", image: "https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg" },
  { id: 3, title: "Caesar Salad", image: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg" },
  { id: 4, title: "Beef Burger", image: "https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg" },
  { id: 5, title: "Chicken Curry", image: "https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg" },
  { id: 6, title: "Margarita Pizza", image: "https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg" },
  { id: 7, title: "Egg Fried Rice", image: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg" },
  { id: 8, title: "Greek Salad", image: "https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg" },
  { id: 9, title: "Tiramisu", image: "https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg" },
  { id: 10, title: "Pasta Carbonara", image: "https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg" },
  { id: 11, title: "French Toast", image: "https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg" },
  { id: 12, title: "Fish Tacos", image: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg" },
  { id: 13, title: "Veggie Pizza", image: "https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg" },
  { id: 14, title: "Chicken Alfredo", image: "https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg" },
  { id: 15, title: "Steak Frites", image: "https://images.pexels.com/photos/461382/pexels-photo-461382.jpeg" },
  { id: 16, title: "Caprese Salad", image: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg" },
];

const CARD_MIN_WIDTH = 260;
const GRID_GAP = 32;
const GRID_PADDING = 32;

/** Calculate how many columns fit and trim to full rows only */
function getFullRowItems(items: RecipeFromDB[], containerWidth: number): RecipeFromDB[] {
  if (containerWidth <= 0 || items.length === 0) return items;
  const available = containerWidth - GRID_PADDING * 2;
  const cols = Math.max(1, Math.floor((available + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP)));
  const fullRowCount = Math.floor(items.length / cols) * cols;
  return items.slice(0, fullRowCount || cols); // at least 1 row
}

function Home() {
  const navigate = useNavigate();
  const [dbRecipes, setDbRecipes] = useState<RecipeFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    fetch("/api/recipes")
      .then(r => r.json())
      .then(data => { setDbRecipes(data.recipes || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
  useEffect(() => { handleResize(); }, [dbRecipes, handleResize]);

  const visibleRecipes = getFullRowItems(dbRecipes, containerWidth);

  return (
    <div className="home-page">

      {/* ===== HERO HEADER ===== */}
      <header className="hero-header">
        <div className="hero-bg">
          <img
            src="https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1920"
            alt="Delicious food background"
          />
        </div>
        <div className="hero-overlay" />
        <div className="hero-content">
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            🍳 Over 1,000 Free Recipes
          </motion.div>

          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
          >
            Cook Something <span className="accent">Incredible</span> Today
          </motion.h1>

          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
          >
            Discover chef-curated recipes from around the world. From quick weeknight dinners to show-stopping desserts — find your next favorite meal.
          </motion.p>

          <motion.div
            className="hero-search"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <span className="hero-search-icon">🔍</span>
            <input type="text" placeholder="Search for recipes, ingredients, cuisines..." />
            <button className="hero-search-btn">Search</button>
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
              <div className="hero-stat-label">Happy Cooks</div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ===== RECIPE SECTIONS ===== */}
      <div style={{ width: "100%", padding: "16px 0 0" }}>
        <h2 className="section-heading">Trending Recipes</h2>
        <p className="section-subheading">Drag to explore what's popular right now</p>
      </div>
      <Carousel>
        {recipesSet1.map(r => (
          <motion.div
            key={r.id}
            whileHover={{ scale: 1.05, boxShadow: "0 8px 32px #fff2" }}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ minWidth: 260, maxWidth: 260, height: 320, position: "relative", borderRadius: 16, overflow: "hidden", margin: "0 0", background: "#222", display: "flex", alignItems: "flex-end", justifyContent: "center", touchAction: "none" }}
          >
            <img
              src={r.image}
              alt={r.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
              draggable={false}
            />
            <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", background: "rgba(0,0,0,0.6)", color: "#fff", fontFamily: "monospace", fontWeight: 600, fontSize: 20, padding: "12px 0", textAlign: "center", pointerEvents: "none" }}>{r.title}</div>
          </motion.div>
        ))}
      </Carousel>

      {/* Database-driven grid for Explore All Recipes */}
      <div style={{ width: "100%", padding: "16px 0 0" }}>
        <h2 className="section-heading">Explore All Recipes</h2>
        <p className="section-subheading">Fresh from our kitchen database</p>
      </div>
      <div ref={gridContainerRef} className="recipe-grid-container">
        {loading ? (
          <p className="recipe-grid-loading">Loading recipes...</p>
        ) : visibleRecipes.length === 0 ? (
          <p className="recipe-grid-loading">No recipes found</p>
        ) : (
          <div className="recipe-grid">
            {visibleRecipes.map(r => (
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
        )}
      </div>
    </div>
  );
}

function Carousel({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [maxDrag, setMaxDrag] = useState(0);

  const recalculate = () => {
    if (containerRef.current && trackRef.current) {
      const trackWidth = trackRef.current.scrollWidth;
      const containerWidth = containerRef.current.offsetWidth;
      setMaxDrag(Math.max(0, trackWidth - containerWidth));
    }
  };

  useEffect(() => {
    const timeout = setTimeout(recalculate, 50);
    window.addEventListener("resize", recalculate);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", recalculate);
    };
  }, [children]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", maxWidth: "100%", overflow: "hidden", padding: "32px 0", boxSizing: "border-box" }}
    >
      <motion.div
        ref={trackRef}
        style={{ display: "flex", gap: 32, cursor: "grab", padding: "8px 32px", width: "max-content", userSelect: "none" }}
        drag="x"
        dragConstraints={{ left: -maxDrag, right: 0 }}
        whileTap={{ cursor: "grabbing" }}
        dragMomentum={true}
        dragTransition={{ bounceStiffness: 300, bounceDamping: 30, power: 0.3, timeConstant: 400 }}
        dragElastic={0.08}
        dragPropagation={false}
        onPointerDownCapture={(e) => {
          // Prevent child elements from stealing the pointer so drag works on cards too
          const target = e.target as HTMLElement;
          if (target.tagName === "IMG") {
            e.preventDefault();
          }
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export default Home;