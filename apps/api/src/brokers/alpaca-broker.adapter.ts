import { Injectable } from "@nestjs/common";
import type { Order, OrderStatus, UUID } from "@trading/types";
import type {
  BrokerAdapter,
  BrokerCredentials,
  BrokerExecutionResult
} from "./broker.interface.js";

@Injectable()
export class AlpacaBrokerAdapter implements BrokerAdapter {
  readonly name = "ALPACA";

  async validateConnection(credentials?: BrokerCredentials): Promise<boolean> {
    const apiKey = credentials?.apiKey ?? process.env.ALPACA_API_KEY;
    const secret = credentials?.secret ?? process.env.ALPACA_SECRET_KEY;
    if (!apiKey || !secret) {
      return false;
    }

    const baseUrl =
      credentials?.environment === "LIVE"
        ? "https://api.alpaca.markets"
        : "https://paper-api.alpaca.markets";
    try {
      const response = await fetch(`${baseUrl}/v2/account`, {
        headers: {
          "APCA-API-KEY-ID": apiKey,
          "APCA-API-SECRET-KEY": secret
        },
        signal: AbortSignal.timeout(5_000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async submitOrder(_order: Order, _marketPrice?: number): Promise<BrokerExecutionResult> {
    throw new Error("Alpaca live trading is intentionally disabled in the MVP runtime.");
  }

  async cancelOrder(_orderId: UUID): Promise<OrderStatus> {
    throw new Error("Alpaca live trading is intentionally disabled in the MVP runtime.");
  }
}
