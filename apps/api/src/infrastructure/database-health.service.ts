import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

export interface DatabaseHealth {
  readonly mode: "supabase";
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
        mode: "supabase",
        configured: false,
        reachable: false,
        status: "not_configured"
      };
    }

    try {
      await this.prisma.client().$queryRaw`SELECT 1`;
      return {
        mode: "supabase",
        configured: true,
        reachable: true,
        status: "ok"
      };
    } catch {
      return {
        mode: "supabase",
        configured: true,
        reachable: false,
        status: "error"
      };
    }
  }

}
