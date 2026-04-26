// Catch-all router for all /api/admin/* routes.
// Consolidating to one Serverless Function to stay within Vercel Hobby's 12-function limit.

import cronStatus from "./_cron-status.js";
import overrides from "./_overrides.js";
import photos from "./_photos.js";
import secrets from "./_secrets.js";
import syncLog from "./_sync-log.js";
import upload from "./_upload.js";
import setupActivate from "./setup/_activate.js";
import setupTursoTest from "./setup/_turso-test.js";
import setupVercel from "./setup/_vercel.js";

const ROUTES = {
  "cron-status": cronStatus,
  "overrides": overrides,
  "photos": photos,
  "secrets": secrets,
  "sync-log": syncLog,
  "upload": upload,
  "setup/activate": setupActivate,
  "setup/turso-test": setupTursoTest,
  "setup/vercel": setupVercel
};

// /api/admin/upload accepts ~6MB JSON bodies for base64-encoded photos
export const config = {
  api: {
    bodyParser: { sizeLimit: "6mb" }
  }
};

export default async function handler(req, res) {
  // Prefer req.url parsing (works regardless of how Vercel maps the catch-all)
  let path = "";
  try {
    const u = (req.url || "").split("?")[0];
    const m = u.match(/^\/api\/admin\/(.+?)\/?$/);
    if (m) path = m[1];
  } catch {}
  if (!path) {
    const segments = req.query?.path;
    path = Array.isArray(segments) ? segments.join("/") : (segments || "");
  }
  const fn = ROUTES[path];
  if (!fn) {
    return res.status(404).json({ ok: false, error: `Unknown admin route: ${path}`, available: Object.keys(ROUTES) });
  }
  return fn(req, res);
}
