import { useState, useCallback } from "react";
import type { Player } from "../types/game";
import {
  register,
  login,
  createGuest,
  setStoredToken,
} from "../services/api";
import "./styles/AuthModal.css";

type AuthTab = "signin" | "register";

interface AuthModalProps {
  onAuthenticated: (player: Player) => void;
}

function AuthModal({ onAuthenticated }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sign In fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [regNickname, setRegNickname] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  // Guest fields
  const [guestNickname, setGuestNickname] = useState("");

  const handleSignIn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!loginEmail.trim() || !loginPassword) {
        setError("Please enter your email and password.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await login(loginEmail.trim(), loginPassword);
        setStoredToken(result.token);
        localStorage.setItem("backgammon_player", JSON.stringify(result.player));
        onAuthenticated(result.player);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed.");
      } finally {
        setLoading(false);
      }
    },
    [loginEmail, loginPassword, onAuthenticated],
  );

  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedNick = regNickname.trim();
      const trimmedEmail = regEmail.trim();

      if (!trimmedNick || !trimmedEmail || !regPassword) {
        setError("Please fill in all fields.");
        return;
      }
      if (trimmedNick.length < 2) {
        setError("Nickname must be at least 2 characters.");
        return;
      }
      if (regPassword.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await register(trimmedEmail, regPassword, trimmedNick);
        setStoredToken(result.token);
        localStorage.setItem("backgammon_player", JSON.stringify(result.player));
        onAuthenticated(result.player);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Registration failed.");
      } finally {
        setLoading(false);
      }
    },
    [regNickname, regEmail, regPassword, onAuthenticated],
  );

  const handleGuest = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = guestNickname.trim();
      if (!trimmed) {
        setError("Please enter a nickname.");
        return;
      }
      if (trimmed.length < 1) {
        setError("Nickname must not be empty.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await createGuest(trimmed);
        setStoredToken(result.token);
        localStorage.setItem("backgammon_player", JSON.stringify(result.player));
        onAuthenticated(result.player);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create guest.");
      } finally {
        setLoading(false);
      }
    },
    [guestNickname, onAuthenticated],
  );

  return (
    <div className="auth-overlay">
      <div className="auth-modal">
        <h2>Welcome to Backgammon</h2>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${activeTab === "signin" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("signin");
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${activeTab === "register" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("register");
              setError(null);
            }}
          >
            Register
          </button>
        </div>

        {/* Sign In Form */}
        {activeTab === "signin" && (
          <form onSubmit={handleSignIn} className="auth-form">
            <input
              type="email"
              placeholder="Email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="auth-btn primary" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        {/* Register Form */}
        {activeTab === "register" && (
          <form onSubmit={handleRegister} className="auth-form">
            <input
              type="text"
              placeholder="Nickname"
              value={regNickname}
              onChange={(e) => setRegNickname(e.target.value)}
              maxLength={50}
              disabled={loading}
              autoFocus
            />
            <input
              type="email"
              placeholder="Email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="auth-btn primary" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}

        {/* Divider */}
        <div className="auth-divider">
          <span>or</span>
        </div>

        {/* Guest Mode */}
        <form onSubmit={handleGuest} className="auth-form guest-form">
          <p className="guest-text">Play without an account (stats will not be saved)</p>
          <input
            type="text"
            placeholder="Guest nickname"
            value={guestNickname}
            onChange={(e) => setGuestNickname(e.target.value)}
            maxLength={50}
            disabled={loading}
          />
          <button type="submit" className="auth-btn secondary" disabled={loading}>
            {loading ? "Creating..." : "Continue as Guest"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthModal;
