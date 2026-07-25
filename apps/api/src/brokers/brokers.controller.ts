import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { ok } from "../common/api-response.js";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { AutonomousBootstrapService } from "../dondie/autonomous-bootstrap.service.js";
import { PlatformService } from "../platform.service.js";
import { paginate } from "../common/pagination.js";

@Controller("brokers")
export class BrokersController {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(AutonomousBootstrapService) private readonly bootstrap: AutonomousBootstrapService
  ) {}

  @Post("connect")
  async connect(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    const account = await this.platform.connectBroker(user.sub, body);
    // After Alpaca connect: agent takes over strategy, risk, and AUTOPILOT.
    // Capital remains in Alpaca — deposit/withdraw there.
    if (account.brokerName === "ALPACA" && account.status === "CONNECTED") {
      const autonomy = await this.bootstrap.ensureAutonomousMode(user.sub);
      return ok({ ...account, autonomy });
    }
    return ok(account);
  }

  @Get("accounts")
  async accounts(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): Promise<ReturnType<typeof ok>> {
    const accounts = this.platform.listBrokerAccounts(user.sub);
    const alpacaReady = accounts.some(
      (account) =>
        account.brokerName === "ALPACA" && account.status === "CONNECTED" && account.hasCredentials
    );
    // Already connected before hands-off shipped: start autonomy without reconnecting.
    if (alpacaReady && !this.platform.hasHandsOffAgent(user.sub)) {
      try {
        await this.bootstrap.ensureAutonomousMode(user.sub);
      } catch {
        // Listing brokers must still succeed if bootstrap cannot complete.
      }
    }
    return ok(paginate(this.platform.listBrokerAccounts(user.sub), page, pageSize));
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthenticatedPrincipal, @Param("id") id: string): ReturnType<typeof ok> {
    return ok(this.platform.deleteBrokerAccount(user.sub, id));
  }
}
