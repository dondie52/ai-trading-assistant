import { describe, expect, it, vi } from "vitest";
import { RealtimeEventBus } from "../src/realtime/realtime-event-bus.js";

describe("real-time event bus", () => {
  it("publishes typed user-scoped events with immutable routing metadata", () => {
    const bus = new RealtimeEventBus();
    const listener = vi.fn();
    const subscription = bus.subscribe(listener);

    const event = bus.publish({
      userId: "user-1",
      type: "market.price",
      data: {
        timeframe: "1m",
        quote: {
          symbol: "AAPL",
          price: 200,
          bid: 199.99,
          ask: 200.01,
          changePercent: 0.5,
          timestamp: new Date().toISOString(),
          source: "PAPER_SIMULATED"
        }
      }
    });

    expect(event.id).toBeTruthy();
    expect(event.emittedAt).toBeTruthy();
    expect(listener).toHaveBeenCalledWith(event);
    subscription.unsubscribe();
  });
});
