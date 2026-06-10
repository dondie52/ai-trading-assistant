export type UUID = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type UserRole = "TRADER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type StrategyStatus = "ACTIVE" | "INACTIVE";
export type SignalType = "BUY" | "SELL" | "HOLD";
export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type OrderStatus =
  | "PENDING"
  | "SUBMITTED"
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "CANCELLED"
  | "REJECTED";
export type TradingMode = "MANUAL" | "SEMI_AUTO" | "AUTO";
export type NotificationType = "TRADE" | "SIGNAL" | "RISK" | "SYSTEM";
export type MarketTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface PaginatedResult<T> {
  readonly data: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface NotificationPreferences {
  readonly trade: boolean;
  readonly signal: boolean;
  readonly risk: boolean;
  readonly system: boolean;
}

export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
}

export interface ApiFailure {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: JsonObject;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PublicUser {
  readonly id: UUID;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly mfaEnabled: boolean;
  readonly mfaGraceUntil?: string;
  readonly mustChangePassword?: boolean;
  readonly notificationPreferences: NotificationPreferences;
  readonly createdAt: string;
}

export interface AdminCreateUserInput {
  readonly email: string;
  readonly password: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly role?: UserRole;
}

export interface AdminCreateUserResult {
  readonly user: PublicUser;
  readonly temporaryPassword: string;
}

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly refreshExpiresAt: string;
  readonly mfaRequired: boolean;
  readonly user: PublicUser;
}

export interface PasswordResetRequestResult {
  readonly requested: true;
  readonly expiresInMinutes: number;
  readonly delivery: "email" | "development_response";
  readonly resetToken?: string;
}

export interface PasswordResetConfirmResult {
  readonly reset: true;
  readonly sessionsRevoked: number;
}

export interface MfaSetup {
  readonly secret: string;
  readonly otpAuthUri: string;
}

export interface BrokerAccountView {
  readonly id: UUID;
  readonly userId: UUID;
  readonly brokerName: "PAPER" | "ALPACA";
  readonly accountId: string;
  readonly status: "CONNECTED" | "DISCONNECTED";
  readonly hasCredentials: boolean;
  readonly createdAt: string;
}

export interface Portfolio {
  readonly id: UUID;
  readonly userId: UUID;
  readonly portfolioName: string;
  readonly portfolioValue: number;
  readonly cashBalance: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly createdAt: string;
}

export interface Strategy {
  readonly id: UUID;
  readonly userId: UUID;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly status: StrategyStatus;
  readonly configuration: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Signal {
  readonly id: UUID;
  readonly userId: UUID;
  readonly strategyId: UUID;
  readonly symbol: string;
  readonly signalType: SignalType;
  readonly confidenceScore: number;
  readonly modelVersion: string;
  readonly features: JsonObject;
  readonly generatedAt: string;
}

export interface Order {
  readonly id: UUID;
  readonly userId: UUID;
  readonly brokerAccountId: UUID;
  readonly strategyId?: UUID;
  readonly signalId?: UUID;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly orderType: OrderType;
  readonly mode: TradingMode;
  readonly quantity: number;
  readonly price: number;
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly status: OrderStatus;
  readonly submittedAt: string;
  readonly riskDecision: RiskDecision;
}

export interface OrderStatusEvent {
  readonly id: UUID;
  readonly orderId: UUID;
  readonly userId: UUID;
  readonly status: OrderStatus;
  readonly metadata: JsonObject;
  readonly occurredAt: string;
}

export interface OrderExecutionPayload {
  readonly order: Order;
  readonly trade?: Trade;
  readonly position?: Position;
  readonly portfolio: Portfolio;
  readonly riskDecision: RiskDecision;
}

export interface AutomationRunResult {
  readonly status: "EXECUTED" | "SKIPPED";
  readonly mode: "AUTO";
  readonly strategyId: UUID;
  readonly symbol: string;
  readonly signal: Signal;
  readonly reason?: string;
  readonly execution?: OrderExecutionPayload;
}

export interface Trade {
  readonly id: UUID;
  readonly orderId: UUID;
  readonly userId: UUID;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly entryPrice: number;
  readonly exitPrice?: number;
  readonly pnl: number;
  readonly openedAt: string;
  readonly closedAt?: string;
}

export interface Position {
  readonly id: UUID;
  readonly userId: UUID;
  readonly symbol: string;
  readonly quantity: number;
  readonly averagePrice: number;
  readonly unrealizedPnl: number;
  readonly updatedAt: string;
}

export interface RiskRules {
  readonly id: UUID;
  readonly userId: UUID;
  readonly maxRiskPerTradePercent: number;
  readonly maxDailyLossPercent: number;
  readonly maxDrawdownPercent: number;
  readonly maxPositionSizePercent: number;
  readonly stopTrading: boolean;
  readonly updatedAt: string;
}

export interface RiskDecision {
  readonly approved: boolean;
  readonly reasons: readonly string[];
  readonly maxRiskAmount: number;
  readonly proposedRiskAmount: number;
  readonly proposedPositionValue: number;
  readonly calculatedQuantity: number;
}

export interface Notification {
  readonly id: UUID;
  readonly userId: UUID;
  readonly notificationType: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly status: "UNREAD" | "READ";
  readonly createdAt: string;
}

export interface AuditLog {
  readonly id: UUID;
  readonly userId?: UUID;
  readonly actorUserId?: UUID;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: UUID;
  readonly metadata: JsonObject;
  readonly createdAt: string;
}

export interface MarketCandle {
  readonly symbol: string;
  readonly timeframe: MarketTimeframe;
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface MarketQuote {
  readonly symbol: string;
  readonly price: number;
  readonly bid: number;
  readonly ask: number;
  readonly changePercent: number;
  readonly timestamp: string;
  readonly source: "ALPACA" | "UNAVAILABLE";
}

export interface IndicatorSnapshot {
  readonly sma: number | null;
  readonly ema: number | null;
  readonly rsi: number | null;
  readonly macd: {
    readonly macd: number | null;
    readonly signal: number | null;
    readonly histogram: number | null;
  };
  readonly bollingerBands: {
    readonly upper: number | null;
    readonly middle: number | null;
    readonly lower: number | null;
  };
  readonly atr: number | null;
  readonly volume: {
    readonly latest: number | null;
    readonly sma: number | null;
    readonly changePercent: number | null;
  };
}

export interface PerformanceSummary {
  readonly winRate: number;
  readonly profitFactor: number;
  readonly sharpeRatio: number;
  readonly sortinoRatio: number;
  readonly maxDrawdown: number;
  readonly totalReturn: number;
  readonly averageTrade: number;
  readonly riskRewardRatio: number;
  readonly equityCurve: readonly number[];
}

export interface BacktestTrade {
  readonly symbol: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly pnl: number;
  readonly openedAt: string;
  readonly closedAt: string;
  readonly fees: number;
  readonly slippage: number;
}

export interface BacktestResult {
  readonly id?: UUID;
  readonly userId?: UUID;
  readonly strategyId?: UUID;
  readonly symbol: string;
  readonly timeframe: MarketTimeframe;
  readonly startingEquity: number;
  readonly endingEquity: number;
  readonly totalTrades: number;
  readonly fees: number;
  readonly slippagePercent: number;
  readonly performance: PerformanceSummary;
  readonly trades: readonly BacktestTrade[];
  readonly generatedAt: string;
}

export interface WalkForwardWindow {
  readonly index: number;
  readonly trainingStart: string;
  readonly trainingEnd: string;
  readonly testingStart: string;
  readonly testingEnd: string;
  readonly selectedFastPeriod: number;
  readonly selectedSlowPeriod: number;
  readonly trainingReturn: number;
  readonly result: BacktestResult;
}

export interface WalkForwardResult {
  readonly id?: UUID;
  readonly userId?: UUID;
  readonly strategyId?: UUID;
  readonly symbol: string;
  readonly timeframe: MarketTimeframe;
  readonly trainSize: number;
  readonly testSize: number;
  readonly startingEquity: number;
  readonly endingEquity: number;
  readonly totalTrades: number;
  readonly performance: PerformanceSummary;
  readonly windows: readonly WalkForwardWindow[];
  readonly generatedAt: string;
}

export interface PerformanceReport {
  readonly fileName: string;
  readonly contentType: "text/csv" | "application/pdf";
  readonly contentBase64: string;
  readonly generatedAt: string;
  readonly summary: PerformanceSummary;
}

export interface OperationalMetricsSnapshot {
  readonly generatedAt: string;
  readonly api: {
    readonly requestCount: number;
    readonly errorCount: number;
    readonly errorRatePercent: number;
    readonly averageLatencyMs: number;
    readonly p95LatencyMs: number;
  };
  readonly signals: {
    readonly total: number;
    readonly throughputPerMinute: number;
    readonly averageLatencyMs: number;
    readonly p95LatencyMs: number;
    readonly averageConfidence: number;
    readonly byType: {
      readonly BUY: number;
      readonly SELL: number;
      readonly HOLD: number;
    };
    readonly modelVersions: readonly string[];
  };
  readonly trades: {
    readonly requested: number;
    readonly executed: number;
    readonly rejected: number;
    readonly submitted: number;
    readonly successRatePercent: number;
    readonly averageLatencyMs: number;
    readonly p95LatencyMs: number;
  };
  readonly notificationQueue: {
    readonly configured: boolean;
    readonly depth: number | null;
  };
}

interface RealtimeEventBase<TType extends string, TData> {
  readonly id: UUID;
  readonly userId: UUID;
  readonly type: TType;
  readonly data: TData;
  readonly emittedAt: string;
}

export type RealtimeEvent =
  | RealtimeEventBase<
      "market.price",
      {
        readonly quote: MarketQuote;
        readonly timeframe: MarketTimeframe;
      }
    >
  | RealtimeEventBase<"signal.updated", { readonly signal: Signal }>
  | RealtimeEventBase<
      "order.updated",
      {
        readonly order: Order;
        readonly statusEvent: OrderStatusEvent;
      }
    >
  | RealtimeEventBase<
      "trade.executed",
      { readonly trade: Trade } | { readonly order: Order; readonly portfolio: Portfolio }
    >
  | RealtimeEventBase<"notification.created", { readonly notification: Notification }>;

export interface RealtimeError {
  readonly code: string;
  readonly message: string;
}
