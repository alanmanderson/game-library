import { useState, useCallback, useEffect, useRef } from "react";
import type { Player } from "../types/game";
import {
  register,
  login,
  createGuest,
  googleAuth,
  setStoredToken,
} from "../services/api";
import "./styles/AuthModal.css";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

function loadGoogleGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google GSI'));
    document.head.appendChild(script);
  });
}

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

  // Focus trap
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        return;
      }
      if (e.key !== 'Tab') return;
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener('keydown', handleKeyDown);
    return () => modal.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        onAuthenticated(result.player);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Registration failed.");
      } finally {
        setLoading(false);
      }
    },
    [regNickname, regEmail, regPassword, onAuthenticated],
  );

  // Google Sign-In
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const handleGoogleCredential = useCallback(
    async (response: { credential: string }) => {
      setLoading(true);
      setError(null);
      try {
        const result = await googleAuth(response.credential);
        setStoredToken(result.token);
        onAuthenticated(result.player);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed.");
      } finally {
        setLoading(false);
      }
    },
    [onAuthenticated],
  );

  useEffect(() => {
    let cancelled = false;

    const tryInit = () => {
      if (cancelled) return;
      if (window.google && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: (window as unknown as Record<string, string>).__GOOGLE_CLIENT_ID__ || import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
          callback: handleGoogleCredential,
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "filled_blue",
          size: "large",
          width: "100%",
          text: "signin_with",
        });
      }
    };

    loadGoogleGsi()
      .then(() => tryInit())
      .catch(() => {
        // Google GSI failed to load; Google sign-in will be unavailable
      });

    return () => { cancelled = true; };
  }, [handleGoogleCredential]);

  const handleGuest = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = guestNickname.trim();
      if (!trimmed) {
        setError("Please enter a nickname.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await createGuest(trimmed);
        setStoredToken(result.token);
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
    <div className="auth-overlay" role="dialog" aria-modal="true" ref={modalRef}>
      <div className="auth-modal">
        <svg
          className="auth-logo"
          role="img"
          aria-label="GammonHub"
          viewBox="0 0 80 44"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Die 1 — showing 4 */}
          <rect x="2" y="2" width="36" height="36" rx="6" ry="6" fill="#1a1a2e" stroke="#d4a843" strokeWidth="2.5"/>
          <circle cx="14" cy="14" r="3.5" fill="#d4a843"/>
          <circle cx="26" cy="14" r="3.5" fill="#d4a843"/>
          <circle cx="14" cy="26" r="3.5" fill="#d4a843"/>
          <circle cx="26" cy="26" r="3.5" fill="#d4a843"/>
          {/* Die 2 — showing 3, offset right and down */}
          <rect x="42" y="6" width="36" height="36" rx="6" ry="6" fill="#1a1a2e" stroke="#d4a843" strokeWidth="2.5"/>
          <circle cx="54" cy="18" r="3.5" fill="#d4a843"/>
          <circle cx="60" cy="24" r="3.5" fill="#d4a843"/>
          <circle cx="66" cy="30" r="3.5" fill="#d4a843"/>
        </svg>
        <h2>Welcome to GammonHub</h2>

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
              aria-label="Email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              aria-label="Password"
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
              aria-label="Nickname"
              value={regNickname}
              onChange={(e) => setRegNickname(e.target.value)}
              maxLength={50}
              disabled={loading}
              autoFocus
            />
            <input
              type="email"
              placeholder="Email"
              aria-label="Email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              aria-label="Password"
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

        {/* Google Sign-In */}
        <div ref={googleBtnRef} className="google-signin-btn" />

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
            aria-label="Nickname"
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
