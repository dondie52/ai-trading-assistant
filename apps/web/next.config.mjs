/** @type {import('next').NextConfig} */
const isE2E =
  process.env.ENABLE_E2E_SEED === "true" || process.env.AUTH_PROVIDER === "legacy";

const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  transpilePackages: ["@trading/shared", "@trading/types"],
  typescript: {
    ignoreBuildErrors: false
  },
  // Public browser defaults for production when Vercel project env is incomplete.
  // Never inject production Supabase keys during Playwright/e2e — that forces the
  // browser into Supabase login and skips the seeded local admin account.
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ??
      (isE2E
        ? "http://127.0.0.1:3001/api/v1"
        : "https://ai-trading-assistant-cgpp.onrender.com/api/v1"),
    NEXT_PUBLIC_SUPABASE_URL: isE2E
      ? (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
      : (process.env.NEXT_PUBLIC_SUPABASE_URL ??
        "https://axrclxwittqyurwqjvdq.supabase.co"),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: isE2E
      ? (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "")
      : (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cmNseHdpdHRxeXVyd3FqdmRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDk4MDIsImV4cCI6MjA5NjQ4NTgwMn0.jkIL_ijJYzx8e44mCCa1VLH-LqkmqUfhVe8IJzSN7hc")
  }
};

export default nextConfig;
