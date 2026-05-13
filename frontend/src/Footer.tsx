import { Link } from "react-router-dom";
import "./App.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-brand">
          <h3 className="footer-brand-name">RecipeBox</h3>
          <p className="footer-brand-desc">
            Discover community recipes, save favorites, publish your own dishes, and find practical ideas for the
            food you already want to cook.
          </p>
          <div className="footer-socials">
            <Link to="/" className="footer-social-link" aria-label="Browse recipes">R</Link>
            <Link to="/?q=dinner" className="footer-social-link" aria-label="Dinner ideas">D</Link>
            <Link to="/?difficulty=EASY" className="footer-social-link" aria-label="Easy recipes">E</Link>
            <a href="mailto:support@recipebox.local" className="footer-social-link" aria-label="Email support">@</a>
          </div>
        </div>

        <div className="footer-col">
          <h4 className="footer-col-title">Explore</h4>
          <ul>
            <li><Link to="/">Browse Recipes</Link></li>
            <li><Link to="/?q=turkish">Turkish Recipes</Link></li>
            <li><Link to="/?q=pasta">Pasta Recipes</Link></li>
            <li><Link to="/?q=salad">Salads</Link></li>
            <li><Link to="/?q=mexican">Mexican Recipes</Link></li>
          </ul>
        </div>

        <div className="footer-col">
          <h4 className="footer-col-title">Find Recipes</h4>
          <ul>
            <li><Link to="/?q=breakfast">Breakfast</Link></li>
            <li><Link to="/?q=dinner">Dinner Ideas</Link></li>
            <li><Link to="/?q=dessert">Desserts</Link></li>
            <li><Link to="/?dietType=VEGAN">Vegan</Link></li>
            <li><Link to="/?difficulty=EASY">Easy Recipes</Link></li>
          </ul>
        </div>

        <div className="footer-newsletter">
          <h4 className="footer-newsletter-title">Stay Connected</h4>
          <p className="footer-newsletter-desc">
            Get community recipe highlights and cooking ideas. This demo form is kept local for now.
          </p>
          <form className="footer-newsletter-form" onSubmit={(e) => e.preventDefault()}>
            <input
              className="footer-newsletter-input"
              type="email"
              placeholder="Your email address"
            />
            <button className="footer-newsletter-btn" type="submit">Subscribe</button>
          </form>
        </div>
      </div>

      <hr className="footer-divider" />

      <div className="footer-bottom">
        <p className="footer-copy">
          © {new Date().getFullYear()} RecipeBox. Built for home cooks and shared kitchen inspiration.
        </p>
        <div className="footer-bottom-links">
          <Link to="/">Browse</Link>
          <Link to="/?dietType=VEGETARIAN">Vegetarian</Link>
          <a href="mailto:support@recipebox.local">Contact</a>
        </div>
      </div>
    </footer>
  );
}
