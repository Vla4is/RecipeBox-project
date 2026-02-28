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

export default function AppRouter() {
  // Persist login state in localStorage
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("jwt_token");
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
            <AddRecipe token={token!} />
          </RequireAuth>
        } />
        <Route path="/recipes/:recipeId" element={<RecipeDetails />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
