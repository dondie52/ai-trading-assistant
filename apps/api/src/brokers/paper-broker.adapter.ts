import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Order, OrderStatus, UUID } from "@trading/types";
import type { BrokerAdapter, BrokerExecutionResult } from "./broker.interface.js";
import {
  logExecutionAttempting,
  logExecutionRejected,
  logExecutionSubmitted
} from "../trading/execution-log.js";

@Injectable()
export class PaperBrokerAdapter implements BrokerAdapter {
  readonly name = "PAPER";

  async validateConnection(): Promise<boolean> {
    return true;
  }

  async submitOrder(order: Order, marketPrice = order.price): Promise<BrokerExecutionResult> {
    logExecutionAttempting({
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity
    });

    if (!(order.quantity > 0)) {
      const reason = "Paper order quantity must be greater than zero.";
      logExecutionRejected(reason);
      throw new Error(reason);
    }
    if (!(marketPrice > 0) && !(order.price > 0)) {
      const reason = "Paper order requires a positive market or limit price.";
      logExecutionRejected(reason);
      throw new Error(reason);
    }

    const marketable =
      order.orderType === "MARKET" ||
      (order.orderType === "LIMIT" &&
        (order.side === "BUY" ? marketPrice <= order.price : marketPrice >= order.price)) ||
      (order.orderType === "STOP" &&
        (order.side === "BUY" ? marketPrice >= order.price : marketPrice <= order.price));

    if (!marketable) {
      const result: BrokerExecutionResult = {
        brokerOrderId: randomUUID(),
        status: "SUBMITTED",
        filledQuantity: 0,
        filledAveragePrice: 0
      };
      logExecutionSubmitted({
        orderId: order.id,
        broker: this.name,
        status: result.status
      });
      return result;
    }

    const fillPrice = marketPrice > 0 ? marketPrice : order.price;
    const result: BrokerExecutionResult = {
      brokerOrderId: randomUUID(),
      status: "FILLED",
      filledQuantity: order.quantity,
      filledAveragePrice: fillPrice
    };
    logExecutionSubmitted({
      orderId: order.id,
      broker: this.name,
      status: result.status
    });
    return result;
  }

  async cancelOrder(_orderId: UUID): Promise<OrderStatus> {
    return "CANCELLED";
  }
}
