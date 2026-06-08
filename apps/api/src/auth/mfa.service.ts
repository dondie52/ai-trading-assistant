import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const totpPeriodSeconds = 30;
const totpDigits = 6;

const requireProductionSecret = (name: string, value: string | undefined): string => {
  if (value && value.length >= 32) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be configured with at least 32 characters in production.`);
  }
  return randomBytes(48).toString("hex");
};

const encodeBase32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }
  return output;
};

const decodeBase32 = (input: string): Buffer => {
  const normalized = input.toUpperCase().replace(/=+$/u, "").replace(/\s+/gu, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) {
      throw new Error("Invalid base32 MFA secret.");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
};

@Injectable()
export class MfaService {
  private readonly encryptionKey = createHash("sha256")
    .update(requireProductionSecret("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY))
    .digest();

  generateSecret(): string {
    return encodeBase32(randomBytes(20));
  }

  buildOtpAuthUri(email: string, secret: string): string {
    const issuer = "QuantCore";
    const label = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${totpDigits}&period=${totpPeriodSeconds}`;
  }

  encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  decryptSecret(payload: string): string {
    const [version, ivValue, tagValue, encryptedValue] = payload.split(".");
    if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
      throw new Error("Invalid encrypted MFA secret.");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }

  generateCode(secret: string, timestampMs = Date.now()): string {
    const counter = Math.floor(timestampMs / 1000 / totpPeriodSeconds);
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
    const offset = digest[digest.length - 1]! & 15;
    const binary =
      ((digest[offset]! & 127) << 24) |
      ((digest[offset + 1]! & 255) << 16) |
      ((digest[offset + 2]! & 255) << 8) |
      (digest[offset + 3]! & 255);
    return String(binary % 10 ** totpDigits).padStart(totpDigits, "0");
  }

  verifyCode(secret: string, code: string, timestampMs = Date.now()): boolean {
    if (!/^\d{6}$/u.test(code)) {
      return false;
    }
    const supplied = Buffer.from(code);
    for (let offset = -1; offset <= 1; offset += 1) {
      const expected = Buffer.from(this.generateCode(secret, timestampMs + offset * totpPeriodSeconds * 1000));
      if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
        return true;
      }
    }
    return false;
  }
}
