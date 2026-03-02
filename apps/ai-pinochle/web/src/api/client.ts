import {
  ApiError,
  post as _post,
  getAuth as _getAuth,
  postAuth as _postAuth,
} from "@pinochle/shared";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
export const WS_BASE = API_BASE.replace(/^http/, "ws");

export { ApiError };

export function post<T>(path: string, body: unknown): Promise<T> {
  return _post<T>(API_BASE, path, body);
}

export function getAuth<T>(path: string, token: string): Promise<T> {
  return _getAuth<T>(API_BASE, path, token);
}

export function postAuth<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  return _postAuth<T>(API_BASE, path, body, token);
}
