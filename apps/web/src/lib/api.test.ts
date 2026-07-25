import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
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
});
