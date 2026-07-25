import type { AuthTokens, PublicUser } from "@trading/types";
import { useSessionStore } from "../store/session";
import { apiFetch } from "./api";
import { toAuthTokens } from "./auth-session";
import { createSupabaseBrowserClient, isSupabaseAuthEnabled } from "./supabase/client";

export const signInWithSupabase = async (
  email: string,
  password: string
): Promise<AuthTokens> => {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(error?.message ?? "Sign in failed.");
  }

  const platformUser = await apiFetch<PublicUser>(
    "/users/me",
    { authRetry: false },
    data.session.access_token
  );
  return toAuthTokens(data.session, platformUser);
};

export const signOutSupabase = async (): Promise<void> => {
  if (!isSupabaseAuthEnabled()) {
    return;
  }
  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
};

export const refreshSupabaseSession = async (): Promise<AuthTokens | null> => {
  if (!isSupabaseAuthEnabled()) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  let session = (await supabase.auth.getSession()).data.session;

  const needsRefresh =
    !session ||
    (typeof session.expires_at === "number" && session.expires_at * 1000 <= Date.now() + 60_000);

  if (needsRefresh) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      if (!session) {
        return null;
      }
    } else {
      session = refreshed.data.session;
    }
  }

  if (!session) {
    return null;
  }

  const existingUser = useSessionStore.getState().user;
  if (existingUser) {
    return toAuthTokens(session, existingUser);
  }

  const platformUser = await apiFetch<PublicUser>("/users/me", { authRetry: false }, session.access_token);
  return toAuthTokens(session, platformUser);
};
