// /api/admin/test-email — fires a sample email via Resend using the saved
// Resend API key + notifications config so the admin can diagnose delivery
// without submitting a real contact form.
// Returns the actual Resend response on failure so the UI shows the cause.

import { getDb, ensureSchema, getSetting, getSecret } from "../../lib/db.js";

const RESEND_BASE = "https://api.resend.com/emails";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!getDb()) return res.status(200).json({ ok: false, error: "Turso not configured" });
  await ensureSchema();

  const apiKey = (await getSecret("resend_api_key")) || process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ ok: false, error: "No Resend API key saved. Paste a key and click Save key first." });
  }

  const overrides = (await getSetting("overrides", {})) || {};
  const target = (req.body && req.body.target) || "host"; // "host" | "hospitable"
  const fromEmail = overrides?.notifications?.fromEmail || "Nyris Retreats <onboarding@resend.dev>";

  let toEmail;
  if (target === "hospitable") {
    toEmail = overrides?.notifications?.hospitableForwardEmail;
    if (!toEmail) return res.status(200).json({ ok: false, error: "No Hospitable forwarding address saved." });
  } else {
    toEmail = overrides?.notifications?.toEmail || overrides?.contact?.email;
    if (!toEmail) return res.status(200).json({ ok: false, error: "No notification recipient saved (set Contact info → Public email or Notification recipient)." });
  }

  const subject = target === "hospitable"
    ? "Test: direct booking inquiry forwarding"
    : "Test: Nyris Retreats contact form notification";
  const txt = `This is a test email from your Nyris Retreats admin.\n\n` +
              `From:    ${fromEmail}\n` +
              `To:      ${toEmail}\n` +
              `Target:  ${target}\n` +
              `Time:    ${new Date().toISOString()}\n\n` +
              `If you're seeing this, Resend delivery works. The contact form\n` +
              `will use the same path for real submissions.`;

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
        subject,
        text: txt
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(200).json({
        ok: false,
        status: r.status,
        from: fromEmail,
        to: toEmail,
        error: data?.message || data?.error || `HTTP ${r.status}`,
        hint: hintFromError(data?.message || "")
      });
    }
    return res.status(200).json({
      ok: true,
      from: fromEmail,
      to: toEmail,
      messageId: data.id || null
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e).slice(0, 400) });
  }
}

// Translate the most common Resend errors into actionable advice.
function hintFromError(msg) {
  const s = String(msg || "").toLowerCase();
  if (s.includes("testing emails") || s.includes("verify a domain")) {
    return "Resend's sandbox sender (onboarding@resend.dev) can only send to the email address you signed up with. Either set the recipient to your Resend account email, or verify your own domain at resend.com/domains and switch the Sender (\"From\" address) to that domain.";
  }
  if (s.includes("invalid api key") || s.includes("api key")) {
    return "The saved Resend API key is invalid. Generate a fresh one at resend.com/api-keys and re-save.";
  }
  if (s.includes("domain")) {
    return "Sender domain isn't verified in Resend. Either revert Sender to onboarding@resend.dev or finish domain verification at resend.com/domains.";
  }
  return null;
}
