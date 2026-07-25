"use client";

import type { ReactElement } from "react";
import { useEffect } from "react";
import { startAuthSessionBridge } from "../lib/auth-session";

/** Mounts the Supabase ↔ Zustand session sync for the Control Room. */
export function AuthSessionBridge(): ReactElement | null {
  useEffect(() => startAuthSessionBridge(), []);
  return null;
}
