import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

export interface DatabaseHealth {
  readonly mode: "postgresql";
  readonly configured: boolean;
  readonly reachable: boolean;
  readonly status: "not_configured" | "ok" | "error";
}

@Injectable()
export class DatabaseHealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async check(): Promise<DatabaseHealth> {
    if (!process.env.DATABASE_URL) {
      return {
        mode: "postgresql",
        configured: false,
        reachable: false,
        status: "not_configured"
      };
    }

    try {
      await this.prisma.client().$queryRaw`SELECT 1`;
      return {
        mode: "postgresql",
        configured: true,
        reachable: true,
        status: "ok"
      };
    } catch {
      return {
        mode: "postgresql",
        configured: true,
        reachable: false,
        status: "error"
      };
    }
  }

}
