import { Injectable } from "@nestjs/common";
import type { OperationalMetricsSnapshot, SignalType } from "@trading/types";

type TradeOutcome = "executed" | "rejected" | "submitted";

interface SignalMetric {
  readonly occurredAt: number;
  readonly latencyMs: number;
  readonly confidence: number;
  readonly signalType: SignalType;
  readonly modelVersion: string;
}

const round = (value: number): number => Number(value.toFixed(2));

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : round(values.reduce((sum, value) => sum + value, 0) / values.length);

const percentile95 = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return round(sorted[index] ?? 0);
};

const appendBounded = (values: number[], value: number): void => {
  values.push(Math.max(0, value));
  if (values.length > 1_000) {
    values.shift();
  }
};

@Injectable()
export class OperationalMetricsService {
  private apiRequestCount = 0;
  private apiErrorCount = 0;
  private readonly apiLatencies: number[] = [];
  private readonly signals: SignalMetric[] = [];
  private readonly tradeLatencies: number[] = [];
  private tradeRequested = 0;
  private tradeExecuted = 0;
  private tradeRejected = 0;
  private tradeSubmitted = 0;

  recordApiRequest(latencyMs: number, failed: boolean): void {
    this.apiRequestCount += 1;
    if (failed) {
      this.apiErrorCount += 1;
    }
    appendBounded(this.apiLatencies, latencyMs);
  }

  recordSignal(input: {
    readonly latencyMs: number;
    readonly confidence: number;
    readonly signalType: SignalType;
    readonly modelVersion: string;
  }): void {
    this.signals.push({
      occurredAt: Date.now(),
      latencyMs: Math.max(0, input.latencyMs),
      confidence: input.confidence,
      signalType: input.signalType,
      modelVersion: input.modelVersion
    });
    if (this.signals.length > 1_000) {
      this.signals.shift();
    }
  }

  recordTrade(latencyMs: number, outcome: TradeOutcome): void {
    this.tradeRequested += 1;
    if (outcome === "executed") {
      this.tradeExecuted += 1;
    } else if (outcome === "rejected") {
      this.tradeRejected += 1;
    } else {
      this.tradeSubmitted += 1;
    }
    appendBounded(this.tradeLatencies, latencyMs);
  }

  recordSubmittedFill(latencyMs: number): void {
    if (this.tradeSubmitted > 0) {
      this.tradeSubmitted -= 1;
    }
    this.tradeExecuted += 1;
    appendBounded(this.tradeLatencies, latencyMs);
  }

  recordSubmittedRejection(latencyMs: number): void {
    if (this.tradeSubmitted > 0) {
      this.tradeSubmitted -= 1;
    }
    this.tradeRejected += 1;
    appendBounded(this.tradeLatencies, latencyMs);
  }

  snapshot(input: {
    readonly queueConfigured: boolean;
    readonly queueDepth: number | null;
  }): OperationalMetricsSnapshot {
    const recentCutoff = Date.now() - 60_000;
    const byType = this.signals.reduce(
      (counts, signal) => {
        counts[signal.signalType] += 1;
        return counts;
      },
      { BUY: 0, SELL: 0, HOLD: 0 }
    );
    const completedTrades = this.tradeExecuted + this.tradeRejected + this.tradeSubmitted;

    return {
      generatedAt: new Date().toISOString(),
      api: {
        requestCount: this.apiRequestCount,
        errorCount: this.apiErrorCount,
        errorRatePercent:
          this.apiRequestCount === 0 ? 0 : round((this.apiErrorCount / this.apiRequestCount) * 100),
        averageLatencyMs: average(this.apiLatencies),
        p95LatencyMs: percentile95(this.apiLatencies)
      },
      signals: {
        total: this.signals.length,
        throughputPerMinute: this.signals.filter((signal) => signal.occurredAt >= recentCutoff).length,
        averageLatencyMs: average(this.signals.map((signal) => signal.latencyMs)),
        p95LatencyMs: percentile95(this.signals.map((signal) => signal.latencyMs)),
        averageConfidence: average(this.signals.map((signal) => signal.confidence)),
        byType,
        modelVersions: [...new Set(this.signals.map((signal) => signal.modelVersion))].sort()
      },
      trades: {
        requested: this.tradeRequested,
        executed: this.tradeExecuted,
        rejected: this.tradeRejected,
        submitted: this.tradeSubmitted,
        successRatePercent:
          completedTrades === 0 ? 0 : round((this.tradeExecuted / completedTrades) * 100),
        averageLatencyMs: average(this.tradeLatencies),
        p95LatencyMs: percentile95(this.tradeLatencies)
      },
      notificationQueue: {
        configured: input.queueConfigured,
        depth: input.queueDepth
      }
    };
  }
}
