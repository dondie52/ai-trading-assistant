import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AdminController } from "./admin/admin.controller.js";
import { AutomationController } from "./automation/automation.controller.js";
import { BacktestsController } from "./backtests/backtests.controller.js";
import { PrismaAuditSink } from "./audit/prisma-audit.sink.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { RateLimitGuard } from "./common/rate-limit.guard.js";
import { AuthController } from "./auth/auth.controller.js";
import { JwtAuthGuard } from "./auth/jwt-auth.guard.js";
import { MfaService } from "./auth/mfa.service.js";
import { RolesGuard } from "./auth/roles.guard.js";
import { SessionActivityService } from "./auth/session-activity.service.js";
import { SupabaseAdminService } from "./auth/supabase-admin.service.js";
import { SupabaseAuthService } from "./auth/supabase-auth.service.js";
import { TokenService } from "./auth/token.service.js";
import { AlpacaBrokerAdapter } from "./brokers/alpaca-broker.adapter.js";
import { BrokerCredentialService } from "./brokers/broker-credential.service.js";
import { BrokersController } from "./brokers/brokers.controller.js";
import { PaperBrokerAdapter } from "./brokers/paper-broker.adapter.js";
import { MarketController } from "./market/market.controller.js";
import { MetricsInterceptor } from "./monitoring/metrics.interceptor.js";
import { OperationalMetricsService } from "./monitoring/operational-metrics.service.js";
import { NotificationsController } from "./notifications/notifications.controller.js";
import { PortfolioController } from "./portfolio/portfolio.controller.js";
import { PlatformService } from "./platform.service.js";
import { ReportsController } from "./reports/reports.controller.js";
import { RiskController } from "./risk/risk.controller.js";
import { SignalsController } from "./signals/signals.controller.js";
import { HealthController } from "./health/health.controller.js";
import { DatabaseHealthService } from "./infrastructure/database-health.service.js";
import { PrismaPlatformRepository } from "./infrastructure/prisma-platform.repository.js";
import { PrismaService } from "./infrastructure/prisma.service.js";
import { SupabaseCacheQueueService } from "./infrastructure/supabase-cache-queue.service.js";
import { RealtimeEventBus } from "./realtime/realtime-event-bus.js";
import { RealtimeGateway } from "./realtime/realtime.gateway.js";
import { PlatformStore } from "./store/platform.store.js";
import { StrategiesController } from "./strategies/strategies.controller.js";
import { AnalyticsController } from "./analytics/analytics.controller.js";
import { OrdersController } from "./trading/orders.controller.js";
import { PositionsController } from "./trading/positions.controller.js";
import { TradesController } from "./trading/trades.controller.js";
import { UsersController } from "./users/users.controller.js";
import { DondieController } from "./dondie/dondie.controller.js";
import { DondieService } from "./dondie/dondie.service.js";
import { DondieRepository } from "./dondie/dondie.repository.js";
import { DondieBrainFreeService } from "./dondie/dondie-brain-free.service.js";
import { DondieScheduler } from "./dondie/dondie.scheduler.js";

@Module({
  controllers: [
    AdminController,
    AutomationController,
    BacktestsController,
    AuthController,
    BrokersController,
    HealthController,
    MarketController,
    NotificationsController,
    PortfolioController,
    ReportsController,
    RiskController,
    SignalsController,
    StrategiesController,
    AnalyticsController,
    OrdersController,
    PositionsController,
    TradesController,
    UsersController,
    DondieController
  ],
  providers: [
    AlpacaBrokerAdapter,
    BrokerCredentialService,
    DatabaseHealthService,
    PaperBrokerAdapter,
    PlatformService,
    PlatformStore,
    MfaService,
    OperationalMetricsService,
    PrismaAuditSink,
    PrismaPlatformRepository,
    PrismaService,
    SupabaseCacheQueueService,
    RealtimeEventBus,
    RealtimeGateway,
    SessionActivityService,
    SupabaseAdminService,
    SupabaseAuthService,
    TokenService,
    DondieService,
    DondieRepository,
    DondieBrainFreeService,
    DondieScheduler,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor
    }
  ]
})
export class AppModule {}
