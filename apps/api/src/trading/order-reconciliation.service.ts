import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Order, UUID } from "@trading/types";
import { PlatformService } from "../platform.service.js";
import { PlatformStore } from "../store/platform.store.js";

const isoNow = (): string => new Date().toISOString();

export interface ReconciliationCycleResult {
  readonly checked: number;
  readonly updated: number;
  readonly abandoned: number;
  readonly errors: readonly string[];
}

const readSeconds = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Closes the loop between "we submitted an order" and "we know what the broker did with it".
 *
 * Submission polls the broker once. Anything that is still working after that — a market
 * order queued outside RTH, a partial fill, a response we never received — used to sit in
 * SUBMITTED forever: no trade row, no position, and a symbol that the duplicate guard
 * would happily let the next scan buy again. This worker runs on the server on its own
 * timer, so it keeps reconciling whether or not anyone has the dashboard open.
 */
@Injectable()
export class OrderReconciliationService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastRunAt?: string;
  private lastResult?: ReconciliationCycleResult;

  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(PlatformStore) private readonly store: PlatformStore
  ) {}

  onModuleInit(): void {
    if (process.env.ORDER_RECONCILIATION_ENABLED === "false" || process.env.NODE_ENV === "test") {
      return;
    }
    const intervalMs = readSeconds("ORDER_RECONCILE_SECONDS", 60) * 1000;
    // Catch up immediately on boot: a restart mid-flight is exactly when orders go stale.
    void this.reconcileAll();
    this.timer = setInterval(() => {
      void this.reconcileAll();
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  getStatus(): {
    readonly enabled: boolean;
    readonly lastRunAt?: string;
    readonly lastResult?: ReconciliationCycleResult;
  } {
    return {
      enabled: Boolean(this.timer),
      ...(this.lastRunAt ? { lastRunAt: this.lastRunAt } : {}),
      ...(this.lastResult ? { lastResult: this.lastResult } : {})
    };
  }

  /** One pass over every user holding a non-terminal order. */
  async reconcileAll(): Promise<ReconciliationCycleResult> {
    if (this.running) {
      return { checked: 0, updated: 0, abandoned: 0, errors: ["reconciliation already running"] };
    }
    this.running = true;
    let checked = 0;
    let updated = 0;
    let abandoned = 0;
    const errors: string[] = [];
    try {
      for (const userId of this.usersWithWorkingOrders()) {
        try {
          const result = await this.platform.reconcileWorkingOrders(userId);
          checked += result.checked;
          updated += result.updated;
          abandoned += result.abandoned;
          errors.push(...result.errors);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "order reconciliation failed");
        }
      }
    } finally {
      this.running = false;
      this.lastRunAt = isoNow();
      this.lastResult = { checked, updated, abandoned, errors };
    }
    return { checked, updated, abandoned, errors };
  }

  private usersWithWorkingOrders(): readonly UUID[] {
    const userIds = new Set<UUID>();
    for (const order of this.store.orders.values()) {
      if (isWorking(order)) {
        userIds.add(order.userId);
      }
    }
    return [...userIds];
  }
}

export const isWorking = (order: Order): boolean =>
  order.status === "PENDING" || order.status === "SUBMITTED" || order.status === "PARTIALLY_FILLED";
