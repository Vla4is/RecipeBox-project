import "./App.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        {/* Brand */}
        <div className="footer-brand">
          <h3 className="footer-brand-name">🍽️ RecipeBox</h3>
          <p className="footer-brand-desc">
            Your go-to destination for chef-curated recipes from around the world.
            Cook with confidence, share with love.
          </p>
          <div className="footer-socials">
            <a href="#" className="footer-social-link" aria-label="Facebook">f</a>
            <a href="#" className="footer-social-link" aria-label="Instagram">📷</a>
            <a href="#" className="footer-social-link" aria-label="Twitter">𝕏</a>
            <a href="#" className="footer-social-link" aria-label="YouTube">▶</a>
          </div>
        </div>

        {/* Quick Links */}
        <div className="footer-col">
          <h4 className="footer-col-title">Explore</h4>
          <ul>
            <li><a href="#">Popular Recipes</a></li>
            <li><a href="#">Latest Additions</a></li>
            <li><a href="#">Meal Planning</a></li>
            <li><a href="#">Cooking Tips</a></li>
            <li><a href="#">Video Tutorials</a></li>
          </ul>
        </div>

        {/* Categories */}
        <div className="footer-col">
          <h4 className="footer-col-title">Categories</h4>
          <ul>
            <li><a href="#">Breakfast</a></li>
            <li><a href="#">Lunch & Dinner</a></li>
            <li><a href="#">Desserts</a></li>
            <li><a href="#">Vegan & Vegetarian</a></li>
            <li><a href="#">Quick & Easy</a></li>
          </ul>
        </div>

        {/* Newsletter */}
        <div className="footer-newsletter">
          <h4 className="footer-newsletter-title">Stay Inspired</h4>
          <p className="footer-newsletter-desc">
            Get weekly recipes, cooking tips, and exclusive content delivered to your inbox.
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
          © {new Date().getFullYear()} RecipeBox. Made with <span className="heart">♥</span> for food lovers everywhere.
        </p>
        <div className="footer-bottom-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Contact Us</a>
        </div>
      </div>
    </footer>
  );
}
