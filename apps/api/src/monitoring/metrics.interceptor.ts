import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { finalize, tap } from "rxjs/operators";
import { OperationalMetricsService } from "./operational-metrics.service.js";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(OperationalMetricsService)
    private readonly metrics: OperationalMetricsService
  ) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = performance.now();
    let failed = false;
    return next.handle().pipe(
      tap({
        error: () => {
          failed = true;
        }
      }),
      finalize(() => {
        this.metrics.recordApiRequest(performance.now() - startedAt, failed);
      })
    );
  }
}
