import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_RESUME_MIN_HIDDEN_MS,
  recoverClientAfterResume,
  startClientResumeRecovery
} from "./client-resume";

vi.mock("./api", () => ({
  wakeTradingApi: vi.fn().mockResolvedValue(true)
}));

import { wakeTradingApi } from "./api";

const installDomStubs = (visibilityState: DocumentVisibilityState = "visible"): void => {
  const doc = {
    visibilityState,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  const win = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
};

describe("client resume recovery", () => {
  beforeEach(() => {
    vi.mocked(wakeTradingApi).mockClear();
    installDomStubs("visible");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("wakes the API and refreshes queries after resume", async () => {
    const queryClient = new QueryClient();
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries").mockResolvedValue(undefined);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    await recoverClientAfterResume(queryClient);

    expect(wakeTradingApi).toHaveBeenCalledWith({ force: true });
    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledOnce();
  });

  it("recovers after the tab was hidden long enough", async () => {
    const queryClient = new QueryClient();
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries").mockResolvedValue(undefined);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const resume = startClientResumeRecovery(queryClient);
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(50_000);
    (document as { visibilityState: DocumentVisibilityState }).visibilityState = "hidden";
    await resume.onVisibilityChange();

    now.mockReturnValue(50_000 + CLIENT_RESUME_MIN_HIDDEN_MS + 25);
    (document as { visibilityState: DocumentVisibilityState }).visibilityState = "visible";
    await resume.onVisibilityChange();

    expect(wakeTradingApi).toHaveBeenCalledWith({ force: true });
    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledOnce();

    resume.dispose();
  });

  it("ignores brief backgrounding", async () => {
    const queryClient = new QueryClient();
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries").mockResolvedValue(undefined);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const resume = startClientResumeRecovery(queryClient);
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(80_000);
    (document as { visibilityState: DocumentVisibilityState }).visibilityState = "hidden";
    await resume.onVisibilityChange();

    now.mockReturnValue(80_500);
    (document as { visibilityState: DocumentVisibilityState }).visibilityState = "visible";
    await resume.onVisibilityChange();

    expect(wakeTradingApi).not.toHaveBeenCalled();
    expect(cancelQueries).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
    resume.dispose();
  });

  it("recovers when restored from the page cache", async () => {
    const queryClient = new QueryClient();
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries").mockResolvedValue(undefined);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const resume = startClientResumeRecovery(queryClient);

    await resume.onPageShow({ persisted: true });

    expect(wakeTradingApi).toHaveBeenCalledWith({ force: true });
    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledOnce();

    resume.dispose();
  });
});
