import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { paginate } from "../src/common/pagination.js";

describe("API pagination", () => {
  it("returns the requested slice with standard metadata", () => {
    expect(paginate([1, 2, 3, 4, 5], "2", "2")).toEqual({
      data: [3, 4],
      page: 2,
      pageSize: 2,
      total: 5
    });
  });

  it("rejects invalid and excessive page values", () => {
    expect(() => paginate([], "0", "20")).toThrow(BadRequestException);
    expect(() => paginate([], "1", "101")).toThrow(BadRequestException);
  });
});
