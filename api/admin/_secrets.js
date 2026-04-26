// /api/admin/secrets — manage encrypted API keys via the admin UI
// GET                       -> { ok, items: [{key,last4,updated_at,source}], encryption: 'env'|'db'|'none' }
// POST { key, value }       -> save encrypted (returns last4 only, never raw)
// DELETE ?key=...           -> remove
//
// Known keys (used by the integration API routes):
//   - hospitable_api_key      → Hospitable Public API token
//   - pricelabs_api_key       → PriceLabs API key
//
// IMPORTANT: this route does NOT return raw key values to the client.
// The admin UI only sees masked status (e.g. "•••• abcd").

import { getDb, ensureSchema, listSecretMeta, setSecret, deleteSecret } from "../../lib/db.js";

const KNOWN = ["hospitable_api_key", "pricelabs_api_key"];

export default async function handler(req, res) {
  if (!getDb()) {
    return res.status(200).json({
      ok: false,
      error: "Turso not configured. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars in Vercel to enable admin-managed API keys."
    });
  }
  await ensureSchema();

  if (req.method === "GET") {
    const stored = await listSecretMeta();
    const items = KNOWN.map(name => {
      const s = stored.find(r => r.key === name);
      const envName = name.toUpperCase();
      const envSet = !!process.env[envName];
      return {
        key: name,
        envVar: envName,
        last4: s?.last4 || null,
        updatedAt: s?.updated_at || null,
        source: s ? "admin" : (envSet ? "env" : "none"),
        envFallback: envSet
      };
    });
    return res.status(200).json({
      ok: true,
      items,
      encryption: process.env.SECRETS_KEY ? "env" : "db"
    });
  }

  if (req.method === "POST") {
    const { key, value } = req.body || {};
    if (!key || !KNOWN.includes(key)) return res.status(400).json({ ok: false, error: "unknown secret key" });
    if (typeof value !== "string" || !value.trim()) return res.status(400).json({ ok: false, error: "value required" });
    if (value.trim().length < 8) return res.status(400).json({ ok: false, error: "value seems too short to be a real API key" });
    try {
      await setSecret(key, value.trim());
      return res.status(200).json({ ok: true, last4: value.trim().slice(-4) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  }

  if (req.method === "DELETE") {
    const key = (req.query?.key || "").trim();
    if (!key || !KNOWN.includes(key)) return res.status(400).json({ ok: false, error: "unknown secret key" });
    await deleteSecret(key);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
