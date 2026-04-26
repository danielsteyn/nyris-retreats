// Home page logic

(function() {
  // Apply admin overrides
  const o = Overrides.get();
  if (o.heroTitle) document.getElementById('heroTitle').textContent = o.heroTitle;
  if (o.heroSubtitle) document.getElementById('heroSubtitle').textContent = o.heroSubtitle;
  if (o.heroEyebrow) document.getElementById('heroEyebrow').textContent = o.heroEyebrow;
  if (o.heroImage) document.getElementById('heroImg').style.backgroundImage = `url('${o.heroImage}')`;

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
