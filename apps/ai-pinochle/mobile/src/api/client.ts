import {
  ApiError,
  post as _post,
  postAuth as _postAuth,
} from "@pinochle/shared";
import { API_BASE } from "../config";

export { ApiError };

export function post<T>(path: string, body: unknown): Promise<T> {
  return _post<T>(API_BASE, path, body);
}

export function postAuth<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  return _postAuth<T>(API_BASE, path, body, token);
}
