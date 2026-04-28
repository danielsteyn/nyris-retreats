// Catch-all router for all /api/hospitable/* routes.

import availability from "./_availability.js";
import calendar from "./_calendar.js";
import listings from "./_listings.js";
import property from "./_property.js";
import quote from "./_quote.js";
import reviews from "./_reviews.js";
import sync from "./_sync.js";

const ROUTES = {
  "availability": availability,
  "calendar": calendar,
  "listings": listings,
  "property": property,
  "quote": quote,
  "reviews": reviews,
  "sync": sync
};

export default async function handler(req, res) {
  let path = "";
  try {
    const u = (req.url || "").split("?")[0];
    const m = u.match(/^\/api\/hospitable\/(.+?)\/?$/);
    if (m) path = m[1];
  } catch {}
  if (!path) {
    const segments = req.query?.path;
    path = Array.isArray(segments) ? segments.join("/") : (segments || "");
  }
  const fn = ROUTES[path];
  if (!fn) {
    return res.status(404).json({ ok: false, error: `Unknown hospitable route: ${path}` });
  }
  return fn(req, res);
}
