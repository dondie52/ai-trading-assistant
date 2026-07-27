import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import type { UUID } from "@trading/types";
import { dondieConfig } from "./dondie.config.js";
import { SchedulerStatusService } from "./trade-activity.service.js";

export interface DondieSchedulerTickResult {
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly locked?: boolean;
  readonly triggerType?: "SCHEDULED" | "API_REQUEST" | "STARTUP";
}

@Injectable()
export class DondieScheduler implements OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private listUserIds: (() => readonly UUID[]) | null = null;
  private runForUser: ((userId: UUID) => Promise<void>) | null = null;
  private ticking = false;
  private readonly schedulerStatus: SchedulerStatusService;

  constructor(
    @Optional() @Inject(SchedulerStatusService) schedulerStatus?: SchedulerStatusService
  ) {
    this.schedulerStatus = schedulerStatus ?? new SchedulerStatusService();
  }

  start(runForUser: (userId: UUID) => Promise<void>, listUserIds: () => readonly UUID[]): void {
    if (!dondieConfig.schedulerEnabled || this.timer) {
      return;
    }
    this.runForUser = runForUser;
    this.listUserIds = listUserIds;
    const intervalMs = Math.max(60_000, dondieConfig.defaultScheduleMinutes * 60_000);
    this.schedulerStatus.heartbeat(new Date(Date.now() + intervalMs).toISOString());
    // Catch up immediately after boot/wake — do not wait a full interval.
    void this.tick("STARTUP");
    this.timer = setInterval(() => {
      void this.tick("SCHEDULED");
    }, intervalMs);
  }

  /** External cron / keepalive wake: run all due ACTIVE agents now. */
  async tickNow(): Promise<DondieSchedulerTickResult> {
    return this.tick("API_REQUEST");
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(
    triggerType: "SCHEDULED" | "API_REQUEST" | "STARTUP"
  ): Promise<DondieSchedulerTickResult> {
    if (!this.runForUser || !this.listUserIds) {
      return { attempted: 0, succeeded: 0, failed: 0, triggerType };
    }
    if (this.ticking || this.schedulerStatus.isScanLocked()) {
      return { attempted: 0, succeeded: 0, failed: 0, locked: true, triggerType };
    }

    const lockHolder = `${this.schedulerStatus.workerId}:${triggerType}:${Date.now()}`;
    if (!this.schedulerStatus.tryAcquireScanLock(lockHolder)) {
      return { attempted: 0, succeeded: 0, failed: 0, locked: true, triggerType };
    }

    this.ticking = true;
    const started = Date.now();
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];
    const userIds = this.listUserIds();
    const intervalMs = Math.max(60_000, dondieConfig.defaultScheduleMinutes * 60_000);
    try {
      for (const userId of userIds) {
        try {
          await this.runForUser(userId);
          succeeded += 1;
        } catch (error) {
          failed += 1;
          errors.push(error instanceof Error ? error.message : "scheduled run failed");
        }
      }
    } finally {
      this.ticking = false;
      this.schedulerStatus.releaseScanLock(lockHolder);
      const nextExpectedScanAt = new Date(Date.now() + intervalMs).toISOString();
      this.schedulerStatus.recordScanResult({
        triggerType: triggerType === "API_REQUEST" ? "SCHEDULED" : triggerType,
        durationMs: Date.now() - started,
        result: failed > 0 ? "PARTIAL_FAILURE" : "OK",
        symbolsEvaluated: userIds.length,
        errors,
        nextExpectedScanAt
      });
      this.schedulerStatus.heartbeat(nextExpectedScanAt);
    }

    return { attempted: userIds.length, succeeded, failed, triggerType };
  }
}
