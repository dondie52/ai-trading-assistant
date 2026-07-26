import type { QueryClient } from "@tanstack/react-query";
import { wakeTradingApi } from "./api";

/** Ignore quick app switches; recover after iOS/Safari freezes the page. */
export const CLIENT_RESUME_MIN_HIDDEN_MS = 2_000;

/**
 * Wakes a sleeping API and forces React Query to drop hung in-flight fetches
 * then refetch. Mobile Safari often leaves fetch() pending after the tab is
 * backgrounded or restored from the page cache, which leaves the office stuck
 * on "Syncing office state…".
 */
export async function recoverClientAfterResume(queryClient: QueryClient): Promise<void> {
  await wakeTradingApi({ force: true });
  await queryClient.cancelQueries();
  await queryClient.invalidateQueries();
}

export type ClientResumeListeners = {
  readonly onVisibilityChange: () => Promise<void> | void;
  readonly onPageShow: (event: Pick<PageTransitionEvent, "persisted">) => Promise<void> | void;
  readonly dispose: () => void;
};

/**
 * Subscribes to visibility/pageshow and recovers trading queries after the
 * user returns to a previously opened tab.
 */
export function startClientResumeRecovery(queryClient: QueryClient): ClientResumeListeners {
  let hiddenAt = 0;
  let recovering: Promise<void> | null = null;

  const runRecover = (): Promise<void> => {
    if (recovering) {
      return recovering;
    }
    recovering = recoverClientAfterResume(queryClient).finally(() => {
      recovering = null;
    });
    return recovering;
  };

  const onVisibilityChange = (): Promise<void> | void => {
    if (typeof document === "undefined") {
      return;
    }
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const awayMs = hiddenAt > 0 ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (awayMs < CLIENT_RESUME_MIN_HIDDEN_MS) {
      return;
    }
    return runRecover();
  };

  const onPageShow = (event: Pick<PageTransitionEvent, "persisted">): Promise<void> | void => {
    if (event.persisted) {
      return runRecover();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pageshow", onPageShow as EventListener);
  }

  return {
    onVisibilityChange,
    onPageShow,
    dispose: () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("pageshow", onPageShow as EventListener);
      }
    }
  };
}
