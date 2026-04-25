// Admin dashboard — client-side demo auth + override editor
// PRODUCTION NOTE: replace the demo auth block with your real auth provider (Clerk, Auth0, Supabase, etc.)
// Overrides are stored in localStorage; for production back this with a database.

const ADMIN = {
  authKey: "nyris.admin.session",
  // Demo credentials — replace with real auth in production
  demoEmail: "sheena@nyrisretreats.com",
  demoPass: "nyris2026"
};

function isLoggedIn() {
  const s = Storage.get(ADMIN.authKey);
  return s && s.expires > Date.now();
}

function adminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  if (email === ADMIN.demoEmail && pass === ADMIN.demoPass) {
    Storage.set(ADMIN.authKey, { email, expires: Date.now() + 1000 * 60 * 60 * 8 });
    showDashboard();
  } else {
    toast("Wrong email or password. Try sheena@nyrisretreats.com / nyris2026 for demo.");
  }
}

function adminLogout() {
  localStorage.removeItem(ADMIN.authKey);
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  toast("Signed out.");
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  // Stats
  document.getElementById('stProps').textContent = NYRIS.properties.length;
  document.getElementById('stRating').textContent = NYRIS.brand.avgRating.toFixed(1);
  document.getElementById('stReviews').textContent = NYRIS.brand.totalReviews + '+';
  document.getElementById('stFavs').textContent = NYRIS.properties.filter(p => p.isGuestFavorite).length;

  // Hero defaults
  const o = Overrides.get();
  document.getElementById('aHEyebrow').value = o.heroEyebrow || "Top 1% Guest Favorite · Superhost-managed";
  document.getElementById('aHTitle').value = o.heroTitle || "Stay where the reviews don't lie.";
  document.getElementById('aHSub').value = o.heroSubtitle || "Hand-picked vacation homes across the Gulf Coast, Texas Hill Country, and Broken Bow. 5.0 stars across 200+ stays. Book direct — skip the platform fees.";
  document.getElementById('aHImg').value = o.heroImage || "https://assets.hospitable.com/property_images/1597444/Lm15xbpAlhpFK2m1TVqQMu9kKk5JXukcSaaWLfEP.jpg";
  ['aHEyebrow','aHTitle','aHSub','aHImg'].forEach(id => document.getElementById(id).addEventListener('input', updateHeroPreview));
  updateHeroPreview();

  // Order list
  const orderList = document.getElementById('orderList');
  const order = o.featuredOrder || NYRIS.properties.map(p => p.slug);
  // Make sure all current properties are in order, append any missing
  const seen = new Set(order);
  for (const p of NYRIS.properties) if (!seen.has(p.slug)) order.push(p.slug);
  orderList.innerHTML = order.map((slug) => {
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

  // Property overrides
  const propOv = document.getElementById('propOverrides');
  propOv.innerHTML = NYRIS.properties.map(p => {
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
          <div><label class="form-label">Display name</label><input class="form-control" data-prop-slug="${p.slug}" data-prop-field="name" placeholder="${escapeHtml(p.name)}" value="${escapeHtml(ov.name || '')}"/></div>
          <div><label class="form-label">Tagline</label><input class="form-control" data-prop-slug="${p.slug}" data-prop-field="tagline" placeholder="${escapeHtml(p.tagline)}" value="${escapeHtml(ov.tagline || '')}"/></div>
          <div><label class="form-label">Starting price</label><input class="form-control" type="number" data-prop-slug="${p.slug}" data-prop-field="basePrice" placeholder="${p.basePrice}" value="${ov.basePrice || ''}"/></div>
        </div>
      </div>`;
  }).join('');
  document.querySelectorAll('[data-prop-slug]').forEach(input => {
    input.addEventListener('change', savePropOverride);
  });
}

function updateHeroPreview() {
  document.getElementById('phEyebrow').textContent = document.getElementById('aHEyebrow').value;
  document.getElementById('phTitle').textContent = document.getElementById('aHTitle').value;
  document.getElementById('phSub').textContent = document.getElementById('aHSub').value;
  document.getElementById('heroPreview').style.backgroundImage = `url('${document.getElementById('aHImg').value}')`;
}

function saveHero() {
  const o = Overrides.get();
  o.heroEyebrow = document.getElementById('aHEyebrow').value.trim();
  o.heroTitle = document.getElementById('aHTitle').value.trim();
  o.heroSubtitle = document.getElementById('aHSub').value.trim();
  o.heroImage = document.getElementById('aHImg').value.trim();
  Overrides.set(o);
  toast("Hero saved. Reload the homepage to see it live.");
}

function resetHero() {
  const o = Overrides.get();
  delete o.heroEyebrow; delete o.heroTitle; delete o.heroSubtitle; delete o.heroImage;
  Overrides.set(o);
  showDashboard();
  toast("Hero reset.");
}

function showTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(t => t.style.display = 'none');
  document.getElementById('tab-' + name).style.display = 'block';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function bindDragOrder() {
  let dragSrc = null;
  document.querySelectorAll('.order-item').forEach(item => {
    item.addEventListener('dragstart', e => { dragSrc = item; item.style.opacity = '0.4'; });
    item.addEventListener('dragend', e => { item.style.opacity = '1'; });
    item.addEventListener('dragover', e => { e.preventDefault(); });
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrc && dragSrc !== item) {
        const list = item.parentNode;
        const items = [...list.children];
        const srcIdx = items.indexOf(dragSrc);
        const tgtIdx = items.indexOf(item);
        if (srcIdx < tgtIdx) item.after(dragSrc); else item.before(dragSrc);
      }
    });
  });
}

function saveOrder() {
  const order = [...document.querySelectorAll('.order-item')].map(li => li.dataset.slug);
  const o = Overrides.get();
  o.featuredOrder = order;
  Overrides.set(o);
  toast("Order saved.");
}

function savePropOverride(e) {
  const o = Overrides.get();
  o.props = o.props || {};
  const slug = e.target.dataset.propSlug;
  const field = e.target.dataset.propField;
  const val = e.target.value.trim();
  o.props[slug] = o.props[slug] || {};
  if (val) {
    o.props[slug][field] = field === 'basePrice' ? parseFloat(val) : val;
  } else {
    delete o.props[slug][field];
  }
  Overrides.set(o);
  toast("Saved.");
}

function resetAll() {
  if (!confirm("This will clear ALL admin overrides. Continue?")) return;
  localStorage.removeItem('nyris.overrides');
  toast("All overrides cleared.");
  showDashboard();
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) showDashboard();
});
