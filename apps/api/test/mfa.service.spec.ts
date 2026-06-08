import { afterEach, describe, expect, it } from "vitest";
import { MfaService } from "../src/auth/mfa.service.js";
import { TokenService } from "../src/auth/token.service.js";

const previousNodeEnv = process.env.NODE_ENV;
const previousMfaKey = process.env.MFA_ENCRYPTION_KEY;
const previousAccessSecret = process.env.JWT_ACCESS_SECRET;
const previousRefreshSecret = process.env.JWT_REFRESH_SECRET;

afterEach(() => {
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
  if (previousMfaKey === undefined) {
    delete process.env.MFA_ENCRYPTION_KEY;
  } else {
    process.env.MFA_ENCRYPTION_KEY = previousMfaKey;
  }
  if (previousAccessSecret === undefined) {
    delete process.env.JWT_ACCESS_SECRET;
  } else {
    process.env.JWT_ACCESS_SECRET = previousAccessSecret;
  }
  if (previousRefreshSecret === undefined) {
    delete process.env.JWT_REFRESH_SECRET;
  } else {
    process.env.JWT_REFRESH_SECRET = previousRefreshSecret;
  }
});

describe("MFA service", () => {
  it("encrypts TOTP secrets and verifies only valid time-window codes", () => {
    process.env.MFA_ENCRYPTION_KEY = "test-mfa-encryption-key-that-is-at-least-32-characters";
    const service = new MfaService();
    const secret = service.generateSecret();
    const encrypted = service.encryptSecret(secret);
    const timestamp = Date.UTC(2026, 5, 6, 8, 0, 0);
    const code = service.generateCode(secret, timestamp);

    expect(encrypted).not.toContain(secret);
    expect(service.decryptSecret(encrypted)).toBe(secret);
    expect(service.verifyCode(secret, code, timestamp)).toBe(true);
    expect(service.verifyCode(secret, "000000", timestamp)).toBe(false);
    expect(service.buildOtpAuthUri("trader@example.com", secret)).toContain("otpauth://totp/");
  });

  it("fails closed when production authentication secrets are missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.MFA_ENCRYPTION_KEY;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => new MfaService()).toThrow("MFA_ENCRYPTION_KEY");
    expect(() => new TokenService()).toThrow("JWT_ACCESS_SECRET");
  });
});
