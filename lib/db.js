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
    `CREATE TABLE IF NOT EXISTS daily_prices (
      property_id TEXT NOT NULL,
      date TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      min_stay INTEGER,
      source TEXT DEFAULT 'pricelabs',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (property_id, date)
    )`,
    `CREATE TABLE IF NOT EXISTS discount_codes (
      code TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('flat','percent')),
      value REAL NOT NULL,
      max_uses INTEGER,
      times_used INTEGER DEFAULT 0,
      expires_at TEXT,
      active INTEGER DEFAULT 1,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS discount_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      property_id TEXT,
      guest_email TEXT,
      amount_discounted REAL,
      total_after REAL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS contact_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      topic TEXT,
      message TEXT,
      sms_opt_in INTEGER DEFAULT 0,
      hospitable_inquiry_id TEXT,
      hospitable_status TEXT,
      email_status TEXT,
      read INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      user_agent TEXT,
      ip TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_photos_prop ON property_photos(property_id, sort_order)`,
    `CREATE INDEX IF NOT EXISTS idx_log_source_ran ON sync_log(source, ran_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_prices_prop_date ON daily_prices(property_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_redemptions_code ON discount_redemptions(code)`,
    `CREATE INDEX IF NOT EXISTS idx_submissions_created ON contact_submissions(archived, read, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS booking_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      property_slug TEXT,
      property_name TEXT,
      checkin TEXT NOT NULL,
      checkout TEXT NOT NULL,
      nights INTEGER,
      guests INTEGER,
      first_name TEXT,
      last_name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      sms_opt_in INTEGER DEFAULT 0,
      message TEXT,
      promo_code TEXT,
      quoted_total REAL,
      quoted_currency TEXT DEFAULT 'USD',
      quoted_breakdown TEXT,
      hospitable_quote_id TEXT,
      hospitable_status TEXT,
      email_status TEXT,
      forward_status TEXT,
      status TEXT DEFAULT 'pending',
      read INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      user_agent TEXT,
      ip TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_created ON booking_requests(archived, status, created_at DESC)`
  ], "write");

  // Idempotent migrations for tables that already exist on production from
  // an earlier deploy. SQLite's ALTER TABLE ADD COLUMN is a no-op only when
  // the column doesn't exist; if it does, it errors. Wrap in try/catch.
  await runMigration(db, "ALTER TABLE contact_submissions ADD COLUMN sms_opt_in INTEGER DEFAULT 0");

  _booted = true;
  return true;
}

async function runMigration(db, sql) {
  try { await db.execute(sql); }
  catch (e) {
    // Most common: "duplicate column name" — column already exists. Safe to ignore.
    // Anything else is logged but doesn't fatal the boot path.
    if (!/duplicate column|already exists/i.test(String(e?.message || e))) {
      console.warn("[db migration] non-fatal:", String(e?.message || e));
    }
  }
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

// Resolve an integration API key.
// Precedence: per-request header (browser-stored admin key) > Turso (server-stored) > env var.
// `req` is the Vercel request object; pass it so we can read browser-supplied headers.
export async function resolveApiKey(req, secretName, envVarName) {
  // 1. Header (admin browser sends this when keys are stored client-side)
  if (req && req.headers) {
    // Vercel lowercases all header names; canonical: x-hospitable-api-key, x-pricelabs-api-key
    const headerName = "x-" + secretName.replace(/_/g, "-");
    const v = req.headers[headerName] || req.headers[headerName.toLowerCase()];
    if (typeof v === "string" && v.trim().length >= 8) {
      return { key: v.trim(), source: "header" };
    }
  }
  // 2. Turso DB (server-stored, encrypted)
  const db = getDb();
  if (db) {
    const fromDb = await getSecret(secretName);
    if (fromDb) return { key: fromDb, source: "admin" };
  }
  // 3. Env var
  const fromEnv = process.env[envVarName];
  if (fromEnv) return { key: fromEnv, source: "env" };
  return { key: null, source: "none" };
}
