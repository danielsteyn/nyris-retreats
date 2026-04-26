// /api/admin/setup/vercel — Vercel API proxy used by the admin Setup Wizard.
// Accepts a Vercel API token from the admin (in the request body), uses it
// to: validate the token, list projects, set env vars, trigger a redeploy.
//
// The token is NEVER stored server-side — it's used in-flight only.
//
// Body shape:
//   { action: "validate", vercelToken }
//   { action: "list-projects", vercelToken, teamId? }
//   { action: "list-deployments", vercelToken, projectId, teamId? }
//   { action: "set-env-vars", vercelToken, projectId, teamId?, envVars: { KEY: VALUE, ... } }
//   { action: "redeploy", vercelToken, projectId, teamId? }

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
  const { action, vercelToken, teamId, projectId, envVars } = req.body || {};
  if (!vercelToken || typeof vercelToken !== "string" || vercelToken.length < 20) {
    return res.status(400).json({ ok: false, error: "vercelToken required" });
  }

  try {
    if (action === "validate") {
      const r = await vercelFetch("/v2/user", { method: "GET" }, vercelToken);
      if (!r.ok) {
        const t = await r.text();
        return res.status(r.status).json({ ok: false, error: `Vercel token invalid (${r.status})`, detail: t.slice(0, 300) });
      }
      const j = await r.json();
      // also try team list
      const tr = await vercelFetch("/v2/teams", { method: "GET" }, vercelToken);
      const teams = tr.ok ? (await tr.json()).teams : [];
      return res.status(200).json({
        ok: true,
        user: { id: j.user?.id, name: j.user?.name, email: j.user?.email, username: j.user?.username },
        teams: teams.map(t => ({ id: t.id, slug: t.slug, name: t.name }))
      });
    }

    if (action === "list-projects") {
      const r = await vercelFetch("/v9/projects?limit=50", { method: "GET" }, vercelToken, teamId);
      if (!r.ok) return res.status(r.status).json({ ok: false, error: `Vercel ${r.status}` });
      const j = await r.json();
      const projects = (j.projects || []).map(p => ({
        id: p.id,
        name: p.name,
        framework: p.framework,
        latestDeploymentId: p.latestDeployments?.[0]?.uid,
        url: p.targets?.production?.url || p.alias?.[0]?.domain
      }));
      return res.status(200).json({ ok: true, projects });
    }

    if (action === "list-deployments") {
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });
      const r = await vercelFetch(`/v6/deployments?projectId=${projectId}&limit=10&target=production`, { method: "GET" }, vercelToken, teamId);
      if (!r.ok) return res.status(r.status).json({ ok: false, error: `Vercel ${r.status}` });
      const j = await r.json();
      return res.status(200).json({ ok: true, deployments: j.deployments || [] });
    }

    if (action === "set-env-vars") {
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });
      if (!envVars || typeof envVars !== "object") return res.status(400).json({ ok: false, error: "envVars object required" });

      // Fetch existing env vars to detect collisions (we'll PATCH instead of POST in that case).
      const listR = await vercelFetch(`/v9/projects/${projectId}/env`, { method: "GET" }, vercelToken, teamId);
      if (!listR.ok) return res.status(listR.status).json({ ok: false, error: `Vercel list env ${listR.status}` });
      const listJ = await listR.json();
      const existing = new Map((listJ.envs || []).map(e => [e.key, e]));

      const results = [];
      for (const [key, value] of Object.entries(envVars)) {
        if (!value || typeof value !== "string") {
          results.push({ key, status: "skipped", reason: "empty value" });
          continue;
        }
        const body = {
          key, value,
          type: "encrypted",
          target: ["production", "preview", "development"]
        };
        let r;
        if (existing.has(key)) {
          // Update existing
          const id = existing.get(key).id;
          r = await vercelFetch(`/v9/projects/${projectId}/env/${id}`, {
            method: "PATCH", body: JSON.stringify({ value, target: body.target, type: body.type })
          }, vercelToken, teamId);
          results.push({ key, status: r.ok ? "updated" : "error", code: r.status });
        } else {
          r = await vercelFetch(`/v10/projects/${projectId}/env`, {
            method: "POST", body: JSON.stringify(body)
          }, vercelToken, teamId);
          results.push({ key, status: r.ok ? "created" : "error", code: r.status });
        }
        if (!r.ok) {
          try { results[results.length - 1].detail = (await r.text()).slice(0, 300); } catch {}
        }
      }
      return res.status(200).json({ ok: true, results });
    }

    if (action === "redeploy") {
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });
      // Find latest production deployment to redeploy from
      const lr = await vercelFetch(`/v6/deployments?projectId=${projectId}&limit=1&target=production&state=READY`, { method: "GET" }, vercelToken, teamId);
      if (!lr.ok) return res.status(lr.status).json({ ok: false, error: `Vercel deployments ${lr.status}` });
      const lj = await lr.json();
      const last = lj.deployments?.[0];
      if (!last) return res.status(404).json({ ok: false, error: "No prior production deployment to redeploy" });

      // Trigger redeploy by reusing the deployment ID
      const r = await vercelFetch(`/v13/deployments`, {
        method: "POST",
        body: JSON.stringify({
          name: last.name,
          deploymentId: last.uid,
          target: "production",
          meta: { redeployedBy: "nyris-admin-setup-wizard", reason: "env-vars-updated" }
        })
      }, vercelToken, teamId);
      const j = await r.json();
      if (!r.ok) return res.status(r.status).json({ ok: false, error: `Redeploy failed (${r.status})`, detail: j });
      return res.status(200).json({
        ok: true,
        deployment: {
          id: j.id,
          url: j.url,
          state: j.readyState,
          inspectorUrl: j.inspectorUrl
        }
      });
    }

    return res.status(400).json({ ok: false, error: "unknown action" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
