"use client";

import type { ReactElement } from "react";
import { useEffect } from "react";
import { wakeTradingApi } from "../lib/api";
import { startAuthSessionBridge } from "../lib/auth-session";

/** Mounts the Supabase ↔ Zustand session sync for the Control Room. */
export function AuthSessionBridge(): ReactElement | null {
  useEffect(() => {
    // Kick a sleeping Render free instance before authenticated queries flood in.
    void wakeTradingApi();
    return startAuthSessionBridge();
  }, []);
  return null;
}
