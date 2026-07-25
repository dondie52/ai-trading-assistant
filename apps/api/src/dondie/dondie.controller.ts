import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import type { AuthenticatedPrincipal } from "../common/request.js";
import { DondieService } from "./dondie.service.js";

@Controller("dondie")
export class DondieController {
  constructor(@Inject(DondieService) private readonly dondie: DondieService) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.dondie.getAgent(user.sub) ?? null);
  }

  @Get("wallet")
  wallet(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.dondie.getWallet(user.sub));
  }

  @Get("lifestyle")
  lifestyle(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.dondie.getLifestyle(user.sub));
  }

  @Get("memories")
  memories(@CurrentUser() user: AuthenticatedPrincipal): ReturnType<typeof ok> {
    return ok(this.dondie.listMemories(user.sub));
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

  @Post("pause")
  async pause(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.pause(user.sub));
  }

  @Post("resume")
  async resume(@CurrentUser() user: AuthenticatedPrincipal): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.resume(user.sub));
  }

  @Post("run")
  async run(@CurrentUser() user: AuthenticatedPrincipal, @Body() body: unknown): Promise<ReturnType<typeof ok>> {
    return ok(await this.dondie.run(user.sub, body));
  }
}
