import { BadRequestException } from "@nestjs/common";
import type { PaginatedResult } from "@trading/types";

const readPageValue = (
  value: string | undefined,
  fallback: number,
  field: "page" | "pageSize",
  maximum?: number
): number => {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: `${field} must be a positive integer${maximum ? ` no greater than ${maximum}` : ""}.`
    });
  }
  return parsed;
};

export const paginate = <T>(
  items: readonly T[],
  pageValue?: string,
  pageSizeValue?: string
): PaginatedResult<T> => {
  const page = readPageValue(pageValue, 1, "page");
  const pageSize = readPageValue(pageSizeValue, 20, "pageSize", 100);
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length
  };
};
