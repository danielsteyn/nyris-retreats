// /api/hospitable/sync — proxies Hospitable get-properties + reviews + images.
// Set HOSPITABLE_API_KEY in Vercel env vars (Settings → Environment Variables).

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const key = process.env.HOSPITABLE_API_KEY;
  if (!key) {
    return res.status(200).json({
      ok: false,
      error: "HOSPITABLE_API_KEY not set on Vercel",
      hint: "Set it under Vercel → Project → Settings → Environment Variables, then redeploy.",
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
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
