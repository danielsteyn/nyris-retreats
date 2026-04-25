// /api/hospitable/calendar?uuid=...&start=YYYY-MM-DD&end=YYYY-MM-DD
import { resolveApiKey } from "../../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

export default async function handler(req, res) {
  const { key } = await resolveApiKey("hospitable_api_key", "HOSPITABLE_API_KEY");
  const { uuid, start, end } = req.query || {};
  if (!uuid) return res.status(400).json({ error: "uuid required" });
  if (!key) return res.status(200).json({ ok: false, error: "Hospitable API key not configured", mock: true, days: [] });

  try {
    const startDate = start || new Date().toISOString().slice(0, 10);
    const endIso = end || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const r = await fetch(`${HOSPITABLE_BASE}/properties/${uuid}/calendar?start_date=${startDate}&end_date=${endIso}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: `Hospitable API ${r.status}` });
    }
    const data = await r.json();
    const days = (data.data || []).map(d => ({
      date: d.date,
      available: d.availability?.available,
      price: d.price?.amount,
      currency: d.price?.currency,
      minStay: d.min_nights
    }));
    return res.status(200).json({ ok: true, days, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
