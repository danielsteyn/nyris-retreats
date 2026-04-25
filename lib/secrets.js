// lib/secrets.js — AES-256-GCM encryption for API keys stored in Turso
// Encryption key precedence:
//   1. process.env.SECRETS_KEY (recommended for production)
//   2. Auto-generated key persisted in settings table (acceptable for demo;
//      offers protection against casual DB dumps but not full compromise)

import crypto from "crypto";
import { getDb, ensureSchema } from "./db.js";

let _key = null;

async function getEncKey() {
  if (_key) return _key;
  if (process.env.SECRETS_KEY) {
    // Hash the env var to a 32-byte key (lets users use any-length passphrase)
    _key = crypto.createHash("sha256").update(process.env.SECRETS_KEY).digest();
    return _key;
  }
  const db = getDb();
  if (!db) return null;
  await ensureSchema();
  const r = await db.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: ["_secrets_key"] });
  if (r.rows.length) {
    try { _key = Buffer.from(JSON.parse(r.rows[0].value), "hex"); }
    catch { _key = null; }
  }
  if (!_key) {
    _key = crypto.randomBytes(32);
    await db.execute({
      sql: `INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: ["_secrets_key", JSON.stringify(_key.toString("hex"))]
    });
  }
  return _key;
}

export async function encrypt(plaintext) {
  const key = await getEncKey();
  if (!key) throw new Error("encryption unavailable (Turso not configured)");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export async function decrypt(b64) {
  const key = await getEncKey();
  if (!key) throw new Error("encryption unavailable");
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function isEncryptionConfigured() {
  return !!getDb();
}
