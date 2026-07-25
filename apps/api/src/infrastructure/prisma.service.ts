import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

const withConnectTimeout = (databaseUrl: string | undefined): string | undefined => {
  if (!databaseUrl) {
    return databaseUrl;
  }
  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has("connect_timeout")) {
      // Fail fast on cold/paused Postgres instead of hanging Render health beyond 5s.
      url.searchParams.set("connect_timeout", "5");
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
};

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private prisma?: PrismaClient;

  client(): PrismaClient {
    if (!this.prisma) {
      const datasourceUrl = withConnectTimeout(process.env.DATABASE_URL);
      this.prisma = datasourceUrl
        ? new PrismaClient({ datasources: { db: { url: datasourceUrl } } })
        : new PrismaClient();
    }
    return this.prisma;
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma?.$disconnect();
  }
}

