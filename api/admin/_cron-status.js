// /api/admin/cron-status?source=pricelabs-cron — recent cron run summary
import { getDb, ensureSchema } from "../../lib/db.js";

export default async function handler(req, res) {
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: "Turso not configured", entries: [] });
  await ensureSchema();

  const source = (req.query?.source || "pricelabs-cron").trim();
  const r = await db.execute({
    sql: "SELECT status, message, duration_ms, ran_at FROM sync_log WHERE source = ? ORDER BY ran_at DESC LIMIT 24",
    args: [source]
  });
  const last = r.rows[0] || null;
  const counts = r.rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  // Also report total daily_prices rows (if applicable)
  let priceRowCount = null;
  try {
    const c = await db.execute("SELECT COUNT(*) as n FROM daily_prices");
    priceRowCount = c.rows[0]?.n;
  } catch {}

  return res.status(200).json({
    ok: true,
    last,
    recentRuns: r.rows,
    counts,
    priceRowCount,
    fetchedAt: new Date().toISOString()
  });
}
