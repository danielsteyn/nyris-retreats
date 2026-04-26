// Catch-all router for all /api/admin/* routes.
// Consolidating to one Serverless Function to stay within Vercel Hobby's 12-function limit.

import cronStatus from "./_cron-status.js";
import overrides from "./_overrides.js";
import photos from "./_photos.js";
import secrets from "./_secrets.js";
import syncLog from "./_sync-log.js";
import setupActivate from "./setup/_activate.js";
import setupTursoTest from "./setup/_turso-test.js";
import setupVercel from "./setup/_vercel.js";

const ROUTES = {
  "cron-status": cronStatus,
  "overrides": overrides,
  "photos": photos,
  "secrets": secrets,
  "sync-log": syncLog,
  "setup/activate": setupActivate,
  "setup/turso-test": setupTursoTest,
  "setup/vercel": setupVercel
};

export default async function handler(req, res) {
  const segments = req.query.path;
  const path = Array.isArray(segments) ? segments.join("/") : (segments || "");
  const fn = ROUTES[path];
  if (!fn) {
    return res.status(404).json({ ok: false, error: `Unknown admin route: ${path}` });
  }
  return fn(req, res);
}
