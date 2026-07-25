import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

export interface DatabaseHealth {
  readonly mode: "supabase";
  readonly configured: boolean;
  readonly reachable: boolean;
  readonly status: "not_configured" | "ok" | "error";
}

const DEFAULT_CHECK_TIMEOUT_MS = 1_500;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Database health check timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

@Injectable()
export class DatabaseHealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async check(timeoutMs = DEFAULT_CHECK_TIMEOUT_MS): Promise<DatabaseHealth> {
    if (!process.env.DATABASE_URL) {
      return {
        mode: "supabase",
        configured: false,
        reachable: false,
        status: "not_configured"
      };
    }

    try {
      await withTimeout(this.prisma.client().$queryRaw`SELECT 1`, timeoutMs);
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
