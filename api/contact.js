// /api/contact — public endpoint for the /contact page form.
// On submit:
//   1. Saves the submission to Turso (source of truth — never lose a message).
//   2. Forwards a copy to Hospitable's email gateway (admin-configurable
//      forwarding address) so it lands in their Inbox alongside Airbnb / Vrbo
//      messages. Best-effort; Hospitable's REST API doesn't expose external
//      inquiry creation, so this email-based path is the supported route.
//   3. Emails the host via Resend (best-effort).
// Steps 2 + 3 run in parallel via Resend. Status of each channel is captured
// in the row so the admin Inbox shows per-row outcomes.

import { getDb, ensureSchema, getSetting, getSecret } from "../lib/db.js";

const RESEND_BASE = "https://api.resend.com/emails";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body || {};
  const first = String(body.first || "").trim().slice(0, 80);
  const last = String(body.last || "").trim().slice(0, 80);
  const email = String(body.email || "").trim().slice(0, 200);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const topic = String(body.topic || "general").trim().slice(0, 60);
  const message = String(body.msg || body.message || "").trim().slice(0, 5000);
  // Checkbox arrives as "yes" when checked, undefined when not. Coerce
  // anything truthy-ish to 1 so legacy clients still work.
  const smsOptIn = !!body.smsOptIn && body.smsOptIn !== "false" && body.smsOptIn !== "0" ? 1 : 0;

  if (!first || !email || !message) {
    return res.status(400).json({ ok: false, error: "First name, email, and message are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "Invalid email address." });
  }

  const db = getDb();
  if (!db) return res.status(500).json({ ok: false, error: "Database not configured." });
  await ensureSchema();

  const ua = String(req.headers["user-agent"] || "").slice(0, 500);
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim().slice(0, 50);

  // Insert FIRST so the message is durable even if downstream calls fail.
  const ins = await db.execute({
    sql: `INSERT INTO contact_submissions
            (first_name, last_name, email, phone, topic, message, sms_opt_in, user_agent, ip)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [first, last, email, phone, topic, message, smsOptIn, ua, ip]
  });
  const submissionId = Number(ins.lastInsertRowid);

  // Run integrations in parallel; allSettled so one failure doesn't kill the
  // other. Both return structured status objects we can persist + display.
  const [hospitable, emailRes] = await Promise.allSettled([
    forwardToHospitable({ first, last, email, phone, topic, message, smsOptIn }),
    sendEmailToHost({ first, last, email, phone, topic, message, smsOptIn })
  ]);

  const hospitableStatus = hospitable.status === "fulfilled"
    ? hospitable.value
    : { ok: false, error: String(hospitable.reason) };
  const emailStatus = emailRes.status === "fulfilled"
    ? emailRes.value
    : { ok: false, error: String(emailRes.reason) };

  await db.execute({
    sql: `UPDATE contact_submissions
            SET hospitable_inquiry_id = ?, hospitable_status = ?, email_status = ?
          WHERE id = ?`,
    args: [
      hospitableStatus.id || null,
      JSON.stringify(hospitableStatus).slice(0, 4000),
      JSON.stringify(emailStatus).slice(0, 2000),
      submissionId
    ]
  });

  // Return success regardless of integration outcomes — the user's message
  // is saved. The admin sees per-channel failures in the Inbox.
  return res.status(200).json({ ok: true, id: submissionId });
}

// -----------------------------------------------------------------------------
// Hospitable forwarding via email gateway.
// Hospitable's REST API is read-only for inquiries (see commit history), so
// instead we send the message to the host's Hospitable email-forwarding
// address (configured in admin → Site content → Contact info → Email
// notifications). Hospitable parses inbound emails into Inbox conversations.
//
// Caveat: we can't legitimately spoof the guest's email in the From header
// (SPF/DKIM forbids it), so:
//   - From:     the configured sender (Resend default or verified domain)
//   - Reply-To: the guest's email — so a reply from Hospitable's UI goes
//                to the actual guest
//   - Body:     guest contact info is repeated in the first lines, so even
//                if Hospitable's parser only catches the From, the host can
//                see the originator at a glance.
// -----------------------------------------------------------------------------
async function forwardToHospitable(input) {
  const apiKey = (await getSecret("resend_api_key")) || process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, error: "No Resend API key configured" };

  const overrides = (await getSetting("overrides", {})) || {};
  const forwardTo = overrides?.notifications?.hospitableForwardEmail;
  if (!forwardTo) {
    return { ok: false, skipped: true, error: "No Hospitable forwarding address configured. Find it in Hospitable → Inbox → Email forwarding and paste it in admin → Contact info → Email notifications." };
  }
  const fromEmail = overrides?.notifications?.fromEmail || "Nyris Retreats <onboarding@resend.dev>";

  const { first, last, email, phone, topic, message, smsOptIn } = input;
  const fullName = [first, last].filter(Boolean).join(" ") || "(no name)";
  const subject = `Direct booking inquiry from ${fullName} — ${topic}`;
  const smsLine = smsOptIn
    ? "SMS consent: YES — guest agreed to receive text messages at the phone above."
    : "SMS consent: no — do not text this guest.";

  // Plain-text body. Lead with the guest's email so it's the first thing
  // Hospitable's parser (or a human eye) sees, not buried below the message.
  const txt =
    `Guest email: ${email}\n` +
    `Guest name:  ${fullName}\n` +
    (phone ? `Guest phone: ${phone}\n` : "") +
    `Topic:       ${topic}\n` +
    `${smsLine}\n` +
    `\n` +
    `------------------------------\n` +
    `${message}\n` +
    `------------------------------\n` +
    `\n` +
    `Reply-to on this email is set to the guest's address (${email}), ` +
    `so replying from Hospitable's Inbox will go directly to them.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; padding: 1.25rem; color: #1a1a1a;">
      <table cellpadding="4" cellspacing="0" style="font-size: 14px; margin-bottom: 1rem;">
        <tr><td style="color:#6b7568; padding-right: 12px;">Guest email</td><td><strong>${esc(email)}</strong></td></tr>
        <tr><td style="color:#6b7568; padding-right: 12px;">Guest name</td><td>${esc(fullName)}</td></tr>
        ${phone ? `<tr><td style="color:#6b7568; padding-right: 12px;">Guest phone</td><td>${esc(phone)}</td></tr>` : ""}
        <tr><td style="color:#6b7568; padding-right: 12px;">Topic</td><td>${esc(topic)}</td></tr>
        <tr><td style="color:#6b7568; padding-right: 12px;">SMS consent</td><td>${smsOptIn ? '<strong style="color:#2C7A5A;">YES — guest opted in to texts</strong>' : '<span style="color:#B14A3F;">No — do not text</span>'}</td></tr>
      </table>
      <div style="border-top: 1px solid #E8DDC9; padding-top: 1rem; white-space: pre-wrap; line-height: 1.55;">${esc(message)}</div>
      <p style="color:#6b7568; font-size: 12px; margin-top: 1.5rem;">Reply-to is set to ${esc(email)} — replying from Hospitable's Inbox goes directly to the guest.</p>
    </div>`;

  try {
    const r = await fetch(RESEND_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [forwardTo],
        reply_to: email,
        subject,
        text: txt,
        html
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: data?.message || data?.error || `HTTP ${r.status}`
      };
    }
    return { ok: true, id: data.id || null, to: forwardTo };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 400) };
  }
}

// -----------------------------------------------------------------------------
// Resend: POST /emails — emails the host.
// Recipient: the email saved in admin → Site content → Contact info (falls back
//   to the email baked into data.js if no override is set).
// Sender: admin-configurable; defaults to Resend's onboarding sandbox so the
//   integration works without domain verification on first use.
// -----------------------------------------------------------------------------
async function sendEmailToHost(input) {
  const apiKey = (await getSecret("resend_api_key")) || process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true, error: "No Resend API key configured" };

  const overrides = (await getSetting("overrides", {})) || {};
  const toEmail = overrides?.notifications?.toEmail || overrides?.contact?.email;
  if (!toEmail) {
    return { ok: false, error: "No recipient email — set Contact info or notifications recipient." };
  }
  const fromEmail = overrides?.notifications?.fromEmail || "Nyris Retreats <onboarding@resend.dev>";

  const { first, last, email, phone, topic, message, smsOptIn } = input;
  const fullName = [first, last].filter(Boolean).join(" ");
  const subject = `New inquiry from ${fullName} — ${topic}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; padding: 1.5rem; color: #1a1a1a;">
      <h2 style="margin: 0 0 0.5rem; font-size: 18px;">New message from your direct booking site</h2>
      <p style="color: #6b7568; margin: 0 0 1.5rem;">Reply directly to this email and the guest will receive your reply.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-size: 14px; margin-bottom: 1rem;">
        <tr><td style="color:#6b7568;">From</td><td><strong>${esc(fullName)}</strong> &lt;${esc(email)}&gt;</td></tr>
        ${phone ? `<tr><td style="color:#6b7568;">Phone</td><td>${esc(phone)}</td></tr>` : ""}
        <tr><td style="color:#6b7568;">Topic</td><td>${esc(topic)}</td></tr>
        <tr><td style="color:#6b7568;">SMS consent</td><td>${smsOptIn ? '<strong style="color:#2C7A5A;">YES — guest opted in to texts</strong>' : '<span style="color:#B14A3F;">No — do not text</span>'}</td></tr>
      </table>
      <div style="border-top: 1px solid #E8DDC9; padding-top: 1rem; white-space: pre-wrap; line-height: 1.55;">${esc(message)}</div>
    </div>`;

  const txt = `New message from your direct booking site\n\n` +
    `From: ${fullName} <${email}>\n` +
    (phone ? `Phone: ${phone}\n` : "") +
    `Topic: ${topic}\n` +
    `SMS consent: ${smsOptIn ? "YES — guest opted in" : "no"}\n\n` +
    message;

  try {
    const r = await fetch(RESEND_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject,
        html,
        text: txt
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: data?.message || data?.error || `HTTP ${r.status}`
      };
    }
    return { ok: true, id: data.id || null, to: toEmail };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 400) };
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
