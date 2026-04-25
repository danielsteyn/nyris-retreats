// /api/admin/sync-log — recent sync entries
// GET ?source=hospitable|pricelabs  -> last 50 entries
// POST { source, status, message, details, duration_ms } -> append
import { getDb, ensureSchema } from "../../lib/db.js";

export default async function handler(req, res) {
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: "TURSO_DATABASE_URL not set", entries: [] });
  await ensureSchema();

  if (req.method === "GET") {
    const source = (req.query?.source || "").trim();
    const r = source
      ? await db.execute({ sql: "SELECT * FROM sync_log WHERE source = ? ORDER BY ran_at DESC LIMIT 50", args: [source] })
      : await db.execute("SELECT * FROM sync_log ORDER BY ran_at DESC LIMIT 50");
    return res.status(200).json({ ok: true, entries: r.rows });
  }

  if (req.method === "POST") {
    const { source, status, message, details, duration_ms } = req.body || {};
    if (!source || !status) return res.status(400).json({ ok: false, error: "source and status required" });
    await db.execute({
      sql: `INSERT INTO sync_log (source, status, message, details, duration_ms) VALUES (?, ?, ?, ?, ?)`,
      args: [source, status, message || null, details ? JSON.stringify(details) : null, duration_ms || null]
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
