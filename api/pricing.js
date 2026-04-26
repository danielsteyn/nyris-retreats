// /api/pricing?propertyId=...&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD
// Returns the live per-night prices from the daily_prices table (populated by
// the PriceLabs cron). For dates where no live price exists, falls back to
// the property's basePrice so the booking widget always renders something.

import { getDb, ensureSchema } from "../lib/db.js";

export default async function handler(req, res) {
  const { propertyId, checkin, checkout, basePrice } = req.query || {};
  if (!propertyId) return res.status(400).json({ ok: false, error: "propertyId required" });
  if (!checkin || !checkout) return res.status(400).json({ ok: false, error: "checkin and checkout required" });

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
