// Nyris Retreats — Shared App Logic

// ===== SVG icon registry =====
const ICON = {
  logo: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 26 L16 6 L28 26 Z"/><path d="M10 26 L16 14 L22 26"/><circle cx="16" cy="22" r="1.2" fill="currentColor"/></svg>`,
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  star: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
  user: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  menu: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  close: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  chevronLeft: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  chevronRight: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  share: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`,
  badge: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 13.4 7.2 16l.9-5.4-3.9-3.8 5.4-.8z"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.5h5.7l-4.6 3.4 1.8 5.6L12 13l-4.7 3.5 1.8-5.6L4.5 7.5h5.7z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>`
};

// ===== Storage helpers =====
const Storage = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
};

// ===== Wishlist =====
const Wishlist = {
  key: "nyris.wishlist",
  get() { return Storage.get(this.key, []); },
  has(id) { return this.get().includes(id); },
  toggle(id) {
    const list = this.get();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1); else list.push(id);
    Storage.set(this.key, list);
    document.dispatchEvent(new CustomEvent("wishlist:changed", { detail: { id, on: i < 0 } }));
    return i < 0;
  },
  count() { return this.get().length; }
};

// ===== Compare =====
const Compare = {
  key: "nyris.compare",
  get() { return Storage.get(this.key, []); },
  has(id) { return this.get().includes(id); },
  toggle(id) {
    const list = this.get();
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else if (list.length < 4) list.push(id);
    else { toast("Compare up to 4 properties at a time"); return false; }
    Storage.set(this.key, list);
    document.dispatchEvent(new CustomEvent("compare:changed"));
    return i < 0;
  },
  clear() { Storage.set(this.key, []); document.dispatchEvent(new CustomEvent("compare:changed")); }
};

// ===== Recently viewed =====
const RecentlyViewed = {
  key: "nyris.recent",
  get() { return Storage.get(this.key, []); },
  add(id) {
    let list = this.get().filter(x => x !== id);
    list.unshift(id);
    list = list.slice(0, 6);
    Storage.set(this.key, list);
  }
};

// ===== Custom overrides (set via /admin) =====
const Overrides = {
  key: "nyris.overrides",
  get() { return Storage.get(this.key, {}); },
  set(obj) { Storage.set(this.key, obj); }
};
function applyOverrides(props) {
  const o = Overrides.get();
  if (o.heroTitle) NYRIS.brand.heroTitle = o.heroTitle;
  if (o.heroSubtitle) NYRIS.brand.heroSubtitle = o.heroSubtitle;
  if (o.heroImage) NYRIS.brand.heroImage = o.heroImage;

  // Per-property field overrides (name, tagline, basePrice, cleaningFee, …)
  if (o.props) {
    for (const p of props) {
      const ov = o.props[p.slug];
      if (!ov) continue;
      if (ov.name) p.name = ov.name;
      if (ov.tagline) p.tagline = ov.tagline;
      if (ov.basePrice != null) p.basePrice = Number(ov.basePrice);
      if (ov.cleaningFee != null) p.cleaningFee = Number(ov.cleaningFee);
    }
  }

  if (o.featuredOrder && Array.isArray(o.featuredOrder)) {
    const ordered = [];
    for (const slug of o.featuredOrder) {
      const p = props.find(x => x.slug === slug);
      if (p) ordered.push(p);
    }
    for (const p of props) if (!ordered.includes(p)) ordered.push(p);
    return ordered;
  }
  return props;
}

// ===== Toast =====
function toast(msg, ms = 2400) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div"); t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}

// ===== Build header =====
function renderHeader(active = "") {
  const el = document.querySelector("#site-header") || document.querySelector(".site-header");
  if (!el) return;
  el.classList.add("site-header");
  const t = (window.Theme && window.Theme.get()) || { brandName: NYRIS.brand.name };
  const logoHtml = (window.Theme && window.Theme.logoMark(t)) || ICON.logo;
  el.innerHTML = `
    <div class="nav-inner">
      <a href="/" class="brand-mark" aria-label="${escapeHtml(t.brandName)} home">
        ${logoHtml}
        <span data-brand-name>${escapeHtml(t.brandName)}</span>
      </a>
      <nav class="nav-links" aria-label="Primary">
        <a href="/search.html" class="${active==='stays'?'active':''}">All stays</a>
        <a href="/index.html#destinations" class="${active==='destinations'?'active':''}">Destinations</a>
        <a href="/experiences.html" class="${active==='experiences'?'active':''}">Experiences</a>
        <a href="/about.html" class="${active==='about'?'active':''}">Our Story</a>
        <a href="/faq.html" class="${active==='faq'?'active':''}">FAQ</a>
      </nav>
      <div class="nav-actions">
        <a href="/wishlist.html" class="icon-btn" aria-label="Your wishlist" title="Wishlist">
          ${ICON.heart.replace('<svg', '<svg width="20" height="20" stroke="currentColor" fill="none"')}
        </a>
        <a href="/admin.html" class="btn btn-outline btn-sm">Host login</a>
        <button class="icon-btn mobile-menu-btn" aria-label="Open menu" onclick="openDrawer()">${ICON.menu}</button>
      </div>
    </div>
    <div class="mobile-drawer" id="mobileDrawer">
      <button class="icon-btn close-drawer" onclick="closeDrawer()" aria-label="Close menu">${ICON.close}</button>
      <a href="/search.html">All stays</a>
      <a href="/index.html#destinations">Destinations</a>
      <a href="/experiences.html">Experiences</a>
      <a href="/about.html">Our Story</a>
      <a href="/faq.html">FAQ</a>
      <a href="/wishlist.html">Wishlist</a>
      <a href="/contact.html">Contact</a>
      <a href="/admin.html">Host login</a>
    </div>`;

  window.addEventListener("scroll", () => {
    el.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });
}
function openDrawer() { document.getElementById("mobileDrawer")?.classList.add("open"); }
function closeDrawer() { document.getElementById("mobileDrawer")?.classList.remove("open"); }

// ===== Build footer =====
function renderFooter() {
  const el = document.querySelector("#site-footer") || document.querySelector(".site-footer");
  if (!el) return;
  el.classList.add("site-footer");
  const yr = new Date().getFullYear();
  const t = (window.Theme && window.Theme.get()) || { brandName: NYRIS.brand.name };
  const logoHtml = (window.Theme && window.Theme.logoMark(t)) || ICON.logo;
  el.innerHTML = `
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="brand-mark" style="color: var(--color-cream);">
          ${logoHtml}
          <span data-brand-name>${escapeHtml(t.brandName)}</span>
        </div>
        <p style="margin-top: 1rem;">Curated, Superhost-managed vacation homes — every one a Top 1% Guest Favorite. Skip the platform fees and book direct.</p>
        <p style="margin-top: 1rem; font-size: 0.85rem;">${NYRIS.brand.email} &middot; ${NYRIS.brand.phone}</p>
      </div>
      <div>
        <h4>Stays</h4>
        <ul>
          <li><a href="/search.html">Browse all properties</a></li>
          <li><a href="/search.html?dest=gulf-shores">Gulf Shores</a></li>
          <li><a href="/search.html?dest=broken-bow">Broken Bow</a></li>
          <li><a href="/search.html?dest=bolivar-peninsula">Crystal Beach</a></li>
          <li><a href="/search.html?dest=dfw-metroplex">DFW area</a></li>
        </ul>
      </div>
      <div>
        <h4>Discover</h4>
        <ul>
          <li><a href="/experiences.html">Local experiences</a></li>
          <li><a href="/about.html">About our Superhost</a></li>
          <li><a href="/gift-cards.html">Gift cards</a></li>
          <li><a href="/contact.html">Group inquiries</a></li>
          <li><a href="/faq.html">FAQ</a></li>
        </ul>
      </div>
      <div>
        <h4>Support</h4>
        <ul>
          <li><a href="/contact.html">Contact us</a></li>
          <li><a href="/faq.html#cancellation">Cancellation policy</a></li>
          <li><a href="/faq.html#pets">Pet policy</a></li>
          <li><a href="/admin.html">Host login</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-base">
      <span>&copy; ${yr} Nyris Retreats. Independent direct booking site. All rights reserved.</span>
      <span>Direct booking · No platform fees · 5.0 average across 200+ stays</span>
    </div>`;
}

// ===== Reveal on scroll =====
function initReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal, .reveal-stagger").forEach(el => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal, .reveal-stagger").forEach(el => io.observe(el));
}

// ===== Property card builder =====
function propertyCard(p, opts = {}) {
  const liked = Wishlist.has(p.id);
  const compareOn = Compare.has(p.id);
  // If admin photo overrides have already loaded for this page-view, apply them
  // here at render time so there's no flash. Otherwise applyToCards() will run
  // after PhotoOverrides.load() resolves and update the cards in place.
  const images = (PhotoOverrides && PhotoOverrides._data) ? PhotoOverrides.imagesFor(p) : p.images;
  return `
  <article class="prop-card" data-id="${p.id}">
    <div class="prop-card-media" data-images='${JSON.stringify(images.slice(0, 5))}'>
      <img class="prop-card-img" src="${images[0]}" alt="${escapeHtml(p.name)}" loading="lazy"/>
      <div class="prop-card-badges">
        ${p.isGuestFavorite ? `<span class="badge badge-favorite">${ICON.badge.replace('<svg','<svg width="11" height="11"')} Guest Favorite</span>` : ''}
        ${p.isNew ? `<span class="badge badge-new">New</span>` : ''}
      </div>
      <button class="wishlist-btn" aria-label="Save to wishlist" aria-pressed="${liked}" data-wishlist="${p.id}">
        ${ICON.heart.replace('<svg','<svg width="20" height="20"')}
      </button>
      <button class="prop-card-arrow left" aria-label="Previous photo" data-arrow="prev">${ICON.chevronLeft}</button>
      <button class="prop-card-arrow right" aria-label="Next photo" data-arrow="next">${ICON.chevronRight}</button>
      <div class="prop-card-dots">
        ${p.images.slice(0, 5).map((_, i) => `<span class="${i===0?'active':''}"></span>`).join('')}
      </div>
    </div>
    <a href="/property.html?slug=${p.slug}" class="prop-card-body" style="display:block; color: inherit;">
      <div class="prop-card-title-row">
        <h3 class="prop-card-title">${escapeHtml(p.name)}</h3>
        <span class="prop-card-rating">${ICON.star.replace('width="14" height="14"','width="13" height="13"')} ${p.rating.toFixed(1)}${p.reviewCount ? ` <span style="color:var(--color-stone)">(${p.reviewCount})</span>` : ''}</span>
      </div>
      <p class="prop-card-meta">${p.city}, ${p.state} &middot; ${p.type}</p>
      <p class="prop-card-meta">${p.capacity.guests} guests &middot; ${p.capacity.bedrooms} BR &middot; ${p.capacity.bathrooms} BA</p>
      <p class="prop-card-price"><strong>$${p.basePrice}</strong> <span style="color: var(--color-stone)">/ night</span></p>
    </a>
  </article>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== Bind card interactions =====
function bindPropertyCards(scope = document) {
  // Wishlist
  scope.querySelectorAll('[data-wishlist]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const id = btn.dataset.wishlist;
      const on = Wishlist.toggle(id);
      btn.setAttribute('aria-pressed', String(on));
      toast(on ? "Saved to your wishlist" : "Removed from wishlist");
    });
  });
  // Image carousel on cards
  scope.querySelectorAll('.prop-card-media').forEach(media => {
    const imgs = JSON.parse(media.dataset.images || '[]');
    if (imgs.length < 2) return;
    let idx = 0;
    const imgEl = media.querySelector('.prop-card-img');
    const dots = media.querySelectorAll('.prop-card-dots span');
    const update = () => {
      imgEl.style.opacity = '0';
      setTimeout(() => { imgEl.src = imgs[idx]; imgEl.style.opacity = '1'; }, 120);
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    };
    imgEl.style.transition = 'opacity 0.2s';
    media.querySelector('[data-arrow="prev"]').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      idx = (idx - 1 + imgs.length) % imgs.length; update();
    });
    media.querySelector('[data-arrow="next"]').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      idx = (idx + 1) % imgs.length; update();
    });
  });
}

// ===== Compare bar =====
function renderCompareBar() {
  let bar = document.querySelector('#compareBar');
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'compareBar'; bar.className = 'compare-bar';
    document.body.appendChild(bar);
  }
  const sync = () => {
    const ids = Compare.get();
    if (ids.length < 2) { bar.classList.remove('show'); return; }
    bar.innerHTML = `
      <span>${ids.length} properties to compare</span>
      <a href="/compare.html" class="btn btn-accent">Compare</a>
      <button class="btn btn-ghost" style="color:white" onclick="Compare.clear()">Clear</button>`;
    bar.classList.add('show');
  };
  document.addEventListener('compare:changed', sync);
  sync();
}

// ===== Lightbox =====
const Lightbox = {
  open(images, startIdx = 0) {
    let lb = document.querySelector('#lightbox');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'lightbox'; lb.className = 'lightbox';
      lb.innerHTML = `
        <button class="lightbox-close" aria-label="Close">${ICON.close}</button>
        <button class="lightbox-nav prev" aria-label="Previous">${ICON.chevronLeft}</button>
        <img alt=""/>
        <button class="lightbox-nav next" aria-label="Next">${ICON.chevronRight}</button>
        <div class="lightbox-counter"></div>`;
      document.body.appendChild(lb);
    }
    lb._images = images; lb._idx = startIdx;
    const update = () => {
      lb.querySelector('img').src = lb._images[lb._idx];
      lb.querySelector('.lightbox-counter').textContent = `${lb._idx + 1} / ${lb._images.length}`;
    };
    update();
    lb.querySelector('.prev').onclick = () => { lb._idx = (lb._idx - 1 + lb._images.length) % lb._images.length; update(); };
    lb.querySelector('.next').onclick = () => { lb._idx = (lb._idx + 1) % lb._images.length; update(); };
    lb.querySelector('.lightbox-close').onclick = () => Lightbox.close();
    lb.onclick = (e) => { if (e.target === lb) Lightbox.close(); };
    document.addEventListener('keydown', Lightbox._key);
    lb.classList.add('open');
  },
  _key(e) {
    const lb = document.querySelector('#lightbox.open');
    if (!lb) return;
    if (e.key === 'Escape') Lightbox.close();
    if (e.key === 'ArrowLeft') lb.querySelector('.prev').click();
    if (e.key === 'ArrowRight') lb.querySelector('.next').click();
  },
  close() {
    document.querySelector('#lightbox')?.classList.remove('open');
    document.removeEventListener('keydown', Lightbox._key);
  }
};

// =============================================================================
// PhotoOverrides — admin-edited photo lists (cover, captions, custom uploads).
// Loaded once per page from /api/photos, then merged with each property's static
// images. The first item is used as the card cover.
// =============================================================================
const PhotoOverrides = {
  _data: null,
  _promise: null,
  async load() {
    if (this._promise) return this._promise;
    this._promise = (async () => {
      try {
        const r = await fetch("/api/photos");
        const j = await r.json();
        this._data = j.ok ? (j.overrides || {}) : {};
      } catch { this._data = {}; }
      return this._data;
    })();
    return this._promise;
  },
  // Returns the effective image list for a property, with overrides applied.
  imagesFor(property) {
    const ov = this._data?.[property.id];
    if (!ov || ov.length === 0) return property.images;
    // Admin's order is authoritative. Append any base images not in admin list.
    const overrideUrls = new Set(ov.map(p => p.url));
    const remainingBase = (property.images || []).filter(u => !overrideUrls.has(u));
    return [...ov.map(p => p.url), ...remainingBase];
  },
  // Re-apply overrides to all property cards on the page after load completes.
  applyToCards() {
    document.querySelectorAll(".prop-card[data-id]").forEach(card => {
      const id = card.dataset.id;
      const property = NYRIS.properties.find(p => p.id === id);
      if (!property) return;
      const images = this.imagesFor(property);
      const media = card.querySelector(".prop-card-media");
      const img = card.querySelector(".prop-card-img");
      if (!media || !img) return;
      const newFirst = images[0];
      if (img.src !== newFirst) {
        img.style.opacity = "0";
        setTimeout(() => { img.src = newFirst; img.style.opacity = "1"; }, 100);
      }
      // Update the carousel's image list so prev/next reflect overrides too
      media.dataset.images = JSON.stringify(images.slice(0, 5));
    });
  }
};

// ===== Format helpers =====
function fmtPrice(n) { return '$' + Number(n).toLocaleString(); }
function nightsBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}
function isoToday(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

// ===== Init on every page =====
document.addEventListener('DOMContentLoaded', () => {
  if (typeof NYRIS !== 'undefined') {
    NYRIS.properties = applyOverrides(NYRIS.properties);
  }
  renderHeader(window.__activeNav || '');
  renderFooter();
  initReveal();
  renderCompareBar();

  // Fire-and-update: load admin photo overrides in the background and re-apply
  // them to any rendered property cards once they arrive.
  PhotoOverrides.load().then(() => PhotoOverrides.applyToCards());
});
