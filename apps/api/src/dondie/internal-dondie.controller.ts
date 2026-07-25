import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { Public } from "../auth/decorators.js";
import { ok } from "../common/api-response.js";
import { DondieService } from "./dondie.service.js";

/**
 * Server-side autopilot wake endpoint.
 * Called by GitHub Actions / Render Cron — never by the browser.
 */
@Controller("internal/dondie")
export class InternalDondieController {
  constructor(@Inject(DondieService) private readonly dondie: DondieService) {}

  @Public()
  @Post("tick")
  @HttpCode(200)
  async tick(
    @Headers("authorization") authorization?: string,
    @Headers("x-cron-secret") cronSecret?: string
  ): Promise<ReturnType<typeof ok>> {
    const expected = process.env.CRON_SECRET?.trim() ?? "";
    if (!expected) {
      throw new ServiceUnavailableException({
        code: "CRON_SECRET_MISSING",
        message: "CRON_SECRET is not configured on the API."
      });
    }

    const bearer =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";
    const provided = (cronSecret?.trim() || bearer).trim();
    if (!provided || provided !== expected) {
      throw new UnauthorizedException({
        code: "CRON_UNAUTHORIZED",
        message: "Invalid cron secret."
      });
    }

    return ok(await this.dondie.tickDueAgents());
  }
}
