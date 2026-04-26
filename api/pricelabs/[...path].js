// Catch-all router for all /api/pricelabs/* routes.

import prices from "./_prices.js";
import sync from "./_sync.js";

const ROUTES = {
  "prices": prices,
  "sync": sync
};

export default async function handler(req, res) {
  const segments = req.query.path;
  const path = Array.isArray(segments) ? segments.join("/") : (segments || "");
  const fn = ROUTES[path];
  if (!fn) {
    return res.status(404).json({ ok: false, error: `Unknown pricelabs route: ${path}` });
  }
  return fn(req, res);
}
