import { API_URL } from '../hooks/useWebSocket';

export interface UserInfo {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export interface AuthResponse {
  access_token: string;
  user: UserInfo;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function register(
  email: string,
  displayName: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, display_name: displayName, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Registration failed');
  }
  return res.json();
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Login failed');
  }
  return res.json();
}

export function getGoogleAuthUrl(): string {
  return `${API_URL}/api/auth/google`;
}

export async function fetchCurrentUser(token: string): Promise<UserInfo> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error('Not authenticated');
  }
  return res.json();
}

export async function updateDisplayName(
  token: string,
  displayName: string
): Promise<UserInfo> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Update failed');
  }
  return res.json();
}
