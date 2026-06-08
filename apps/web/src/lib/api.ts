import type { ApiFailure, ApiResponse, PaginatedResult } from "@trading/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001/api/v1";
export const REALTIME_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/u, "");

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const isApiFailure = (value: unknown): value is ApiFailure => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.success !== false || typeof record.error !== "object" || record.error === null) {
    return false;
  }
  const error = record.error as Record<string, unknown>;
  return typeof error.code === "string" && typeof error.message === "string";
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || isApiFailure(payload)) {
    const failure = isApiFailure(payload) ? payload.error : { code: "REQUEST_ERROR", message: "Request failed." };
    throw new ApiError(failure.code, failure.message, response.status);
  }

  return payload.data;
}

export async function apiFetchPage<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<readonly T[]> {
  const separator = path.includes("?") ? "&" : "?";
  const page = await apiFetch<PaginatedResult<T>>(
    `${path}${separator}page=1&pageSize=100`,
    options,
    token
  );
  return page.data;
}
