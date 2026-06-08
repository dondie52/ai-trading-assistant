import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { describe, expect, it } from "vitest";
import { MetricsInterceptor } from "../src/monitoring/metrics.interceptor.js";
import { OperationalMetricsService } from "../src/monitoring/operational-metrics.service.js";

describe("operational metrics", () => {
  it("aggregates API, signal, trade, and queue measurements", () => {
    const metrics = new OperationalMetricsService();
    metrics.recordApiRequest(10, false);
    metrics.recordApiRequest(30, true);
    metrics.recordSignal({
      latencyMs: 24,
      confidence: 80,
      signalType: "BUY",
      modelVersion: "model-1"
    });
    metrics.recordTrade(40, "submitted");
    metrics.recordSubmittedFill(100);

    const snapshot = metrics.snapshot({ queueConfigured: true, queueDepth: 3 });

    expect(snapshot.api).toMatchObject({
      requestCount: 2,
      errorCount: 1,
      errorRatePercent: 50,
      averageLatencyMs: 20,
      p95LatencyMs: 30
    });
    expect(snapshot.signals).toMatchObject({
      total: 1,
      throughputPerMinute: 1,
      averageConfidence: 80,
      byType: { BUY: 1, SELL: 0, HOLD: 0 }
    });
    expect(snapshot.trades).toMatchObject({
      requested: 1,
      executed: 1,
      rejected: 0,
      submitted: 0,
      successRatePercent: 100
    });
    expect(snapshot.notificationQueue).toEqual({ configured: true, depth: 3 });
  });

  it("moves submitted orders into rejected outcomes when execution-time risk fails", () => {
    const metrics = new OperationalMetricsService();
    metrics.recordTrade(10, "submitted");
    metrics.recordSubmittedRejection(50);

    expect(metrics.snapshot({ queueConfigured: false, queueDepth: null }).trades).toMatchObject({
      requested: 1,
      executed: 0,
      rejected: 1,
      submitted: 0,
      successRatePercent: 0
    });
  });

  it("records successful and failed HTTP requests through the interceptor", async () => {
    const metrics = new OperationalMetricsService();
    const interceptor = new MetricsInterceptor(metrics);
    const context = {} as ExecutionContext;

    await lastValueFrom(interceptor.intercept(context, { handle: () => of("ok") } as CallHandler));
    await expect(
      lastValueFrom(
        interceptor.intercept(
          context,
          { handle: () => throwError(() => new Error("failed")) } as CallHandler
        )
      )
    ).rejects.toThrow("failed");

    expect(metrics.snapshot({ queueConfigured: false, queueDepth: null }).api).toMatchObject({
      requestCount: 2,
      errorCount: 1,
      errorRatePercent: 50
    });
  });
});
