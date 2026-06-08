import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Order, OrderStatus, UUID } from "@trading/types";
import type { BrokerAdapter, BrokerExecutionResult } from "./broker.interface.js";

@Injectable()
export class PaperBrokerAdapter implements BrokerAdapter {
  readonly name = "PAPER";

  async validateConnection(): Promise<boolean> {
    return true;
  }

  async submitOrder(order: Order, marketPrice = order.price): Promise<BrokerExecutionResult> {
    const marketable =
      order.orderType === "MARKET" ||
      (order.orderType === "LIMIT" &&
        (order.side === "BUY" ? marketPrice <= order.price : marketPrice >= order.price)) ||
      (order.orderType === "STOP" &&
        (order.side === "BUY" ? marketPrice >= order.price : marketPrice <= order.price));

    if (!marketable) {
      return {
        brokerOrderId: randomUUID(),
        status: "SUBMITTED",
        filledQuantity: 0,
        filledAveragePrice: 0
      };
    }

    return {
      brokerOrderId: randomUUID(),
      status: "FILLED",
      filledQuantity: order.quantity,
      filledAveragePrice: marketPrice
    };
  }

  async cancelOrder(_orderId: UUID): Promise<OrderStatus> {
    return "CANCELLED";
  }
}
