import { Link, useNavigate } from "react-router-dom";
import "./App.css";

export default function Navbar({ loggedIn, onLogout }: { loggedIn: boolean; onLogout: () => void }) {
  const navigate = useNavigate();

  const goHomeAndReset = () => {
    navigate("/", {
      state: { resetHome: true, resetAt: Date.now() },
    });
  };

  return (
    <nav className="navbar">
      <button
        type="button"
        onClick={goHomeAndReset}
        className="navbar-link"
        style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        🍽️ RecipeBox
      </button>
      <span className="navbar-spacer" />
      <button
        type="button"
        onClick={goHomeAndReset}
        className="navbar-link"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        Home
      </button>
      {!loggedIn && <Link to="/register" className="navbar-link">Register</Link>}
      {!loggedIn && <Link to="/login" className="navbar-link">Login</Link>}
      {loggedIn && <Link to="/my-recipes" className="navbar-link">My Recipes</Link>}
      {loggedIn && <Link to="/add-recipe" className="navbar-link">Add Recipe</Link>}
      {loggedIn && (
        <button
          onClick={onLogout}
          className="navbar-logout"
        >
          Logout
        </button>
      )}
    </nav>
  );
}
