const localOrigins = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
const vercelOrigins = /^https:\/\/[\w.-]+\.vercel\.app$/;

export const allowedCorsOrigins = (): readonly (string | RegExp)[] => {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const extras: Array<string | RegExp> = [...localOrigins, vercelOrigins];
  return configured && configured.length > 0 ? [...configured, ...extras] : extras;
};
