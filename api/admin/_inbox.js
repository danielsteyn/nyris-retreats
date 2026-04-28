// /api/admin/inbox — list contact submissions and apply mutations.
// GET                : list submissions (newest first; archived hidden by default).
// POST { id, action }: per-row action — mark-read | mark-unread | archive | unarchive | delete

import { getDb, ensureSchema } from "../../lib/db.js";

export default async function handler(req, res) {
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: "DB not configured" });
  await ensureSchema();

  if (req.method === "GET") {
    const limit = clampInt(req.query?.limit, 100, 1, 500);
    const showArchived = req.query?.archived === "1";
    const sql = `SELECT id, first_name, last_name, email, phone, topic, message,
                        sms_opt_in,
                        hospitable_inquiry_id, hospitable_status, email_status,
                        read, archived, created_at
                 FROM contact_submissions
                 ${showArchived ? "" : "WHERE archived = 0"}
                 ORDER BY created_at DESC LIMIT ?`;
    const r = await db.execute({ sql, args: [limit] });
    const submissions = r.rows.map(row => ({
      id: Number(row.id),
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      email: row.email,
      phone: row.phone || "",
      topic: row.topic || "",
      message: row.message || "",
      smsOptIn: !!row.sms_opt_in,
      hospitableInquiryId: row.hospitable_inquiry_id || null,
      hospitable: safeParse(row.hospitable_status),
      emailStatus: safeParse(row.email_status),
      read: !!row.read,
      archived: !!row.archived,
      createdAt: row.created_at
    }));
    // Counts for the unread badge / "X new" pill in the UI.
    const counts = await db.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN read = 0 AND archived = 0 THEN 1 ELSE 0 END) AS unread,
        SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) AS archived
      FROM contact_submissions`);
    const c = counts.rows[0] || {};
    return res.status(200).json({
      ok: true,
      submissions,
      counts: {
        total: Number(c.total || 0),
        unread: Number(c.unread || 0),
        archived: Number(c.archived || 0)
      }
    });
  }

  if (req.method === "POST") {
    const { id, action } = req.body || {};
    const sid = Number(id);
    if (!sid || !action) return res.status(400).json({ ok: false, error: "id + action required" });
    const ACTIONS = {
      "mark-read":   "UPDATE contact_submissions SET read = 1 WHERE id = ?",
      "mark-unread": "UPDATE contact_submissions SET read = 0 WHERE id = ?",
      "archive":     "UPDATE contact_submissions SET archived = 1 WHERE id = ?",
      "unarchive":   "UPDATE contact_submissions SET archived = 0 WHERE id = ?",
      "delete":      "DELETE FROM contact_submissions WHERE id = ?"
    };
    const sql = ACTIONS[action];
    if (!sql) return res.status(400).json({ ok: false, error: "Unknown action" });
    await db.execute({ sql, args: [sid] });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

function safeParse(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
function clampInt(v, def, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}
