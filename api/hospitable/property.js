// /api/hospitable/property?uuid=... — single property + images + reviews
import { resolveApiKey } from "../../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

export default async function handler(req, res) {
  const { key } = await resolveApiKey(req, "hospitable_api_key", "HOSPITABLE_API_KEY");
  const uuid = (req.query?.uuid || "").trim();
  if (!uuid) return res.status(400).json({ error: "uuid required" });
  if (!key) return res.status(200).json({ ok: false, error: "Hospitable API key not configured", mock: true });

  try {
    const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
    const [propRes, imgRes, revRes] = await Promise.all([
      fetch(`${HOSPITABLE_BASE}/properties/${uuid}?include=details,listings`, { headers }),
      fetch(`${HOSPITABLE_BASE}/properties/${uuid}/images`, { headers }),
      fetch(`${HOSPITABLE_BASE}/properties/${uuid}/reviews?per_page=20`, { headers })
    ]);
    const property = propRes.ok ? await propRes.json() : null;
    const images = imgRes.ok ? await imgRes.json() : null;
    const reviews = revRes.ok ? await revRes.json() : null;

    const reviewSummary = (reviews?.data || []).reduce((acc, r) => {
      acc.count++;
      acc.total += r.public?.rating || 0;
      return acc;
    }, { count: 0, total: 0 });
    const avg = reviewSummary.count ? +(reviewSummary.total / reviewSummary.count).toFixed(2) : 0;

    return res.status(200).json({
      ok: true,
      property: property?.data,
      images: (images?.data || []).map(i => ({ url: i.url, thumbnail: i.thumbnail_url, caption: i.caption, order: i.order })),
      reviews: (reviews?.data || []).map(r => ({
        rating: r.public?.rating, text: r.public?.review,
        date: r.reviewed_at, response: r.public?.response
      })),
      reviewCount: reviewSummary.count,
      avgRating: avg,
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
