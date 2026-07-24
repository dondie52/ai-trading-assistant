import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import type { Response } from "express";
import type { JsonObject } from "@trading/types";

interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: JsonObject;
}

const isErrorBody = (value: unknown): value is ErrorBody => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    let error: ErrorBody = {
      code: status === HttpStatus.INTERNAL_SERVER_ERROR ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      message: status === HttpStatus.INTERNAL_SERVER_ERROR ? "Internal server error" : "Request failed"
    };

    if (typeof body === "string") {
      error = { code: "REQUEST_ERROR", message: body };
    } else if (isErrorBody(body)) {
      error = {
        code: body.code,
        message: body.message,
        ...(body.details ? { details: body.details } : {})
      };
    } else if (typeof body === "object" && body !== null) {
      const record = body as Record<string, unknown>;
      const message =
        typeof record.message === "string"
          ? record.message
          : Array.isArray(record.message)
            ? record.message.join(", ")
            : error.message;
      const details =
        typeof record.details === "object" && record.details !== null
          ? (record.details as JsonObject)
          : undefined;
      error = {
        code: typeof record.code === "string"
          ? record.code
          : typeof record.error === "string"
            ? record.error.toUpperCase().replace(/\s+/g, "_")
            : error.code,
        message,
        ...(details ? { details } : {})
      };
    }

    response.status(status).json({
      success: false,
      error
    });
  }
}
