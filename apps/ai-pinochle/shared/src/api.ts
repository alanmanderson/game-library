export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export async function post<T>(apiBase: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.detail || data.message || "Request failed");
  }

  return data as T;
}

export async function getAuth<T>(
  apiBase: string,
  path: string,
  token: string,
): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.detail || data.message || "Request failed");
  }

  return data as T;
}

export async function postAuth<T>(
  apiBase: string,
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.detail || data.message || "Request failed");
  }

  return data as T;
}
