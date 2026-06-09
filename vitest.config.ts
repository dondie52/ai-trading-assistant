import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "packages/**/*.test.ts",
      "apps/api/**/*.spec.ts",
      "apps/api/test/**/*.spec.ts",
      "tests/infrastructure/**/*.spec.ts"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["**/test/**", "**/*.spec.ts", "**/*.test.ts"],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 80,
        lines: 80
      }
    }
  },
  resolve: {
    alias: {
      "@trading/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
      "@trading/types": fileURLToPath(new URL("./packages/types/src/index.ts", import.meta.url))
    }
  }
});
