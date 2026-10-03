import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { serve, siteHandler } from "./helpers";

// Isolated data dir; set before the server module loads its config.
process.env.MAVEN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "maven-test-"));
process.env.ALLOW_PRIVATE_URLS = "1";

let site: Awaited<ReturnType<typeof serve>>;
let fakeOpenAI: Awaited<ReturnType<typeof serve>>;
let fakeAnthropic: Awaited<ReturnType<typeof serve>>;
let deadAnthropic: Awaited<ReturnType<typeof serve>>;
let maven: Awaited<ReturnType<typeof serve>>;
const upstreamRequests: any[] = [];

before(async () => {
  site = await serve(siteHandler());

  // Minimal OpenAI-compatible streaming server (stands in for Groq/OpenRouter/Ollama/etc).
  fakeOpenAI = await serve((req, res) => {
    if (req.method === "GET" && req.url?.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: ["whisper-large-v3", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"].map((id) => ({ id, object: "model" })) }));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = JSON.parse(body);
      upstreamRequests.push(json);
      if (req.headers.authorization !== "Bearer good-key") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Invalid API key" } }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const word of ["Nail ", "trims ", "are ", "$15."]) {
        res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: json.model, choices: [{ index: 0, delta: { content: word }, finish_reason: null }] })}\n\n`);
      }
      res.end("data: [DONE]\n\n");
    });
  });

  // Minimal Anthropic Messages streaming server.
  fakeAnthropic = await serve((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = JSON.parse(body);
      upstreamRequests.push({ anthropic: true, headers: req.headers, ...json });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: json.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hello from " } });
      ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Claude." } });
      ev("content_block_stop", { index: 0 });
      ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } });
      ev("message_stop", {});
      res.end();
    });
  });

  // An Anthropic endpoint that rejects every request (to exercise fallback).
  deadAnthropic = await serve((_req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
  });

  const { app } = await import("../src/server");
  maven = await serve(app);
});

after(async () => {
  await Promise.all([site.close(), fakeOpenAI.close(), fakeAnthropic.close(), deadAnthropic.close(), maven.close()]);
});

async function json(method: string, url: string, body?: unknown) {
  const res = await fetch(maven.url + url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

async function chat(key: string, message: string, extra: object = {}) {
  const res = await fetch(`${maven.url}/api/widget/${key}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, ...extra }),
  });
  const raw = await res.text();
  if (!res.headers.get("content-type")?.includes("text/event-stream")) return { status: res.status, events: [], meta: undefined, text: "", error: JSON.parse(raw) };
  const events = raw.split("\n\n").filter(Boolean).map((block) => {
    const ev = block.match(/^event: (.*)$/m)![1];
    const data = JSON.parse(block.match(/^data: (.*)$/m)![1]);
    return { ev, data };
  });
  return {
    status: res.status,
    events,
    meta: events.find((e) => e.ev === "meta")?.data,
    text: events.filter((e) => e.ev === "delta").map((e) => e.data.text).join(""),
    error: events.find((e) => e.ev === "error")?.data,
  };
}

async function waitForCrawl(id: string) {
  for (let i = 0; i < 100; i++) {
    const { body } = await json("GET", `/api/tenants/${id}`);
    if (body.crawl.status === "ready" || body.crawl.status === "error") return body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("crawl timed out");
}

test("onboarding in demo mode crawls the site and answers from it", async () => {
  const created = await json("POST", "/api/tenants", { websiteUrl: site.url, provider: "demo" });
  assert.equal(created.status, 201);
  assert.match(created.body.embedSnippet, /data-maven-key="pk_/);
  assert.equal(created.body.agents.length, 3);

  const t = await waitForCrawl(created.body.id);
  assert.equal(t.crawl.status, "ready", t.crawl.error);
  assert.equal(t.crawl.pagesCrawled, 4); // PDF and external links skipped
  assert.equal(t.profile.name, "Sunny Paws Grooming");
  assert.equal(t.branding.color, "#0ea5e9");

  const cfg = await fetch(`${maven.url}/api/widget/${t.widgetKey}/config`);
  assert.equal(cfg.headers.get("access-control-allow-origin"), "*");
  assert.equal((await cfg.json()).assistantName, "Sunny Paws Grooming Assistant");

  const r1 = await chat(t.widgetKey, "What are your opening hours?");
  assert.equal(r1.meta.agent.role, "support");
  assert.match(r1.text, /Tuesday to Saturday/);

  const r2 = await chat(t.widgetKey, "How much does a nail trim cost?", { conversationId: r1.meta.conversationId });
  assert.equal(r2.meta.conversationId, r1.meta.conversationId);
  assert.equal(r2.meta.agent.role, "sales");
  assert.match(r2.text, /Nail trim: \$15/);

  // Follow-ups rank by the new question, not the earlier one.
  const r3 = await chat(t.widgetKey, "What about a large dog groom?", { conversationId: r1.meta.conversationId });
  assert.match(r3.text, /large dog\): \$95/);

  const forced = await chat(t.widgetKey, "hello", { role: "appointments" });
  assert.equal(forced.meta.agent.role, "appointments");

  // Credentials never leak through the API.
  const again = await json("GET", `/api/tenants/${t.id}`);
  assert.ok(again.body.credentials.every((c: any) => !("encryptedKey" in c)));
});

test("BYOK: bad keys are rejected at onboarding, good keys stream replies, per-role engines", async () => {
  const bad = await json("POST", "/api/tenants", { websiteUrl: site.url, provider: "openai_compatible", baseUrl: fakeOpenAI.url, apiKey: "wrong", model: "llama-3" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Couldn't connect/);

  const created = await json("POST", "/api/tenants", { websiteUrl: site.url, provider: "openai_compatible", baseUrl: fakeOpenAI.url, apiKey: "good-key", model: "llama-3" });
  assert.equal(created.status, 201, created.body.error);
  const t = await waitForCrawl(created.body.id);

  upstreamRequests.length = 0;
  const r = await chat(t.widgetKey, "How much is a nail trim?");
  assert.equal(r.text, "Nail trims are $15.");
  const sent = upstreamRequests.at(-1);
  assert.equal(sent.model, "llama-3");
  assert.equal(sent.messages[0].role, "system");
  assert.match(sent.messages[0].content, /Your role: Sales/);
  assert.match(sent.messages[0].content, /Nail trim: \$15/); // retrieved knowledge is in the prompt
  assert.equal(sent.messages.at(-1).content, "How much is a nail trim?");

  // Give Appointments its own engine: a second connection with a different model.
  const withCred = await json("POST", `/api/tenants/${t.id}/credentials`, { provider: "openai_compatible", baseUrl: fakeOpenAI.url, apiKey: "good-key", model: "qwen-3", label: "Local Qwen" });
  assert.equal(withCred.status, 201, withCred.body.error);
  const cred2 = withCred.body.credentials.find((c: any) => c.label === "Local Qwen");
  assert.equal(cred2.last4, "-key");
  const upd = await json("PUT", `/api/tenants/${t.id}/agents/appointments`, { credentialId: cred2.id, model: "qwen-3" });
  assert.equal(upd.status, 200, upd.body.error);

  const r2 = await chat(t.widgetKey, "Can I book an appointment on Saturday?");
  assert.equal(r2.meta.agent.role, "appointments");
  assert.equal(upstreamRequests.at(-1).model, "qwen-3");

  // Can't disable every agent.
  for (const role of ["support", "sales"]) await json("PUT", `/api/tenants/${t.id}/agents/${role}`, { enabled: false });
  const last = await json("PUT", `/api/tenants/${t.id}/agents/appointments`, { enabled: false });
  assert.equal(last.status, 400);
});

test("Groq: 'auto' picks the best chat model the key can use", async () => {
  const created = await json("POST", "/api/tenants", { websiteUrl: site.url, provider: "groq", apiKey: "good-key", model: "auto", baseUrl: fakeOpenAI.url });
  assert.equal(created.status, 201, created.body.error);
  const t = await waitForCrawl(created.body.id);
  upstreamRequests.length = 0;
  const r = await chat(t.widgetKey, "What are your hours?");
  assert.equal(r.text, "Nail trims are $15.");
  assert.equal(upstreamRequests.at(-1).model, "openai/gpt-oss-120b");
  assert.equal(upstreamRequests.at(-1).max_completion_tokens, 8192);
});

test("Maven AI (included): no key, falls back between backends, daily cap", async () => {
  const before = (await json("GET", "/api/providers")).body;
  assert.ok(!before.some((p: any) => p.id === "maven"), "hidden until platform keys are configured");

  Object.assign(process.env, {
    MAVEN_MANAGED_PROVIDER: "anthropic", // primary is down, so Groq must take over
    MAVEN_ANTHROPIC_API_KEY: "sk-ant-platform",
    MAVEN_ANTHROPIC_BASE_URL: deadAnthropic.url,
    MAVEN_GROQ_API_KEY: "good-key",
    MAVEN_GROQ_BASE_URL: fakeOpenAI.url,
    MAVEN_MANAGED_DAILY_MESSAGES: "2",
  });
  try {
    const providers = (await json("GET", "/api/providers")).body;
    assert.equal(providers[0].id, "maven");
    assert.match(providers[0].keyHint, /Claude \+ Groq/);

    const created = await json("POST", "/api/tenants", { websiteUrl: site.url, provider: "maven" });
    assert.equal(created.status, 201, created.body.error);
    assert.ok(created.body.agents.every((a: any) => a.model === "included"));
    const t = await waitForCrawl(created.body.id);

    const r1 = await chat(t.widgetKey, "hours?");
    assert.equal(r1.text, "Nail trims are $15.");
    assert.equal(upstreamRequests.at(-1).model, "openai/gpt-oss-120b");
    assert.equal((await chat(t.widgetKey, "price?")).error, undefined);
    const capped = await chat(t.widgetKey, "one more?");
    assert.match(capped.error.detail, /Daily limit/);
  } finally {
    for (const k of ["MAVEN_MANAGED_PROVIDER", "MAVEN_ANTHROPIC_API_KEY", "MAVEN_ANTHROPIC_BASE_URL", "MAVEN_GROQ_API_KEY", "MAVEN_GROQ_BASE_URL", "MAVEN_MANAGED_DAILY_MESSAGES"]) delete process.env[k];
  }
});

test("Anthropic adapter streams text from the Messages API", async () => {
  const { anthropicProvider } = await import("../src/llm/anthropic");
  let out = "";
  for await (const d of anthropicProvider.streamChat(
    { provider: "anthropic", apiKey: "sk-ant-test", baseUrl: fakeAnthropic.url },
    { model: "claude-opus-5", system: "SYS", messages: [{ role: "user", content: "hi" }] },
  )) out += d;
  assert.equal(out, "Hello from Claude.");
  const sent = upstreamRequests.find((r) => r.anthropic);
  assert.equal(sent.model, "claude-opus-5");
  assert.equal(sent.system, "SYS");
  assert.equal(sent.stream, true);
  assert.equal(sent.headers["x-api-key"], "sk-ant-test");
});

test("provider failures reach the customer as a friendly error", async () => {
  const created = await json("POST", "/api/tenants", { websiteUrl: site.url, provider: "openai_compatible", baseUrl: fakeOpenAI.url, apiKey: "good-key", model: "m" });
  const t = await waitForCrawl(created.body.id);
  // Simulate the key being revoked after setup by pointing the stored credential at a dead port.
  const { updateTenant } = await import("../src/store");
  updateTenant(t.id, (x) => (x.credentials[0].baseUrl = "http://127.0.0.1:9"));
  const r = await chat(t.widgetKey, "hours?");
  assert.match(r.error.message, /trouble answering/);
  assert.ok(r.error.detail);
});

test("input validation", async () => {
  assert.equal((await json("POST", "/api/tenants", { websiteUrl: "", provider: "demo" })).status, 400);
  assert.equal((await json("POST", "/api/tenants", { websiteUrl: site.url, provider: "nope" })).status, 400);
  assert.equal((await json("POST", "/api/tenants", { websiteUrl: site.url, provider: "anthropic", model: "claude-opus-5" })).status, 400);
  assert.equal((await json("GET", "/api/tenants/ws_missing")).status, 404);
  assert.equal((await chat("pk_missing", "hi")).status, 404);
});
