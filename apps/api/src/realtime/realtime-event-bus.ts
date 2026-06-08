import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Subject, type Subscription } from "rxjs";
import type { RealtimeEvent } from "@trading/types";

type RealtimeEventInput = RealtimeEvent extends infer TEvent
  ? TEvent extends RealtimeEvent
    ? Omit<TEvent, "id" | "emittedAt">
    : never
  : never;

@Injectable()
export class RealtimeEventBus {
  private readonly events = new Subject<RealtimeEvent>();

  publish(input: RealtimeEventInput): RealtimeEvent {
    const event = {
      ...input,
      id: randomUUID(),
      emittedAt: new Date().toISOString()
    } as RealtimeEvent;
    this.events.next(event);
    return event;
  }

  subscribe(listener: (event: RealtimeEvent) => void): Subscription {
    return this.events.subscribe(listener);
  }
}
