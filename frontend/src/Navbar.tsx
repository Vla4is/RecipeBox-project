import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";

export default function Navbar({ loggedIn, onLogout }: { loggedIn: boolean; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    // Keep menu state predictable after route changes.
    setIsMenuOpen(false);
  }, [location.pathname, location.search]);

  const goHomeAndReset = () => {
    setIsMenuOpen(false);
    navigate("/", {
      state: { resetHome: true, resetAt: Date.now() },
    });
  };

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <nav className={`navbar ${isMenuOpen ? "navbar-mobile-open" : ""}`}>
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
        <button
          type="button"
          onClick={goHomeAndReset}
          className="navbar-link navbar-link-btn"
        >
          Home
        </button>

        {!loggedIn && <Link to="/register" className="navbar-link" onClick={closeMenu}>Register</Link>}
        {!loggedIn && <Link to="/login" className="navbar-link" onClick={closeMenu}>Login</Link>}
        {loggedIn && <Link to="/my-recipes" className="navbar-link" onClick={closeMenu}>My Recipes</Link>}
        {loggedIn && <Link to="/add-recipe" className="navbar-link" onClick={closeMenu}>Add Recipe</Link>}
        {loggedIn && (
          <button
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
    </nav>
  );
}
