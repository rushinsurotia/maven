/** "maven" = AI included with Maven, running on the platform's own keys (see src/llm/managed.ts). */
export type ProviderId = "maven" | "demo" | "anthropic" | "openai" | "gemini" | "groq" | "openai_compatible";

export type Role = "support" | "sales" | "appointments";
export const ROLES: Role[] = ["support", "sales", "appointments"];

export interface Credential {
  id: string;
  provider: ProviderId;
  label: string;
  encryptedKey?: string; // absent for the demo provider and keyless local endpoints
  baseUrl?: string;
  last4?: string;
  createdAt: string;
}

export interface AgentProfile {
  role: Role;
  name: string;
  enabled: boolean;
  credentialId: string;
  model: string;
  instructions: string;
}

export interface Branding {
  assistantName: string;
  color: string;
  greeting: string;
}

export interface BusinessProfile {
  name: string;
  description: string;
  extraInfo: string; // free-form facts the owner adds (hours, policies...)
}

export type CrawlStatus = "pending" | "crawling" | "ready" | "error";

export interface Tenant {
  id: string;
  websiteUrl: string;
  widgetKey: string;
  createdAt: string;
  profile: BusinessProfile;
  branding: Branding;
  credentials: Credential[];
  agents: AgentProfile[];
  crawl: {
    status: CrawlStatus;
    pagesCrawled: number;
    chunks: number;
    currentUrl?: string;
    error?: string;
    finishedAt?: string;
  };
}

export interface KnowledgePage {
  url: string;
  title: string;
}

export interface KnowledgeChunk {
  id: string;
  url: string;
  title: string;
  text: string;
}

export interface Knowledge {
  pages: KnowledgePage[];
  chunks: KnowledgeChunk[];
}
