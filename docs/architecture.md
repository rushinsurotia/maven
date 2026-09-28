# Maven: architecture and roadmap

## 1. What we're building

A **tenant** is a business (a clinic, a salon, a law firm, a store). Each tenant runs a team of AI agents that:

| Capability | Example |
|---|---|
| Answers questions about the business | "Do you take walk-ins?" "What's your refund policy?" |
| Collects information and requests | Quote requests, callback requests, lead capture, intake forms |
| Helps users get things done | Order status, directions, "which service is right for me?" |
| Books appointments | Checks availability, books, reschedules, cancels, sends confirmations |
| Hands off to a human | Escalates to staff with the full transcript when it can't help or the user asks |

The agents reach customers through **channels**: web chat first, then WhatsApp and other messaging apps, then voice.

Two product rules shape the whole design:

1. **Bring your own AI (BYOK).** Each tenant connects its own AI provider subscription or API key: Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, Groq, OpenRouter, a self-hosted OpenAI-compatible model, or its own external agent. Maven never locks a tenant into one model vendor.
2. **Different agents per role, one interface.** A tenant configures separate agents for **Sales**, **Customer Support**, **Appointments** and custom roles. Each can use a different provider, model, instructions and tool set. The customer always sees one consistent assistant (same widget, same name and branding), and hand-offs between agents are invisible to them.

## 2. Core principle: normalize at every edge

Everything that varies (channel, role, AI provider) sits behind an adapter, so the core never changes when one of them is added:

```
 Web widget ─┐                                    ┌─ Sales agent ────────┐    ┌─ Anthropic
 WhatsApp  ──┼─► Channel ─► Conversation ─► Router ┼─ Support agent ──────┼─►  ├─ OpenAI / Azure
 Voice     ──┘   adapters   service        (intent)└─ Appointments agent ─┘    ├─ Google / Bedrock
                                                        │  (shared tools)      ├─ OpenAI-compatible
                                                        ▼                      └─ External agent (HTTP)
                                                  Tools: KB, booking,       Provider adapters
                                                  leads, handoff...         (tenant's own keys)
```

- **Channel adapters** turn inbound traffic into one normalized `Message` and render replies back out. Agents only get a small `channel` hint for formatting.
- **The router** picks which role agent owns the current turn.
- **Provider adapters** translate one internal model interface to each vendor's API.

This is what makes a new channel, a new role, or a new AI vendor additive work instead of a rewrite.

## 3. Components

### 3.1 Channel adapters
- **Web widget:** a single `<script>` tag. It renders in a Shadow DOM or iframe so host-site CSS can't break it. Replies stream over SSE (or WebSocket). It's identified by a public **widget key** that is locked to the tenant's allowed origins.
- **WhatsApp (phase 3):** Meta WhatsApp Cloud API webhooks. Must respect the 24-hour session window and use approved templates for outbound messages such as reminders.
- **Voice (phase 4):** Twilio (or similar) media streams, streaming STT, the same agents with a voice-specific prompt layer, and streaming TTS. Where a tenant's provider offers a realtime speech model, that can replace the STT → LLM → TTS chain. STT and TTS vendors are also BYOK. The main engineering problem is latency (target under about 1s to first audio) and handling barge-in, so the dashboard should flag models too slow for voice.

### 3.2 Conversation service
- Owns `Contact`, `Conversation` and `Message` records. It resolves the same person across channels where possible (email or phone).
- Tracks state: `bot` → `handoff_requested` → `human` → `closed`.
- Takes a per-conversation lock so concurrent messages are processed in order.

### 3.3 Agents and roles
Each tenant defines **agent profiles**, one per role. Maven ships templates for common roles, and tenants can add their own:

| Role | Job | Typical tools |
|---|---|---|
| **Customer Support** | Answer questions, troubleshoot, take requests | `search_knowledge`, `get_business_info`, `submit_request`, `handoff_to_human` |
| **Sales** | Qualify leads, explain offers and pricing, push toward a booking or purchase | `search_knowledge`, `capture_lead`, `list_services`, `transfer_to_agent` |
| **Appointments** | Find slots, book, reschedule, cancel | `list_services`, `check_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment` |
| **Custom** | Anything else (intake, order status, returns...) | Any enabled tools, including custom HTTP tools |

An agent profile holds:
- **Engine:** a connected AI credential (see 3.4) plus model and parameters. Alternatively the engine is an **external agent** endpoint, meaning the tenant's own agent hosted elsewhere.
- **Instructions:** persona, goals, dos and don'ts.
- **Tools:** which tools it may use.
- **Knowledge scope:** which knowledge sources it can search, e.g. sales sees pricing but not internal SOPs.
- **Hand-off rules:** when to transfer to another agent or to a human.

**Routing between agents**
- A **router** decides which agent owns each new conversation. It combines tenant rules (entry page, channel, keywords such as "book") with a small classifier model call made on the tenant's router credential.
- An agent that realizes the conversation belongs elsewhere calls `transfer_to_agent(role, summary)`. The next agent receives the full history plus that summary and replies in the same thread, so the customer never repeats themselves.
- The active agent is stored on the conversation, so follow-up messages stay with it until it transfers.
- To the customer it is **one assistant**: a single display name and avatar by default. A tenant can optionally show per-role names ("Sam from Sales").

**Prompt assembly** (per turn, for the active agent):
1. Platform layer: safety, behavior, tool-use rules (identical across providers)
2. Tenant layer: business profile, hours, policies
3. Role layer: that agent's instructions and persona
4. Channel layer: formatting rules (markdown for web, plain text for WhatsApp, speakable text for voice)
5. Conversation history, with older turns summarized

Use prompt caching on the stable prefix (layers 1 to 4) where the provider supports it.

**Tools** are defined once, in a provider-neutral JSON Schema, and scoped to the tenant. `tenant_id` is injected server-side and never taken from the model:

| Tool | Purpose |
|---|---|
| `search_knowledge(query)` | RAG over the knowledge sources this agent is allowed to see |
| `get_business_info()` | Structured facts: hours, locations, services, prices |
| `list_services()` / `check_availability(service, date_range, staff?)` | Booking discovery |
| `book_appointment(...)` / `reschedule_appointment` / `cancel_appointment` | Booking actions (idempotent, confirm details with the user first) |
| `capture_lead(fields)` / `submit_request(type, fields)` | Info requests, quotes, callbacks |
| `transfer_to_agent(role, summary)` | Hand the conversation to another role agent |
| `handoff_to_human(reason)` | Escalate and notify staff |
| Custom HTTP tools (later) | Tenant-defined webhooks, e.g. order lookup |

**Guardrails** are enforced by Maven, not left to the model, because tenants may pick weaker models. Business facts come only from tools or the knowledge base. Knowledge-base content and user input are treated as untrusted (prompt injection). Write actions are validated server-side and must be confirmed with the user. The tool loop has a turn cap. Output passes a moderation check.

### 3.4 Bring your own AI: providers and credentials

**Supported engines**

| Engine | Notes |
|---|---|
| Anthropic (Claude) | API key |
| OpenAI | API key |
| Google Gemini / Vertex AI | API key or service account |
| Azure OpenAI | Endpoint + key + deployment name |
| AWS Bedrock | IAM access keys or an assumed role |
| Mistral, Groq, xAI, DeepSeek, etc. | API key |
| OpenRouter | One key gives access to many models |
| OpenAI-compatible endpoint | Base URL + key: Ollama, vLLM, LM Studio, Together, Fireworks, self-hosted |
| External agent | The tenant's own agent behind an HTTPS endpoint that speaks the Maven agent protocol (below) |

**One internal interface.** `packages/llm` defines a single contract: messages in, streaming events out (text deltas, tool calls, usage, errors), with tools described in JSON Schema. Each provider adapter translates to and from that contract. The Vercel AI SDK already covers most providers and can sit behind this interface, so we write adapters only for the gaps. Each model gets a **capability record**: tool calling, streaming, vision, context window, prompt caching, JSON mode, and whether it supports realtime voice. The dashboard uses it to warn a tenant when a chosen model can't do what a role needs, e.g. an Appointments agent on a model without tool calling.

**External agent protocol.** For tenants who already have an agent, Maven POSTs `{conversation, history, contact, available_tools}` to their endpoint and accepts streamed replies and tool-call requests back. Maven still executes the tools, so tenant isolation and booking rules stay enforced. Supporting emerging standards such as A2A or MCP here is a later extension.

**Credential handling**
- Keys are encrypted at rest with envelope encryption (per-tenant data key, master key in KMS). They are decrypted only in the process making the call, and never returned to the browser or written to logs.
- Keys are validated when saved with a cheap test call. The dashboard shows only the provider, a label and the last 4 characters.
- A tenant can hold several credentials, e.g. a premium model for Sales and a cheap one for Support, and rotate them without downtime.
- A per-agent **fallback engine** is optional: if the primary provider errors, times out, or runs out of quota, the turn retries on the fallback.
- When a key is invalid or out of quota and no fallback exists, the customer gets a polite "connecting you to the team" reply, the conversation goes to the human inbox, and the tenant is alerted.
- Usage (tokens, estimated cost) is tracked per agent and per credential, so tenants can see what each role costs them on their own bill.

**Embeddings.** Knowledge-base embeddings must stay consistent within an index, so each index records its embedding provider and model. Tenants can use their own embedding key or Maven's default embedding model. Changing the embedding model triggers a background re-embed.

**Business model impact.** With BYOK the tenant pays its AI vendor directly, so Maven charges for the platform: seats, channels, conversations, and later voice minutes. An optional "Maven-managed AI" plan can use platform keys for tenants who don't want to manage their own.

### 3.5 Knowledge base
- Sources: crawl the tenant's website, file uploads (PDF, DOCX), manual FAQs, and structured business info.
- Pipeline (background jobs): fetch → extract → chunk → embed → store in **pgvector**. Keep sources re-syncable and versioned.
- Retrieval: hybrid (vector plus Postgres full-text), optionally reranked, and every chunk carries its source so answers can cite it.

### 3.6 Scheduling
- A native model: `Service` (duration, buffer, price), `StaffMember`, `AvailabilityRule` (weekly hours plus exceptions), `Appointment`.
- Two-way sync with Google Calendar and Microsoft 365 to block busy time. Optionally connect Calendly and similar tools instead of the native scheduler.
- Handle time zones explicitly. Use an exclusion constraint or row locks to prevent double-booking.
- Confirmations and reminders go out by email and SMS, and later by WhatsApp templates.

### 3.7 Tenant dashboard
- **Onboarding:** enter the website URL → auto-crawl → draft business profile → preview the agent → copy the embed snippet.
- **AI & agents:** connect AI credentials, create role agents from templates, pick each agent's engine, instructions, tools and knowledge scope, set routing rules, and test each agent in a side-by-side **playground** to compare models before going live.
- **Knowledge:** manage sources and FAQs, and see "questions the agent couldn't answer".
- **Inbox:** live and past conversations showing which agent handled each part, take over from the bot, reply as a human.
- **Appointments**, **leads and requests**, **analytics** (volume, resolution rate, bookings, handoffs).
- **Settings:** branding, persona, hours, channels, team members and roles, billing.

### 3.8 Platform
- **Auth:** users belong to organizations (tenants) with roles `owner`, `admin` and `agent`.
- **Billing:** Stripe subscriptions plus metered usage (conversations and messages, voice minutes later).
- **Observability:** trace every agent turn (agent, provider, model, prompt, tool calls, latency, tokens, cost) per tenant. Keep an eval set of real conversations so tenants can test a model or prompt change before switching.

## 4. Multi-tenancy

- Shared database, shared schema, and a `tenant_id` on every tenant-owned row.
- Postgres **Row-Level Security** as a second line of defense. Each request runs `SET app.tenant_id` inside its transaction, so a missed `WHERE` clause can't leak another tenant's data.
- Tenant resolution: the dashboard gets it from the session, the widget from its widget key plus an origin check, and channel webhooks from the channel account mapping (e.g. WhatsApp phone number ID → tenant).
- Per-tenant rate limits and optional spend caps per credential.
- Secrets such as AI keys, OAuth tokens and channel credentials are encrypted at rest (envelope encryption). A request can only decrypt its own tenant's secrets.
- Outbound calls to tenant-supplied URLs (OpenAI-compatible endpoints, external agents, custom tools) go through an egress proxy that blocks private and internal IP ranges, to prevent SSRF.

## 5. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript end to end | One language across widget, API and dashboard |
| Repo | pnpm workspaces + Turborepo monorepo | Shared types between apps |
| API | Node + Fastify (or Hono) | Streaming, webhooks, simple |
| Dashboard | Next.js + Tailwind + shadcn/ui | Fast to build |
| Widget | Preact + Vite, single bundle | Small script size |
| DB | Postgres + pgvector, Drizzle ORM | Relational + vectors + RLS in one place |
| Queue/cache | Redis + BullMQ | Ingestion, reminders, webhooks, locks |
| LLM access | Own `packages/llm` interface, Vercel AI SDK underneath | Many providers behind one contract |
| Default models | Claude (`claude-sonnet-5`, `claude-haiku-4-5` for routing) for templates and the managed plan | Strong tool use; tenants can switch |
| Embeddings | Maven default (Voyage AI) or tenant BYOK | Consistent per index |
| Secrets | Cloud KMS + envelope encryption | Tenant AI keys |
| Auth | Better Auth (organizations plugin) or Clerk | Multi-org out of the box |
| Payments | Stripe | Subscriptions + metering |
| Messaging/voice | Meta WhatsApp Cloud API, Twilio | Phase 3 and 4 |

Proposed layout:

```
apps/
  api/          Fastify: chat API, webhooks, tenant/admin API
  dashboard/    Next.js tenant dashboard
  widget/       Embeddable chat widget
  worker/       BullMQ jobs: ingestion, reminders, calendar sync
packages/
  db/           Drizzle schema, migrations, RLS policies
  agent/        Prompt assembly, router, role agents, tool registry, agent loop
  llm/          Provider-neutral model interface, provider adapters, capability records
  channels/     Channel adapter interface + implementations
  shared/       Types, validation (zod), utilities
```

## 6. Core data model (initial)

```
Tenant(id, name, slug, plan, settings)
User(id, email) ── Membership(user_id, tenant_id, role)
AiCredential(id, tenant_id, provider, label, encrypted_secret, base_url, config, status, last4)
AgentProfile(id, tenant_id, role, name, engine_type[model|external],
             credential_id, model, params, fallback_credential_id, fallback_model,
             external_endpoint, instructions, enabled_tools, knowledge_source_ids, is_default)
RoutingRule(id, tenant_id, priority, match{channel,page,keywords,intent}, agent_profile_id)
BusinessProfile(tenant_id, hours, locations, contact, policies)
KnowledgeSource(id, tenant_id, type, url/file, status, last_synced_at)
KnowledgeChunk(id, tenant_id, source_id, content, embedding vector, metadata)
Channel(id, tenant_id, type, config, public_key/credentials)
Contact(id, tenant_id, name, email, phone, external_ids)
Conversation(id, tenant_id, contact_id, channel_id, status, active_agent_id, assigned_user_id)
Message(id, conversation_id, tenant_id, role, agent_profile_id, content, tool_calls, created_at)
AgentTurn(id, message_id, tenant_id, agent_profile_id, provider, model, tokens_in, tokens_out, latency_ms, cost_est)
Service(id, tenant_id, name, duration_min, buffer_min, price)
StaffMember(id, tenant_id, name, calendar_connection_id)
AvailabilityRule(id, tenant_id, staff_id, weekday, start, end, exceptions)
Appointment(id, tenant_id, service_id, staff_id, contact_id, starts_at, ends_at, status)
Lead / Request(id, tenant_id, contact_id, type, fields jsonb, status)
UsageEvent(id, tenant_id, kind, quantity, created_at)
```

## 7. Roadmap

**Phase 0: Foundation**
Monorepo, Postgres with RLS, auth and organizations, tenant CRUD, CI, local dev via docker-compose.

**Phase 1: Web chat MVP** *(the first thing a customer can pay for)*
- Embeddable widget with streaming replies
- BYOK: connect credentials for Anthropic, OpenAI, Google and any OpenAI-compatible endpoint (which also covers OpenRouter, Groq, Ollama, etc.)
- Role agents: Support and Sales templates, router plus `transfer_to_agent`, per-agent engine choice
- Tools: `search_knowledge`, `get_business_info`, `capture_lead`, `handoff_to_human`
- Knowledge ingestion: website crawl, file upload, manual FAQs
- Dashboard: onboarding, AI & agents with a playground, knowledge, conversation inbox with human takeover, basic settings and branding
- Email notifications for leads and handoffs

**Phase 2: Appointment booking**
Appointments agent template, native scheduler, Google and Microsoft calendar sync, booking tools, confirmations and reminders, appointments view. Add Azure OpenAI and Bedrock credentials, fallback engines, and the external agent protocol.

**Phase 3: Messaging channels**
WhatsApp Cloud API adapter, then SMS, Messenger and Instagram. Unified contacts across channels. Template-based reminders.

**Phase 4: Voice**
Inbound phone numbers per tenant, a streaming STT → agent → TTS pipeline, call transfer to staff, call recordings and transcripts in the inbox.

**Throughout:** billing, per-agent cost analytics, evals, custom tools and webhooks, multi-language support.

## 8. Open questions

1. **Target vertical for launch?** General-purpose, or a focused wedge (e.g. clinics, salons, home services)? A wedge sharpens role templates and onboarding.
2. **"Any AI agent":** is picking any provider and model enough for launch, or do some tenants already have their own agents (built on another platform) that must plug in on day one via the external agent protocol?
3. **Managed-AI plan:** offer Maven-provided keys as a paid option for non-technical tenants, or BYOK only?
4. **Stack:** is the TypeScript stack above acceptable, or is there a preference (e.g. Python/FastAPI for the backend)?
5. **Hosting:** managed platforms (Vercel + Railway/Render + Neon/Supabase), or AWS/GCP from day one?
6. **Data residency and compliance needs** (e.g. HIPAA for clinics, GDPR)? With BYOK, the tenant's choice of AI vendor affects their compliance, which the dashboard should make visible.
