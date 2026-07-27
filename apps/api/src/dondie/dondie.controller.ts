import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { AutonomousBootstrapService } from "./autonomous-bootstrap.service.js";
import { DondieChatService } from "./dondie-chat.service.js";
import { DondieService } from "./dondie.service.js";

@Controller("dondie")
export class DondieController {
  constructor(
    @Inject(DondieService) private readonly dondie: DondieService,
    @Inject(AutonomousBootstrapService) private readonly bootstrap: AutonomousBootstrapService,
    @Inject(DondieChatService) private readonly chatService: DondieChatService
  ) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.dondie.getAgent(user.sub) ?? null);
  }

  @Get("wallet")
  wallet(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.dondie.getWallet(user.sub));
  }

  @Get("lifestyle")
  async lifestyle(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.getLifestyle(user.sub));
  }

  @Get("memories")
  memories(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.dondie.listMemories(user.sub));
  }

  @Get("chat")
  chatThread(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.chatService.getThread(user.sub));
  }

  @Post("chat")
  async sendChat(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body: unknown
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.chatService.chat(user.sub, body));
  }

  @Post("universe")
  async updateUniverse(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body: unknown
  ): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.updateSymbolUniverse(user.sub, body));
  }

  @Post("activate")
  async activate(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.activate(user.sub, body));
  }

  /** Hands-off: agent picks strategy/risk/AUTOPILOT. Capital stays in Alpaca. */
  @Post("go-autonomous")
  async goAutonomous(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.bootstrap.ensureAutonomousMode(user.sub));
  }

  @Post("pause")
  async pause(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.pause(user.sub));
  }

  @Post("resume")
  async resume(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.resume(user.sub));
  }

  @Get("scheduler")
  scheduler(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    void user;
    return ok(this.dondie.getSchedulerStatus());
  }

  @Get("activities")
  activities(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.dondie.listTradeActivities(user.sub));
  }

  @Post("run")
  async run(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.run(user.sub, body));
  }
}
