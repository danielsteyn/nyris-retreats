// lib/db.js — Turso (libSQL) client + schema bootstrapping
// Falls back to "not configured" if env vars are absent (admin then uses localStorage).

import { createClient } from "@libsql/client";

let _client = null;
let _booted = false;

export function getDb() {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) return null;
  _client = createClient({ url, authToken });
  return _client;
}

export async function ensureSchema() {
  const db = getDb();
  if (!db) return false;
  if (_booted) return true;
  await db.batch([
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS property_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail TEXT,
      caption TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      is_cover INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      source TEXT DEFAULT 'hospitable',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(property_id, url)
    )`,
    `CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      details TEXT,
      duration_ms INTEGER,
      ran_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS pending_properties (
      property_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending'
    )`,
    `CREATE TABLE IF NOT EXISTS secrets (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      last4 TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_photos_prop ON property_photos(property_id, sort_order)`,
    `CREATE INDEX IF NOT EXISTS idx_log_source_ran ON sync_log(source, ran_at DESC)`
  ], "write");
  _booted = true;
  return true;
}

export async function getSetting(key, fallback = null) {
  const db = getDb();
  if (!db) return fallback;
  await ensureSchema();
  const r = await db.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
  if (r.rows.length === 0) return fallback;
  try { return JSON.parse(r.rows[0].value); } catch { return fallback; }
}

export async function setSetting(key, value) {
  const db = getDb();
  if (!db) return false;
  await ensureSchema();
  const json = JSON.stringify(value);
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    args: [key, json]
  });
  return true;
}

// ---- Secrets (encrypted) ----
import { encrypt, decrypt } from "./secrets.js";

export async function setSecret(key, plaintext) {
  const db = getDb();
  if (!db) return false;
  await ensureSchema();
  const value = await encrypt(plaintext);
  const last4 = String(plaintext).slice(-4);
  await db.execute({
    sql: `INSERT INTO secrets (key, value, last4) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value, last4=excluded.last4, updated_at=CURRENT_TIMESTAMP`,
    args: [key, value, last4]
  });
  return true;
}

export async function getSecret(key) {
  const db = getDb();
  if (!db) return null;
  await ensureSchema();
  const r = await db.execute({ sql: "SELECT value FROM secrets WHERE key = ?", args: [key] });
  if (!r.rows.length) return null;
  try { return await decrypt(r.rows[0].value); } catch { return null; }
}

export async function getSecretMeta(key) {
  const db = getDb();
  if (!db) return null;
  await ensureSchema();
  const r = await db.execute({ sql: "SELECT key, last4, updated_at FROM secrets WHERE key = ?", args: [key] });
  return r.rows[0] || null;
}

export async function listSecretMeta() {
  const db = getDb();
  if (!db) return [];
  await ensureSchema();
  const r = await db.execute("SELECT key, last4, updated_at FROM secrets ORDER BY updated_at DESC");
  return r.rows;
}

export async function deleteSecret(key) {
  const db = getDb();
  if (!db) return false;
  await ensureSchema();
  await db.execute({ sql: "DELETE FROM secrets WHERE key = ?", args: [key] });
  return true;
}

// Resolve an integration API key: prefer DB-stored secret, fall back to env var.
export async function resolveApiKey(secretName, envVarName) {
  const db = getDb();
  if (db) {
    const fromDb = await getSecret(secretName);
    if (fromDb) return { key: fromDb, source: "admin" };
  }
  const fromEnv = process.env[envVarName];
  if (fromEnv) return { key: fromEnv, source: "env" };
  return { key: null, source: "none" };
}
