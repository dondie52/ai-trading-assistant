import { afterEach, describe, expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { HttpException, HttpStatus } from "@nestjs/common";
import { RateLimitGuard } from "../src/common/rate-limit.guard.js";

const previousWindow = process.env.RATE_LIMIT_WINDOW_MS;
const previousMax = process.env.RATE_LIMIT_MAX;
const previousDisabled = process.env.RATE_LIMIT_DISABLED;

const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request
    })
  }) as ExecutionContext;

describe("RateLimitGuard", () => {
  afterEach(() => {
    if (previousWindow === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.RATE_LIMIT_WINDOW_MS = previousWindow;
    }
    if (previousMax === undefined) {
      delete process.env.RATE_LIMIT_MAX;
    } else {
      process.env.RATE_LIMIT_MAX = previousMax;
    }
    if (previousDisabled === undefined) {
      delete process.env.RATE_LIMIT_DISABLED;
    } else {
      process.env.RATE_LIMIT_DISABLED = previousDisabled;
    }
  });

  it("blocks requests after the configured window limit", () => {
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_MAX = "1";
    const guard = new RateLimitGuard();
    const context = contextFor({
      method: "POST",
      url: "/api/v1/auth/login",
      ip: "127.0.0.1",
      headers: {},
      socket: {}
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it("can be disabled for controlled environments", () => {
    process.env.RATE_LIMIT_DISABLED = "true";
    process.env.RATE_LIMIT_MAX = "1";
    const guard = new RateLimitGuard();
    const context = contextFor({
      method: "GET",
      url: "/api/v1/health",
      ip: "127.0.0.1",
      headers: {},
      socket: {}
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("never rate-limits Render health probes", () => {
    delete process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_MAX = "1";
    const guard = new RateLimitGuard();
    const context = contextFor({
      method: "GET",
      url: "/api/v1/health",
      route: { path: "/api/v1/health" },
      ip: "127.0.0.1",
      headers: {},
      socket: {}
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });
});
