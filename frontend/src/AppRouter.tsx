import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import Home from "./Home";
import RegistrationForm from "./RegistrationForm";
import LoginForm from "./LoginForm";
import Navbar from "./Navbar";
import Footer from "./Footer";
import RequireLoggedOut from "./RequireLoggedOut";
import RequireAuth from "./RequireAuth";
import AddRecipe from "./AddRecipe";
import RecipeDetails from "./RecipeDetails";
import MyRecipes from "./MyRecipes";
import EditRecipe from "./EditRecipe";
import Premium from "./Premium";
import Billing from "./Billing";
import MyProfile from "./MyProfile";
import PublicProfile from "./PublicProfile";
import { getTokenExpiryMs, isTokenExpired } from "./auth";

const SCROLL_POSITIONS_KEY = "itsystems_scroll_positions_v1";

function ScrollRestorationManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positionsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const raw = sessionStorage.getItem(SCROLL_POSITIONS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (parsed && typeof parsed === "object") {
        positionsRef.current = parsed;
      }
    } catch {
      positionsRef.current = {};
    }
  }, []);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const positionKey = location.key || `${location.pathname}${location.search}${location.hash}`;

    if (navigationType === "POP") {
      const targetY = positionsRef.current[positionKey] ?? 0;
      let attempt = 0;
      const maxAttempts = 12;
      const restore = () => {
        window.scrollTo(0, targetY);
        attempt += 1;
        const pageHeight = document.documentElement.scrollHeight;
        const canReachTarget = pageHeight >= targetY + window.innerHeight;
        if (!canReachTarget && attempt < maxAttempts) {
          window.setTimeout(restore, 50);
        }
      };
      restore();
    } else if (navigationType === "PUSH") {
      window.scrollTo(0, 0);
    }

    return () => {
      positionsRef.current[positionKey] = window.scrollY;
      sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positionsRef.current));
    };
  }, [location.key, location.pathname, location.search, location.hash, navigationType]);

  return null;
}

export default function AppRouter() {
  // Persist login state in localStorage
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem("jwt_token");
    if (!stored) return null;
    return isTokenExpired(stored) ? null : stored;
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem("jwt_token", token);
    } else {
      localStorage.removeItem("jwt_token");
    }
  }, [token]);

  const handleLogin = (jwt: string) => {
    setToken(jwt);
  };
  const handleLogout = () => {
    setToken(null);
  };

  useEffect(() => {
    if (!token) return;

    const expiryMs = getTokenExpiryMs(token);
    if (expiryMs == null || expiryMs <= Date.now()) {
      setToken(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      setToken(null);
    }, expiryMs - Date.now());

    return () => window.clearTimeout(timeout);
  }, [token]);

  return (
    <BrowserRouter>
      <ScrollRestorationManager />
      <Navbar loggedIn={!!token} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={
          <RequireLoggedOut loggedIn={!!token}>
            <RegistrationForm />
          </RequireLoggedOut>
        } />
        <Route path="/login" element={
          <RequireLoggedOut loggedIn={!!token}>
            <LoginForm onLogin={handleLogin} />
          </RequireLoggedOut>
        } />
        <Route path="/add-recipe" element={
          <RequireAuth loggedIn={!!token}>
            <AddRecipe token={token!} onUnauthorized={handleLogout} />
          </RequireAuth>
        } />
        <Route path="/my-recipes" element={
          <RequireAuth loggedIn={!!token}>
            <MyRecipes token={token!} onUnauthorized={handleLogout} />
          </RequireAuth>
        } />
        <Route path="/my-profile" element={
          <RequireAuth loggedIn={!!token}>
            <MyProfile token={token!} onUnauthorized={handleLogout} />
          </RequireAuth>
        } />
        <Route path="/edit-recipe/:recipeId" element={
          <RequireAuth loggedIn={!!token}>
            <EditRecipe token={token!} onUnauthorized={handleLogout} />
          </RequireAuth>
        } />
        <Route path="/premium" element={
          <RequireAuth loggedIn={!!token}>
            <Premium />
          </RequireAuth>
        } />
        <Route path="/billing" element={
          <RequireAuth loggedIn={!!token}>
            <Billing />
          </RequireAuth>
        } />
        <Route path="/recipes/:recipeId" element={<RecipeDetails />} />
        <Route path="/:nickname" element={<PublicProfile />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
