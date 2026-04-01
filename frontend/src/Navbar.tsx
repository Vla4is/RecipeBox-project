import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";

export default function Navbar({ loggedIn, onLogout }: { loggedIn: boolean; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    // Keep menu state predictable after route changes.
    setIsMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 24);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Check if user is premium
    if (loggedIn) {
      const token = localStorage.getItem("jwt_token");
      if (token) {
        fetch("/api/subscription/status", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data) => setIsPremium(data.isPremium || false))
          .catch(() => setIsPremium(false));
      }
    }
  }, [loggedIn]);

  const goHomeAndReset = () => {
    setIsMenuOpen(false);
    navigate("/", {
      state: { resetHome: true, resetAt: Date.now() },
    });
  };

  const closeMenu = () => setIsMenuOpen(false);

  const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `navbar-link${isActive ? " navbar-link-active" : ""}`;

  const handleBecomePremium = () => {
    closeMenu();
    if (!loggedIn) {
      // Redirect non-logged-in users to signup with premium indicator
      navigate("/register", { state: { showPremium: true } });
    } else {
      // Logged-in users go to premium management page (we'll create this next)
      navigate("/premium");
    }
  };

  return (
    <nav className={`navbar ${isMenuOpen ? "navbar-mobile-open" : ""}${isScrolled ? " navbar-scrolled" : ""}`}>
      <button
        type="button"
        onClick={goHomeAndReset}
        className="navbar-brand"
      >
        🍽️ RecipeBox
      </button>

      <button
        type="button"
        className="navbar-menu-toggle"
        aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        {isMenuOpen ? "✕" : "☰"}
      </button>

      <div className={`navbar-items ${isMenuOpen ? "navbar-items-open" : ""}`}>
        <div className="navbar-primary">
          <button
            type="button"
            onClick={goHomeAndReset}
            className={`navbar-link navbar-link-btn${
              location.pathname === "/" ? " navbar-link-active" : ""
            }`}
          >
            Home
          </button>

          {!loggedIn && (
            <NavLink to="/register" className={navLinkClassName} onClick={closeMenu}>
              Register
            </NavLink>
          )}
          {!loggedIn && (
            <NavLink to="/login" className={navLinkClassName} onClick={closeMenu}>
              Login
            </NavLink>
          )}
          {loggedIn && (
            <NavLink to="/my-recipes" className={navLinkClassName} onClick={closeMenu}>
              My Recipes
            </NavLink>
          )}
          {loggedIn && (
            <NavLink to="/add-recipe" className={navLinkClassName} onClick={closeMenu}>
              Add Recipe
            </NavLink>
          )}
        </div>

        <div className="navbar-actions">
          <button
            type="button"
            onClick={handleBecomePremium}
            className={`navbar-premium-btn ${isPremium ? "navbar-premium-btn-active" : ""}`}
            title={isPremium ? "Manage your premium subscription" : "Become a premium member"}
          >
            {isPremium ? "Premium" : "Become Premium"}
          </button>

          {loggedIn && (
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onLogout();
              }}
              className="navbar-logout"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
