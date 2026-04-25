// /api/hospitable/sync — proxies Hospitable get-properties + reviews + images.
// API key resolution order: admin-saved (Turso, encrypted) > HOSPITABLE_API_KEY env var.

import { resolveApiKey } from "../../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { key, source } = await resolveApiKey("hospitable_api_key", "HOSPITABLE_API_KEY");
  if (!key) {
    return res.status(200).json({
      ok: false,
      error: "Hospitable API key not configured",
      hint: "Add it in the admin dashboard → Hospitable API tab, or set HOSPITABLE_API_KEY in Vercel env vars.",
      mock: true,
      properties: []
    });
  }

  try {
    const r = await fetch(`${HOSPITABLE_BASE}/properties?per_page=100`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ ok: false, error: `Hospitable API ${r.status}`, detail: text.slice(0, 500) });
    }
    const data = await r.json();
    const properties = (data.data || []).map(p => ({
      id: p.id,
      name: p.name,
      public_name: p.public_name,
      city: p.address?.city,
      state: p.address?.state,
      country: p.address?.country,
      type: p.property_type,
      capacity: p.capacity,
      picture: p.picture,
      summary: p.summary,
      currency: p.currency,
      listed: p.listed,
      coords: p.address?.coordinates,
      checkin: p.checkin,
      checkout: p.checkout,
      amenitiesCount: (p.amenities || []).length
    }));
    return res.status(200).json({
      ok: true,
      properties,
      meta: data.meta,
      keySource: source,
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
