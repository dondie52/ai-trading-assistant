import { Injectable } from "@nestjs/common";
import type { MarketCandle, MarketTimeframe, Order, OrderStatus, UUID } from "@trading/types";
import {
  cancelAlpacaOrder,
  fetchAlpacaAccount,
  fetchAlpacaBars,
  fetchAlpacaLatestQuote,
  fetchAlpacaPositions,
  resolveEnvAlpacaCredentials,
  submitAlpacaOrder,
  validateAlpacaConnection,
  type AlpacaAccount,
  type AlpacaPosition
} from "./alpaca-client.js";
import type {
  BrokerAdapter,
  BrokerCredentials,
  BrokerExecutionResult
} from "./broker.interface.js";

@Injectable()
export class AlpacaBrokerAdapter implements BrokerAdapter {
  readonly name = "ALPACA";

  resolveCredentials(credentials?: BrokerCredentials): BrokerCredentials | undefined {
    if (credentials?.apiKey && credentials.secret) {
      return credentials;
    }
    return resolveEnvAlpacaCredentials();
  }

  async validateConnection(credentials?: BrokerCredentials): Promise<boolean> {
    const resolved = this.resolveCredentials(credentials);
    if (!resolved) {
      return false;
    }
    return validateAlpacaConnection(resolved);
  }

  async getAccount(credentials?: BrokerCredentials): Promise<AlpacaAccount> {
    const resolved = this.resolveCredentials(credentials);
    if (!resolved) {
      throw new Error("Alpaca credentials are not configured.");
    }
    return fetchAlpacaAccount(resolved);
  }

  async getPositions(credentials?: BrokerCredentials): Promise<readonly AlpacaPosition[]> {
    const resolved = this.resolveCredentials(credentials);
    if (!resolved) {
      throw new Error("Alpaca credentials are not configured.");
    }
    return fetchAlpacaPositions(resolved);
  }

  async getBars(
    symbol: string,
    timeframe: MarketTimeframe,
    credentials?: BrokerCredentials
  ): Promise<readonly MarketCandle[]> {
    const resolved = this.resolveCredentials(credentials);
    if (!resolved) {
      throw new Error("Alpaca credentials are not configured.");
    }
    return fetchAlpacaBars(resolved, symbol, timeframe);
  }

  async getLatestQuote(
    symbol: string,
    credentials?: BrokerCredentials
  ): Promise<{ readonly price: number; readonly bid: number; readonly ask: number; readonly timestamp: string }> {
    const resolved = this.resolveCredentials(credentials);
    if (!resolved) {
      throw new Error("Alpaca credentials are not configured.");
    }
    return fetchAlpacaLatestQuote(resolved, symbol);
  }

  async submitOrder(order: Order, marketPrice?: number, credentials?: BrokerCredentials): Promise<BrokerExecutionResult> {
    const resolved = this.resolveCredentials(credentials);
    if (!resolved) {
      throw new Error("Alpaca credentials are not configured.");
    }
    if (resolved.environment === "LIVE" && process.env.ALLOW_ALPACA_LIVE_TRADING !== "true") {
      throw new Error("Alpaca live trading is disabled. Set ALLOW_ALPACA_LIVE_TRADING=true to enable.");
    }
    const result = await submitAlpacaOrder(resolved, order, marketPrice);
    return {
      brokerOrderId: result.brokerOrderId as UUID,
      status: result.status,
      filledQuantity: result.filledQuantity,
      filledAveragePrice: result.filledAveragePrice
    };
  }

  async cancelOrder(orderId: UUID, credentials?: BrokerCredentials): Promise<OrderStatus> {
    const resolved = this.resolveCredentials(credentials);
    if (!resolved) {
      throw new Error("Alpaca credentials are not configured.");
    }
    return cancelAlpacaOrder(resolved, orderId);
  }
}
