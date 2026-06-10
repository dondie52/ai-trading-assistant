import { Injectable, OnModuleDestroy } from "@nestjs/common";
import type { UUID } from "@trading/types";
import { dondieConfig } from "./dondie.config.js";

@Injectable()
export class DondieScheduler implements OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private listUserIds: (() => readonly UUID[]) | null = null;
  private runForUser: ((userId: UUID) => Promise<void>) | null = null;

  start(runForUser: (userId: UUID) => Promise<void>, listUserIds: () => readonly UUID[]): void {
    if (!dondieConfig.schedulerEnabled || this.timer) {
      return;
    }
    this.runForUser = runForUser;
    this.listUserIds = listUserIds;
    const intervalMs = Math.max(60_000, dondieConfig.defaultScheduleMinutes * 60_000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<void> {
    if (!this.runForUser || !this.listUserIds) {
      return;
    }
    for (const userId of this.listUserIds()) {
      try {
        await this.runForUser(userId);
      } catch {
        // Scheduled runs should not crash the scheduler.
      }
    }
  }
}
