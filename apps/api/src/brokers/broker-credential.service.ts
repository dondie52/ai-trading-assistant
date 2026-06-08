import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

const resolveEncryptionKey = (): string => {
  const configured = process.env.BROKER_CREDENTIAL_ENCRYPTION_KEY;
  if (configured && configured.length >= 32) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BROKER_CREDENTIAL_ENCRYPTION_KEY must be configured with at least 32 characters in production."
    );
  }
  return randomBytes(48).toString("hex");
};

@Injectable()
export class BrokerCredentialService {
  private readonly encryptionKey = createHash("sha256")
    .update(resolveEncryptionKey())
    .digest();

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, encrypted]
      .map((part) => part.toString("base64url"))
      .join(".");
  }

  decrypt(value: string): string {
    const [ivValue, authTagValue, encryptedValue] = value.split(".");
    if (!ivValue || !authTagValue || !encryptedValue) {
      throw new Error("Encrypted broker credential is malformed.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(ivValue, "base64url")
    );
    decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }
}
