// /api/hospitable/quote — POST { propertyId, checkin, checkout, guests }
// Calls Hospitable's POST /v2/quotes to get the canonical price for the
// requested dates. Returns the quote ID + total + currency + a structured
// breakdown when available.
//
// Defensive: Direct Booking may not be enabled on every account tier, so
// we capture and return the actual API response (including non-2xx errors)
// so the caller can decide whether to fall back to local pricing.

import { resolveApiKey } from "../../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Accept body or query params for flexibility.
  const src = req.method === "POST" ? (req.body || {}) : (req.query || {});
  const propertyId = (src.propertyId || src.uuid || "").toString().trim();
  const checkin = (src.checkin || src.start_date || "").toString().trim();
  const checkout = (src.checkout || src.end_date || "").toString().trim();
  const guests = parseInt(src.guests || src.num_guests || "1", 10);

  if (!propertyId) return res.status(400).json({ ok: false, error: "propertyId required" });
  if (!isISODate(checkin) || !isISODate(checkout)) {
    return res.status(400).json({ ok: false, error: "checkin and checkout must be YYYY-MM-DD" });
  }
  if (new Date(checkout + "T00:00:00Z") <= new Date(checkin + "T00:00:00Z")) {
    return res.status(400).json({ ok: false, error: "checkout must be after checkin" });
  }

  const { key } = await resolveApiKey(req, "hospitable_api_key", "HOSPITABLE_API_KEY");
  if (!key) {
    return res.status(200).json({
      ok: false,
      skipped: true,
      error: "Hospitable API key not configured"
    });
  }

  // Hospitable's quote payload shape (from their public API docs). Field
  // names vary slightly across API versions; we send the canonical v2 shape
  // and surface any error verbatim if their account expects something else.
  const payload = {
    property_id: propertyId,
    start_date: checkin,
    end_date: checkout,
    num_guests: guests || 1
  };

  try {
    const r = await fetch(`${HOSPITABLE_BASE}/quotes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!r.ok) {
      return res.status(200).json({
        ok: false,
        status: r.status,
        error: data?.message || data?.error || text.slice(0, 400) || `HTTP ${r.status}`,
        hint: hintFromStatus(r.status)
      });
    }

    // Normalize the response shape across Hospitable API variations.
    const q = data?.data || data || {};
    const breakdown = pickBreakdown(q);
    return res.status(200).json({
      ok: true,
      quote: {
        id: q.id || q.quote_id || null,
        total: numberOrNull(q.total || q.total_price || q.amount),
        currency: q.currency || q.currency_code || "USD",
        breakdown,
        expiresAt: q.expires_at || q.expiry || null,
        raw: q  // available for the admin UI to inspect
      },
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e).slice(0, 400) });
  }
}

function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime());
}

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Try to extract a clean line-item breakdown from any of the shapes Hospitable
// may return: { line_items }, { breakdown }, { fees }, etc. The client only
// needs labels + amounts.
function pickBreakdown(q) {
  const lines = q.line_items || q.lineItems || q.breakdown || q.items;
  if (Array.isArray(lines)) {
    return lines.map(l => ({
      label: l.label || l.description || l.name || l.type || "Item",
      amount: numberOrNull(l.amount || l.price || l.total),
      currency: l.currency || q.currency || "USD"
    })).filter(l => l.amount != null);
  }
  // Fall back to common standalone fields.
  const out = [];
  if (numberOrNull(q.subtotal) != null) out.push({ label: "Accommodation subtotal", amount: numberOrNull(q.subtotal) });
  if (numberOrNull(q.cleaning_fee) != null) out.push({ label: "Cleaning fee", amount: numberOrNull(q.cleaning_fee) });
  if (numberOrNull(q.service_fee) != null) out.push({ label: "Service fee", amount: numberOrNull(q.service_fee) });
  if (numberOrNull(q.taxes) != null) out.push({ label: "Taxes", amount: numberOrNull(q.taxes) });
  if (numberOrNull(q.deposit) != null) out.push({ label: "Security deposit", amount: numberOrNull(q.deposit) });
  return out;
}

function hintFromStatus(status) {
  if (status === 401) return "Hospitable rejected the API key. Refresh it in admin → Hospitable API.";
  if (status === 403) return "Direct Booking may not be enabled on this Hospitable account. Enable it in Hospitable → Direct → Settings.";
  if (status === 404) return "Quote endpoint not found — your Hospitable plan may not include Direct Booking.";
  if (status === 422) return "Hospitable rejected the request payload (likely the dates aren't bookable, or guest count exceeds capacity).";
  if (status >= 500) return "Hospitable returned a server error. Try again in a moment.";
  return null;
}
