import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
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
import { getTokenExpiryMs, isTokenExpired } from "./auth";

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
        <Route path="/edit-recipe/:recipeId" element={
          <RequireAuth loggedIn={!!token}>
            <EditRecipe token={token!} onUnauthorized={handleLogout} />
          </RequireAuth>
        } />
        <Route path="/recipes/:recipeId" element={<RecipeDetails />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
