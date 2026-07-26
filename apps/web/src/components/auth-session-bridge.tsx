"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { wakeTradingApi } from "../lib/api";
import { startAuthSessionBridge } from "../lib/auth-session";
import { startClientResumeRecovery } from "../lib/client-resume";

/** Mounts the Supabase ↔ Zustand session sync for the Control Room. */
export function AuthSessionBridge(): ReactElement | null {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Kick a sleeping Render free instance before authenticated queries flood in.
    void wakeTradingApi();
    const stopBridge = startAuthSessionBridge();
    const resume = startClientResumeRecovery(queryClient);
    return () => {
      resume.dispose();
      stopBridge();
    };
  }, [queryClient]);

  return null;
}
