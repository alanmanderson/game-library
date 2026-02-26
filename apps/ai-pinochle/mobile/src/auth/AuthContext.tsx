import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface User {
  id: string;
  username: string;
  email: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
}

type AuthAction =
  | { type: "LOGIN_SUCCESS"; token: string; user: User }
  | { type: "LOGOUT" }
  | { type: "RESTORE"; token: string; user: User };

interface AuthContextValue extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authReducer(_state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN_SUCCESS":
    case "RESTORE":
      return { token: action.token, user: action.user };
    case "LOGOUT":
      return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    token: null,
    user: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const raw = await AsyncStorage.getItem("user");
        if (token && raw) {
          const user = JSON.parse(raw) as User;
          dispatch({ type: "RESTORE", token, user });
        }
      } catch {
        // ignore restore errors
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = (token: string, user: User) => {
    AsyncStorage.setItem("token", token);
    AsyncStorage.setItem("user", JSON.stringify(user));
    dispatch({ type: "LOGIN_SUCCESS", token, user });
  };

  const logout = () => {
    AsyncStorage.removeItem("token");
    AsyncStorage.removeItem("user");
    dispatch({ type: "LOGOUT" });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
