import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { PublicUser } from "@trading/types";
import {
  applySupabaseSession,
  consumeAuthFailureMessage,
  isRecoverableAuthError,
  refreshAccessToken,
  startAuthSessionBridge,
  toAuthTokens
} from "./auth-session";
import { ApiError, apiFetch, registerApiAuthHandlers } from "./api";
import { useSessionStore } from "../store/session";

const memoryStorage = (() => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage,
  configurable: true
});

const platformUser: PublicUser = {
  id: "user-1",
  email: "trader@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  role: "TRADER",
  status: "ACTIVE",
  mfaEnabled: false,
  createdAt: new Date().toISOString(),
  notificationPreferences: {
    trade: true,
    signal: true,
    risk: true,
    system: false
  }
};

const makeSession = (accessToken: string, refreshToken = "refresh-1"): Session =>
  ({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: { id: "user-1" }
  }) as Session;

vi.mock("./supabase/client", () => ({
  isSupabaseAuthEnabled: vi.fn(() => true),
  createSupabaseBrowserClient: vi.fn()
}));

describe("auth-session", () => {
  beforeEach(async () => {
    useSessionStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null
    });
    registerApiAuthHandlers(null);
    vi.unstubAllGlobals();
    const supabaseClient = await import("./supabase/client");
    vi.mocked(supabaseClient.isSupabaseAuthEnabled).mockReturnValue(true);
    vi.mocked(supabaseClient.createSupabaseBrowserClient).mockReset();
  });

  afterEach(() => {
    registerApiAuthHandlers(null);
    vi.unstubAllGlobals();
  });

  it("patches tokens when a platform user is already present", async () => {
    useSessionStore.setState({
      accessToken: "stale-token",
      refreshToken: "old-refresh",
      user: platformUser
    });

    await applySupabaseSession(makeSession("fresh-token", "fresh-refresh"));

    const state = useSessionStore.getState();
    expect(state.accessToken).toBe("fresh-token");
    expect(state.refreshToken).toBe("fresh-refresh");
    expect(state.user).toEqual(platformUser);
  });

  it("clears the store when Supabase reports no session", async () => {
    useSessionStore.setState({
      accessToken: "stale-token",
      refreshToken: "old-refresh",
      user: platformUser
    });

    await applySupabaseSession(null);

    const state = useSessionStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
  });

  it("loads the platform user when applying a session without a local user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: platformUser })
      })
    );

    await applySupabaseSession(makeSession("fresh-token"));

    const state = useSessionStore.getState();
    expect(state.accessToken).toBe("fresh-token");
    expect(state.user?.email).toBe("trader@example.com");
  });

  it("identifies recoverable auth errors", () => {
    expect(isRecoverableAuthError(new ApiError("INVALID_TOKEN", "Invalid access token.", 401))).toBe(
      true
    );
    expect(isRecoverableAuthError(new ApiError("INVALID_SESSION", "Session is no longer active.", 401))).toBe(
      true
    );
    expect(isRecoverableAuthError(new ApiError("FORBIDDEN", "Nope.", 403))).toBe(false);
  });

  it("maps supabase sessions into AuthTokens", () => {
    const tokens = toAuthTokens(makeSession("access-1", "refresh-1"), platformUser);
    expect(tokens.accessToken).toBe("access-1");
    expect(tokens.refreshToken).toBe("refresh-1");
    expect(tokens.user).toEqual(platformUser);
    expect(tokens.mfaRequired).toBe(false);
  });

  it("refreshAccessToken updates the store and returns the new access token", async () => {
    useSessionStore.setState({
      accessToken: "stale-token",
      refreshToken: "old-refresh",
      user: platformUser
    });

    const { createSupabaseBrowserClient } = await import("./supabase/client");
    vi.mocked(createSupabaseBrowserClient).mockReturnValue({
      auth: {
        refreshSession: vi.fn().mockResolvedValue({
          data: { session: makeSession("rotated-token", "rotated-refresh") },
          error: null
        })
      }
    } as never);

    await expect(refreshAccessToken()).resolves.toBe("rotated-token");
    expect(useSessionStore.getState().accessToken).toBe("rotated-token");
    expect(useSessionStore.getState().refreshToken).toBe("rotated-refresh");
  });

  it("startAuthSessionBridge syncs TOKEN_REFRESHED into the store", async () => {
    useSessionStore.setState({
      accessToken: "stale-token",
      refreshToken: "old-refresh",
      user: platformUser
    });

    const authListeners: Array<(event: string, session: Session | null) => void> = [];
    const unsubscribe = vi.fn();
    const { createSupabaseBrowserClient } = await import("./supabase/client");
    vi.mocked(createSupabaseBrowserClient).mockReturnValue({
      auth: {
        refreshSession: vi.fn(),
        onAuthStateChange: vi.fn((listener: (event: string, session: Session | null) => void) => {
          authListeners.push(listener);
          return { data: { subscription: { unsubscribe } } };
        })
      }
    } as never);

    const stop = startAuthSessionBridge();
    expect(authListeners).toHaveLength(1);

    authListeners[0]?.("TOKEN_REFRESHED", makeSession("bridge-token", "bridge-refresh"));
    await vi.waitFor(() => {
      expect(useSessionStore.getState().accessToken).toBe("bridge-token");
    });
    expect(useSessionStore.getState().refreshToken).toBe("bridge-refresh");

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("consumeAuthFailureMessage returns and clears the pending notice", async () => {
    useSessionStore.setState({
      accessToken: "stale-token",
      refreshToken: "old-refresh",
      user: platformUser
    });

    const { createSupabaseBrowserClient } = await import("./supabase/client");
    vi.mocked(createSupabaseBrowserClient).mockReturnValue({
      auth: {
        refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: "nope" } }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      }
    } as never);

    startAuthSessionBridge();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: "INVALID_TOKEN", message: "Invalid access token." }
        })
      })
    );

    await expect(apiFetch("/users/me", {}, "stale-token")).rejects.toMatchObject({
      code: "INVALID_TOKEN"
    });

    expect(useSessionStore.getState().user).toBeNull();
    expect(consumeAuthFailureMessage()).toBe("Your session expired. Please sign in again.");
    expect(consumeAuthFailureMessage()).toBeNull();
  });
});
