import path from "node:path";

export const PORT = Number(process.env.PORT ?? 3000);
export const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
/** Read lazily so tests (and tools) can point it elsewhere before first use. */
export const dataDir = () => path.resolve(process.env.MAVEN_DATA_DIR ?? "data");
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const ALLOW_PRIVATE_URLS = process.env.ALLOW_PRIVATE_URLS
  ? process.env.ALLOW_PRIVATE_URLS === "1" || process.env.ALLOW_PRIVATE_URLS === "true"
  : !IS_PRODUCTION;
/** If set, the dashboard and onboarding require this password (HTTP basic auth). The widget stays public. */
export const ACCESS_PASSWORD = process.env.MAVEN_ACCESS_PASSWORD || "";
