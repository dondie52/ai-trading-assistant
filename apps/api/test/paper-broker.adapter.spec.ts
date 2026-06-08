import { describe, expect, it } from "vitest";
import type { Order, OrderType } from "@trading/types";
import { PaperBrokerAdapter } from "../src/brokers/paper-broker.adapter.js";

const order = (orderType: OrderType, side: Order["side"], price: number): Order => ({
  id: "order-1",
  userId: "user-1",
  brokerAccountId: "broker-1",
  symbol: "AAPL",
  side,
  orderType,
  mode: "MANUAL",
  quantity: 2,
  price,
  stopLoss: side === "BUY" ? price - 5 : price + 5,
  takeProfit: side === "BUY" ? price + 10 : price - 10,
  status: "SUBMITTED",
  submittedAt: new Date().toISOString(),
  riskDecision: {
    approved: true,
    reasons: [],
    maxRiskAmount: 1_000,
    proposedRiskAmount: 10,
    proposedPositionValue: 400,
    calculatedQuantity: 2
  }
});

describe("paper broker execution semantics", () => {
  const broker = new PaperBrokerAdapter();

  it("fills market orders at the broker-observed market price", async () => {
    const execution = await broker.submitOrder(order("MARKET", "BUY", 190), 200);
    expect(execution).toMatchObject({
      status: "FILLED",
      filledQuantity: 2,
      filledAveragePrice: 200
    });
  });

  it("keeps limit and stop orders submitted until their trigger is reached", async () => {
    await expect(broker.submitOrder(order("LIMIT", "BUY", 195), 200)).resolves.toMatchObject({
      status: "SUBMITTED",
      filledQuantity: 0
    });
    await expect(broker.submitOrder(order("LIMIT", "BUY", 195), 194)).resolves.toMatchObject({
      status: "FILLED",
      filledAveragePrice: 194
    });
    await expect(broker.submitOrder(order("STOP", "SELL", 190), 195)).resolves.toMatchObject({
      status: "SUBMITTED"
    });
    await expect(broker.submitOrder(order("STOP", "SELL", 190), 189)).resolves.toMatchObject({
      status: "FILLED",
      filledAveragePrice: 189
    });
  });
});
