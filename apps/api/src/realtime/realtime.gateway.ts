import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Inject, OnModuleDestroy } from "@nestjs/common";
import type { MarketTimeframe, RealtimeError, RealtimeEvent, UUID } from "@trading/types";
import { Server, Socket } from "socket.io";
import type { Subscription } from "rxjs";
import { TokenService } from "../auth/token.service.js";
import { SessionActivityService } from "../auth/session-activity.service.js";
import { PlatformService } from "../platform.service.js";
import { RealtimeEventBus } from "./realtime-event-bus.js";
import { allowedCorsOrigins } from "../common/cors.js";

interface ClientToServerEvents {
  "market:subscribe": (payload: MarketSubscription) => void;
}

interface ServerToClientEvents {
  "realtime:event": (event: RealtimeEvent) => void;
  "realtime:error": (error: RealtimeError) => void;
}

interface SocketData {
  userId: UUID;
  sessionId: UUID;
}

interface MarketSubscription {
  readonly symbols?: readonly string[];
  readonly timeframe?: MarketTimeframe;
}

const marketTimeframes = new Set<MarketTimeframe>(["1m", "5m", "15m", "1h", "4h", "1d"]);
const userRoom = (userId: UUID): string => `user:${userId}`;

@WebSocketGateway({
  path: "/ws",
  cors: {
    origin: allowedCorsOrigins(),
    methods: ["GET", "POST"]
  }
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

  private eventSubscription?: Subscription;
  private sessionWatchdog?: NodeJS.Timeout;
  private readonly quoteTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(TokenService)
    private readonly tokens: TokenService,
    @Inject(SessionActivityService)
    private readonly sessions: SessionActivityService,
    @Inject(PlatformService)
    private readonly platform: PlatformService,
    @Inject(RealtimeEventBus)
    private readonly eventBus: RealtimeEventBus
  ) {}

  afterInit(): void {
    this.eventSubscription = this.eventBus.subscribe((event) => {
      this.server.to(userRoom(event.userId)).emit("realtime:event", event);
    });
    this.sessionWatchdog = setInterval(() => {
      for (const client of this.server.sockets.sockets.values()) {
        const { userId, sessionId } = client.data;
        if (!userId || !sessionId) {
          client.disconnect(true);
          continue;
        }
        void this.sessions.assertActive(userId, sessionId, false).catch(() => {
          client.emit("realtime:error", {
            code: "INVALID_SESSION",
            message: "The real-time session expired."
          });
          client.disconnect(true);
        });
      }
    }, 30_000);
  }

  async handleConnection(
    client: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
  ): Promise<void> {
    try {
      const rawToken = client.handshake.auth.token;
      if (typeof rawToken !== "string" || rawToken.length === 0) {
        throw new Error("Authentication token is required.");
      }
      const principal = this.tokens.verifyAccessToken(rawToken);
      await this.sessions.assertActive(principal.sub, principal.sessionId);

      client.data.userId = principal.sub;
      client.data.sessionId = principal.sessionId;
      void client.join(userRoom(principal.sub));
    } catch {
      client.emit("realtime:error", {
        code: "UNAUTHORIZED",
        message: "A valid active session is required for real-time updates."
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(
    client: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
  ): void {
    this.clearQuoteTimer(client.id);
  }

  @SubscribeMessage("market:subscribe")
  async subscribeToMarket(
    @ConnectedSocket()
    client: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
    @MessageBody() payload: MarketSubscription
  ): Promise<void> {
    if (!client.data.userId) {
      client.disconnect(true);
      return;
    }
    await this.sessions.assertActive(client.data.userId, client.data.sessionId);

    const symbols = [...new Set((payload.symbols ?? []).map((symbol) => symbol.trim().toUpperCase()))]
      .filter((symbol) => /^[A-Z][A-Z0-9.-]{0,15}$/u.test(symbol))
      .slice(0, 20);
    const timeframe = payload.timeframe ?? "1m";
    if (symbols.length === 0 || !marketTimeframes.has(timeframe)) {
      client.emit("realtime:error", {
        code: "INVALID_SUBSCRIPTION",
        message: "Provide one to twenty valid symbols and a supported timeframe."
      });
      return;
    }

    this.clearQuoteTimer(client.id);
    const publishQuotes = async (): Promise<void> => {
      for (const symbol of symbols) {
        const quote = await this.platform.getMarketQuoteForUser(
          client.data.userId,
          symbol,
          timeframe as "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
        );
        this.eventBus.publish({
          userId: client.data.userId,
          type: "market.price",
          data: { quote, timeframe }
        });
      }
    };
    void publishQuotes();
    this.quoteTimers.set(client.id, setInterval(() => void publishQuotes(), 5_000));
  }

  onModuleDestroy(): void {
    this.eventSubscription?.unsubscribe();
    if (this.sessionWatchdog) {
      clearInterval(this.sessionWatchdog);
    }
    for (const timer of this.quoteTimers.values()) {
      clearInterval(timer);
    }
    this.quoteTimers.clear();
  }

  private clearQuoteTimer(clientId: string): void {
    const timer = this.quoteTimers.get(clientId);
    if (timer) {
      clearInterval(timer);
      this.quoteTimers.delete(clientId);
    }
  }
}
