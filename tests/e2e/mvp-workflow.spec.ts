import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

const decodeBase32 = (input: string): Buffer => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of input.toUpperCase().replace(/=+$/u, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) {
      throw new Error("Invalid MFA setup secret.");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const totpCode = (secret: string, timestampMs = Date.now()): string => {
  const counter = Math.floor(timestampMs / 1000 / 30);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary =
    ((digest[offset]! & 127) << 24) |
    ((digest[offset + 1]! & 255) << 16) |
    ((digest[offset + 2]! & 255) << 8) |
    (digest[offset + 3]! & 255);
  return String(binary % 1_000_000).padStart(6, "0");
};

test.describe.serial("Dondie survival agent platform", () => {
  test("runs the required paper trading workflow with audit visibility", async ({ page }, testInfo) => {
    const projectSlug = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const traderEmail = `paper-${projectSlug}-${testInfo.workerIndex}-${Date.now()}@example.com`;
    const traderPassword = "ValidPass123!";
    const adminEmail = process.env.E2E_ADMIN_EMAIL;
    const adminPassword = process.env.E2E_ADMIN_PASSWORD;

    expect(adminEmail).toBeTruthy();
    expect(adminPassword).toBeTruthy();

    await test.step("Admin provisions trader account", async () => {
      await page.goto("/");
      await page.getByTestId("login-email").fill(adminEmail ?? "");
      await page.getByTestId("login-password").fill(adminPassword ?? "");
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("dashboard-title")).toContainText("Dondie Control Room");
      await page.getByTestId("tab-admin").click();
      await expect(page.getByTestId("admin-view")).toBeVisible();
      await page.getByTestId("admin-create-email").fill(traderEmail);
      await page.getByTestId("admin-create-password").fill(traderPassword);
      await page.getByTestId("admin-create-submit").click();
      await expect(page.getByTestId("auth-notice")).toContainText("created");
      await page.getByRole("button", { name: "Logout" }).click();
    });

    await test.step("Login", async () => {
      await page.getByTestId("login-email").fill(traderEmail);
      await page.getByTestId("login-password").fill(traderPassword);
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("dashboard-title")).toContainText("Dondie Control Room");
    });

    await test.step("Dashboard loads", async () => {
      await expect(page.getByText("Portfolio Value")).toBeVisible();
      await expect(page.getByText("Risk Matrix")).toBeVisible();
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
    });

    await test.step("Strategy creation", async () => {
      await page.getByTestId("strategy-name").fill("E2E Momentum Guard");
      await page.getByTestId("create-strategy").click();
      await expect(page.getByTestId("workflow-notice")).toContainText("Strategy E2E Momentum Guard created");
      await expect(page.getByTestId("strategy-status")).toContainText("configured");
    });

    await test.step("Manual paper order", async () => {
      await page.getByTestId("execute-manual-trade").click();
      await expect(page.getByTestId("workflow-notice")).toContainText("Manual paper order filled");
    });

    await test.step("Generate signal", async () => {
      await page.getByTestId("signal-symbol").fill("AAPL");
      await page.getByTestId("generate-signal").click();
      await expect(page.getByTestId("latest-signal")).toContainText("AAPL");
      await expect(page.getByTestId("latest-signal")).toContainText("confidence");
    });

    await test.step("Execute paper trade", async () => {
      await page.getByTestId("execute-paper-trade").click();
      await expect(page.getByTestId("workflow-notice")).toContainText("Paper trade");
    });

    await test.step("Run fully automated workflow", async () => {
      await page.getByTestId("run-automation").click();
      await expect(page.getByTestId("workflow-notice")).toContainText("Automated paper trade");
    });

    await test.step("Risk rule blocks invalid trade", async () => {
      await page.getByTestId("execute-invalid-trade").click();
      await expect(page.getByTestId("risk-block-message")).toContainText("Risk rule blocked invalid trade");
    });

    await test.step("Portfolio and trade history update", async () => {
      await expect(page.getByTestId("trade-history")).toContainText("AAPL");
      await expect(page.getByTestId("positions-list")).toContainText("AAPL");
    });

    await test.step("Market data and watchlist update", async () => {
      await page.getByTestId("tab-market").click();
      await expect(page.getByTestId("market-view")).toBeVisible();
      await expect(page.getByTestId("realtime-status")).toContainText("WebSocket live");
      await expect(page.getByTestId("market-price-history")).toBeVisible();
      await expect(page.getByTestId("market-latest-price")).not.toContainText("$0.00");
      await page.getByTestId("watchlist-symbols").fill("AAPL, MSFT, TSLA");
      await page.getByTestId("save-watchlist").click();
      await expect(page.getByTestId("workflow-notice")).toContainText("Watchlist updated");
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath("market.png"), fullPage: true });
    });

    await test.step("Strategy editing and activation controls", async () => {
      await page.getByTestId("tab-strategies").click();
      await expect(page.getByTestId("strategies-view")).toBeVisible();
      await page.getByLabel("Strategy name").fill("E2E Momentum Guard v2");
      await page.getByLabel("Confidence threshold").fill("65");
      await page.getByTestId("save-strategy").click();
      await expect(page.getByTestId("workflow-notice")).toContainText("updated");
    });

    await test.step("Risk configuration persists", async () => {
      await page.getByTestId("tab-risk").click();
      await expect(page.getByTestId("risk-view")).toBeVisible();
      await page.getByLabel("Risk per trade %").fill("1.25");
      await page.getByTestId("save-risk-rules").click();
      await expect(page.getByTestId("workflow-notice")).toContainText("Risk controls updated");
    });

    await test.step("Historical backtest completes", async () => {
      await page.getByTestId("tab-lab").click();
      await expect(page.getByTestId("lab-view")).toBeVisible();
      await page.getByTestId("run-backtest").click();
      await expect(page.getByTestId("backtest-result")).toBeVisible();
      await expect(page.getByTestId("workflow-notice")).toContainText("Backtest completed");
      await page.getByTestId("run-walk-forward").click();
      await expect(page.getByTestId("walk-forward-result")).toBeVisible();
      await expect(page.getByTestId("workflow-notice")).toContainText("Walk-forward test completed");
      await page.screenshot({ path: testInfo.outputPath("simulation-lab.png"), fullPage: true });
    });

    await test.step("MFA setup and login challenge", async () => {
      await page.getByTestId("tab-risk").click();
      await page.getByTestId("setup-mfa").click();
      await expect(page.getByTestId("mfa-setup")).toBeVisible();
      const secret = await page.getByLabel("Setup secret").inputValue();
      await page.getByTestId("mfa-code").fill(totpCode(secret));
      await page.getByTestId("enable-mfa").click();
      await expect(page.getByTestId("mfa-status")).toContainText("ENABLED");
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath("mfa.png"), fullPage: true });

      await page.getByRole("button", { name: "Logout" }).click();
      await page.getByTestId("login-email").fill(traderEmail);
      await page.getByTestId("login-password").fill(traderPassword);
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("login-mfa-code")).toBeVisible();
      await page.getByTestId("login-mfa-code").fill(totpCode(secret));
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("dashboard-title")).toContainText("Dondie Control Room");
    });

    await test.step("Admin audit log is visible", async () => {
      await page.getByRole("button", { name: "Logout" }).click();
      await page.getByTestId("login-email").fill(adminEmail ?? "");
      await page.getByTestId("login-password").fill(adminPassword ?? "");
      await page.getByTestId("login-submit").click();
      await expect(page.getByTestId("dashboard-title")).toContainText("Dondie Control Room");
      await page.getByTestId("tab-admin").click();
      await expect(page.getByTestId("admin-view")).toBeVisible();
      await expect(page.getByTestId("admin-users")).toContainText(adminEmail ?? "");
      await expect(page.getByTestId("operational-metrics")).toContainText("API Avg Latency");
      await expect(page.getByTestId("operational-metrics")).toContainText("Signal Throughput");
      await expect(page.getByTestId("admin-audit-log")).toBeVisible();
      await expect(page.getByTestId("admin-audit-log")).toContainText("TRADE_EXECUTED");
      await expect(page.getByTestId("admin-audit-log")).toContainText("RISK_REJECTED_ORDER");
      await expect(page.getByTestId("admin-audit-log")).toContainText("BACKTEST_RUN");
      await expect(page.getByTestId("admin-audit-log")).toContainText("WALK_FORWARD_BACKTEST_RUN");
      const horizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath("admin.png"), fullPage: true });
    });
  });
});
