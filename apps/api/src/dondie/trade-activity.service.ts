import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  JsonObject,
  ScanTriggerType,
  SchedulerStatusView,
  TradeActivity,
  TradeActivityStage,
  TradeSkipReasonCode,
  UUID
} from "@trading/types";
import { formatActivityHeadline } from "@trading/shared";
import { PlatformStore } from "../store/platform.store.js";
import { dondieConfig } from "./dondie.config.js";

const isoNow = (): string => new Date().toISOString();

export interface ScanRunSnapshot {
  readonly scanId: UUID;
  readonly userId: UUID;
  readonly triggerType: ScanTriggerType;
  readonly startedAt: string;
  symbolsEvaluated: number;
  signalsGenerated: number;
  ordersSubmitted: number;
  ordersFilled: number;
  errors: string[];
}

@Injectable()
export class TradeActivityService {
  private readonly activities: TradeActivity[] = [];
  private readonly maxActivities = 500;

  constructor(@Inject(PlatformStore) private readonly store: PlatformStore) {}

  listForUser(userId: UUID, limit = 100): readonly TradeActivity[] {
    const fromMemory = this.activities.filter((activity) => activity.userId === userId);
    const fromAudit = this.store.auditLogs
      .filter((log) => log.userId === userId && log.action === "TRADE_ACTIVITY")
      .map((log) => log.metadata as unknown as TradeActivity)
      .filter((activity) => activity && typeof activity.id === "string" && typeof activity.headline === "string");
    const byId = new Map<string, TradeActivity>();
    for (const activity of [...fromAudit, ...fromMemory]) {
      byId.set(activity.id, activity);
    }
    return [...byId.values()]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit);
  }

  record(input: {
    readonly userId: UUID;
    readonly agentId?: UUID;
    readonly scanId?: UUID;
    readonly correlationId?: UUID;
    readonly stage: TradeActivityStage;
    readonly triggerType: ScanTriggerType;
    readonly symbol?: string;
    readonly signal?: string;
    readonly confidence?: number;
    readonly requiredThreshold?: number;
    readonly decision?: string;
    readonly reasonCode?: TradeSkipReasonCode;
    readonly reason?: string;
    readonly requestedNotional?: number;
    readonly requestedQuantity?: number;
    readonly brokerOrderId?: string;
    readonly clientOrderId?: string;
    readonly orderStatus?: string;
    readonly filledQuantity?: number;
    readonly filledAveragePrice?: number;
    readonly cashBefore?: number;
    readonly cashAfter?: number;
    readonly buyingPowerBefore?: number;
    readonly buyingPowerAfter?: number;
    readonly source?: TradeActivity["source"];
    readonly exchangeLocalAt?: string;
  }): TradeActivity {
    const correlationId = input.correlationId ?? randomUUID();
    const occurredAt = isoNow();
    const activity: TradeActivity = {
      id: randomUUID(),
      userId: input.userId,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.scanId ? { scanId: input.scanId } : {}),
      correlationId,
      stage: input.stage,
      triggerType: input.triggerType,
      ...(input.symbol ? { symbol: input.symbol } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(typeof input.confidence === "number" ? { confidence: input.confidence } : {}),
      ...(typeof input.requiredThreshold === "number"
        ? { requiredThreshold: input.requiredThreshold }
        : {}),
      ...(input.decision ? { decision: input.decision } : {}),
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(typeof input.requestedNotional === "number"
        ? { requestedNotional: input.requestedNotional }
        : {}),
      ...(typeof input.requestedQuantity === "number"
        ? { requestedQuantity: input.requestedQuantity }
        : {}),
      ...(input.brokerOrderId ? { brokerOrderId: input.brokerOrderId } : {}),
      ...(input.clientOrderId ? { clientOrderId: input.clientOrderId } : {}),
      ...(input.orderStatus ? { orderStatus: input.orderStatus } : {}),
      ...(typeof input.filledQuantity === "number" ? { filledQuantity: input.filledQuantity } : {}),
      ...(typeof input.filledAveragePrice === "number"
        ? { filledAveragePrice: input.filledAveragePrice }
        : {}),
      ...(typeof input.cashBefore === "number" ? { cashBefore: input.cashBefore } : {}),
      ...(typeof input.cashAfter === "number" ? { cashAfter: input.cashAfter } : {}),
      ...(typeof input.buyingPowerBefore === "number"
        ? { buyingPowerBefore: input.buyingPowerBefore }
        : {}),
      ...(typeof input.buyingPowerAfter === "number"
        ? { buyingPowerAfter: input.buyingPowerAfter }
        : {}),
      headline: formatActivityHeadline({
        stage: input.stage,
        triggerType: input.triggerType,
        ...(input.symbol ? { symbol: input.symbol } : {}),
        ...(input.signal ? { signal: input.signal } : {}),
        ...(typeof input.confidence === "number" ? { confidence: input.confidence } : {}),
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(typeof input.filledQuantity === "number" ? { filledQuantity: input.filledQuantity } : {}),
        ...(typeof input.filledAveragePrice === "number"
          ? { filledAveragePrice: input.filledAveragePrice }
          : {})
      }),
      source:
        input.source ??
        (input.triggerType === "MANUAL_FORCE_SCAN"
          ? "manual"
          : input.triggerType === "SCHEDULED" || input.triggerType === "STARTUP"
            ? "scheduled"
            : "api"),
      occurredAt,
      ...(input.exchangeLocalAt ? { exchangeLocalAt: input.exchangeLocalAt } : {})
    };
    this.activities.unshift(activity);
    if (this.activities.length > this.maxActivities) {
      this.activities.length = this.maxActivities;
    }
    this.store.appendAudit({
      userId: input.userId,
      actorUserId: input.userId,
      action: "TRADE_ACTIVITY",
      entityType: "TRADE_ACTIVITY",
      entityId: activity.id,
      metadata: activity as unknown as JsonObject
    });
    return activity;
  }
}

@Injectable()
export class SchedulerStatusService {
  readonly workerId =
    process.env.RENDER_INSTANCE_ID?.trim() ||
    process.env.HOSTNAME?.trim() ||
    `pid-${process.pid}`;

  private lastScheduledScanAt?: string;
  private lastManualScanAt?: string;
  private nextExpectedScanAt?: string;
  private lastHeartbeatAt?: string;
  private lastResult?: string;
  private lastDurationMs?: number;
  private lastSymbolsEvaluated?: number;
  private lastSignalsGenerated?: number;
  private lastOrdersSubmitted?: number;
  private lastOrdersFilled?: number;
  private lastErrors: string[] = [];
  private scanLocked = false;
  private lockHolder: string | undefined;
  private readonly orderIdempotency = new Set<string>();
  private readonly fillIdempotency = new Set<string>();

  heartbeat(nextExpectedScanAt?: string): void {
    this.lastHeartbeatAt = isoNow();
    if (nextExpectedScanAt) {
      this.nextExpectedScanAt = nextExpectedScanAt;
    }
  }

  tryAcquireScanLock(holder: string): boolean {
    if (this.scanLocked) {
      return false;
    }
    this.scanLocked = true;
    this.lockHolder = holder;
    return true;
  }

  releaseScanLock(holder: string): void {
    if (this.lockHolder === holder) {
      this.scanLocked = false;
      this.lockHolder = undefined;
    }
  }

  isScanLocked(): boolean {
    return this.scanLocked;
  }

  /** Prevent duplicate order submission across overlapping workers/scans. */
  claimOrderIntent(idempotencyKey: string): boolean {
    if (this.orderIdempotency.has(idempotencyKey)) {
      return false;
    }
    this.orderIdempotency.add(idempotencyKey);
    if (this.orderIdempotency.size > 2_000) {
      const first = this.orderIdempotency.values().next().value;
      if (first) {
        this.orderIdempotency.delete(first);
      }
    }
    return true;
  }

  /** Broker fill events are processed once. */
  claimFillEvent(brokerFillId: string): boolean {
    if (this.fillIdempotency.has(brokerFillId)) {
      return false;
    }
    this.fillIdempotency.add(brokerFillId);
    if (this.fillIdempotency.size > 2_000) {
      const first = this.fillIdempotency.values().next().value;
      if (first) {
        this.fillIdempotency.delete(first);
      }
    }
    return true;
  }

  recordScanResult(input: {
    readonly triggerType: ScanTriggerType;
    readonly durationMs: number;
    readonly result: string;
    readonly symbolsEvaluated?: number;
    readonly signalsGenerated?: number;
    readonly ordersSubmitted?: number;
    readonly ordersFilled?: number;
    readonly errors?: readonly string[];
    readonly nextExpectedScanAt?: string;
  }): void {
    const at = isoNow();
    this.lastHeartbeatAt = at;
    this.lastDurationMs = input.durationMs;
    this.lastResult = input.result;
    this.lastSymbolsEvaluated = input.symbolsEvaluated ?? 0;
    this.lastSignalsGenerated = input.signalsGenerated ?? 0;
    this.lastOrdersSubmitted = input.ordersSubmitted ?? 0;
    this.lastOrdersFilled = input.ordersFilled ?? 0;
    this.lastErrors = [...(input.errors ?? [])];
    if (input.triggerType === "MANUAL_FORCE_SCAN") {
      this.lastManualScanAt = at;
    } else {
      this.lastScheduledScanAt = at;
    }
    if (input.nextExpectedScanAt) {
      this.nextExpectedScanAt = input.nextExpectedScanAt;
    }
  }

  getStatus(): SchedulerStatusView {
    const enabled = dondieConfig.schedulerEnabled;
    const scheduleMinutes = Math.max(1, dondieConfig.defaultScheduleMinutes);
    const now = Date.now();
    const heartbeatMs = this.lastHeartbeatAt ? Date.parse(this.lastHeartbeatAt) : NaN;
    const nextMs = this.nextExpectedScanAt ? Date.parse(this.nextExpectedScanAt) : NaN;
    let status: SchedulerStatusView["status"] = "STOPPED";
    if (enabled) {
      if (Number.isFinite(heartbeatMs) && now - heartbeatMs <= scheduleMinutes * 60_000 * 2.5) {
        status = Number.isFinite(nextMs) && now > nextMs + 60_000 ? "DELAYED" : "RUNNING";
      } else if (!this.lastHeartbeatAt) {
        status = "DELAYED";
      } else {
        status = "STOPPED";
      }
    }
    const tradingEnvironment =
      process.env.ALPACA_ENVIRONMENT?.toUpperCase() === "LIVE" ? "LIVE" : "PAPER";
    return {
      status,
      enabled,
      workerId: this.workerId,
      scheduleMinutes,
      ...(this.lastScheduledScanAt ? { lastScheduledScanAt: this.lastScheduledScanAt } : {}),
      ...(this.lastManualScanAt ? { lastManualScanAt: this.lastManualScanAt } : {}),
      ...(this.nextExpectedScanAt ? { nextExpectedScanAt: this.nextExpectedScanAt } : {}),
      ...(this.lastHeartbeatAt ? { lastHeartbeatAt: this.lastHeartbeatAt } : {}),
      ...(this.lastResult ? { lastResult: this.lastResult } : {}),
      ...(typeof this.lastDurationMs === "number" ? { lastDurationMs: this.lastDurationMs } : {}),
      ...(typeof this.lastSymbolsEvaluated === "number"
        ? { lastSymbolsEvaluated: this.lastSymbolsEvaluated }
        : {}),
      ...(typeof this.lastSignalsGenerated === "number"
        ? { lastSignalsGenerated: this.lastSignalsGenerated }
        : {}),
      ...(typeof this.lastOrdersSubmitted === "number"
        ? { lastOrdersSubmitted: this.lastOrdersSubmitted }
        : {}),
      ...(typeof this.lastOrdersFilled === "number"
        ? { lastOrdersFilled: this.lastOrdersFilled }
        : {}),
      ...(this.lastErrors.length > 0 ? { lastErrors: this.lastErrors } : {}),
      tradingEnvironment
    };
  }
}
