// /api/admin/setup/turso-test — validate Turso DB credentials before saving.
// Body: { url, authToken }
// Returns ok:true if credentials authenticate successfully.

import { createClient } from "@libsql/client";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const { url, authToken } = req.body || {};
  if (!url || !authToken) return res.status(400).json({ ok: false, error: "url and authToken required" });

  try {
    const client = createClient({ url, authToken });
    const r = await client.execute("SELECT 1 as ok");
    if (r.rows[0]?.ok !== 1) {
      return res.status(200).json({ ok: false, error: "DB returned unexpected result" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = String(e.message || e);
    let hint = "";
    if (msg.includes("UNAUTHORIZED") || msg.includes("403")) hint = "Token rejected — re-create with `turso db tokens create`.";
    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) hint = "URL hostname couldn't be resolved — double-check the libsql:// URL.";
    return res.status(200).json({ ok: false, error: msg, hint });
  }
}
