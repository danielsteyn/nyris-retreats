// Home page logic

(async function() {
  // Wait for the server-side overrides fetch kicked off by app.js so visitors
  // on devices that haven't seen admin edits before get fresh data, not the
  // defaults baked into data.js.
  if (window.__overridesReady) await window.__overridesReady;

  // Apply admin overrides up-front. This IIFE runs before DOMContentLoaded
  // (where app.js also calls applyOverrides), so without this call the
  // destination grid + dropdown render with un-overridden NYRIS.destinations.
  // applyOverrides is idempotent — re-running it on DOMContentLoaded is safe.
  if (typeof applyOverrides === "function" && typeof NYRIS !== "undefined") {
    NYRIS.properties = applyOverrides(NYRIS.properties);
  }
  // Apply admin overrides
  const o = Overrides.get();
  if (o.heroTitle) document.getElementById('heroTitle').textContent = o.heroTitle;
  if (o.heroSubtitle) document.getElementById('heroSubtitle').textContent = o.heroSubtitle;
  if (o.heroEyebrow) document.getElementById('heroEyebrow').textContent = o.heroEyebrow;
  // Hero background photos. Admin can save an array under o.heroImages; legacy
  // installs only had o.heroImage (single). Single → just set background.
  // Multiple → build a crossfade carousel, 15s interval, 1.5s soft transition;
  // all slides share the same Ken Burns zoom so they move together.
  const heroImages = (Array.isArray(o.heroImages) && o.heroImages.length)
    ? o.heroImages.filter(Boolean)
    : (o.heroImage ? [o.heroImage] : []);
  if (heroImages.length === 1) {
    document.getElementById('heroImg').style.backgroundImage = `url('${heroImages[0]}')`;
  } else if (heroImages.length > 1) {
    const heroEl = document.querySelector('.hero');
    const first = document.getElementById('heroImg');
    heroEl.classList.add('has-carousel');
    first.style.backgroundImage = `url('${heroImages[0]}')`;
    first.classList.add('active');
    let cursor = first;
    for (let i = 1; i < heroImages.length; i++) {
      const div = document.createElement('div');
      div.className = 'hero-img';
      div.style.backgroundImage = `url('${heroImages[i]}')`;
      cursor.parentNode.insertBefore(div, cursor.nextSibling);
      cursor = div;
    }
    let idx = 0;
    const slides = heroEl.querySelectorAll('.hero-img');
    setInterval(() => {
      slides[idx].classList.remove('active');
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add('active');
    }, 15000);
  }

  // Meet-your-host section overrides. Body fields accept simple HTML (e.g. <em>).
  if (o.host) {
    const h = o.host;
    if (h.image) document.getElementById('hostImage')?.setAttribute('src', h.image);
    if (h.eyebrow) document.getElementById('hostEyebrow').textContent = h.eyebrow;
    if (h.title) document.getElementById('hostTitle').textContent = h.title;
    if (h.body1) document.getElementById('hostBody1').innerHTML = h.body1;
    if (h.body2) document.getElementById('hostBody2').innerHTML = h.body2;
    const btn = document.getElementById('hostButton');
    if (btn) {
      if (h.buttonText) btn.textContent = h.buttonText;
      if (h.buttonLink) btn.setAttribute('href', h.buttonLink);
    }
  }

  // Why book direct section overrides — eyebrow, title, 4 bullets, image,
  // and the testimonial quote/caption pinned to the photo card.
  if (o.whyBook) {
    const w = o.whyBook;
    if (w.eyebrow) document.getElementById('whyEyebrow').textContent = w.eyebrow;
    if (w.title) document.getElementById('whyTitle').textContent = w.title;
    if (Array.isArray(w.bullets)) {
      w.bullets.forEach((b, i) => {
        if (!b) return;
        const t = document.querySelector(`[data-why-bullet="${i}-title"]`);
        const p = document.querySelector(`[data-why-bullet="${i}-body"]`);
        if (t && b.title) t.textContent = b.title;
        if (p && b.body) p.textContent = b.body;
      });
    }
    if (w.image) document.getElementById('whyImage')?.setAttribute('src', w.image);
    if (w.quote) document.getElementById('whyQuote').textContent = w.quote;
    if (w.quoteCaption) document.getElementById('whyQuoteCaption').textContent = w.quoteCaption;
  }

  // Stats
  document.getElementById('statRating').textContent = NYRIS.brand.avgRating.toFixed(1);
  document.getElementById('statReviews').textContent = NYRIS.brand.totalReviews + '+';

  // Search bar populate destinations
  const dest = document.getElementById('searchDest');
  if (dest) {
    NYRIS.destinations.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.slug; opt.textContent = `${d.name}, ${d.state}`;
      dest.appendChild(opt);
    });
  }
  // Search icon
  const si = document.getElementById('searchIcon');
  if (si) si.innerHTML = ICON.search;
  // Default dates
  // Wire the shared booking calendar to the hero search bar.
  // No property selected, so the calendar is just a date picker — no
  // booked-date blocking, no per-night prices.
  if (window.BkCal) {
    window.BkCal.propertyId = null;
    window.BkCal.targets = {
      container: "heroCalendar",
      checkinValue: "searchCheckin",
      checkoutValue: "searchCheckout",
      checkinDisplay: "searchCheckinDisplay",
      checkoutDisplay: "searchCheckoutDisplay"
    };
    window.BkCal.onChange = null;
  }

  // Featured grid
  const grid = document.getElementById('featuredGrid');
  const featured = NYRIS.properties.filter(p => p.isGuestFavorite || p.reviewCount > 5).concat(
    NYRIS.properties.filter(p => !(p.isGuestFavorite || p.reviewCount > 5))
  );
  grid.innerHTML = featured.map(p => propertyCard(p)).join('');
  bindPropertyCards(grid);

  // Destinations grid
  const dg = document.getElementById('destGrid');
  dg.innerHTML = NYRIS.destinations.map(d => `
    <a href="/search.html?dest=${d.slug}" class="dest-card">
      <img src="${d.image}" alt="${escapeHtml(d.name)}, ${escapeHtml(d.state)}" loading="lazy"/>
      <div class="dest-overlay"></div>
      <div class="dest-count">${d.count} ${d.count === 1 ? 'home' : 'homes'}</div>
      <div class="dest-content">
        <h3>${escapeHtml(d.name)}</h3>
        <p>${escapeHtml(d.tagline)}</p>
      </div>
    </a>`).join('');

  // Value-props icons
  ['iconCheck1','iconCheck2','iconCheck3','iconCheck4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = ICON.check.replace('<svg','<svg width="18" height="18"');
  });

  // Reviews carousel — pull a few from each property, duplicate for infinite scroll
  const allReviews = [];
  NYRIS.properties.forEach(p => {
    p.reviews.slice(0, 3).forEach(r => allReviews.push({ ...r, property: p.name }));
  });
  // Shuffle a bit for variety
  for (let i = allReviews.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allReviews[i], allReviews[j]] = [allReviews[j], allReviews[i]];
  }
  const reviewHtml = allReviews.map(r => `
    <div class="review-pill">
      <div style="color: var(--color-accent); font-size: 0.85rem; letter-spacing: 0.06em; margin-bottom: 0.5rem;">★★★★★</div>
      <p style="font-size: 0.95rem; line-height: 1.55; color: var(--color-charcoal); margin: 0 0 1rem;">"${escapeHtml(r.text.slice(0, 220))}${r.text.length > 220 ? '…' : ''}"</p>
      <div style="font-size: 0.82rem; color: var(--color-stone);">${escapeHtml(r.author)} &middot; <a href="#" style="color: var(--color-primary);">${escapeHtml(r.property)}</a></div>
    </div>`).join('');
  // Duplicate for seamless scroll
  document.getElementById('reviewTrack').innerHTML = reviewHtml + reviewHtml;

  // FAQ teaser (first 4)
  const fq = document.getElementById('faqTeaser');
  fq.innerHTML = NYRIS.faqs.slice(0, 4).map((f, i) => `
    <div class="faq-item ${i === 0 ? 'open' : ''}">
      <button class="faq-q" onclick="toggleFaq(this)">
        <span>${escapeHtml(f.q)}</span>
        <span class="icon">${ICON.plus}</span>
      </button>
      <div class="faq-a"><div><p>${escapeHtml(f.a)}</p></div></div>
    </div>`).join('');
})();

function toggleFaq(btn) {
  btn.closest('.faq-item').classList.toggle('open');
}

function goSearch(e) {
  e.preventDefault();
  const params = new URLSearchParams();
  const dest = document.getElementById('searchDest').value;
  const ci = document.getElementById('searchCheckin').value;
  const co = document.getElementById('searchCheckout').value;
  const g = document.getElementById('searchGuests').value;
  if (dest) params.set('dest', dest);
  if (ci) params.set('checkin', ci);
  if (co) params.set('checkout', co);
  if (g) params.set('guests', g);
  window.location.href = '/search.html' + (params.toString() ? '?' + params.toString() : '');
}

function newsletterSubmit(e) {
  e.preventDefault();
  toast("Welcome to the list! Check your inbox for confirmation.");
  e.target.reset();
}
