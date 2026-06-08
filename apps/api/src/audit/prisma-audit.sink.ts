import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuditLog } from "@trading/types";
import type { AuditSink } from "./audit-sink.js";
import { PrismaService } from "../infrastructure/prisma.service.js";

@Injectable()
export class PrismaAuditSink implements AuditSink {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async persist(log: AuditLog): Promise<void> {
    if (!process.env.DATABASE_URL) {
      return;
    }

    await this.prisma.client().auditLog.create({
      data: {
        id: log.id,
        userId: log.userId ?? null,
        actorUserId: log.actorUserId ?? null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId ?? null,
        metadata: log.metadata as Prisma.InputJsonValue,
        createdAt: new Date(log.createdAt)
      }
    });
  }
}
