export type AuthProvider = "supabase" | "legacy";

export const resolveAuthProvider = (): AuthProvider => {
  const configured = process.env.AUTH_PROVIDER?.trim().toLowerCase();
  if (configured === "legacy" || configured === "supabase") {
    return configured;
  }
  if (process.env.NODE_ENV === "test") {
    return "legacy";
  }
  return "supabase";
};

export const isSupabaseAuth = (): boolean => resolveAuthProvider() === "supabase";

export const readMfaGraceDays = (): number => {
  const parsed = Number(process.env.MFA_GRACE_DAYS ?? "7");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 7;
};

export const isMfaRequired = (): boolean => process.env.MFA_REQUIRED !== "false";
