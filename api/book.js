// /api/book — public endpoint for the /book page (Phase 1 of direct booking).
//
// On submit:
//   1. Saves the booking request to Turso (source of truth).
//   2. Tries to create a held quote in Hospitable via /v2/quotes (best-effort).
//   3. Emails the host via Resend with full trip details (best-effort).
//   4. Forwards a copy to the host's Hospitable Inbox forwarding address if
//      configured (best-effort, same path as /api/contact).
// Steps 2–4 run in parallel via Promise.allSettled so one failure never
// blocks the others or the user-facing success response.
//
// Phase 2 (future): collect Stripe payment, call POST /v2/reservations to
// turn the quote into a confirmed reservation, return reservation ID.

import { getDb, ensureSchema, getSetting, getSecret } from "../lib/db.js";

const HOSPITABLE_BASE = "https://public.api.hospitable.com/v2";
const RESEND_BASE = "https://api.resend.com/emails";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body || {};
  const propertyId = String(body.propertyId || "").trim();
  const propertySlug = String(body.propertySlug || "").trim().slice(0, 120);
  const propertyName = String(body.propertyName || "").trim().slice(0, 200);
  const checkin = String(body.checkin || "").trim();
  const checkout = String(body.checkout || "").trim();
  const guests = clampInt(body.guests, 1, 1, 64);
  const first = String(body.first || "").trim().slice(0, 80);
  const last = String(body.last || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().slice(0, 200);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const smsOptIn = !!body.smsOptIn && body.smsOptIn !== "false" && body.smsOptIn !== "0" ? 1 : 0;
  const message = String(body.message || body.msg || "").trim().slice(0, 5000);
  const promoCode = String(body.promoCode || "").trim().slice(0, 60).toUpperCase();

  if (!propertyId) return res.status(400).json({ ok: false, error: "Missing property." });
  if (!isISODate(checkin) || !isISODate(checkout)) {
    return res.status(400).json({ ok: false, error: "Pick a check-in and check-out date." });
  }
  if (new Date(checkout + "T00:00:00Z") <= new Date(checkin + "T00:00:00Z")) {
    return res.status(400).json({ ok: false, error: "Check-out must be after check-in." });
  }
  if (!first || !email) {
    return res.status(400).json({ ok: false, error: "First name and email are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email address." });
  }

  const nights = Math.round((new Date(checkout + "T00:00:00Z") - new Date(checkin + "T00:00:00Z")) / 86400000);

  const db = getDb();
  if (!db) return res.status(500).json({ ok: false, error: "Database not configured." });
  await ensureSchema();

  const ua = String(req.headers["user-agent"] || "").slice(0, 500);
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim().slice(0, 50);

  // Insert FIRST so the request is durable even if downstream calls fail.
  const ins = await db.execute({
    sql: `INSERT INTO booking_requests
            (property_id, property_slug, property_name, checkin, checkout, nights, guests,
             first_name, last_name, email, phone, sms_opt_in, message, promo_code,
             user_agent, ip)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      propertyId, propertySlug, propertyName, checkin, checkout, nights, guests,
      first, last, email, phone, smsOptIn, message, promoCode || null,
      ua, ip
    ]
  });
  const requestId = Number(ins.lastInsertRowid);

  const ctx = {
    requestId, propertyId, propertySlug, propertyName,
    checkin, checkout, nights, guests,
    first, last, email, phone, smsOptIn, message, promoCode
  };

  // Run integrations in parallel.
  const [quoteResult, emailResult, forwardResult] = await Promise.allSettled([
    createHospitableQuote(ctx),
    sendEmailToHost(ctx),
    forwardToHospitableInbox(ctx)
  ]);

  const hospitable = settled(quoteResult);
  const emailStatus = settled(emailResult);
  const forwardStatus = settled(forwardResult);

  // Persist outcomes for the admin Bookings UI.
  await db.execute({
    sql: `UPDATE booking_requests
            SET hospitable_quote_id = ?, hospitable_status = ?,
                quoted_total = ?, quoted_currency = ?, quoted_breakdown = ?,
                email_status = ?, forward_status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
    args: [
      hospitable.id || null,
      JSON.stringify(hospitable).slice(0, 4000),
      hospitable.total != null ? Number(hospitable.total) : null,
      hospitable.currency || null,
      hospitable.breakdown ? JSON.stringify(hospitable.breakdown).slice(0, 2000) : null,
      JSON.stringify(emailStatus).slice(0, 2000),
      JSON.stringify(forwardStatus).slice(0, 2000),
      requestId
    ]
  });

  return res.status(200).json({
    ok: true,
    requestId,
    quote: hospitable.ok ? {
      id: hospitable.id,
      total: hospitable.total,
      currency: hospitable.currency
    } : null
  });
}

// -----------------------------------------------------------------------------
// Hospitable quote — best-effort creation. If Direct Booking isn't enabled
// or the endpoint isn't available, we capture the error and the booking
// request still lands in the admin Bookings tab + Sheena's email.
// -----------------------------------------------------------------------------
async function createHospitableQuote(ctx) {
  const key = (await getSecret("hospitable_api_key")) || process.env.HOSPITABLE_API_KEY;
  if (!key) return { ok: false, skipped: true, error: "No Hospitable API key configured" };

  const payload = {
    property_id: ctx.propertyId,
    start_date: ctx.checkin,
    end_date: ctx.checkout,
    num_guests: ctx.guests
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
      return {
        ok: false,
        status: r.status,
        error: data?.message || data?.error || text.slice(0, 400) || `HTTP ${r.status}`
      };
    }
    const q = data?.data || data || {};
    const breakdown = pickBreakdown(q);
    const total = numberOrNull(q.total || q.total_price || q.amount);
    return {
      ok: true,
      id: q.id || q.quote_id || null,
      total,
      currency: q.currency || "USD",
      breakdown
    };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 400) };
  }
}

// -----------------------------------------------------------------------------
// Resend → host notification. Subject + body lay out the full trip details
// so Sheena can confirm the booking by hand without opening the admin.
// -----------------------------------------------------------------------------
async function sendEmailToHost(ctx) {
  const apiKey = (await getSecret("resend_api_key")) || process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, error: "No Resend API key configured" };

  const overrides = (await getSetting("overrides", {})) || {};
  const toEmail = overrides?.notifications?.toEmail || overrides?.contact?.email;
  if (!toEmail) return { ok: false, error: "No notification recipient configured" };
  const fromEmail = overrides?.notifications?.fromEmail || "Nyris Retreats <onboarding@resend.dev>";

  const fullName = [ctx.first, ctx.last].filter(Boolean).join(" ") || "(no name)";
  const subject = `Booking request: ${ctx.propertyName || ctx.propertySlug || "stay"} — ${ctx.checkin} to ${ctx.checkout}`;

  const txt =
    `New booking request from your direct booking site.\n\n` +
    `Property:    ${ctx.propertyName || ctx.propertySlug}\n` +
    `Check-in:    ${ctx.checkin}\n` +
    `Check-out:   ${ctx.checkout}  (${ctx.nights} night${ctx.nights === 1 ? "" : "s"})\n` +
    `Guests:      ${ctx.guests}\n` +
    `\n` +
    `Guest:       ${fullName}\n` +
    `Email:       ${ctx.email}\n` +
    (ctx.phone ? `Phone:       ${ctx.phone}\n` : "") +
    `SMS consent: ${ctx.smsOptIn ? "YES — guest opted in" : "no"}\n` +
    (ctx.promoCode ? `Promo code:  ${ctx.promoCode}\n` : "") +
    `\n` +
    (ctx.message ? `Message:\n${ctx.message}\n\n` : "") +
    `Reply directly to this email to reach the guest. ` +
    `Once you've confirmed availability and pricing, send them a payment link from Hospitable to complete the reservation.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 580px; padding: 1.5rem; color: #1a1a1a;">
      <h2 style="margin: 0 0 0.4rem; font-size: 18px;">New booking request</h2>
      <p style="color:#6b7568; margin: 0 0 1.25rem;">Reply directly to this email and the guest will receive your reply.</p>

      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-size: 14px; width: 100%; margin-bottom: 1rem;">
        <tr><td colspan="2" style="background: #FAF6EE; padding: 8px 12px; font-weight: 600; border-radius: 6px;">${esc(ctx.propertyName || ctx.propertySlug || "")}</td></tr>
        <tr><td style="color:#6b7568; width: 110px;">Check-in</td><td><strong>${esc(ctx.checkin)}</strong></td></tr>
        <tr><td style="color:#6b7568;">Check-out</td><td><strong>${esc(ctx.checkout)}</strong> (${ctx.nights} night${ctx.nights === 1 ? "" : "s"})</td></tr>
        <tr><td style="color:#6b7568;">Guests</td><td>${ctx.guests}</td></tr>
      </table>

      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-size: 14px; width: 100%; margin-bottom: 1rem;">
        <tr><td style="color:#6b7568; width: 110px;">Guest</td><td><strong>${esc(fullName)}</strong> &lt;${esc(ctx.email)}&gt;</td></tr>
        ${ctx.phone ? `<tr><td style="color:#6b7568;">Phone</td><td>${esc(ctx.phone)}</td></tr>` : ""}
        <tr><td style="color:#6b7568;">SMS consent</td><td>${ctx.smsOptIn ? '<strong style="color:#2C7A5A;">YES — guest opted in to texts</strong>' : '<span style="color:#B14A3F;">No — do not text</span>'}</td></tr>
        ${ctx.promoCode ? `<tr><td style="color:#6b7568;">Promo code</td><td><code style="background:#FAF6EE; padding: 2px 8px; border-radius: 4px;">${esc(ctx.promoCode)}</code></td></tr>` : ""}
      </table>

      ${ctx.message ? `<div style="border-top: 1px solid #E8DDC9; padding-top: 1rem; white-space: pre-wrap; line-height: 1.55; margin-bottom: 1rem;">${esc(ctx.message)}</div>` : ""}

      <p style="color:#6b7568; font-size: 12px; margin-top: 1.5rem;">
        Once you've confirmed availability and pricing, send the guest a payment link from Hospitable to complete the reservation.
      </p>
    </div>`;

  try {
    const r = await fetch(RESEND_BASE, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: ctx.email,
        subject,
        text: txt,
        html
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, status: r.status, error: data?.message || data?.error || `HTTP ${r.status}` };
    }
    return { ok: true, id: data.id || null, to: toEmail };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 400) };
  }
}

// -----------------------------------------------------------------------------
// Hospitable Inbox forwarding via email gateway. Same pattern as /api/contact:
// emails the host's Hospitable Email-Forwarding address with the guest's
// email in Reply-To so a reply from inside Hospitable goes to the guest.
// -----------------------------------------------------------------------------
async function forwardToHospitableInbox(ctx) {
  const apiKey = (await getSecret("resend_api_key")) || process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, error: "No Resend API key configured" };

  const overrides = (await getSetting("overrides", {})) || {};
  const forwardTo = overrides?.notifications?.hospitableForwardEmail;
  if (!forwardTo) return { ok: false, skipped: true, error: "No Hospitable forwarding address configured" };
  const fromEmail = overrides?.notifications?.fromEmail || "Nyris Retreats <onboarding@resend.dev>";

  const fullName = [ctx.first, ctx.last].filter(Boolean).join(" ") || "(no name)";
  const subject = `Direct booking request: ${ctx.propertyName || ctx.propertySlug} — ${ctx.checkin} to ${ctx.checkout}`;

  const txt =
    `Guest email: ${ctx.email}\n` +
    `Guest name:  ${fullName}\n` +
    (ctx.phone ? `Guest phone: ${ctx.phone}\n` : "") +
    `\n` +
    `Property:    ${ctx.propertyName || ctx.propertySlug}\n` +
    `Check-in:    ${ctx.checkin}\n` +
    `Check-out:   ${ctx.checkout}  (${ctx.nights} night${ctx.nights === 1 ? "" : "s"})\n` +
    `Guests:      ${ctx.guests}\n` +
    `SMS consent: ${ctx.smsOptIn ? "YES — guest opted in" : "no"}\n` +
    (ctx.promoCode ? `Promo code:  ${ctx.promoCode}\n` : "") +
    `\n` +
    (ctx.message ? `------------------------------\n${ctx.message}\n------------------------------\n` : "") +
    `\nReply-to is set to ${ctx.email} so replying from Hospitable's Inbox goes directly to the guest.`;

  try {
    const r = await fetch(RESEND_BASE, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [forwardTo],
        reply_to: ctx.email,
        subject,
        text: txt
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: data?.message || data?.error || `HTTP ${r.status}` };
    return { ok: true, id: data.id || null, to: forwardTo };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 400) };
  }
}

// ---------------------------------------------------------------------------- helpers
function settled(p) {
  return p.status === "fulfilled" ? p.value : { ok: false, error: String(p.reason).slice(0, 400) };
}
function clampInt(v, def, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}
function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime());
}
function numberOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function pickBreakdown(q) {
  const lines = q.line_items || q.lineItems || q.breakdown || q.items;
  if (Array.isArray(lines)) {
    return lines.map(l => ({
      label: l.label || l.description || l.name || l.type || "Item",
      amount: numberOrNull(l.amount || l.price || l.total)
    })).filter(l => l.amount != null);
  }
  const out = [];
  if (numberOrNull(q.subtotal) != null) out.push({ label: "Accommodation subtotal", amount: numberOrNull(q.subtotal) });
  if (numberOrNull(q.cleaning_fee) != null) out.push({ label: "Cleaning fee", amount: numberOrNull(q.cleaning_fee) });
  if (numberOrNull(q.service_fee) != null) out.push({ label: "Service fee", amount: numberOrNull(q.service_fee) });
  if (numberOrNull(q.taxes) != null) out.push({ label: "Taxes", amount: numberOrNull(q.taxes) });
  return out;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
