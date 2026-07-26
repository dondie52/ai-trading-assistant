import type { ApiFailure, ApiResponse, JsonObject, PaginatedResult } from "@trading/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001/api/v1";
export const REALTIME_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/u, "");

/** Delays between transport retries while a free Render instance wakes. */
const NETWORK_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 12_000, 20_000] as const;

/**
 * Per-attempt fetch budget. Mobile Safari can leave fetch() pending forever after
 * a tab is backgrounded; without a timeout the office stays on "Syncing…".
 */
export const REQUEST_TIMEOUT_MS = 15_000;

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
  /** When false, skips cold-start/network retries. Defaults to true. */
  readonly networkRetry?: boolean;
}

export interface ApiAuthHandlers {
  readonly refreshAccessToken: () => Promise<string | null>;
  readonly onAuthFailure: () => void;
  readonly isRecoverableAuthError: (error: unknown) => boolean;
}

let apiAuthHandlers: ApiAuthHandlers | null = null;
let wakeInFlight: Promise<boolean> | null = null;
let lastWakeOkAt = 0;

export const registerApiAuthHandlers = (handlers: ApiAuthHandlers | null): void => {
  apiAuthHandlers = handlers;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  return error instanceof Error && error.name === "AbortError";
};

/** True when the caller (e.g. React Query cancelQueries) aborted the request. */
export const isCallerAbortError = (error: unknown, signal?: AbortSignal | null): boolean =>
  Boolean(signal?.aborted) && isAbortError(error);

const createTimeoutSignal = (ms: number): AbortSignal => {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, ms);
  return controller.signal;
};

/** Combines an optional caller signal with a timeout so hung Safari fetches fail. */
export const withRequestTimeout = (
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): AbortSignal => {
  const timeoutSignal = createTimeoutSignal(timeoutMs);
  if (!callerSignal) {
    return timeoutSignal;
  }
  if (callerSignal.aborted) {
    return callerSignal;
  }
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any([callerSignal, timeoutSignal]);
  }
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
  };
  callerSignal.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
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
  if (isNetworkFailure(error) || isAbortError(error)) {
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

/** True for cold-start / gateway blips that often succeed after a short wait. */
export const isRetryableTransportError = (error: unknown): boolean => {
  if (!(error instanceof ApiError)) {
    return isNetworkFailure(error) || error instanceof SyntaxError;
  }
  if (error.code === "NETWORK_ERROR" || error.code === "INVALID_RESPONSE") {
    return true;
  }
  return error.status === 502 || error.status === 503 || error.status === 504;
};

const executeFetch = async <T>(
  path: string,
  options: ApiFetchOptions,
  token?: string
): Promise<T> => {
  const { authRetry: _authRetry, networkRetry: _networkRetry, ...requestInit } = options;
  const headers = new Headers(requestInit.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const signal = withRequestTimeout(requestInit.signal);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestInit,
      headers,
      signal,
      cache: "no-store"
    });
  } catch (error) {
    if (isCallerAbortError(error, requestInit.signal)) {
      throw error;
    }
    throw toTransportError(error);
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch (error) {
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new ApiError(
        "NETWORK_ERROR",
        "Could not reach the trading API. If the service was asleep, wait a few seconds and try again.",
        response.status
      );
    }
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

const executeFetchWithNetworkRetry = async <T>(
  path: string,
  options: ApiFetchOptions,
  token?: string
): Promise<T> => {
  const allowNetworkRetry = options.networkRetry !== false;
  let lastError: ApiError | undefined;

  for (let attempt = 0; attempt <= NETWORK_RETRY_DELAYS_MS.length; attempt += 1) {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error
        ? options.signal.reason
        : new DOMException("The operation was aborted.", "AbortError");
    }
    try {
      return await executeFetch<T>(path, options, token);
    } catch (error) {
      if (isCallerAbortError(error, options.signal)) {
        throw error;
      }
      const normalized = toTransportError(error);
      lastError = normalized;
      if (!allowNetworkRetry || !isRetryableTransportError(normalized)) {
        throw normalized;
      }
      const delay = NETWORK_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        break;
      }
      // Nudge the free instance awake between retries.
      if (attempt === 0 || attempt === 2) {
        await wakeTradingApi({ force: true });
      }
      await sleep(delay);
    }
  }

  throw lastError ?? new ApiError("NETWORK_ERROR", "Could not reach the trading API.", 0);
};

/**
 * Pings the public health endpoint to wake a sleeping Render free instance.
 * Concurrent callers share one in-flight wake; successful wakes are cached briefly.
 */
export async function wakeTradingApi(options: { readonly force?: boolean } = {}): Promise<boolean> {
  const now = Date.now();
  if (!options.force && now - lastWakeOkAt < 30_000) {
    return true;
  }
  if (wakeInFlight) {
    return wakeInFlight;
  }

  wakeInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: withRequestTimeout(undefined, REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) {
        return false;
      }
      lastWakeOkAt = Date.now();
      return true;
    } catch {
      return false;
    } finally {
      wakeInFlight = null;
    }
  })();

  return wakeInFlight;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
  token?: string
): Promise<T> {
  try {
    return await executeFetchWithNetworkRetry<T>(path, options, token);
  } catch (error) {
    if (isCallerAbortError(error, options.signal)) {
      throw error;
    }
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
      return await executeFetchWithNetworkRetry<T>(
        path,
        { ...options, authRetry: false },
        nextToken
      );
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
