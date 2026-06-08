import { describe, expect, it } from "vitest";
import { normalizeEmail, validateLogin, validatePassword, validateRegistration } from "./auth.js";

describe("auth validation", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  Trader@Example.COM ")).toBe("trader@example.com");
  });

  it("requires a strong password", () => {
    const result = validatePassword("weak");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it("validates registration input", () => {
    const result = validateRegistration({
      email: "user@example.com",
      password: "ValidPass123!"
    });

    expect(result.valid).toBe(true);
  });

  it("rejects empty login passwords", () => {
    expect(validateLogin("user@example.com", "").valid).toBe(false);
  });
});

