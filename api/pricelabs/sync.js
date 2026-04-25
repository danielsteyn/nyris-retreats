// /api/pricelabs/sync — pull listings + price recommendations from PriceLabs
// Set PRICELABS_API_KEY in Vercel env vars.

const PRICELABS_BASE = "https://api.pricelabs.co/v1";

export default async function handler(req, res) {
  const key = process.env.PRICELABS_API_KEY;
  if (!key) {
    return res.status(200).json({
      ok: false, mock: true,
      error: "PRICELABS_API_KEY not set on Vercel",
      hint: "Get your API key from PriceLabs → Account → Integrations, add to Vercel env vars."
    });
  }

  try {
    const r = await fetch(`${PRICELABS_BASE}/listings`, {
      headers: { "X-API-Key": key, Accept: "application/json" }
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ ok: false, error: `PriceLabs API ${r.status}`, detail: text.slice(0, 500) });
    }
    const data = await r.json();
    return res.status(200).json({
      ok: true,
      listings: (data.listings || data || []).map(l => ({
        id: l.id || l.listing_id,
        name: l.name,
        pms: l.pms || l.platform,
        currency: l.currency,
        avg_price: l.avg_price,
        active: l.active !== false
      })),
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
