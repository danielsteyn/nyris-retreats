// /api/availability?propertyId=...&months=4
// Merges Hospitable's per-day availability + min-stay with cron-synced
// PriceLabs daily prices into one calendar payload for the booking widget.
//
// Public endpoint (no auth) — short edge cache (60s) since prices change.

import { getDb, ensureSchema, resolveApiKey, getSetting } from "./../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60, must-revalidate, s-maxage=60");

  const propertyId = (req.query?.propertyId || "").trim();
  const months = Math.min(12, Math.max(1, parseInt(req.query?.months || "4", 10)));
  if (!propertyId) return res.status(400).json({ ok: false, error: "propertyId required" });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + months * 31 * 86400000).toISOString().slice(0, 10);

  // 1. Pull Hospitable availability (booked dates + min-stay).
  let availability = {};
  let hospitableSource = "none";
  const { key: hospitableKey } = await resolveApiKey(req, "hospitable_api_key", "HOSPITABLE_API_KEY");
  if (hospitableKey) {
    try {
      const r = await fetch(
        `${HOSPITABLE_BASE}/properties/${propertyId}/calendar?start_date=${start}&end_date=${end}`,
        { headers: { Authorization: `Bearer ${hospitableKey}`, Accept: "application/json" } }
      );
      if (r.ok) {
        const j = await r.json();
        for (const d of (j.data || [])) {
          if (!d.date) continue;
          availability[d.date] = {
            available: d.availability?.available !== false,
            minStay: d.min_nights || d.min_stay || null,
            hospitablePrice: d.price?.amount || null,
            currency: d.price?.currency || "USD"
          };
        }
        hospitableSource = "live";
      }
    } catch {}
  }

  // 2. Pull cron-synced PriceLabs daily prices.
  let priceMap = new Map();
  const db = getDb();
  if (db) {
    try {
      await ensureSchema();
      const r = await db.execute({
        sql: `SELECT date, price, currency, min_stay
              FROM daily_prices
              WHERE property_id = ? AND date >= ? AND date <= ?`,
        args: [propertyId, start, end]
      });
      for (const row of r.rows) {
        priceMap.set(row.date, {
          price: Number(row.price),
          currency: row.currency || "USD",
          minStay: row.min_stay || null
        });
      }
    } catch {}
  }

  // 3. Build per-day array spanning today → +months
  const days = [];
  const totalDays = Math.round((new Date(end) - new Date(start)) / 86400000);
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const av = availability[dateStr];
    const pl = priceMap.get(dateStr);
    days.push({
      date: dateStr,
      available: av ? av.available : true, // default available if no Hospitable data
      price: pl?.price ?? av?.hospitablePrice ?? null,
      priceSource: pl ? "pricelabs" : (av?.hospitablePrice ? "hospitable" : "none"),
      currency: pl?.currency || av?.currency || "USD",
      minStay: pl?.minStay ?? av?.minStay ?? null
    });
  }

  return res.status(200).json({
    ok: true,
    propertyId,
    start, end,
    days,
    source: { availability: hospitableSource, prices: priceMap.size ? "pricelabs" : "none" },
    fetchedAt: new Date().toISOString()
  });
}
