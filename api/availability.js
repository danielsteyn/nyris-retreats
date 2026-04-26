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

  // 1. Pull Hospitable reservations within the window. Mark every covered
  //    night as booked. We follow standard hotel/STR semantics: nights
  //    include arrival_date, exclude departure_date.
  let bookedDates = new Set();
  let hospitableSource = "none";
  const { key: hospitableKey } = await resolveApiKey(req, "hospitable_api_key", "HOSPITABLE_API_KEY");
  if (hospitableKey) {
    try {
      // Paginate through reservations until we've covered the window.
      let page = 1;
      while (page <= 5) { // hard cap so we never loop forever
        const url = `${HOSPITABLE_BASE}/reservations?properties[]=${encodeURIComponent(propertyId)}&per_page=100&page=${page}`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${hospitableKey}`, Accept: "application/json" }
        });
        if (!r.ok) break;
        const j = await r.json();
        for (const res of (j.data || [])) {
          // Skip cancelled / declined / pending
          const status = res.reservation_status?.current?.category || res.status || "";
          if (!["accepted", "confirmed", "arrived", "checked_in", "checked_out", "completed"].includes(String(status).toLowerCase())) continue;
          // arrival_date / departure_date are tz-aware (e.g. "2026-05-01T00:00:00-05:00").
          // The first 10 chars are the local YYYY-MM-DD; that's what we want.
          const arrival = (res.arrival_date || res.check_in || "").slice(0, 10);
          const departure = (res.departure_date || res.check_out || "").slice(0, 10);
          if (!arrival || !departure) continue;
          for (let d = new Date(arrival + "T00:00:00Z");
               d.toISOString().slice(0, 10) < departure;
               d.setUTCDate(d.getUTCDate() + 1)) {
            bookedDates.add(d.toISOString().slice(0, 10));
          }
        }
        hospitableSource = "live";
        if (!j.meta?.next_page && (j.data || []).length < 100) break;
        page++;
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
    const pl = priceMap.get(dateStr);
    days.push({
      date: dateStr,
      available: !bookedDates.has(dateStr),
      price: pl?.price ?? null,
      priceSource: pl ? "pricelabs" : "none",
      currency: pl?.currency || "USD",
      minStay: pl?.minStay ?? null
    });
  }

  return res.status(200).json({
    ok: true,
    propertyId,
    start, end,
    days,
    bookedCount: bookedDates.size,
    source: { availability: hospitableSource, prices: priceMap.size ? "pricelabs" : "none" },
    fetchedAt: new Date().toISOString()
  });
}
