import type { AuthTokens, PublicUser } from "@trading/types";
import { apiFetch } from "./api";
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

  const platformUser = await apiFetch<PublicUser>("/users/me", {}, data.session.access_token);
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresInSeconds: data.session.expires_in ?? 3600,
    refreshExpiresAt: new Date((data.session.expires_at ?? 0) * 1000).toISOString(),
    mfaRequired: false,
    user: platformUser
  };
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
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    return null;
  }
  const platformUser = await apiFetch<PublicUser>("/users/me", {}, data.session.access_token);
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresInSeconds: data.session.expires_in ?? 3600,
    refreshExpiresAt: new Date((data.session.expires_at ?? 0) * 1000).toISOString(),
    mfaRequired: false,
    user: platformUser
  };
};
