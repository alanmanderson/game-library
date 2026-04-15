import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { type FormEvent, useState } from "react";
import type { AuthResponse, FieldErrors } from "@pinochle/shared";
import { validate } from "@pinochle/shared";
import { ApiError, post } from "../api/client.ts";
import { useAuth } from "./AuthContext.tsx";
import { Button, TextInput } from "../ui";
import styles from "./RegisterPage.module.css";

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

export function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
  const { login } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError("");

    const errors = validate(email, password, firstName, lastName);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await post<AuthResponse>("/auth/register", {
        first_name: firstName,
        last_name: lastName,
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
      <div className={styles.brand}>
        <img
          className={styles.monogram}
          src="/logo-monogram.svg"
          alt=""
          width={64}
          height={64}
        />
        <span className={styles.wordmark}>Pinochle</span>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Create Account</h1>

        <label className={styles.label}>
          First Name
          <TextInput
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
          {fieldErrors.first_name && (
            <span className={styles.fieldError}>{fieldErrors.first_name}</span>
          )}
        </label>

        <label className={styles.label}>
          Last Name
          <TextInput
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
          {fieldErrors.last_name && (
            <span className={styles.fieldError}>{fieldErrors.last_name}</span>
          )}
        </label>

        <label className={styles.label}>
          Email
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {fieldErrors.email && (
            <span className={styles.fieldError}>{fieldErrors.email}</span>
          )}
        </label>

        <label className={styles.label}>
          Password
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.password && (
            <span className={styles.fieldError}>{fieldErrors.password}</span>
          )}
        </label>

        {serverError && (
          <p className="alert alert--error" role="alert">
            {serverError}
          </p>
        )}

        <Button type="submit" disabled={submitting} block>
          {submitting ? "Creating account..." : "Register"}
        </Button>
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

      <p className={styles.switchLink}>
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin}>
          Sign in
        </button>
      </p>
    </div>
  );
}
