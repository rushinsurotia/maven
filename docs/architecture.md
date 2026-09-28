# Maven: architecture and roadmap

## 1. What we're building

A **tenant** is a business (a clinic, a salon, a law firm, a store). Each tenant gets an AI agent that:

| Capability | Example |
|---|---|
| Answers questions about the business | "Do you take walk-ins?" "What's your refund policy?" |
| Collects information and requests | Quote requests, callback requests, lead capture, intake forms |
| Helps users get things done | Order status, directions, "which service is right for me?" |
| Books appointments | Checks availability, books, reschedules, cancels, sends confirmations |
| Hands off to a human | Escalates to staff with the full transcript when it can't help or the user asks |

The agent reaches customers through **channels**: web chat first, then WhatsApp and other messaging apps, then voice.

## 2. Core principle: one agent, many channels

The agent never knows which channel it's on beyond a small `channel` hint used for formatting. Every channel is an **adapter** that turns inbound traffic into one normalized `Message` and renders the agent's reply back out.

```
 Web widget ─┐
 WhatsApp  ──┼─► Channel adapters ─► Conversation service ─► Agent runtime ─► Tools
 Voice     ──┘   (normalize I/O)     (sessions, history,     (LLM + tool     (KB search,
                                      routing, handoff)       loop)           booking, leads...)
```

This is what makes WhatsApp and voice additive work later instead of rewrites.

## 3. Components

### 3.1 Channel adapters
- **Web widget:** a single `<script>` tag. It renders in a Shadow DOM or iframe so host-site CSS can't break it. Replies stream over SSE (or WebSocket). It's identified by a public **widget key** that is locked to the tenant's allowed origins.
- **WhatsApp (phase 3):** Meta WhatsApp Cloud API webhooks. Must respect the 24-hour session window and use approved templates for outbound messages such as reminders.
- **Voice (phase 4):** Twilio (or similar) media streams, streaming STT, the same agent runtime with a voice-specific prompt layer, and streaming TTS. The main engineering problem here is latency (target under about 1s to first audio) and handling barge-in.

### 3.2 Conversation service
- Owns `Contact`, `Conversation` and `Message` records. It resolves the same person across channels where possible (email or phone).
- Tracks state: `bot` → `handoff_requested` → `human` → `closed`.
- Takes a per-conversation lock so concurrent messages are processed in order.

### 3.3 Agent runtime
- Uses Claude with tool use. The default model is `claude-sonnet-5`. `claude-haiku-4-5` handles cheap side tasks like classification, summaries and titles.
- The prompt is assembled per turn:
  1. Platform system prompt (safety, behavior, tool rules)
  2. Tenant layer (business profile, persona and tone, hours, policies, what the agent may and may not do)
  3. Channel layer (formatting rules: markdown for web, plain text for WhatsApp, speakable text for voice)
  4. Conversation history (older turns summarized)
- Use prompt caching on the stable prefix (layers 1 to 3) to cut cost and latency.
- **Tools** are scoped to the tenant. `tenant_id` is injected server-side and never taken from the model:

| Tool | Purpose |
|---|---|
| `search_knowledge(query)` | RAG over the tenant's knowledge base |
| `get_business_info()` | Structured facts: hours, locations, services, prices |
| `list_services()` / `check_availability(service, date_range, staff?)` | Booking discovery |
| `book_appointment(...)` / `reschedule_appointment` / `cancel_appointment` | Booking actions (idempotent, confirm details with the user first) |
| `capture_lead(fields)` / `submit_request(type, fields)` | Info requests, quotes, callbacks |
| `handoff_to_human(reason)` | Escalate and notify staff |
| Custom HTTP tools (later) | Tenant-defined webhooks, e.g. order lookup |

- **Guardrails:** answer business facts only from tools or the knowledge base, never invent them. Treat knowledge-base content and user input as untrusted (prompt injection). Always confirm before write actions. Cap the number of tool-loop turns.

### 3.4 Knowledge base
- Sources: crawl the tenant's website, file uploads (PDF, DOCX), manual FAQs, and structured business info.
- Pipeline (background jobs): fetch → extract → chunk → embed → store in **pgvector**. Keep sources re-syncable and versioned.
- Retrieval: hybrid (vector plus Postgres full-text), optionally reranked, and every chunk carries its source so answers can cite it.

### 3.5 Scheduling
- A native model: `Service` (duration, buffer, price), `StaffMember`, `AvailabilityRule` (weekly hours plus exceptions), `Appointment`.
- Two-way sync with Google Calendar and Microsoft 365 to block busy time. Optionally connect Calendly and similar tools instead of the native scheduler.
- Handle time zones explicitly. Use an exclusion constraint or row locks to prevent double-booking.
- Confirmations and reminders go out by email and SMS, and later by WhatsApp templates.

### 3.6 Tenant dashboard
- **Onboarding:** enter the website URL → auto-crawl → draft business profile → preview the agent → copy the embed snippet.
- **Knowledge:** manage sources and FAQs, and see "questions the agent couldn't answer".
- **Inbox:** live and past conversations, take over from the bot, reply as a human.
- **Appointments**, **leads and requests**, **analytics** (volume, resolution rate, bookings, handoffs).
- **Settings:** branding, persona, hours, channels, team members and roles, billing.

### 3.7 Platform
- **Auth:** users belong to organizations (tenants) with roles `owner`, `admin` and `agent`.
- **Billing:** Stripe subscriptions plus metered usage (conversations and messages, voice minutes later).
- **Observability:** trace every agent turn (prompt, tool calls, latency, tokens, cost) per tenant. Build an eval set of real conversations to regression-test prompt changes.

## 4. Multi-tenancy

- Shared database, shared schema, and a `tenant_id` on every tenant-owned row.
- Postgres **Row-Level Security** as a second line of defense. Each request runs `SET app.tenant_id` inside its transaction, so a missed `WHERE` clause can't leak another tenant's data.
- Tenant resolution: the dashboard gets it from the session, the widget from its widget key plus an origin check, and channel webhooks from the channel account mapping (e.g. WhatsApp phone number ID → tenant).
- Per-tenant rate limits and LLM spend caps.
- Secrets such as OAuth tokens and channel credentials are encrypted at rest (envelope encryption).

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
| LLM | Claude API (Anthropic TypeScript SDK) | Tool use, prompt caching |
| Embeddings | Voyage AI | Strong retrieval quality |
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
  agent/        Prompt assembly, tool registry, agent loop
  channels/     Channel adapter interface + implementations
  shared/       Types, validation (zod), utilities
```

## 6. Core data model (initial)

```
Tenant(id, name, slug, plan, settings)
User(id, email) ── Membership(user_id, tenant_id, role)
AgentConfig(tenant_id, persona, instructions, model, enabled_tools)
BusinessProfile(tenant_id, hours, locations, contact, policies)
KnowledgeSource(id, tenant_id, type, url/file, status, last_synced_at)
KnowledgeChunk(id, tenant_id, source_id, content, embedding vector, metadata)
Channel(id, tenant_id, type, config, public_key/credentials)
Contact(id, tenant_id, name, email, phone, external_ids)
Conversation(id, tenant_id, contact_id, channel_id, status, assigned_user_id)
Message(id, conversation_id, tenant_id, role, content, tool_calls, created_at)
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
- Agent runtime with `search_knowledge`, `get_business_info`, `capture_lead`, `handoff_to_human`
- Knowledge ingestion: website crawl, file upload, manual FAQs
- Dashboard: onboarding, knowledge, conversation inbox with human takeover, basic settings and branding
- Email notifications for leads and handoffs

**Phase 2: Appointment booking**
Native scheduler, Google and Microsoft calendar sync, booking tools, confirmations and reminders, appointments view.

**Phase 3: Messaging channels**
WhatsApp Cloud API adapter, then SMS, Messenger and Instagram. Unified contacts across channels. Template-based reminders.

**Phase 4: Voice**
Inbound phone numbers per tenant, a streaming STT → agent → TTS pipeline, call transfer to staff, call recordings and transcripts in the inbox.

**Throughout:** billing, analytics, evals, custom tools and webhooks, multi-language support.

## 8. Open questions

1. **Target vertical for launch?** General-purpose, or a focused wedge (e.g. clinics, salons, home services)? A wedge sharpens booking features and onboarding.
2. **Stack:** is the TypeScript stack above acceptable, or is there a preference (e.g. Python/FastAPI for the backend)?
3. **Hosting:** managed platforms (Vercel + Railway/Render + Neon/Supabase), or AWS/GCP from day one?
4. **Auth:** self-hosted (Better Auth) or managed (Clerk)?
5. **Scheduling:** native scheduler first, or integrate with existing tools (Calendly, Square, Acuity) first?
6. **Data residency and compliance needs** (e.g. HIPAA for clinics, GDPR)? These affect vendor choices early.
