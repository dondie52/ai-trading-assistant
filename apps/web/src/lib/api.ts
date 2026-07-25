import type { ApiFailure, ApiResponse, JsonObject, PaginatedResult } from "@trading/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001/api/v1";
export const REALTIME_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/u, "");

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: JsonObject;

  constructor(code: string, message: string, status: number, details?: JsonObject) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    if (details) {
      this.details = details;
    }
  }
}

export interface ApiFetchOptions extends RequestInit {
  /** When false, skips the one-shot auth refresh/retry. Defaults to true. */
  readonly authRetry?: boolean;
}

export interface ApiAuthHandlers {
  readonly refreshAccessToken: () => Promise<string | null>;
  readonly onAuthFailure: () => void;
  readonly isRecoverableAuthError: (error: unknown) => boolean;
}

let apiAuthHandlers: ApiAuthHandlers | null = null;

export const registerApiAuthHandlers = (handlers: ApiAuthHandlers | null): void => {
  apiAuthHandlers = handlers;
};

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

/** Safari/WebKit often reports network failures as the opaque "Load failed". */
const isNetworkFailure = (error: unknown): boolean => {
  if (!(error instanceof TypeError)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message === "load failed" ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed")
  );
};

const toTransportError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }
  if (isNetworkFailure(error)) {
    return new ApiError(
      "NETWORK_ERROR",
      "Could not reach the trading API. If the service was asleep, wait a few seconds and try again.",
      0
    );
  }
  if (error instanceof SyntaxError) {
    return new ApiError(
      "INVALID_RESPONSE",
      "The trading API returned an unexpected response. Please retry in a moment.",
      0
    );
  }
  if (error instanceof Error && error.message.trim()) {
    return new ApiError("REQUEST_ERROR", error.message, 0);
  }
  return new ApiError("REQUEST_ERROR", "Request failed.", 0);
};

const executeFetch = async <T>(
  path: string,
  options: ApiFetchOptions,
  token?: string
): Promise<T> => {
  const { authRetry: _authRetry, ...requestInit } = options;
  const headers = new Headers(requestInit.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestInit,
      headers,
      cache: "no-store"
    });
  } catch (error) {
    throw toTransportError(error);
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch (error) {
    throw toTransportError(error);
  }

  if (!response.ok || isApiFailure(payload)) {
    const failure = isApiFailure(payload)
      ? payload.error
      : { code: "REQUEST_ERROR", message: "Request failed." };
    throw new ApiError(failure.code, failure.message, response.status, failure.details);
  }

  return payload.data;
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
  token?: string
): Promise<T> {
  try {
    return await executeFetch<T>(path, options, token);
  } catch (error) {
    const normalized = toTransportError(error);
    const allowRetry = options.authRetry !== false;
    const handlers = apiAuthHandlers;
    if (!allowRetry || !handlers || !token || !handlers.isRecoverableAuthError(normalized)) {
      throw normalized;
    }

    const nextToken = await handlers.refreshAccessToken();
    if (!nextToken) {
      handlers.onAuthFailure();
      throw normalized;
    }

    try {
      return await executeFetch<T>(path, { ...options, authRetry: false }, nextToken);
    } catch (retryError) {
      const normalizedRetry = toTransportError(retryError);
      if (handlers.isRecoverableAuthError(normalizedRetry)) {
        handlers.onAuthFailure();
      }
      throw normalizedRetry;
    }
  }
}

export async function apiFetchPage<T>(
  path: string,
  options: ApiFetchOptions = {},
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
