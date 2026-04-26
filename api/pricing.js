// /api/pricing?propertyId=...&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD
// Returns the live per-night prices from the daily_prices table (populated by
// the PriceLabs cron). For dates where no live price exists, falls back to
// the property's basePrice so the booking widget always renders something.

import { getDb, ensureSchema } from "../lib/db.js";

export default async function handler(req, res) {
  const { propertyId, checkin, checkout, basePrice } = req.query || {};
  if (!propertyId) return res.status(400).json({ ok: false, error: "propertyId required" });

  // Summary mode: no checkin/checkout supplied → return min/avg/max over the
  // next 90 days for the headline "from $X / night" badge on property pages.
  if (!checkin || !checkout) {
    const fallback = Number(basePrice) || 0;
    const db = getDb();
    if (!db) {
      return res.status(200).json({
        ok: true, mode: "summary", source: "fallback",
        min: fallback, max: fallback, avg: fallback, currency: "USD"
      });
    }
    await ensureSchema();
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const r = await db.execute({
      sql: `SELECT MIN(price) as min_p, MAX(price) as max_p, AVG(price) as avg_p, COUNT(*) as n, currency
            FROM daily_prices
            WHERE property_id = ? AND date >= ? AND date <= ?
            GROUP BY currency`,
      args: [propertyId, today, horizon]
    });
    if (!r.rows.length) {
      return res.status(200).json({
        ok: true, mode: "summary", source: "fallback",
        min: fallback, max: fallback, avg: fallback, currency: "USD",
        coverage: 0
      });
    }
    const row = r.rows[0];
    return res.status(200).json({
      ok: true, mode: "summary", source: "pricelabs",
      min: Math.round(Number(row.min_p)),
      max: Math.round(Number(row.max_p)),
      avg: Math.round(Number(row.avg_p)),
      currency: row.currency || "USD",
      coverage: Number(row.n)
    });
  }

  const ci = new Date(checkin);
  const co = new Date(checkout);
  if (!(ci < co)) return res.status(400).json({ ok: false, error: "checkout must be after checkin" });

  const fallback = Number(basePrice) || 0;
  const db = getDb();

  const nights = [];
  for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
    nights.push(d.toISOString().slice(0, 10));
  }

  if (!db) {
    return res.status(200).json({
      ok: true,
      source: "fallback",
      nights: nights.map(date => ({ date, price: fallback, source: "fallback" })),
      total: fallback * nights.length,
      avgNightly: fallback,
      currency: "USD",
      coverage: 0,
      reason: "Turso not configured; using base price for all nights"
    });
  }
  await ensureSchema();

  const placeholders = nights.map(() => "?").join(",");
  const r = await db.execute({
    sql: `SELECT date, price, currency FROM daily_prices
          WHERE property_id = ? AND date IN (${placeholders})`,
    args: [propertyId, ...nights]
  });
  const priceByDate = new Map(r.rows.map(row => [row.date, { price: Number(row.price), currency: row.currency || "USD" }]));

  const out = nights.map(date => {
    const p = priceByDate.get(date);
    if (p) return { date, price: p.price, currency: p.currency, source: "pricelabs" };
    return { date, price: fallback, currency: "USD", source: "fallback" };
  });
  const total = out.reduce((s, n) => s + n.price, 0);
  const covered = out.filter(n => n.source === "pricelabs").length;

  return res.status(200).json({
    ok: true,
    source: covered === nights.length ? "pricelabs" : (covered ? "mixed" : "fallback"),
    nights: out,
    total,
    avgNightly: Math.round(total / nights.length),
    currency: out[0]?.currency || "USD",
    coverage: covered,
    coveragePct: Math.round((covered / nights.length) * 100)
  });
}
