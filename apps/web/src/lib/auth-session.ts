import type { Session } from "@supabase/supabase-js";
import type { AuthTokens, PublicUser } from "@trading/types";
import { useSessionStore } from "../store/session";
import { ApiError, apiFetch, registerApiAuthHandlers, wakeTradingApi } from "./api";
import { createSupabaseBrowserClient, isSupabaseAuthEnabled } from "./supabase/client";

const RECOVERABLE_AUTH_CODES = new Set(["INVALID_TOKEN", "INVALID_SESSION"]);

let authFailureMessage: string | null = null;

export const consumeAuthFailureMessage = (): string | null => {
  const message = authFailureMessage;
  authFailureMessage = null;
  return message;
};

export const isRecoverableAuthError = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401 && RECOVERABLE_AUTH_CODES.has(error.code);

export const toAuthTokens = (session: Session, user: PublicUser): AuthTokens => ({
  accessToken: session.access_token,
  refreshToken: session.refresh_token,
  expiresInSeconds: session.expires_in ?? 3600,
  refreshExpiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString(),
  mfaRequired: false,
  user
});

export const applySupabaseSession = async (session: Session | null): Promise<void> => {
  const store = useSessionStore.getState();

  if (!session) {
    if (store.accessToken || store.user) {
      store.clearSession();
    }
    return;
  }

  if (store.user) {
    if (
      store.accessToken === session.access_token &&
      store.refreshToken === session.refresh_token
    ) {
      return;
    }
    store.setSession(toAuthTokens(session, store.user));
    return;
  }

  await wakeTradingApi();
  const platformUser = await apiFetch<PublicUser>("/users/me", { authRetry: false }, session.access_token);
  store.setSession(toAuthTokens(session, platformUser));
};

export const refreshAccessToken = async (): Promise<string | null> => {
  if (!isSupabaseAuthEnabled()) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    return null;
  }

  const store = useSessionStore.getState();
  if (store.user) {
    store.setSession(toAuthTokens(data.session, store.user));
    return data.session.access_token;
  }

  try {
    await applySupabaseSession(data.session);
  } catch {
    return null;
  }

  return useSessionStore.getState().accessToken;
};

const handleUnrecoverableAuthFailure = (): void => {
  authFailureMessage = "Your session expired. Please sign in again.";
  useSessionStore.getState().clearSession();
};

/**
 * Keeps Zustand access tokens aligned with the Supabase browser session and
 * registers a one-shot API 401 refresh/retry handler.
 */
export const startAuthSessionBridge = (): (() => void) => {
  if (!isSupabaseAuthEnabled()) {
    return () => undefined;
  }

  const supabase = createSupabaseBrowserClient();

  registerApiAuthHandlers({
    refreshAccessToken,
    onAuthFailure: handleUnrecoverableAuthFailure,
    isRecoverableAuthError
  });

  // Rely on onAuthStateChange (including INITIAL_SESSION) so a slow getSession()
  // cannot overwrite a newer TOKEN_REFRESHED access token.
  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      useSessionStore.getState().clearSession();
      return;
    }

    if (
      event === "INITIAL_SESSION" ||
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "USER_UPDATED"
    ) {
      void applySupabaseSession(session).catch(() => undefined);
    }
  });

  return () => {
    subscription.unsubscribe();
    registerApiAuthHandlers(null);
  };
};
