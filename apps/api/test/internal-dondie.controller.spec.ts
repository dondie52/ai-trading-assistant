import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InternalDondieController } from "../src/dondie/internal-dondie.controller.js";

describe("InternalDondieController", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("rejects when CRON_SECRET is not configured", async () => {
    const dondie = { tickDueAgents: vi.fn() };
    const controller = new InternalDondieController(dondie as never);
    await expect(controller.tick(undefined, "anything")).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
    expect(dondie.tickDueAgents).not.toHaveBeenCalled();
  });

  it("rejects an invalid secret", async () => {
    process.env.CRON_SECRET = "expected-secret";
    const dondie = { tickDueAgents: vi.fn() };
    const controller = new InternalDondieController(dondie as never);
    await expect(controller.tick(undefined, "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.tick("Bearer wrong", undefined)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("ticks due agents when X-Cron-Secret or Bearer matches", async () => {
    process.env.CRON_SECRET = "expected-secret";
    const dondie = {
      tickDueAgents: vi.fn().mockResolvedValue({ attempted: 2, succeeded: 2, failed: 0 })
    };
    const controller = new InternalDondieController(dondie as never);

    const viaHeader = await controller.tick(undefined, "expected-secret");
    expect(viaHeader.data).toEqual({ attempted: 2, succeeded: 2, failed: 0 });

    const viaBearer = await controller.tick("Bearer expected-secret", undefined);
    expect(viaBearer.data).toEqual({ attempted: 2, succeeded: 2, failed: 0 });
    expect(dondie.tickDueAgents).toHaveBeenCalledTimes(2);
  });
});
