import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { UUID } from "@trading/types";
import { dondieConfig } from "./dondie.config.js";

export interface DondieSchedulerTickResult {
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
}

@Injectable()
export class DondieScheduler implements OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private listUserIds: (() => readonly UUID[]) | null = null;
  private runForUser: ((userId: UUID) => Promise<void>) | null = null;
  private ticking = false;

  start(runForUser: (userId: UUID) => Promise<void>, listUserIds: () => readonly UUID[]): void {
    if (!dondieConfig.schedulerEnabled || this.timer) {
      return;
    }
    this.runForUser = runForUser;
    this.listUserIds = listUserIds;
    const intervalMs = Math.max(60_000, dondieConfig.defaultScheduleMinutes * 60_000);
    // Catch up immediately after boot/wake — do not wait a full interval.
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  /** External cron / keepalive wake: run all due ACTIVE agents now. */
  async tickNow(): Promise<DondieSchedulerTickResult> {
    return this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<DondieSchedulerTickResult> {
    if (!this.runForUser || !this.listUserIds) {
      return { attempted: 0, succeeded: 0, failed: 0 };
    }
    if (this.ticking) {
      return { attempted: 0, succeeded: 0, failed: 0 };
    }

    this.ticking = true;
    let succeeded = 0;
    let failed = 0;
    const userIds = this.listUserIds();
    try {
      for (const userId of userIds) {
        try {
          await this.runForUser(userId);
          succeeded += 1;
        } catch {
          // Scheduled runs should not crash the scheduler.
          failed += 1;
        }
      }
    } finally {
      this.ticking = false;
    }

    return { attempted: userIds.length, succeeded, failed };
  }
}
