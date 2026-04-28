// /api/admin/photos — manage per-property photo overrides
// GET ?property=ID  -> array of photos in admin order
// POST { propertyId, photos: [...] } -> replace
import { getDb, ensureSchema } from "../../lib/db.js";

export default async function handler(req, res) {
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: "TURSO_DATABASE_URL not set" });
  await ensureSchema();

  if (req.method === "GET") {
    const property = (req.query?.property || "").trim();
    if (!property) return res.status(400).json({ ok: false, error: "property required" });
    const r = await db.execute({
      sql: `SELECT url, thumbnail, caption, sort_order, is_cover, is_hidden, source
            FROM property_photos WHERE property_id = ? ORDER BY sort_order ASC`,
      args: [property]
    });
    const photos = r.rows.map(row => ({
      url: row.url, thumbnail: row.thumbnail, caption: row.caption || '',
      isCover: !!row.is_cover, isHidden: !!row.is_hidden, source: row.source
    }));
    return res.status(200).json({ ok: true, photos });
  }

  if (req.method === "POST") {
    const { propertyId, photos } = req.body || {};
    if (!propertyId) return res.status(400).json({ ok: false, error: "propertyId required" });
    if (!Array.isArray(photos)) return res.status(400).json({ ok: false, error: "photos array required" });

    // Replace strategy: delete existing, insert new.
    await db.execute({ sql: "DELETE FROM property_photos WHERE property_id = ?", args: [propertyId] });
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      await db.execute({
        sql: `INSERT OR REPLACE INTO property_photos
              (property_id, url, thumbnail, caption, sort_order, is_cover, is_hidden, source)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [propertyId, p.url, p.thumbnail || null, p.caption || '', i, p.isCover ? 1 : 0, p.isHidden ? 1 : 0, p.source || 'custom']
      });
    }
    return res.status(200).json({ ok: true, count: photos.length });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
