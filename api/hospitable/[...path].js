// Catch-all router for all /api/hospitable/* routes.

import availability from "./_availability.js";
import calendar from "./_calendar.js";
import property from "./_property.js";
import sync from "./_sync.js";

const ROUTES = {
  "availability": availability,
  "calendar": calendar,
  "property": property,
  "sync": sync
};

export default async function handler(req, res) {
  const segments = req.query.path;
  const path = Array.isArray(segments) ? segments.join("/") : (segments || "");
  const fn = ROUTES[path];
  if (!fn) {
    return res.status(404).json({ ok: false, error: `Unknown hospitable route: ${path}` });
  }
  return fn(req, res);
}
