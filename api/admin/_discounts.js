// /api/admin/discounts — admin CRUD for discount codes.
//   GET                                  → list all codes (with usage stats)
//   POST { code, type, value, maxUses?, expiresAt?, description? } → create or update
//   DELETE ?code=...                     → delete
//   PATCH { code, active }               → toggle active flag

import { getDb, ensureSchema } from "../../lib/db.js";

export default async function handler(req, res) {
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: "Turso not configured" });
  await ensureSchema();

  if (req.method === "GET") {
    const r = await db.execute(
      `SELECT code, type, value, max_uses, times_used, expires_at, active, description,
              created_at, updated_at,
              (SELECT COUNT(*) FROM discount_redemptions dr WHERE dr.code = discount_codes.code) AS redemptions
       FROM discount_codes
       ORDER BY created_at DESC`
    );
    return res.status(200).json({ ok: true, codes: r.rows });
  }

  if (req.method === "POST") {
    const { code, type, value, maxUses, expiresAt, description, active } = req.body || {};
    const norm = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9_-]{3,32}$/.test(norm)) {
      return res.status(400).json({ ok: false, error: "Code must be 3-32 chars: letters, digits, underscore, dash" });
    }
    if (!["flat", "percent"].includes(type)) {
      return res.status(400).json({ ok: false, error: "type must be 'flat' or 'percent'" });
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return res.status(400).json({ ok: false, error: "value must be a positive number" });
    }
    if (type === "percent" && num > 100) {
      return res.status(400).json({ ok: false, error: "percent value can't exceed 100" });
    }
    const max = (maxUses === "" || maxUses == null) ? null : parseInt(maxUses, 10);
    if (max != null && (!Number.isFinite(max) || max < 1)) {
      return res.status(400).json({ ok: false, error: "maxUses must be 1+ or empty for unlimited" });
    }
    const exp = (expiresAt && /^\d{4}-\d{2}-\d{2}/.test(expiresAt)) ? expiresAt.slice(0, 10) : null;

    await db.execute({
      sql: `INSERT INTO discount_codes (code, type, value, max_uses, expires_at, description, active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(code) DO UPDATE SET
              type=excluded.type, value=excluded.value, max_uses=excluded.max_uses,
              expires_at=excluded.expires_at, description=excluded.description,
              active=excluded.active, updated_at=CURRENT_TIMESTAMP`,
      args: [norm, type, num, max, exp, description || null, active === false ? 0 : 1]
    });
    return res.status(200).json({ ok: true, code: norm });
  }

  if (req.method === "PATCH") {
    const { code, active } = req.body || {};
    if (!code) return res.status(400).json({ ok: false, error: "code required" });
    await db.execute({
      sql: "UPDATE discount_codes SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?",
      args: [active ? 1 : 0, String(code).toUpperCase()]
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const code = String(req.query?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: "code required" });
    await db.execute({ sql: "DELETE FROM discount_codes WHERE code = ?", args: [code] });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
