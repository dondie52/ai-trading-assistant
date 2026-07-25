import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
  UnprocessableEntityException
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { Buffer } from "node:buffer";
import { randomBytes, randomUUID } from "node:crypto";
import type {
  AuditLog,
  AutomationRunResult,
  AuthTokens,
  BacktestResult,
  BrokerAccountView,
  IndicatorSnapshot,
  JsonObject,
  MarketCandle,
  MarketQuote,
  MarketTimeframe,
  MfaSetup,
  Notification,
  NotificationPreferences,
  Order,
  OrderExecutionPayload,
  OrderSide,
  OrderStatusEvent,
  OrderType,
  OperationalMetricsSnapshot,
  PasswordResetConfirmResult,
  PasswordResetRequestResult,
  PerformanceSummary,
  PerformanceReport,
  Portfolio,
  Position,
  PublicUser,
  RiskRules,
  RiskDecision,
  Signal,
  Strategy,
  StrategyStatus,
  Trade,
  TradingMode,
  UUID,
  WalkForwardResult
} from "@trading/types";
import {
  calculateIndicators,
  generateSignal,
  normalizeEmail,
  generateHistoricalPrices,
  runHistoricalBacktest,
  runWalkForwardBacktest,
  summarizePerformance,
  validateEmail,
  validateLogin,
  validatePassword,
  validateTradeRisk
} from "@trading/shared";
import { PaperBrokerAdapter } from "./brokers/paper-broker.adapter.js";
import { AlpacaBrokerAdapter } from "./brokers/alpaca-broker.adapter.js";
import { BrokerCredentialService } from "./brokers/broker-credential.service.js";
import type { BrokerAdapter, BrokerCredentials, BrokerExecutionResult } from "./brokers/broker.interface.js";
import { resolveEnvAlpacaCredentials } from "./brokers/alpaca-client.js";
import { isSupabaseAuth, readMfaGraceDays } from "./auth/auth-provider.js";
import { MfaService } from "./auth/mfa.service.js";
import { TokenService } from "./auth/token.service.js";
import { SessionActivityService } from "./auth/session-activity.service.js";
import { SupabaseAdminService } from "./auth/supabase-admin.service.js";
import { PrismaAuditSink } from "./audit/prisma-audit.sink.js";
import { DatabaseHealthService } from "./infrastructure/database-health.service.js";
import { PrismaPlatformRepository } from "./infrastructure/prisma-platform.repository.js";
import { SupabaseCacheQueueService } from "./infrastructure/supabase-cache-queue.service.js";
import { OperationalMetricsService } from "./monitoring/operational-metrics.service.js";
import { RealtimeEventBus } from "./realtime/realtime-event-bus.js";
import {
  PlatformStore,
  type BrokerAccount,
  type PasswordResetTokenRecord,
  type UserRecord,
  defaultNotificationPreferences,
  type Watchlist
} from "./store/platform.store.js";

const isoNow = (): string => new Date().toISOString();
const passwordResetExpiresInMinutes = 30;
const canExposePasswordResetToken = (): boolean =>
  process.env.NODE_ENV !== "production" && process.env.EXPOSE_PASSWORD_RESET_TOKEN_FOR_TESTS === "true";
const marketTimeframes = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const marketDataKey = (symbol: string, timeframe: MarketTimeframe): string => `${symbol.toUpperCase()}:${timeframe}`;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Request body must be an object." });
  }
  return value as Record<string, unknown>;
};

const readString = (
  body: Record<string, unknown>,
  key: string,
  options: { readonly required?: boolean; readonly max?: number } = {}
): string => {
  const value = body[key];
  if (value === undefined || value === null) {
    if (options.required) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} is required.` });
    }
    return "";
  }
  if (typeof value !== "string") {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} must be a string.` });
  }
  const trimmed = value.trim();
  if (options.required && trimmed.length === 0) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} is required.` });
  }
  if (options.max !== undefined && trimmed.length > options.max) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} is too long.` });
  }
  return trimmed;
};

const readNumber = (
  body: Record<string, unknown>,
  key: string,
  options: { readonly required?: boolean; readonly min?: number } = {}
): number => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (options.required) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} is required.` });
    }
    return 0;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} must be a number.` });
  }
  if (options.min !== undefined && value < options.min) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} must be at least ${options.min}.` });
  }
  return value;
};

const readJsonObject = (value: unknown): JsonObject => {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: "configuration must be an object." });
  }
  return value as JsonObject;
};

const readEnum = <T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T
): T => {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} is invalid.` });
};

const readConfigNumber = (configuration: JsonObject, key: string, fallback: number): number => {
  const value = configuration[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const readPercentSetting = (
  body: Record<string, unknown>,
  configuration: JsonObject,
  key: string,
  fallback: number
): number => {
  const value = body[key] === undefined ? readConfigNumber(configuration, key, fallback) : readNumber(body, key, { min: 0.01 });
  if (value > 100) {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: `${key} must be 100 or less.` });
  }
  return value;
};

const readLatestClose = (signal: Signal, candles: readonly MarketCandle[]): number => {
  const latestClose = signal.features.latestClose;
  if (typeof latestClose === "number" && latestClose > 0) {
    return latestClose;
  }
  const lastCandle = candles[candles.length - 1];
  if (lastCandle) {
    return lastCandle.close;
  }
  throw new UnprocessableEntityException({
    code: "MARKET_DATA_UNAVAILABLE",
    message: "A valid latest close price is required for automated execution."
  });
};

const normalizeMarketTimeframe = (value: unknown): MarketTimeframe => {
  if (value === undefined || value === null || value === "") {
    return "1m";
  }
  if (typeof value === "string" && marketTimeframes.includes(value as MarketTimeframe)) {
    return value as MarketTimeframe;
  }
  throw new BadRequestException({
    code: "VALIDATION_ERROR",
    message: `timeframe must be one of ${marketTimeframes.join(", ")}.`
  });
};

const normalizeReportFormat = (value: unknown): "csv" | "pdf" => {
  if (typeof value !== "string") {
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: "format must be csv or pdf." });
  }
  const normalized = value.toLowerCase();
  if (normalized === "csv" || normalized === "pdf") {
    return normalized;
  }
  throw new BadRequestException({ code: "VALIDATION_ERROR", message: "format must be csv or pdf." });
};

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
};

const buildPerformanceCsv = (summary: PerformanceSummary): string => {
  const metricRows = [
    ["metric", "value"],
    ["winRate", summary.winRate],
    ["profitFactor", summary.profitFactor],
    ["sharpeRatio", summary.sharpeRatio],
    ["sortinoRatio", summary.sortinoRatio],
    ["maxDrawdown", summary.maxDrawdown],
    ["totalReturn", summary.totalReturn],
    ["averageTrade", summary.averageTrade],
    ["riskRewardRatio", summary.riskRewardRatio],
    [],
    ["equityIndex", "equity"],
    ...summary.equityCurve.map((equity, index) => [index, equity])
  ];
  return `${metricRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
};

const escapePdfText = (value: string): string => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const buildMinimalPdf = (lines: readonly string[]): string => {
  const textCommands = lines
    .slice(0, 34)
    .map((line, index) => `${index === 0 ? "72 740 Td" : "0 -18 Td"} (${escapePdfText(line)}) Tj`)
    .join("\n");
  const stream = `BT\n/F1 12 Tf\n${textCommands}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`
  ];
  const offsets = [0];
  let document = "%PDF-1.4\n";
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document, "ascii"));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`).join("");
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return document;
};

const notificationPreferenceKey = (type: Notification["notificationType"]): keyof NotificationPreferences => {
  switch (type) {
    case "TRADE":
      return "trade";
    case "SIGNAL":
      return "signal";
    case "RISK":
      return "risk";
    case "SYSTEM":
      return "system";
  }
};

const readNotificationPreferences = (
  value: unknown,
  fallback: NotificationPreferences
): NotificationPreferences => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "notificationPreferences must be an object."
    });
  }
  const record = value as Record<string, unknown>;
  const readPreference = (key: keyof NotificationPreferences): boolean => {
    const preference = record[key];
    if (preference === undefined) {
      return fallback[key];
    }
    if (typeof preference !== "boolean") {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: `notificationPreferences.${key} must be a boolean.`
      });
    }
    return preference;
  };
  return {
    trade: readPreference("trade"),
    signal: readPreference("signal"),
    risk: readPreference("risk"),
    system: readPreference("system")
  };
};

const sanitizeUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  status: user.status,
  mfaEnabled: user.mfaEnabled,
  ...(user.mfaGraceUntil ? { mfaGraceUntil: user.mfaGraceUntil } : {}),
  ...(user.mustChangePassword !== undefined ? { mustChangePassword: user.mustChangePassword } : {}),
  notificationPreferences: user.notificationPreferences,
  createdAt: user.createdAt
});

@Injectable()
export class PlatformService implements OnModuleInit {
  constructor(
    @Inject(PlatformStore)
    private readonly store: PlatformStore,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
    @Inject(MfaService)
    private readonly mfaService: MfaService,
    @Inject(PaperBrokerAdapter)
    private readonly paperBroker: PaperBrokerAdapter,
    @Inject(AlpacaBrokerAdapter)
    private readonly alpacaBroker: AlpacaBrokerAdapter,
    @Inject(BrokerCredentialService)
    private readonly brokerCredentials: BrokerCredentialService,
    @Inject(SessionActivityService)
    private readonly sessionActivity: SessionActivityService,
    @Inject(DatabaseHealthService)
    private readonly databaseHealth: DatabaseHealthService,
    @Inject(PrismaAuditSink)
    private readonly auditSink: PrismaAuditSink,
    @Inject(PrismaPlatformRepository)
    private readonly platformRepository: PrismaPlatformRepository,
    @Inject(SupabaseCacheQueueService)
    private readonly supabaseCacheQueue: SupabaseCacheQueueService,
    @Inject(OperationalMetricsService)
    private readonly operationalMetrics: OperationalMetricsService,
    @Inject(RealtimeEventBus)
    private readonly realtime: RealtimeEventBus,
    @Inject(SupabaseAdminService)
    private readonly supabaseAdmin: SupabaseAdminService
  ) {
    this.store.setAuditSink(this.auditSink);
  }

  async onModuleInit(): Promise<void> {
    this.assertProductionConfiguration();
    await this.platformRepository.hydrate(this.store);
    this.repairMissingUserBootstrap();
    await this.seedE2EAdminUser();
  }

  private assertProductionConfiguration(): void {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (process.env.ENABLE_E2E_SEED === "true") {
      throw new Error("ENABLE_E2E_SEED must not be enabled when NODE_ENV=production.");
    }
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error("DATABASE_URL is required when NODE_ENV=production.");
    }
  }

  /**
   * Hydrated users can miss portfolio/risk/watchlist rows after older
   * provision paths or failed persists. Rebuild empty operational defaults
   * (never auto-create a PAPER broker in production).
   */
  private repairMissingUserBootstrap(): void {
    for (const user of this.store.users.values()) {
      const hadRisk = [...this.store.riskRules.values()].some((rules) => rules.userId === user.id);
      const hadPortfolio = [...this.store.portfolios.values()].some(
        (portfolio) => portfolio.userId === user.id
      );
      const hadWatchlist = [...this.store.watchlists.values()].some(
        (watchlist) => watchlist.userId === user.id
      );
      const brokerCountBefore = [...this.store.brokerAccounts.values()].filter(
        (account) => account.userId === user.id
      ).length;
      this.store.ensureDefaultAccountState(user.id);
      const brokerCountAfter = [...this.store.brokerAccounts.values()].filter(
        (account) => account.userId === user.id
      ).length;
      // Persist when operational defaults were missing, or when E2E seed added a paper broker.
      if (!hadRisk || !hadPortfolio || !hadWatchlist || brokerCountAfter !== brokerCountBefore) {
        this.persistUserBootstrap(user.id);
      }
    }
  }

  private persist(task: Promise<unknown>): void {
    void task.catch(() => undefined);
  }

  private addNotification(input: {
    readonly userId: UUID;
    readonly notificationType: Notification["notificationType"];
    readonly title: string;
    readonly message: string;
  }): Notification | undefined {
    const user = this.store.users.get(input.userId);
    const preferences = user?.notificationPreferences ?? defaultNotificationPreferences;
    if (!preferences[notificationPreferenceKey(input.notificationType)]) {
      return undefined;
    }

    const notification = this.store.addNotification(input);
    this.realtime.publish({
      userId: notification.userId,
      type: "notification.created",
      data: { notification }
    });
    this.persist(
      Promise.all([
        this.platformRepository.persistNotification(notification),
        this.supabaseCacheQueue.enqueueNotification(notification)
      ])
    );
    return notification;
  }

  private persistUserBootstrap(userId: UUID): void {
    this.persist(this.persistUserBootstrapNow(userId));
  }

  private async persistUserBootstrapNow(userId: UUID): Promise<void> {
    const user = this.store.users.get(userId);
    if (!user) {
      return;
    }

    await this.platformRepository.persistUserBootstrap({
      user,
      portfolios: this.listPortfolios(userId),
      brokerAccounts: this.listBrokerAccountRecords(userId),
      riskRules: [this.getRiskRules(userId)],
      watchlists: this.listWatchlists(userId)
    });
  }

  private async seedE2EAdminUser(): Promise<void> {
    if (process.env.ENABLE_E2E_SEED !== "true") {
      return;
    }

    const adminEmail = process.env.E2E_ADMIN_EMAIL;
    const adminPassword = process.env.E2E_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      return;
    }

    const email = normalizeEmail(adminEmail);
    const existing = [...this.store.users.values()].find((user) => user.email === email);
    const passwordHash = await hash(adminPassword, 10);
    const now = isoNow();
    const admin: UserRecord = existing
      ? {
          ...existing,
          passwordHash,
          firstName: existing.firstName || "E2E",
          lastName: existing.lastName || "Admin",
          role: "ADMIN",
          status: "ACTIVE",
          updatedAt: now
        }
      : this.store.createUser({
          email,
          passwordHash,
          firstName: "E2E",
          lastName: "Admin",
          role: "ADMIN"
        });

    if (existing) {
      this.store.users.set(admin.id, admin);
      this.store.ensureDefaultAccountState(admin.id);
    }

    await this.persistUserBootstrapNow(admin.id);
    this.store.appendAudit({
      userId: admin.id,
      actorUserId: admin.id,
      action: "E2E_ADMIN_SEEDED",
      entityType: "USER",
      entityId: admin.id,
      metadata: { email: admin.email, persisted: this.platformRepository.isEnabled() }
    });
  }

  parseMarketTimeframe(value: unknown): MarketTimeframe {
    return normalizeMarketTimeframe(value);
  }

  async register(_bodyValue: unknown): Promise<{ readonly user: PublicUser }> {
    throw new ForbiddenException({
      code: "REGISTRATION_DISABLED",
      message: "Self-registration is disabled. Contact an administrator for access."
    });
  }

  async login(bodyValue: unknown): Promise<AuthTokens> {
    if (isSupabaseAuth()) {
      throw new ForbiddenException({
        code: "LEGACY_LOGIN_DISABLED",
        message: "Sign in with your Supabase-provisioned account via the web client."
      });
    }

    const body = asRecord(bodyValue);
    const email = normalizeEmail(readString(body, "email", { required: true, max: 255 }));
    const password = readString(body, "password", { required: true, max: 256 });
    const validation = validateLogin(email, password);

    if (!validation.valid) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: validation.errors.join(" ")
      });
    }

    const user = [...this.store.users.values()].find((candidate) => candidate.email === email);
    if (!user || !user.passwordHash || !(await compare(password, user.passwordHash))) {
      this.store.appendAudit({
        action: "AUTH_LOGIN_FAILED",
        entityType: "USER",
        metadata: { email }
      });
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    }

    if (user.status !== "ACTIVE") {
      throw new ForbiddenException({ code: "USER_SUSPENDED", message: "User account is not active." });
    }

    if (user.mfaEnabled) {
      const mfaCode = readString(body, "mfaCode", { max: 6 });
      if (!user.mfaSecretEncrypted) {
        this.store.appendAudit({
          userId: user.id,
          actorUserId: user.id,
          action: "AUTH_MFA_CONFIGURATION_INVALID",
          entityType: "USER",
          entityId: user.id,
          metadata: {}
        });
        throw new UnauthorizedException({
          code: "MFA_CONFIGURATION_INVALID",
          message: "Multi-factor authentication must be reconfigured."
        });
      }
      if (!mfaCode) {
        this.store.appendAudit({
          userId: user.id,
          actorUserId: user.id,
          action: "AUTH_MFA_REQUIRED",
          entityType: "USER",
          entityId: user.id,
          metadata: {}
        });
        throw new UnauthorizedException({
          code: "MFA_REQUIRED",
          message: "Enter the six-digit authenticator code."
        });
      }

      let mfaValid = false;
      try {
        mfaValid = this.mfaService.verifyCode(
          this.mfaService.decryptSecret(user.mfaSecretEncrypted),
          mfaCode
        );
      } catch {
        mfaValid = false;
      }
      if (!mfaValid) {
        this.store.appendAudit({
          userId: user.id,
          actorUserId: user.id,
          action: "AUTH_MFA_FAILED",
          entityType: "USER",
          entityId: user.id,
          metadata: {}
        });
        throw new UnauthorizedException({
          code: "INVALID_MFA_CODE",
          message: "The authenticator code is invalid or expired."
        });
      }
    }

    const sessionId = randomUUID();
    const principal = { sub: user.id, email: user.email, role: user.role, sessionId };
    const accessToken = this.tokenService.signAccessToken(principal);
    const refreshToken = this.tokenService.signRefreshToken(principal);
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const sessionCreatedAt = isoNow();
    const session = {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: this.tokenService.hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      lastActivityAt: sessionCreatedAt,
      createdAt: sessionCreatedAt
    };
    this.store.sessions.set(sessionId, session);
    this.persist(this.platformRepository.persistSession(session));

    this.store.appendAudit({
      userId: user.id,
      actorUserId: user.id,
      action: "AUTH_LOGIN",
      entityType: "SESSION",
      entityId: sessionId,
      metadata: { mfaVerified: user.mfaEnabled }
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: 900,
      refreshExpiresAt,
      mfaRequired: false,
      user: sanitizeUser(user)
    };
  }

  logout(userId: UUID, sessionId: UUID): { readonly loggedOut: true } {
    const session = this.store.sessions.get(sessionId);
    if (session && session.userId === userId) {
      session.revokedAt = isoNow();
      this.persist(this.platformRepository.persistSession(session));
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "AUTH_LOGOUT",
        entityType: "SESSION",
        entityId: session.id,
        metadata: {}
      });
    }
    return { loggedOut: true };
  }

  async refresh(bodyValue: unknown): Promise<AuthTokens> {
    const body = asRecord(bodyValue);
    const refreshToken = readString(body, "refreshToken", { required: true });
    const principal = this.tokenService.verifyRefreshToken(refreshToken);
    const session = this.store.sessions.get(principal.sessionId);

    if (
      !session ||
      session.userId !== principal.sub ||
      session.revokedAt !== undefined ||
      session.refreshTokenHash !== this.tokenService.hashToken(refreshToken) ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      throw new UnauthorizedException({ code: "INVALID_SESSION", message: "Refresh session is invalid." });
    }
    await this.sessionActivity.assertActive(principal.sub, principal.sessionId);

    const user = this.requireUser(principal.sub);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id
    });
    const rotatedRefreshToken = this.tokenService.signRefreshToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id
    });
    session.refreshTokenHash = this.tokenService.hashToken(rotatedRefreshToken);
    await this.platformRepository.persistSession(session);

    this.store.appendAudit({
      userId: user.id,
      actorUserId: user.id,
      action: "AUTH_REFRESH",
      entityType: "SESSION",
      entityId: session.id,
      metadata: { rotated: true }
    });

    return {
      accessToken,
      refreshToken: rotatedRefreshToken,
      expiresInSeconds: 900,
      refreshExpiresAt: session.expiresAt,
      mfaRequired: false,
      user: sanitizeUser(user)
    };
  }

  async setupMfa(userId: UUID): Promise<MfaSetup> {
    const user = this.requireUser(userId);
    if (user.mfaEnabled) {
      throw new ConflictException({
        code: "MFA_ALREADY_ENABLED",
        message: "Multi-factor authentication is already enabled."
      });
    }

    const secret = this.mfaService.generateSecret();
    const updated: UserRecord = {
      ...user,
      mfaSecretEncrypted: this.mfaService.encryptSecret(secret),
      updatedAt: isoNow()
    };
    this.store.users.set(userId, updated);
    await this.platformRepository.persistUser(updated);
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "MFA_SETUP_STARTED",
      entityType: "USER",
      entityId: userId,
      metadata: {}
    });
    return {
      secret,
      otpAuthUri: this.mfaService.buildOtpAuthUri(user.email, secret)
    };
  }

  async enableMfa(userId: UUID, currentSessionId: UUID, bodyValue: unknown): Promise<PublicUser> {
    const body = asRecord(bodyValue);
    const code = readString(body, "code", { required: true, max: 6 });
    const user = this.requireUser(userId);
    if (!user.mfaSecretEncrypted) {
      throw new BadRequestException({
        code: "MFA_SETUP_REQUIRED",
        message: "Start MFA setup before enabling it."
      });
    }

    let valid = false;
    try {
      valid = this.mfaService.verifyCode(this.mfaService.decryptSecret(user.mfaSecretEncrypted), code);
    } catch {
      valid = false;
    }
    if (!valid) {
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "MFA_ENABLE_FAILED",
        entityType: "USER",
        entityId: userId,
        metadata: {}
      });
      throw new UnauthorizedException({
        code: "INVALID_MFA_CODE",
        message: "The authenticator code is invalid or expired."
      });
    }

    const updated: UserRecord = {
      ...user,
      mfaEnabled: true,
      updatedAt: isoNow()
    };
    this.store.users.set(userId, updated);
    await this.platformRepository.persistUser(updated);
    await this.revokeOtherSessions(userId, currentSessionId);
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "MFA_ENABLED",
      entityType: "USER",
      entityId: userId,
      metadata: {}
    });
    return sanitizeUser(updated);
  }

  async disableMfa(userId: UUID, currentSessionId: UUID, bodyValue: unknown): Promise<PublicUser> {
    const body = asRecord(bodyValue);
    const code = readString(body, "code", { required: true, max: 6 });
    const user = this.requireUser(userId);
    if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new BadRequestException({
        code: "MFA_NOT_ENABLED",
        message: "Multi-factor authentication is not enabled."
      });
    }
    let valid = false;
    try {
      valid = this.mfaService.verifyCode(this.mfaService.decryptSecret(user.mfaSecretEncrypted), code);
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException({
        code: "INVALID_MFA_CODE",
        message: "The authenticator code is invalid or expired."
      });
    }

    const { mfaSecretEncrypted: removedSecret, ...withoutSecret } = user;
    void removedSecret;
    const updated: UserRecord = {
      ...withoutSecret,
      mfaEnabled: false,
      updatedAt: isoNow()
    };
    this.store.users.set(userId, updated);
    await this.platformRepository.persistUser(updated);
    await this.revokeOtherSessions(userId, currentSessionId);
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "MFA_DISABLED",
      entityType: "USER",
      entityId: userId,
      metadata: {}
    });
    return sanitizeUser(updated);
  }

  async requestPasswordReset(bodyValue: unknown): Promise<PasswordResetRequestResult> {
    const body = asRecord(bodyValue);
    const email = normalizeEmail(readString(body, "email", { required: true, max: 255 }));
    const validation = validateEmail(email);
    if (!validation.valid) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: validation.errors.join(" ")
      });
    }

    const user = [...this.store.users.values()].find((candidate) => candidate.email === email);
    let resetToken: string | undefined;

    if (user?.status === "ACTIVE") {
      resetToken = randomBytes(32).toString("base64url");
      const now = isoNow();
      const resetRecord: PasswordResetTokenRecord = {
        id: randomUUID(),
        userId: user.id,
        tokenHash: this.tokenService.hashToken(resetToken),
        expiresAt: new Date(Date.now() + passwordResetExpiresInMinutes * 60 * 1000).toISOString(),
        createdAt: now
      };
      this.store.passwordResetTokens.set(resetRecord.id, resetRecord);
      this.persist(this.platformRepository.persistPasswordResetToken(resetRecord));
      this.store.appendAudit({
        userId: user.id,
        actorUserId: user.id,
        action: "AUTH_PASSWORD_RESET_REQUESTED",
        entityType: "USER",
        entityId: user.id,
        metadata: { email, expiresAt: resetRecord.expiresAt }
      });
      this.addNotification({
        userId: user.id,
        notificationType: "SYSTEM",
        title: "Password reset requested",
        message: "A password reset request was created for your account."
      });
    } else {
      this.store.appendAudit({
        action: "AUTH_PASSWORD_RESET_REQUESTED_UNKNOWN",
        entityType: "USER",
        metadata: { email }
      });
    }

    const base = {
      requested: true as const,
      expiresInMinutes: passwordResetExpiresInMinutes
    };

    if (canExposePasswordResetToken()) {
      return {
        ...base,
        delivery: "development_response",
        ...(resetToken ? { resetToken } : {})
      };
    }

    return {
      ...base,
      delivery: "email"
    };
  }

  async confirmPasswordReset(bodyValue: unknown): Promise<PasswordResetConfirmResult> {
    const body = asRecord(bodyValue);
    const resetToken = readString(body, "resetToken", { required: true, max: 256 });
    const password = readString(body, "password", { required: true, max: 256 });
    const validation = validatePassword(password);
    if (!validation.valid) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: validation.errors.join(" ")
      });
    }

    const tokenHash = this.tokenService.hashToken(resetToken);
    const resetRecord = [...this.store.passwordResetTokens.values()].find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        candidate.usedAt === undefined &&
        Date.parse(candidate.expiresAt) > Date.now()
    );

    if (!resetRecord) {
      this.store.appendAudit({
        action: "AUTH_PASSWORD_RESET_FAILED",
        entityType: "PASSWORD_RESET_TOKEN",
        metadata: { reason: "invalid_or_expired" }
      });
      throw new UnauthorizedException({ code: "INVALID_RESET_TOKEN", message: "Password reset token is invalid." });
    }

    const user = this.requireUser(resetRecord.userId);
    const now = isoNow();
    const updated: UserRecord = {
      ...user,
      passwordHash: await hash(password, 10),
      updatedAt: now
    };
    this.store.users.set(updated.id, updated);
    this.persist(this.platformRepository.persistUser(updated));

    resetRecord.usedAt = now;
    this.persist(this.platformRepository.persistPasswordResetToken(resetRecord));

    let sessionsRevoked = 0;
    for (const session of this.store.sessions.values()) {
      if (session.userId === user.id && session.revokedAt === undefined) {
        session.revokedAt = now;
        sessionsRevoked += 1;
        this.persist(this.platformRepository.persistSession(session));
      }
    }

    this.store.appendAudit({
      userId: user.id,
      actorUserId: user.id,
      action: "AUTH_PASSWORD_RESET_CONFIRMED",
      entityType: "USER",
      entityId: user.id,
      metadata: { sessionsRevoked }
    });
    this.addNotification({
      userId: user.id,
      notificationType: "SYSTEM",
      title: "Password reset complete",
      message: "Your password was changed and active sessions were revoked."
    });

    return {
      reset: true,
      sessionsRevoked
    };
  }

  getMe(userId: UUID): PublicUser {
    return sanitizeUser(this.requireUser(userId));
  }

  updateProfile(userId: UUID, bodyValue: unknown): PublicUser {
    const body = asRecord(bodyValue);
    const existing = this.requireUser(userId);
    const firstName = readString(body, "firstName", { max: 80 }) || existing.firstName;
    const lastName = readString(body, "lastName", { max: 80 }) || existing.lastName;
    const notificationPreferences = readNotificationPreferences(
      body.notificationPreferences,
      existing.notificationPreferences
    );
    const updatedFields = [
      ...(firstName !== existing.firstName ? ["firstName"] : []),
      ...(lastName !== existing.lastName ? ["lastName"] : []),
      ...(body.notificationPreferences === undefined ? [] : ["notificationPreferences"])
    ];
    const updated: UserRecord = {
      ...existing,
      firstName,
      lastName,
      notificationPreferences,
      updatedAt: isoNow()
    };
    this.store.users.set(userId, updated);
    this.persist(this.platformRepository.persistUser(updated));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "PROFILE_UPDATED",
      entityType: "USER",
      entityId: userId,
      metadata: { fields: updatedFields }
    });
    return sanitizeUser(updated);
  }

  listPortfolios(userId: UUID): readonly Portfolio[] {
    return [...this.store.portfolios.values()].filter((portfolio) => portfolio.userId === userId);
  }

  async listPortfoliosFresh(userId: UUID): Promise<readonly Portfolio[]> {
    await this.syncAlpacaState(userId);
    return this.listPortfolios(userId);
  }

  deleteAccount(userId: UUID): { readonly deleted: true } {
    const existing = this.requireUser(userId);
    this.store.users.set(userId, {
      ...existing,
      status: "SUSPENDED",
      updatedAt: isoNow()
    });
    this.persist(this.platformRepository.persistUser(this.requireUser(userId)));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "ACCOUNT_DELETED",
      entityType: "USER",
      entityId: userId,
      metadata: {}
    });
    return { deleted: true };
  }

  listBrokerAccounts(userId: UUID): readonly BrokerAccountView[] {
    return this.listBrokerAccountRecords(userId).map((account) => this.sanitizeBrokerAccount(account));
  }

  async connectBroker(userId: UUID, bodyValue: unknown): Promise<BrokerAccountView> {
    const body = asRecord(bodyValue);
    const brokerName = readEnum<BrokerAccount["brokerName"]>(body, "brokerName", ["PAPER", "ALPACA"], "PAPER");
    const accountId = readString(body, "accountId", { max: 120 }) || `${brokerName.toLowerCase()}-${userId.slice(0, 8)}`;
    const environment = readEnum(body, "environment", ["PAPER", "LIVE"] as const, "PAPER");

    if (brokerName === "PAPER") {
      const existing = this.listBrokerAccountRecords(userId).find((account) => account.brokerName === "PAPER");
      if (existing) {
        return this.sanitizeBrokerAccount(existing);
      }
    }

    let encryptedApiKey: string | undefined;
    let encryptedSecret: string | undefined;
    let resolvedAccountId = accountId;
    if (brokerName === "ALPACA") {
      const apiKey = readString(body, "apiKey", { required: true, max: 256 });
      const secret = readString(body, "secret", { required: true, max: 256 });
      const credentials: BrokerCredentials = { apiKey, secret, environment };
      const valid = await this.alpacaBroker.validateConnection(credentials);
      if (!valid) {
        this.store.appendAudit({
          userId,
          actorUserId: userId,
          action: "BROKER_CONNECTION_REJECTED",
          entityType: "BROKER_ACCOUNT",
          metadata: { brokerName, environment, reason: "credential_validation_failed" }
        });
        throw new UnauthorizedException({
          code: "BROKER_CREDENTIALS_INVALID",
          message: "Broker credentials could not be validated."
        });
      }
      const alpacaAccount = await this.alpacaBroker.getAccount(credentials);
      resolvedAccountId = alpacaAccount.accountNumber || accountId;
      encryptedApiKey = this.brokerCredentials.encrypt(apiKey);
      encryptedSecret = this.brokerCredentials.encrypt(secret);
    }

    const existingAlpaca = this.listBrokerAccountRecords(userId).find(
      (candidate) => candidate.brokerName === "ALPACA"
    );
    const account: BrokerAccount = {
      id: existingAlpaca?.id ?? randomUUID(),
      userId,
      brokerName,
      accountId: resolvedAccountId,
      status: "CONNECTED",
      ...(brokerName === "ALPACA" ? { environment } : {}),
      ...(encryptedApiKey ? { encryptedApiKey } : {}),
      ...(encryptedSecret ? { encryptedSecret } : {}),
      createdAt: existingAlpaca?.createdAt ?? isoNow()
    };
    this.store.brokerAccounts.set(account.id, account);
    await this.platformRepository.persistBrokerAccount(account);
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "BROKER_CONNECTED",
      entityType: "BROKER_ACCOUNT",
      entityId: account.id,
      metadata: {
        brokerName,
        accountId: resolvedAccountId,
        environment,
        credentialsEncrypted: brokerName === "ALPACA"
      }
    });
    if (brokerName === "ALPACA") {
      await this.syncAlpacaState(userId);
    }
    return this.sanitizeBrokerAccount(account);
  }

  deleteBrokerAccount(userId: UUID, brokerId: UUID): { readonly deleted: true } {
    const account = this.store.brokerAccounts.get(brokerId);
    if (!account || account.userId !== userId) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Broker account not found." });
    }
    this.store.brokerAccounts.delete(brokerId);
    this.persist(this.platformRepository.deleteBrokerAccount(brokerId));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "BROKER_DISCONNECTED",
      entityType: "BROKER_ACCOUNT",
      entityId: brokerId,
      metadata: { brokerName: account.brokerName }
    });
    return { deleted: true };
  }

  getPortfolio(userId: UUID, portfolioId: UUID): Portfolio {
    const portfolio = this.store.portfolios.get(portfolioId);
    if (!portfolio || portfolio.userId !== userId) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Portfolio not found." });
    }
    return portfolio;
  }

  getPrimaryPortfolio(userId: UUID): Portfolio {
    const portfolio = this.listPortfolios(userId)[0];
    if (!portfolio) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Portfolio not found." });
    }
    return portfolio;
  }

  getPerformance(userId: UUID): PerformanceSummary {
    const portfolio = this.getPrimaryPortfolio(userId);
    const trades = this.listTrades(userId).filter((trade) => trade.closedAt !== undefined);
    return summarizePerformance(
      portfolio.portfolioValue - portfolio.realizedPnl - portfolio.unrealizedPnl,
      trades
    );
  }

  exportPerformanceReport(userId: UUID, formatValue: unknown): PerformanceReport {
    const format = normalizeReportFormat(formatValue);
    const summary = this.getPerformance(userId);
    const generatedAt = isoNow();
    const fileName = `performance-report-${generatedAt.slice(0, 10)}.${format}`;
    const report =
      format === "csv"
        ? {
            fileName,
            contentType: "text/csv" as const,
            contentBase64: Buffer.from(buildPerformanceCsv(summary), "utf8").toString("base64"),
            generatedAt,
            summary
          }
        : {
            fileName,
            contentType: "application/pdf" as const,
            contentBase64: Buffer.from(
              buildMinimalPdf([
                "AI Trading Platform Performance Report",
                `Generated: ${generatedAt}`,
                `Win Rate: ${summary.winRate}%`,
                `Profit Factor: ${summary.profitFactor}`,
                `Sharpe Ratio: ${summary.sharpeRatio}`,
                `Sortino Ratio: ${summary.sortinoRatio}`,
                `Max Drawdown: ${summary.maxDrawdown}%`,
                `Total Return: ${summary.totalReturn}%`,
                `Average Trade: ${summary.averageTrade}`,
                `Risk/Reward Ratio: ${summary.riskRewardRatio}`
              ]),
              "ascii"
            ).toString("base64"),
            generatedAt,
            summary
          };

    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "PERFORMANCE_REPORT_EXPORTED",
      entityType: "REPORT",
      metadata: { format, fileName }
    });

    return report;
  }

  async runBacktest(userId: UUID, bodyValue: unknown): Promise<BacktestResult> {
    const body = asRecord(bodyValue);
    const symbol = readString(body, "symbol", { required: true, max: 16 }).toUpperCase();
    const strategyId = readString(body, "strategyId");
    const timeframe = normalizeMarketTimeframe(body.timeframe);
    const strategy = strategyId ? this.requireStrategy(userId, strategyId) : undefined;
    const configuration = strategy?.configuration ?? {};
    const portfolioEquity = this.getPrimaryPortfolio(userId).portfolioValue;
    const readSetting = (key: string, fallback: number, min: number): number =>
      body[key] === undefined ? readConfigNumber(configuration, key, fallback) : readNumber(body, key, { min });

    let result: BacktestResult;
    try {
      result = runHistoricalBacktest(await this.listMarketData(userId, symbol, timeframe), {
        symbol,
        timeframe,
        startingEquity: readSetting("startingEquity", portfolioEquity > 0 ? portfolioEquity : 1, 1),
        fastPeriod: readSetting("fastPeriod", 10, 1),
        slowPeriod: readSetting("slowPeriod", 20, 2),
        maxPositionPercent: readSetting("maxPositionPercent", 20, 0.01),
        feePerTrade: readSetting("feePerTrade", 0, 0),
        slippagePercent: readSetting("slippagePercent", 0.05, 0)
      });
    } catch (error) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: error instanceof Error ? error.message : "Backtest settings are invalid."
      });
    }
    const backtestId = randomUUID();
    const backtest: BacktestResult = {
      ...result,
      id: backtestId,
      userId,
      ...(strategy ? { strategyId: strategy.id } : {})
    };

    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "BACKTEST_RUN",
      entityType: "BACKTEST",
      entityId: backtestId,
      metadata: {
        symbol,
        timeframe,
        strategyId: strategy?.id ?? null,
        totalTrades: backtest.totalTrades,
        totalReturn: backtest.performance.totalReturn,
        maxDrawdown: backtest.performance.maxDrawdown
      }
    });
    this.addNotification({
      userId,
      notificationType: "SYSTEM",
      title: "Backtest completed",
      message: `${symbol} ${timeframe} replay produced ${backtest.totalTrades} trades.`
    });

    return backtest;
  }

  async runWalkForwardBacktest(userId: UUID, bodyValue: unknown): Promise<WalkForwardResult> {
    const body = asRecord(bodyValue);
    const symbol = readString(body, "symbol", { required: true, max: 16 }).toUpperCase();
    const strategyId = readString(body, "strategyId");
    const timeframe = normalizeMarketTimeframe(body.timeframe);
    const strategy = strategyId ? this.requireStrategy(userId, strategyId) : undefined;
    const configuration = strategy?.configuration ?? {};
    const portfolioEquity = this.getPrimaryPortfolio(userId).portfolioValue;
    const readSetting = (key: string, fallback: number, min: number): number =>
      body[key] === undefined
        ? readConfigNumber(configuration, key, fallback)
        : readNumber(body, key, { min });

    let result: WalkForwardResult;
    try {
      result = runWalkForwardBacktest(await this.listMarketData(userId, symbol, timeframe), {
        symbol,
        timeframe,
        startingEquity: readSetting("startingEquity", portfolioEquity > 0 ? portfolioEquity : 1, 1),
        trainSize: readSetting("trainSize", 45, 10),
        testSize: readSetting("testSize", 20, 5),
        maxPositionPercent: readSetting("maxPositionPercent", 20, 0.01),
        feePerTrade: readSetting("feePerTrade", 0, 0),
        slippagePercent: readSetting("slippagePercent", 0.05, 0),
        candidates: [
          { fastPeriod: 5, slowPeriod: 15 },
          { fastPeriod: 10, slowPeriod: 20 }
        ]
      });
    } catch (error) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: error instanceof Error ? error.message : "Walk-forward settings are invalid."
      });
    }

    const backtestId = randomUUID();
    const walkForward: WalkForwardResult = {
      ...result,
      id: backtestId,
      userId,
      ...(strategy ? { strategyId: strategy.id } : {})
    };
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "WALK_FORWARD_BACKTEST_RUN",
      entityType: "BACKTEST",
      entityId: backtestId,
      metadata: {
        symbol,
        timeframe,
        windows: walkForward.windows.length,
        totalTrades: walkForward.totalTrades,
        totalReturn: walkForward.performance.totalReturn
      }
    });
    this.addNotification({
      userId,
      notificationType: "SYSTEM",
      title: "Walk-forward test completed",
      message: `${symbol} produced ${walkForward.windows.length} out-of-sample windows.`
    });
    return walkForward;
  }

  listStrategies(userId: UUID): readonly Strategy[] {
    return [...this.store.strategies.values()].filter((strategy) => strategy.userId === userId);
  }

  createStrategy(userId: UUID, bodyValue: unknown): Strategy {
    const body = asRecord(bodyValue);
    const now = isoNow();
    const strategy: Strategy = {
      id: randomUUID(),
      userId,
      name: readString(body, "name", { required: true, max: 120 }),
      description: readString(body, "description", { max: 500 }),
      version: readString(body, "version", { max: 40 }) || "1.0.0",
      status: readEnum(body, "status", ["ACTIVE", "INACTIVE"] as const, "ACTIVE"),
      configuration: readJsonObject(body.configuration),
      createdAt: now,
      updatedAt: now
    };

    this.store.strategies.set(strategy.id, strategy);
    this.persist(this.platformRepository.persistStrategy(strategy));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "STRATEGY_CREATED",
      entityType: "STRATEGY",
      entityId: strategy.id,
      metadata: { name: strategy.name, status: strategy.status }
    });
    return strategy;
  }

  updateStrategy(userId: UUID, strategyId: UUID, bodyValue: unknown): Strategy {
    const body = asRecord(bodyValue);
    const existing = this.requireStrategy(userId, strategyId);
    const status = readEnum<StrategyStatus>(body, "status", ["ACTIVE", "INACTIVE"], existing.status);
    const updated: Strategy = {
      ...existing,
      name: readString(body, "name", { max: 120 }) || existing.name,
      description: readString(body, "description", { max: 500 }) || existing.description,
      version: readString(body, "version", { max: 40 }) || existing.version,
      status,
      configuration: body.configuration === undefined ? existing.configuration : readJsonObject(body.configuration),
      updatedAt: isoNow()
    };
    this.store.strategies.set(strategyId, updated);
    this.persist(this.platformRepository.persistStrategy(updated));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "STRATEGY_UPDATED",
      entityType: "STRATEGY",
      entityId: strategyId,
      metadata: { status: updated.status }
    });
    return updated;
  }

  deleteStrategy(userId: UUID, strategyId: UUID): { readonly deleted: true } {
    const strategy = this.requireStrategy(userId, strategyId);
    this.store.strategies.delete(strategy.id);
    this.persist(this.platformRepository.deleteStrategy(strategy.id));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "STRATEGY_DELETED",
      entityType: "STRATEGY",
      entityId: strategy.id,
      metadata: { name: strategy.name }
    });
    return { deleted: true };
  }

  async listMarketData(
    userId: UUID | undefined,
    symbol = "AAPL",
    timeframe: MarketTimeframe = "1m"
  ): Promise<readonly MarketCandle[]> {
    const normalizedSymbol = symbol.toUpperCase();
    const key = marketDataKey(normalizedSymbol, timeframe);
    const credentials = this.resolveAlpacaCredentials(userId);
    if (!credentials) {
      if (!this.allowSimulatedMarketData()) {
        throw new NotFoundException({
          code: "BROKER_NOT_CONNECTED",
          message: "Connect Alpaca or configure ALPACA_API_KEY and ALPACA_SECRET_KEY."
        });
      }
      // Enough history for default walk-forward (train 45 + test 20) with spare windows.
      const simulated = generateHistoricalPrices(normalizedSymbol, 220, 185, timeframe);
      this.store.marketData.set(key, simulated);
      return simulated;
    }
    const candles = await this.alpacaBroker.getBars(normalizedSymbol, timeframe, credentials);
    if (candles.length === 0) {
      throw new NotFoundException({
        code: "MARKET_DATA_UNAVAILABLE",
        message: `Market data is unavailable for ${normalizedSymbol}.`
      });
    }
    this.store.marketData.set(key, candles);
    this.persist(
      Promise.all([
        this.platformRepository.persistMarketData(normalizedSymbol, timeframe, candles),
        this.supabaseCacheQueue.cacheMarketData(normalizedSymbol, timeframe, candles)
      ])
    );
    return candles;
  }

  async getIndicators(
    userId: UUID | undefined,
    symbol = "AAPL",
    timeframe: MarketTimeframe = "1m"
  ): Promise<IndicatorSnapshot> {
    return calculateIndicators(await this.listMarketData(userId, symbol, timeframe));
  }

  async getMarketQuote(
    userId: UUID | undefined,
    symbol = "AAPL",
    timeframe: MarketTimeframe = "1m"
  ): Promise<MarketQuote> {
    const normalizedSymbol = symbol.toUpperCase();
    const credentials = this.resolveAlpacaCredentials(userId);
    if (!credentials) {
      if (!this.allowSimulatedMarketData()) {
        throw new NotFoundException({
          code: "BROKER_NOT_CONNECTED",
          message: "Connect Alpaca or configure ALPACA_API_KEY and ALPACA_SECRET_KEY."
        });
      }
      const candles = await this.listMarketData(userId, normalizedSymbol, timeframe);
      const latest = candles[candles.length - 1]!;
      const previousClose = candles[candles.length - 2]?.close ?? latest.close;
      return {
        symbol: normalizedSymbol,
        price: Number(latest.close.toFixed(2)),
        bid: Number((latest.close - 0.01).toFixed(2)),
        ask: Number((latest.close + 0.01).toFixed(2)),
        changePercent:
          previousClose > 0
            ? Number((((latest.close - previousClose) / previousClose) * 100).toFixed(2))
            : 0,
        timestamp: latest.timestamp,
        source: "SIMULATED"
      };
    }
    const candles = await this.listMarketData(userId, normalizedSymbol, timeframe);
    const latestQuote = await this.alpacaBroker.getLatestQuote(normalizedSymbol, credentials);
    const previousClose = candles[candles.length - 2]?.close ?? candles[candles.length - 1]?.close ?? latestQuote.price;
    return {
      symbol: normalizedSymbol,
      price: Number(latestQuote.price.toFixed(2)),
      bid: Number(latestQuote.bid.toFixed(2)),
      ask: Number(latestQuote.ask.toFixed(2)),
      changePercent:
        previousClose > 0
          ? Number((((latestQuote.price - previousClose) / previousClose) * 100).toFixed(2))
          : 0,
      timestamp: latestQuote.timestamp,
      source: "ALPACA"
    };
  }

  listWatchlists(userId: UUID): readonly Watchlist[] {
    return [...this.store.watchlists.values()].filter((watchlist) => watchlist.userId === userId);
  }

  updateWatchlist(userId: UUID, bodyValue: unknown): Watchlist {
    const body = asRecord(bodyValue);
    const symbolsRaw = body.symbols;
    if (!Array.isArray(symbolsRaw) || symbolsRaw.some((symbol) => typeof symbol !== "string")) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "symbols must be a string array." });
    }
    const watchlist = this.listWatchlists(userId)[0];
    if (!watchlist) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Watchlist not found." });
    }
    watchlist.symbols = symbolsRaw.map((symbol) => symbol.toUpperCase());
    this.persist(this.platformRepository.persistWatchlist(watchlist));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "WATCHLIST_UPDATED",
      entityType: "WATCHLIST",
      entityId: watchlist.id,
      metadata: { symbols: watchlist.symbols }
    });
    return watchlist;
  }

  async generateTradingSignal(userId: UUID, bodyValue: unknown): Promise<Signal> {
    const startedAt = performance.now();
    const body = asRecord(bodyValue);
    const symbol = readString(body, "symbol", { required: true, max: 16 }).toUpperCase();
    const strategyId = readString(body, "strategyId", { required: true });
    const timeframe = normalizeMarketTimeframe(body.timeframe);
    const strategy = this.requireStrategy(userId, strategyId);
    if (strategy.status !== "ACTIVE") {
      throw new BadRequestException({ code: "STRATEGY_INACTIVE", message: "Strategy must be active." });
    }

    const candles = await this.listMarketData(userId, symbol, timeframe);
    const generated = await this.generateSignalViaAiService(symbol, candles);
    const signal: Signal = {
      id: randomUUID(),
      userId,
      strategyId,
      symbol,
      signalType: generated.signalType,
      confidenceScore: generated.confidenceScore,
      modelVersion: generated.modelVersion,
      features: generated.features,
      generatedAt: isoNow()
    };
    this.operationalMetrics.recordSignal({
      latencyMs: performance.now() - startedAt,
      confidence: signal.confidenceScore,
      signalType: signal.signalType,
      modelVersion: signal.modelVersion
    });
    this.store.signals.set(signal.id, signal);
    this.persist(this.platformRepository.persistSignal(signal));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "SIGNAL_GENERATED",
      entityType: "SIGNAL",
      entityId: signal.id,
      metadata: {
        symbol: signal.symbol,
        timeframe,
        signalType: signal.signalType,
        confidenceScore: signal.confidenceScore,
        modelVersion: signal.modelVersion
      }
    });
    this.addNotification({
      userId,
      notificationType: "SIGNAL",
      title: `${signal.signalType} signal generated`,
      message: `${symbol} confidence ${signal.confidenceScore}%`
    });
    this.realtime.publish({
      userId,
      type: "signal.updated",
      data: { signal }
    });
    return signal;
  }

  listSignals(userId: UUID): readonly Signal[] {
    return [...this.store.signals.values()].filter((signal) => signal.userId === userId);
  }

  async runAutomation(userId: UUID, bodyValue: unknown): Promise<AutomationRunResult> {
    const body = asRecord(bodyValue);
    const symbol = readString(body, "symbol", { required: true, max: 16 }).toUpperCase();
    const strategyId = readString(body, "strategyId", { required: true });
    const timeframe = normalizeMarketTimeframe(body.timeframe);
    const idempotencyKey =
      readString(body, "idempotencyKey", { max: 128 }) ||
      `${userId}:${strategyId}:${symbol}:${timeframe}:${new Date().toISOString().slice(0, 16)}`;

    const cached = this.store.automationIdempotency.get(idempotencyKey);
    if (cached) {
      return cached;
    }

    const strategy = this.requireStrategy(userId, strategyId);
    if (strategy.status !== "ACTIVE") {
      throw new BadRequestException({ code: "STRATEGY_INACTIVE", message: "Strategy must be active." });
    }

    const settings = this.getAutomationSettings(userId);
    if (settings.emergencyStop || settings.mode === "MANUAL") {
      const blocked: AutomationRunResult = {
        status: "SKIPPED",
        mode: "AUTO",
        strategyId: strategy.id,
        symbol,
        signal: await this.generateTradingSignal(userId, { strategyId: strategy.id, symbol, timeframe }),
        reason:
          settings.emergencyStop
            ? "Emergency stop is active."
            : "Automation mode is Manual — orders are not auto-submitted.",
        idempotencyKey,
        steps: [
          { id: "sync", label: "Syncing account", status: "done" },
          { id: "blocked", label: "Automation blocked", status: "failed", detail: settings.emergencyStop ? "Emergency stop" : "Manual mode" }
        ],
        summary: {
          symbolsScanned: 1,
          opportunitiesFound: 0,
          qualifiedSignals: 0,
          tradesCreated: 0,
          signalsRejected: 1,
          highestRejectionReason: settings.emergencyStop ? "Emergency stop is active." : "Manual mode"
        }
      };
      this.store.automationIdempotency.set(idempotencyKey, blocked);
      return blocked;
    }

    const confidenceThreshold = readPercentSetting(body, strategy.configuration, "confidenceThreshold", settings.minimumConfidence);
    const stopLossPercent = readPercentSetting(body, strategy.configuration, "stopLossPercent", 5);
    const takeProfitPercent = readPercentSetting(body, strategy.configuration, "takeProfitPercent", 8);

    const steps: Array<{
      id: string;
      label: string;
      status: "pending" | "running" | "done" | "skipped" | "failed";
      detail?: string;
    }> = [
      { id: "sync", label: "Syncing account", status: "done" },
      { id: "watchlist", label: "Loading watchlist", status: "done", detail: symbol },
      { id: "market", label: "Fetching market data", status: "running" },
      { id: "strategy", label: "Evaluating strategy", status: "pending" },
      { id: "rank", label: "Ranking signals", status: "pending" },
      { id: "risk", label: "Running risk validation", status: "pending" },
      { id: "order", label: "Creating paper order", status: "pending" },
      { id: "portfolio", label: "Updating portfolio", status: "pending" }
    ];

    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "AUTOMATION_RUN_STARTED",
      entityType: "STRATEGY",
      entityId: strategy.id,
      metadata: { symbol, timeframe, confidenceThreshold, stopLossPercent, takeProfitPercent, idempotencyKey }
    });

    await this.listMarketData(userId, symbol, timeframe);
    steps[2] = { ...steps[2]!, status: "done" };
    steps[3] = { ...steps[3]!, status: "running" };

    const signal = await this.generateTradingSignal(userId, { strategyId: strategy.id, symbol, timeframe });
    steps[3] = { ...steps[3]!, status: "done" };
    steps[4] = {
      ...steps[4]!,
      status: "done",
      detail: `${signal.signalType} @ ${signal.confidenceScore}%`
    };

    if (signal.signalType === "HOLD" || signal.confidenceScore < confidenceThreshold) {
      const reason =
        signal.signalType === "HOLD"
          ? "Signal was HOLD; automated execution skipped."
          : `Signal confidence ${signal.confidenceScore}% was below threshold ${confidenceThreshold}%.`;
      steps[5] = { ...steps[5]!, status: "skipped", detail: reason };
      steps[6] = { ...steps[6]!, status: "skipped" };
      steps[7] = { ...steps[7]!, status: "skipped" };
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "AUTOMATION_SKIPPED",
        entityType: "SIGNAL",
        entityId: signal.id,
        metadata: { symbol, timeframe, signalType: signal.signalType, confidenceScore: signal.confidenceScore, reason }
      });
      this.addNotification({
        userId,
        notificationType: "SYSTEM",
        title: "Automation skipped",
        message: reason
      });
      const skipped: AutomationRunResult = {
        status: "SKIPPED",
        mode: "AUTO",
        strategyId: strategy.id,
        symbol,
        signal,
        reason,
        idempotencyKey,
        steps,
        summary: {
          symbolsScanned: 1,
          opportunitiesFound: signal.signalType === "HOLD" ? 0 : 1,
          qualifiedSignals: 0,
          tradesCreated: 0,
          signalsRejected: 1,
          highestRejectionReason: reason
        }
      };
      this.store.automationIdempotency.set(idempotencyKey, skipped);
      return skipped;
    }

    const price = readLatestClose(signal, await this.listMarketData(userId, symbol, timeframe));
    const side = signal.signalType;
    const stopLoss =
      side === "BUY" ? price * (1 - stopLossPercent / 100) : price * (1 + stopLossPercent / 100);
    const takeProfit =
      side === "BUY" ? price * (1 + takeProfitPercent / 100) : price * (1 - takeProfitPercent / 100);

    steps[5] = { ...steps[5]!, status: "running" };
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "AUTOMATION_ORDER_REQUESTED",
      entityType: "SIGNAL",
      entityId: signal.id,
      metadata: { symbol, timeframe, side, price, stopLoss, takeProfit }
    });

    try {
      const execution = await this.createOrder(userId, {
        strategyId: strategy.id,
        signalId: signal.id,
        symbol,
        side,
        orderType: "MARKET",
        mode: "AUTO",
        price: Number(price.toFixed(2)),
        stopLoss: Number(stopLoss.toFixed(2)),
        takeProfit: Number(takeProfit.toFixed(2))
      });

      steps[5] = { ...steps[5]!, status: "done", detail: "Risk checks passed" };
      steps[6] = { ...steps[6]!, status: "done", detail: execution.order.status };
      steps[7] = { ...steps[7]!, status: "done" };

      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "AUTOMATION_EXECUTED",
        entityType: "ORDER",
        entityId: execution.order.id,
        metadata: {
          symbol,
          side,
          calculatedQuantity: execution.riskDecision.calculatedQuantity,
          orderStatus: execution.order.status
        }
      });

      const executed: AutomationRunResult = {
        status: "EXECUTED",
        mode: "AUTO",
        strategyId: strategy.id,
        symbol,
        signal,
        execution,
        idempotencyKey,
        steps,
        summary: {
          symbolsScanned: 1,
          opportunitiesFound: 1,
          qualifiedSignals: 1,
          tradesCreated: 1,
          signalsRejected: 0
        }
      };
      this.store.automationIdempotency.set(idempotencyKey, executed);
      return executed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Order rejected";
      steps[5] = { ...steps[5]!, status: "failed", detail: message };
      steps[6] = { ...steps[6]!, status: "skipped" };
      steps[7] = { ...steps[7]!, status: "skipped" };
      const rejected: AutomationRunResult = {
        status: "SKIPPED",
        mode: "AUTO",
        strategyId: strategy.id,
        symbol,
        signal,
        reason: message,
        idempotencyKey,
        steps,
        summary: {
          symbolsScanned: 1,
          opportunitiesFound: 1,
          qualifiedSignals: 1,
          tradesCreated: 0,
          signalsRejected: 1,
          highestRejectionReason: message
        }
      };
      this.store.automationIdempotency.set(idempotencyKey, rejected);
      return rejected;
    }
  }

  getAutomationSettings(userId: UUID): import("@trading/types").AutomationSettings {
    const existing = this.store.automationSettings.get(userId);
    if (existing) {
      return existing;
    }
    const watchlist = this.listWatchlists(userId)[0]?.symbols ?? [];
    const risk = this.getRiskRules(userId);
    const defaults: import("@trading/types").AutomationSettings = {
      mode: "ASSISTED",
      watchlist: [...watchlist],
      marketHoursOnly: true,
      minimumConfidence: 60,
      maxTradesPerDay: 5,
      riskPerTradePercent: risk.maxRiskPerTradePercent,
      maxPositionSizePercent: risk.maxPositionSizePercent,
      dailyLossLimitPercent: risk.maxDailyLossPercent,
      maxDrawdownPercent: risk.maxDrawdownPercent,
      allowedAssetTypes: ["stock"],
      cooldownSeconds: 60,
      requireConfirmationAboveValue: 2_500,
      emergencyStop: risk.stopTrading,
      runtimeState: risk.stopTrading ? "RISK_LOCK" : "IDLE",
      updatedAt: isoNow()
    };
    this.store.automationSettings.set(userId, defaults);
    return defaults;
  }

  updateAutomationSettings(userId: UUID, bodyValue: unknown): import("@trading/types").AutomationSettings {
    const body = asRecord(bodyValue);
    const current = this.getAutomationSettings(userId);
    const mode =
      body.mode === "MANUAL" || body.mode === "ASSISTED" || body.mode === "AUTOPILOT"
        ? body.mode
        : current.mode;
    const watchlist = Array.isArray(body.watchlist)
      ? body.watchlist
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 50)
      : current.watchlist;
    const next: import("@trading/types").AutomationSettings = {
      ...current,
      mode,
      watchlist,
      marketHoursOnly: typeof body.marketHoursOnly === "boolean" ? body.marketHoursOnly : current.marketHoursOnly,
      minimumConfidence:
        typeof body.minimumConfidence === "number" ? body.minimumConfidence : current.minimumConfidence,
      maxTradesPerDay:
        typeof body.maxTradesPerDay === "number" ? Math.max(0, Math.floor(body.maxTradesPerDay)) : current.maxTradesPerDay,
      riskPerTradePercent:
        typeof body.riskPerTradePercent === "number" ? body.riskPerTradePercent : current.riskPerTradePercent,
      maxPositionSizePercent:
        typeof body.maxPositionSizePercent === "number"
          ? body.maxPositionSizePercent
          : current.maxPositionSizePercent,
      dailyLossLimitPercent:
        typeof body.dailyLossLimitPercent === "number"
          ? body.dailyLossLimitPercent
          : current.dailyLossLimitPercent,
      maxDrawdownPercent:
        typeof body.maxDrawdownPercent === "number" ? body.maxDrawdownPercent : current.maxDrawdownPercent,
      allowedAssetTypes: Array.isArray(body.allowedAssetTypes)
        ? body.allowedAssetTypes.filter((item): item is string => typeof item === "string")
        : current.allowedAssetTypes,
      cooldownSeconds:
        typeof body.cooldownSeconds === "number" ? Math.max(0, Math.floor(body.cooldownSeconds)) : current.cooldownSeconds,
      requireConfirmationAboveValue:
        typeof body.requireConfirmationAboveValue === "number"
          ? body.requireConfirmationAboveValue
          : current.requireConfirmationAboveValue,
      emergencyStop: typeof body.emergencyStop === "boolean" ? body.emergencyStop : current.emergencyStop,
      runtimeState: (() => {
        const emergencyStop =
          typeof body.emergencyStop === "boolean" ? body.emergencyStop : current.emergencyStop;
        if (emergencyStop) {
          return "RISK_LOCK";
        }
        if (mode === "AUTOPILOT") {
          return "RUNNING";
        }
        if (mode === "ASSISTED") {
          return "IDLE";
        }
        return "PAUSED";
      })(),
      updatedAt: isoNow()
    };
    this.store.automationSettings.set(userId, next);
    if (typeof body.emergencyStop === "boolean") {
      this.updateRiskRules(userId, { stopTrading: body.emergencyStop });
    }
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "AUTOMATION_SETTINGS_UPDATED",
      entityType: "USER",
      entityId: userId,
      metadata: { mode: next.mode, emergencyStop: next.emergencyStop, runtimeState: next.runtimeState }
    });
    return next;
  }

  emergencyPause(userId: UUID): import("@trading/types").AutomationSettings {
    return this.updateAutomationSettings(userId, { emergencyStop: true, mode: "MANUAL" });
  }

  listOrders(userId: UUID): readonly Order[] {
    return [...this.store.orders.values()].filter((order) => order.userId === userId);
  }

  listOrderStatusHistory(userId: UUID, orderId: UUID): readonly OrderStatusEvent[] {
    const order = this.store.orders.get(orderId);
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Order not found." });
    }
    return [...this.store.orderStatusEvents.values()]
      .filter((event) => event.orderId === orderId && event.userId === userId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  async cancelOrder(userId: UUID, orderId: UUID): Promise<Order> {
    const existing = this.store.orders.get(orderId);
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Order not found." });
    }
    if (existing.status === "FILLED") {
      throw new BadRequestException({ code: "ORDER_FILLED", message: "Filled orders cannot be cancelled." });
    }
    const updated: Order = {
      ...existing,
      status: "CANCELLED"
    };
    this.store.orders.set(orderId, updated);
    await this.platformRepository.persistOrder(updated);
    await this.trackOrderStatus(updated, { source: "user" });
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "ORDER_CANCELLED",
      entityType: "ORDER",
      entityId: orderId,
      metadata: { symbol: existing.symbol, side: existing.side }
    });
    return updated;
  }

  async createOrder(userId: UUID, bodyValue: unknown): Promise<OrderExecutionPayload> {
    const startedAt = performance.now();
    const body = asRecord(bodyValue);
    const symbol = readString(body, "symbol", { required: true, max: 16 }).toUpperCase();
    const side = readEnum<OrderSide>(body, "side", ["BUY", "SELL"], "BUY");
    const orderType = readEnum<OrderType>(body, "orderType", ["MARKET", "LIMIT", "STOP"], "MARKET");
    const mode = readEnum<TradingMode>(body, "mode", ["MANUAL", "SEMI_AUTO", "AUTO"], "MANUAL");
    const requestedPrice = readNumber(body, "price", { required: true, min: 0.01 });
    await this.syncAlpacaState(userId);
    const marketPrice = (await this.getMarketQuote(userId, symbol, "1m")).price;
    const price = orderType === "MARKET" ? marketPrice : requestedPrice;
    const requestedStopLoss = readNumber(body, "stopLoss", { required: true, min: 0.01 });
    const requestedTakeProfit = readNumber(body, "takeProfit", { required: true, min: 0.01 });
    const stopLoss = this.normalizeProtectivePrice({
      orderType,
      side,
      entryPrice: price,
      requestedEntryPrice: requestedPrice,
      protectivePrice: requestedStopLoss,
      kind: "stop"
    });
    const takeProfit = this.normalizeProtectivePrice({
      orderType,
      side,
      entryPrice: price,
      requestedEntryPrice: requestedPrice,
      protectivePrice: requestedTakeProfit,
      kind: "target"
    });
    const quantityValue = body.quantity;
    const requestedQuantity =
      quantityValue === undefined || quantityValue === null || quantityValue === ""
        ? undefined
        : readNumber(body, "quantity", { min: 0.0001 });
    const strategyId = readString(body, "strategyId");
    const signalId = readString(body, "signalId");

    if (strategyId) {
      this.requireStrategy(userId, strategyId);
    }
    if (signalId) {
      this.requireSignal(userId, signalId);
    }

    const portfolio = this.getPrimaryPortfolio(userId);
    const existingPosition = this.listPositions(userId).find((position) => position.symbol === symbol);
    const riskDecision = this.evaluateOrderRisk({
      userId,
      portfolio,
      symbol,
      side,
      price,
      stopLoss,
      takeProfit,
      existingPosition,
      requestedQuantity
    });
    const quantity = requestedQuantity ?? riskDecision.calculatedQuantity;
    const executionTarget = this.resolveExecutionBroker(userId);
    const baseOrder = {
      id: randomUUID(),
      userId,
      brokerAccountId: executionTarget.account.id,
      symbol,
      side,
      orderType,
      mode,
      quantity,
      price,
      stopLoss,
      takeProfit,
      status: riskDecision.approved ? "PENDING" as const : "REJECTED" as const,
      submittedAt: isoNow(),
      riskDecision
    };
    const order: Order = {
      ...baseOrder,
      ...(strategyId ? { strategyId } : {}),
      ...(signalId ? { signalId } : {})
    };

    this.store.orders.set(order.id, order);
    await this.platformRepository.persistOrder(order);
    await this.trackOrderStatus(order, {
      riskApproved: riskDecision.approved,
      mode,
      orderType
    });

    if (!riskDecision.approved) {
      const primary = riskDecision.rejections?.[0];
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "RISK_REJECTED_ORDER",
        entityType: "ORDER",
        entityId: order.id,
        metadata: {
          symbol,
          side,
          reasons: [...riskDecision.reasons],
          rejectionCodes: (riskDecision.rejections ?? []).map((item) => item.code),
          suggestedQuantity: riskDecision.suggestedQuantity ?? null
        }
      });
      this.addNotification({
        userId,
        notificationType: "RISK",
        title: primary?.title ?? "Risk rule blocked trade",
        message: primary?.message ?? riskDecision.reasons.join(" ")
      });
      this.operationalMetrics.recordTrade(performance.now() - startedAt, "rejected");
      throw new UnprocessableEntityException({
        code: "RISK_REJECTED",
        message: primary?.message ?? riskDecision.reasons.join(" "),
        details: {
          orderId: order.id,
          approved: false,
          code: primary?.code ?? "RISK_REJECTED",
          title: primary?.title ?? "Risk validation failed",
          message: primary?.message ?? riskDecision.reasons.join(" "),
          currentValue: primary?.currentValue ?? null,
          limit: primary?.limit ?? null,
          suggestedQuantity: riskDecision.suggestedQuantity ?? primary?.suggestedQuantity ?? null,
          fixHint: primary?.fixHint ?? null,
          rejections: riskDecision.rejections ?? [],
          riskDecision: {
            approved: riskDecision.approved,
            reasons: [...riskDecision.reasons],
            maxRiskAmount: riskDecision.maxRiskAmount,
            proposedRiskAmount: riskDecision.proposedRiskAmount,
            proposedPositionValue: riskDecision.proposedPositionValue,
            calculatedQuantity: riskDecision.calculatedQuantity,
            suggestedQuantity: riskDecision.suggestedQuantity ?? null
          }
        }
      });
    }

    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "RISK_APPROVED_ORDER",
      entityType: "ORDER",
      entityId: order.id,
      metadata: { symbol, side, quantity, mode }
    });

    const brokerReady = await executionTarget.adapter.validateConnection(executionTarget.credentials);
    if (!brokerReady) {
      const rejectedOrder: Order = { ...order, status: "REJECTED" };
      this.store.orders.set(rejectedOrder.id, rejectedOrder);
      await this.platformRepository.persistOrder(rejectedOrder);
      await this.trackOrderStatus(rejectedOrder, { source: "broker", reason: "unavailable" });
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "BROKER_REJECTED_ORDER",
        entityType: "ORDER",
        entityId: order.id,
        metadata: { broker: executionTarget.adapter.name, reason: "unavailable" }
      });
      this.operationalMetrics.recordTrade(performance.now() - startedAt, "rejected");
      throw new UnprocessableEntityException({
        code: "BROKER_UNAVAILABLE",
        message: "Broker connection is unavailable."
      });
    }

    const submittedOrder: Order = { ...order, status: "SUBMITTED" };
    this.store.orders.set(submittedOrder.id, submittedOrder);
    await this.platformRepository.persistOrder(submittedOrder);
    await this.trackOrderStatus(submittedOrder, { broker: executionTarget.adapter.name });

    let execution: BrokerExecutionResult;
    try {
      execution =
        executionTarget.adapter.name === "ALPACA"
          ? await this.alpacaBroker.submitOrder(submittedOrder, marketPrice, executionTarget.credentials)
          : await this.paperBroker.submitOrder(submittedOrder, marketPrice);
    } catch {
      const rejectedOrder: Order = { ...submittedOrder, status: "REJECTED" };
      this.store.orders.set(rejectedOrder.id, rejectedOrder);
      await this.platformRepository.persistOrder(rejectedOrder);
      await this.trackOrderStatus(rejectedOrder, { source: "broker", reason: "submission_failed" });
      this.store.appendAudit({
        userId,
        actorUserId: userId,
        action: "BROKER_REJECTED_ORDER",
        entityType: "ORDER",
        entityId: order.id,
        metadata: { broker: executionTarget.adapter.name, reason: "submission_failed" }
      });
      this.operationalMetrics.recordTrade(performance.now() - startedAt, "rejected");
      throw new UnprocessableEntityException({
        code: "BROKER_SUBMISSION_FAILED",
        message: "Broker order submission failed."
      });
    }
    const result =
      executionTarget.adapter.name === "ALPACA"
        ? await this.applyBrokerExecution(submittedOrder, execution, executionTarget.adapter.name)
        : await this.applyPaperExecution(submittedOrder, execution, portfolio, existingPosition);
    this.operationalMetrics.recordTrade(
      performance.now() - startedAt,
      result.order.status === "FILLED" ? "executed" : "submitted"
    );
    return result;
  }

  async processPendingPaperOrders(symbol: string, marketPrice: number): Promise<readonly OrderExecutionPayload[]> {
    const normalizedSymbol = symbol.toUpperCase();
    const results: OrderExecutionPayload[] = [];
    const pending = [...this.store.orders.values()].filter(
      (order) =>
        order.symbol === normalizedSymbol &&
        order.status === "SUBMITTED" &&
        (order.orderType === "LIMIT" || order.orderType === "STOP")
    );

    for (const order of pending) {
      if (!this.isPaperOrderMarketable(order, marketPrice)) {
        continue;
      }
      const portfolio = this.getPrimaryPortfolio(order.userId);
      const existingPosition = this.listPositions(order.userId).find(
        (position) => position.symbol === normalizedSymbol
      );
      const riskDecision = this.evaluateOrderRisk({
        userId: order.userId,
        portfolio,
        symbol: order.symbol,
        side: order.side,
        price: marketPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        existingPosition,
        requestedQuantity: order.quantity
      });
      if (!riskDecision.approved) {
        const rejectedOrder: Order = {
          ...order,
          price: marketPrice,
          status: "REJECTED",
          riskDecision
        };
        this.store.orders.set(rejectedOrder.id, rejectedOrder);
        await this.platformRepository.persistOrder(rejectedOrder);
        await this.trackOrderStatus(rejectedOrder, {
          source: "risk_revalidation",
          reasons: [...riskDecision.reasons],
          marketPrice
        });
        this.store.appendAudit({
          userId: order.userId,
          actorUserId: order.userId,
          action: "RISK_REJECTED_PENDING_ORDER",
          entityType: "ORDER",
          entityId: order.id,
          metadata: {
            symbol: order.symbol,
            side: order.side,
            marketPrice,
            reasons: [...riskDecision.reasons]
          }
        });
        this.addNotification({
          userId: order.userId,
          notificationType: "RISK",
          title: "Pending order blocked at execution",
          message: riskDecision.reasons.join(" ")
        });
        this.operationalMetrics.recordSubmittedRejection(
          Math.max(0, Date.now() - new Date(order.submittedAt).getTime())
        );
        continue;
      }
      const revalidatedOrder: Order = {
        ...order,
        riskDecision
      };
      let execution: BrokerExecutionResult;
      try {
        execution = await this.paperBroker.submitOrder(revalidatedOrder, marketPrice);
      } catch {
        const rejectedOrder: Order = {
          ...revalidatedOrder,
          status: "REJECTED"
        };
        this.store.orders.set(rejectedOrder.id, rejectedOrder);
        await this.platformRepository.persistOrder(rejectedOrder);
        await this.trackOrderStatus(rejectedOrder, {
          source: "broker",
          reason: "pending_submission_failed"
        });
        this.store.appendAudit({
          userId: order.userId,
          actorUserId: order.userId,
          action: "BROKER_REJECTED_PENDING_ORDER",
          entityType: "ORDER",
          entityId: order.id,
          metadata: {
            broker: this.paperBroker.name,
            symbol: order.symbol,
            side: order.side,
            reason: "submission_failed"
          }
        });
        this.addNotification({
          userId: order.userId,
          notificationType: "SYSTEM",
          title: "Pending order submission failed",
          message: `${order.side} ${order.symbol} could not be submitted to the paper broker.`
        });
        this.operationalMetrics.recordSubmittedRejection(
          Math.max(0, Date.now() - new Date(order.submittedAt).getTime())
        );
        continue;
      }
      const result = await this.applyPaperExecution(
        revalidatedOrder,
        execution,
        portfolio,
        existingPosition
      );
      this.operationalMetrics.recordSubmittedFill(
        Math.max(0, Date.now() - new Date(order.submittedAt).getTime())
      );
      results.push(result);
    }
    return results;
  }

  async markPositionsToMarket(
    userId: UUID,
    symbol: string,
    marketPrice: number
  ): Promise<{ readonly positions: readonly Position[]; readonly portfolio: Portfolio }> {
    const normalizedSymbol = symbol.toUpperCase();
    const persistence: Promise<void>[] = [];
    for (const existing of this.listPositions(userId)) {
      if (existing.symbol !== normalizedSymbol) {
        continue;
      }
      const unrealizedPnl = (marketPrice - existing.averagePrice) * existing.quantity;
      const updated: Position = {
        ...existing,
        unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
        updatedAt: isoNow()
      };
      this.store.positions.set(updated.id, updated);
      persistence.push(this.platformRepository.persistPosition(updated));
    }

    const portfolio = this.getPrimaryPortfolio(userId);
    const initialCapital =
      portfolio.portfolioValue - portfolio.realizedPnl - portfolio.unrealizedPnl;
    const totalUnrealizedPnl = this.listPositions(userId)
      .reduce((sum, position) => sum + position.unrealizedPnl, 0);
    const updatedPortfolio: Portfolio = {
      ...portfolio,
      unrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
      portfolioValue: Number(
        (initialCapital + portfolio.realizedPnl + totalUnrealizedPnl).toFixed(2)
      )
    };
    this.store.portfolios.set(updatedPortfolio.id, updatedPortfolio);
    persistence.push(this.platformRepository.persistPortfolio(updatedPortfolio));
    await Promise.all(persistence);
    return {
      positions: this.listPositions(userId),
      portfolio: updatedPortfolio
    };
  }

  async getMarketQuoteForUser(
    userId: UUID,
    symbol = "AAPL",
    timeframe: MarketTimeframe = "1m"
  ): Promise<MarketQuote> {
    await this.syncAlpacaState(userId);
    const quote = await this.getMarketQuote(userId, symbol, timeframe);
    if (!this.usesAlpacaExecution(userId)) {
      await this.processPendingPaperOrders(quote.symbol, quote.price);
      await this.markPositionsToMarket(userId, quote.symbol, quote.price);
    }
    return quote;
  }

  listTrades(userId: UUID): readonly Trade[] {
    return [...this.store.trades.values()].filter((trade) => trade.userId === userId);
  }

  listPositions(userId: UUID): readonly Position[] {
    return [...this.store.positions.values()].filter(
      (position) => position.userId === userId && Math.abs(position.quantity) > 0.000001
    );
  }

  getRiskRules(userId: UUID): RiskRules {
    let rules = [...this.store.riskRules.values()].find((candidate) => candidate.userId === userId);
    if (!rules) {
      this.store.ensureDefaultAccountState(userId);
      rules = [...this.store.riskRules.values()].find((candidate) => candidate.userId === userId);
      if (rules) {
        this.persistUserBootstrap(userId);
      }
    }
    if (!rules) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Risk rules not found." });
    }
    return rules;
  }

  updateRiskRules(userId: UUID, bodyValue: unknown): RiskRules {
    const body = asRecord(bodyValue);
    const existing = this.getRiskRules(userId);
    const updated: RiskRules = {
      ...existing,
      maxRiskPerTradePercent:
        body.maxRiskPerTradePercent === undefined
          ? existing.maxRiskPerTradePercent
          : readNumber(body, "maxRiskPerTradePercent", { min: 0.01 }),
      maxDailyLossPercent:
        body.maxDailyLossPercent === undefined
          ? existing.maxDailyLossPercent
          : readNumber(body, "maxDailyLossPercent", { min: 0.01 }),
      maxDrawdownPercent:
        body.maxDrawdownPercent === undefined
          ? existing.maxDrawdownPercent
          : readNumber(body, "maxDrawdownPercent", { min: 0.01 }),
      maxPositionSizePercent:
        body.maxPositionSizePercent === undefined
          ? existing.maxPositionSizePercent
          : readNumber(body, "maxPositionSizePercent", { min: 0.01 }),
      stopTrading: typeof body.stopTrading === "boolean" ? body.stopTrading : existing.stopTrading,
      updatedAt: isoNow()
    };
    if (updated.maxRiskPerTradePercent > 2) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "maxRiskPerTradePercent cannot exceed the 2% compliance ceiling."
      });
    }
    if (
      updated.maxDailyLossPercent > 100 ||
      updated.maxDrawdownPercent > 100 ||
      updated.maxPositionSizePercent > 100
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Risk percentages cannot exceed 100%."
      });
    }
    this.store.riskRules.set(updated.id, updated);
    this.persist(this.platformRepository.persistRiskRules(updated));
    this.store.appendAudit({
      userId,
      actorUserId: userId,
      action: "RISK_RULES_UPDATED",
      entityType: "RISK_RULES",
      entityId: updated.id,
      metadata: {
        maxRiskPerTradePercent: updated.maxRiskPerTradePercent,
        maxDailyLossPercent: updated.maxDailyLossPercent,
        maxDrawdownPercent: updated.maxDrawdownPercent,
        maxPositionSizePercent: updated.maxPositionSizePercent,
        stopTrading: updated.stopTrading
      }
    });
    return updated;
  }

  listNotifications(userId: UUID): readonly Notification[] {
    return [...this.store.notifications.values()].filter((notification) => notification.userId === userId);
  }

  markNotificationsRead(userId: UUID): readonly Notification[] {
    const updated: Notification[] = [];
    for (const notification of this.listNotifications(userId)) {
      const read: Notification = { ...notification, status: "READ" };
      this.store.notifications.set(read.id, read);
      updated.push(read);
    }
    this.persist(this.platformRepository.markNotificationsRead(userId));
    return updated;
  }

  async createAdminUser(actorUserId: UUID, bodyValue: unknown): Promise<{ readonly user: PublicUser; readonly temporaryPassword: string }> {
    const body = asRecord(bodyValue);
    const email = normalizeEmail(readString(body, "email", { required: true, max: 255 }));
    const password = readString(body, "password", { required: true, max: 256 });
    const firstName = readString(body, "firstName", { max: 80 }) || "Platform";
    const lastName = readString(body, "lastName", { max: 80 }) || "User";
    const role = readEnum(body, "role", ["TRADER", "ADMIN"] as const, "TRADER");
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: passwordValidation.errors.join(" ")
      });
    }
    if (!validateEmail(email)) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Email is invalid." });
    }
    if ([...this.store.users.values()].some((candidate) => candidate.email === email)) {
      throw new ConflictException({ code: "EMAIL_IN_USE", message: "Email is already registered." });
    }

    if (isSupabaseAuth()) {
      const graceUntil = new Date(Date.now() + readMfaGraceDays() * 24 * 60 * 60 * 1000).toISOString();
      const authUser = await this.supabaseAdmin.createProvisionedUser({
        email,
        password,
        firstName,
        lastName,
        role,
        provisionedBy: actorUserId
      });

      const user =
        this.store.users.get(authUser.id) ??
        this.store.createUser({
          id: authUser.id,
          email: authUser.email,
          firstName,
          lastName,
          role,
          mfaGraceUntil: graceUntil,
          mustChangePassword: true,
          provisionedBy: actorUserId
        });

      await this.persistUserBootstrapNow(user.id);
      this.recordAdminAction(actorUserId, "ADMIN_USER_CREATE", "USER", {
        targetUserId: user.id,
        email: user.email,
        role: user.role
      });

      return {
        user: sanitizeUser(this.store.users.get(user.id) ?? user),
        temporaryPassword: password
      };
    }

    const user = this.store.createUser({
      email,
      passwordHash: await hash(password, 10),
      firstName,
      lastName,
      role,
      mustChangePassword: true,
      provisionedBy: actorUserId
    });
    await this.persistUserBootstrapNow(user.id);
    this.recordAdminAction(actorUserId, "ADMIN_USER_CREATE", "USER", {
      targetUserId: user.id,
      email: user.email,
      role: user.role
    });

    return {
      user: sanitizeUser(user),
      temporaryPassword: password
    };
  }

  listAdminUsers(actorUserId?: UUID): readonly PublicUser[] {
    if (actorUserId) {
      this.recordAdminAction(actorUserId, "ADMIN_USERS_VIEWED", "USER", {
        resultCount: this.store.users.size
      });
    }
    return [...this.store.users.values()].map((user) => sanitizeUser(user));
  }

  async updateAdminUserStatus(
    actorUserId: UUID,
    targetUserId: UUID,
    bodyValue: unknown
  ): Promise<PublicUser> {
    const body = asRecord(bodyValue);
    const status = readEnum(body, "status", ["ACTIVE", "SUSPENDED"] as const, "ACTIVE");
    if (actorUserId === targetUserId && status === "SUSPENDED") {
      throw new BadRequestException({
        code: "ADMIN_SELF_SUSPEND_FORBIDDEN",
        message: "Administrators cannot suspend their own active account."
      });
    }
    const existing = this.requireUser(targetUserId);
    const updated: UserRecord = {
      ...existing,
      status,
      updatedAt: isoNow()
    };
    this.store.users.set(targetUserId, updated);
    await this.platformRepository.persistUser(updated);

    let sessionsRevoked = 0;
    if (status === "SUSPENDED") {
      const now = isoNow();
      const persistence: Promise<void>[] = [];
      for (const session of this.store.sessions.values()) {
        if (session.userId === targetUserId && session.revokedAt === undefined) {
          session.revokedAt = now;
          sessionsRevoked += 1;
          persistence.push(this.platformRepository.persistSession(session));
        }
      }
      await Promise.all(persistence);
    }

    this.recordAdminAction(actorUserId, "ADMIN_USER_STATUS_UPDATED", "USER", {
      targetUserId,
      previousStatus: existing.status,
      status,
      sessionsRevoked
    });
    return sanitizeUser(updated);
  }

  async getSystemHealth(actorUserId?: UUID): Promise<JsonObject> {
    const database = await this.databaseHealth.check();

    if (actorUserId) {
      this.recordAdminAction(actorUserId, "ADMIN_SYSTEM_HEALTH_VIEWED", "SYSTEM", {
        supabaseStatus: database.status
      });
    }

    const connectedBrokers = [
      ...new Set(
        [...this.store.brokerAccounts.values()]
          .filter((account) => account.status === "CONNECTED")
          .map((account) => account.brokerName.toLowerCase())
      )
    ];
    const envAlpacaConfigured = Boolean(
      process.env.ALPACA_API_KEY?.trim() && process.env.ALPACA_SECRET_KEY?.trim()
    );

    return {
      api: "ok",
      persistenceMode: process.env.DATABASE_URL ? "supabase-prisma" : "in-memory-test",
      supabase: database as unknown as JsonObject,
      broker:
        connectedBrokers.length > 0
          ? connectedBrokers.join("+")
          : envAlpacaConfigured
            ? "alpaca-env"
            : "none",
      aiService: process.env.AI_SERVICE_URL ? "configured" : "fallback-local-model",
      uptimeSeconds: Math.round(process.uptime())
    };
  }

  async getOperationalMetrics(actorUserId: UUID): Promise<OperationalMetricsSnapshot> {
    const queueDepth = await this.supabaseCacheQueue.getNotificationQueueDepth();
    const snapshot = this.operationalMetrics.snapshot({
      queueConfigured: this.supabaseCacheQueue.isConfigured(),
      queueDepth
    });
    this.recordAdminAction(actorUserId, "ADMIN_METRICS_VIEWED", "SYSTEM", {
      apiRequestCount: snapshot.api.requestCount,
      apiErrorRatePercent: snapshot.api.errorRatePercent,
      signalCount: snapshot.signals.total,
      tradeRequestCount: snapshot.trades.requested,
      notificationQueueDepth: snapshot.notificationQueue.depth
    });
    return snapshot;
  }

  listAuditLogs(actorUserId?: UUID): readonly AuditLog[] {
    if (actorUserId) {
      this.recordAdminAction(actorUserId, "ADMIN_AUDIT_LOGS_VIEWED", "AUDIT_LOG", {
        resultCount: this.store.auditLogs.length
      });
    }
    return [...this.store.auditLogs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private recordAdminAction(actorUserId: UUID, action: string, entityType: string, metadata: JsonObject): void {
    this.store.appendAudit({
      userId: actorUserId,
      actorUserId,
      action,
      entityType,
      metadata
    });
  }

  private async trackOrderStatus(order: Order, metadata: JsonObject): Promise<OrderStatusEvent> {
    const event: OrderStatusEvent = {
      id: randomUUID(),
      orderId: order.id,
      userId: order.userId,
      status: order.status,
      metadata,
      occurredAt: isoNow()
    };
    this.store.orderStatusEvents.set(event.id, event);
    await this.platformRepository.persistOrderStatusEvent(event);
    this.realtime.publish({
      userId: order.userId,
      type: "order.updated",
      data: { order, statusEvent: event }
    });
    return event;
  }

  private async revokeOtherSessions(userId: UUID, currentSessionId: UUID): Promise<void> {
    const now = isoNow();
    const persistence: Promise<void>[] = [];
    for (const session of this.store.sessions.values()) {
      if (
        session.userId === userId &&
        session.id !== currentSessionId &&
        session.revokedAt === undefined
      ) {
        session.revokedAt = now;
        persistence.push(this.platformRepository.persistSession(session));
      }
    }
    await Promise.all(persistence);
  }

  private requireUser(userId: UUID): UserRecord {
    const user = this.store.users.get(userId);
    if (!user) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "User not found." });
    }
    return user;
  }

  private requireStrategy(userId: UUID, strategyId: UUID): Strategy {
    const strategy = this.store.strategies.get(strategyId);
    if (!strategy || strategy.userId !== userId) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Strategy not found." });
    }
    return strategy;
  }

  private requireSignal(userId: UUID, signalId: UUID): Signal {
    const signal = this.store.signals.get(signalId);
    if (!signal || signal.userId !== userId) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Signal not found." });
    }
    return signal;
  }

  private resolveAlpacaCredentials(userId?: UUID): BrokerCredentials | undefined {
    if (userId) {
      const account = this.getAlpacaBrokerAccount(userId);
      if (account?.encryptedApiKey && account.encryptedSecret) {
        return {
          apiKey: this.brokerCredentials.decrypt(account.encryptedApiKey),
          secret: this.brokerCredentials.decrypt(account.encryptedSecret),
          environment: account.environment ?? "PAPER"
        };
      }
    }
    return resolveEnvAlpacaCredentials();
  }

  private allowSimulatedMarketData(): boolean {
    return process.env.ENABLE_E2E_SEED === "true" || process.env.NODE_ENV === "test";
  }

  private getAlpacaBrokerAccount(userId: UUID): BrokerAccount | undefined {
    return [...this.store.brokerAccounts.values()].find(
      (candidate) =>
        candidate.userId === userId &&
        candidate.brokerName === "ALPACA" &&
        candidate.status === "CONNECTED"
    );
  }

  private usesAlpacaExecution(userId: UUID): boolean {
    return this.getAlpacaBrokerAccount(userId) !== undefined;
  }

  private resolveExecutionBroker(userId: UUID): {
    readonly adapter: BrokerAdapter;
    readonly account: BrokerAccount;
    readonly credentials?: BrokerCredentials;
  } {
    const alpacaAccount = this.getAlpacaBrokerAccount(userId);
    if (alpacaAccount?.encryptedApiKey && alpacaAccount.encryptedSecret) {
      return {
        adapter: this.alpacaBroker,
        account: alpacaAccount,
        credentials: {
          apiKey: this.brokerCredentials.decrypt(alpacaAccount.encryptedApiKey),
          secret: this.brokerCredentials.decrypt(alpacaAccount.encryptedSecret),
          environment: alpacaAccount.environment ?? "PAPER"
        }
      };
    }
    const paperAccount = [...this.store.brokerAccounts.values()].find(
      (candidate) => candidate.userId === userId && candidate.brokerName === "PAPER"
    );
    if (!paperAccount) {
      throw new NotFoundException({
        code: "BROKER_NOT_CONNECTED",
        message: "Connect Alpaca before placing orders."
      });
    }
    return {
      adapter: this.paperBroker,
      account: paperAccount
    };
  }

  async syncAlpacaState(userId: UUID): Promise<void> {
    const account = this.getAlpacaBrokerAccount(userId);
    if (!account?.encryptedApiKey || !account.encryptedSecret) {
      return;
    }
    const credentials: BrokerCredentials = {
      apiKey: this.brokerCredentials.decrypt(account.encryptedApiKey),
      secret: this.brokerCredentials.decrypt(account.encryptedSecret),
      environment: account.environment ?? "PAPER"
    };

    const [alpacaAccount, alpacaPositions] = await Promise.all([
      this.alpacaBroker.getAccount(credentials),
      this.alpacaBroker.getPositions(credentials)
    ]);

    const portfolio = this.getPrimaryPortfolio(userId);
    const unrealizedPnl = alpacaPositions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
    const updatedPortfolio: Portfolio = {
      ...portfolio,
      portfolioName: credentials.environment === "LIVE" ? "Alpaca Live Account" : "Alpaca Paper Account",
      portfolioValue: Number(alpacaAccount.equity.toFixed(2)),
      cashBalance: Number(alpacaAccount.cash.toFixed(2)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
      realizedPnl: Number((alpacaAccount.equity - alpacaAccount.cash - unrealizedPnl).toFixed(2))
    };
    this.store.portfolios.set(updatedPortfolio.id, updatedPortfolio);
    await this.platformRepository.persistPortfolio(updatedPortfolio);

    for (const [positionId, position] of this.store.positions.entries()) {
      if (position.userId === userId) {
        this.store.positions.delete(positionId);
      }
    }

    const now = isoNow();
    for (const alpacaPosition of alpacaPositions) {
      const position: Position = {
        id: randomUUID(),
        userId,
        symbol: alpacaPosition.symbol,
        quantity: alpacaPosition.quantity,
        averagePrice: alpacaPosition.averagePrice,
        unrealizedPnl: alpacaPosition.unrealizedPnl,
        updatedAt: now
      };
      this.store.positions.set(position.id, position);
      await this.platformRepository.persistPosition(position);
    }
  }

  private async applyBrokerExecution(
    submittedOrder: Order,
    execution: BrokerExecutionResult,
    brokerName: string
  ): Promise<OrderExecutionPayload> {
    const executedOrder: Order = {
      ...submittedOrder,
      quantity: execution.filledQuantity || submittedOrder.quantity,
      price: execution.filledAveragePrice || submittedOrder.price,
      status: execution.status
    };
    this.store.orders.set(executedOrder.id, executedOrder);
    await this.platformRepository.persistOrder(executedOrder);
    await this.trackOrderStatus(executedOrder, {
      broker: brokerName,
      brokerOrderId: execution.brokerOrderId,
      filledQuantity: execution.filledQuantity,
      filledAveragePrice: execution.filledAveragePrice
    });

    await this.syncAlpacaState(executedOrder.userId);
    const portfolio = this.getPrimaryPortfolio(executedOrder.userId);
    const position = this.listPositions(executedOrder.userId).find(
      (candidate) => candidate.symbol === executedOrder.symbol
    );

    if (executedOrder.status === "FILLED" || executedOrder.status === "PARTIALLY_FILLED") {
      this.store.appendAudit({
        userId: executedOrder.userId,
        actorUserId: executedOrder.userId,
        action: "TRADE_EXECUTED",
        entityType: "ORDER",
        entityId: executedOrder.id,
        metadata: {
          broker: brokerName,
          brokerOrderId: execution.brokerOrderId,
          symbol: executedOrder.symbol,
          side: executedOrder.side,
          quantity: executedOrder.quantity,
          price: executedOrder.price
        }
      });
      this.addNotification({
        userId: executedOrder.userId,
        notificationType: "TRADE",
        title: "Broker trade executed",
        message: `${executedOrder.side} ${executedOrder.quantity.toFixed(2)} ${executedOrder.symbol} filled at ${executedOrder.price.toFixed(2)}`
      });
      this.realtime.publish({
        userId: executedOrder.userId,
        type: "trade.executed",
        data: { order: executedOrder, portfolio }
      });
    }

    return {
      order: executedOrder,
      ...(position ? { position } : {}),
      portfolio,
      riskDecision: executedOrder.riskDecision
    };
  }

  private listBrokerAccountRecords(userId: UUID): readonly BrokerAccount[] {
    return [...this.store.brokerAccounts.values()].filter((account) => account.userId === userId);
  }

  private sanitizeBrokerAccount(account: BrokerAccount): BrokerAccountView {
    const maskedAccountId =
      account.accountId.length <= 8
        ? account.accountId
        : `${account.accountId.slice(0, 4)}…${account.accountId.slice(-4)}`;
    return {
      id: account.id,
      userId: account.userId,
      brokerName: account.brokerName,
      accountId: maskedAccountId,
      status: account.status,
      hasCredentials: Boolean(account.encryptedApiKey && account.encryptedSecret),
      environment: account.environment ?? (account.brokerName === "ALPACA" ? "PAPER" : "PAPER"),
      ...(account.status === "CONNECTED" ? { lastSyncedAt: isoNow() } : {}),
      createdAt: account.createdAt
    };
  }

  private getDailyRealizedPnl(userId: UUID): number {
    const today = isoNow().slice(0, 10);
    return this.listTrades(userId)
      .filter((trade) => trade.closedAt?.slice(0, 10) === today)
      .reduce((sum, trade) => sum + trade.pnl, 0);
  }

  private normalizeProtectivePrice(input: {
    readonly orderType: OrderType;
    readonly side: OrderSide;
    readonly entryPrice: number;
    readonly requestedEntryPrice: number;
    readonly protectivePrice: number;
    readonly kind: "stop" | "target";
  }): number {
    const { orderType, side, entryPrice, requestedEntryPrice, protectivePrice, kind } = input;
    if (entryPrice <= 0 || protectivePrice <= 0) {
      return protectivePrice;
    }

    let scaled = protectivePrice;
    if (orderType === "MARKET" && requestedEntryPrice > 0) {
      scaled = Number(((entryPrice * protectivePrice) / requestedEntryPrice).toFixed(2));
    }

    const stopIsValid =
      kind === "stop"
        ? side === "BUY"
          ? scaled < entryPrice
          : scaled > entryPrice
        : side === "BUY"
          ? scaled > entryPrice
          : scaled < entryPrice;

    if (stopIsValid) {
      return scaled;
    }

    const defaultPercent = kind === "stop" ? 0.02 : 0.05;
    if (kind === "stop") {
      return Number(
        (side === "BUY" ? entryPrice * (1 - defaultPercent) : entryPrice * (1 + defaultPercent)).toFixed(2)
      );
    }
    return Number(
      (side === "BUY" ? entryPrice * (1 + defaultPercent) : entryPrice * (1 - defaultPercent)).toFixed(2)
    );
  }

  private evaluateOrderRisk(input: {
    readonly userId: UUID;
    readonly portfolio: Portfolio;
    readonly symbol: string;
    readonly side: OrderSide;
    readonly price: number;
    readonly stopLoss: number;
    readonly takeProfit: number;
    readonly existingPosition: Position | undefined;
    readonly requestedQuantity: number | undefined;
  }): RiskDecision {
    const existingPositionValue = input.existingPosition
      ? input.existingPosition.averagePrice * Math.abs(input.existingPosition.quantity)
      : 0;
    return validateTradeRisk(
      this.getRiskRules(input.userId),
      {
        equity: input.portfolio.portfolioValue,
        cashBalance: input.portfolio.cashBalance,
        dailyRealizedPnl: this.getDailyRealizedPnl(input.userId),
        currentDrawdownPercent: this.getPerformance(input.userId).maxDrawdown,
        existingPositionValue,
        existingPositionQuantity: input.existingPosition?.quantity ?? 0
      },
      {
        symbol: input.symbol,
        side: input.side,
        price: input.price,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit,
        ...(input.requestedQuantity === undefined
          ? {}
          : { requestedQuantity: input.requestedQuantity })
      }
    );
  }

  private isPaperOrderMarketable(order: Order, marketPrice: number): boolean {
    if (order.orderType === "MARKET") {
      return true;
    }
    if (order.orderType === "LIMIT") {
      return order.side === "BUY" ? marketPrice <= order.price : marketPrice >= order.price;
    }
    return order.side === "BUY" ? marketPrice >= order.price : marketPrice <= order.price;
  }

  private async applyPaperExecution(
    submittedOrder: Order,
    execution: BrokerExecutionResult,
    portfolio: Portfolio,
    existingPosition: Position | undefined
  ): Promise<OrderExecutionPayload> {
    if (execution.status === "SUBMITTED" && execution.filledQuantity === 0) {
      return {
        order: submittedOrder,
        portfolio,
        riskDecision: submittedOrder.riskDecision
      };
    }

    const executedOrder: Order = {
      ...submittedOrder,
      quantity: execution.filledQuantity || submittedOrder.quantity,
      price: execution.filledAveragePrice || submittedOrder.price,
      status: execution.status
    };
    this.store.orders.set(executedOrder.id, executedOrder);
    await this.platformRepository.persistOrder(executedOrder);
    await this.trackOrderStatus(executedOrder, {
      broker: this.paperBroker.name,
      brokerOrderId: execution.brokerOrderId,
      filledQuantity: execution.filledQuantity,
      filledAveragePrice: execution.filledAveragePrice
    });

    if (executedOrder.status !== "FILLED" && executedOrder.status !== "PARTIALLY_FILLED") {
      return {
        order: executedOrder,
        portfolio,
        riskDecision: executedOrder.riskDecision
      };
    }

    const trade = this.recordFilledTrade(executedOrder, existingPosition);
    const position = this.updatePositionFromOrder(executedOrder, existingPosition);
    const updatedPortfolio = this.updatePortfolioFromTrade(portfolio, executedOrder, trade);
    await Promise.all([
      this.platformRepository.persistTrade(trade),
      this.platformRepository.persistPosition(position),
      this.platformRepository.persistPortfolio(updatedPortfolio)
    ]);

    this.store.appendAudit({
      userId: executedOrder.userId,
      actorUserId: executedOrder.userId,
      action: "TRADE_EXECUTED",
      entityType: "ORDER",
      entityId: executedOrder.id,
      metadata: {
        broker: this.paperBroker.name,
        brokerOrderId: execution.brokerOrderId,
        symbol: executedOrder.symbol,
        side: executedOrder.side,
        quantity: executedOrder.quantity,
        price: executedOrder.price
      }
    });
    this.addNotification({
      userId: executedOrder.userId,
      notificationType: "TRADE",
      title: "Paper trade executed",
      message: `${executedOrder.side} ${executedOrder.quantity.toFixed(2)} ${executedOrder.symbol} filled at ${executedOrder.price.toFixed(2)}`
    });
    this.realtime.publish({
      userId: executedOrder.userId,
      type: "trade.executed",
      data: { trade }
    });

    return {
      order: executedOrder,
      trade,
      position,
      portfolio: updatedPortfolio,
      riskDecision: executedOrder.riskDecision
    };
  }

  private recordFilledTrade(order: Order, existingPosition: Position | undefined): Trade {
    const signedQuantity = order.side === "BUY" ? order.quantity : -order.quantity;
    const closesExisting =
      existingPosition !== undefined &&
      existingPosition.quantity !== 0 &&
      Math.sign(existingPosition.quantity) !== Math.sign(signedQuantity);
    const closingQuantity = closesExisting
      ? Math.min(Math.abs(existingPosition.quantity), order.quantity)
      : 0;
    const pnl =
      closingQuantity === 0 || !existingPosition
        ? 0
        : existingPosition.quantity > 0
          ? (order.price - existingPosition.averagePrice) * closingQuantity
          : (existingPosition.averagePrice - order.price) * closingQuantity;
    const now = isoNow();
    const trade: Trade = {
      id: randomUUID(),
      orderId: order.id,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      entryPrice: closesExisting && existingPosition ? existingPosition.averagePrice : order.price,
      ...(closingQuantity > 0 ? { exitPrice: order.price } : {}),
      pnl: Number(pnl.toFixed(2)),
      openedAt: now,
      ...(closingQuantity > 0 ? { closedAt: now } : {})
    };
    this.store.trades.set(trade.id, trade);
    return trade;
  }

  private updatePositionFromOrder(order: Order, existing: Position | undefined): Position {
    const signedQuantity = order.side === "BUY" ? order.quantity : -order.quantity;
    const existingQuantity = existing?.quantity ?? 0;
    const newQuantity = existingQuantity + signedQuantity;
    const sameDirection =
      existingQuantity === 0 || Math.sign(existingQuantity) === Math.sign(signedQuantity);
    let averagePrice = 0;
    if (newQuantity !== 0) {
      if (!existing || existingQuantity === 0) {
        averagePrice = order.price;
      } else if (sameDirection) {
        averagePrice =
          (existing.averagePrice * Math.abs(existingQuantity) + order.price * Math.abs(signedQuantity)) /
          (Math.abs(existingQuantity) + Math.abs(signedQuantity));
      } else if (Math.sign(newQuantity) === Math.sign(existingQuantity)) {
        averagePrice = existing.averagePrice;
      } else {
        averagePrice = order.price;
      }
    }
    const position: Position = {
      id: existing?.id ?? randomUUID(),
      userId: order.userId,
      symbol: order.symbol,
      quantity: Number(newQuantity.toFixed(4)),
      averagePrice: Number(averagePrice.toFixed(4)),
      unrealizedPnl: 0,
      updatedAt: isoNow()
    };
    this.store.positions.set(position.id, position);
    return position;
  }

  private updatePortfolioFromTrade(portfolio: Portfolio, order: Order, trade: Trade): Portfolio {
    const cashDelta = order.side === "BUY" ? -order.price * order.quantity : order.price * order.quantity;
    const initialCapital =
      portfolio.portfolioValue - portfolio.realizedPnl - portfolio.unrealizedPnl;
    const realizedPnl = Number((portfolio.realizedPnl + trade.pnl).toFixed(2));
    const unrealizedPnl = this.listPositions(order.userId)
      .reduce((sum, position) => sum + position.unrealizedPnl, 0);
    const updated: Portfolio = {
      ...portfolio,
      cashBalance: Number((portfolio.cashBalance + cashDelta).toFixed(2)),
      portfolioValue: Number((initialCapital + realizedPnl + unrealizedPnl).toFixed(2)),
      realizedPnl,
      unrealizedPnl: Number(unrealizedPnl.toFixed(2))
    };
    this.store.portfolios.set(updated.id, updated);
    return updated;
  }

  private async generateSignalViaAiService(
    symbol: string,
    candles: readonly MarketCandle[]
  ): Promise<ReturnType<typeof generateSignal>> {
    const aiServiceUrl = process.env.AI_SERVICE_URL;
    if (!aiServiceUrl) {
      return generateSignal(symbol, candles);
    }

    try {
      const response = await fetch(`${aiServiceUrl.replace(/\/$/, "")}/signals/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, candles })
      });
      if (!response.ok) {
        return generateSignal(symbol, candles);
      }
      const payload = (await response.json()) as unknown;
      if (this.isGeneratedSignal(payload)) {
        return payload;
      }
      return generateSignal(symbol, candles);
    } catch {
      return generateSignal(symbol, candles);
    }
  }

  private isGeneratedSignal(value: unknown): value is ReturnType<typeof generateSignal> {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return (
      typeof record.symbol === "string" &&
      (record.signalType === "BUY" || record.signalType === "SELL" || record.signalType === "HOLD") &&
      typeof record.confidenceScore === "number" &&
      typeof record.modelVersion === "string" &&
      typeof record.features === "object" &&
      record.features !== null &&
      !Array.isArray(record.features)
    );
  }
}
