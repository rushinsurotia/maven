import { decrypt } from "../crypto";
import type { Credential, ProviderId } from "../types";
import { anthropicProvider } from "./anthropic";
import { demoProvider } from "./demo";
import { geminiProvider } from "./gemini";
import { openaiCompatibleProvider, openaiProvider } from "./openai";
import type { Provider, ResolvedCredential } from "./types";

export * from "./types";

const providers: Record<ProviderId, Provider> = {
  demo: demoProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  openai_compatible: openaiCompatibleProvider,
};

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  needsKey: boolean;
  needsBaseUrl: boolean;
  defaultModel: string;
  suggestedModels: string[];
  keyHint: string;
}

// Model lists are suggestions only; any model id the tenant's key can access works.
export const PROVIDER_INFO: ProviderInfo[] = [
  { id: "demo", name: "Demo (no key)", needsKey: false, needsBaseUrl: false, defaultModel: "demo", suggestedModels: ["demo"], keyHint: "" },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    needsKey: true,
    needsBaseUrl: false,
    defaultModel: "claude-opus-5",
    suggestedModels: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    keyHint: "sk-ant-...",
  },
  { id: "openai", name: "OpenAI", needsKey: true, needsBaseUrl: false, defaultModel: "gpt-5-mini", suggestedModels: ["gpt-5", "gpt-5-mini", "gpt-4.1-mini"], keyHint: "sk-..." },
  { id: "gemini", name: "Google Gemini", needsKey: true, needsBaseUrl: false, defaultModel: "gemini-2.5-flash", suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash"], keyHint: "AIza..." },
  {
    id: "openai_compatible",
    name: "OpenAI-compatible (OpenRouter, Groq, Ollama...)",
    needsKey: false,
    needsBaseUrl: true,
    defaultModel: "",
    suggestedModels: [],
    keyHint: "Optional for local servers",
  },
];

export function getProvider(id: ProviderId): Provider {
  const p = providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function isProviderId(id: unknown): id is ProviderId {
  return typeof id === "string" && id in providers;
}

export function resolveCredential(c: Credential): ResolvedCredential {
  return { provider: c.provider, apiKey: c.encryptedKey ? decrypt(c.encryptedKey) : undefined, baseUrl: c.baseUrl };
}

/** Cheap live call used to validate a key + model before saving it. */
export async function testCredential(cred: ResolvedCredential, model: string): Promise<void> {
  const provider = getProvider(cred.provider);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    for await (const _ of provider.streamChat(cred, {
      model,
      system: "You are a connectivity check.",
      messages: [{ role: "user", content: "Reply with the word OK." }],
      signal: controller.signal,
    })) {
      break; // the first token proves the key and model work
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
