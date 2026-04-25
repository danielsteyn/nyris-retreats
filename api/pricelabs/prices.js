// /api/pricelabs/prices?listing_id=...&start=...&end=... — daily price recommendations
import { resolveApiKey } from "../../lib/db.js";

const PRICELABS_BASE = "https://api.pricelabs.co/v1";

export default async function handler(req, res) {
  const { key } = await resolveApiKey("pricelabs_api_key", "PRICELABS_API_KEY");
  const { listing_id, start, end } = req.query || {};
  if (!listing_id) return res.status(400).json({ error: "listing_id required" });
  if (!key) return res.status(200).json({ ok: false, mock: true, error: "PriceLabs API key not configured" });

  try {
    const startDate = start || new Date().toISOString().slice(0, 10);
    const endDate = end || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const r = await fetch(`${PRICELABS_BASE}/listing_prices?listing_id=${listing_id}&date_from=${startDate}&date_to=${endDate}`, {
      headers: { "X-API-Key": key, Accept: "application/json" }
    });
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: `PriceLabs API ${r.status}` });
    }
    const data = await r.json();
    return res.status(200).json({ ok: true, prices: data.data || data, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
