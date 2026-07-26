import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // apps/web sets tsconfig jsx: "preserve" for Next; the test transform needs
  // to actually compile JSX instead.
  oxc: {
    jsx: {
      runtime: "automatic"
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "packages/**/*.test.ts",
      "apps/api/**/*.spec.ts",
      "apps/api/test/**/*.spec.ts",
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
      "tests/infrastructure/**/*.spec.ts"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["**/test/**", "**/*.spec.ts", "**/*.test.ts", "**/*.test.tsx"],
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
