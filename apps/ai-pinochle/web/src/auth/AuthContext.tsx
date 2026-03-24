import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from "react";
import type { User, AuthState } from "@pinochle/shared";

type AuthAction =
  | { type: "LOGIN_SUCCESS"; token: string; user: User }
  | { type: "LOGOUT" };

interface AuthContextValue extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function getInitialState(): AuthState {
  const token = localStorage.getItem("token");
  const raw = localStorage.getItem("user");

  if (token && isTokenExpired(token)) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return { token: null, user: null };
  }

  const user = raw ? (JSON.parse(raw) as User) : null;
  return { token, user };
}

function authReducer(_state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN_SUCCESS":
      localStorage.setItem("token", action.token);
      localStorage.setItem("user", JSON.stringify(action.user));
      return { token: action.token, user: action.user };
    case "LOGOUT":
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, undefined, getInitialState);

  const login = (token: string, user: User) =>
    dispatch({ type: "LOGIN_SUCCESS", token, user });

  const logout = () => dispatch({ type: "LOGOUT" });

  return (
    <AuthContext value={{ ...state, login, logout }}>
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
