// /api/discounts — public endpoint used by the checkout page.
//
// POST { action: "validate", code, subtotal }
//   → checks code is active, not expired, has remaining uses
//   → returns { ok, valid, type, value, discountAmount, message }
//
// POST { action: "redeem", code, subtotal, propertyId?, guestEmail? }
//   → atomically validates AND increments times_used (within a transaction)
//   → records a row in discount_redemptions
//   → returns { ok, redeemed, discountAmount, ... }
//
// Validation never burns a use; only redeem does. The checkout flow calls
// validate when the guest clicks Apply, then redeem when they confirm.

import { getDb, ensureSchema } from "../lib/db.js";

function computeDiscount(type, value, subtotal) {
  if (type === "percent") {
    return Math.min(subtotal, Math.round(subtotal * (value / 100)));
  }
  return Math.min(subtotal, Math.round(value));
}

function checkCode(row, subtotal) {
  if (!row) return { valid: false, reason: "Code not found." };
  if (!row.active) return { valid: false, reason: "This code is no longer active." };
  if (row.expires_at) {
    const today = new Date().toISOString().slice(0, 10);
    if (today > row.expires_at) return { valid: false, reason: "This code has expired." };
  }
  if (row.max_uses != null && row.times_used >= row.max_uses) {
    return { valid: false, reason: "This code has reached its usage limit." };
  }
  const subtotalNum = Number(subtotal) || 0;
  if (subtotalNum <= 0) return { valid: false, reason: "Pick dates first to apply a code." };
  const discount = computeDiscount(row.type, Number(row.value), subtotalNum);
  return {
    valid: true,
    type: row.type,
    value: Number(row.value),
    discountAmount: discount,
    description: row.description || null,
    label: row.type === "percent"
      ? `${row.value}% off`
      : `$${Math.round(row.value).toLocaleString()} off`
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const db = getDb();
  if (!db) {
    return res.status(200).json({
      ok: false,
      error: "Promo codes require Turso (server-side storage). Connect Turso in admin first."
    });
  }
  await ensureSchema();

  const { action, code, subtotal, propertyId, guestEmail } = req.body || {};
  const norm = String(code || "").trim().toUpperCase();
  if (!norm) return res.status(400).json({ ok: false, error: "code required" });

  // Look up the code
  const r = await db.execute({
    sql: `SELECT code, type, value, max_uses, times_used, expires_at, active, description
          FROM discount_codes WHERE code = ?`,
    args: [norm]
  });
  const row = r.rows[0];
  const check = checkCode(row, subtotal);

  if (action === "validate") {
    return res.status(200).json({ ok: true, ...check, code: norm });
  }

  if (action === "redeem") {
    if (!check.valid) return res.status(200).json({ ok: false, ...check });

    // Atomic check-and-increment so concurrent redemptions don't oversell
    // a one-time-use code. Use a conditional UPDATE that only succeeds if
    // there are uses left.
    const upd = await db.execute({
      sql: `UPDATE discount_codes
            SET times_used = times_used + 1, updated_at = CURRENT_TIMESTAMP
            WHERE code = ?
              AND active = 1
              AND (max_uses IS NULL OR times_used < max_uses)
              AND (expires_at IS NULL OR expires_at >= ?)`,
      args: [norm, new Date().toISOString().slice(0, 10)]
    });
    if (!upd.rowsAffected) {
      return res.status(200).json({ ok: false, valid: false, reason: "Code is no longer redeemable (used up or expired since validation)." });
    }
    await db.execute({
      sql: `INSERT INTO discount_redemptions (code, property_id, guest_email, amount_discounted, total_after)
            VALUES (?, ?, ?, ?, ?)`,
      args: [norm, propertyId || null, guestEmail || null, check.discountAmount, Math.max(0, Number(subtotal) - check.discountAmount)]
    });
    return res.status(200).json({ ok: true, redeemed: true, ...check, code: norm });
  }

  return res.status(400).json({ ok: false, error: "action must be 'validate' or 'redeem'" });
}
