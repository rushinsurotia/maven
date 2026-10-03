import { managedConfig } from "../config";
import { anthropicProvider } from "./anthropic";
import { groqProvider } from "./openai";
import { ProviderError, type Provider } from "./types";

/**
 * "Maven AI (included)": runs on the platform's keys. Tries each configured
 * backend in order and falls back to the next one if a backend fails before
 * it has streamed any text (outage, rate limit, bad key).
 */
export const mavenProvider: Provider = {
  id: "maven",
  async *streamChat(_cred, req) {
    const { backends } = managedConfig();
    if (!backends.length) throw new ProviderError("Maven AI isn't configured on this server (set MAVEN_GROQ_API_KEY or MAVEN_ANTHROPIC_API_KEY)");
    let lastError: unknown;
    for (const b of backends) {
      const provider = b.provider === "groq" ? groqProvider : anthropicProvider;
      let started = false;
      try {
        for await (const delta of provider.streamChat({ provider: b.provider, apiKey: b.apiKey, baseUrl: b.baseUrl }, { ...req, model: b.model })) {
          started = true;
          yield delta;
        }
        return;
      } catch (err) {
        if (started || req.signal?.aborted) throw err;
        lastError = err;
        console.warn(`[maven-ai] ${b.provider} failed, trying next backend: ${(err as Error).message}`);
      }
    }
    throw lastError;
  },
};

export function managedAvailable(): boolean {
  return managedConfig().backends.length > 0;
}

export function managedDescription(): string {
  return managedConfig()
    .backends.map((b) => (b.provider === "groq" ? "Groq" : "Claude"))
    .join(" + ");
}
