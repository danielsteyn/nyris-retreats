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
    const [propRes, allImages, revRes] = await Promise.all([
      fetch(`${HOSPITABLE_BASE}/properties/${uuid}?include=details,listings`, { headers }),
      fetchAllImages(uuid, headers),
      fetch(`${HOSPITABLE_BASE}/properties/${uuid}/reviews?per_page=20`, { headers })
    ]);
    const property = propRes.ok ? await propRes.json() : null;
    const reviews = revRes.ok ? await revRes.json() : null;

    const reviewSummary = (reviews?.data || []).reduce((acc, r) => {
      acc.count++;
      acc.total += r.public?.rating || 0;
      return acc;
    }, { count: 0, total: 0 });
    const avg = reviewSummary.count ? +(reviewSummary.total / reviewSummary.count).toFixed(2) : 0;

    // Sort by Hospitable's `order` field (ascending, nulls last) so cover/
    // hero photo stays first regardless of which page it came back on.
    const sortedImages = allImages.slice().sort((a, b) => {
      const ao = a.order == null ? Infinity : a.order;
      const bo = b.order == null ? Infinity : b.order;
      return ao - bo;
    });

    return res.status(200).json({
      ok: true,
      property: property?.data,
      images: sortedImages,
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

// Hospitable's /properties/{uuid}/images is Laravel-paginated. Default page
// size is small (~15), so without paging we miss most photos on properties
// that have 30+. Loop until last_page is reached, with a hard cap so a bad
// response can't spin forever.
async function fetchAllImages(uuid, headers) {
  const out = [];
  let page = 1;
  const MAX_PAGES = 20; // 20 * 100 = 2000 photos, more than any real listing
  while (page <= MAX_PAGES) {
    const url = `${HOSPITABLE_BASE}/properties/${uuid}/images?per_page=100&page=${page}`;
    const r = await fetch(url, { headers });
    if (!r.ok) break;
    const j = await r.json();
    const data = j?.data || [];
    for (const i of data) {
      out.push({ url: i.url, thumbnail: i.thumbnail_url, caption: i.caption, order: i.order });
    }
    const lastPage = j?.meta?.last_page;
    if (lastPage != null) {
      if (page >= lastPage) break;
    } else if (data.length < 100) {
      // No meta — stop when we get a short page.
      break;
    }
    page++;
  }
  return out;
}
