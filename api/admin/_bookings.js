// /api/admin/bookings — list booking requests + apply per-row mutations.
// GET                       : list (newest first; archived hidden by default)
// POST { id, action, value }: actions →
//     mark-read | mark-unread |
//     archive   | unarchive   |
//     set-status (value: pending|confirmed|declined|cancelled) |
//     delete

import { getDb, ensureSchema } from "../../lib/db.js";

const VALID_STATUSES = ["pending", "confirmed", "declined", "cancelled"];

export default async function handler(req, res) {
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: "DB not configured" });
  await ensureSchema();

  if (req.method === "GET") {
    const limit = clampInt(req.query?.limit, 100, 1, 500);
    const showArchived = req.query?.archived === "1";
    const sql = `SELECT id, property_id, property_slug, property_name,
                        checkin, checkout, nights, guests,
                        first_name, last_name, email, phone, sms_opt_in,
                        message, promo_code,
                        quoted_total, quoted_currency, quoted_breakdown,
                        hospitable_quote_id, hospitable_status,
                        email_status, forward_status,
                        status, read, archived, created_at, updated_at
                 FROM booking_requests
                 ${showArchived ? "" : "WHERE archived = 0"}
                 ORDER BY created_at DESC LIMIT ?`;
    const r = await db.execute({ sql, args: [limit] });
    const rows = r.rows.map(row => ({
      id: Number(row.id),
      propertyId: row.property_id,
      propertySlug: row.property_slug || "",
      propertyName: row.property_name || "",
      checkin: row.checkin,
      checkout: row.checkout,
      nights: Number(row.nights || 0),
      guests: Number(row.guests || 0),
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      email: row.email,
      phone: row.phone || "",
      smsOptIn: !!row.sms_opt_in,
      message: row.message || "",
      promoCode: row.promo_code || null,
      quotedTotal: row.quoted_total != null ? Number(row.quoted_total) : null,
      quotedCurrency: row.quoted_currency || "USD",
      quotedBreakdown: safeParse(row.quoted_breakdown),
      hospitableQuoteId: row.hospitable_quote_id || null,
      hospitable: safeParse(row.hospitable_status),
      emailStatus: safeParse(row.email_status),
      forwardStatus: safeParse(row.forward_status),
      status: row.status || "pending",
      read: !!row.read,
      archived: !!row.archived,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    const counts = await db.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN read = 0 AND archived = 0 THEN 1 ELSE 0 END) AS unread,
        SUM(CASE WHEN status = 'pending' AND archived = 0 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) AS archived
      FROM booking_requests`);
    const c = counts.rows[0] || {};
    return res.status(200).json({
      ok: true,
      bookings: rows,
      counts: {
        total: Number(c.total || 0),
        unread: Number(c.unread || 0),
        pending: Number(c.pending || 0),
        archived: Number(c.archived || 0)
      }
    });
  }

  if (req.method === "POST") {
    const { id, action, value } = req.body || {};
    const sid = Number(id);
    if (!sid || !action) return res.status(400).json({ ok: false, error: "id + action required" });
    let sql, args;
    switch (action) {
      case "mark-read":   sql = "UPDATE booking_requests SET read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"; args = [sid]; break;
      case "mark-unread": sql = "UPDATE booking_requests SET read = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"; args = [sid]; break;
      case "archive":     sql = "UPDATE booking_requests SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"; args = [sid]; break;
      case "unarchive":   sql = "UPDATE booking_requests SET archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"; args = [sid]; break;
      case "delete":      sql = "DELETE FROM booking_requests WHERE id = ?"; args = [sid]; break;
      case "set-status":
        if (!VALID_STATUSES.includes(String(value))) return res.status(400).json({ ok: false, error: "invalid status" });
        sql = "UPDATE booking_requests SET status = ?, read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"; args = [String(value), sid]; break;
      default: return res.status(400).json({ ok: false, error: "Unknown action" });
    }
    await db.execute({ sql, args });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

function safeParse(s) { if (!s) return null; try { return JSON.parse(s); } catch { return null; } }
function clampInt(v, def, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}
