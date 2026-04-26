// /api/admin/setup/activate — orchestrates the whole sync activation:
// 1. validates Turso credentials
// 2. generates CRON_SECRET
// 3. uses the Vercel API token to set TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, and CRON_SECRET on the project
// 4. triggers a production redeploy
// Returns the deployment URL + CRON_SECRET (the admin needs it for GitHub Actions).

import crypto from "crypto";
import { createClient } from "@libsql/client";

const VERCEL = "https://api.vercel.com";

function vercelFetch(path, opts, vercelToken, teamId) {
  const url = new URL(VERCEL + path);
  if (teamId) url.searchParams.set("teamId", teamId);
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts?.headers || {}),
      "Authorization": `Bearer ${vercelToken}`,
      "Content-Type": "application/json"
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const { vercelToken, projectId, teamId, tursoUrl, tursoToken } = req.body || {};
  if (!vercelToken) return res.status(400).json({ ok: false, error: "vercelToken required" });
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });
  if (!tursoUrl || !tursoToken) return res.status(400).json({ ok: false, error: "tursoUrl and tursoToken required" });

  const log = [];
  const step = (msg) => log.push(`[${new Date().toISOString().split("T")[1].split(".")[0]}] ${msg}`);

  try {
    // Step 1: Validate Turso
    step("Testing Turso connection…");
    try {
      const client = createClient({ url: tursoUrl, authToken: tursoToken });
      const r = await client.execute("SELECT 1 as ok");
      if (r.rows[0]?.ok !== 1) throw new Error("unexpected response");
      step("  ✓ Turso credentials valid");
    } catch (e) {
      return res.status(200).json({ ok: false, step: "turso-validate", error: String(e.message || e), log });
    }

    // Step 2: Generate CRON_SECRET
    step("Generating CRON_SECRET…");
    const cronSecret = crypto.randomBytes(32).toString("base64url");
    step(`  ✓ ${cronSecret.length}-char secret generated`);

    // Step 3: Validate Vercel token
    step("Validating Vercel API token…");
    const u = await vercelFetch("/v2/user", { method: "GET" }, vercelToken);
    if (!u.ok) {
      return res.status(200).json({ ok: false, step: "vercel-validate", error: `Vercel token invalid (${u.status})`, log });
    }
    const userJ = await u.json();
    step(`  ✓ Authenticated as ${userJ.user?.email || userJ.user?.username}`);

    // Step 4: Set env vars
    step(`Setting env vars on project…`);
    const envVars = {
      TURSO_DATABASE_URL: tursoUrl,
      TURSO_AUTH_TOKEN: tursoToken,
      CRON_SECRET: cronSecret
    };

    const listR = await vercelFetch(`/v9/projects/${projectId}/env`, { method: "GET" }, vercelToken, teamId);
    if (!listR.ok) {
      return res.status(200).json({ ok: false, step: "list-env", error: `Vercel list env ${listR.status}`, log });
    }
    const listJ = await listR.json();
    const existing = new Map((listJ.envs || []).map(e => [e.key, e]));

    for (const [key, value] of Object.entries(envVars)) {
      if (existing.has(key)) {
        const id = existing.get(key).id;
        const r = await vercelFetch(`/v9/projects/${projectId}/env/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ value, target: ["production", "preview", "development"], type: "encrypted" })
        }, vercelToken, teamId);
        if (!r.ok) {
          const detail = (await r.text()).slice(0, 300);
          return res.status(200).json({ ok: false, step: "set-env", key, error: `Update ${key} failed (${r.status})`, detail, log });
        }
        step(`  ✓ updated ${key}`);
      } else {
        const r = await vercelFetch(`/v10/projects/${projectId}/env`, {
          method: "POST",
          body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview", "development"] })
        }, vercelToken, teamId);
        if (!r.ok) {
          const detail = (await r.text()).slice(0, 300);
          return res.status(200).json({ ok: false, step: "set-env", key, error: `Create ${key} failed (${r.status})`, detail, log });
        }
        step(`  ✓ created ${key}`);
      }
    }

    // Step 5: Trigger redeploy
    step("Triggering production redeploy…");
    const lr = await vercelFetch(`/v6/deployments?projectId=${projectId}&limit=1&target=production&state=READY`, { method: "GET" }, vercelToken, teamId);
    if (!lr.ok) {
      return res.status(200).json({ ok: false, step: "find-deployment", error: `Vercel deployments ${lr.status}`, log });
    }
    const lj = await lr.json();
    const last = lj.deployments?.[0];
    if (!last) {
      return res.status(200).json({ ok: false, step: "find-deployment", error: "No prior production deployment found to redeploy", log });
    }

    const dr = await vercelFetch("/v13/deployments", {
      method: "POST",
      body: JSON.stringify({
        name: last.name,
        deploymentId: last.uid,
        target: "production",
        meta: { triggeredBy: "nyris-admin-setup-wizard" }
      })
    }, vercelToken, teamId);
    const dj = await dr.json();
    if (!dr.ok) {
      return res.status(200).json({ ok: false, step: "redeploy", error: `Redeploy failed (${dr.status})`, detail: dj, log });
    }
    step(`  ✓ Redeploy triggered: ${dj.url || dj.id}`);
    step("Sync activation complete. New deployment will be live in ~30 seconds.");

    return res.status(200).json({
      ok: true,
      deployment: {
        id: dj.id,
        url: dj.url ? `https://${dj.url}` : null,
        inspectorUrl: dj.inspectorUrl,
        state: dj.readyState
      },
      cronSecret, // returned ONCE so the admin can paste it into GitHub repo secrets
      log
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e), log });
  }
}
