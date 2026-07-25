import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  apiFetchPage,
  registerApiAuthHandlers
} from "./api";

describe("apiFetch auth retry", () => {
  afterEach(() => {
    registerApiAuthHandlers(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries once after a recoverable 401 and succeeds with the refreshed token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: "INVALID_TOKEN", message: "Invalid access token." }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { id: "user-1" } })
      });
    vi.stubGlobal("fetch", fetchMock);

    const refreshAccessToken = vi.fn().mockResolvedValue("fresh-token");
    const onAuthFailure = vi.fn();
    registerApiAuthHandlers({
      refreshAccessToken,
      onAuthFailure,
      isRecoverableAuthError: (error) =>
        error instanceof ApiError && error.code === "INVALID_TOKEN"
    });

    await expect(apiFetch<{ id: string }>("/users/me", {}, "stale-token")).resolves.toEqual({
      id: "user-1"
    });
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(onAuthFailure).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.headers.get("Authorization")).toBe("Bearer fresh-token");
  });

  it("clears the session when refresh fails after INVALID_TOKEN", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid access token." }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const refreshAccessToken = vi.fn().mockResolvedValue(null);
    const onAuthFailure = vi.fn();
    registerApiAuthHandlers({
      refreshAccessToken,
      onAuthFailure,
      isRecoverableAuthError: (error) =>
        error instanceof ApiError && error.code === "INVALID_TOKEN"
    });

    await expect(apiFetch("/users/me", {}, "stale-token")).rejects.toMatchObject({
      code: "INVALID_TOKEN"
    });
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(onAuthFailure).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry when authRetry is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid access token." }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const refreshAccessToken = vi.fn();
    registerApiAuthHandlers({
      refreshAccessToken,
      onAuthFailure: vi.fn(),
      isRecoverableAuthError: () => true
    });

    await expect(apiFetch("/users/me", { authRetry: false }, "stale-token")).rejects.toMatchObject({
      code: "INVALID_TOKEN"
    });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("maps Safari Load failed network errors to a recoverable API message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Load failed"))
    );

    await expect(apiFetch("/dondie/run", { method: "POST", body: "{}" }, "token")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: expect.stringMatching(/could not reach the trading api/i)
    });
  });

  it("maps Failed to fetch network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(apiFetch("/health")).rejects.toMatchObject({
      code: "NETWORK_ERROR"
    });
  });

  it("maps non-JSON API responses to INVALID_RESPONSE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        }
      })
    );

    await expect(apiFetch("/health")).rejects.toMatchObject({
      code: "INVALID_RESPONSE"
    });
  });

  it("maps generic thrown Errors to REQUEST_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));

    await expect(apiFetch("/health")).rejects.toMatchObject({
      code: "REQUEST_ERROR",
      message: "socket hang up"
    });
  });

  it("maps unknown throwables to a generic REQUEST_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("boom"));

    await expect(apiFetch("/health")).rejects.toMatchObject({
      code: "REQUEST_ERROR",
      message: "Request failed."
    });
  });

  it("unwraps paginated responses via apiFetchPage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            data: [{ id: "a" }, { id: "b" }],
            page: 1,
            pageSize: 100,
            total: 2
          }
        })
      })
    );

    await expect(apiFetchPage<{ id: string }>("/orders")).resolves.toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("clears the session when a refreshed retry still returns a recoverable auth error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: "INVALID_TOKEN", message: "Invalid access token." }
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: "INVALID_TOKEN", message: "Still invalid." }
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const onAuthFailure = vi.fn();
    registerApiAuthHandlers({
      refreshAccessToken: vi.fn().mockResolvedValue("fresh-token"),
      onAuthFailure,
      isRecoverableAuthError: (error) =>
        error instanceof ApiError && error.code === "INVALID_TOKEN"
    });

    await expect(apiFetch("/users/me", {}, "stale-token")).rejects.toMatchObject({
      code: "INVALID_TOKEN",
      message: "Still invalid."
    });
    expect(onAuthFailure).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
