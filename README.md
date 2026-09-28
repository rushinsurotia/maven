# Maven

Multi-tenant SaaS that gives any business a team of AI agents (Sales, Customer Support, Appointments, and custom roles) that answer customer questions, capture requests, help users and book appointments, on every channel its customers use.

Tenants bring their own AI: each connects its own provider subscription or API key (Anthropic, OpenAI, Google, Azure, Bedrock, OpenRouter, any OpenAI-compatible endpoint, or its own external agent) and chooses a different engine per role. Customers always see one consistent assistant.

- **Now:** an embeddable chat widget, front and center on the business's website.
- **Next:** WhatsApp and other messaging channels (SMS, Messenger, Instagram).
- **Later:** voice (inbound phone calls).

See [`docs/architecture.md`](docs/architecture.md) for the system design and the phased roadmap.

## Try the MVP

Requires Node.js 20+.

```bash
npm install
npm run dev            # http://localhost:3000
```

1. Open http://localhost:3000, enter a website URL and pick an AI provider: **Demo** (no key), Anthropic, OpenAI, Google Gemini, or any OpenAI-compatible endpoint (OpenRouter, Groq, Together, a local Ollama at `http://localhost:11434/v1`...). Your key is tested before it's saved.
2. Maven reads up to 40 pages of the site. Meanwhile you land in the dashboard.
3. Chat in the **Playground**. **Auto** routes each message to the Support, Sales or Appointments agent; pick an agent to test it alone. Each reply shows which agent answered and its sources.
4. Change things in the dashboard:
   - **Agents:** give each role its own AI connection, model and instructions.
   - **AI connections:** add more providers.
   - **Business info:** add facts that aren't on the site.
   - **Appearance:** set the name, greeting and color.
5. **Install** gives you the embed snippet and a test page you can open. The snippet works on any site that can reach your Maven server:

```html
<script src="http://localhost:3000/widget.js" data-maven-key="pk_..." async></script>
<!-- front-and-center variant -->
<script src="http://localhost:3000/widget.js" data-maven-key="pk_..." data-mode="inline" data-target="#chat" async></script>
```

```bash
npm test               # unit + end-to-end tests (fixture site, fake Anthropic / OpenAI-compatible upstreams)
npm run typecheck
```

### What the MVP includes

| Area | MVP | Planned (see architecture doc) |
|---|---|---|
| Knowledge | Same-site crawl (plus sitemap.xml), header/footer dedup, BM25 search | Uploads, FAQs, hybrid vector search, scheduled re-sync |
| AI | Bring your own key: Anthropic, OpenAI, Gemini, OpenAI-compatible. Keys are encrypted at rest (AES-256-GCM) | Azure, Bedrock, external agents, fallback engines, KMS |
| Agents | Support, Sales and Appointments, each with its own engine and instructions. Keyword router with stickiness | Classifier routing, tools (booking, lead capture, human handoff) |
| Widget | Bubble or inline, streaming, Shadow DOM, mobile full-screen | WhatsApp, voice |
| Platform | JSON files in `data/`, in-memory conversations | Postgres + RLS, auth, inbox, billing |

**MVP limitations:**
- There are no user accounts. A workspace is reachable by anyone who has its URL (`/app?ws=...`), and the ID is random and unguessable.
- Widget CORS is open to any origin.
- The Appointments agent collects booking details but can't book yet.
- Private-network URLs are allowed outside production (`NODE_ENV=production` blocks them) so local Ollama and test sites work. See `.env.example`.
