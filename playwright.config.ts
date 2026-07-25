import { defineConfig, devices } from "@playwright/test";

const generatedAdminPassword =
  process.env.E2E_ADMIN_PASSWORD ??
  `Admin-${Date.now()}-${Math.random().toString(16).slice(2)}-Aa1!`;
const localBrowserChannel = process.env.CI ? {} : { channel: "chrome" as const };

process.env.E2E_ADMIN_PASSWORD = generatedAdminPassword;
process.env.E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin.e2e@quantcore.local";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 120_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run e2e:servers",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      API_PORT: "3001",
      // Force local legacy auth. next.config.js otherwise falls back to production
      // Supabase URL/anon key, which makes login skip the seeded E2E admin.
      AUTH_PROVIDER: "legacy",
      MFA_REQUIRED: "false",
      DATABASE_URL: "",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:3001/api/v1",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      ENABLE_E2E_SEED: "true",
      E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL,
      E2E_ADMIN_PASSWORD: generatedAdminPassword
    }
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], ...localBrowserChannel }
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], ...localBrowserChannel }
    }
  ]
});
