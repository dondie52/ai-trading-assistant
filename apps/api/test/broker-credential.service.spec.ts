import { afterEach, describe, expect, it } from "vitest";
import { BrokerCredentialService } from "../src/brokers/broker-credential.service.js";

describe("broker credential encryption", () => {
  const previousKey = process.env.BROKER_CREDENTIAL_ENCRYPTION_KEY;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env.BROKER_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.BROKER_CREDENTIAL_ENCRYPTION_KEY = previousKey;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("round-trips credentials using authenticated encryption", () => {
    process.env.BROKER_CREDENTIAL_ENCRYPTION_KEY =
      "test-broker-encryption-key-that-is-at-least-32-characters";
    const service = new BrokerCredentialService();
    const encrypted = service.encrypt("broker-secret-value");

    expect(encrypted).not.toContain("broker-secret-value");
    expect(service.decrypt(encrypted)).toBe("broker-secret-value");
  });

  it("fails closed when the production encryption key is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.BROKER_CREDENTIAL_ENCRYPTION_KEY;
    expect(() => new BrokerCredentialService()).toThrow(/BROKER_CREDENTIAL_ENCRYPTION_KEY/u);
  });
});
