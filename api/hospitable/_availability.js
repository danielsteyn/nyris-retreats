// /api/hospitable/availability — POST search-properties with dates + guests for live pricing
import { resolveApiKey } from "../../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { key } = await resolveApiKey(req, "hospitable_api_key", "HOSPITABLE_API_KEY");
  const body = req.method === "POST" ? (req.body || {}) : (req.query || {});
  const { checkin, checkout, guests } = body;
  if (!checkin || !checkout) return res.status(400).json({ error: "checkin and checkout required" });
  if (!key) return res.status(200).json({ ok: false, mock: true, error: "Hospitable API key not configured" });

  try {
    const params = new URLSearchParams();
    params.set("start_date", checkin);
    params.set("end_date", checkout);
    if (guests) params.set("adults", String(guests));
    const r = await fetch(`${HOSPITABLE_BASE}/properties/search?${params}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: `Hospitable API ${r.status}` });
    }
    const data = await r.json();
    return res.status(200).json({ ok: true, results: data.data || [], fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
