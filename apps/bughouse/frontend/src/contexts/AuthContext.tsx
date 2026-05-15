import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserInfo, fetchCurrentUser, login as apiLogin, register as apiRegister, getGoogleAuthUrl } from '../api/auth';

const AUTH_TOKEN_KEY = 'bughouse_auth_token';

interface AuthContextValue {
  user: UserInfo | null;
  accessToken: string | null;
  isGuest: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, displayName: string, password: string) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => void;
  setAuthFromCallback: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(
    () => localStorage.getItem(AUTH_TOKEN_KEY)
  );
  const [loading, setLoading] = useState(!!localStorage.getItem(AUTH_TOKEN_KEY));

  const isGuest = !user;

  // Validate token on mount
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    fetchCurrentUser(token)
      .then((u) => {
        setUser(u);
        setAccessToken(token);
      })
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAccessToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const resp = await apiLogin(email, password);
    localStorage.setItem(AUTH_TOKEN_KEY, resp.access_token);
    setAccessToken(resp.access_token);
    setUser(resp.user);
  }, []);

  const register = useCallback(async (email: string, displayName: string, password: string) => {
    const resp = await apiRegister(email, displayName, password);
    localStorage.setItem(AUTH_TOKEN_KEY, resp.access_token);
    setAccessToken(resp.access_token);
    setUser(resp.user);
  }, []);

  const loginWithGoogle = useCallback(() => {
    window.location.href = getGoogleAuthUrl();
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  const setAuthFromCallback = useCallback(async (token: string) => {
    // Validate the token before storing it — only persist on success
    const u = await fetchCurrentUser(token);
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAccessToken(token);
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, isGuest, loading, login, register, loginWithGoogle, logout, setAuthFromCallback }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
