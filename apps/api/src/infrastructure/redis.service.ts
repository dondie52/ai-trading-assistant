import { Injectable } from "@nestjs/common";
import { Socket } from "node:net";

type RedisCommand = readonly string[];

const encodeCommand = (parts: RedisCommand): string =>
  `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;

@Injectable()
export class RedisService {
  isConfigured(): boolean {
    return Boolean(process.env.REDIS_URL);
  }

  async ping(): Promise<void> {
    await this.send(["PING"]);
  }

  async rpush(key: string, value: string): Promise<void> {
    await this.send(["RPUSH", key, value]);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.send(["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)]);
  }

  async llen(key: string): Promise<number | null> {
    if (!this.isConfigured()) {
      return null;
    }
    const response = await this.send(["LLEN", key]);
    const matches = [...response.matchAll(/:(-?\d+)\r\n/g)];
    const raw = matches.at(-1)?.[1];
    return raw === undefined ? null : Number(raw);
  }

  private send(command: RedisCommand): Promise<string> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return Promise.resolve("");
    }

    const url = new URL(redisUrl);
    const host = url.hostname || "localhost";
    const port = Number(url.port || 6379);
    const database = url.pathname.length > 1 ? url.pathname.slice(1) : "";
    const commands: RedisCommand[] = [];

    if (url.password) {
      commands.push(["AUTH", decodeURIComponent(url.password)]);
    }
    if (database) {
      commands.push(["SELECT", database]);
    }
    commands.push(command);

    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Redis command timed out."));
      }, 1_500);

      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      socket.once("data", (chunk) => {
        clearTimeout(timer);
        socket.end();
        const response = chunk.toString();
        if (response.includes("-ERR") || response.includes("-NOAUTH") || response.includes("-WRONGPASS")) {
          reject(new Error("Redis command failed."));
          return;
        }
        resolve(response);
      });

      socket.connect(port, host, () => {
        socket.write(commands.map(encodeCommand).join(""));
      });
    });
  }
}
