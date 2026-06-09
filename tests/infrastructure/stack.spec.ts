import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown, label: string): JsonRecord => {
  expect(typeof value, `${label} must be an object`).toBe("object");
  expect(value, `${label} must not be null`).not.toBeNull();
  expect(Array.isArray(value), `${label} must not be an array`).toBe(false);
  return value as JsonRecord;
};

const readYaml = (path: string): JsonRecord => asRecord(parse(readFileSync(path, "utf8")), path);
const readText = (path: string): string => readFileSync(path, "utf8");

const readServices = (): Record<string, JsonRecord> => {
  const compose = readYaml("docker-compose.yml");
  const services = asRecord(compose.services, "compose services");
  return Object.fromEntries(
    Object.entries(services).map(([name, service]) => [name, asRecord(service, `service ${name}`)])
  );
};

const envValue = (service: JsonRecord, key: string): string => {
  const environment = asRecord(service.environment, "service environment");
  const value = environment[key];
  expect(typeof value, `${key} must be configured`).toBe("string");
  return value as string;
};

describe("local container stack definition", () => {
  it("defines the required MVP services with health checks and ports", () => {
    const services = readServices();

    expect(Object.keys(services).sort()).toEqual(["ai-service", "api", "web"]);
    expect(services.api?.build).toMatchObject({ dockerfile: "infrastructure/docker/api.Dockerfile" });
    expect(services.web?.build).toMatchObject({ dockerfile: "infrastructure/docker/web.Dockerfile" });
    expect(services["ai-service"]?.build).toMatchObject({
      dockerfile: "infrastructure/docker/ai-service.Dockerfile"
    });

    expect(services.api?.ports).toContain("3001:3001");
    expect(services.web?.ports).toContain("3000:3000");
    expect(services["ai-service"]?.ports).toContain("8000:8000");

    for (const name of ["api", "web", "ai-service"]) {
      expect(services[name]?.healthcheck, `${name} must define a healthcheck`).toBeTruthy();
      expect(services[name]?.restart, `${name} must define an automatic restart policy`).toBe("unless-stopped");
    }
  });

  it("requires runtime secrets through environment variables instead of hardcoding them", () => {
    const composeText = readText("docker-compose.yml");
    const envExample = readText(".env.example");
    const services = readServices();

    expect(composeText).not.toContain("redis:");
    expect(composeText).not.toContain("postgres:");
    expect(envExample).toContain("pooler.supabase.com");
    expect(envValue(services.api, "DATABASE_URL")).toContain("${DATABASE_URL:?");
    expect(envValue(services.api, "JWT_ACCESS_SECRET")).toContain("${JWT_ACCESS_SECRET:?");
    expect(envValue(services.api, "JWT_REFRESH_SECRET")).toContain("${JWT_REFRESH_SECRET:?");
    expect(envValue(services.api, "MFA_ENCRYPTION_KEY")).toContain("${MFA_ENCRYPTION_KEY:?");
    expect(envValue(services.api, "BROKER_CREDENTIAL_ENCRYPTION_KEY")).toContain(
      "${BROKER_CREDENTIAL_ENCRYPTION_KEY:?"
    );
    expect(envValue(services.api, "SESSION_IDLE_TIMEOUT_MINUTES")).toContain(
      "${SESSION_IDLE_TIMEOUT_MINUTES:-30}"
    );
    expect(envValue(services.api, "CORS_ORIGINS")).toContain("${CORS_ORIGINS:-");
  });

  it("enforces append-only audit records at the PostgreSQL layer", () => {
    const migration = readText(
      "supabase/migrations/20260606110000_mfa_and_immutable_audit.sql"
    );

    expect(migration).toContain("mfa_secret_encrypted");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("audit_logs_immutable");
    expect(migration).toContain("audit_logs are append-only");
  });

  it("migrates append-only order lifecycle history", () => {
    const migration = readText(
      "supabase/migrations/20260606120000_order_status_events.sql"
    );

    expect(migration).toContain('CREATE TABLE "public"."order_status_events"');
    expect(migration).toContain('"status" "public"."OrderStatus"');
    expect(migration).toContain("order_status_events_order_id_occurred_at_idx");
  });

  it("migrates server-enforced session activity tracking", () => {
    const migration = readText(
      "supabase/migrations/20260606130000_session_idle_expiry.sql"
    );

    expect(migration).toContain("last_activity_at");
    expect(migration).toContain("sessions_last_activity_at_idx");
  });

  it("connects the API to Supabase and wires dependent services", () => {
    const services = readServices();
    const api = services.api;
    const web = services.web;

    expect(api?.command).toBe("npm run start -w @trading/api");
    expect(envValue(api, "DATABASE_URL")).toContain("${DATABASE_URL:?");
    expect(envValue(api, "AI_SERVICE_URL")).toBe("http://ai-service:8000");
    expect(asRecord(api?.depends_on, "api depends_on")).toMatchObject({
      "ai-service": { condition: "service_started" }
    });
    expect(asRecord(web?.depends_on, "web depends_on")).toMatchObject({
      api: { condition: "service_healthy" }
    });
  });

  it("keeps Supabase migrations and runtime tables under version control", () => {
    const config = readText("supabase/config.toml");
    const runtimeMigration = readText(
      "supabase/migrations/20260609110258_supabase_runtime.sql"
    );

    expect(config).toContain('major_version = 17');
    expect(runtimeMigration).toContain('"notification_queue"');
    expect(runtimeMigration).toContain('"market_data_cache"');
    expect(runtimeMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(runtimeMigration).toContain('FROM "anon", "authenticated"');
  });

  it("keeps Dockerfiles aligned with exposed service ports and build commands", () => {
    const apiDockerfile = readText("infrastructure/docker/api.Dockerfile");
    const webDockerfile = readText("infrastructure/docker/web.Dockerfile");
    const aiDockerfile = readText("infrastructure/docker/ai-service.Dockerfile");

    expect(apiDockerfile).toContain("npm run prisma:generate -w @trading/api");
    expect(apiDockerfile).toContain("npm run build -w @trading/api");
    expect(apiDockerfile).toContain("EXPOSE 3001");
    expect(webDockerfile).toContain("npm run build -w @trading/web");
    expect(webDockerfile).toContain("EXPOSE 3000");
    expect(aiDockerfile).toContain("pip install --no-cache-dir -r requirements.txt");
    expect(aiDockerfile).toContain("EXPOSE 8000");
    expect(aiDockerfile).toContain("uvicorn");
  });

  it("builds the Vercel web deployment from the monorepo workspace", () => {
    const rootConfig = asRecord(JSON.parse(readText("vercel.json")), "root Vercel config");
    const webConfig = asRecord(JSON.parse(readText("apps/web/vercel.json")), "web Vercel config");

    expect(rootConfig.framework).toBe("nextjs");
    expect(rootConfig.installCommand).toBe("npm ci");
    expect(rootConfig.buildCommand).toContain("npm run build:packages");
    expect(rootConfig.buildCommand).toContain("npm run build -w @trading/web");
    expect(rootConfig.outputDirectory).toBe("apps/web/.next");
    expect(webConfig.installCommand).toBe("cd ../.. && npm ci");
    expect(webConfig.buildCommand).toContain("cd ../..");
  });

  it("keeps CI wired to install Playwright browsers and run validation", () => {
    const workflow = readYaml(".github/workflows/ci.yml");
    const jobs = asRecord(workflow.jobs, "workflow jobs");
    const validate = asRecord(jobs.validate, "validate job");
    const steps = validate.steps;

    expect(Array.isArray(steps)).toBe(true);
    const serializedSteps = JSON.stringify(steps);
    expect(serializedSteps).toContain("actions/setup-node@v4");
    expect(serializedSteps).toContain("npm ci");
    expect(serializedSteps).toContain("npx playwright install --with-deps");
    expect(serializedSteps).toContain("npm run validate");
  });
});
