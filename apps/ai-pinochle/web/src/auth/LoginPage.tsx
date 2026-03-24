import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { type FormEvent, useState } from "react";
import type { AuthResponse } from "@pinochle/shared";
import { ApiError, post } from "../api/client.ts";
import { useAuth } from "./AuthContext.tsx";
import styles from "./LoginPage.module.css";

interface LoginPageProps {
  onSwitchToRegister: () => void;
}

export function LoginPage({ onSwitchToRegister }: LoginPageProps) {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");

    if (!email || !password) {
      setServerError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await post<AuthResponse>("/auth/login", {
        email,
        password,
      });
      login(res.access_token, {
        id: res.id,
        username: res.username,
        first_name: res.first_name,
        last_name: res.last_name,
        email: res.email,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.detail);
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSuccess(response: CredentialResponse) {
    if (!response.credential) return;
    setServerError("");
    try {
      const res = await post<AuthResponse>("/auth/google", {
        token: response.credential,
      });
      login(res.access_token, {
        id: res.id,
        username: res.username,
        first_name: res.first_name,
        last_name: res.last_name,
        email: res.email,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.detail);
      } else {
        setServerError("Google sign-in failed. Please try again.");
      }
    }
  }

  return (
    <div className={styles.container}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Sign In</h1>

        <label className={styles.label}>
          Email
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className={styles.label}>
          Password
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {serverError && <p className={styles.serverError}>{serverError}</p>}

        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <div className={styles.googleButton}>
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() =>
            setServerError("Google sign-in failed. Please try again.")
          }
        />
      </div>

      <p className={styles.switchLink}>
        Don't have an account?{" "}
        <button type="button" onClick={onSwitchToRegister}>
          Create one
        </button>
      </p>
    </div>
  );
}
