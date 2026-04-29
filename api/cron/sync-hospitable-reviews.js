// /api/cron/sync-hospitable-reviews — daily refresh of per-property review
// count + average rating from Hospitable. Triggered by GitHub Actions
// (.github/workflows/sync-hospitable-reviews.yml) on a daily schedule.
//
// Auth: same Bearer ${CRON_SECRET} contract as the PriceLabs cron. If the
// env var is unset the handler still runs (dev-friendly) but logs a warning.
//
// Storage shape: writes into the existing overrides settings under
//   o.reviewCounts[<property-uuid>] = { count, avgRating, fetchedAt }
// The public site's applyOverrides reads this and patches the in-memory
// NYRIS.properties[*].reviewCount / .rating so the count rendered on
// property cards + headers reflects the latest Hospitable data without
// requiring a redeploy.

import { getDb, ensureSchema, getSetting, setSetting, resolveApiKey } from "../../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

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
      error: "Turso not configured. Cron sync requires server-side storage."
    });
  }
  await ensureSchema();

  const { key } = await resolveApiKey(req, "hospitable_api_key", "HOSPITABLE_API_KEY");
  if (!key) {
    await logSync(db, "error", "Hospitable API key not configured server-side");
    return res.status(200).json({
      ok: false,
      error: "Hospitable API key not configured server-side."
    });
  }

  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };

  // Pull the property list from Hospitable so we know which UUIDs to sync.
  // Falls back gracefully on a non-200 — we log and bail rather than write
  // bad data into the overrides blob.
  let properties = [];
  try {
    const r = await fetch(`${HOSPITABLE_BASE}/properties?per_page=100`, { headers });
    if (!r.ok) throw new Error(`Hospitable properties API returned ${r.status}`);
    const j = await r.json();
    properties = j?.data || [];
  } catch (e) {
    await logSync(db, "error", `Property list fetch failed: ${String(e).slice(0, 280)}`);
    return res.status(200).json({ ok: false, error: String(e).slice(0, 500) });
  }

  if (!properties.length) {
    await logSync(db, "partial", "No properties returned from Hospitable");
    return res.status(200).json({ ok: true, properties: 0, updated: {} });
  }

  // Iterate each UUID, pull reviews, compute count + avg. Per-property
  // failures don't fail the whole job — we collect what we got and log
  // the rest. Throttle slightly to be a polite API consumer.
  const updated = {};
  const failures = {};
  for (const p of properties) {
    const uuid = p?.id || p?.uuid;
    if (!uuid) continue;
    try {
      const reviews = await fetchAllReviews(uuid, headers);
      const ratingSum = reviews.reduce((s, r) => s + (Number(r?.public?.rating || r?.rating) || 0), 0);
      const ratingCount = reviews.filter(r => (Number(r?.public?.rating || r?.rating) || 0) > 0).length;
      const avgRating = ratingCount ? +(ratingSum / ratingCount).toFixed(2) : 0;
      updated[uuid] = {
        count: reviews.length,
        avgRating,
        fetchedAt: new Date().toISOString()
      };
    } catch (e) {
      failures[uuid] = String(e).slice(0, 200);
    }
    // 100ms cushion between properties — Hospitable rate-limits aggressively
    // when a single key is hammered too fast.
    await new Promise(r => setTimeout(r, 100));
  }

  // Merge into the overrides blob (preserving every other key the host
  // has saved through the admin UI).
  const overrides = await getSetting("overrides", {});
  overrides.reviewCounts = { ...(overrides.reviewCounts || {}), ...updated };
  await setSetting("overrides", overrides);

  const updatedCount = Object.keys(updated).length;
  const failedCount = Object.keys(failures).length;
  const status = failedCount === 0 ? "success" : (updatedCount > 0 ? "partial" : "error");
  await logSync(db, status, `${updatedCount} updated, ${failedCount} failed`, { updated, failures });

  return res.status(200).json({
    ok: true,
    properties: properties.length,
    updated: updatedCount,
    failed: failedCount,
    counts: updated
  });
}

async function fetchAllReviews(uuid, headers) {
  const out = [];
  let page = 1;
  const PER_PAGE = 100;
  const MAX_PAGES = 30; // 3000 review ceiling
  while (page <= MAX_PAGES) {
    const url = `${HOSPITABLE_BASE}/properties/${uuid}/reviews?per_page=${PER_PAGE}&page=${page}`;
    const r = await fetch(url, { headers });
    if (!r.ok) break;
    const j = await r.json();
    const data = j?.data || [];
    out.push(...data);
    const lastPage = j?.meta?.last_page;
    if (lastPage != null) {
      if (page >= lastPage) break;
    } else if (data.length < PER_PAGE) {
      break;
    }
    page++;
  }
  return out;
}

async function logSync(db, status, message, details) {
  try {
    await db.execute({
      sql: "INSERT INTO sync_log (source, status, message, details) VALUES (?, ?, ?, ?)",
      args: [
        "hospitable-reviews-cron",
        status,
        String(message).slice(0, 500),
        details ? JSON.stringify(details).slice(0, 4000) : null
      ]
    });
  } catch { /* logging is best-effort; never fails the response */ }
}
