// /api/cron/sync-pricelabs — Vercel Cron handler.
// Triggered by vercel.json "crons" config every 15 minutes.
// Pulls latest daily prices from PriceLabs for every mapped property and
// upserts them into the daily_prices table in Turso.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
// Set CRON_SECRET in Vercel → Settings → Environment Variables to a long
// random value (e.g. `openssl rand -base64 32`). If the env var is empty
// the handler still runs (useful for testing) but logs a warning.

import { getDb, ensureSchema, getSetting, resolveApiKey } from "../../lib/db.js";

const PRICELABS_BASE = "https://api.pricelabs.co/v1";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  const db = getDb();
  if (!db) {
    return res.status(200).json({
      ok: false,
      error: "Turso not configured. Cron sync requires server-side storage. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars."
    });
  }
  await ensureSchema();

  const { key } = await resolveApiKey(req, "pricelabs_api_key", "PRICELABS_API_KEY");
  if (!key) {
    await db.execute({
      sql: "INSERT INTO sync_log (source, status, message) VALUES (?, ?, ?)",
      args: ["pricelabs-cron", "error", "PriceLabs API key not configured server-side"]
    });
    return res.status(200).json({
      ok: false,
      error: "PriceLabs API key not configured server-side. Save it in /admin (with Turso enabled) or set PRICELABS_API_KEY env var."
    });
  }

  const overrides = await getSetting("overrides", {});
  const mappings = overrides.pricelabsMap || {};
  const propertyIds = Object.keys(mappings);

  if (propertyIds.length === 0) {
    await db.execute({
      sql: "INSERT INTO sync_log (source, status, message) VALUES (?, ?, ?)",
      args: ["pricelabs-cron", "skipped", "No properties mapped to PriceLabs listings"]
    });
    return res.status(200).json({ ok: true, skipped: true, reason: "No mappings" });
  }

  const t0 = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const horizonDate = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  let updated = 0;
  let errors = 0;
  const perProperty = {};

  // 1. Fetch the listings catalog so we can look up the `pms` value for each
  //    listing_id (PriceLabs's POST /listing_prices requires both id + pms).
  let listingMeta = {};
  try {
    const lr = await fetch(`${PRICELABS_BASE}/listings`, {
      headers: { "X-API-Key": key, Accept: "application/json" }
    });
    if (lr.ok) {
      const lj = await lr.json();
      const arr = lj.listings || lj.data || lj || [];
      for (const l of arr) {
        const id = l.id || l.listing_id;
        if (id) listingMeta[String(id)] = { pms: l.pms || l.platform || "" };
      }
    }
  } catch {}

  // 2. Build the request batch — one entry per mapped property.
  const batch = [];
  for (const propertyId of propertyIds) {
    const listingId = mappings[propertyId];
    if (!listingId) continue;
    const pms = listingMeta[String(listingId)]?.pms;
    if (!pms) {
      errors++;
      perProperty[propertyId] = { error: "Listing not found in PriceLabs catalog (or no pms)" };
      continue;
    }
    batch.push({ propertyId, listingId, pms });
  }

  // 3. Single POST to /listing_prices with all listings in one body. PriceLabs
  //    can return prices for multiple listings in a single response.
  if (batch.length) {
    try {
      const r = await fetch(`${PRICELABS_BASE}/listing_prices`, {
        method: "POST",
        headers: {
          "X-API-Key": key,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          listings: batch.map(b => ({
            id: b.listingId,
            pms: b.pms,
            dateFrom: today,
            dateTo: horizonDate
          }))
        })
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        const msg = `HTTP ${r.status} ${body.slice(0, 200)}`;
        for (const b of batch) {
          errors++;
          perProperty[b.propertyId] = { error: msg };
        }
      } else {
        const data = await r.json();
        // Response shape: { data: [{ id|listing_id, prices|data: [{ date, price, ... }] }] }
        const arr = data.data || data.results || data.listings || data || [];
        const byListing = new Map();
        for (const row of (Array.isArray(arr) ? arr : [])) {
          const lid = row.id || row.listing_id;
          if (lid) byListing.set(String(lid), row);
        }
        for (const b of batch) {
          const row = byListing.get(String(b.listingId));
          if (!row) {
            errors++;
            perProperty[b.propertyId] = { error: "No prices returned for this listing" };
            continue;
          }
          const prices = row.prices || row.data || row.listing_prices || [];
          let count = 0;
          for (const p of prices) {
            const date = p.date || p.day;
            const price = p.price ?? p.recommended_price ?? p.suggested_price ?? p.final_price;
            if (!date || price == null) continue;
            await db.execute({
              sql: `INSERT INTO daily_prices (property_id, date, price, currency, min_stay, source, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'pricelabs', CURRENT_TIMESTAMP)
                    ON CONFLICT(property_id, date) DO UPDATE SET
                      price = excluded.price,
                      currency = excluded.currency,
                      min_stay = excluded.min_stay,
                      updated_at = CURRENT_TIMESTAMP`,
              args: [b.propertyId, date, Number(price), p.currency || "USD", p.min_stay || p.min_nights || null]
            });
            count++;
          }
          updated += count;
          perProperty[b.propertyId] = { count };
        }
      }
    } catch (e) {
      for (const b of batch) {
        errors++;
        perProperty[b.propertyId] = { error: String(e.message || e) };
      }
    }
  }

  const dt = Date.now() - t0;
  const status = errors === 0 ? "success" : (updated > 0 ? "partial" : "error");
  const message = errors === 0
    ? `Synced ${updated} prices across ${propertyIds.length} ${propertyIds.length === 1 ? "property" : "properties"}`
    : `Synced ${updated} prices, ${errors} ${errors === 1 ? "error" : "errors"}`;

  await db.execute({
    sql: "INSERT INTO sync_log (source, status, message, details, duration_ms) VALUES (?, ?, ?, ?, ?)",
    args: ["pricelabs-cron", status, message, JSON.stringify(perProperty), dt]
  });

  return res.status(200).json({
    ok: true,
    status,
    updated,
    errors,
    properties: propertyIds.length,
    duration_ms: dt,
    perProperty
  });
}
