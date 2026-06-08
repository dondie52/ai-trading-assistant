import type { ApiSuccess } from "@trading/types";

export const ok = <T>(data: T): ApiSuccess<T> => ({
  success: true,
  data
});

