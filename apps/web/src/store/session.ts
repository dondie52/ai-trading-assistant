import type { AuthTokens, PublicUser } from "@trading/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
  readonly user: PublicUser | null;
  setSession(tokens: AuthTokens): void;
  clearSession(): void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (tokens) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: tokens.user
        }),
      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null
        })
    }),
    {
      name: "trading-session",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user
      })
    }
  )
);

