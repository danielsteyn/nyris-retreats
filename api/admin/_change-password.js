// /api/admin/change-password — set a new admin password.
// Requires the current password as proof of identity (the only auth
// gate the system has today). Stores the new password as 'salt:scrypt'
// in the secrets table under key 'admin_password_hash'. Subsequent
// /api/admin/login calls validate against this hash; the legacy
// fallback password stops working once a hash has been saved.

import crypto from "node:crypto";
import { getDb, ensureSchema, getSecret, setSecret } from "../../lib/db.js";

const SECRET_KEY = "admin_password_hash";
const LEGACY_PASSWORD = "nyris2026";
const MIN_LENGTH = 10;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const db = getDb();
  if (!db) {
    return res.status(200).json({
      ok: false,
      error: "Server-side storage isn't configured (Turso). Password rotation needs a database to live in."
    });
  }
  await ensureSchema();

  const body = req.body || {};
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: "Both current and new passwords are required" });
  }
  if (newPassword.length < MIN_LENGTH) {
    return res.status(400).json({ ok: false, error: `New password must be at least ${MIN_LENGTH} characters` });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ ok: false, error: "New password must be different from the current one" });
  }

  // Validate current password against the stored hash, falling back to
  // the legacy plaintext when no hash has been saved yet (first rotation).
  let stored = null;
  try { stored = await getSecret(SECRET_KEY); } catch { stored = null; }
  let currentOk = false;
  if (stored) {
    currentOk = verifyPassword(currentPassword, stored);
  } else {
    currentOk = currentPassword === LEGACY_PASSWORD;
  }
  if (!currentOk) {
    return res.status(200).json({ ok: false, error: "Current password is incorrect" });
  }

  // Hash new password with a fresh salt and store. setSecret encrypts
  // the value at rest with AES-256-GCM, so we get hash-then-encrypt
  // without writing extra plumbing.
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(newPassword, salt, 64).toString("hex");
  await setSecret(SECRET_KEY, `${salt}:${hash}`);

  return res.status(200).json({ ok: true });
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  let computed;
  try { computed = crypto.scryptSync(password, salt, 64).toString("hex"); }
  catch { return false; }
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try { return crypto.timingSafeEqual(a, b); }
  catch { return false; }
}
