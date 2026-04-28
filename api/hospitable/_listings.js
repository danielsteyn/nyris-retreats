// /api/hospitable/listings?uuid=<property-uuid>
// Returns the public channel listing URLs (Airbnb, Vrbo, Booking.com, etc.)
// Hospitable has on file for the property. We use these to surface "View on
// Airbnb" / "View on Vrbo" buttons on the public property page.
//
// Hospitable's GET /v2/properties/{uuid}?include=listings returns a `listings`
// array under `data.listings`. Each entry has a `platform` field plus either
// a direct URL or a platform-specific listing ID we can stitch into a URL.

import { resolveApiKey } from "../../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

// Cache by uuid for the lifetime of the function instance to avoid hammering
// Hospitable on repeat property-page visits.
const _cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  const uuid = (req.query?.uuid || "").trim();
  if (!uuid) return res.status(400).json({ ok: false, error: "uuid required" });

  const cached = _cache.get(uuid);
  if (cached && Date.now() - cached.t < CACHE_MS) {
    return res.status(200).json({ ok: true, links: cached.links, cached: true });
  }

  const { key } = await resolveApiKey(req, "hospitable_api_key", "HOSPITABLE_API_KEY");
  if (!key) {
    return res.status(200).json({ ok: false, error: "Hospitable API key not configured", links: {} });
  }

  try {
    const r = await fetch(`${HOSPITABLE_BASE}/properties/${uuid}?include=listings`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(200).json({
        ok: false,
        status: r.status,
        error: text.slice(0, 300) || `HTTP ${r.status}`,
        links: {}
      });
    }
    const j = await r.json();
    const listings = j?.data?.listings || j?.listings || [];
    const links = extractLinks(listings);
    _cache.set(uuid, { t: Date.now(), links });
    return res.status(200).json({ ok: true, links });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e).slice(0, 300), links: {} });
  }
}

// Extract a {platform: url} map from Hospitable's listings array. We accept
// either an explicit `url`/`listing_url` on each entry, or a `platform_id`
// we can stitch into a known URL pattern. If both are missing, the channel
// is dropped — no guessing at IDs.
function extractLinks(listings) {
  const out = {};
  for (const l of listings || []) {
    const platform = String(l.platform || l.channel || "").toLowerCase().trim();
    if (!platform) continue;

    // Prefer an explicit URL field if Hospitable returned one.
    let url = l.url || l.listing_url || l.platform_url || l.external_url || null;

    // Otherwise stitch from platform_id using the canonical patterns.
    if (!url) {
      const pid = l.platform_id || l.external_id || l.id || null;
      if (!pid) continue;
      if (platform === "airbnb") url = `https://www.airbnb.com/rooms/${encodeURIComponent(pid)}`;
      else if (platform === "vrbo" || platform === "homeaway") url = `https://www.vrbo.com/${encodeURIComponent(pid)}`;
      else if (platform === "booking" || platform === "booking_com" || platform === "booking.com") url = `https://www.booking.com/hotel/${encodeURIComponent(pid)}.html`;
      else continue; // unknown channel — skip rather than guess
    }

    // Canonicalize the platform key. Both VRBO/HomeAway map to 'vrbo'.
    const key = platform === "homeaway" ? "vrbo"
      : platform === "booking_com" || platform === "booking.com" ? "booking"
      : platform;
    // Don't overwrite an earlier entry if the same platform appears twice.
    if (!out[key]) out[key] = url;
  }
  return out;
}
