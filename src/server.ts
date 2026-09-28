import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSystemPrompt, defaultAgents, getAgent, routeMessage } from "./agents";
import { PORT, PUBLIC_URL } from "./config";
import { buildKnowledge, crawlSite } from "./crawler";
import { encrypt, randomId } from "./crypto";
import { getProvider, isProviderId, PROVIDER_INFO, ProviderError, resolveCredential, testCredential, type ChatTurn } from "./llm";
import { search } from "./retrieval";
import { assertPublicUrl } from "./safe-fetch";
import { getKnowledge, getTenant, getTenantByWidgetKey, saveKnowledge, saveTenant, updateTenant } from "./store";
import { ROLES, type Credential, type ProviderId, type Role, type Tenant } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "..", "public");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<void> | void) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

// ---------- helpers ----------

function publicTenant(t: Tenant) {
  return {
    id: t.id,
    websiteUrl: t.websiteUrl,
    widgetKey: t.widgetKey,
    profile: t.profile,
    branding: t.branding,
    crawl: t.crawl,
    agents: t.agents,
    credentials: t.credentials.map(({ encryptedKey: _omit, ...c }) => c),
    embedSnippet: `<script src="${PUBLIC_URL}/widget.js" data-maven-key="${t.widgetKey}" async></script>`,
    demoUrl: `${PUBLIC_URL}/demo/${t.widgetKey}`,
  };
}

function normalizeWebsite(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw new HttpError(400, "Enter your website URL");
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.pathname === "/" ? u.origin : u.toString();
  } catch {
    throw new HttpError(400, "That doesn't look like a valid website URL");
  }
}

function str(v: unknown, max = 10_000): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}

async function makeCredential(body: Record<string, unknown>, model: string): Promise<Credential> {
  const provider = body.provider;
  if (!isProviderId(provider)) throw new HttpError(400, "Choose an AI provider");
  const info = PROVIDER_INFO.find((p) => p.id === provider)!;
  const apiKey = str(body.apiKey, 500)?.trim() || undefined;
  const baseUrl = str(body.baseUrl, 500)?.trim().replace(/\/$/, "") || undefined;
  if (info.needsKey && !apiKey) throw new HttpError(400, `Paste your ${info.name} API key`);
  if (info.needsBaseUrl && !baseUrl) throw new HttpError(400, "Enter the base URL of your OpenAI-compatible endpoint");
  if (provider !== "demo" && !model) throw new HttpError(400, "Enter a model name");
  if (baseUrl) {
    try {
      await assertPublicUrl(baseUrl);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  if (provider !== "demo") {
    try {
      await testCredential({ provider, apiKey, baseUrl }, model);
    } catch (e) {
      throw new HttpError(400, `Couldn't connect to ${info.name} with model "${model}": ${(e as Error).message}`);
    }
  }
  return {
    id: randomId("cred", 6),
    provider,
    label: str(body.label, 80)?.trim() || info.name,
    encryptedKey: apiKey ? encrypt(apiKey) : undefined,
    baseUrl,
    last4: apiKey ? apiKey.slice(-4) : undefined,
    createdAt: new Date().toISOString(),
  };
}

function requireTenant(req: Request): Tenant {
  const t = getTenant(String(req.params.id));
  if (!t) throw new HttpError(404, "Workspace not found");
  return t;
}

// ---------- crawling ----------

const crawling = new Set<string>();

async function runCrawl(tenantId: string, firstRun: boolean) {
  if (crawling.has(tenantId)) return;
  crawling.add(tenantId);
  const t = getTenant(tenantId)!;
  updateTenant(tenantId, (x) => {
    x.crawl = { status: "crawling", pagesCrawled: 0, chunks: x.crawl.chunks };
  });
  try {
    let lastSave = 0;
    const result = await crawlSite(t.websiteUrl, {
      onProgress: (url, count) => {
        const tenant = getTenant(tenantId)!;
        tenant.crawl.currentUrl = url;
        tenant.crawl.pagesCrawled = count;
        if (Date.now() - lastSave > 1000) {
          lastSave = Date.now();
          saveTenant(tenant);
        }
      },
    });
    const kb = buildKnowledge(result.pages);
    saveKnowledge(tenantId, kb);
    updateTenant(tenantId, (x) => {
      x.crawl = { status: "ready", pagesCrawled: kb.pages.length, chunks: kb.chunks.length, finishedAt: new Date().toISOString() };
      if (firstRun) {
        if (result.meta.siteName) x.profile.name = result.meta.siteName.slice(0, 80);
        if (result.meta.description) x.profile.description = result.meta.description.slice(0, 500);
        x.branding.assistantName = `${x.profile.name} Assistant`;
        if (result.meta.themeColor && /^#[0-9a-f]{6}$/i.test(result.meta.themeColor)) x.branding.color = result.meta.themeColor;
      }
    });
  } catch (e) {
    updateTenant(tenantId, (x) => {
      x.crawl = { ...x.crawl, status: "error", error: (e as Error).message, currentUrl: undefined };
    });
  } finally {
    crawling.delete(tenantId);
  }
}

// ---------- dashboard API (no auth in the MVP: workspace ids are unguessable) ----------

app.get("/api/providers", (_req, res) => {
  res.json(PROVIDER_INFO);
});

app.post(
  "/api/tenants",
  asyncRoute(async (req, res) => {
    const websiteUrl = normalizeWebsite(req.body?.websiteUrl);
    try {
      await assertPublicUrl(websiteUrl);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const provider = req.body?.provider as ProviderId;
    const model = provider === "demo" ? "demo" : (str(req.body?.model, 200)?.trim() ?? "");
    const cred = await makeCredential(req.body ?? {}, model);
    const host = new URL(websiteUrl).hostname.replace(/^www\./, "");
    const tenant: Tenant = {
      id: randomId("ws", 12),
      websiteUrl,
      widgetKey: randomId("pk", 12),
      createdAt: new Date().toISOString(),
      profile: { name: host, description: "", extraInfo: "" },
      branding: { assistantName: `${host} Assistant`, color: "#4f46e5", greeting: "Hi! 👋 How can I help you today?" },
      credentials: [cred],
      agents: defaultAgents(cred.id, model),
      crawl: { status: "pending", pagesCrawled: 0, chunks: 0 },
    };
    saveTenant(tenant);
    void runCrawl(tenant.id, true);
    res.status(201).json(publicTenant(tenant));
  }),
);

app.get("/api/tenants/:id", (req, res) => {
  res.json(publicTenant(requireTenant(req)));
});

app.patch("/api/tenants/:id", (req, res) => {
  const t = requireTenant(req);
  const { profile, branding } = req.body ?? {};
  updateTenant(t.id, (x) => {
    if (profile) {
      x.profile.name = str(profile.name, 80)?.trim() || x.profile.name;
      x.profile.description = str(profile.description, 1000) ?? x.profile.description;
      x.profile.extraInfo = str(profile.extraInfo, 8000) ?? x.profile.extraInfo;
    }
    if (branding) {
      x.branding.assistantName = str(branding.assistantName, 60)?.trim() || x.branding.assistantName;
      x.branding.greeting = str(branding.greeting, 300) ?? x.branding.greeting;
      if (typeof branding.color === "string" && /^#[0-9a-f]{6}$/i.test(branding.color)) x.branding.color = branding.color;
    }
  });
  res.json(publicTenant(getTenant(t.id)!));
});

app.get("/api/tenants/:id/knowledge", (req, res) => {
  const t = requireTenant(req);
  const kb = getKnowledge(t.id);
  res.json({ pages: kb.pages, chunks: kb.chunks.length });
});

app.post("/api/tenants/:id/recrawl", (req, res) => {
  const t = requireTenant(req);
  void runCrawl(t.id, false);
  res.json({ ok: true });
});

app.post(
  "/api/tenants/:id/credentials",
  asyncRoute(async (req, res) => {
    const t = requireTenant(req);
    const model = req.body?.provider === "demo" ? "demo" : (str(req.body?.model, 200)?.trim() ?? "");
    const cred = await makeCredential(req.body ?? {}, model);
    updateTenant(t.id, (x) => x.credentials.push(cred));
    res.status(201).json(publicTenant(getTenant(t.id)!));
  }),
);

app.put(
  "/api/tenants/:id/agents/:role",
  asyncRoute(async (req, res) => {
    const t = requireTenant(req);
    const role = req.params.role as Role;
    if (!ROLES.includes(role)) throw new HttpError(404, "Unknown agent role");
    const current = getAgent(t, role);
    const body = req.body ?? {};
    const credentialId = str(body.credentialId, 100) ?? current.credentialId;
    const cred = t.credentials.find((c) => c.id === credentialId);
    if (!cred) throw new HttpError(400, "Unknown AI connection");
    const model = cred.provider === "demo" ? "demo" : (str(body.model, 200)?.trim() || current.model);
    if (cred.provider !== "demo" && (credentialId !== current.credentialId || model !== current.model)) {
      try {
        await testCredential(resolveCredential(cred), model);
      } catch (e) {
        throw new HttpError(400, `That model didn't work with ${cred.label}: ${(e as Error).message}`);
      }
    }
    const enabled = typeof body.enabled === "boolean" ? body.enabled : current.enabled;
    if (!enabled && t.agents.filter((a) => a.enabled && a.role !== role).length === 0) {
      throw new HttpError(400, "At least one agent must stay enabled");
    }
    updateTenant(t.id, (x) => {
      const a = x.agents.find((a) => a.role === role)!;
      a.credentialId = credentialId;
      a.model = model;
      a.enabled = enabled;
      a.name = str(body.name, 60)?.trim() || a.name;
      a.instructions = str(body.instructions, 8000) ?? a.instructions;
    });
    res.json(publicTenant(getTenant(t.id)!));
  }),
);

// ---------- public widget API ----------

interface Conversation {
  id: string;
  tenantId: string;
  role?: Role;
  history: ChatTurn[];
  updatedAt: number;
}
const conversations = new Map<string, Conversation>();
const MAX_HISTORY = 20;

// Drop idle conversations after 6 hours (in-memory store for the MVP).
setInterval(() => {
  const cutoff = Date.now() - 6 * 3600_000;
  for (const [k, c] of conversations) if (c.updatedAt < cutoff) conversations.delete(k);
}, 600_000).unref();

const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  return ++h.count > limit;
}

app.use("/api/widget", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/widget/:key/config", (req, res) => {
  const t = getTenantByWidgetKey(req.params.key);
  if (!t) throw new HttpError(404, "Unknown widget key");
  res.json({
    businessName: t.profile.name,
    assistantName: t.branding.assistantName,
    color: t.branding.color,
    greeting: t.branding.greeting,
    agents: t.agents.filter((a) => a.enabled).map((a) => ({ role: a.role, name: a.name })),
  });
});

function sse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.post(
  "/api/widget/:key/chat",
  asyncRoute(async (req, res) => {
    const t = getTenantByWidgetKey(String(req.params.key));
    if (!t) throw new HttpError(404, "Unknown widget key");
    if (rateLimited(`${t.id}:${req.ip}`)) throw new HttpError(429, "You're sending messages too quickly. Please wait a moment.");
    const message = str(req.body?.message, 2000)?.trim();
    if (!message) throw new HttpError(400, "Message is empty");

    const convId = str(req.body?.conversationId, 64);
    let conv = convId ? conversations.get(convId) : undefined;
    if (!conv || conv.tenantId !== t.id) {
      conv = { id: randomId("conv", 12), tenantId: t.id, history: [], updatedAt: Date.now() };
      conversations.set(conv.id, conv);
    }

    // The playground can pin a role to test one agent; otherwise route.
    const forced = req.body?.role as Role | undefined;
    const role =
      forced && ROLES.includes(forced) && t.agents.some((a) => a.role === forced && a.enabled) ? forced : routeMessage(t, message, conv.role);
    const agent = getAgent(t, role);
    const cred = t.credentials.find((c) => c.id === agent.credentialId);

    const kb = getKnowledge(t.id);
    const recentUser = conv.history.filter((m) => m.role === "user").slice(-2).map((m) => m.content);
    // Rank by the current message; earlier messages only fill remaining slots
    // (they help with follow-ups like "and for large dogs?").
    const knowledge = search(kb.chunks, message, 6);
    const fill = (more: typeof knowledge) => {
      for (const c of more) if (knowledge.length < 6 && !knowledge.includes(c)) knowledge.push(c);
    };
    if (knowledge.length < 4 && recentUser.length) fill(search(kb.chunks, [message, ...recentUser].join(" "), 6));
    if (knowledge.length < 2) fill(kb.chunks.slice(0, 2));

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    sse(res, "meta", { conversationId: conv.id, agent: { role: agent.role, name: agent.name } });

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    let reply = "";
    try {
      if (!cred) throw new ProviderError("This agent has no AI connection configured");
      const provider = getProvider(cred.provider);
      const system = buildSystemPrompt({ tenant: t, agent, channel: "web", knowledge });
      const messages: ChatTurn[] = [...conv.history.slice(-MAX_HISTORY), { role: "user", content: message }];
      for await (const delta of provider.streamChat(resolveCredential(cred), {
        model: agent.model,
        system,
        messages,
        signal: controller.signal,
        knowledge,
      })) {
        reply += delta;
        sse(res, "delta", { text: delta });
      }
      if (!reply.trim()) {
        reply = "Sorry, I didn't catch that. Could you rephrase?";
        sse(res, "delta", { text: reply });
      }
      conv.history.push({ role: "user", content: message }, { role: "assistant", content: reply });
      conv.role = role;
      conv.updatedAt = Date.now();
      sse(res, "done", { sources: [...new Map(knowledge.map((c) => [c.url, { url: c.url, title: c.title }])).values()].slice(0, 3) });
    } catch (e) {
      if (controller.signal.aborted) return;
      const detail = (e as Error).message;
      console.error(`[chat] tenant=${t.id} role=${role} provider=${cred?.provider}: ${detail}`);
      sse(res, "error", {
        message: "Sorry, I'm having trouble answering right now. Please try again in a moment.",
        detail, // shown only in the dashboard playground
      });
    } finally {
      res.end();
    }
  }),
);

// ---------- pages & static ----------

app.get("/widget.js", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("cache-control", "public, max-age=300");
  res.sendFile(path.join(PUBLIC_DIR, "widget.js"));
});
app.get("/app", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "app.html")));
app.get("/demo/:key", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "demo.html")));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json({ error: err instanceof Error && status !== 500 ? err.message : "Something went wrong" });
});

export { app };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Maven running at ${PUBLIC_URL}`));
}
