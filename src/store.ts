import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./config";
import type { Knowledge, Tenant } from "./types";

// MVP storage: JSON files on disk. Swap for Postgres (see docs/architecture.md)
// once there is more than one server process.
const tenantsFile = () => path.join(dataDir(), "tenants.json");
const kbFile = (tenantId: string) => path.join(dataDir(), "kb", `${tenantId}.json`);

let tenants: Record<string, Tenant> | undefined;

function writeAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function load(): Record<string, Tenant> {
  if (!tenants) {
    tenants = fs.existsSync(tenantsFile()) ? JSON.parse(fs.readFileSync(tenantsFile(), "utf8")) : {};
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
  writeAtomic(tenantsFile(), tenants);
}

export function updateTenant(id: string, fn: (t: Tenant) => void): Tenant | undefined {
  const t = getTenant(id);
  if (!t) return undefined;
  fn(t);
  saveTenant(t);
  return t;
}

const kbCache = new Map<string, Knowledge>();

export function getKnowledge(tenantId: string): Knowledge {
  let kb = kbCache.get(tenantId);
  if (!kb) {
    const file = kbFile(tenantId);
    kb = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { pages: [], chunks: [] };
    kbCache.set(tenantId, kb!);
  }
  return kb!;
}

export function saveKnowledge(tenantId: string, kb: Knowledge) {
  kbCache.set(tenantId, kb);
  writeAtomic(kbFile(tenantId), kb);
}
