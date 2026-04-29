// /api/admin/login — server-side admin password verification.
// Replaces the client-side string compare that lived in adminLogin().
// The hash is stored under secret key 'admin_password_hash' as
// 'salt:scrypt(password, salt)' so the plaintext never sits anywhere we
// can reach. First-time login (when the secret hasn't been set yet)
// falls back to the legacy hardcoded password so the site still
// bootstraps; once the host changes their password through the admin UI
// the legacy fallback is no longer used.

import crypto from "node:crypto";
import { getDb, ensureSchema, getSecret, getSetting } from "../../lib/db.js";

const SECRET_KEY = "admin_password_hash";
const LEGACY_PASSWORD = "nyris2026"; // matches the old ADMIN.demoPass
const LEGACY_EMAIL = "sheena@nyrisretreats.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Email and password are required" });
  }

  // Allowed email comes from the overrides blob (admin can edit it through
  // Site content → Admin account); fall back to the legacy address.
  let allowedEmail = LEGACY_EMAIL;
  if (getDb()) {
    try {
      await ensureSchema();
      const o = await getSetting("overrides", {});
      if (typeof o.adminEmail === "string" && o.adminEmail.trim()) {
        allowedEmail = o.adminEmail.trim().toLowerCase();
      }
    } catch { /* fall through to legacy email */ }
  }

  if (email !== allowedEmail) {
    // Generic error so we don't leak which field was wrong.
    return res.status(200).json({ ok: false, error: "Wrong email or password" });
  }

  // Try the stored hash first; fall back to legacy plaintext only when
  // no secret has been saved yet.
  let stored = null;
  if (getDb()) {
    try { stored = await getSecret(SECRET_KEY); } catch { stored = null; }
  }
  if (stored) {
    if (verifyPassword(password, stored)) {
      return res.status(200).json({ ok: true });
    }
    return res.status(200).json({ ok: false, error: "Wrong email or password" });
  }
  // No stored hash yet — accept the legacy password to bootstrap.
  if (password === LEGACY_PASSWORD) {
    return res.status(200).json({ ok: true, mustChangePassword: true });
  }
  return res.status(200).json({ ok: false, error: "Wrong email or password" });
}

// scrypt with a per-password salt — Node's recommended async-safe KDF.
// Stored format is 'salt:hash' (both hex) so we can verify without any
// extra metadata.
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  let computed;
  try {
    computed = crypto.scryptSync(password, salt, 64).toString("hex");
  } catch { return false; }
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try { return crypto.timingSafeEqual(a, b); }
  catch { return false; }
}
