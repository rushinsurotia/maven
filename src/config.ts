import path from "node:path";

export const PORT = Number(process.env.PORT ?? 3000);
export const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
/** Read lazily so tests (and tools) can point it elsewhere before first use. */
export const dataDir = () => path.resolve(process.env.MAVEN_DATA_DIR ?? "data");
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const ALLOW_PRIVATE_URLS = process.env.ALLOW_PRIVATE_URLS
  ? process.env.ALLOW_PRIVATE_URLS === "1" || process.env.ALLOW_PRIVATE_URLS === "true"
  : !IS_PRODUCTION;
/** If set, the dashboard and onboarding require this password (HTTP basic auth). The widget stays public. */
export const ACCESS_PASSWORD = process.env.MAVEN_ACCESS_PASSWORD || "";

/**
 * "Maven AI (included)": the default agent engine, running on the platform's
 * own keys so businesses can start without one. Read lazily from the
 * environment. Configure Groq, Anthropic, or both (the second is a fallback).
 */
export function managedConfig() {
  const env = process.env;
  const groq = env.MAVEN_GROQ_API_KEY
    ? { provider: "groq" as const, apiKey: env.MAVEN_GROQ_API_KEY, baseUrl: env.MAVEN_GROQ_BASE_URL || undefined, model: env.MAVEN_GROQ_MODEL || "auto" }
    : undefined;
  const anthropic = env.MAVEN_ANTHROPIC_API_KEY
    ? { provider: "anthropic" as const, apiKey: env.MAVEN_ANTHROPIC_API_KEY, baseUrl: env.MAVEN_ANTHROPIC_BASE_URL || undefined, model: env.MAVEN_ANTHROPIC_MODEL || "claude-opus-5" }
    : undefined;
  const backends = env.MAVEN_MANAGED_PROVIDER === "anthropic" ? [anthropic, groq] : [groq, anthropic];
  return {
    backends: backends.filter((b) => b !== undefined),
    dailyMessageLimit: Number(env.MAVEN_MANAGED_DAILY_MESSAGES ?? 200),
  };
}
