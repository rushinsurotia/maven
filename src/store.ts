import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { dataDir } from "./config";
import type { Knowledge, Tenant } from "./types";

// Storage keeps everything in memory for synchronous reads and writes through
// to a backend:
// - Postgres when DATABASE_URL is set (use this on hosts without disks/volumes)
// - JSON files in MAVEN_DATA_DIR otherwise (local development)
// Single server process only, until the multi-instance design in
// docs/architecture.md (RLS, per-request queries) replaces this.

let tenants: Record<string, Tenant> | undefined;
const kbCache = new Map<string, Knowledge>();
let pool: pg.Pool | undefined;

// ---------- file backend ----------

const tenantsFile = () => path.join(dataDir(), "tenants.json");
const kbFile = (tenantId: string) => path.join(dataDir(), "kb", `${tenantId}.json`);

function writeAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// ---------- Postgres backend ----------

// Latest-wins write queue: rapid saves of the same row (e.g. crawl progress)
// collapse into one write, and writes run one at a time in order.
const pending = new Map<string, { sql: string; params: unknown[] }>();
let flushing: Promise<void> | undefined;

function enqueue(key: string, sql: string, params: unknown[]) {
  pending.set(key, { sql, params });
  if (!flushing) flushing = flushLoop().finally(() => (flushing = undefined));
}

async function flushLoop() {
  while (pending.size) {
    const [key, job] = pending.entries().next().value!;
    pending.delete(key);
    try {
      await pool!.query(job.sql, job.params);
    } catch (err) {
      console.error(`[store] write failed for ${key}, retrying:`, (err as Error).message);
      if (!pending.has(key)) pending.set(key, job);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Waits for queued database writes (call before shutdown). */
export async function flushStore() {
  while (flushing) await flushing;
}

/**
 * Connects to Postgres (when DATABASE_URL is set), creates tables, and loads
 * data into memory. Without DATABASE_URL, files are loaded lazily instead.
 */
export async function initStore(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) return;
  pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS maven_tenants (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS maven_knowledge (
      tenant_id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const t = await pool.query<{ id: string; data: Tenant }>("SELECT id, data FROM maven_tenants");
  tenants = Object.fromEntries(t.rows.map((r) => [r.id, r.data]));
  const k = await pool.query<{ tenant_id: string; data: Knowledge }>("SELECT tenant_id, data FROM maven_knowledge");
  for (const r of k.rows) kbCache.set(r.tenant_id, r.data);
  console.log(`[store] Postgres: loaded ${t.rowCount} workspaces`);
}

export async function closeStore() {
  await flushStore();
  await pool?.end();
  pool = undefined;
  tenants = undefined;
  kbCache.clear();
}

export const storageBackend = () => (pool ? "postgres" : "files");

// ---------- API ----------

function load(): Record<string, Tenant> {
  if (!tenants) {
    tenants = !pool && fs.existsSync(tenantsFile()) ? JSON.parse(fs.readFileSync(tenantsFile(), "utf8")) : {};
  }
  return tenants!;
}

export function getTenant(id: string): Tenant | undefined {
  return load()[id];
}

export function getTenantByWidgetKey(key: string): Tenant | undefined {
  return Object.values(load()).find((t) => t.widgetKey === key);
}

export function saveTenant(tenant: Tenant) {
  load()[tenant.id] = tenant;
  if (pool) {
    enqueue(
      `tenant:${tenant.id}`,
      `INSERT INTO maven_tenants (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [tenant.id, JSON.stringify(tenant)],
    );
  } else {
    writeAtomic(tenantsFile(), tenants);
  }
}

export function updateTenant(id: string, fn: (t: Tenant) => void): Tenant | undefined {
  const t = getTenant(id);
  if (!t) return undefined;
  fn(t);
  saveTenant(t);
  return t;
}

export function getKnowledge(tenantId: string): Knowledge {
  let kb = kbCache.get(tenantId);
  if (!kb) {
    const file = kbFile(tenantId);
    kb = !pool && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { pages: [], chunks: [] };
    kbCache.set(tenantId, kb!);
  }
  return kb!;
}

export function saveKnowledge(tenantId: string, kb: Knowledge) {
  kbCache.set(tenantId, kb);
  if (pool) {
    enqueue(
      `kb:${tenantId}`,
      `INSERT INTO maven_knowledge (tenant_id, data) VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [tenantId, JSON.stringify(kb)],
    );
  } else {
    writeAtomic(kbFile(tenantId), kb);
  }
}
