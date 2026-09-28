import type { KnowledgeChunk, ProviderId } from "../types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ResolvedCredential {
  provider: ProviderId;
  apiKey?: string;
  baseUrl?: string;
}

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatTurn[];
  signal?: AbortSignal;
  /** Retrieved knowledge; only used by the keyless demo provider. */
  knowledge?: KnowledgeChunk[];
}

/** The single contract every provider adapter implements: stream text deltas. */
export interface Provider {
  id: ProviderId;
  streamChat(cred: ResolvedCredential, req: ChatRequest): AsyncIterable<string>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}
