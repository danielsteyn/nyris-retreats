// Catch-all router for all /api/pricelabs/* routes.

import prices from "./_prices.js";
import sync from "./_sync.js";

const ROUTES = {
  "prices": prices,
  "sync": sync
};

export default async function handler(req, res) {
  let path = "";
  try {
    const u = (req.url || "").split("?")[0];
    const m = u.match(/^\/api\/pricelabs\/(.+?)\/?$/);
    if (m) path = m[1];
  } catch {}
  if (!path) {
    const segments = req.query?.path;
    path = Array.isArray(segments) ? segments.join("/") : (segments || "");
  }
  const fn = ROUTES[path];
  if (!fn) {
    return res.status(404).json({ ok: false, error: `Unknown pricelabs route: ${path}` });
  }
  return fn(req, res);
}
