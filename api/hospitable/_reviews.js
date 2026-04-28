// /api/hospitable/reviews?uuid=<property-uuid>
// Returns the complete review history for a Hospitable property by paging
// through their /properties/{uuid}/reviews endpoint.
//
// The existing admin sync path (_property.js) only fetches the first 20 —
// that's fine for the property-page preview cards but not for the reviews
// page. This is a focused endpoint that pulls everything (capped at a
// generous safety ceiling).

import { resolveApiKey } from "../../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

export default async function handler(req, res) {
  const uuid = (req.query?.uuid || "").trim();
  if (!uuid) return res.status(400).json({ ok: false, error: "uuid required" });

  const { key, source } = await resolveApiKey(req, "hospitable_api_key", "HOSPITABLE_API_KEY");
  if (!key) {
    return res.status(200).json({ ok: false, error: "Hospitable API key not configured", mock: true, reviews: [] });
  }

  try {
    const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
    const reviews = await fetchAllReviews(uuid, headers);

    // Sort newest first by default; the client can re-sort.
    reviews.sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : 0;
      const bd = b.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    });

    const ratingSum = reviews.reduce((s, r) => s + (r.rating || 0), 0);
    const avg = reviews.length ? +(ratingSum / reviews.length).toFixed(2) : 0;

    return res.status(200).json({
      ok: true,
      reviews,
      total: reviews.length,
      avgRating: avg,
      keySource: source,
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e).slice(0, 500), reviews: [] });
  }
}

// Hospitable's /properties/{uuid}/reviews is Laravel-paginated. Loop until
// last_page (or until a short page is returned) with a hard ceiling so a
// runaway response can't spin forever.
async function fetchAllReviews(uuid, headers) {
  const out = [];
  let page = 1;
  const PER_PAGE = 100;
  const MAX_PAGES = 30; // 30 * 100 = 3000 reviews — far more than any listing
  while (page <= MAX_PAGES) {
    const url = `${HOSPITABLE_BASE}/properties/${uuid}/reviews?per_page=${PER_PAGE}&page=${page}`;
    const r = await fetch(url, { headers });
    if (!r.ok) break;
    const j = await r.json();
    const data = j?.data || [];
    for (const r of data) {
      out.push(normalize(r));
    }
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

// Normalize Hospitable's review shape (field names vary across endpoints
// and channels) into a stable contract for the public reviews page.
function normalize(r) {
  // Author: prefer first+last name, fall back to channel-friendly label.
  const fn = r?.guest?.first_name || r?.guest_first_name || r?.first_name;
  const ln = r?.guest?.last_name || r?.guest_last_name || r?.last_name;
  let author;
  if (fn || ln) {
    // Last initial only, keeping it lightly anonymized.
    const last = ln ? ` ${ln.toString().trim().charAt(0)}.` : "";
    author = `${(fn || "").toString().trim()}${last}`.trim();
  }
  if (!author) {
    const channel = (r?.channel || "").toString();
    author = channel ? `Verified ${channel.toLowerCase()} guest` : "Verified guest";
  }

  return {
    author,
    rating: r?.public?.rating ?? r?.rating ?? null,
    text: (r?.public?.review || r?.review || "").toString(),
    date: r?.reviewed_at || r?.created_at || null,
    response: r?.public?.response || r?.response || null,
    channel: r?.channel || null
  };
}
