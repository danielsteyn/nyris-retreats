// Nyris Retreats — Admin Dashboard
// Storage strategy: localStorage by default; if /api/admin/* responds, use Turso-backed remote storage.

const ADMIN = {
  authKey: "nyris.admin.session",
  demoEmail: "sheena@nyrisretreats.com",
  demoPass: "nyris2026"
};

// =============================================================================
// Local API-key storage (used when server-side Turso isn't configured).
// Keys live only in this admin browser. They are sent in headers per request
// to the integration API routes (X-Hospitable-Api-Key / X-Pricelabs-Api-Key)
// so the server never persists them.
// =============================================================================
const LocalKeys = {
  storageKey: "nyris.localKeys",
  metaKey: "nyris.localKeys.meta",
  _all() { try { return JSON.parse(localStorage.getItem(this.storageKey) || "{}"); } catch { return {}; } },
  _meta() { try { return JSON.parse(localStorage.getItem(this.metaKey) || "{}"); } catch { return {}; } },
  get(name) { return this._all()[name] || null; },
  getMeta(name) {
    const v = this.get(name);
    if (!v) return null;
    return { last4: String(v).slice(-4), updatedAt: this._meta()[name] || null };
  },
  set(name, value) {
    const all = this._all(); all[name] = value;
    const m = this._meta(); m[name] = new Date().toISOString();
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(all));
      localStorage.setItem(this.metaKey, JSON.stringify(m));
    } catch {}
  },
  remove(name) {
    const all = this._all(); delete all[name];
    const m = this._meta(); delete m[name];
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(all));
      localStorage.setItem(this.metaKey, JSON.stringify(m));
    } catch {}
  }
};

// fetch wrapper that auto-injects locally-stored API keys as headers.
// Use for any call to /api/hospitable/* or /api/pricelabs/* from the admin.
function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (url.startsWith("/api/hospitable/")) {
    const k = LocalKeys.get("hospitable_api_key");
    if (k) headers["X-Hospitable-Api-Key"] = k;
  }
  if (url.startsWith("/api/pricelabs/")) {
    const k = LocalKeys.get("pricelabs_api_key");
    if (k) headers["X-Pricelabs-Api-Key"] = k;
  }
  return fetch(url, { ...opts, headers });
}

// =============================================================================
// PropertyContext — shared "current property" state for the property-scoped
// tabs (Photos, Property details, Experiences). Always stored as slug; the
// id↔slug helpers translate for tabs that key by id (Photos uses property.id
// in its <select>, Experiences uses slug). Persists across reloads in
// localStorage so the host returns to the property they were last editing.
// =============================================================================
const PropertyContext = (function() {
  const KEY = "nyris.admin.lastProperty";
  let _slug = null;
  const subs = new Set();
  try { _slug = localStorage.getItem(KEY) || null; } catch {}
  return {
    get() { return _slug; },
    set(slug) {
      if (!slug || slug === _slug) { _slug = slug || null; return; }
      _slug = slug;
      try { localStorage.setItem(KEY, slug); } catch {}
      subs.forEach(fn => { try { fn(slug); } catch {} });
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    bySlug(slug) { return slug ? (NYRIS.properties.find(p => p.slug === slug) || null) : null; },
    byId(id) { return id ? (NYRIS.properties.find(p => p.id === id) || null) : null; },
    notify() { subs.forEach(fn => { try { fn(_slug); } catch {} }); }
  };
})();

// =============================================================================
// Storage layer — Turso (remote) with localStorage fallback
// =============================================================================
const RemoteStore = {
  available: null, // tri-state: null=unknown, true/false
  async probe() {
    if (this.available !== null) return this.available;
    try {
      const r = await fetch("/api/admin/overrides", { method: "GET" });
      const j = await r.json().catch(() => ({}));
      this.available = !!j.ok;
    } catch { this.available = false; }
    return this.available;
  },
  async getOverrides() {
    const r = await fetch("/api/admin/overrides");
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "fetch failed");
    return j.data || {};
  },
  async saveOverrides(data) {
    const r = await fetch("/api/admin/overrides", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "save failed");
    return j;
  },
  async getPhotos(propertyId) {
    const r = await fetch(`/api/admin/photos?property=${propertyId}`);
    const j = await r.json();
    return j.ok ? (j.photos || []) : [];
  },
  async savePhotos(propertyId, photos) {
    const r = await fetch("/api/admin/photos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, photos })
    });
    return r.json();
  },
  async getSyncLog(source) {
    const r = await fetch(`/api/admin/sync-log?source=${source || ""}`);
    const j = await r.json();
    return j.ok ? (j.entries || []) : [];
  },
  async appendSyncLog(entry) {
    return fetch("/api/admin/sync-log", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    }).then(r => r.json()).catch(() => ({}));
  }
};

// Unified store: tries remote first, falls back to localStorage
const Store = {
  async getOverrides() {
    if (await RemoteStore.probe()) {
      try { return await RemoteStore.getOverrides(); } catch { return Overrides.get(); }
    }
    return Overrides.get();
  },
  async saveOverrides(data) {
    Overrides.set(data); // always cache locally for instant UI
    if (await RemoteStore.probe()) {
      try { await RemoteStore.saveOverrides(data); } catch (e) { console.warn("Remote save failed, kept locally", e); }
    }
  }
};

// =============================================================================
// Auth
// =============================================================================
function isLoggedIn() {
  const s = Storage.get(ADMIN.authKey);
  return s && s.expires > Date.now();
}

async function adminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  // Pull the admin email from server overrides if set, falling back to the
  // baked-in demo email so first-time logins still work. The remote probe
  // is best-effort — if the API is unreachable, fall back to overrides
  // already cached locally and finally to the demo email.
  let allowedEmail = ADMIN.demoEmail;
  try {
    const o = await Store.getOverrides();
    if (o && typeof o.adminEmail === 'string' && o.adminEmail.trim()) {
      allowedEmail = o.adminEmail.trim().toLowerCase();
    }
  } catch {
    const cached = Overrides.get();
    if (cached && cached.adminEmail) allowedEmail = cached.adminEmail.trim().toLowerCase();
  }
  if (email === allowedEmail && pass === ADMIN.demoPass) {
    Storage.set(ADMIN.authKey, { email, expires: Date.now() + 1000 * 60 * 60 * 8 });
    await showDashboard();
  } else {
    toast("Wrong email or password.");
  }
}

function adminLogout() {
  localStorage.removeItem(ADMIN.authKey);
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  toast("Signed out.");
}

// =============================================================================
// Tab switcher
// =============================================================================
function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(t => t.style.display = 'none');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('tab-' + tab).style.display = 'block';
      btn.classList.add('active');
    });
  });
}

// Section bar above the tab row — toggles which group of tabs is visible
// without changing data-tab values or the existing bindTabs() behavior.
// CSS does the hiding via [data-active-section]; JS only sets the attribute
// and ensures the active sub-tab belongs to the active section.
function bindTabSections() {
  const bar = document.getElementById('tabBar');
  if (!bar) return;
  document.querySelectorAll('.tab-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      bar.dataset.activeSection = section;
      document.querySelectorAll('.tab-section-btn').forEach(b => b.classList.toggle('active', b === btn));
      // If the currently active sub-tab isn't in this section, switch to the
      // first tab in the new section so we never show an orphan panel.
      const activeBtn = bar.querySelector('.tab-btn.active');
      if (!activeBtn || activeBtn.dataset.section !== section) {
        const firstInSection = bar.querySelector(`.tab-btn[data-section="${section}"]`);
        if (firstInSection) firstInSection.click();
      }
    });
  });
}

// Switch to a tab by data-tab value, optionally setting the property context
// for property-scoped tabs. Called by cross-tab shortcut links.
function gotoTab(tabId, slug) {
  if (slug) PropertyContext.set(slug);
  // Make sure the section containing the target tab is active first, so the
  // .tab-btn we click isn't display:none.
  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (!targetBtn) return;
  const section = targetBtn.dataset.section;
  if (section) {
    const bar = document.getElementById('tabBar');
    if (bar) bar.dataset.activeSection = section;
    document.querySelectorAll('.tab-section-btn').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  }
  targetBtn.click();
  const panel = document.getElementById('tab-' + tabId);
  if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Update every "current property" chip on the page. Called by
// PropertyContext.subscribe and once on init.
function renderCurrentPropertyChips(slug) {
  const prop = PropertyContext.bySlug(slug);
  document.querySelectorAll('[data-tab-chip]').forEach(el => {
    if (prop) {
      el.textContent = `Editing: ${prop.name}`;
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  });
  // Also highlight the matching card on the Property details tab.
  document.querySelectorAll('[data-prop-card]').forEach(card => {
    card.classList.toggle('is-current-property', card.dataset.propCard === slug);
  });
}

// Render the cross-tab shortcut links under the Photos selector. Single
// source of truth for the "open this property in another tab" pattern.
function renderPhotoCrossLinks(slug) {
  const wrap = document.getElementById('photoCrossLinks');
  if (!wrap) return;
  if (!slug) { wrap.innerHTML = ''; return; }
  const prop = PropertyContext.bySlug(slug);
  if (!prop) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <span class="cross-tab-links-label">Also for ${escapeHtml(prop.name)}:</span>
    <button type="button" class="cross-tab-link" onclick="gotoTab('properties', '${escapeAttr(slug)}')">Edit details →</button>
    <button type="button" class="cross-tab-link" onclick="gotoTab('experiences', '${escapeAttr(slug)}')">Edit experiences →</button>
  `;
}

// =============================================================================
// Dashboard init
// =============================================================================
async function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  // Stats
  document.getElementById('stProps').textContent = NYRIS.properties.length;
  document.getElementById('stRating').textContent = NYRIS.brand.avgRating.toFixed(1);
  document.getElementById('stReviews').textContent = NYRIS.brand.totalReviews + '+';
  document.getElementById('stFavs').textContent = NYRIS.properties.filter(p => p.isGuestFavorite).length;

  // Probe remote — show indicator
  const remote = await RemoteStore.probe();

  // Load overrides (remote-aware)
  const o = await Store.getOverrides();
  initHeroTab(o);
  initHostTab(o);
  initWhyBookTab(o);
  initAboutTab(o);
  initAccountTab(o);
  initExpPageTab(o);
  initContactTab(o);
  initInboxTab();
  initBookingsTab();
  initBookingsPaymentsTab();
  initBrandingTab();
  initPhotosTab();
  initPropertiesTab(o);
  initOrderTab(o);
  initDestinationsTab(o);
  initExperiencesTab(o);
  initDiscountsTab();
  initHospitableTab();
  initPricelabsTab();
}

// =============================================================================
// Destinations tab — edit name/state/tagline/image per destination
// =============================================================================
function initDestinationsTab(o) {
  const wrap = document.getElementById("destinationsEditor");
  if (!wrap) return;
  const overrides = o.destinations || {};
  // Counts driven by properties' destination field
  const counts = {};
  for (const p of NYRIS.properties) counts[p.destination] = (counts[p.destination] || 0) + 1;

  wrap.innerHTML = NYRIS.destinations.map(d => {
    const ov = overrides[d.slug] || {};
    const eff = {
      name: ov.name ?? d.name,
      state: ov.state ?? d.state,
      tagline: ov.tagline ?? d.tagline,
      image: ov.image ?? d.image
    };
    return `
      <div class="dest-edit-card" data-slug="${escapeAttr(d.slug)}">
        <div class="dest-edit-image" style="background-image: url('${escapeAttr(eff.image)}');" id="destPreview-${escapeAttr(d.slug)}"></div>
        <div class="dest-edit-fields">
          <div style="display:flex; align-items:center; gap: 0.5rem; margin-bottom: 0.85rem;">
            <span style="font-size: 0.78rem; letter-spacing: 0.06em; color: var(--color-stone); text-transform: uppercase;">slug</span>
            <code style="background: var(--color-cream-dark); padding: 0.15rem 0.55rem; border-radius: 6px; font-size: 0.85rem;">${escapeHtml(d.slug)}</code>
            <span style="margin-left: auto; font-size: 0.82rem; color: var(--color-stone);">${counts[d.slug] || 0} ${(counts[d.slug] || 0) === 1 ? "property" : "properties"}</span>
          </div>
          <div style="display:grid; grid-template-columns: 1.6fr 1fr; gap: 0.75rem;">
            <div><label class="form-label">Name</label><input class="form-control" data-dest-slug="${escapeAttr(d.slug)}" data-dest-field="name" value="${escapeAttr(eff.name)}" placeholder="${escapeAttr(d.name)}"/></div>
            <div><label class="form-label">State</label><input class="form-control" data-dest-slug="${escapeAttr(d.slug)}" data-dest-field="state" value="${escapeAttr(eff.state)}" placeholder="${escapeAttr(d.state)}"/></div>
          </div>
          <div style="margin-top: 0.85rem;"><label class="form-label">Tagline</label><input class="form-control" data-dest-slug="${escapeAttr(d.slug)}" data-dest-field="tagline" value="${escapeAttr(eff.tagline)}" placeholder="${escapeAttr(d.tagline)}"/></div>
          <div style="margin-top: 0.85rem;">
            <label class="form-label">Image</label>
            <div style="display:flex; gap: 0.5rem;">
              <input class="form-control" data-dest-slug="${escapeAttr(d.slug)}" data-dest-field="image" value="${escapeAttr(eff.image)}" placeholder="Paste URL or click Upload" style="font-family: monospace; font-size: 0.85rem;"/>
              <button type="button" class="btn btn-outline btn-sm" onclick="openDestImageUpload('${escapeAttr(d.slug)}')">Upload</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");

  document.querySelectorAll('[data-dest-slug]').forEach(input => {
    input.addEventListener("change", saveDestOverride);
    if (input.dataset.destField === "image") {
      input.addEventListener("input", () => updateDestPreview(input.dataset.destSlug, input.value));
    }
  });
}

function updateDestPreview(slug, url) {
  const el = document.getElementById("destPreview-" + slug);
  if (el && url) el.style.backgroundImage = `url('${url}')`;
}

async function saveDestOverride(e) {
  const o = await Store.getOverrides();
  o.destinations = o.destinations || {};
  const slug = e.target.dataset.destSlug;
  const field = e.target.dataset.destField;
  const val = e.target.value.trim();
  o.destinations[slug] = o.destinations[slug] || {};
  if (val) o.destinations[slug][field] = val;
  else delete o.destinations[slug][field];
  if (Object.keys(o.destinations[slug]).length === 0) delete o.destinations[slug];
  await Store.saveOverrides(o);
  toast("Saved.");
}

function openDestImageUpload(slug) {
  openUploadDialog({
    title: "Upload destination image",
    subtitle: "Tall hero-style image works best (4:5 aspect ratio, ≥1200px wide).",
    pathPrefix: `destinations/${slug}`,
    captionField: false,
    onUploaded: async (url) => {
      const inp = document.querySelector(`[data-dest-slug="${slug}"][data-dest-field="image"]`);
      if (inp) {
        inp.value = url;
        updateDestPreview(slug, url);
        // Persist immediately
        const o = await Store.getOverrides();
        o.destinations = o.destinations || {};
        o.destinations[slug] = { ...(o.destinations[slug] || {}), image: url };
        await Store.saveOverrides(o);
      }
      toast("Destination image uploaded.");
    }
  });
}

// =============================================================================
// Experiences tab — per-property list editor
// =============================================================================
let _expCurrentSlug = null;

function initExperiencesTab(o) {
  const sel = document.getElementById("expPropSelect");
  if (!sel) return;
  sel.innerHTML = NYRIS.properties.map(p => `<option value="${escapeAttr(p.slug)}">${escapeHtml(p.name)} — ${p.city}, ${p.state}</option>`).join("");
  // Restore last-selected property if present.
  const ctxSlug = PropertyContext.get();
  if (ctxSlug && PropertyContext.bySlug(ctxSlug)) sel.value = ctxSlug;
  sel.addEventListener("change", () => {
    PropertyContext.set(sel.value);
    loadExperiencesFor(sel.value);
  });
  loadExperiencesFor(sel.value);
  if (!ctxSlug && sel.value) PropertyContext.set(sel.value);
}

async function loadExperiencesFor(slug) {
  _expCurrentSlug = slug;
  const wrap = document.getElementById("experiencesEditor");
  const o = await Store.getOverrides();
  const p = NYRIS.properties.find(x => x.slug === slug);
  const overrideList = o.props?.[slug]?.experiences;
  const list = Array.isArray(overrideList) ? overrideList : (p?.experiences || []);
  renderExpList(list);
}

function renderExpList(items) {
  const wrap = document.getElementById("experiencesEditor");
  wrap.innerHTML = `
    <ul id="expList" style="list-style:none; padding:0; margin:0;">
      ${items.map((text, i) => expRow(text, i)).join("")}
    </ul>
    <div style="display:flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
      <button class="btn btn-outline" onclick="expAdd()">+ Add experience</button>
      <button class="btn btn-ghost" onclick="expReset()">Reset to defaults</button>
    </div>
  `;
  bindExpDrag();
}

function expRow(text, i) {
  return `
    <li class="exp-row" draggable="true" data-i="${i}">
      <span class="exp-handle" title="Drag to reorder">⋮⋮</span>
      <input class="form-control exp-input" value="${escapeAttr(text)}" data-i="${i}" placeholder="e.g. Sunset stroll on the beach"/>
      <button class="icon-btn exp-remove" data-i="${i}" title="Remove" type="button">${ICON.close.replace('width="22" height="22"', 'width="18" height="18"')}</button>
    </li>`;
}

function getExpItems() {
  return [...document.querySelectorAll("#expList .exp-row")].map(li => {
    const inp = li.querySelector(".exp-input");
    return (inp.value || "").trim();
  }).filter(s => s.length);
}

function bindExpDrag() {
  let dragSrc = null;
  document.querySelectorAll("#expList .exp-row").forEach(row => {
    row.addEventListener("dragstart", () => { dragSrc = row; row.style.opacity = "0.4"; });
    row.addEventListener("dragend", () => row.style.opacity = "1");
    row.addEventListener("dragover", e => e.preventDefault());
    row.addEventListener("drop", e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === row) return;
      const list = row.parentNode;
      const rows = [...list.children];
      const si = rows.indexOf(dragSrc), ti = rows.indexOf(row);
      if (si < ti) row.after(dragSrc); else row.before(dragSrc);
      persistExperiences();
    });
  });
  document.querySelectorAll(".exp-input").forEach(inp => {
    inp.addEventListener("change", persistExperiences);
  });
  document.querySelectorAll(".exp-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const items = getExpItems();
      const i = parseInt(btn.dataset.i, 10);
      items.splice(i, 1);
      renderExpList(items);
      persistExperiences();
    });
  });
}

function expAdd() {
  const items = getExpItems();
  items.push("");
  renderExpList(items);
  // Focus the last input
  setTimeout(() => {
    const inputs = document.querySelectorAll(".exp-input");
    inputs[inputs.length - 1]?.focus();
  }, 0);
}

async function expReset() {
  if (!confirm("Reset experiences for this property to the original list? Your edits will be lost.")) return;
  const o = await Store.getOverrides();
  if (o.props?.[_expCurrentSlug]) delete o.props[_expCurrentSlug].experiences;
  await Store.saveOverrides(o);
  loadExperiencesFor(_expCurrentSlug);
  toast("Reset to defaults.");
}

async function persistExperiences() {
  if (!_expCurrentSlug) return;
  const items = getExpItems();
  const o = await Store.getOverrides();
  o.props = o.props || {};
  o.props[_expCurrentSlug] = o.props[_expCurrentSlug] || {};
  o.props[_expCurrentSlug].experiences = items;
  await Store.saveOverrides(o);
  toast("Saved.");
}

// =============================================================================
// Promo codes tab
// =============================================================================
let _dcType = "flat";
function initDiscountsTab() {
  // Default state
  _dcType = "flat";
  document.getElementById("dcUsesPresetChange") && (document.getElementById("dcUsesPreset").value = "");
  dcLoadList();
}

function dcSetType(t) {
  _dcType = t;
  document.getElementById("dcTypeFlat").className = "btn btn-sm " + (t === "flat" ? "btn-primary" : "btn-outline");
  document.getElementById("dcTypePct").className = "btn btn-sm " + (t === "percent" ? "btn-primary" : "btn-outline");
  document.getElementById("dcValueLabel").textContent = t === "flat" ? "Amount off ($)" : "Percent off (%)";
  const v = document.getElementById("dcValue");
  v.placeholder = t === "flat" ? "50" : "15";
  v.max = t === "percent" ? "100" : "";
}

function dcUsesPresetChange() {
  const v = document.getElementById("dcUsesPreset").value;
  document.getElementById("dcMaxUses").style.display = v === "custom" ? "block" : "none";
}

function dcIndefiniteChange() {
  const ind = document.getElementById("dcIndefinite").checked;
  document.getElementById("dcExpires").style.display = ind ? "none" : "block";
}

function dcGenerate() {
  // Generate a memorable-ish code: WORD + 2-digit number, like "SPRING25" or "STAY20"
  const words = ["SPRING", "SUMMER", "FALL", "WINTER", "STAY", "RELAX", "ESCAPE", "RETREAT", "WELCOME", "GETAWAY", "VACAY", "BEACH", "CABIN", "OASIS"];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = String(Math.floor(Math.random() * 90 + 10));
  document.getElementById("dcCode").value = word + num;
}

async function dcSave() {
  const status = document.getElementById("dcStatus");
  const code = document.getElementById("dcCode").value.trim().toUpperCase();
  const value = parseFloat(document.getElementById("dcValue").value);
  const preset = document.getElementById("dcUsesPreset").value;
  const customMax = parseInt(document.getElementById("dcMaxUses").value, 10);
  const maxUses = preset === "" ? null : preset === "custom" ? (Number.isFinite(customMax) ? customMax : null) : parseInt(preset, 10);
  const indefinite = document.getElementById("dcIndefinite").checked;
  const expiresAt = indefinite ? null : document.getElementById("dcExpires").value || null;
  const description = document.getElementById("dcDescription").value.trim() || null;

  status.style.color = "var(--color-stone)"; status.textContent = "Saving…";
  try {
    const r = await fetch("/api/admin/discounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, type: _dcType, value, maxUses, expiresAt, description })
    });
    const j = await r.json();
    if (!j.ok) {
      status.style.color = "var(--color-danger)";
      status.textContent = j.error || "Save failed";
      return;
    }
    status.style.color = "var(--color-success)";
    status.textContent = `✓ ${j.code} created.`;
    // Reset form
    document.getElementById("dcCode").value = "";
    document.getElementById("dcValue").value = "";
    document.getElementById("dcDescription").value = "";
    document.getElementById("dcUsesPreset").value = "";
    document.getElementById("dcMaxUses").value = "";
    document.getElementById("dcMaxUses").style.display = "none";
    document.getElementById("dcIndefinite").checked = true;
    document.getElementById("dcExpires").style.display = "none";
    dcLoadList();
  } catch (e) {
    status.style.color = "var(--color-danger)";
    status.textContent = "Network error: " + e.message;
  }
}

async function dcLoadList() {
  const wrap = document.getElementById("dcList");
  if (!wrap) return;
  wrap.innerHTML = `<p style="color: var(--color-stone); font-size: 0.9rem; margin: 0;">Loading…</p>`;
  try {
    const r = await fetch("/api/admin/discounts");
    const j = await r.json();
    if (!j.ok) {
      wrap.innerHTML = `<p style="color: var(--color-danger); font-size: 0.9rem;">${escapeHtml(j.error || "Failed to load")}</p>`;
      return;
    }
    if (!j.codes.length) {
      wrap.innerHTML = `<p style="color: var(--color-stone); font-size: 0.9rem; margin: 0;">No codes yet. Create one on the left.</p>`;
      return;
    }
    wrap.innerHTML = j.codes.map(c => {
      const valueLabel = c.type === "percent" ? `${c.value}%` : `$${Math.round(c.value)}`;
      const usageLabel = c.max_uses == null
        ? `${c.times_used} used · unlimited`
        : `${c.times_used}/${c.max_uses} used`;
      const expLabel = c.expires_at
        ? `Expires ${new Date(c.expires_at + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
        : "No expiration";
      const exhausted = c.max_uses != null && c.times_used >= c.max_uses;
      const expired = c.expires_at && c.expires_at < new Date().toISOString().slice(0, 10);
      const statusClass = !c.active ? "inactive" : exhausted ? "exhausted" : expired ? "expired" : "active";
      return `
        <div class="dc-row" data-status="${statusClass}">
          <div class="dc-left">
            <div class="dc-code"><code>${escapeHtml(c.code)}</code> ${dcStatusBadge(statusClass)}</div>
            ${c.description ? `<div class="dc-desc">${escapeHtml(c.description)}</div>` : ""}
            <div class="dc-meta">
              <strong>${valueLabel} off</strong> · ${usageLabel} · ${expLabel}
            </div>
          </div>
          <div class="dc-actions">
            <button class="btn btn-ghost btn-sm" onclick="dcCopy('${escapeAttr(c.code)}')" title="Copy code">Copy</button>
            <button class="btn btn-ghost btn-sm" onclick="dcToggle('${escapeAttr(c.code)}', ${c.active ? 0 : 1})">${c.active ? "Pause" : "Resume"}</button>
            <button class="btn btn-ghost btn-sm" onclick="dcDelete('${escapeAttr(c.code)}')" style="color: var(--color-danger);">Delete</button>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    wrap.innerHTML = `<p style="color: var(--color-danger);">${escapeHtml(e.message)}</p>`;
  }
}

function dcStatusBadge(s) {
  const styles = {
    active: 'background: rgba(44, 122, 90, 0.12); color: var(--color-success);',
    inactive: 'background: rgba(107, 117, 104, 0.18); color: var(--color-stone);',
    exhausted: 'background: rgba(107, 117, 104, 0.18); color: var(--color-stone);',
    expired: 'background: rgba(177, 74, 63, 0.12); color: var(--color-danger);'
  };
  const labels = { active: "Active", inactive: "Paused", exhausted: "Used up", expired: "Expired" };
  return `<span style="${styles[s]} padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">${labels[s]}</span>`;
}

async function dcCopy(code) {
  try { await navigator.clipboard.writeText(code); toast(`Copied ${code}`); } catch { toast("Copy failed"); }
}
async function dcToggle(code, active) {
  await fetch("/api/admin/discounts", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, active: !!active })
  });
  dcLoadList();
}
async function dcDelete(code) {
  if (!confirm(`Delete code ${code}? This can't be undone.`)) return;
  await fetch(`/api/admin/discounts?code=${encodeURIComponent(code)}`, { method: "DELETE" });
  toast(`${code} deleted`);
  dcLoadList();
}

// =============================================================================
// Hero tab
// =============================================================================
function initHeroTab(o) {
  document.getElementById('aHEyebrow').value = o.heroEyebrow || "Top 1% Guest Favorite · Superhost-managed";
  document.getElementById('aHTitle').value = o.heroTitle || "Stay where the reviews don't lie.";
  document.getElementById('aHSub').value = o.heroSubtitle || "Hand-picked vacation homes across the Gulf Coast, Texas Hill Country, and Broken Bow. 5.0 stars across 200+ stays. Book direct — skip the platform fees.";
  // Hero photos: first one (primary) lives in aHImg, rest in the extras list.
  // The carousel is built from [primary, ...extras] at render time. Legacy
  // installs only had o.heroImage; treat o.heroImages as authoritative when
  // present (admin saves it; old data falls through to the single field).
  const all = (Array.isArray(o.heroImages) && o.heroImages.length)
    ? o.heroImages
    : (o.heroImage ? [o.heroImage] : []);
  const primary = all[0] || "https://assets.hospitable.com/property_images/1597444/Lm15xbpAlhpFK2m1TVqQMu9kKk5JXukcSaaWLfEP.jpg";
  const extras = all.slice(1);
  document.getElementById('aHImg').value = primary;
  renderHeroExtras(extras);
  ['aHEyebrow','aHTitle','aHSub','aHImg'].forEach(id => document.getElementById(id).addEventListener('input', updateHeroPreview));
  updateHeroPreview();
}
function renderHeroExtras(urls) {
  const list = document.getElementById('aHExtraList');
  list.innerHTML = '';
  urls.forEach((url, i) => list.appendChild(buildHeroExtraRow(url, i + 1)));
}
function buildHeroExtraRow(url, n) {
  const row = document.createElement('div');
  row.className = 'hero-extra-row';
  row.style.cssText = 'display:flex; gap:0.5rem; align-items:center;';
  row.innerHTML = `
    <input class="form-control hero-extra-url" placeholder="Image URL or click Upload" value="${escapeAttr(url)}"/>
    <button type="button" class="btn btn-outline btn-sm" data-action="upload">Upload</button>
    <button type="button" class="btn btn-ghost btn-sm" data-action="remove" aria-label="Remove photo ${n}">×</button>
  `;
  row.querySelector('[data-action="upload"]').onclick = () => {
    openUploadDialog({
      pathPrefix: "branding/hero",
      onUploaded: (url) => {
        row.querySelector('.hero-extra-url').value = url;
        toast("Image uploaded. Click Save changes to apply.");
      }
    });
  };
  row.querySelector('[data-action="remove"]').onclick = () => row.remove();
  return row;
}
function addHeroExtra() {
  document.getElementById('aHExtraList').appendChild(buildHeroExtraRow('', document.querySelectorAll('.hero-extra-row').length + 1));
}
function gatherHeroImages() {
  const primary = document.getElementById('aHImg').value.trim();
  const extras = Array.from(document.querySelectorAll('.hero-extra-url'))
    .map(i => i.value.trim()).filter(Boolean);
  return [primary, ...extras].filter(Boolean);
}
function updateHeroPreview() {
  document.getElementById('phEyebrow').textContent = document.getElementById('aHEyebrow').value;
  document.getElementById('phTitle').textContent = document.getElementById('aHTitle').value;
  document.getElementById('phSub').textContent = document.getElementById('aHSub').value;
  document.getElementById('heroPreview').style.backgroundImage = `url('${document.getElementById('aHImg').value}')`;
}
async function saveHero() {
  const o = await Store.getOverrides();
  o.heroEyebrow = document.getElementById('aHEyebrow').value.trim();
  o.heroTitle = document.getElementById('aHTitle').value.trim();
  o.heroSubtitle = document.getElementById('aHSub').value.trim();
  const images = gatherHeroImages();
  o.heroImages = images;
  o.heroImage = images[0] || ''; // keep legacy field in sync for older code paths
  await Store.saveOverrides(o);
  toast("Hero saved. Reload the homepage to see it live.");
}
async function resetHero() {
  const o = await Store.getOverrides();
  delete o.heroEyebrow; delete o.heroTitle; delete o.heroSubtitle; delete o.heroImage; delete o.heroImages;
  await Store.saveOverrides(o);
  initHeroTab(o);
  toast("Hero reset.");
}

// =============================================================================
// Meet your host tab — edits the homepage host introduction block.
// Stored under o.host = { eyebrow, title, body1, body2, buttonText, buttonLink, image }
// =============================================================================
const HOST_DEFAULTS = {
  eyebrow: "Meet your host",
  title: "Sheena. Superhost. Sweat-the-details host.",
  body1: 'Every Nyris Retreats home is personally managed by Sheena — an experienced Superhost whose calendar across the portfolio reads like a five-star streak. Coffee stocked. Beach toys waiting. Local tips sent before you arrive. The kind of hosting where reviews start with <em>"This was the cleanest stay we\'ve ever had"</em> and end with <em>"We\'re already planning to come back."</em>',
  body2: "She doesn't outsource it. That's why every property is a Top 1% Guest Favorite — Airbnb's elite tier — and why direct guests get answers in minutes, not hours.",
  buttonText: "Read our story",
  buttonLink: "/about.html",
  image: "https://assets.hospitable.com/property_images/1574508/J4AWxWdNVx0riannl63U4j8SZgj4dWjTlS3fmQZo.jpg"
};
function initHostTab(o) {
  const h = o.host || {};
  document.getElementById('aMHEyebrow').value = h.eyebrow ?? HOST_DEFAULTS.eyebrow;
  document.getElementById('aMHTitle').value = h.title ?? HOST_DEFAULTS.title;
  document.getElementById('aMHBody1').value = h.body1 ?? HOST_DEFAULTS.body1;
  document.getElementById('aMHBody2').value = h.body2 ?? HOST_DEFAULTS.body2;
  document.getElementById('aMHBtnText').value = h.buttonText ?? HOST_DEFAULTS.buttonText;
  document.getElementById('aMHBtnLink').value = h.buttonLink ?? HOST_DEFAULTS.buttonLink;
  document.getElementById('aMHImage').value = h.image ?? HOST_DEFAULTS.image;
  ['aMHEyebrow','aMHTitle','aMHBody1','aMHBody2','aMHBtnText','aMHBtnLink','aMHImage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateHostPreview);
  });
  updateHostPreview();
}
function updateHostPreview() {
  document.getElementById('phHostEyebrow').textContent = document.getElementById('aMHEyebrow').value;
  document.getElementById('phHostTitle').textContent = document.getElementById('aMHTitle').value;
  document.getElementById('phHostBody1').innerHTML = document.getElementById('aMHBody1').value;
  document.getElementById('phHostBody2').innerHTML = document.getElementById('aMHBody2').value;
  const btn = document.getElementById('phHostBtn');
  btn.textContent = document.getElementById('aMHBtnText').value;
  btn.setAttribute('href', document.getElementById('aMHBtnLink').value || '#');
  document.getElementById('phHostImage').src = document.getElementById('aMHImage').value;
}
async function saveHost() {
  const o = await Store.getOverrides();
  o.host = {
    eyebrow: document.getElementById('aMHEyebrow').value.trim(),
    title: document.getElementById('aMHTitle').value.trim(),
    body1: document.getElementById('aMHBody1').value.trim(),
    body2: document.getElementById('aMHBody2').value.trim(),
    buttonText: document.getElementById('aMHBtnText').value.trim(),
    buttonLink: document.getElementById('aMHBtnLink').value.trim(),
    image: document.getElementById('aMHImage').value.trim()
  };
  await Store.saveOverrides(o);
  toast("Host section saved. Reload the homepage to see it live.");
}
async function resetHost() {
  const o = await Store.getOverrides();
  delete o.host;
  await Store.saveOverrides(o);
  initHostTab(o);
  toast("Host section reset.");
}

// =============================================================================
// Why book direct tab — homepage value-prop section
// =============================================================================
const WHY_BOOK_DEFAULTS = {
  eyebrow: "Why book direct",
  title: "Same homes. Better stay. Lower price.",
  bullets: [
    { title: "Skip the platform fees.", body: "Save 14–18% versus Airbnb or Vrbo. Same homes, same Superhost — the savings come back to you." },
    { title: "Direct line to your host.", body: "Most messages answered within minutes. Real human, no chatbot escalation tree." },
    { title: "Flexible check-in when we can.", body: "Direct guests get first dibs on early arrival or late checkout — just ask." },
    { title: "Best-rate guarantee.", body: "See the same home cheaper elsewhere? We'll match it. No fine print." }
  ],
  image: "https://assets.hospitable.com/property_images/1605954/0nHIh9LmL4RykThYVcEetYU1C6Fm43PrGrZGHKJx.jpg",
  quote: "\"Cleanest Airbnb I've rented to date.\"",
  quoteCaption: "★ 5.0 · Spring break family · Apr 2026"
};
function initWhyBookTab(o) {
  const w = (o && o.whyBook) || {};
  const bullets = Array.isArray(w.bullets) && w.bullets.length === 4 ? w.bullets : WHY_BOOK_DEFAULTS.bullets;
  document.getElementById('aWBEyebrow').value = w.eyebrow ?? WHY_BOOK_DEFAULTS.eyebrow;
  document.getElementById('aWBTitle').value = w.title ?? WHY_BOOK_DEFAULTS.title;
  for (let i = 0; i < 4; i++) {
    const b = bullets[i] || WHY_BOOK_DEFAULTS.bullets[i];
    document.getElementById(`aWBB${i}Title`).value = b.title || '';
    document.getElementById(`aWBB${i}Body`).value = b.body || '';
  }
  document.getElementById('aWBImage').value = w.image ?? WHY_BOOK_DEFAULTS.image;
  document.getElementById('aWBQuote').value = w.quote ?? WHY_BOOK_DEFAULTS.quote;
  document.getElementById('aWBQuoteCaption').value = w.quoteCaption ?? WHY_BOOK_DEFAULTS.quoteCaption;
  ['aWBEyebrow','aWBTitle','aWBB0Title','aWBB0Body','aWBB1Title','aWBB1Body','aWBB2Title','aWBB2Body','aWBB3Title','aWBB3Body','aWBImage','aWBQuote','aWBQuoteCaption'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateWhyBookPreview);
  });
  updateWhyBookPreview();
}
function updateWhyBookPreview() {
  document.getElementById('phWBEyebrow').textContent = document.getElementById('aWBEyebrow').value;
  document.getElementById('phWBTitle').textContent = document.getElementById('aWBTitle').value;
  const ul = document.getElementById('phWBBullets');
  let html = '';
  for (let i = 0; i < 4; i++) {
    const t = document.getElementById(`aWBB${i}Title`).value;
    const b = document.getElementById(`aWBB${i}Body`).value;
    html += `<li style="padding: 0.4rem 0; border-bottom: 1px solid var(--color-line);"><strong>${escapeHtml(t)}</strong> <span style="color: var(--color-stone);">${escapeHtml(b)}</span></li>`;
  }
  ul.innerHTML = html;
  document.getElementById('phWBImage').src = document.getElementById('aWBImage').value;
  document.getElementById('phWBQuote').textContent = document.getElementById('aWBQuote').value;
  document.getElementById('phWBQuoteCaption').textContent = document.getElementById('aWBQuoteCaption').value;
}
async function saveWhyBook() {
  const o = await Store.getOverrides();
  o.whyBook = {
    eyebrow: document.getElementById('aWBEyebrow').value.trim(),
    title: document.getElementById('aWBTitle').value.trim(),
    bullets: [0,1,2,3].map(i => ({
      title: document.getElementById(`aWBB${i}Title`).value.trim(),
      body: document.getElementById(`aWBB${i}Body`).value.trim()
    })),
    image: document.getElementById('aWBImage').value.trim(),
    quote: document.getElementById('aWBQuote').value.trim(),
    quoteCaption: document.getElementById('aWBQuoteCaption').value.trim()
  };
  await Store.saveOverrides(o);
  toast("Why-book section saved. Reload the homepage to see it live.");
}
async function resetWhyBook() {
  const o = await Store.getOverrides();
  delete o.whyBook;
  await Store.saveOverrides(o);
  initWhyBookTab(o);
  toast("Why-book section reset.");
}
function openWhyBookUpload() {
  openUploadDialog({
    pathPrefix: "branding/whybook",
    onUploaded: (url) => {
      const f = document.getElementById('aWBImage');
      if (f) { f.value = url; f.dispatchEvent(new Event('input', { bubbles: true })); }
      toast("Image uploaded. Click Save changes to apply.");
    }
  });
}

// =============================================================================
// Our Story page tab — edits /about.html via o.aboutPage overrides.
// Stored as { hero, lead, body1, body2, quote, quoteCaption, bulletsTitle,
//             bullets:[{title,body}], cta:{text,link}, stats:[{num,label}] }
// =============================================================================
const ABOUT_DEFAULTS = {
  hero: {
    image: "https://assets.hospitable.com/property_images/1605954/0nHIh9LmL4RykThYVcEetYU1C6Fm43PrGrZGHKJx.jpg",
    eyebrow: "Our story",
    title: "Six homes. One Superhost. Zero compromises."
  },
  lead: "Nyris Retreats started with a frustration: too many vacation rentals over-promise on the photos and under-deliver on the stay. The fix wasn't a bigger portfolio — it was a smaller one, hosted personally, where every detail is owned by one person.",
  body1: "That person is Sheena — the Superhost behind every Nyris property. She doesn't manage at scale; she manages with care. She knows which beach house has the better sunset deck, which cabin needs the heated pool turned on, which condo has the best dolphin-watching balcony, and which guest just asked about a high chair so it's already at the door.",
  body2: "The result is a portfolio that, to date, has earned a 5.0 average across 200+ stays — and every property is a Top 1% Guest Favorite, Airbnb's most exclusive tier, awarded based on reviews, ratings, and reliability.",
  quote: "\"I wish every Airbnb owner took as much pride and detail as Sheena does.\"",
  quoteCaption: "— Verified guest, March 2026",
  bulletsTitle: "What \"Superhost-managed\" actually means",
  bullets: [
    { title: "Most messages answered within minutes.", body: "Real human, no chatbot. If you have a question at 9pm on a Tuesday, you'll have an answer by 9:05." },
    { title: "Personal local recommendations sent before you arrive.", body: "Not a generic tourist PDF — a curated list of where she'd send her own family." },
    { title: "Stocked starter pantries.", body: "Coffee, paper towels, dish soap, salt and pepper, beach toys where it makes sense — so you don't lose your first hour at the grocery store." },
    { title: "Hot tubs sanitized after every checkout.", body: "Every property treated like she'd treat her own family's stay." },
    { title: "Direct booking perks.", body: "Skip the platform service fees, get first dibs on flexible check-in, lock in our best-rate guarantee." }
  ],
  cta: { text: "Browse the portfolio", link: "/search.html" },
  stats: [
    { num: "5.0", label: "Average rating across 6 properties" },
    { num: "208+", label: "Five-star stays delivered" },
    { num: "Top 1%", label: "Every property is Guest Favorite" },
    { num: "< 5 min", label: "Median response time" }
  ]
};
function initAboutTab(o) {
  const a = (o && o.aboutPage) || {};
  const h = a.hero || {};
  document.getElementById('aABHeroImg').value = h.image ?? ABOUT_DEFAULTS.hero.image;
  document.getElementById('aABEyebrow').value = h.eyebrow ?? ABOUT_DEFAULTS.hero.eyebrow;
  document.getElementById('aABTitle').value = h.title ?? ABOUT_DEFAULTS.hero.title;
  document.getElementById('aABLead').value = a.lead ?? ABOUT_DEFAULTS.lead;
  document.getElementById('aABBody1').value = a.body1 ?? ABOUT_DEFAULTS.body1;
  document.getElementById('aABBody2').value = a.body2 ?? ABOUT_DEFAULTS.body2;
  document.getElementById('aABQuote').value = a.quote ?? ABOUT_DEFAULTS.quote;
  document.getElementById('aABQuoteCaption').value = a.quoteCaption ?? ABOUT_DEFAULTS.quoteCaption;
  document.getElementById('aABBulletsTitle').value = a.bulletsTitle ?? ABOUT_DEFAULTS.bulletsTitle;
  // Bullets — fixed at 5 (matches default markup). Render rows.
  const bullets = (Array.isArray(a.bullets) && a.bullets.length === 5) ? a.bullets : ABOUT_DEFAULTS.bullets;
  renderAboutBullets(bullets);
  // CTA
  const cta = a.cta || ABOUT_DEFAULTS.cta;
  document.getElementById('aABCtaText').value = cta.text || '';
  document.getElementById('aABCtaLink').value = cta.link || '';
  // Stats — fixed at 4
  const stats = (Array.isArray(a.stats) && a.stats.length === 4) ? a.stats : ABOUT_DEFAULTS.stats;
  renderAboutStats(stats);
}
function renderAboutBullets(bullets) {
  const list = document.getElementById('aABBulletsList');
  list.innerHTML = '';
  bullets.forEach((b, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'border: 1px solid var(--color-line); border-radius: 10px; padding: 0.85rem; background: white;';
    row.innerHTML = `
      <label class="form-label">Bullet ${i + 1} — title</label>
      <input class="form-control about-bullet-title" data-i="${i}" value="${escapeAttr(b.title || '')}"/>
      <label class="form-label" style="margin-top: 0.5rem;">Bullet ${i + 1} — body</label>
      <textarea class="form-control about-bullet-body" data-i="${i}" rows="2" style="resize: vertical;">${escapeHtml(b.body || '')}</textarea>
    `;
    list.appendChild(row);
  });
}
function renderAboutStats(stats) {
  const list = document.getElementById('aABStatsList');
  list.innerHTML = '';
  stats.forEach((s, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid; grid-template-columns: 1fr 2fr; gap: 0.75rem; align-items:end; border: 1px solid var(--color-line); border-radius: 10px; padding: 0.85rem; background: white;';
    row.innerHTML = `
      <div><label class="form-label">Stat ${i + 1} — number</label><input class="form-control about-stat-num" data-i="${i}" value="${escapeAttr(s.num || '')}"/></div>
      <div><label class="form-label">Stat ${i + 1} — label</label><input class="form-control about-stat-label" data-i="${i}" value="${escapeAttr(s.label || '')}"/></div>
    `;
    list.appendChild(row);
  });
}
async function saveAbout() {
  const o = await Store.getOverrides();
  const bullets = [];
  for (let i = 0; i < 5; i++) {
    const t = document.querySelector(`.about-bullet-title[data-i="${i}"]`)?.value.trim() || '';
    const b = document.querySelector(`.about-bullet-body[data-i="${i}"]`)?.value.trim() || '';
    bullets.push({ title: t, body: b });
  }
  const stats = [];
  for (let i = 0; i < 4; i++) {
    const n = document.querySelector(`.about-stat-num[data-i="${i}"]`)?.value.trim() || '';
    const l = document.querySelector(`.about-stat-label[data-i="${i}"]`)?.value.trim() || '';
    stats.push({ num: n, label: l });
  }
  o.aboutPage = {
    hero: {
      image: document.getElementById('aABHeroImg').value.trim(),
      eyebrow: document.getElementById('aABEyebrow').value.trim(),
      title: document.getElementById('aABTitle').value.trim()
    },
    lead: document.getElementById('aABLead').value.trim(),
    body1: document.getElementById('aABBody1').value.trim(),
    body2: document.getElementById('aABBody2').value.trim(),
    quote: document.getElementById('aABQuote').value.trim(),
    quoteCaption: document.getElementById('aABQuoteCaption').value.trim(),
    bulletsTitle: document.getElementById('aABBulletsTitle').value.trim(),
    bullets,
    cta: {
      text: document.getElementById('aABCtaText').value.trim(),
      link: document.getElementById('aABCtaLink').value.trim()
    },
    stats
  };
  await Store.saveOverrides(o);
  toast("Our Story page saved. Reload /about.html to see it live.");
}
async function resetAbout() {
  if (!confirm("Reset Our Story page to defaults?")) return;
  const o = await Store.getOverrides();
  delete o.aboutPage;
  await Store.saveOverrides(o);
  initAboutTab(o);
  toast("Our Story page reset.");
}
function openAboutHeroUpload() {
  openUploadDialog({
    pathPrefix: "branding/about",
    onUploaded: (url) => {
      const f = document.getElementById('aABHeroImg');
      if (f) f.value = url;
      toast("Image uploaded. Click Save changes to apply.");
    }
  });
}

// =============================================================================
// Admin account tab — sign-in email lives in o.adminEmail (server overrides
// so it propagates to every device). Password is still hardcoded in ADMIN.* —
// see the inline note in the tab panel for the security caveat.
// =============================================================================
function initAccountTab(o) {
  document.getElementById('aAccountEmail').value = (o && o.adminEmail) || ADMIN.demoEmail;
}
async function saveAdminAccount() {
  const email = document.getElementById('aAccountEmail').value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    toast("Enter a valid email address.");
    return;
  }
  const o = await Store.getOverrides();
  o.adminEmail = email;
  await Store.saveOverrides(o);
  toast("Admin email saved. Sign in with it next time.");
}
function openHostUpload() {
  openUploadDialog({
    title: "Upload host portrait",
    subtitle: "Portrait orientation (4:5) works best.",
    pathPrefix: "branding/host",
    captionField: false,
    onUploaded: (url) => {
      const inp = document.getElementById("aMHImage");
      if (inp) inp.value = url;
      if (typeof updateHostPreview === "function") updateHostPreview();
      toast("Host image uploaded. Click Save changes to apply.");
    }
  });
}

// =============================================================================
// Experiences page tab — edits the public /experiences.html intro + CTA.
// Stored under o.experiencesPage = { heroEyebrow, heroTitle, heroSubtitle,
// ctaTitle, ctaSubtitle, ctaButtonText, ctaButtonLink }.
// =============================================================================
const EXP_PAGE_DEFAULTS = {
  heroEyebrow: "Beyond the property",
  heroTitle: "A trip is more than the bed.",
  heroSubtitle: "Every Nyris property comes with Sheena's personal recommendations — the spots she'd send her own family. Here's a region-by-region preview.",
  ctaTitle: "Want something custom?",
  ctaSubtitle: "Sheena coordinates everything from chef-prepared welcome dinners to private yoga, surf lessons, and boat charters. Just ask.",
  ctaButtonText: "Request a custom experience",
  ctaButtonLink: "/contact.html?topic=experiences"
};
function initExpPageTab(o) {
  if (!document.getElementById('aEPEyebrow')) return;
  const ep = o.experiencesPage || {};
  document.getElementById('aEPEyebrow').value = ep.heroEyebrow ?? EXP_PAGE_DEFAULTS.heroEyebrow;
  document.getElementById('aEPTitle').value = ep.heroTitle ?? EXP_PAGE_DEFAULTS.heroTitle;
  document.getElementById('aEPSub').value = ep.heroSubtitle ?? EXP_PAGE_DEFAULTS.heroSubtitle;
  document.getElementById('aEPCtaTitle').value = ep.ctaTitle ?? EXP_PAGE_DEFAULTS.ctaTitle;
  document.getElementById('aEPCtaSub').value = ep.ctaSubtitle ?? EXP_PAGE_DEFAULTS.ctaSubtitle;
  document.getElementById('aEPCtaText').value = ep.ctaButtonText ?? EXP_PAGE_DEFAULTS.ctaButtonText;
  document.getElementById('aEPCtaLink').value = ep.ctaButtonLink ?? EXP_PAGE_DEFAULTS.ctaButtonLink;
  ['aEPEyebrow','aEPTitle','aEPSub','aEPCtaTitle','aEPCtaSub','aEPCtaText','aEPCtaLink'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateExpPagePreview);
  });
  updateExpPagePreview();
}
function updateExpPagePreview() {
  document.getElementById('phEPEyebrow').textContent = document.getElementById('aEPEyebrow').value;
  document.getElementById('phEPTitle').textContent = document.getElementById('aEPTitle').value;
  document.getElementById('phEPSub').innerHTML = document.getElementById('aEPSub').value;
  document.getElementById('phEPCtaTitle').textContent = document.getElementById('aEPCtaTitle').value;
  document.getElementById('phEPCtaSub').innerHTML = document.getElementById('aEPCtaSub').value;
  const btn = document.getElementById('phEPCtaBtn');
  btn.textContent = document.getElementById('aEPCtaText').value;
  btn.setAttribute('href', document.getElementById('aEPCtaLink').value || '#');
}
async function saveExpPage() {
  const o = await Store.getOverrides();
  o.experiencesPage = {
    heroEyebrow: document.getElementById('aEPEyebrow').value.trim(),
    heroTitle: document.getElementById('aEPTitle').value.trim(),
    heroSubtitle: document.getElementById('aEPSub').value.trim(),
    ctaTitle: document.getElementById('aEPCtaTitle').value.trim(),
    ctaSubtitle: document.getElementById('aEPCtaSub').value.trim(),
    ctaButtonText: document.getElementById('aEPCtaText').value.trim(),
    ctaButtonLink: document.getElementById('aEPCtaLink').value.trim()
  };
  await Store.saveOverrides(o);
  toast("Experiences page saved. Reload the page to see it live.");
}
async function resetExpPage() {
  const o = await Store.getOverrides();
  delete o.experiencesPage;
  await Store.saveOverrides(o);
  initExpPageTab(o);
  toast("Experiences page reset.");
}

// =============================================================================
// Contact info tab — public email + phone, used in the footer on every page
// and on the Contact page's Direct contact card. Stored under o.contact =
// { email, phone }. applyOverrides() in app.js patches NYRIS.brand.{email,phone}
// so existing render paths keep working without per-page changes.
// =============================================================================
function initContactTab(o) {
  if (!document.getElementById('aContactEmail')) return;
  const c = o.contact || {};
  const n = o.notifications || {};
  const fallback = (NYRIS && NYRIS.brand) ? NYRIS.brand : {};
  document.getElementById('aContactEmail').value = c.email ?? fallback.email ?? '';
  document.getElementById('aContactPhone').value = c.phone ?? fallback.phone ?? '';
  document.getElementById('aNotifyTo').value = n.toEmail ?? '';
  document.getElementById('aNotifyFrom').value = n.fromEmail ?? '';
  const hospField = document.getElementById('aNotifyHospitable');
  if (hospField) hospField.value = n.hospitableForwardEmail ?? '';
  // Stripe + provider config now lives in the Bookings & Payments tab — no
  // longer loaded here.
  ['aContactEmail', 'aContactPhone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateContactPreview);
  });
  updateContactPreview();
  refreshResendKeyMeta();
}
async function refreshResendKeyMeta() {
  const meta = document.getElementById('aResendKeyMeta');
  if (!meta) return;
  try {
    const r = await fetch('/api/admin/secrets');
    const j = await r.json();
    // Endpoint returns { ok, items: [...] }, not { keys: [...] }.
    const found = (j.items || []).find(k => k.key === 'resend_api_key');
    if (found && found.last4) {
      meta.innerHTML = `Saved · ending in <strong>${found.last4}</strong> · <a href="#" onclick="removeResendKey(event)">Remove</a>`;
    } else {
      meta.textContent = "Get a free key at resend.com. Stored encrypted in Turso.";
    }
  } catch {
    // Silent — meta stays at default text.
  }
}
async function saveResendKey() {
  const input = document.getElementById('aResendKey');
  const value = (input.value || '').trim();
  if (!value) { toast("Paste a Resend API key first."); return; }
  if (value.length < 8) { toast("That looks too short to be a real key."); return; }
  try {
    const r = await fetch('/api/admin/secrets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'resend_api_key', value })
    });
    const j = await r.json();
    if (!j.ok) { toast(j.error || "Save failed"); return; }
    input.value = '';
    toast(`Resend key saved · ending in ${value.slice(-4)}`);
    refreshResendKeyMeta();
  } catch (e) {
    toast("Save failed — couldn't reach the server.");
  }
}
async function removeResendKey(e) {
  if (e) e.preventDefault();
  if (!confirm("Remove the Resend API key? Email notifications will stop until you save a new one.")) return;
  try {
    await fetch('/api/admin/secrets?key=resend_api_key', { method: 'DELETE' });
  } catch {}
  toast("Resend key removed.");
  refreshResendKeyMeta();
}
async function sendTestEmail(target) {
  const resultEl = document.getElementById('testEmailResult');
  if (!resultEl) return;
  resultEl.innerHTML = `<div style="padding: 0.75rem 1rem; background: var(--color-cream-dark); border-radius: 8px; font-size: 0.9rem;">Sending test email to ${target === 'hospitable' ? 'Hospitable forwarding address' : 'notification recipient'}…</div>`;
  try {
    const r = await fetch('/api/admin/test-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });
    const j = await r.json();
    if (j.ok) {
      resultEl.innerHTML = `<div style="padding: 0.75rem 1rem; background: rgba(44,122,90,0.1); border: 1px solid rgba(44,122,90,0.3); color: var(--color-success); border-radius: 8px; font-size: 0.9rem;">
        <strong>✓ Test sent</strong> · from <code>${escapeHtml(j.from || '')}</code> to <code>${escapeHtml(j.to || '')}</code>${j.messageId ? ` · message ${escapeHtml(j.messageId)}` : ''}<br/>
        <span style="color: var(--color-stone); font-size: 0.85rem;">Check the recipient's inbox (and spam folder) within 1–2 minutes.</span>
      </div>`;
    } else {
      const hint = j.hint ? `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(177,74,63,0.2); font-size: 0.85rem; color: var(--color-charcoal);">${escapeHtml(j.hint)}</div>` : '';
      resultEl.innerHTML = `<div style="padding: 0.75rem 1rem; background: rgba(177,74,63,0.1); border: 1px solid rgba(177,74,63,0.3); color: var(--color-danger); border-radius: 8px; font-size: 0.9rem;">
        <strong>✕ Test failed</strong> · ${escapeHtml(j.error || 'unknown error')}${j.from ? `<br/><span style="color: var(--color-stone);">from <code>${escapeHtml(j.from)}</code> to <code>${escapeHtml(j.to || '—')}</code></span>` : ''}
        ${hint}
      </div>`;
    }
  } catch (e) {
    resultEl.innerHTML = `<div style="padding: 0.75rem 1rem; background: rgba(177,74,63,0.1); color: var(--color-danger); border-radius: 8px; font-size: 0.9rem;">✕ ${escapeHtml(String(e))}</div>`;
  }
}

async function saveNotifications() {
  const o = await Store.getOverrides();
  const toEmail = document.getElementById('aNotifyTo').value.trim();
  const fromEmail = document.getElementById('aNotifyFrom').value.trim();
  const hospField = document.getElementById('aNotifyHospitable');
  const hospitableForwardEmail = hospField ? hospField.value.trim() : '';
  if (!toEmail && !fromEmail && !hospitableForwardEmail) {
    delete o.notifications;
  } else {
    o.notifications = {};
    if (toEmail) o.notifications.toEmail = toEmail;
    if (fromEmail) o.notifications.fromEmail = fromEmail;
    if (hospitableForwardEmail) o.notifications.hospitableForwardEmail = hospitableForwardEmail;
  }
  await Store.saveOverrides(o);
  toast("Notification settings saved.");
}

// Bookings & Payments tab — provider toggle + Stripe key + Hospitable URL.
// Storage shape:
//   o.payments = {
//     provider: "stripe" | "hospitable",
//     stripePublishableKey: "pk_…",
//     hospitableBookingUrlTemplate: "https://booking.hospitable.com/{propertyId}",
//     hospitableBookingNewTab: true | false
//   }
function initBookingsPaymentsTab() {
  const toggle = document.getElementById('paymentProviderToggle');
  if (!toggle) return;
  // Wire the provider toggle to show/hide the matching sub-panel.
  toggle.querySelectorAll('input[name="paymentProvider"]').forEach(input => {
    input.addEventListener('change', () => syncProviderUI(input.value));
  });

  // Load saved values from overrides.
  Store.getOverrides().then(o => {
    const pay = (o && o.payments) || {};
    const provider = pay.provider || 'stripe';
    const radio = toggle.querySelector(`input[name="paymentProvider"][value="${provider}"]`);
    if (radio) radio.checked = true;
    syncProviderUI(provider);
    const stripeField = document.getElementById('aPaymentsStripePub');
    if (stripeField) stripeField.value = pay.stripePublishableKey || '';
    const urlField = document.getElementById('aPaymentsHospUrl');
    if (urlField) urlField.value = pay.hospitableBookingUrlTemplate || '';
    const newTabField = document.getElementById('aPaymentsHospNewTab');
    if (newTabField) newTabField.checked = pay.hospitableBookingNewTab !== false; // default ON
    const embedField = document.getElementById('aPaymentsHospEmbed');
    if (embedField) embedField.value = pay.hospitableWidgetEmbed || '';
  });
}
function syncProviderUI(provider) {
  document.querySelectorAll('.provider-card').forEach(c => {
    c.classList.toggle('is-active', c.dataset.provider === provider);
  });
  const stripePanel = document.getElementById('providerPanelStripe');
  const hospPanel = document.getElementById('providerPanelHospitable');
  if (stripePanel) stripePanel.classList.toggle('is-active', provider === 'stripe');
  if (hospPanel) hospPanel.classList.toggle('is-active', provider === 'hospitable');
}
async function savePayments() {
  const o = await Store.getOverrides();
  const provider = (document.querySelector('input[name="paymentProvider"]:checked') || {}).value || 'stripe';
  const stripeField = document.getElementById('aPaymentsStripePub');
  const stripePublishableKey = stripeField ? stripeField.value.trim() : '';
  const urlField = document.getElementById('aPaymentsHospUrl');
  const hospitableBookingUrlTemplate = urlField ? urlField.value.trim() : '';
  const newTabField = document.getElementById('aPaymentsHospNewTab');
  const hospitableBookingNewTab = newTabField ? !!newTabField.checked : true;
  const embedField = document.getElementById('aPaymentsHospEmbed');
  const hospitableWidgetEmbed = embedField ? embedField.value : '';

  // Validate Stripe key shape only when present (it's optional in hospitable mode).
  if (stripePublishableKey && !/^pk_(live|test)_[A-Za-z0-9]+$/.test(stripePublishableKey)) {
    toast("That doesn't look like a Stripe publishable key (should start with pk_live_ or pk_test_).");
    return;
  }
  // Hospitable URL must include a placeholder if provided.
  if (hospitableBookingUrlTemplate && !/\{(propertyId|slug)\}/.test(hospitableBookingUrlTemplate)) {
    toast("Hospitable URL needs a {propertyId} or {slug} placeholder.");
    return;
  }
  // Block saving "hospitable" provider with no URL — would silently break Reserve.
  if (provider === 'hospitable' && !hospitableBookingUrlTemplate) {
    toast("Paste your Hospitable booking URL template before switching providers.");
    return;
  }

  o.payments = {
    provider,
    ...(stripePublishableKey ? { stripePublishableKey } : {}),
    ...(hospitableBookingUrlTemplate ? { hospitableBookingUrlTemplate } : {}),
    hospitableBookingNewTab,
    ...(hospitableWidgetEmbed.trim() ? { hospitableWidgetEmbed } : {})
  };
  await Store.saveOverrides(o);
  toast(`Saved — Reserve button now uses ${provider === 'stripe' ? 'Stripe checkout' : 'Hospitable Direct widget'}.`);
}

// Open the configured Hospitable URL with a real property's ID + sample dates
// to verify the template is correct.
function testHospitableBookingUrl() {
  const result = document.getElementById('hospUrlTestResult');
  const tpl = (document.getElementById('aPaymentsHospUrl').value || '').trim();
  if (!tpl) {
    result.innerHTML = `<span style="color: var(--color-danger);">Paste a URL template first.</span>`;
    return;
  }
  if (!/\{(propertyId|slug)\}/.test(tpl)) {
    result.innerHTML = `<span style="color: var(--color-danger);">Template needs <code>{propertyId}</code> or <code>{slug}</code>.</span>`;
    return;
  }
  const prop = (NYRIS && NYRIS.properties && NYRIS.properties[0]) || null;
  if (!prop) {
    result.innerHTML = `<span style="color: var(--color-danger);">No properties available to test against.</span>`;
    return;
  }
  // Sample dates: 30 days from today, 3 nights.
  const start = new Date(); start.setDate(start.getDate() + 30);
  const end = new Date(start); end.setDate(end.getDate() + 3);
  const url = buildHospitableBookingUrl(tpl, prop, start.toISOString().slice(0,10), end.toISOString().slice(0,10), 2);
  result.innerHTML = `Opening <code style="background: var(--color-cream-dark); padding: 0.1rem 0.4rem; border-radius: 4px;">${escapeHtml(url)}</code> in a new tab — verify it loads Hospitable's booking page.`;
  window.open(url, '_blank', 'noopener');
}
function buildHospitableBookingUrl(template, property, checkin, checkout, guests) {
  let url = template
    .replace(/\{propertyId\}/g, encodeURIComponent(property.id))
    .replace(/\{slug\}/g, encodeURIComponent(property.slug));
  const sep = url.includes('?') ? '&' : '?';
  const params = [];
  if (checkin) params.push(`checkin=${encodeURIComponent(checkin)}`);
  if (checkout) params.push(`checkout=${encodeURIComponent(checkout)}`);
  if (guests) params.push(`guests=${encodeURIComponent(guests)}`);
  return params.length ? url + sep + params.join('&') : url;
}
function updateContactPreview() {
  document.getElementById('phContactEmail').textContent = document.getElementById('aContactEmail').value || '—';
  document.getElementById('phContactPhone').textContent = document.getElementById('aContactPhone').value || '—';
}
async function saveContact() {
  const o = await Store.getOverrides();
  const email = document.getElementById('aContactEmail').value.trim();
  const phone = document.getElementById('aContactPhone').value.trim();
  if (!email && !phone) {
    delete o.contact;
  } else {
    o.contact = { email, phone };
  }
  await Store.saveOverrides(o);
  toast("Contact info saved. Reload public pages to see updates.");
}
async function resetContact() {
  const o = await Store.getOverrides();
  delete o.contact;
  await Store.saveOverrides(o);
  initContactTab(o);
  toast("Contact info reset to defaults.");
}

// =============================================================================
// Inbox tab — list /api/contact submissions; per-row actions (read/archive/delete).
// Status pills show whether each submission was forwarded to Hospitable and
// whether the host email went out via Resend.
// =============================================================================
function initInboxTab() {
  if (!document.getElementById('inboxList')) return;
  const showArchived = document.getElementById('inboxShowArchived');
  if (showArchived && !showArchived._wired) {
    showArchived.addEventListener('change', loadInbox);
    showArchived._wired = true;
  }
  loadInbox();
}
async function loadInbox() {
  const list = document.getElementById('inboxList');
  const status = document.getElementById('inboxStatus');
  const countEl = document.getElementById('inboxCount');
  if (!list) return;
  list.innerHTML = '<p style="color: var(--color-stone);">Loading…</p>';
  if (status) status.textContent = '';
  const showArchived = document.getElementById('inboxShowArchived')?.checked ? '1' : '0';
  try {
    const r = await fetch(`/api/admin/inbox?archived=${showArchived}&limit=200`);
    const j = await r.json();
    if (!j.ok) {
      list.innerHTML = `<p style="color: var(--color-danger);">${escapeHtml(j.error || 'Failed to load.')}</p>`;
      return;
    }
    updateInboxBadge(j.counts?.unread || 0);
    if (countEl) {
      const total = j.counts?.total || 0;
      const unread = j.counts?.unread || 0;
      countEl.hidden = total === 0;
      countEl.textContent = unread > 0 ? `${unread} unread · ${total} total` : `${total} total`;
    }
    if (!j.submissions.length) {
      list.innerHTML = `<div style="padding: 3rem 2rem; text-align:center; background: var(--color-cream-dark); border-radius: 14px;">
        <strong style="display:block; margin-bottom: 0.4rem;">${showArchived === '1' ? 'No archived submissions.' : 'No submissions yet.'}</strong>
        <p style="color: var(--color-stone); margin: 0;">Messages from your <a href="/contact.html" target="_blank" rel="noopener">contact page</a> will appear here.</p>
      </div>`;
      return;
    }
    list.innerHTML = j.submissions.map(renderInboxRow).join('');
  } catch (e) {
    list.innerHTML = `<p style="color: var(--color-danger);">Couldn't load inbox: ${escapeHtml(String(e))}</p>`;
  }
}
function updateInboxBadge(unread) {
  const badge = document.getElementById('inboxBadge');
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = String(unread);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}
function renderInboxRow(s) {
  const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || '(no name)';
  const when = formatInboxDate(s.createdAt);
  const subject = encodeURIComponent(`Re: your inquiry — ${s.topic}`);
  const replyHref = `mailto:${encodeURIComponent(s.email)}?subject=${subject}`;
  // SMS consent pill — only meaningful when a phone number was provided.
  // Shown prominently next to the meta line so the host can decide whether
  // texting is appropriate before opening the message.
  let smsPill = '';
  if (s.phone) {
    smsPill = s.smsOptIn
      ? `<span class="inbox-pill is-ok" title="Guest opted in to SMS">✓ SMS OK</span>`
      : `<span class="inbox-pill is-fail" title="Guest did NOT opt in to SMS">✕ No SMS</span>`;
  }
  const hospOk = s.hospitable && s.hospitable.ok;
  const hospSkipped = s.hospitable && s.hospitable.skipped;
  const hospReason = s.hospitable?.error || (hospSkipped ? 'skipped' : 'failed');
  const hospText = hospOk ? 'Forwarded to Hospitable' : `Hospitable: ${hospReason}`;
  const emailOk = s.emailStatus && s.emailStatus.ok;
  const emailSkipped = s.emailStatus && s.emailStatus.skipped;
  const emailReason = s.emailStatus?.error || (emailSkipped ? 'skipped' : 'failed');
  const emailText = emailOk ? `Email sent to ${s.emailStatus.to || ''}` : `Email: ${emailReason}`;
  const cls = ['inbox-row'];
  if (!s.read && !s.archived) cls.push('is-unread');
  if (s.archived) cls.push('is-archived');
  return `
    <div class="${cls.join(' ')}" data-id="${s.id}">
      <div>
        <div class="inbox-from">${escapeHtml(fullName)} <span style="color: var(--color-stone); font-weight: 400;">&lt;${escapeHtml(s.email)}&gt;</span></div>
        <div class="inbox-meta" style="display:flex; align-items:center; gap: 0.5rem; flex-wrap:wrap;">
          <span><strong>${escapeHtml(s.topic || 'general')}</strong> · ${escapeHtml(when)}${s.phone ? ` · ${escapeHtml(s.phone)}` : ''}</span>
          ${smsPill}
        </div>
      </div>
      <div class="inbox-actions">
        <a class="btn btn-outline btn-sm" href="${replyHref}">Reply</a>
        ${s.read
          ? `<button class="btn btn-ghost btn-sm" onclick="inboxAction(${s.id}, 'mark-unread')">Mark unread</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="inboxAction(${s.id}, 'mark-read')">Mark read</button>`}
        ${s.archived
          ? `<button class="btn btn-ghost btn-sm" onclick="inboxAction(${s.id}, 'unarchive')">Unarchive</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="inboxAction(${s.id}, 'archive')">Archive</button>`}
        <button class="btn btn-ghost btn-sm" style="color: var(--color-danger);" onclick="inboxAction(${s.id}, 'delete')">Delete</button>
      </div>
      <div class="inbox-msg">${escapeHtml(s.message)}</div>
      <div class="inbox-status">
        <span class="inbox-pill ${hospOk ? 'is-ok' : (hospSkipped ? '' : 'is-fail')}">${hospOk ? '✓' : (hospSkipped ? '⊘' : '✕')} ${escapeHtml(hospText)}</span>
        <span class="inbox-pill ${emailOk ? 'is-ok' : (emailSkipped ? '' : 'is-fail')}">${emailOk ? '✓' : (emailSkipped ? '⊘' : '✕')} ${escapeHtml(emailText)}</span>
      </div>
    </div>`;
}
function formatInboxDate(iso) {
  if (!iso) return '';
  // Turso CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC; coerce.
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)} h ago`;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
async function inboxAction(id, action) {
  if (action === 'delete' && !confirm("Delete this submission? It can't be recovered.")) return;
  try {
    const r = await fetch('/api/admin/inbox', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action })
    });
    const j = await r.json();
    if (!j.ok) { toast(j.error || 'Action failed'); return; }
    if (action === 'delete') toast('Submission deleted.');
    loadInbox();
  } catch (e) {
    toast('Action failed: ' + e.message);
  }
}

// =============================================================================
// Bookings tab — direct booking requests from /book.html. Same UX patterns
// as the Inbox tab (mark read/unread, archive, delete) plus status changes
// (pending → confirmed | declined | cancelled) and a "Reply" mailto.
// =============================================================================
function initBookingsTab() {
  if (!document.getElementById('bookingsList')) return;
  const showArchived = document.getElementById('bookingsShowArchived');
  if (showArchived && !showArchived._wired) {
    showArchived.addEventListener('change', loadBookings);
    showArchived._wired = true;
  }
  loadBookings();
}
async function loadBookings() {
  const list = document.getElementById('bookingsList');
  const status = document.getElementById('bookingsStatus');
  const countEl = document.getElementById('bookingsCount');
  if (!list) return;
  list.innerHTML = '<p style="color: var(--color-stone);">Loading…</p>';
  if (status) status.textContent = '';
  const showArchived = document.getElementById('bookingsShowArchived')?.checked ? '1' : '0';
  try {
    const r = await fetch(`/api/admin/bookings?archived=${showArchived}&limit=200`);
    const j = await r.json();
    if (!j.ok) {
      list.innerHTML = `<p style="color: var(--color-danger);">${escapeHtml(j.error || 'Failed to load.')}</p>`;
      return;
    }
    updateBookingsBadge(j.counts?.pending || 0);
    if (countEl) {
      const total = j.counts?.total || 0;
      const pending = j.counts?.pending || 0;
      countEl.hidden = total === 0;
      countEl.textContent = pending > 0 ? `${pending} pending · ${total} total` : `${total} total`;
    }
    if (!j.bookings.length) {
      list.innerHTML = `<div style="padding: 3rem 2rem; text-align:center; background: var(--color-cream-dark); border-radius: 14px;">
        <strong style="display:block; margin-bottom: 0.4rem;">${showArchived === '1' ? 'No archived booking requests.' : 'No booking requests yet.'}</strong>
        <p style="color: var(--color-stone); margin: 0;">Direct booking requests from your property pages will appear here.</p>
      </div>`;
      return;
    }
    list.innerHTML = j.bookings.map(renderBookingRow).join('');
  } catch (e) {
    list.innerHTML = `<p style="color: var(--color-danger);">Couldn't load bookings: ${escapeHtml(String(e))}</p>`;
  }
}
function updateBookingsBadge(pending) {
  const badge = document.getElementById('bookingsBadge');
  if (!badge) return;
  if (pending > 0) {
    badge.textContent = String(pending);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}
function renderBookingRow(b) {
  const fullName = [b.firstName, b.lastName].filter(Boolean).join(' ') || '(no name)';
  const when = formatInboxDate(b.createdAt);
  const subject = encodeURIComponent(`Re: your booking request — ${b.propertyName || 'Nyris Retreats'}`);
  const replyHref = `mailto:${encodeURIComponent(b.email)}?subject=${subject}`;
  const propertyHref = b.propertySlug ? `/property.html?slug=${encodeURIComponent(b.propertySlug)}` : '#';

  // SMS pill (only when phone present)
  let smsPill = '';
  if (b.phone) {
    smsPill = b.smsOptIn
      ? `<span class="inbox-pill is-ok" title="Guest opted in to SMS">✓ SMS OK</span>`
      : `<span class="inbox-pill is-fail" title="Guest did NOT opt in to SMS">✕ No SMS</span>`;
  }

  // Status pill
  const status = b.status || 'pending';
  const statusPill = `<span class="booking-status-pill s-${status}">${status === 'pending' ? '⏳' : status === 'confirmed' ? '✓' : '✕'} ${escapeHtml(status)}</span>`;

  // Channel status pills (Hospitable quote, host email, Hospitable forward)
  const hospOk = b.hospitable && b.hospitable.ok;
  const hospSkipped = b.hospitable && b.hospitable.skipped;
  const hospReason = b.hospitable?.error || (hospSkipped ? 'skipped' : 'failed');
  const hospText = hospOk ? `Quote ${b.hospitableQuoteId ? '#' + b.hospitableQuoteId : 'created'}` : `Hospitable quote: ${hospReason}`;
  const emailOk = b.emailStatus && b.emailStatus.ok;
  const emailSkipped = b.emailStatus && b.emailStatus.skipped;
  const emailReason = b.emailStatus?.error || (emailSkipped ? 'skipped' : 'failed');
  const emailText = emailOk ? `Email sent to ${b.emailStatus.to || ''}` : `Email: ${emailReason}`;
  const fwdOk = b.forwardStatus && b.forwardStatus.ok;
  const fwdSkipped = b.forwardStatus && b.forwardStatus.skipped;
  const fwdReason = b.forwardStatus?.error || (fwdSkipped ? 'skipped' : 'failed');
  const fwdText = fwdOk ? 'Forwarded to Hospitable Inbox' : `Hospitable Inbox: ${fwdReason}`;

  // Pricing display
  const priceLine = b.quotedTotal != null
    ? `<strong>$${Number(b.quotedTotal).toLocaleString()} ${escapeHtml(b.quotedCurrency || 'USD')}</strong> ${hospOk ? '<span style="font-size: 0.75rem; color: var(--color-success);">· live Hospitable quote</span>' : '<span style="font-size: 0.75rem; color: var(--color-stone);">· estimated</span>'}`
    : '<span style="color: var(--color-stone);">No quote captured</span>';

  // Trip details mini-table
  const cls = ['inbox-row'];
  if (!b.read && !b.archived) cls.push('is-unread');
  if (b.archived) cls.push('is-archived');

  return `
    <div class="${cls.join(' ')}" data-id="${b.id}">
      <div>
        <div class="inbox-from"><a href="${propertyHref}" target="_blank" rel="noopener" style="color: var(--color-charcoal);">${escapeHtml(b.propertyName || b.propertySlug || 'Property')}</a></div>
        <div class="inbox-meta" style="display:flex; align-items:center; gap: 0.5rem; flex-wrap:wrap;">
          <span><strong>${escapeHtml(fullName)}</strong> &lt;${escapeHtml(b.email)}&gt; · ${escapeHtml(when)}${b.phone ? ` · ${escapeHtml(b.phone)}` : ''}</span>
          ${smsPill}
          ${statusPill}
        </div>
      </div>
      <div class="inbox-actions">
        <a class="btn btn-outline btn-sm" href="${replyHref}">Reply</a>
        ${b.status !== 'confirmed' ? `<button class="btn btn-primary btn-sm" onclick="bookingAction(${b.id}, 'set-status', 'confirmed')">Mark confirmed</button>` : ''}
        ${b.status !== 'declined' && b.status !== 'cancelled' ? `<button class="btn btn-ghost btn-sm" onclick="bookingAction(${b.id}, 'set-status', 'declined')">Decline</button>` : ''}
        ${b.read
          ? `<button class="btn btn-ghost btn-sm" onclick="bookingAction(${b.id}, 'mark-unread')">Mark unread</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="bookingAction(${b.id}, 'mark-read')">Mark read</button>`}
        ${b.archived
          ? `<button class="btn btn-ghost btn-sm" onclick="bookingAction(${b.id}, 'unarchive')">Unarchive</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="bookingAction(${b.id}, 'archive')">Archive</button>`}
        <button class="btn btn-ghost btn-sm" style="color: var(--color-danger);" onclick="bookingAction(${b.id}, 'delete')">Delete</button>
      </div>
      <table class="booking-trip-table">
        <tr><td>Check-in</td><td><strong>${escapeHtml(b.checkin || '')}</strong></td></tr>
        <tr><td>Check-out</td><td><strong>${escapeHtml(b.checkout || '')}</strong> · ${b.nights} night${b.nights === 1 ? '' : 's'}</td></tr>
        <tr><td>Guests</td><td>${b.guests}</td></tr>
        <tr><td>Total</td><td>${priceLine}</td></tr>
        ${b.promoCode ? `<tr><td>Promo code</td><td><code style="background: var(--color-cream-dark); padding: 0.1rem 0.4rem; border-radius: 4px;">${escapeHtml(b.promoCode)}</code></td></tr>` : ''}
      </table>
      ${b.message ? `<div class="inbox-msg">${escapeHtml(b.message)}</div>` : ''}
      <div class="inbox-status">
        <span class="inbox-pill ${hospOk ? 'is-ok' : (hospSkipped ? '' : 'is-fail')}">${hospOk ? '✓' : (hospSkipped ? '⊘' : '✕')} ${escapeHtml(hospText)}</span>
        <span class="inbox-pill ${emailOk ? 'is-ok' : (emailSkipped ? '' : 'is-fail')}">${emailOk ? '✓' : (emailSkipped ? '⊘' : '✕')} ${escapeHtml(emailText)}</span>
        <span class="inbox-pill ${fwdOk ? 'is-ok' : (fwdSkipped ? '' : 'is-fail')}">${fwdOk ? '✓' : (fwdSkipped ? '⊘' : '✕')} ${escapeHtml(fwdText)}</span>
      </div>
    </div>`;
}
async function bookingAction(id, action, value) {
  if (action === 'delete' && !confirm("Delete this booking request? It can't be recovered.")) return;
  if (action === 'set-status' && value === 'declined' && !confirm("Decline this booking request? The guest won't be auto-notified — reply to them by email if needed.")) return;
  try {
    const r = await fetch('/api/admin/bookings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, value })
    });
    const j = await r.json();
    if (!j.ok) { toast(j.error || 'Action failed'); return; }
    if (action === 'delete') toast('Booking request deleted.');
    if (action === 'set-status') toast(`Marked ${value}.`);
    loadBookings();
  } catch (e) {
    toast('Action failed: ' + e.message);
  }
}

// =============================================================================
// Branding tab
// =============================================================================
function initBrandingTab() {
  const t = Theme.get();

  // Template selector — populated once, value reflects what's saved
  const tplSel = document.getElementById('bTemplate');
  const tplDesc = document.getElementById('bTemplateDesc');
  tplSel.innerHTML = Object.entries(Theme.TEMPLATES)
    .map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  tplSel.value = Theme.TEMPLATES[t.templateId] ? t.templateId : 'default';
  tplDesc.textContent = Theme.TEMPLATES[tplSel.value].description;

  // Brand identity
  document.getElementById('bBrandName').value = t.brandName;
  document.getElementById('bBrandTagline').value = t.brandTagline;

  // Logo mode
  let mode = 'default';
  if (t.logoUrl) mode = 'url';
  else if (t.logoSvg) mode = 'svg';
  document.getElementById('bLogoUrl').value = t.logoUrl || '';
  document.getElementById('bLogoSvg').value = t.logoSvg || '';
  document.getElementById('bLogoFooterUrl').value = t.logoFooterUrl || '';
  setLogoMode(mode);

  // Fonts
  const dispSel = document.getElementById('bFontDisplay');
  const bodySel = document.getElementById('bFontBody');
  dispSel.innerHTML = Theme.FONT_OPTIONS.display.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
  bodySel.innerHTML = Theme.FONT_OPTIONS.body.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
  dispSel.value = t.fontDisplay; bodySel.value = t.fontBody;

  // Presets
  const presetSel = document.getElementById('bPreset');
  presetSel.innerHTML = `<option value="">— Apply a preset —</option>` +
    Object.entries(Theme.PRESETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');

  // Colors
  setColor('bColorPrimary', t.colors.primary);
  setColor('bColorPrimaryDark', t.colors.primaryDark);
  setColor('bColorAccent', t.colors.accent);
  setColor('bColorAccentDark', t.colors.accentDark);
  setColor('bColorCream', t.colors.cream);
  setColor('bColorSand', t.colors.sand);

  // Bind live updates
  ['bBrandName','bBrandTagline','bLogoUrl','bLogoSvg','bFontDisplay','bFontBody'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateBrandPreview);
    document.getElementById(id).addEventListener('change', updateBrandPreview);
  });
  ['bColorPrimary','bColorPrimaryDark','bColorAccent','bColorAccentDark','bColorCream','bColorSand'].forEach(id => {
    const c = document.getElementById(id);
    const hex = document.getElementById(id + 'Hex');
    c.addEventListener('input', () => { hex.value = c.value; updateBrandPreview(); });
    hex.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { c.value = hex.value; updateBrandPreview(); } });
  });

  updateBrandPreview();
}
function setColor(id, val) {
  document.getElementById(id).value = val;
  document.getElementById(id + 'Hex').value = val;
}
function setLogoMode(mode) {
  ['Default','Url','Svg'].forEach(m => {
    const btn = document.getElementById('logoMode' + m);
    btn.classList.toggle('btn-primary', m.toLowerCase() === mode);
    btn.classList.toggle('btn-outline', m.toLowerCase() !== mode);
  });
  document.getElementById('logoUrlField').style.display = mode === 'url' ? 'block' : 'none';
  document.getElementById('logoSvgField').style.display = mode === 'svg' ? 'block' : 'none';
  updateBrandPreview();
}
function applyPreset(key) {
  if (!key) return;
  const p = Theme.PRESETS[key];
  if (!p) return;
  Object.entries(p.colors).forEach(([k, v]) => {
    const map = { primary: 'bColorPrimary', primaryDark: 'bColorPrimaryDark', accent: 'bColorAccent', accentDark: 'bColorAccentDark', cream: 'bColorCream', sand: 'bColorSand' };
    if (map[k]) setColor(map[k], v);
  });
  updateBrandPreview();
}
// Switching template = full replace of the saved theme bundle (colors, fonts,
// data-template hook). Brand name / tagline / logo are preserved by
// Theme.applyTemplate. Re-init the tab so every form field reflects the new
// state — otherwise the user sees stale color pickers / font selects.
// Persists through Store.saveOverrides so picking a template on desktop
// shows up on guest mobile devices too.
async function applyTemplate(key) {
  if (!Theme.TEMPLATES[key]) return;
  const next = Theme.applyTemplate(key);
  try {
    const o = await Store.getOverrides();
    o.theme = next;
    await Store.saveOverrides(o);
  } catch (e) {
    console.warn("Remote template save failed; saved locally only", e);
  }
  initBrandingTab();
  toast(`Applied template: ${Theme.TEMPLATES[key].name}`);
}
function gatherBranding() {
  const mode = document.getElementById('logoModeUrl').classList.contains('btn-primary') ? 'url'
    : document.getElementById('logoModeSvg').classList.contains('btn-primary') ? 'svg' : 'default';
  const tplSel = document.getElementById('bTemplate');
  return {
    templateId: (tplSel && tplSel.value) || 'default',
    brandName: document.getElementById('bBrandName').value.trim(),
    brandTagline: document.getElementById('bBrandTagline').value.trim(),
    logoUrl: mode === 'url' ? document.getElementById('bLogoUrl').value.trim() : '',
    logoSvg: mode === 'svg' ? document.getElementById('bLogoSvg').value.trim() : '',
    logoFooterUrl: document.getElementById('bLogoFooterUrl').value.trim(),
    fontDisplay: document.getElementById('bFontDisplay').value,
    fontBody: document.getElementById('bFontBody').value,
    colors: {
      primary: document.getElementById('bColorPrimary').value,
      primaryDark: document.getElementById('bColorPrimaryDark').value,
      primaryLight: lightenColor(document.getElementById('bColorPrimary').value, 0.15),
      accent: document.getElementById('bColorAccent').value,
      accentDark: document.getElementById('bColorAccentDark').value,
      cream: document.getElementById('bColorCream').value,
      creamDark: darkenColor(document.getElementById('bColorCream').value, 0.04),
      sand: document.getElementById('bColorSand').value,
      charcoal: "#1A1A1A",
      stone: "#6B7568",
      success: "#2C7A5A",
      danger: "#B14A3F"
    }
  };
}
function updateBrandPreview() {
  const t = gatherBranding();
  Theme.apply(t); // live-apply to whole page

  const preview = document.getElementById('brandPreview');
  const customLogo = !!(t.logoUrl || t.logoSvg);
  preview.innerHTML = `
    <div class="brand-mark${customLogo ? ' brand-mark-custom' : ''}" style="color: ${t.colors.primary}; font-family: '${t.fontDisplay}', serif; font-size: 1.6rem; font-weight: 600; margin-bottom: 1.5rem;">
      ${Theme.logoMark(t)}
      ${customLogo ? '' : `<span style="font-family: '${t.fontDisplay}', serif;">${escapeHtml(t.brandName)}</span>`}
    </div>
    <h2 style="font-family: '${t.fontDisplay}', serif; font-size: 2rem; line-height: 1.15; color: var(--color-charcoal); margin: 0 0 0.5rem;">Stay where the reviews don't lie.</h2>
    <p style="font-family: '${t.fontBody}', sans-serif; color: var(--color-stone); margin: 0 0 1.5rem;">${escapeHtml(t.brandTagline)}</p>
    <div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem;">
      <button class="btn" style="background: ${t.colors.primary}; color: ${t.colors.cream};">Browse stays</button>
      <button class="btn" style="background: ${t.colors.accent}; color: white;">Reserve</button>
    </div>
    <div style="border: 1px solid var(--color-line); border-radius: 14px; padding: 1rem; background: white;">
      <div style="aspect-ratio: 4/3; background: ${t.colors.sand} url('${NYRIS.properties[0].images[0]}') center/cover; border-radius: 10px; margin-bottom: 0.75rem;"></div>
      <div style="font-family: '${t.fontBody}', sans-serif; font-weight: 600;">${escapeHtml(NYRIS.properties[0].name)}</div>
      <div style="font-family: '${t.fontBody}', sans-serif; color: var(--color-stone); font-size: 0.9rem;">${NYRIS.properties[0].city}, ${NYRIS.properties[0].state} · From $${NYRIS.properties[0].basePrice}/night</div>
    </div>
  `;
}
async function saveBranding() {
  const t = gatherBranding();
  Theme.set(t); // localStorage + apply on this device for instant feedback
  // Persist to server overrides so visitors on other devices / browsers
  // (mobile, guests, signed-out tabs) get the same theme. Without this
  // the theme stays trapped in admin's localStorage only.
  try {
    const o = await Store.getOverrides();
    o.theme = t;
    await Store.saveOverrides(o);
  } catch (e) {
    console.warn("Remote theme save failed; saved locally only", e);
  }
  toast("Branding saved. Applied site-wide.");
}
async function resetBranding() {
  if (!confirm("Reset all branding to defaults?")) return;
  Theme.reset();
  try {
    const o = await Store.getOverrides();
    delete o.theme;
    await Store.saveOverrides(o);
  } catch (e) {
    console.warn("Remote theme reset failed; reset locally only", e);
  }
  initBrandingTab();
  toast("Branding reset to defaults.");
}
function lightenColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amt));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amt));
  const b = Math.min(255, (n & 0xff) + Math.round(255 * amt));
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}
function darkenColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amt));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amt));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amt));
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

// =============================================================================
// Photos tab
// =============================================================================
let _currentPhotoProperty = null;

function initPhotosTab() {
  const sel = document.getElementById('photoPropSelect');
  sel.innerHTML = NYRIS.properties.map(p => `<option value="${p.id}">${escapeHtml(p.name)} — ${p.city}, ${p.state}</option>`).join('');
  // Restore last-selected property (slug → id translation) before binding
  // change so the existing handler isn't fired twice on init.
  const ctxSlug = PropertyContext.get();
  const ctxProp = PropertyContext.bySlug(ctxSlug);
  if (ctxProp) sel.value = ctxProp.id;
  sel.addEventListener('change', () => {
    const prop = PropertyContext.byId(sel.value);
    if (prop) PropertyContext.set(prop.slug);
    loadPropertyPhotos(sel.value);
    renderPhotoCrossLinks(prop?.slug);
  });
  loadPropertyPhotos(sel.value);
  // Seed cross-tab links + sync context to whatever's selected on first load.
  const initialProp = PropertyContext.byId(sel.value);
  if (initialProp && !ctxSlug) PropertyContext.set(initialProp.slug);
  renderPhotoCrossLinks(initialProp?.slug);
}

async function loadPropertyPhotos(propertyId) {
  _currentPhotoProperty = propertyId;
  const board = document.getElementById('photoBoard');
  board.innerHTML = '<p style="color: var(--color-stone);">Loading photos...</p>';

  // Get base photos from data
  const prop = NYRIS.properties.find(p => p.id === propertyId);
  const basePhotos = (prop?.images || []).map((url, i) => ({ url, caption: '', order: i, source: 'hospitable' }));

  // Get overrides (custom photos, hidden, captions, order)
  let photos = basePhotos;
  if (await RemoteStore.probe()) {
    const remote = await RemoteStore.getPhotos(propertyId);
    if (remote && remote.length) photos = mergePhotos(basePhotos, remote);
  } else {
    const o = await Store.getOverrides();
    const local = (o.photos && o.photos[propertyId]) || null;
    if (local) photos = mergePhotos(basePhotos, local);
  }

  renderPhotoBoard(photos);
}

function mergePhotos(base, override) {
  // Override is an array with: { url, caption, isCover, isHidden, source } in desired order
  // Ensure every override item is included; append base photos not in override at the end.
  const overrideUrls = new Set(override.map(p => p.url));
  const newBase = base.filter(b => !overrideUrls.has(b.url));
  return [...override, ...newBase];
}

function renderPhotoBoard(photos) {
  const board = document.getElementById('photoBoard');
  board.innerHTML = `
    <p style="color: var(--color-stone); font-size: 0.88rem; margin: 0 0 1rem;">
      Click <strong>Set as cover</strong> on any photo to make it the main image used in property cards and as the first photo in the gallery. Drag tiles to reorder. Changes save automatically.
    </p>
    <div id="photoGrid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;"></div>
    <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
      <button class="btn btn-outline" onclick="addCustomPhoto()">+ Add photo</button>
      <button class="btn btn-ghost" onclick="resetPhotos()">Reset to Hospitable</button>
    </div>`;
  const grid = document.getElementById('photoGrid');

  // Determine effective cover (explicit isCover, else first non-hidden photo)
  const visible = photos.filter(p => !p.isHidden);
  const explicitCover = visible.find(p => p.isCover);
  const effectiveCoverUrl = (explicitCover || visible[0])?.url;

  grid.innerHTML = visible.map(p => {
    const isCover = p.url === effectiveCoverUrl;
    return `
      <div class="photo-tile ${isCover ? 'cover' : ''}" draggable="true" data-url="${escapeAttr(p.url)}">
        ${isCover
          ? `<span class="cover-tag-fixed">★ Cover</span>`
          : `<button class="set-cover-btn" onclick="setCover('${escapeAttr(p.url)}')" title="Make this the cover photo">★ Set as cover</button>`}
        <img src="${p.url}" alt="" loading="lazy"/>
        <div class="overlay">
          <div class="actions">
            <button title="Edit caption" onclick="editCaption('${escapeAttr(p.url)}')" type="button">✎</button>
            <button title="Remove from public site" onclick="hidePhoto('${escapeAttr(p.url)}')" type="button">×</button>
          </div>
          <div class="cap">${escapeHtml(p.caption || '')}</div>
        </div>
      </div>`;
  }).join('');
  bindPhotoDrag();
  grid.dataset.photos = JSON.stringify(photos);
}

function bindPhotoDrag() {
  let dragSrc = null;
  document.querySelectorAll('.photo-tile').forEach(tile => {
    tile.addEventListener('dragstart', () => { dragSrc = tile; tile.classList.add('dragging'); });
    tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
    tile.addEventListener('dragover', e => e.preventDefault());
    tile.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === tile) return;
      const list = tile.parentNode;
      const tiles = [...list.children];
      const si = tiles.indexOf(dragSrc), ti = tiles.indexOf(tile);
      if (si < ti) tile.after(dragSrc); else tile.before(dragSrc);
      // Auto-save the new order
      persistPhotos(getCurrentPhotos(), "Order saved");
    });
  });
}

function getCurrentPhotos() {
  const grid = document.getElementById('photoGrid');
  if (!grid) return [];
  const stashed = JSON.parse(grid.dataset.photos || '[]');
  // Re-derive order from DOM (drag may have moved them)
  const order = [...grid.querySelectorAll('.photo-tile')].map(t => t.dataset.url);
  const visibleByUrl = new Map(stashed.filter(p => !p.isHidden).map(p => [p.url, p]));
  const reordered = order.map(u => visibleByUrl.get(u)).filter(Boolean);
  // Append hidden ones (keep them in storage so they can be restored)
  const hidden = stashed.filter(p => p.isHidden);
  return [...reordered, ...hidden];
}

async function setCover(url) {
  const photos = getCurrentPhotos().map(p => ({ ...p, isCover: p.url === url }));
  const cover = photos.find(p => p.isCover);
  const rest = photos.filter(p => !p.isCover);
  const reordered = [cover, ...rest];
  renderPhotoBoard(reordered);
  await persistPhotos(reordered, "Cover updated");
}
function editCaption(url) {
  const photos = getCurrentPhotos();
  const p = photos.find(x => x.url === url);
  const next = prompt("Caption (shown in lightbox):", p.caption || "");
  if (next === null) return;
  p.caption = next;
  renderPhotoBoard(photos);
  persistPhotos(photos, "Caption saved");
}
async function hidePhoto(url) {
  if (!confirm("Hide this photo from the public site? You can restore it from the photos tab later.")) return;
  const photos = getCurrentPhotos().map(p => p.url === url ? { ...p, isHidden: true } : p);
  renderPhotoBoard(photos);
  await persistPhotos(photos, "Photo removed");
}

// Auto-save photo changes to whichever store is configured
async function persistPhotos(photos, successMsg) {
  try {
    if (await RemoteStore.probe()) {
      await RemoteStore.savePhotos(_currentPhotoProperty, photos);
    } else {
      const o = await Store.getOverrides();
      o.photos = o.photos || {};
      o.photos[_currentPhotoProperty] = photos;
      await Store.saveOverrides(o);
    }
    if (successMsg) toast(successMsg);
  } catch (e) {
    toast(`Save failed: ${e.message}`);
  }
}
function addCustomPhoto() {
  openUploadDialog({
    title: "Add a property photo",
    pathPrefix: `photos/${_currentPhotoProperty || "misc"}`,
    captionField: true,
    onUploaded: (url, caption) => {
      const photos = getCurrentPhotos();
      photos.push({ url, caption: caption || "", source: "custom" });
      renderPhotoBoard(photos);
      toast("Photo added");
      persistPhotos(photos);
    }
  });
}

function openLogoUpload() {
  openUploadDialog({
    title: "Upload logo",
    subtitle: "Transparent PNG or SVG sized ~100×100 works best.",
    pathPrefix: "branding",
    captionField: false,
    onUploaded: (url) => {
      const inp = document.getElementById("bLogoUrl");
      if (inp) inp.value = url;
      setLogoMode("url");
      if (typeof updateBrandPreview === "function") updateBrandPreview();
      toast("Logo image uploaded. Click Save branding to apply.");
    }
  });
}
function openFooterLogoUpload() {
  openUploadDialog({
    title: "Upload footer logo",
    subtitle: "Optional light-on-dark variant for the footer band.",
    pathPrefix: "branding/footer",
    captionField: false,
    onUploaded: (url) => {
      const inp = document.getElementById("bLogoFooterUrl");
      if (inp) inp.value = url;
      toast("Footer logo uploaded. Click Save branding to apply.");
    }
  });
}

function openHeroUpload() {
  openUploadDialog({
    title: "Upload hero background",
    subtitle: "Wide image at least 1920×1080 recommended.",
    pathPrefix: "branding/hero",
    captionField: false,
    onUploaded: (url) => {
      const inp = document.getElementById("aHImg");
      if (inp) inp.value = url;
      if (typeof updateHeroPreview === "function") updateHeroPreview();
      toast("Hero image uploaded. Click Save changes to apply.");
    }
  });
}

// =============================================================================
// Resilient loader for the Vercel Blob client SDK. esm.sh is the primary
// source; jsDelivr is the fallback. Either CDN being reachable is enough.
// Cached after first success so subsequent uploads don't refetch.
let _blobClientPromise = null;
function loadBlobClient() {
  if (_blobClientPromise) return _blobClientPromise;
  const sources = [
    "https://esm.sh/@vercel/blob@2.3.3/client",
    "https://cdn.jsdelivr.net/npm/@vercel/blob@2.3.3/client/+esm"
  ];
  _blobClientPromise = (async () => {
    let lastErr;
    for (const src of sources) {
      try {
        const mod = await import(src);
        if (mod && typeof mod.upload === "function") return mod;
        lastErr = new Error(`Loaded ${src} but it had no 'upload' export`);
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(
      "Couldn't load the Vercel Blob upload client from any CDN. " +
      "Check your network, then retry. " +
      "(Last error: " + (lastErr && lastErr.message ? lastErr.message : lastErr) + ")"
    );
  })();
  // If the chain throws, drop the cached rejection so the next click retries.
  _blobClientPromise.catch(() => { _blobClientPromise = null; });
  return _blobClientPromise;
}

// Generic upload dialog (Upload from PC | Paste URL tabs)
// Used by: property photos, branding logo, hero image. Pass an onUploaded
// callback that receives (url, caption) when the user confirms either tab.
// =============================================================================
let _uploadOpts = {};
function openUploadDialog(opts = {}) {
  _uploadOpts = {
    title: "Add an image",
    subtitle: "",
    pathPrefix: "misc",
    captionField: true,
    onUploaded: () => {},
    ...opts
  };
  document.getElementById("photoUploadDialog")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "photoUploadDialog";
  overlay.style.cssText = "position: fixed; inset: 0; background: rgba(20,30,25,0.55); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1.5rem;";
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const cap = !!_uploadOpts.captionField;
  overlay.innerHTML = `
    <div style="background: var(--color-cream); border-radius: 18px; max-width: 540px; width: 100%; box-shadow: var(--shadow-xl); overflow: hidden;" onclick="event.stopPropagation()">
      <div style="padding: 1.25rem 1.75rem; border-bottom: 1px solid var(--color-line); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 style="margin: 0; font-size: 1.2rem;">${escapeHtml(_uploadOpts.title)}</h3>
          ${_uploadOpts.subtitle ? `<p style="margin: 0.2rem 0 0; color: var(--color-stone); font-size: 0.85rem;">${escapeHtml(_uploadOpts.subtitle)}</p>` : ""}
        </div>
        <button class="icon-btn" onclick="document.getElementById('photoUploadDialog').remove()" aria-label="Close">${ICON.close.replace('width="22" height="22"','width="20" height="20"')}</button>
      </div>
      <div style="padding: 0; border-bottom: 1px solid var(--color-line); display:flex;">
        <button id="phTabUpload" class="ph-tab" style="flex:1; padding: 0.85rem; font-weight: 500; border-bottom: 2px solid var(--color-primary); color: var(--color-primary);" onclick="switchPhotoDialogTab('upload')">Upload from computer</button>
        <button id="phTabUrl" class="ph-tab" style="flex:1; padding: 0.85rem; font-weight: 500; border-bottom: 2px solid transparent; color: var(--color-stone);" onclick="switchPhotoDialogTab('url')">Paste URL</button>
      </div>
      <div id="phPanelUpload" style="padding: 1.75rem;">
        <input type="file" id="phFileInput" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml" style="display:none"/>
        <div id="phDropzone" style="border: 2px dashed var(--color-line); border-radius: 12px; padding: 2rem; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; user-select: none;">
          <div id="phDropzoneInner" style="pointer-events: none;">
            <div style="font-size: 2.4rem; line-height: 1; margin-bottom: 0.5rem; color: var(--color-stone);">↑</div>
            <strong style="display:block; margin-bottom: 0.25rem;">Drop an image here</strong>
            <span style="color: var(--color-stone); font-size: 0.9rem;">or click to choose a file (JPEG, PNG, WebP, SVG — max 20 MB)</span>
          </div>
        </div>
        ${cap ? `<label class="form-label" style="margin-top: 1.25rem;">Caption (optional)</label>
        <input class="form-control" id="phUploadCaption" placeholder="e.g. Sunset deck — perfect for evening drinks"/>` : `<input type="hidden" id="phUploadCaption" value=""/>`}
        <div id="phUploadStatus" style="margin-top: 1rem; font-size: 0.9rem; min-height: 24px;"></div>
        <div style="display:flex; gap: 0.5rem; margin-top: 1.25rem;">
          <button class="btn btn-primary" id="phUploadBtn" onclick="doPhotoUpload()" disabled style="opacity: 0.5;">Upload</button>
          <button class="btn btn-ghost" onclick="document.getElementById('photoUploadDialog').remove()">Cancel</button>
        </div>
      </div>
      <div id="phPanelUrl" style="padding: 1.75rem; display:none;">
        <label class="form-label">Image URL</label>
        <input class="form-control" id="phUrlInput" placeholder="https://...jpg" style="font-family: monospace; font-size: 0.9rem;"/>
        <p style="color: var(--color-stone); font-size: 0.82rem; margin: 0.4rem 0 0;">Must be publicly accessible.</p>
        ${cap ? `<label class="form-label" style="margin-top: 1.25rem;">Caption (optional)</label>
        <input class="form-control" id="phUrlCaption" placeholder="e.g. Sunset deck — perfect for evening drinks"/>` : `<input type="hidden" id="phUrlCaption" value=""/>`}
        <div style="display:flex; gap: 0.5rem; margin-top: 1.5rem;">
          <button class="btn btn-primary" onclick="doPhotoFromUrl()">Use this URL</button>
          <button class="btn btn-ghost" onclick="document.getElementById('photoUploadDialog').remove()">Cancel</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setupPhotoDropzone();
}

function switchPhotoDialogTab(tab) {
  const isUpload = tab === "upload";
  document.getElementById("phTabUpload").style.cssText = `flex:1; padding: 0.85rem; font-weight: 500; border-bottom: 2px solid ${isUpload ? "var(--color-primary)" : "transparent"}; color: ${isUpload ? "var(--color-primary)" : "var(--color-stone)"};`;
  document.getElementById("phTabUrl").style.cssText = `flex:1; padding: 0.85rem; font-weight: 500; border-bottom: 2px solid ${!isUpload ? "var(--color-primary)" : "transparent"}; color: ${!isUpload ? "var(--color-primary)" : "var(--color-stone)"};`;
  document.getElementById("phPanelUpload").style.display = isUpload ? "block" : "none";
  document.getElementById("phPanelUrl").style.display = isUpload ? "none" : "block";
}

let _selectedPhotoFile = null;

function setupPhotoDropzone() {
  const zone = document.getElementById("phDropzone");
  const input = document.getElementById("phFileInput");
  const status = document.getElementById("phUploadStatus");
  const btn = document.getElementById("phUploadBtn");

  // Block the browser from opening dropped files anywhere on the page while
  // the dialog is open. (Outside the zone, we still preventDefault so the
  // user doesn't accidentally navigate away if their drop misses by a pixel.)
  const blockDefault = (e) => { e.preventDefault(); };
  document.addEventListener("dragover", blockDefault);
  document.addEventListener("drop", blockDefault);
  // Tear those listeners down when the dialog closes.
  const dialogEl = document.getElementById("photoUploadDialog");
  const cleanup = new MutationObserver(() => {
    if (!document.body.contains(dialogEl)) {
      document.removeEventListener("dragover", blockDefault);
      document.removeEventListener("drop", blockDefault);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true });

  // Click → file picker. The dropzone's inner content has pointer-events: none,
  // so the click reliably reaches the zone itself.
  zone.addEventListener("click", () => input.click());

  // Drag counter pattern — gives stable enter/leave behavior even when the
  // cursor crosses nested children of the zone.
  let dragCount = 0;
  const setActive = (active) => {
    zone.style.borderColor = active ? "var(--color-primary)" : "var(--color-line)";
    zone.style.background = active ? "rgba(31,61,43,0.06)" : "transparent";
  };
  zone.addEventListener("dragenter", (e) => { e.preventDefault(); dragCount++; setActive(true); });
  zone.addEventListener("dragleave", (e) => { e.preventDefault(); dragCount = Math.max(0, dragCount - 1); if (dragCount === 0) setActive(false); });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCount = 0;
    setActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleSelectedFile(file);
  });

  input.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) handleSelectedFile(file);
  });

  function handleSelectedFile(file) {
    if (!file.type.startsWith("image/")) {
      status.style.color = "var(--color-danger)"; status.textContent = "Pick an image file (JPEG, PNG, WebP).";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      status.style.color = "var(--color-danger)";
      status.textContent = `That's ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 20 MB. Compress at squoosh.app and try again.`;
      return;
    }
    _selectedPhotoFile = file;
    status.style.color = "var(--color-charcoal)";
    status.innerHTML = `<strong>${escapeHtml(file.name)}</strong> · ${(file.size / 1024 / 1024).toFixed(2)} MB · ${escapeHtml(file.type)} ready to upload`;
    btn.disabled = false; btn.style.opacity = "1";
    // Show inline preview. Replace only the inner content; the zone itself and
    // its event listeners remain intact, so a second drop still works.
    const reader = new FileReader();
    reader.onload = () => {
      const inner = document.getElementById("phDropzoneInner") || zone;
      inner.style.pointerEvents = "none";
      inner.innerHTML = `<img src="${reader.result}" alt="" style="max-height: 180px; max-width: 100%; border-radius: 8px; display: block; margin: 0 auto;"/>
        <div style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--color-stone);">Click or drop a different image to replace</div>`;
    };
    reader.readAsDataURL(file);
  }
}

async function doPhotoUpload() {
  const original = _selectedPhotoFile;
  if (!original) return;
  const caption = document.getElementById("phUploadCaption").value.trim();
  const status = document.getElementById("phUploadStatus");
  const btn = document.getElementById("phUploadBtn");
  btn.disabled = true; btn.style.opacity = "0.5"; btn.textContent = "Compressing…";
  status.style.color = "var(--color-stone)"; status.textContent = `Compressing ${original.name}…`;

  try {
    // Compress and resize client-side before upload.
    // Caps long edge at 1920px and re-encodes as JPEG at q=0.86. Property
    // photos rarely benefit from larger or PNG. Reduces typical 3-8 MB
    // PNGs to 300-700 KB JPEGs that load reliably on any connection.
    const file = await compressImage(original, { maxEdge: 1920, quality: 0.86 });
    btn.textContent = "Uploading…";
    status.textContent = `Uploading ${file.name} · ${(file.size / 1024).toFixed(0)} KB${original.size !== file.size ? ` (was ${(original.size / 1024 / 1024).toFixed(1)} MB)` : ""}…`;

    // Load the Vercel Blob client lib from a CDN. We avoid a build step by
    // dynamic-importing the ESM bundle. Try esm.sh first, fall back to
    // jsDelivr if it's unreachable (some networks block esm.sh; jsDelivr
    // is reachable from a different IP range / CDN backbone).
    const { upload } = await loadBlobClient();

    // Build a pathname under the upload's pathPrefix.
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 60) || "photo";
    const prefix = _uploadOpts.pathPrefix || "misc";
    const pathname = `${prefix}/${safeName}`;

    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/admin/upload",
      contentType: file.type,
      clientPayload: JSON.stringify({ propertyId: _currentPhotoProperty, pathPrefix: prefix })
    });

    // Success — invoke the dialog's onUploaded callback (which decides
    // what to do with the URL — add to property photos, set logo, etc.)
    document.getElementById("photoUploadDialog").remove();
    const savedPct = original.size > file.size ? ` (saved ${Math.round((1 - file.size/original.size)*100)}%)` : "";
    toast(`Uploaded · ${(file.size / 1024).toFixed(0)} KB${savedPct}`);
    _selectedPhotoFile = null;
    if (typeof _uploadOpts.onUploaded === "function") {
      _uploadOpts.onUploaded(blob.url, caption);
    }
  } catch (e) {
    status.style.color = "var(--color-danger)";
    status.innerHTML = `<strong>Upload error:</strong> ${escapeHtml(String(e.message || e))}`;
    btn.disabled = false; btn.style.opacity = "1"; btn.textContent = "Upload";
  }
}

// Compress + resize an image File client-side using a canvas. Returns a new
// File with the compressed bytes. Falls back to the original if anything goes
// wrong or if the image is already smaller than the target.
async function compressImage(file, { maxEdge = 1920, quality = 0.86 } = {}) {
  // GIF/SVG: don't touch (would lose animation / vector advantages)
  if (/^image\/(gif|svg)/i.test(file.type)) return file;

  try {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result); r.onerror = rej;
      r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = dataUrl;
    });

    let { width, height } = { width: img.naturalWidth, height: img.naturalHeight };
    const longEdge = Math.max(width, height);
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // compression didn't help

    // Build a new File with .jpg extension
    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function doPhotoFromUrl() {
  const url = document.getElementById("phUrlInput").value.trim();
  const caption = document.getElementById("phUrlCaption")?.value?.trim() || "";
  if (!url || !/^https?:\/\//.test(url)) { toast("Enter a valid URL starting with http(s)://"); return; }
  document.getElementById("photoUploadDialog").remove();
  if (typeof _uploadOpts.onUploaded === "function") {
    _uploadOpts.onUploaded(url, caption);
  }
}
async function savePhotoChanges() {
  const photos = getCurrentPhotos();
  if (await RemoteStore.probe()) {
    await RemoteStore.savePhotos(_currentPhotoProperty, photos);
  } else {
    const o = await Store.getOverrides();
    o.photos = o.photos || {};
    o.photos[_currentPhotoProperty] = photos;
    await Store.saveOverrides(o);
  }
  toast("Photo changes saved.");
}
async function resetPhotos() {
  if (!confirm("Reset photos for this property to Hospitable defaults?")) return;
  if (await RemoteStore.probe()) {
    await RemoteStore.savePhotos(_currentPhotoProperty, []);
  } else {
    const o = await Store.getOverrides();
    if (o.photos) delete o.photos[_currentPhotoProperty];
    await Store.saveOverrides(o);
  }
  loadPropertyPhotos(_currentPhotoProperty);
  toast("Photos reset.");
}

async function syncPropertyPhotos() {
  const status = document.getElementById('photoSyncStatus');
  status.textContent = "Syncing from Hospitable...";
  try {
    const r = await fetch(`/api/hospitable/property?uuid=${_currentPhotoProperty}`);
    const j = await r.json();
    if (!j.ok || !j.images) {
      status.textContent = `⚠ ${j.error || 'sync failed'}`;
      if (j.mock) toast("Add HOSPITABLE_API_KEY to Vercel env vars to enable live sync");
      return;
    }

    // Merge fetched Hospitable photos with whatever the user has already
    // customized (reordering, custom uploads, captions, hidden, cover).
    // - Photos the user has saved (any source) keep their position + flags.
    // - New Hospitable photos that aren't already in the saved list get
    //   appended in the order Hospitable returned them.
    // - Hospitable photos that are no longer in the API response are kept
    //   (could be temporary), unless they were hidden and have no other
    //   reason to keep them — we leave them alone for safety.
    const fetched = j.images.map(i => ({
      url: i.url,
      caption: i.caption || "",
      isCover: false,
      isHidden: false,
      source: "hospitable"
    }));

    const remote = await RemoteStore.getPhotos(_currentPhotoProperty);
    const existing = (remote && remote.length) ? remote : [];
    const existingByUrl = new Map(existing.map(p => [p.url, p]));
    // Existing photos in user-defined order, but with caption refreshed
    // from Hospitable when applicable.
    const merged = existing.map(p => {
      const f = fetched.find(x => x.url === p.url);
      return f ? { ...p, caption: p.caption || f.caption } : p;
    });
    // Append any newly-discovered Hospitable photos
    let added = 0;
    for (const f of fetched) {
      if (!existingByUrl.has(f.url)) {
        merged.push(f);
        added++;
      }
    }

    // If there are still no override rows at all (first-time sync), also
    // make sure the very first Hospitable photo is flagged as cover so
    // the board has a sensible default.
    if (existing.length === 0 && merged.length > 0 && !merged.some(p => p.isCover)) {
      merged[0].isCover = true;
    }

    await RemoteStore.savePhotos(_currentPhotoProperty, merged);

    const total = merged.filter(p => !p.isHidden).length;
    status.textContent = `✓ ${j.images.length} from Hospitable · ${added} new · ${total} total · ${new Date(j.fetchedAt).toLocaleTimeString()}`;
    toast(`Pulled ${j.images.length} from Hospitable (${added} new)`);
    loadPropertyPhotos(_currentPhotoProperty);
  } catch (e) {
    status.textContent = `⚠ ${e.message}`;
  }
}

// =============================================================================
// Property details tab
// =============================================================================
function initPropertiesTab(o) {
  const wrap = document.getElementById('propOverrides');
  wrap.innerHTML = NYRIS.properties.map(p => {
    const ov = (o.props && o.props[p.slug]) || {};
    return `
      <div data-prop-card="${escapeAttr(p.slug)}" style="background: white; border: 1px solid var(--color-line); border-radius: 14px; padding: 1.5rem; margin-bottom: 1rem;">
        <div style="display:flex; align-items:center; gap: 1rem; margin-bottom: 1.25rem;">
          <img src="${p.images[0]}" alt="" style="width: 80px; height: 60px; object-fit: cover; border-radius: 8px;"/>
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <div style="color: var(--color-stone); font-size: 0.85rem;">${p.city}, ${p.state}</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;" class="prop-fields">
          <div><label class="form-label">Display name</label><input class="form-control" data-prop-slug="${p.slug}" data-prop-field="name" placeholder="${escapeAttr(p.name)}" value="${escapeAttr(ov.name || '')}"/></div>
          <div><label class="form-label">Tagline</label><input class="form-control" data-prop-slug="${p.slug}" data-prop-field="tagline" placeholder="${escapeAttr(p.tagline)}" value="${escapeAttr(ov.tagline || '')}"/></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;" class="prop-fields">
          <div><label class="form-label">Starting price ($/night)</label><input class="form-control" type="number" min="0" data-prop-slug="${p.slug}" data-prop-field="basePrice" placeholder="${p.basePrice}" value="${ov.basePrice || ''}"/></div>
          <div><label class="form-label">Cleaning fee ($)</label><input class="form-control" type="number" min="0" data-prop-slug="${p.slug}" data-prop-field="cleaningFee" placeholder="${p.cleaningFee != null ? p.cleaningFee : 165}" value="${ov.cleaningFee != null ? ov.cleaningFee : ''}"/></div>
        </div>
        <details style="margin-top: 1rem;">
          <summary style="cursor: pointer; font-size: 0.92rem; color: var(--color-stone); user-select: none;">Channel listing URLs (override Hospitable)</summary>
          <p style="font-size: 0.82rem; color: var(--color-stone); margin: 0.65rem 0 0.85rem; line-height: 1.5;">By default, the property page pulls these from Hospitable's connected channels. Fill any of these to override Hospitable's URL for that channel. Leave blank to use Hospitable's value (or hide the link if Hospitable has none).</p>
          <div style="display:grid; gap: 0.65rem;">
            <div><label class="form-label">Airbnb URL</label><input class="form-control" type="url" data-prop-slug="${p.slug}" data-prop-field="airbnbUrl" placeholder="https://www.airbnb.com/rooms/12345678" value="${escapeAttr(ov.airbnbUrl || '')}" style="font-family: ui-monospace, monospace; font-size: 0.85rem;"/></div>
            <div><label class="form-label">Vrbo URL</label><input class="form-control" type="url" data-prop-slug="${p.slug}" data-prop-field="vrboUrl" placeholder="https://www.vrbo.com/1234567" value="${escapeAttr(ov.vrboUrl || '')}" style="font-family: ui-monospace, monospace; font-size: 0.85rem;"/></div>
            <div><label class="form-label">Booking.com URL</label><input class="form-control" type="url" data-prop-slug="${p.slug}" data-prop-field="bookingUrl" placeholder="https://www.booking.com/hotel/..." value="${escapeAttr(ov.bookingUrl || '')}" style="font-family: ui-monospace, monospace; font-size: 0.85rem;"/></div>
          </div>
        </details>
        <details style="margin-top: 0.5rem;">
          <summary style="cursor: pointer; font-size: 0.92rem; color: var(--color-stone); user-select: none;">Hospitable booking widget snippet (this property)</summary>
          <p style="font-size: 0.82rem; color: var(--color-stone); margin: 0.65rem 0 0.85rem; line-height: 1.5;">Paste the widget code Hospitable gave you for <strong>this specific property</strong>. Get it at Hospitable → <em>Direct Bookings → Website tab</em> → click <em>Create a site</em> → choose <em>I already have a site</em> → check this property → three-dot menu → <em>Copy widget code</em>. When set + provider above is "Hospitable Direct widget", this replaces the default Reserve widget on this property's page only.</p>
          <textarea class="form-control" data-prop-slug="${p.slug}" data-prop-field="hospitableEmbed" rows="5" placeholder="Paste this property's unique Hospitable widget snippet — script + div tags" style="font-family: ui-monospace, monospace; font-size: 0.8rem; resize: vertical;">${escapeHtml(ov.hospitableEmbed || '')}</textarea>
        </details>
      </div>`;
  }).join('');
  // Bind change (fires on blur for inputs/textareas) AND a debounced input
  // (fires on every keystroke / paste). Without `input`, a paste-and-refresh
  // sequence loses the snippet because `change` only fires on blur. The
  // debouncer prevents writing to Turso on every keystroke.
  document.querySelectorAll('[data-prop-slug]').forEach(el => {
    el.addEventListener('change', savePropOverride);
    let debounceTimer;
    el.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => savePropOverride(e), 600);
    });
  });
}
async function savePropOverride(e) {
  const o = await Store.getOverrides();
  o.props = o.props || {};
  const slug = e.target.dataset.propSlug;
  const field = e.target.dataset.propField;
  const val = e.target.value.trim();
  o.props[slug] = o.props[slug] || {};
  if (val) {
    o.props[slug][field] = (field === 'basePrice' || field === 'cleaningFee') ? parseFloat(val) : val;
  } else {
    delete o.props[slug][field];
  }
  await Store.saveOverrides(o);
  toast("Saved.");
}

// =============================================================================
// Featured order tab
// =============================================================================
function initOrderTab(o) {
  const orderList = document.getElementById('orderList');
  const order = o.featuredOrder || NYRIS.properties.map(p => p.slug);
  const seen = new Set(order);
  for (const p of NYRIS.properties) if (!seen.has(p.slug)) order.push(p.slug);
  orderList.innerHTML = order.map(slug => {
    const p = NYRIS.properties.find(x => x.slug === slug);
    if (!p) return '';
    return `
      <li class="order-item" draggable="true" data-slug="${slug}" style="display:flex; align-items:center; gap: 1rem; padding: 1rem; background: white; border: 1px solid var(--color-line); border-radius: 12px; margin-bottom: 0.5rem; cursor: grab;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--color-stone);"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>
        <img src="${p.images[0]}" alt="" style="width: 60px; height: 50px; object-fit: cover; border-radius: 6px;"/>
        <div style="flex:1;">
          <strong>${escapeHtml(p.name)}</strong>
          <div style="color: var(--color-stone); font-size: 0.85rem;">${p.city}, ${p.state} · $${p.basePrice}/night</div>
        </div>
        <span style="font-size: 0.85rem; color: var(--color-stone);">★ ${p.rating.toFixed(1)} (${p.reviewCount})</span>
      </li>`;
  }).join('');
  bindDragOrder();
}
function bindDragOrder() {
  let dragSrc = null;
  document.querySelectorAll('.order-item').forEach(item => {
    item.addEventListener('dragstart', () => { dragSrc = item; item.style.opacity = '0.4'; });
    item.addEventListener('dragend', () => item.style.opacity = '1');
    item.addEventListener('dragover', e => e.preventDefault());
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrc && dragSrc !== item) {
        const list = item.parentNode;
        const items = [...list.children];
        const srcIdx = items.indexOf(dragSrc), tgtIdx = items.indexOf(item);
        if (srcIdx < tgtIdx) item.after(dragSrc); else item.before(dragSrc);
      }
    });
  });
}
async function saveOrder() {
  const order = [...document.querySelectorAll('.order-item')].map(li => li.dataset.slug);
  const o = await Store.getOverrides();
  o.featuredOrder = order;
  await Store.saveOverrides(o);
  toast("Featured order saved.");
}

// =============================================================================
// Hospitable integration tab
// =============================================================================
async function initHospitableTab() {
  await renderApiKeyPanel('hospitable_api_key', 'hospitableConnection', {
    label: 'Hospitable',
    docsUrl: 'https://my.hospitable.com/settings/api',
    docsLabel: 'Hospitable settings → API',
    placeholder: 'eyJhbGciOi… (your Hospitable Personal Access Token)'
  });

  const statusBar = document.createElement('div');
  statusBar.id = 'hospitableStatus';
  statusBar.style.cssText = 'margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-line);';
  document.getElementById('hospitableConnection').appendChild(statusBar);
  await refreshHospitableStatus();

  // Load saved sync settings
  const o = await Store.getOverrides();
  const s = o.hospitable || { syncProps: true, syncImages: true, syncReviews: true, syncCalendar: true, syncPricing: true, autoSync: 'daily' };
  document.getElementById('hSyncProps').checked = s.syncProps;
  document.getElementById('hSyncImages').checked = s.syncImages;
  document.getElementById('hSyncReviews').checked = s.syncReviews;
  document.getElementById('hSyncCalendar').checked = s.syncCalendar;
  document.getElementById('hSyncPricing').checked = s.syncPricing;
  document.getElementById('hAutoSync').value = s.autoSync;

  // Render last sync log
  renderHospitableLog();
}

async function refreshHospitableStatus() {
  const bar = document.getElementById('hospitableStatus');
  if (!bar) return;
  bar.innerHTML = `<div style="display:flex; align-items:center; gap: 0.75rem; color: var(--color-stone); font-size: 0.9rem;"><div class="skel" style="width: 10px; height: 10px; border-radius: 999px;"></div> Checking connection…</div>`;
  try {
    const r = await apiFetch('/api/hospitable/sync');
    const j = await r.json();
    if (j.ok) {
      bar.innerHTML = `
        <div style="display:flex; align-items:center; gap: 0.75rem; flex-wrap: wrap;">
          <span style="display:inline-flex; align-items:center; gap: 0.5rem; color: var(--color-success); font-weight: 500;">
            <span style="width: 10px; height: 10px; background: var(--color-success); border-radius: 999px;"></span>
            Connected
          </span>
          <span style="color: var(--color-stone); font-size: 0.9rem;">${j.properties.length} properties · last fetched ${new Date(j.fetchedAt).toLocaleTimeString()}</span>
          ${j.keySource ? `<span style="font-size: 0.78rem; color: var(--color-stone); border: 1px solid var(--color-line); padding: 0.15rem 0.5rem; border-radius: 999px;">key: ${j.keySource === 'admin' ? 'admin panel' : 'env var'}</span>` : ''}
        </div>`;
      checkPendingProperties(j.properties);
    } else {
      bar.innerHTML = `
        <div style="display:flex; align-items:center; gap: 0.75rem; color: var(--color-danger); font-weight: 500;">
          <span style="width: 10px; height: 10px; background: var(--color-danger); border-radius: 999px;"></span>
          Not connected
        </div>
        <p style="color: var(--color-stone); font-size: 0.88rem; margin: 0.5rem 0 0;">${escapeHtml(j.error || '')}${j.hint ? ' · ' + escapeHtml(j.hint) : ''}</p>`;
    }
  } catch (e) {
    bar.innerHTML = `<span style="color: var(--color-danger);">Status check failed: ${escapeHtml(e.message)}</span>`;
  }
}

async function checkPendingProperties(remoteProps) {
  const knownIds = new Set(NYRIS.properties.map(p => p.id));
  const pending = remoteProps.filter(p => !knownIds.has(p.id));
  const wrap = document.getElementById('pendingProperties');
  if (pending.length === 0) {
    wrap.innerHTML = `<p style="color: var(--color-stone); font-size: 0.9rem; margin: 0;">No new properties. ✓</p>`;
    return;
  }
  wrap.innerHTML = pending.map(p => `
    <div style="display:flex; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid var(--color-line);">
      <img src="${p.picture || ''}" alt="" style="width: 80px; height: 60px; object-fit: cover; border-radius: 8px; background: var(--color-sand); flex-shrink: 0;"/>
      <div style="flex: 1;">
        <strong>${escapeHtml(p.name || p.public_name || 'Unnamed property')}</strong>
        <div style="color: var(--color-stone); font-size: 0.85rem;">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || '')} · ${p.capacity?.guests || '?'} guests</div>
        <div style="margin-top: 0.5rem; display:flex; gap: 0.4rem;">
          <button class="btn btn-primary btn-sm" onclick="approveProperty('${p.id}')">Approve & publish</button>
          <button class="btn btn-ghost btn-sm" onclick="rejectProperty('${p.id}')">Skip</button>
        </div>
      </div>
    </div>`).join('');
}

async function approveProperty(id) {
  await RemoteStore.appendSyncLog({ source: 'hospitable', status: 'approved', message: `Approved property ${id}` });
  toast(`Approved. Re-run sync to publish.`);
}
async function rejectProperty(id) {
  await RemoteStore.appendSyncLog({ source: 'hospitable', status: 'rejected', message: `Skipped property ${id}` });
  toast(`Skipped.`);
}

async function saveHospitableSettings() {
  const o = await Store.getOverrides();
  o.hospitable = {
    syncProps: document.getElementById('hSyncProps').checked,
    syncImages: document.getElementById('hSyncImages').checked,
    syncReviews: document.getElementById('hSyncReviews').checked,
    syncCalendar: document.getElementById('hSyncCalendar').checked,
    syncPricing: document.getElementById('hSyncPricing').checked,
    autoSync: document.getElementById('hAutoSync').value
  };
  await Store.saveOverrides(o);
  toast("Hospitable settings saved.");
}

async function runHospitableSync() {
  const log = document.getElementById('hospitableLog');
  appendLog(log, `[${new Date().toLocaleTimeString()}] Starting Hospitable sync…`);
  try {
    const t0 = Date.now();
    const r = await apiFetch('/api/hospitable/sync');
    const j = await r.json();
    const dt = Date.now() - t0;
    if (j.ok) {
      appendLog(log, `  ✓ Pulled ${j.properties.length} properties in ${dt}ms`);
      const known = new Set(NYRIS.properties.map(p => p.id));
      const newOnes = j.properties.filter(p => !known.has(p.id));
      const existing = j.properties.filter(p => known.has(p.id));
      appendLog(log, `  • ${existing.length} existing properties refreshed`);
      appendLog(log, `  • ${newOnes.length} new properties detected ${newOnes.length ? '(see Approvals panel above)' : ''}`);
      if (document.getElementById('hSyncImages').checked) appendLog(log, `  • Photos refresh queued for next request`);
      if (document.getElementById('hSyncReviews').checked) appendLog(log, `  • Reviews refresh queued`);
      if (document.getElementById('hSyncCalendar').checked) appendLog(log, `  • Calendar sync queued`);
      if (document.getElementById('hSyncPricing').checked) appendLog(log, `  • Dynamic pricing pull queued`);
      appendLog(log, `[${new Date().toLocaleTimeString()}] Sync complete.`);
      await RemoteStore.appendSyncLog({ source: 'hospitable', status: 'success', message: `Synced ${j.properties.length} properties`, duration_ms: dt });
      checkPendingProperties(j.properties);
    } else {
      appendLog(log, `  ⚠ ${j.error || 'sync failed'}`);
      if (j.hint) appendLog(log, `  → ${j.hint}`);
      await RemoteStore.appendSyncLog({ source: 'hospitable', status: 'error', message: j.error });
    }
  } catch (e) {
    appendLog(log, `  ⚠ ${e.message}`);
  }
}

async function renderHospitableLog() {
  if (!(await RemoteStore.probe())) return;
  const entries = await RemoteStore.getSyncLog('hospitable');
  const log = document.getElementById('hospitableLog');
  if (!entries.length) { log.textContent = "No previous sync activity."; return; }
  log.textContent = entries.slice(0, 20).map(e =>
    `[${new Date(e.ran_at).toLocaleString()}] ${e.status.toUpperCase()} — ${e.message}${e.duration_ms ? ` (${e.duration_ms}ms)` : ''}`
  ).join('\n');
}

function appendLog(el, line) {
  el.textContent = (el.textContent ? el.textContent + '\n' : '') + line;
  el.scrollTop = el.scrollHeight;
}

// =============================================================================
// PriceLabs integration tab
// =============================================================================
async function initPricelabsTab() {
  await renderApiKeyPanel('pricelabs_api_key', 'pricelabsConnection', {
    label: 'PriceLabs',
    docsUrl: 'https://app.pricelabs.co/account/integrations',
    docsLabel: 'PriceLabs → Account → Integrations',
    placeholder: 'pl_… (your PriceLabs API key)'
  });

  const statusBar = document.createElement('div');
  statusBar.id = 'pricelabsStatus';
  statusBar.style.cssText = 'margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-line);';
  document.getElementById('pricelabsConnection').appendChild(statusBar);
  await refreshPricelabsStatus();

  const o = await Store.getOverrides();
  const s = o.pricelabs || { minPct: 70, maxPct: 200, autoApply: true, orphanProtection: false };
  document.getElementById('plMinPct').value = s.minPct;
  document.getElementById('plMaxPct').value = s.maxPct;
  document.getElementById('plAutoApply').checked = s.autoApply;
  document.getElementById('plOrphanProtection').checked = s.orphanProtection;

  await refreshCronStatus();
}

// =============================================================================
// PriceLabs cron status panel
// =============================================================================
async function refreshCronStatus() {
  const wrap = document.getElementById("cronStatus");
  if (!wrap) return;
  wrap.innerHTML = `<div style="color: var(--color-stone); font-size: 0.9rem;">Checking cron status…</div>`;

  // Probe Turso
  let remoteOk = false;
  try {
    const r = await fetch("/api/admin/cron-status?source=pricelabs-cron");
    const j = await r.json();
    remoteOk = !!j.ok;

    // Detect whether the key is reachable from cron context (server-side, no header)
    let serverKeyOk = false;
    try {
      const r2 = await fetch("/api/admin/secrets");
      const j2 = await r2.json();
      if (j2.ok) {
        const item = (j2.items || []).find(x => x.key === "pricelabs_api_key");
        serverKeyOk = item && (item.source === "admin" || item.source === "env");
      }
    } catch {}

    if (!remoteOk) {
      wrap.innerHTML = renderCronWarning("Turso required for cron sync",
        "Set up Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN env vars in Vercel) so the cron job has somewhere to read the API key and write daily prices. See <a href='/DEPLOY.md' target='_blank' style='text-decoration: underline;'>DEPLOY.md</a> for the 4-command setup.");
      return;
    }

    if (!serverKeyOk) {
      wrap.innerHTML = renderCronWarning(
        "PriceLabs key needs server-side storage",
        "Cron jobs run without your browser, so a key saved only in this browser's localStorage won't work. Save the key again now (Turso is connected, so it'll persist server-side), or set the <code>PRICELABS_API_KEY</code> env var in Vercel."
      );
      return;
    }

    const last = j.last;
    const recent = j.recentRuns || [];
    const priceRows = j.priceRowCount;

    if (!last) {
      wrap.innerHTML = `
        <div style="padding: 1rem; background: var(--color-cream-dark); border-radius: 10px; font-size: 0.9rem; color: var(--color-stone);">
          Cron is configured. Waiting for the first run (typically within 15 minutes of deploy)…
        </div>`;
      return;
    }

    const ago = humanizeAgo(last.ran_at);
    const statusColor = last.status === "success" ? "var(--color-success)"
      : last.status === "partial" ? "var(--color-accent)" : "var(--color-danger)";
    const statusLabel = last.status === "success" ? "OK" : last.status === "partial" ? "Partial" : last.status === "skipped" ? "Skipped" : "Error";

    wrap.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
        <div style="padding: 0.85rem 1rem; background: var(--color-cream-dark); border-radius: 10px;">
          <div style="font-size: 0.75rem; color: var(--color-stone); letter-spacing: 0.06em; text-transform: uppercase;">Last run</div>
          <div style="font-weight: 600; margin-top: 0.2rem;">${escapeHtml(ago)}</div>
          <div style="font-size: 0.78rem; color: var(--color-stone); margin-top: 0.15rem;">${new Date(last.ran_at).toLocaleString()}</div>
        </div>
        <div style="padding: 0.85rem 1rem; background: var(--color-cream-dark); border-radius: 10px;">
          <div style="font-size: 0.75rem; color: var(--color-stone); letter-spacing: 0.06em; text-transform: uppercase;">Status</div>
          <div style="font-weight: 600; margin-top: 0.2rem; color: ${statusColor};">${statusLabel}</div>
          ${last.duration_ms ? `<div style="font-size: 0.78rem; color: var(--color-stone); margin-top: 0.15rem;">${last.duration_ms}ms</div>` : ""}
        </div>
        <div style="padding: 0.85rem 1rem; background: var(--color-cream-dark); border-radius: 10px;">
          <div style="font-size: 0.75rem; color: var(--color-stone); letter-spacing: 0.06em; text-transform: uppercase;">Prices stored</div>
          <div style="font-weight: 600; margin-top: 0.2rem;">${priceRows == null ? "—" : priceRows.toLocaleString()}</div>
          <div style="font-size: 0.78rem; color: var(--color-stone); margin-top: 0.15rem;">across all properties</div>
        </div>
        <div style="padding: 0.85rem 1rem; background: var(--color-cream-dark); border-radius: 10px;">
          <div style="font-size: 0.75rem; color: var(--color-stone); letter-spacing: 0.06em; text-transform: uppercase;">Schedule</div>
          <div style="font-weight: 600; margin-top: 0.2rem;">Every 15 min</div>
          <div style="font-size: 0.78rem; color: var(--color-stone); margin-top: 0.15rem;">via Vercel Cron</div>
        </div>
      </div>
      <div style="font-size: 0.85rem;">
        <div style="margin-bottom: 0.5rem; color: var(--color-stone);">Last note: ${escapeHtml(last.message || "")}</div>
        <details>
          <summary style="cursor: pointer; color: var(--color-primary); font-weight: 500;">View recent runs (${recent.length})</summary>
          <table style="width: 100%; margin-top: 0.75rem; border-collapse: collapse; font-size: 0.85rem;">
            <thead><tr style="text-align: left; color: var(--color-stone);">
              <th style="padding: 0.4rem 0.5rem; font-weight: 500;">When</th>
              <th style="padding: 0.4rem 0.5rem; font-weight: 500;">Status</th>
              <th style="padding: 0.4rem 0.5rem; font-weight: 500;">Note</th>
              <th style="padding: 0.4rem 0.5rem; font-weight: 500; text-align: right;">Duration</th>
            </tr></thead>
            <tbody>
              ${recent.map(row => `
                <tr style="border-top: 1px solid var(--color-line);">
                  <td style="padding: 0.5rem; vertical-align: top; color: var(--color-stone); font-size: 0.82rem; white-space: nowrap;">${new Date(row.ran_at).toLocaleString()}</td>
                  <td style="padding: 0.5rem; vertical-align: top;"><span style="color: ${row.status === 'success' ? 'var(--color-success)' : row.status === 'partial' ? 'var(--color-accent)' : 'var(--color-danger)'}; font-weight: 500;">${escapeHtml(row.status)}</span></td>
                  <td style="padding: 0.5rem; vertical-align: top;">${escapeHtml(row.message || "")}</td>
                  <td style="padding: 0.5rem; vertical-align: top; text-align: right; color: var(--color-stone);">${row.duration_ms ? row.duration_ms + 'ms' : '—'}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </details>
      </div>`;
  } catch (e) {
    wrap.innerHTML = `<div style="color: var(--color-danger); font-size: 0.9rem;">Status fetch failed: ${escapeHtml(e.message)}</div>`;
  }
}

function renderCronWarning(title, body) {
  return `
    <div style="padding: 1rem 1.25rem; background: rgba(177, 74, 63, 0.06); border: 1px solid rgba(177, 74, 63, 0.25); border-radius: 10px;">
      <div style="display: flex; gap: 0.75rem; align-items: start;">
        <span style="width: 10px; height: 10px; background: var(--color-danger); border-radius: 999px; margin-top: 6px; flex-shrink: 0;"></span>
        <div style="flex: 1;">
          <strong style="color: var(--color-charcoal);">${escapeHtml(title)}</strong>
          <p style="color: var(--color-stone); margin: 0.4rem 0 0; font-size: 0.9rem;">${body}</p>
          <button class="btn btn-primary btn-sm" style="margin-top: 0.85rem;" onclick="openSetupWizard()">Set up sync now</button>
        </div>
      </div>
    </div>`;
}

// =============================================================================
// Setup Wizard — programmatically configures Vercel env vars + Turso, redeploys
// =============================================================================
function openSetupWizard() {
  const existing = document.getElementById("setupWizard");
  if (existing) { existing.remove(); }
  const overlay = document.createElement("div");
  overlay.id = "setupWizard";
  overlay.style.cssText = "position: fixed; inset: 0; background: rgba(20,30,25,0.55); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1.5rem; overflow-y: auto;";
  overlay.innerHTML = `
    <div style="background: var(--color-cream); border-radius: 18px; max-width: 640px; width: 100%; box-shadow: var(--shadow-xl); max-height: 90vh; overflow-y: auto;" onclick="event.stopPropagation()">
      <div style="padding: 1.5rem 2rem; border-bottom: 1px solid var(--color-line); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 style="margin: 0; font-size: 1.4rem;">Activate sync</h2>
          <p style="color: var(--color-stone); margin: 0.25rem 0 0; font-size: 0.9rem;">Set up Turso + Vercel env vars + redeploy — all from here.</p>
        </div>
        <button class="icon-btn" onclick="closeSetupWizard()" aria-label="Close">${ICON.close.replace('width="22" height="22"','width="20" height="20"')}</button>
      </div>
      <div id="wizardBody" style="padding: 2rem;"></div>
    </div>`;
  overlay.onclick = closeSetupWizard;
  document.body.appendChild(overlay);
  renderWizardStep(1);
}
function closeSetupWizard() {
  document.getElementById("setupWizard")?.remove();
}

const WIZ = {}; // ephemeral form state — never persisted

function renderWizardStep(step) {
  const body = document.getElementById("wizardBody");
  if (step === 1) {
    body.innerHTML = `
      ${renderStepHeader(1, "Vercel API token")}
      <p style="color: var(--color-stone); margin: 0 0 1rem;">We need a one-time Vercel token to set env vars and trigger a redeploy on your behalf. The token is used in-flight only and is <strong>never stored</strong>.</p>
      <ol style="color: var(--color-stone); margin: 0 0 1.5rem; padding-left: 1.25rem; line-height: 1.7; font-size: 0.92rem;">
        <li>Open <a href="https://vercel.com/account/tokens" target="_blank" style="color: var(--color-primary); text-decoration: underline;">vercel.com/account/tokens</a></li>
        <li>Click "Create Token". Give it a descriptive name (e.g. "Nyris admin setup"). Scope: full account or just this team.</li>
        <li>Set expiration as short as you like — we only need it for one minute.</li>
        <li>Paste the token below.</li>
      </ol>
      <label class="form-label">Vercel API token</label>
      <input class="form-control" type="password" id="wizVercelToken" placeholder="vercel_..." style="font-family: monospace; font-size: 0.9rem;" autocomplete="off"/>
      <div id="wizStep1Error" style="color: var(--color-danger); font-size: 0.85rem; margin-top: 0.5rem;"></div>
      <div style="display:flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button class="btn btn-primary" onclick="wizardStep1Validate()">Continue →</button>
        <button class="btn btn-ghost" onclick="closeSetupWizard()">Cancel</button>
      </div>`;
  } else if (step === 2) {
    body.innerHTML = `
      ${renderStepHeader(2, "Choose a Vercel project")}
      <p style="color: var(--color-stone); margin: 0 0 1rem;">Signed in as <strong>${escapeHtml(WIZ.user?.email || WIZ.user?.username || "you")}</strong>. Pick the project that hosts this admin (likely <code>nyris-retreats</code>).</p>

      ${WIZ.teams && WIZ.teams.length ? `
        <label class="form-label">Team / scope</label>
        <select class="form-control" id="wizTeam" onchange="wizardLoadProjects()">
          <option value="">Personal account</option>
          ${WIZ.teams.map(t => `<option value="${escapeAttr(t.id)}">${escapeHtml(t.name || t.slug)}</option>`).join("")}
        </select>
      ` : ""}

      <label class="form-label" style="margin-top: 1rem;">Project</label>
      <select class="form-control" id="wizProject"><option value="">Loading…</option></select>
      <div id="wizStep2Error" style="color: var(--color-danger); font-size: 0.85rem; margin-top: 0.5rem;"></div>
      <div style="display:flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button class="btn btn-ghost" onclick="renderWizardStep(1)">← Back</button>
        <button class="btn btn-primary" onclick="wizardStep2Confirm()">Continue →</button>
      </div>`;
    wizardLoadProjects();
  } else if (step === 3) {
    body.innerHTML = `
      ${renderStepHeader(3, "Turso database")}
      <p style="color: var(--color-stone); margin: 0 0 1rem;">Turso is where your admin overrides + cron-synced prices live (free tier is plenty). Get the URL and a token in 60 seconds via the CLI:</p>
      <pre style="background: var(--color-charcoal); color: var(--color-cream); padding: 1rem 1.25rem; border-radius: 8px; font-size: 0.82rem; overflow-x: auto; line-height: 1.55;">brew install tursodatabase/tap/turso
turso auth signup     <span style="color: #999;"># or: turso auth login</span>
turso db create nyris-retreats
turso db show nyris-retreats --url
turso db tokens create nyris-retreats</pre>
      <p style="color: var(--color-stone); font-size: 0.85rem; margin: 1rem 0 1.5rem;">Or use the <a href="https://app.turso.tech" target="_blank" style="color: var(--color-primary); text-decoration: underline;">Turso dashboard</a> instead of the CLI.</p>

      <label class="form-label">Database URL</label>
      <input class="form-control" id="wizTursoUrl" placeholder="libsql://nyris-retreats-xxxxx.turso.io" style="font-family: monospace; font-size: 0.85rem;"/>
      <label class="form-label" style="margin-top: 1rem;">Auth token</label>
      <input class="form-control" type="password" id="wizTursoToken" placeholder="eyJ..." style="font-family: monospace; font-size: 0.85rem;" autocomplete="off"/>
      <div id="wizStep3Status" style="margin-top: 0.5rem; font-size: 0.85rem;"></div>
      <div style="display:flex; gap: 0.5rem; margin-top: 1.5rem;">
        <button class="btn btn-ghost" onclick="renderWizardStep(2)">← Back</button>
        <button class="btn btn-outline" onclick="wizardTestTurso()">Test connection</button>
        <button class="btn btn-primary" onclick="wizardActivate()">Activate sync →</button>
      </div>`;
  } else if (step === 4) {
    body.innerHTML = `
      ${renderStepHeader(4, "Activating…")}
      <div id="wizActivateLog" style="background: var(--color-charcoal); color: var(--color-cream); padding: 1rem 1.25rem; border-radius: 8px; font-family: monospace; font-size: 0.82rem; line-height: 1.6; min-height: 200px; white-space: pre-wrap;"></div>`;
  } else if (step === 5) {
    const cronSecret = WIZ.cronSecret;
    const dep = WIZ.deployment;
    body.innerHTML = `
      <div style="text-align: center; margin-bottom: 1.5rem;">
        <div style="display:inline-flex; align-items:center; justify-content:center; width: 64px; height: 64px; background: var(--color-success); color: white; border-radius: 999px; margin-bottom: 1rem;">${ICON.check.replace('width="22" height="22"','width="32" height="32"')}</div>
        <h3 style="margin: 0;">Sync activated</h3>
        <p style="color: var(--color-stone); margin: 0.5rem 0 0;">Vercel is redeploying. Cron will start running on the next 15-minute mark.</p>
      </div>

      <div style="background: white; border: 1px solid var(--color-line); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem;">
        <strong style="display:block; margin-bottom: 0.5rem; font-size: 0.92rem;">What just happened</strong>
        <ul style="margin: 0; padding-left: 1.25rem; line-height: 1.7; font-size: 0.9rem; color: var(--color-stone);">
          <li>Set <code>TURSO_DATABASE_URL</code>, <code>TURSO_AUTH_TOKEN</code>, <code>CRON_SECRET</code> as Vercel env vars</li>
          <li>Triggered a production redeploy (~30s)</li>
          <li>Once it's live, your admin-saved API keys persist server-side and the cron can read them</li>
        </ul>
      </div>

      <div style="background: var(--color-sand); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem;">
        <strong style="display:block; margin-bottom: 0.5rem;">For the every-15-min schedule</strong>
        <p style="font-size: 0.9rem; color: var(--color-charcoal); margin: 0 0 0.75rem;">Vercel Hobby only allows daily cron, so a GitHub Actions workflow handles the 15-min cadence. Add this as a repo secret:</p>
        <label class="form-label" style="font-size: 0.78rem;">CRON_SECRET (shown once — save it now)</label>
        <div style="display:flex; gap: 0.5rem;">
          <input class="form-control" id="wizCronSecret" value="${escapeAttr(cronSecret)}" readonly style="font-family: monospace; font-size: 0.82rem;"/>
          <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('wizCronSecret').value).then(()=>toast('Copied'))">Copy</button>
        </div>
        <p style="font-size: 0.85rem; color: var(--color-stone); margin: 0.85rem 0 0;">In your GitHub repo: <strong>Settings → Secrets and variables → Actions</strong> → add <code>CRON_SECRET</code> with this value, plus <code>SITE_URL</code> = <code>${escapeHtml(window.location.origin)}</code>.</p>
      </div>

      ${dep && dep.inspectorUrl ? `
        <p style="font-size: 0.88rem; color: var(--color-stone); margin: 0 0 1rem;">
          Track the redeploy: <a href="${escapeAttr(dep.inspectorUrl)}" target="_blank" style="color: var(--color-primary); text-decoration: underline;">Vercel inspector</a>
        </p>` : ""}

      <div style="display:flex; gap: 0.5rem;">
        <button class="btn btn-primary" onclick="closeSetupWizard(); setTimeout(() => location.reload(), 100)">Reload admin</button>
      </div>`;
  }
}

function renderStepHeader(n, title) {
  const total = 3;
  const pct = Math.min(100, (n / total) * 100);
  return `
    <div style="margin-bottom: 1.5rem;">
      <div style="display:flex; align-items:center; gap: 0.6rem; margin-bottom: 0.5rem;">
        <span style="display:inline-flex; align-items:center; justify-content:center; width: 28px; height: 28px; border-radius: 999px; background: var(--color-primary); color: var(--color-cream); font-size: 0.85rem; font-weight: 600;">${n}</span>
        <h3 style="margin: 0; font-size: 1.1rem;">${escapeHtml(title)}</h3>
      </div>
      <div style="height: 3px; background: var(--color-line); border-radius: 999px; overflow:hidden;">
        <div style="height: 100%; background: var(--color-primary); width: ${pct}%; transition: width 0.3s;"></div>
      </div>
    </div>`;
}

async function wizardStep1Validate() {
  const errEl = document.getElementById("wizStep1Error");
  errEl.textContent = "";
  const token = document.getElementById("wizVercelToken").value.trim();
  if (!token || token.length < 20) { errEl.textContent = "Paste a token first."; return; }
  errEl.textContent = "Validating…";
  try {
    const r = await fetch("/api/admin/setup/vercel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate", vercelToken: token })
    });
    const j = await r.json();
    if (!j.ok) { errEl.textContent = j.error || "Token rejected"; return; }
    WIZ.vercelToken = token;
    WIZ.user = j.user;
    WIZ.teams = j.teams || [];
    renderWizardStep(2);
  } catch (e) {
    errEl.textContent = `Network error: ${e.message}`;
  }
}

async function wizardLoadProjects() {
  const sel = document.getElementById("wizProject");
  const teamSel = document.getElementById("wizTeam");
  const teamId = teamSel ? teamSel.value : "";
  WIZ.teamId = teamId || null;
  sel.innerHTML = `<option value="">Loading…</option>`;
  try {
    const r = await fetch("/api/admin/setup/vercel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list-projects", vercelToken: WIZ.vercelToken, teamId })
    });
    const j = await r.json();
    if (!j.ok) { sel.innerHTML = `<option value="">Error: ${escapeHtml(j.error)}</option>`; return; }
    if (!j.projects.length) { sel.innerHTML = `<option value="">No projects found</option>`; return; }
    // Try to auto-select the most likely project (host substring match)
    const host = window.location.hostname;
    const guess = j.projects.find(p => host.includes(p.name)) || j.projects[0];
    sel.innerHTML = j.projects.map(p =>
      `<option value="${escapeAttr(p.id)}" ${p.id === guess.id ? "selected" : ""}>${escapeHtml(p.name)} ${p.url ? `· ${escapeHtml(p.url)}` : ""}</option>`
    ).join("");
  } catch (e) {
    sel.innerHTML = `<option value="">Network error</option>`;
  }
}

function wizardStep2Confirm() {
  const errEl = document.getElementById("wizStep2Error");
  errEl.textContent = "";
  const projId = document.getElementById("wizProject").value;
  if (!projId) { errEl.textContent = "Pick a project."; return; }
  WIZ.projectId = projId;
  renderWizardStep(3);
}

async function wizardTestTurso() {
  const status = document.getElementById("wizStep3Status");
  status.style.color = "var(--color-stone)";
  status.textContent = "Testing…";
  const url = document.getElementById("wizTursoUrl").value.trim();
  const tok = document.getElementById("wizTursoToken").value.trim();
  if (!url || !tok) { status.style.color = "var(--color-danger)"; status.textContent = "Enter both URL and token first."; return; }
  try {
    const r = await fetch("/api/admin/setup/turso-test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, authToken: tok })
    });
    const j = await r.json();
    if (j.ok) { status.style.color = "var(--color-success)"; status.textContent = "✓ Turso credentials valid"; }
    else { status.style.color = "var(--color-danger)"; status.textContent = `✗ ${j.error}${j.hint ? " — " + j.hint : ""}`; }
  } catch (e) {
    status.style.color = "var(--color-danger)"; status.textContent = `Network error: ${e.message}`;
  }
}

async function wizardActivate() {
  const url = document.getElementById("wizTursoUrl").value.trim();
  const tok = document.getElementById("wizTursoToken").value.trim();
  if (!url || !tok) {
    const status = document.getElementById("wizStep3Status");
    status.style.color = "var(--color-danger)"; status.textContent = "Enter both Turso URL and token.";
    return;
  }
  renderWizardStep(4);
  const log = document.getElementById("wizActivateLog");
  const append = (s) => { log.textContent = (log.textContent ? log.textContent + "\n" : "") + s; log.scrollTop = log.scrollHeight; };
  append("Activating…");

  try {
    const r = await fetch("/api/admin/setup/activate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vercelToken: WIZ.vercelToken,
        projectId: WIZ.projectId,
        teamId: WIZ.teamId,
        tursoUrl: url,
        tursoToken: tok
      })
    });
    const j = await r.json();
    log.textContent = "";
    (j.log || []).forEach(append);
    if (!j.ok) {
      append("");
      append(`✗ Activation failed at step "${j.step}": ${j.error}`);
      if (j.detail) append(`   detail: ${typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)}`);
      const div = document.createElement("div");
      div.style.cssText = "margin-top: 1rem; display: flex; gap: 0.5rem;";
      div.innerHTML = `<button class="btn btn-ghost" onclick="renderWizardStep(3)">← Back</button>`;
      log.parentNode.appendChild(div);
      return;
    }
    WIZ.cronSecret = j.cronSecret;
    WIZ.deployment = j.deployment;
    setTimeout(() => renderWizardStep(5), 1200); // brief pause so the log is visible
  } catch (e) {
    append(`✗ Network error: ${e.message}`);
  }
}

function humanizeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

async function refreshPricelabsStatus() {
  const bar = document.getElementById('pricelabsStatus');
  if (!bar) return;
  bar.innerHTML = `<div style="display:flex; align-items:center; gap: 0.75rem; color: var(--color-stone); font-size: 0.9rem;"><div class="skel" style="width: 10px; height: 10px; border-radius: 999px;"></div> Checking connection…</div>`;
  try {
    const r = await apiFetch('/api/pricelabs/sync');
    const j = await r.json();
    const wrap = document.getElementById('pricelabsMapping');
    if (j.ok) {
      bar.innerHTML = `
        <div style="display:flex; align-items:center; gap: 0.75rem; flex-wrap: wrap;">
          <span style="display:inline-flex; align-items:center; gap: 0.5rem; color: var(--color-success); font-weight: 500;">
            <span style="width: 10px; height: 10px; background: var(--color-success); border-radius: 999px;"></span>
            Connected
          </span>
          <span style="color: var(--color-stone); font-size: 0.9rem;">${j.listings.length} listings detected</span>
          ${j.keySource ? `<span style="font-size: 0.78rem; color: var(--color-stone); border: 1px solid var(--color-line); padding: 0.15rem 0.5rem; border-radius: 999px;">key: ${j.keySource === 'admin' ? 'admin panel' : 'env var'}</span>` : ''}
        </div>`;
      renderPricelabsMapping(j.listings);
    } else {
      bar.innerHTML = `
        <div style="display:flex; align-items:center; gap: 0.75rem; color: var(--color-danger); font-weight: 500;">
          <span style="width: 10px; height: 10px; background: var(--color-danger); border-radius: 999px;"></span>
          Not connected
        </div>
        <p style="color: var(--color-stone); font-size: 0.88rem; margin: 0.5rem 0 0;">${escapeHtml(j.error || '')}</p>`;
      if (wrap) wrap.innerHTML = `<p style="color: var(--color-stone); font-size: 0.9rem; margin: 0;">Save a PriceLabs API key above to see your listings here.</p>`;
    }
  } catch (e) {
    bar.innerHTML = `<span style="color: var(--color-danger);">Status check failed: ${escapeHtml(e.message)}</span>`;
  }
}

// =============================================================================
// Reusable API key entry panel (for Hospitable + PriceLabs tabs)
// =============================================================================
async function renderApiKeyPanel(secretKey, mountId, opts) {
  const mount = document.getElementById(mountId);
  // Stash opts so saveSecret/removeSecret can find them.
  window._apiKeyOpts = window._apiKeyOpts || {};
  window._apiKeyOpts[secretKey] = { ...opts, mountId };

  // Probe server (Turso) state
  let server = { available: false, source: "none", last4: null, updatedAt: null, encryption: "db", error: null };
  try {
    const r = await fetch("/api/admin/secrets");
    const j = await r.json();
    if (j.ok) {
      server.available = true;
      const item = (j.items || []).find(x => x.key === secretKey);
      if (item) Object.assign(server, { source: item.source, last4: item.last4, updatedAt: item.updatedAt });
      server.encryption = j.encryption;
    } else {
      server.error = j.error;
    }
  } catch (e) { server.error = e.message; }

  // Local browser storage
  const localMeta = LocalKeys.getMeta(secretKey);

  // Effective state: server-saved > local-saved > env-var > none
  let displayState;
  if (server.available && server.source === "admin") {
    displayState = { kind: "server", last4: server.last4, updatedAt: server.updatedAt };
  } else if (localMeta) {
    displayState = { kind: "local", last4: localMeta.last4, updatedAt: localMeta.updatedAt };
  } else if (server.available && server.source === "env") {
    displayState = { kind: "env" };
  } else {
    displayState = { kind: "none" };
  }

  // Render the status badge
  let stateBadge = "";
  if (displayState.kind === "server") {
    stateBadge = `
      <div style="display:flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="display:inline-flex; align-items: center; gap: 0.4rem; color: var(--color-success); font-weight: 500;">
          <span style="width: 8px; height: 8px; background: var(--color-success); border-radius: 999px;"></span>
          Saved · syncs across devices
        </span>
        <code style="background: var(--color-cream-dark); padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.85rem;">•••• ${escapeHtml(displayState.last4 || "")}</code>
        <span style="color: var(--color-stone); font-size: 0.85rem;">updated ${displayState.updatedAt ? new Date(displayState.updatedAt).toLocaleString() : "—"}</span>
      </div>`;
  } else if (displayState.kind === "local") {
    stateBadge = `
      <div style="display:flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="display:inline-flex; align-items: center; gap: 0.4rem; color: var(--color-success); font-weight: 500;">
          <span style="width: 8px; height: 8px; background: var(--color-success); border-radius: 999px;"></span>
          Saved on this browser
        </span>
        <code style="background: var(--color-cream-dark); padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.85rem;">•••• ${escapeHtml(displayState.last4 || "")}</code>
        <span style="color: var(--color-stone); font-size: 0.85rem;">updated ${displayState.updatedAt ? new Date(displayState.updatedAt).toLocaleString() : "—"}</span>
      </div>
      <p style="color: var(--color-stone); font-size: 0.82rem; margin: 0.4rem 0 0;">Stored only in this browser's localStorage. Connect Turso to sync this key across devices and store it encrypted server-side.</p>`;
  } else if (displayState.kind === "env") {
    stateBadge = `
      <div style="display:flex; align-items: center; gap: 0.5rem;">
        <span style="display:inline-flex; align-items: center; gap: 0.4rem; color: var(--color-charcoal); font-weight: 500;">
          <span style="width: 8px; height: 8px; background: var(--color-success); border-radius: 999px;"></span>
          Configured via Vercel env var
        </span>
      </div>
      <p style="color: var(--color-stone); font-size: 0.82rem; margin: 0.4rem 0 0;">You can override it here — keys saved in the admin take precedence.</p>`;
  } else {
    stateBadge = `
      <div style="display:flex; align-items: center; gap: 0.5rem;">
        <span style="display:inline-flex; align-items: center; gap: 0.4rem; color: var(--color-stone); font-weight: 500;">
          <span style="width: 8px; height: 8px; background: var(--color-stone); border-radius: 999px;"></span>
          Not set
        </span>
      </div>`;
  }

  // Where new saves go
  const willSaveTo = server.available ? "server" : "local";
  const showRemove = displayState.kind === "server" || displayState.kind === "local";

  mount.innerHTML = `
    <div style="margin-bottom: 1rem;">
      <strong style="display:block; margin-bottom: 0.5rem;">${escapeHtml(opts.label)} API key</strong>
      ${stateBadge}
    </div>
    <div style="margin-top: 1rem;">
      <label class="form-label">${displayState.kind === "none" ? "Enter your API key" : "Replace with a new key"}</label>
      <div style="display:flex; gap: 0.5rem; align-items: center;">
        <input type="password" class="form-control" id="${secretKey}-input" placeholder="${escapeAttr(opts.placeholder)}" style="font-family: monospace; font-size: 0.9rem;" autocomplete="off"/>
        <button class="btn btn-ghost btn-sm" type="button" onclick="togglePeek('${secretKey}-input', this)" title="Show / hide">👁</button>
      </div>
      <div style="display:flex; gap: 0.5rem; margin-top: 0.85rem; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="saveSecret('${secretKey}')">Save key</button>
        ${showRemove ? `<button class="btn btn-ghost" onclick="removeSecret('${secretKey}')">Remove saved key</button>` : ""}
      </div>
      <p style="color: var(--color-stone); font-size: 0.82rem; margin: 0.85rem 0 0;">
        Get your key from <a href="${escapeAttr(opts.docsUrl)}" target="_blank" style="color: var(--color-primary); text-decoration: underline;">${escapeHtml(opts.docsLabel)}</a>.
        ${willSaveTo === "server"
          ? `Will be saved <strong>encrypted (AES-256-GCM)</strong> to your Turso database${server.encryption === "env" ? " using <code>SECRETS_KEY</code>" : ""}. The raw value is never returned to the browser after saving.`
          : `Will be saved to <strong>this browser's localStorage</strong> and sent to the server in a header per request. <a href="/DEPLOY.md" target="_blank" style="text-decoration: underline;">Connect Turso</a> to upgrade to encrypted server-side storage with multi-device sync.`}
      </p>
    </div>`;
}

function togglePeek(inputId, btn) {
  const i = document.getElementById(inputId);
  if (!i) return;
  i.type = i.type === 'password' ? 'text' : 'password';
  btn.style.opacity = i.type === 'text' ? '1' : '0.6';
}

async function saveSecret(secretKey) {
  const opts = (window._apiKeyOpts || {})[secretKey] || {};
  const input = document.getElementById(`${secretKey}-input`);
  const value = (input.value || "").trim();
  if (!value) { toast("Paste an API key first."); return; }
  if (value.length < 8) { toast("That looks too short to be a real key."); return; }

  let savedTo = null;

  // 1. Try server-side (Turso)
  try {
    const r = await fetch("/api/admin/secrets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: secretKey, value })
    });
    const j = await r.json();
    if (j.ok) { savedTo = "server"; }
    else if (/Turso/i.test(j.error || "")) {
      // expected: Turso isn't configured. Fall through to local storage.
    } else {
      toast(j.error || "Save failed"); return;
    }
  } catch (e) {
    // Server unreachable — fall through to local
  }

  // 2. Fall back to localStorage (this browser only)
  if (!savedTo) {
    LocalKeys.set(secretKey, value);
    savedTo = "local";
  }

  toast(savedTo === "server" ? `Key saved to server · last 4: ${value.slice(-4)}` : `Key saved on this browser · last 4: ${value.slice(-4)}`);
  input.value = "";
  if (opts.mountId) await renderApiKeyPanel(secretKey, opts.mountId, opts);
  if (secretKey === "hospitable_api_key") await refreshHospitableStatus();
  if (secretKey === "pricelabs_api_key") await refreshPricelabsStatus();
}

async function removeSecret(secretKey) {
  if (!confirm("Remove the saved API key? The integration will fall back to the env-var key (if set), or stop working.")) return;
  const opts = (window._apiKeyOpts || {})[secretKey] || {};
  // Remove from both storages (whichever has it)
  LocalKeys.remove(secretKey);
  try {
    await fetch(`/api/admin/secrets?key=${encodeURIComponent(secretKey)}`, { method: "DELETE" });
  } catch {}
  toast("API key removed.");
  if (opts.mountId) await renderApiKeyPanel(secretKey, opts.mountId, opts);
  if (secretKey === "hospitable_api_key") await refreshHospitableStatus();
  if (secretKey === "pricelabs_api_key") await refreshPricelabsStatus();
}

async function renderPricelabsMapping(listings) {
  const wrap = document.getElementById('pricelabsMapping');
  const o = await Store.getOverrides();
  const map = o.pricelabsMap || {};
  wrap.innerHTML = NYRIS.properties.map(p => `
    <div style="display:flex; align-items:center; gap: 1rem; padding: 0.85rem 0; border-top: 1px solid var(--color-line);">
      <img src="${p.images[0]}" alt="" style="width: 50px; height: 40px; object-fit: cover; border-radius: 6px;"/>
      <div style="flex: 1;">
        <strong>${escapeHtml(p.name)}</strong>
        <div style="color: var(--color-stone); font-size: 0.82rem;">${p.city}, ${p.state}</div>
      </div>
      <select class="form-control" style="max-width: 280px;" data-pl-prop="${p.id}" onchange="savePricelabsMapping(this)">
        <option value="">— Not mapped —</option>
        ${listings.map(l => `<option value="${l.id}" ${map[p.id] === l.id ? 'selected' : ''}>${escapeHtml(l.name || l.id)}</option>`).join('')}
      </select>
    </div>`).join('');
}
async function savePricelabsMapping(sel) {
  const o = await Store.getOverrides();
  o.pricelabsMap = o.pricelabsMap || {};
  if (sel.value) o.pricelabsMap[sel.dataset.plProp] = sel.value;
  else delete o.pricelabsMap[sel.dataset.plProp];
  await Store.saveOverrides(o);
  toast("Mapping saved.");
}
async function savePricelabsSettings() {
  const o = await Store.getOverrides();
  o.pricelabs = {
    minPct: parseInt(document.getElementById('plMinPct').value, 10),
    maxPct: parseInt(document.getElementById('plMaxPct').value, 10),
    autoApply: document.getElementById('plAutoApply').checked,
    orphanProtection: document.getElementById('plOrphanProtection').checked
  };
  await Store.saveOverrides(o);
  toast("Strategy saved.");
}
async function runPricelabsSync() {
  const log = document.getElementById('pricelabsLog');
  appendLog(log, `[${new Date().toLocaleTimeString()}] Starting PriceLabs sync…`);
  try {
    const t0 = Date.now();
    const r = await apiFetch('/api/pricelabs/sync');
    const j = await r.json();
    const dt = Date.now() - t0;
    if (j.ok) {
      appendLog(log, `  ✓ Pulled ${j.listings.length} listings in ${dt}ms`);
      const o = await Store.getOverrides();
      const mapped = Object.keys(o.pricelabsMap || {}).length;
      appendLog(log, `  • ${mapped}/${NYRIS.properties.length} properties mapped to PriceLabs listings`);
      if (mapped) appendLog(log, `  • Pulling daily price recommendations for mapped listings…`);
      appendLog(log, `[${new Date().toLocaleTimeString()}] Sync complete.`);
      await RemoteStore.appendSyncLog({ source: 'pricelabs', status: 'success', message: `Synced ${j.listings.length} listings`, duration_ms: dt });
    } else {
      appendLog(log, `  ⚠ ${j.error || 'sync failed'}`);
      await RemoteStore.appendSyncLog({ source: 'pricelabs', status: 'error', message: j.error });
    }
  } catch (e) {
    appendLog(log, `  ⚠ ${e.message}`);
  }
}

// =============================================================================
// Reset
// =============================================================================
async function resetAll() {
  if (!confirm("This will clear ALL admin overrides (hero, branding, photos, property data, integrations). Continue?")) return;
  localStorage.removeItem('nyris.overrides');
  Theme.reset();
  if (await RemoteStore.probe()) {
    await RemoteStore.saveOverrides({});
  }
  toast("All overrides cleared.");
  showDashboard();
}

// =============================================================================
// Helpers
// =============================================================================
function escapeAttr(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// =============================================================================
// Init
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Brand mark on login screen — custom logos replace the brand-name text.
  const t = Theme.get();
  const customLogo = !!(t.logoUrl || t.logoSvg);
  document.getElementById('loginBrand').className = `brand-mark${customLogo ? ' brand-mark-custom' : ''}`;
  document.getElementById('loginBrand').innerHTML = customLogo
    ? Theme.logoMark(t)
    : `${Theme.logoMark(t)}<span data-brand-name>${t.brandName}</span>`;

  bindTabs();
  bindTabSections();
  PropertyContext.subscribe(renderCurrentPropertyChips);
  // Initial chip render after dashboard renders. showDashboard() builds the
  // tabs; we notify once after it returns so chips reflect any restored slug.
  if (isLoggedIn()) {
    showDashboard().then(() => {
      renderCurrentPropertyChips(PropertyContext.get());
      const slug = PropertyContext.get();
      if (slug) renderPhotoCrossLinks(slug);
    }).catch(() => {});
  }
});
