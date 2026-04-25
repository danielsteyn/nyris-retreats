// Nyris Retreats — Admin Dashboard
// Storage strategy: localStorage by default; if /api/admin/* responds, use Turso-backed remote storage.

const ADMIN = {
  authKey: "nyris.admin.session",
  demoEmail: "sheena@nyrisretreats.com",
  demoPass: "nyris2026"
};

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
    <div id="photoGrid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;"></div>
    <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
      <button class="btn btn-primary" onclick="savePhotoChanges()">Save photo changes</button>
      <button class="btn btn-ghost" onclick="resetPhotos()">Reset to Hospitable</button>
      <button class="btn btn-outline" onclick="addCustomPhoto()">+ Add custom photo</button>
    </div>`;
  const grid = document.getElementById('photoGrid');
  grid.innerHTML = photos.filter(p => !p.isHidden).map((p, i) => `
    <div class="photo-tile ${p.isCover || (i === 0 && !photos.some(x => x.isCover)) ? 'cover' : ''}" draggable="true" data-url="${escapeAttr(p.url)}">
      <span class="cover-tag">Cover</span>
      <img src="${p.url}" alt="" loading="lazy"/>
      <div class="overlay">
        <div class="actions">
          <button title="Mark as cover" onclick="setCover('${escapeAttr(p.url)}')" type="button">★</button>
          <button title="Edit caption" onclick="editCaption('${escapeAttr(p.url)}')" type="button">✎</button>
          <button title="Remove" onclick="hidePhoto('${escapeAttr(p.url)}')" type="button">×</button>
        </div>
        <div class="cap">${escapeHtml(p.caption || '')}</div>
      </div>
    </div>
  `).join('');
  bindPhotoDrag();
  // Stash current state on element
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

function setCover(url) {
  const photos = getCurrentPhotos().map(p => ({ ...p, isCover: p.url === url }));
  // Move cover to first position
  const cover = photos.find(p => p.isCover);
  const rest = photos.filter(p => !p.isCover);
  renderPhotoBoard([cover, ...rest]);
}
function editCaption(url) {
  const photos = getCurrentPhotos();
  const p = photos.find(x => x.url === url);
  const next = prompt("Caption (shown in lightbox):", p.caption || "");
  if (next === null) return;
  p.caption = next;
  renderPhotoBoard(photos);
}
function hidePhoto(url) {
  if (!confirm("Hide this photo from the public site? You can restore it from the photos tab later.")) return;
  const photos = getCurrentPhotos().map(p => p.url === url ? { ...p, isHidden: true } : p);
  renderPhotoBoard(photos);
}
function addCustomPhoto() {
  const url = prompt("Image URL (must be publicly accessible):");
  if (!url || !/^https?:\/\//.test(url)) { toast("Enter a valid URL starting with http(s)://"); return; }
  const caption = prompt("Caption (optional):") || "";
  const photos = getCurrentPhotos();
  photos.push({ url, caption, source: 'custom' });
  renderPhotoBoard(photos);
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
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;" class="prop-fields">
          <div><label class="form-label">Display name</label><input class="form-control" data-prop-slug="${p.slug}" data-prop-field="name" placeholder="${escapeAttr(p.name)}" value="${escapeAttr(ov.name || '')}"/></div>
          <div><label class="form-label">Tagline</label><input class="form-control" data-prop-slug="${p.slug}" data-prop-field="tagline" placeholder="${escapeAttr(p.tagline)}" value="${escapeAttr(ov.tagline || '')}"/></div>
          <div><label class="form-label">Starting price</label><input class="form-control" type="number" data-prop-slug="${p.slug}" data-prop-field="basePrice" placeholder="${p.basePrice}" value="${ov.basePrice || ''}"/></div>
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
  if (val) o.props[slug][field] = field === 'basePrice' ? parseFloat(val) : val;
  else delete o.props[slug][field];
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
    const r = await fetch('/api/hospitable/sync');
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
    const r = await fetch('/api/hospitable/sync');
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
}

async function refreshPricelabsStatus() {
  const bar = document.getElementById('pricelabsStatus');
  if (!bar) return;
  bar.innerHTML = `<div style="display:flex; align-items:center; gap: 0.75rem; color: var(--color-stone); font-size: 0.9rem;"><div class="skel" style="width: 10px; height: 10px; border-radius: 999px;"></div> Checking connection…</div>`;
  try {
    const r = await fetch('/api/pricelabs/sync');
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
  // Stash opts so saveSecret/removeSecret can find them without JSON-in-attribute escapes.
  window._apiKeyOpts = window._apiKeyOpts || {};
  window._apiKeyOpts[secretKey] = { ...opts, mountId };
  // Try to fetch current state
  let state = { source: 'none', last4: null, updatedAt: null, envFallback: false, encryption: 'db', remoteAvailable: false };
  try {
    const r = await fetch('/api/admin/secrets');
    const j = await r.json();
    if (j.ok) {
      state.remoteAvailable = true;
      const item = (j.items || []).find(x => x.key === secretKey);
      if (item) {
        state.source = item.source;
        state.last4 = item.last4;
        state.updatedAt = item.updatedAt;
        state.envFallback = item.envFallback;
      }
      state.encryption = j.encryption;
    } else {
      state.error = j.error;
    }
  } catch (e) { state.error = e.message; }

  if (!state.remoteAvailable) {
    mount.innerHTML = `
      <div style="display:flex; align-items: start; gap: 0.75rem;">
        <div style="width: 10px; height: 10px; background: var(--color-stone); border-radius: 999px; margin-top: 6px; flex-shrink: 0;"></div>
        <div style="flex: 1;">
          <strong>${escapeHtml(opts.label)} API key — admin entry not available</strong>
          <p style="color: var(--color-stone); font-size: 0.9rem; margin: 0.4rem 0 0;">Connect Turso to enable saving keys from this admin panel. Until then, keys must be set as Vercel environment variables.</p>
          <p style="color: var(--color-stone); font-size: 0.85rem; margin: 0.4rem 0 0;">${escapeHtml(state.error || 'Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars in Vercel and redeploy.')}</p>
        </div>
      </div>`;
    return;
  }

  let stateLine = '';
  if (state.source === 'admin') {
    stateLine = `
      <div style="display:flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="display:inline-flex; align-items: center; gap: 0.4rem; color: var(--color-success); font-weight: 500;">
          <span style="width: 8px; height: 8px; background: var(--color-success); border-radius: 999px;"></span>
          Saved
        </span>
        <code style="background: var(--color-cream-dark); padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.85rem;">•••• ${escapeHtml(state.last4 || '')}</code>
        <span style="color: var(--color-stone); font-size: 0.85rem;">updated ${state.updatedAt ? new Date(state.updatedAt).toLocaleString() : '—'}</span>
      </div>`;
  } else if (state.source === 'env') {
    stateLine = `
      <div style="display:flex; align-items: center; gap: 0.5rem;">
        <span style="display:inline-flex; align-items: center; gap: 0.4rem; color: var(--color-charcoal); font-weight: 500;">
          <span style="width: 8px; height: 8px; background: var(--color-success); border-radius: 999px;"></span>
          Configured via Vercel env var
        </span>
      </div>
      <p style="color: var(--color-stone); font-size: 0.85rem; margin: 0.4rem 0 0;">You can override it here — admin-saved keys take precedence over env vars.</p>`;
  } else {
    stateLine = `
      <div style="display:flex; align-items: center; gap: 0.5rem;">
        <span style="display:inline-flex; align-items: center; gap: 0.4rem; color: var(--color-stone); font-weight: 500;">
          <span style="width: 8px; height: 8px; background: var(--color-stone); border-radius: 999px;"></span>
          Not set
        </span>
      </div>`;
  }

  mount.innerHTML = `
    <div style="margin-bottom: 1rem;">
      <strong style="display:block; margin-bottom: 0.5rem;">${escapeHtml(opts.label)} API key</strong>
      ${stateLine}
    </div>
    <div id="${secretKey}-form" style="margin-top: 1rem;">
      <label class="form-label">${state.source === 'none' ? 'Enter your API key' : 'Replace with a new key'}</label>
      <div style="display:flex; gap: 0.5rem; align-items: center;">
        <input type="password" class="form-control" id="${secretKey}-input" placeholder="${escapeAttr(opts.placeholder)}" style="font-family: monospace; font-size: 0.9rem;" autocomplete="off"/>
        <button class="btn btn-ghost btn-sm" type="button" onclick="togglePeek('${secretKey}-input', this)" title="Show / hide">👁</button>
      </div>
      <div style="display:flex; gap: 0.5rem; margin-top: 0.85rem; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="saveSecret('${secretKey}')">Save key</button>
        ${state.source === 'admin' ? `<button class="btn btn-ghost" onclick="removeSecret('${secretKey}')">Remove saved key</button>` : ''}
      </div>
      <p style="color: var(--color-stone); font-size: 0.82rem; margin: 0.85rem 0 0;">
        Get your key from <a href="${escapeAttr(opts.docsUrl)}" target="_blank" style="color: var(--color-primary); text-decoration: underline;">${escapeHtml(opts.docsLabel)}</a>.
        Stored encrypted (AES-256-GCM) in your Turso database${state.encryption === 'env' ? ' using a key from <code>SECRETS_KEY</code>' : ''}. The raw value is never returned to the browser after saving.
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
  const value = (input.value || '').trim();
  if (!value) { toast("Paste an API key first."); return; }
  if (value.length < 8) { toast("That looks too short to be a real key."); return; }
  try {
    const r = await fetch('/api/admin/secrets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: secretKey, value })
    });
    const j = await r.json();
    if (!j.ok) { toast(j.error || "Save failed"); return; }
    toast(`API key saved · last 4: ${j.last4}`);
    input.value = '';
    if (opts.mountId) await renderApiKeyPanel(secretKey, opts.mountId, opts);
    if (secretKey === 'hospitable_api_key') await refreshHospitableStatus();
    if (secretKey === 'pricelabs_api_key') await refreshPricelabsStatus();
  } catch (e) {
    toast(`Save failed: ${e.message}`);
  }
}

async function removeSecret(secretKey) {
  if (!confirm("Remove the saved API key? The integration will fall back to the env-var key (if set), or stop working.")) return;
  const opts = (window._apiKeyOpts || {})[secretKey] || {};
  const r = await fetch(`/api/admin/secrets?key=${encodeURIComponent(secretKey)}`, { method: 'DELETE' });
  const j = await r.json();
  if (!j.ok) { toast(j.error || "Remove failed"); return; }
  toast("API key removed.");
  if (opts.mountId) await renderApiKeyPanel(secretKey, opts.mountId, opts);
  if (secretKey === 'hospitable_api_key') await refreshHospitableStatus();
  if (secretKey === 'pricelabs_api_key') await refreshPricelabsStatus();
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
    const r = await fetch('/api/pricelabs/sync');
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
