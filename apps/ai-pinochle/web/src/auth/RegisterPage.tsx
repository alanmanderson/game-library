import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { type FormEvent, useState } from "react";
import { ApiError, post } from "../api/client.ts";
import { useAuth } from "./AuthContext.tsx";
import styles from "./RegisterPage.module.css";

interface RegisterResponse {
  id: string;
  username: string;
  email: string | null;
  access_token: string;
  token_type: string;
}

interface FieldErrors {
  username?: string;
  password?: string;
  email?: string;
}

function validate(username: string, password: string, email: string): FieldErrors {
  const errors: FieldErrors = {};

  if (username.length < 3 || username.length > 30) {
    errors.username = "Username must be 3-30 characters";
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.username = "Only letters, numbers, and underscores";
  }

  if (password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Invalid email address";
  }

  return errors;
}

export function RegisterPage() {
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");

    const errors = validate(username, password, email);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await post<RegisterResponse>("/auth/register", {
        username,
        password,
        email: email || undefined,
      });
      login(res.access_token, {
        id: res.id,
        username: res.username,
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
      const res = await post<RegisterResponse>("/auth/google", {
        token: response.credential,
      });
      login(res.access_token, {
        id: res.id,
        username: res.username,
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
        <h1 className={styles.title}>Create Account</h1>

        <label className={styles.label}>
          Username
          <input
            className={styles.input}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          {fieldErrors.username && (
            <span className={styles.fieldError}>{fieldErrors.username}</span>
          )}
        </label>

        <label className={styles.label}>
          Password
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.password && (
            <span className={styles.fieldError}>{fieldErrors.password}</span>
          )}
        </label>

        <label className={styles.label}>
          Email <span className={styles.optional}>(optional)</span>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {fieldErrors.email && (
            <span className={styles.fieldError}>{fieldErrors.email}</span>
          )}
        </label>

        {serverError && <p className={styles.serverError}>{serverError}</p>}

        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Register"}
        </button>
      </form>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <div className={styles.googleButton}>
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setServerError("Google sign-in failed. Please try again.")}
        />
      </div>
    </div>
  );
}
