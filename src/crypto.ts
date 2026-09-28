import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./config";

// Tenants' AI keys are encrypted at rest with AES-256-GCM. In production the
// master key should come from a KMS; for the MVP it is MAVEN_SECRET or a
// generated local key file.
let masterKey: Buffer | undefined;

function getMasterKey(): Buffer {
  if (masterKey) return masterKey;
  let secret = process.env.MAVEN_SECRET;
  if (!secret) {
    const file = path.join(dataDir(), "secret.key");
    if (fs.existsSync(file)) {
      secret = fs.readFileSync(file, "utf8").trim();
    } else {
      fs.mkdirSync(dataDir(), { recursive: true });
      secret = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  masterKey = crypto.createHash("sha256").update(secret).digest();
  return masterKey;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1") throw new Error("Unknown secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function randomId(prefix: string, bytes = 9): string {
  return `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
}
