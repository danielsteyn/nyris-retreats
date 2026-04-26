// /api/photos — returns admin-set photo overrides for ALL properties in one call.
// Public endpoint (no auth) — only returns non-hidden photos in admin order.
// Cached at the edge for 60 seconds (must-revalidate) so admin changes appear
// quickly while still keeping load off the DB.

import { getDb, ensureSchema } from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60, must-revalidate, s-maxage=60");

  const db = getDb();
  if (!db) return res.status(200).json({ ok: true, overrides: {}, source: "none" });

  try {
    await ensureSchema();
    const r = await db.execute(`
      SELECT property_id, url, caption, sort_order, is_cover, is_hidden, source
      FROM property_photos
      WHERE is_hidden = 0
      ORDER BY property_id, sort_order ASC
    `);

    const overrides = {};
    for (const row of r.rows) {
      const pid = row.property_id;
      if (!overrides[pid]) overrides[pid] = [];
      overrides[pid].push({
        url: row.url,
        caption: row.caption || "",
        isCover: !!row.is_cover,
        source: row.source
      });
    }

    // Promote cover photos to position 0 inside each property's array
    for (const pid of Object.keys(overrides)) {
      const list = overrides[pid];
      const coverIdx = list.findIndex(p => p.isCover);
      if (coverIdx > 0) {
        const [cover] = list.splice(coverIdx, 1);
        list.unshift(cover);
      }
    }

    return res.status(200).json({ ok: true, overrides, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e), overrides: {} });
  }
}
