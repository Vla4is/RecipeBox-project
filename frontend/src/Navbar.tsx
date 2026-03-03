import { Link } from "react-router-dom";
import "./App.css";

export default function Navbar({ loggedIn, onLogout }: { loggedIn: boolean; onLogout: () => void }) {
  return (
    <nav className="navbar">
      <Link to="/" className="navbar-link" style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>
        🍽️ RecipeBox
      </Link>
      <span className="navbar-spacer" />
      <Link to="/" className="navbar-link">Home</Link>
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
