import assert from "node:assert/strict";
import { test } from "node:test";
import { closeStore, flushStore, getKnowledge, getTenant, getTenantByWidgetKey, initStore, saveKnowledge, saveTenant, storageBackend, updateTenant } from "../src/store";
import type { Tenant } from "../src/types";

// Runs only when a test database is provided, e.g.
// TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres npm test
const url = process.env.TEST_DATABASE_URL;

test("Postgres storage persists workspaces and knowledge across restarts", { skip: !url && "TEST_DATABASE_URL not set" }, async () => {
  const pg = await import("pg");
  const admin = new pg.default.Client({ connectionString: url });
  await admin.connect();
  await admin.query("DROP TABLE IF EXISTS maven_tenants, maven_knowledge");
  await admin.end();

  await initStore(url);
  assert.equal(storageBackend(), "postgres");
  const tenant = { id: "ws_pg", widgetKey: "pk_pg", crawl: { status: "pending", pagesCrawled: 0, chunks: 0 } } as unknown as Tenant;
  saveTenant(tenant);
  // Rapid updates collapse; the last one must win.
  for (let i = 1; i <= 20; i++) updateTenant("ws_pg", (t) => (t.crawl.pagesCrawled = i));
  saveKnowledge("ws_pg", { pages: [{ url: "https://x", title: "X" }], chunks: [{ id: "c1", url: "https://x", title: "X", text: "hello" }] });
  await flushStore();
  await closeStore();

  // Simulate a restart: everything must come back from the database.
  await initStore(url);
  assert.equal(getTenant("ws_pg")?.crawl.pagesCrawled, 20);
  assert.equal(getTenantByWidgetKey("pk_pg")?.id, "ws_pg");
  assert.equal(getKnowledge("ws_pg").chunks[0].text, "hello");
  await closeStore();
});
