import type { Order, OrderStatus, UUID } from "@trading/types";

export interface BrokerCredentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly environment?: "PAPER" | "LIVE";
}

export interface BrokerExecutionResult {
  readonly brokerOrderId: UUID;
  readonly status: OrderStatus;
  readonly filledQuantity: number;
  readonly filledAveragePrice: number;
}

export interface BrokerAdapter {
  readonly name: string;
  validateConnection(credentials?: BrokerCredentials): Promise<boolean>;
  submitOrder(order: Order, marketPrice?: number): Promise<BrokerExecutionResult>;
  cancelOrder(orderId: UUID): Promise<OrderStatus>;
}
