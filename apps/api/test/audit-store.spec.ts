import { describe, expect, it } from "vitest";
import type { AuditLog } from "@trading/types";
import { PlatformStore } from "../src/store/platform.store.js";

describe("audit store boundary", () => {
  it("redacts sensitive metadata before storing or persisting audit logs", () => {
    const persisted: AuditLog[] = [];
    const store = new PlatformStore();
    store.setAuditSink({
      persist: (log) => {
        persisted.push(log);
        return Promise.resolve();
      }
    });

    const log = store.appendAudit({
      action: "BROKER_CONNECTED",
      entityType: "BROKER_ACCOUNT",
      metadata: {
        apiKey: "should-not-appear",
        nested: {
          refreshToken: "also-secret",
          symbol: "AAPL"
        }
      }
    });

    expect(log.metadata).toEqual({
      apiKey: "[REDACTED]",
      nested: {
        refreshToken: "[REDACTED]",
        symbol: "AAPL"
      }
    });
    expect(persisted[0]?.metadata).toEqual(log.metadata);
    expect(JSON.stringify(log.metadata)).not.toContain("should-not-appear");
    expect(JSON.stringify(log.metadata)).not.toContain("also-secret");
  });
});

