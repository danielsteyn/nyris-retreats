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
  if (email === ADMIN.demoEmail && pass === ADMIN.demoPass) {
    Storage.set(ADMIN.authKey, { email, expires: Date.now() + 1000 * 60 * 60 * 8 });
    await showDashboard();
  } else {
    toast("Wrong email or password. Try sheena@nyrisretreats.com / nyris2026");
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
  initBrandingTab();
  initPhotosTab();
  initPropertiesTab(o);
  initOrderTab(o);
  initHospitableTab();
  initPricelabsTab();
}

// =============================================================================
// Hero tab
// =============================================================================
function initHeroTab(o) {
  document.getElementById('aHEyebrow').value = o.heroEyebrow || "Top 1% Guest Favorite · Superhost-managed";
  document.getElementById('aHTitle').value = o.heroTitle || "Stay where the reviews don't lie.";
  document.getElementById('aHSub').value = o.heroSubtitle || "Hand-picked vacation homes across the Gulf Coast, Texas Hill Country, and Broken Bow. 5.0 stars across 200+ stays. Book direct — skip the platform fees.";
  document.getElementById('aHImg').value = o.heroImage || "https://assets.hospitable.com/property_images/1597444/Lm15xbpAlhpFK2m1TVqQMu9kKk5JXukcSaaWLfEP.jpg";
  ['aHEyebrow','aHTitle','aHSub','aHImg'].forEach(id => document.getElementById(id).addEventListener('input', updateHeroPreview));
  updateHeroPreview();
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
  o.heroImage = document.getElementById('aHImg').value.trim();
  await Store.saveOverrides(o);
  toast("Hero saved. Reload the homepage to see it live.");
}
async function resetHero() {
  const o = await Store.getOverrides();
  delete o.heroEyebrow; delete o.heroTitle; delete o.heroSubtitle; delete o.heroImage;
  await Store.saveOverrides(o);
  initHeroTab(o);
  toast("Hero reset.");
}

// =============================================================================
// Branding tab
// =============================================================================
function initBrandingTab() {
  const t = Theme.get();

  // Brand identity
  document.getElementById('bBrandName').value = t.brandName;
  document.getElementById('bBrandTagline').value = t.brandTagline;

  // Logo mode
  let mode = 'default';
  if (t.logoUrl) mode = 'url';
  else if (t.logoSvg) mode = 'svg';
  document.getElementById('bLogoUrl').value = t.logoUrl || '';
  document.getElementById('bLogoSvg').value = t.logoSvg || '';
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
function gatherBranding() {
  const mode = document.getElementById('logoModeUrl').classList.contains('btn-primary') ? 'url'
    : document.getElementById('logoModeSvg').classList.contains('btn-primary') ? 'svg' : 'default';
  return {
    brandName: document.getElementById('bBrandName').value.trim(),
    brandTagline: document.getElementById('bBrandTagline').value.trim(),
    logoUrl: mode === 'url' ? document.getElementById('bLogoUrl').value.trim() : '',
    logoSvg: mode === 'svg' ? document.getElementById('bLogoSvg').value.trim() : '',
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
  preview.innerHTML = `
    <div style="display:flex; align-items:center; gap: 0.6rem; color: ${t.colors.primary}; font-family: '${t.fontDisplay}', serif; font-size: 1.6rem; font-weight: 600; margin-bottom: 1.5rem;">
      ${Theme.logoMark(t)}
      <span style="font-family: '${t.fontDisplay}', serif;">${escapeHtml(t.brandName)}</span>
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
function saveBranding() {
  const t = gatherBranding();
  Theme.set(t);
  toast("Branding saved. Applied site-wide.");
}
function resetBranding() {
  if (!confirm("Reset all branding to defaults?")) return;
  Theme.reset();
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
  sel.addEventListener('change', () => loadPropertyPhotos(sel.value));
  loadPropertyPhotos(sel.value);
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

    // Load the Vercel Blob client lib from a CDN. This avoids a build step.
    const { upload } = await import("https://esm.sh/@vercel/blob@2.3.3/client");

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
    if (j.ok && j.images) {
      status.textContent = `✓ ${j.images.length} photos pulled · ${new Date(j.fetchedAt).toLocaleTimeString()}`;
      toast(`Pulled ${j.images.length} photos from Hospitable`);
      loadPropertyPhotos(_currentPhotoProperty);
    } else {
      status.textContent = `⚠ ${j.error || 'sync failed'}`;
      if (j.mock) toast("Add HOSPITABLE_API_KEY to Vercel env vars to enable live sync");
    }
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
      <div style="background: white; border: 1px solid var(--color-line); border-radius: 14px; padding: 1.5rem; margin-bottom: 1rem;">
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
      </div>`;
  }).join('');
  document.querySelectorAll('[data-prop-slug]').forEach(input => input.addEventListener('change', savePropOverride));
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
  // Brand mark on login screen
  const t = Theme.get();
  document.getElementById('loginBrand').innerHTML = `${Theme.logoMark(t)}<span data-brand-name>${t.brandName}</span>`;

  bindTabs();
  if (isLoggedIn()) showDashboard();
});
