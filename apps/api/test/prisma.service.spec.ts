import { afterEach, describe, expect, it, vi } from "vitest";

const { prismaClientMock } = vi.hoisted(() => {
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const PrismaClient = vi.fn(function MockPrismaClient(this: { $disconnect: typeof disconnect }) {
    this.$disconnect = disconnect;
  });
  return {
    prismaClientMock: {
      PrismaClient,
      disconnect
    }
  };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: prismaClientMock.PrismaClient
}));

import { PrismaService, withConnectTimeout } from "../src/infrastructure/prisma.service.js";

describe("withConnectTimeout", () => {
  it("returns undefined when no database URL is configured", () => {
    expect(withConnectTimeout(undefined)).toBeUndefined();
  });

  it("adds connect_timeout when missing", () => {
    expect(withConnectTimeout("postgresql://user:pass@host:5432/db")).toContain("connect_timeout=5");
  });

  it("preserves an existing connect_timeout", () => {
    expect(withConnectTimeout("postgresql://user:pass@host:5432/db?connect_timeout=2")).toContain(
      "connect_timeout=2"
    );
  });

  it("returns the original string when the URL is invalid", () => {
    expect(withConnectTimeout("not-a-url")).toBe("not-a-url");
  });
});

describe("PrismaService", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  afterEach(async () => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    prismaClientMock.PrismaClient.mockClear();
    prismaClientMock.disconnect.mockClear();
  });

  it("creates a Prisma client with a connect_timeout datasource URL", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    const service = new PrismaService();
    const client = service.client();

    expect(prismaClientMock.PrismaClient).toHaveBeenCalledWith({
      datasources: {
        db: {
          url: expect.stringContaining("connect_timeout=5")
        }
      }
    });
    expect(service.client()).toBe(client);
    expect(prismaClientMock.PrismaClient).toHaveBeenCalledTimes(1);
  });

  it("creates a default Prisma client when DATABASE_URL is unset", () => {
    delete process.env.DATABASE_URL;
    const service = new PrismaService();
    service.client();
    expect(prismaClientMock.PrismaClient).toHaveBeenCalledWith();
  });

  it("disconnects the client on module destroy", async () => {
    delete process.env.DATABASE_URL;
    const service = new PrismaService();
    service.client();
    await service.onModuleDestroy();
    expect(prismaClientMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it("no-ops disconnect when the client was never created", async () => {
    const service = new PrismaService();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(prismaClientMock.disconnect).not.toHaveBeenCalled();
  });
});
