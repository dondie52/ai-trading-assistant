import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DondieAgent, DondieSubscription, UUID } from "@trading/types";
import { PlatformStore } from "../store/platform.store.js";
import { dondieConfig } from "./dondie.config.js";
import { DondieRepository } from "./dondie.repository.js";
import { DondieWalletService } from "./dondie-wallet.service.js";

const isoNow = (): string => new Date().toISOString();

@Injectable()
export class DondieBillingService {
  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(DondieRepository) private readonly repository: DondieRepository,
    @Inject(DondieWalletService) private readonly wallet: DondieWalletService
  ) {}

  listSubscriptions(userId: UUID): readonly DondieSubscription[] {
    return [...this.store.dondieSubscriptions.values()].filter((entry) => entry.userId === userId);
  }

  async subscribe(userId: UUID, agent: DondieAgent): Promise<DondieSubscription> {
    const existing = [...this.store.dondieSubscriptions.values()].find(
      (entry) => entry.userId === userId && entry.status === "ACTIVE"
    );
    if (existing) {
      return existing;
    }

    const now = isoNow();
    const subscription: DondieSubscription = {
      id: randomUUID(),
      userId,
      agentId: agent.id,
      plan: "PRO",
      status: "ACTIVE",
      monthlyPriceUsd: dondieConfig.proSubscriptionPriceUsd,
      externalId: `dondie-sub-${randomUUID()}`,
      revenueCredited: 0,
      createdAt: now,
      updatedAt: now
    };
    this.store.dondieSubscriptions.set(subscription.id, subscription);
    await this.repository.persistSubscription(subscription);

    const creditedAgent = await this.wallet.credit(agent, dondieConfig.proSubscriptionAgentShareUsd, "SUBSCRIPTION_REVENUE", {
      subscriptionId: subscription.id,
      monthlyPriceUsd: subscription.monthlyPriceUsd
    });
    const updatedSubscription: DondieSubscription = {
      ...subscription,
      revenueCredited: dondieConfig.proSubscriptionAgentShareUsd,
      updatedAt: isoNow()
    };
    this.store.dondieSubscriptions.set(subscription.id, updatedSubscription);
    await this.repository.persistSubscription(updatedSubscription);

    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "DONDIE_SUBSCRIPTION_CREATED",
      entityType: "DONDIE_SUBSCRIPTION",
      entityId: subscription.id,
      metadata: {
        agentId: creditedAgent.id,
        monthlyPriceUsd: subscription.monthlyPriceUsd,
        agentShareUsd: dondieConfig.proSubscriptionAgentShareUsd
      }
    });

    return updatedSubscription;
  }

  async cancel(userId: UUID, subscriptionId: UUID): Promise<DondieSubscription> {
    const subscription = this.store.dondieSubscriptions.get(subscriptionId);
    if (!subscription || subscription.userId !== userId) {
      throw new NotFoundException({ code: "DONDIE_SUBSCRIPTION_NOT_FOUND", message: "Subscription not found." });
    }
    if (subscription.status === "CANCELLED") {
      return subscription;
    }

    const updated: DondieSubscription = {
      ...subscription,
      status: "CANCELLED",
      updatedAt: isoNow()
    };
    this.store.dondieSubscriptions.set(subscription.id, updated);
    await this.repository.persistSubscription(updated);
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "DONDIE_SUBSCRIPTION_CANCELLED",
      entityType: "DONDIE_SUBSCRIPTION",
      entityId: subscription.id,
      metadata: {}
    });
    return updated;
  }

  requireActiveProSubscription(userId: UUID): DondieSubscription {
    const subscription = [...this.store.dondieSubscriptions.values()].find(
      (entry) => entry.userId === userId && entry.status === "ACTIVE" && entry.plan === "PRO"
    );
    if (!subscription) {
      throw new BadRequestException({
        code: "DONDIE_SUBSCRIPTION_REQUIRED",
        message: "An active Dondie Pro subscription is required."
      });
    }
    return subscription;
  }
}
