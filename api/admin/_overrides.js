// /api/admin/overrides — GET returns saved overrides; POST saves them.
import { getDb, getSetting, setSetting, ensureSchema } from "../../lib/db.js";

const KEY = "overrides";

export default async function handler(req, res) {
  if (!getDb()) {
    return res.status(200).json({ ok: false, error: "TURSO_DATABASE_URL not set", localFallback: true });
  }
  await ensureSchema();
  if (req.method === "GET") {
    const data = await getSetting(KEY, {});
    return res.status(200).json({ ok: true, data });
  }
  if (req.method === "POST") {
    const body = req.body || {};
    if (typeof body !== "object") return res.status(400).json({ ok: false, error: "invalid body" });
    await setSetting(KEY, body);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
