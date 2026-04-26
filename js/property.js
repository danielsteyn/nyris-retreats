// Property detail page logic

// =============================================================================
// Booking calendar state — must be defined BEFORE the IIFE below, because the
// IIFE references window.BkCal synchronously when wiring the property in.
// (Prior version of this file had `await PhotoOverrides.load()` in the IIFE
// which yielded long enough for the file's later top-level code to run; the
// non-blocking render refactor removed that yield, so we must hoist this.)
// =============================================================================
window.BkCal = window.BkCal || {
  propertyId: null,
  data: null,
  range: { ci: null, co: null },
  hover: null,
  monthAnchor: null,
  pickFor: "checkin",
  loading: false
};

(async function() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const p = NYRIS.properties.find(x => x.slug === slug);
  const root = document.getElementById('propRoot');

  if (!p) {
    root.innerHTML = `<div style="text-align:center; padding: 6rem 0;">
      <h1>Property not found</h1>
      <p style="margin-top: 1rem;"><a href="/search.html" class="btn btn-primary">View all stays</a></p>
    </div>`;
    return;
  }

  document.title = `${p.name} — ${p.city}, ${p.state} | Nyris Retreats`;
  RecentlyViewed.add(p.id);

  // Apply admin photo overrides if they're already cached; otherwise render
  // with static images and upgrade once the override fetch resolves. We
  // never block the render on the API — a slow / failed /api/photos call
  // must not leave the page blank.
  if (PhotoOverrides && PhotoOverrides._data) {
    p.images = PhotoOverrides.imagesFor(p);
  } else if (PhotoOverrides) {
    PhotoOverrides.load().then(() => {
      const newImages = PhotoOverrides.imagesFor(p);
      if (newImages[0] !== p.images[0]) {
        p.images = newImages;
        applyOverridesToGallery(newImages);
      }
    }).catch(() => {});
  }

  // Build the page
  root.innerHTML = `
    <!-- Title row -->
    <div class="reveal" style="margin-bottom: 1.5rem;">
      <h1 style="font-size: clamp(1.85rem, 3.5vw, 2.6rem); margin: 0 0 0.4rem;">${escapeHtml(p.name)}</h1>
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap: 0.85rem; font-size: 0.92rem; color: var(--color-charcoal);">
        <span style="display:inline-flex; align-items:center; gap:0.3rem;">${ICON.star} <strong>${p.rating.toFixed(1)}</strong></span>
        <span style="color: var(--color-stone);">·</span>
        <span style="text-decoration: underline;">${p.reviewCount} review${p.reviewCount===1?'':'s'}</span>
        <span style="color: var(--color-stone);">·</span>
        <span>${p.city}, ${p.state}</span>
        ${p.isGuestFavorite ? `<span style="color: var(--color-stone);">·</span><span class="badge badge-favorite">${ICON.badge.replace('<svg','<svg width="11" height="11"')} Guest Favorite</span>` : ''}
        <div style="margin-left:auto; display:flex; gap: 0.5rem;">
          <button class="btn btn-ghost btn-sm" onclick="shareProperty()">${ICON.share} Share</button>
          <button class="btn btn-ghost btn-sm" id="saveBtn" onclick="toggleSave()">${ICON.heart.replace('<svg','<svg width="16" height="16" stroke="currentColor" fill="none"')} <span>Save</span></button>
        </div>
      </div>
    </div>

    <!-- Gallery -->
    <div class="detail-gallery reveal" id="detailGallery">
      ${p.images.slice(0, 5).map((src, i) => `
        <div data-idx="${i}"><img src="${src}" alt="${escapeHtml(p.name)} photo ${i+1}" loading="${i<2?'eager':'lazy'}"/></div>
      `).join('')}
      <button class="show-all" onclick="Lightbox.open(window.__propImages, 0)">Show all ${p.images.length} photos</button>
    </div>

    <!-- Body grid -->
    <div style="display:grid; grid-template-columns: 1.6fr 1fr; gap: 4rem; margin-top: 3rem;" class="detail-grid">
      <!-- Left -->
      <div>
        <!-- Quick info -->
        <div style="display:flex; justify-content:space-between; align-items: start; gap: 1rem; padding-bottom: 2rem; border-bottom: 1px solid var(--color-line);">
          <div>
            <h2 style="font-size: 1.5rem; margin:0;">${p.type} hosted by Sheena</h2>
            <p style="color: var(--color-stone); margin: 0.4rem 0 0;">${p.capacity.guests} guests · ${p.capacity.bedrooms} bedrooms · ${p.capacity.beds} beds · ${p.capacity.bathrooms} baths</p>
          </div>
          <div style="width: 56px; height: 56px; border-radius: 999px; background: var(--color-primary); color: var(--color-cream); display: inline-flex; align-items:center; justify-content:center; font-family: var(--font-display); font-size: 1.4rem; font-weight: 600; flex-shrink:0;">S</div>
        </div>

        <!-- Trust bullets -->
        <div style="padding: 2rem 0; border-bottom: 1px solid var(--color-line);">
          <div style="display:flex; gap: 1.25rem; align-items: start;">
            <div style="flex-shrink:0; color: var(--color-accent);">${ICON.badge.replace('<svg','<svg width="28" height="28"')}</div>
            <div>
              <strong style="font-size: 1.02rem;">One of the most loved homes on Airbnb</strong>
              <p style="color: var(--color-stone); margin: 0.25rem 0 0; font-size: 0.92rem;">A Top 1% Guest Favorite — based on ratings, reviews, and reliability data from past stays.</p>
            </div>
          </div>
          <div style="display:flex; gap: 1.25rem; align-items: start; margin-top: 1.5rem;">
            <div style="flex-shrink:0; color: var(--color-accent);">${ICON.spark.replace('<svg','<svg width="28" height="28"')}</div>
            <div>
              <strong style="font-size: 1.02rem;">Superhost</strong>
              <p style="color: var(--color-stone); margin: 0.25rem 0 0; font-size: 0.92rem;">Sheena is a Superhost — experienced, highly rated, and committed to providing great stays.</p>
            </div>
          </div>
          <div style="display:flex; gap: 1.25rem; align-items: start; margin-top: 1.5rem;">
            <div style="flex-shrink:0; color: var(--color-accent);">${ICON.pin.replace('<svg','<svg width="28" height="28"')}</div>
            <div>
              <strong style="font-size: 1.02rem;">Great location</strong>
              <p style="color: var(--color-stone); margin: 0.25rem 0 0; font-size: 0.92rem;">100% of recent guests gave the location a 5-star rating.</p>
            </div>
          </div>
        </div>

        <!-- Summary -->
        <div style="padding: 2rem 0; border-bottom: 1px solid var(--color-line);">
          <h2 style="font-size: 1.4rem; margin: 0 0 1rem;">About this stay</h2>
          <p style="line-height: 1.75; font-size: 1rem; color: var(--color-charcoal); margin: 0;">${escapeHtml(p.summary)}</p>
        </div>

        <!-- Highlights -->
        ${p.highlights && p.highlights.length ? `
        <div style="padding: 2rem 0; border-bottom: 1px solid var(--color-line);">
          <h2 style="font-size: 1.4rem; margin: 0 0 1rem;">What makes this stay special</h2>
          <ul style="list-style:none; padding:0; margin:0;">
            ${p.highlights.map(h => `<li style="display:flex; gap:0.75rem; padding:0.5rem 0;"><span style="color: var(--color-primary);">${ICON.check.replace('<svg','<svg width="18" height="18"')}</span><span>${escapeHtml(h)}</span></li>`).join('')}
          </ul>
        </div>` : ''}

        <!-- Experiences -->
        ${p.experiences && p.experiences.length ? `
        <div style="padding: 2rem 0; border-bottom: 1px solid var(--color-line);">
          <h2 style="font-size: 1.4rem; margin: 0 0 0.5rem;">Experiences nearby</h2>
          <p style="color: var(--color-stone); margin: 0 0 1.5rem;">Curated favorites from Sheena and past guests.</p>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            ${p.experiences.map(e => `
              <div style="padding: 1rem 1.25rem; border: 1px solid var(--color-line); border-radius: 14px; background: white; transition: box-shadow 0.2s; font-size: 0.95rem;">
                <span style="display:inline-flex; align-items:center; gap: 0.4rem; color: var(--color-accent); font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; margin-bottom: 0.4rem;">${ICON.spark.replace('<svg','<svg width="14" height="14"')} Local pick</span>
                <p style="margin: 0; line-height: 1.5;">${escapeHtml(e)}</p>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- Amenities -->
        <div style="padding: 2rem 0; border-bottom: 1px solid var(--color-line);">
          <h2 style="font-size: 1.4rem; margin: 0 0 1.5rem;">What this place offers</h2>
          <div class="amenity-grid">
            ${p.amenities.slice(0, 12).map(a => `
              <div class="amenity-item">
                ${ICON.check}
                <span>${escapeHtml(a)}</span>
              </div>`).join('')}
          </div>
          ${p.amenities.length > 12 ? `<button class="btn btn-outline btn-sm" style="margin-top: 1.5rem;" onclick="document.getElementById('allAmenities').style.display='block'; this.style.display='none';">Show all ${p.amenities.length} amenities</button>
          <div id="allAmenities" style="display:none; margin-top: 1.5rem;" class="amenity-grid">
            ${p.amenities.slice(12).map(a => `<div class="amenity-item">${ICON.check}<span>${escapeHtml(a)}</span></div>`).join('')}
          </div>` : ''}
        </div>

        <!-- Map -->
        <div style="padding: 2rem 0; border-bottom: 1px solid var(--color-line);">
          <h2 style="font-size: 1.4rem; margin: 0 0 1rem;">Where you'll be</h2>
          <p style="color: var(--color-stone); margin: 0 0 1rem;">${escapeHtml(p.city)}, ${escapeHtml(p.state)}</p>
          <a href="https://www.google.com/maps/search/?api=1&query=${p.coords.lat},${p.coords.lng}" target="_blank" rel="noopener" class="map-static" style="display:block; background-image: linear-gradient(135deg, #C8D5C0 0%, #9DB096 50%, #7B8F75 100%);">
            <div class="map-pin">${ICON.pin}</div>
            <div style="position:absolute; bottom: 16px; right: 16px; background: white; padding: 0.5rem 0.85rem; border-radius: 8px; font-size: 0.85rem; box-shadow: var(--shadow-sm);">Open in Google Maps →</div>
          </a>
        </div>

        <!-- Reviews -->
        <div style="padding: 2rem 0;" id="reviewsSection">
          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
            <h2 style="font-size: 1.4rem; margin: 0; display:inline-flex; align-items: center; gap: 0.5rem;">${ICON.star.replace('width="14" height="14"','width="22" height="22"')} ${p.rating.toFixed(1)} · ${p.reviewCount} review${p.reviewCount===1?'':'s'}</h2>
          </div>

          ${p.reviewCount > 0 ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; padding: 2rem 0; border-top: 1px solid var(--color-line); border-bottom: 1px solid var(--color-line); margin-bottom: 2rem;">
            <div>
              <div class="rating-bar"><span class="label">Cleanliness</span><div class="bar"><div style="width:100%"></div></div><span class="val">5.0</span></div>
              <div class="rating-bar"><span class="label">Communication</span><div class="bar"><div style="width:100%"></div></div><span class="val">5.0</span></div>
              <div class="rating-bar"><span class="label">Check-in</span><div class="bar"><div style="width:100%"></div></div><span class="val">5.0</span></div>
            </div>
            <div>
              <div class="rating-bar"><span class="label">Accuracy</span><div class="bar"><div style="width:100%"></div></div><span class="val">5.0</span></div>
              <div class="rating-bar"><span class="label">Location</span><div class="bar"><div style="width:100%"></div></div><span class="val">5.0</span></div>
              <div class="rating-bar"><span class="label">Value</span><div class="bar"><div style="width:100%"></div></div><span class="val">5.0</span></div>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;" class="review-grid">
            ${p.reviews.map(r => `
              <div class="review-card">
                <div style="display:flex; align-items:center; gap: 0.75rem; margin-bottom: 0.75rem;">
                  <div style="width: 38px; height: 38px; border-radius: 999px; background: var(--color-sand); display:inline-flex; align-items:center; justify-content:center; font-weight:600; color: var(--color-primary); font-size: 0.95rem;">${escapeHtml(r.author[0])}</div>
                  <div>
                    <strong style="font-size: 0.92rem;">${escapeHtml(r.author)}</strong>
                    <div style="font-size: 0.8rem; color: var(--color-stone);">${escapeHtml(r.date)}</div>
                  </div>
                </div>
                <div class="stars">★★★★★</div>
                <p class="review-text">"${escapeHtml(r.text)}"</p>
              </div>
            `).join('')}
          </div>` : `
          <div style="text-align:center; padding: 2rem; background: var(--color-cream-dark); border-radius: 16px;">
            <strong style="font-size: 1.1rem;">A brand new listing — and the next 5-star streak waiting to happen.</strong>
            <p style="color: var(--color-stone); margin: 0.5rem 0 0;">Sheena's portfolio holds a 5.0 average across 200+ stays. Be among the first to book this one.</p>
          </div>`}
        </div>

      </div>

      <!-- Right: booking widget -->
      <aside>
        <div class="booking-widget">
          <div class="price-row">
            <span class="price-from-label">from</span>
            <span class="price" id="bkHeadlinePrice">$${p.basePrice}</span>
            <span class="per">/ night</span>
          </div>
          <p class="price-from-note" id="bkPriceNote" style="font-size: 0.78rem; color: var(--color-stone); margin: -0.5rem 0 1rem;">Lowest nightly rate over the next 90 days. Pick dates for an exact total.</p>
          <form class="booking-form" onsubmit="bookSubmit(event, '${p.slug}')">
            <div class="row">
              <button type="button" class="field date-trigger" id="bkCheckinBtn" onclick="openBookingCalendar('checkin')">
                <label>Check-in</label>
                <span class="date-display" id="bkCheckinDisplay">Add date</span>
              </button>
              <button type="button" class="field date-trigger" id="bkCheckoutBtn" onclick="openBookingCalendar('checkout')">
                <label>Checkout</label>
                <span class="date-display" id="bkCheckoutDisplay">Add date</span>
              </button>
            </div>
            <div class="row">
              <label class="field" style="grid-column: 1/-1;"><label>Guests</label>
                <select id="bkGuests">
                  ${Array.from({length: p.capacity.guests}, (_, i) => `<option value="${i+1}">${i+1} guest${i+1>1?'s':''}</option>`).join('')}
                </select>
              </label>
            </div>
            <input type="hidden" id="bkCheckin" required/>
            <input type="hidden" id="bkCheckout" required/>
          </form>
          <div id="bkCalendar" class="booking-calendar" hidden></div>
          <button class="btn btn-accent" style="width: 100%; margin-top: 1rem;" onclick="document.querySelector('.booking-form').requestSubmit()">Reserve</button>
          <p style="text-align:center; font-size: 0.85rem; color: var(--color-stone); margin: 0.85rem 0 0;">You won't be charged yet</p>
          <div id="priceBreakdown" style="margin-top: 1.25rem;"></div>
        </div>

        <!-- Direct booking advantage -->
        <div style="margin-top: 1.25rem; padding: 1.25rem; background: var(--color-sand); border-radius: 14px; font-size: 0.88rem;">
          <strong style="display:block; margin-bottom: 0.4rem; color: var(--color-primary);">Direct-booking perks</strong>
          <ul style="list-style:none; padding:0; margin:0; line-height: 1.7;">
            <li>★ No platform service fees</li>
            <li>★ Direct line to your Superhost</li>
            <li>★ Best-rate guarantee — match elsewhere</li>
            <li>★ Priority on early check-in</li>
          </ul>
        </div>

        <!-- Compare button -->
        <button class="btn btn-outline" id="compareBtn" style="width: 100%; margin-top: 1rem;" onclick="toggleCompare('${p.id}')">+ Add to compare</button>

        <!-- Group inquiry -->
        <div style="margin-top: 1.25rem; padding: 1.25rem; border: 1px dashed var(--color-line); border-radius: 14px; font-size: 0.88rem;">
          <strong style="display:block; margin-bottom: 0.4rem;">Booking 7+ nights or for a group?</strong>
          <p style="color: var(--color-stone); margin: 0 0 0.75rem;">Direct guests get up to 20% off long stays. Reach out for custom rates.</p>
          <a href="/contact.html?property=${p.slug}" class="btn btn-ghost btn-sm" style="padding-left: 0;">Inquire about long stays →</a>
        </div>
      </aside>
    </div>

    <!-- Recently viewed / similar -->
    <div style="margin-top: 5rem; padding-top: 4rem; border-top: 1px solid var(--color-line);" class="reveal">
      <h2 style="font-size: 1.7rem; margin: 0 0 0.5rem;">More Nyris stays you might love</h2>
      <p style="color: var(--color-stone); margin: 0 0 2.5rem;">Other Top 1% Guest Favorite homes from our portfolio.</p>
      <div class="props-grid" id="similarGrid"></div>
    </div>
  `;

  // Bind gallery thumbnails to lightbox
  window.__propImages = p.images;
  document.querySelectorAll('.detail-gallery > div').forEach((d, i) => {
    d.onclick = () => Lightbox.open(p.images, i);
  });

  // Defined after the gallery is rendered so it can swap images in place
  // when admin overrides arrive late (slow /api/photos on first visit).
  window.applyOverridesToGallery = function(newImages) {
    window.__propImages = newImages;
    const wrappers = document.querySelectorAll('.detail-gallery > div');
    wrappers.forEach((d, i) => {
      const img = d.querySelector('img');
      if (img && newImages[i] && img.src !== newImages[i]) img.src = newImages[i];
      d.onclick = () => Lightbox.open(newImages, i);
    });
  };

  // Mobile CTA
  document.getElementById('mctaPrice').textContent = `$${p.basePrice}`;
  document.getElementById('mctaSub').textContent = `per night · ${p.capacity.bedrooms} BR`;

  // Save state
  syncSaveBtn();

  // Compare button state
  syncCompareBtn();
  document.addEventListener('compare:changed', syncCompareBtn);

  // Similar properties (different slugs, prefer same destination, then guest favorites)
  const similar = [
    ...NYRIS.properties.filter(x => x.slug !== p.slug && x.destination === p.destination),
    ...NYRIS.properties.filter(x => x.slug !== p.slug && x.destination !== p.destination && x.isGuestFavorite)
  ].slice(0, 4);
  const sg = document.getElementById('similarGrid');
  sg.innerHTML = similar.map(s => propertyCard(s)).join('');
  bindPropertyCards(sg);

  // Bind booking date inputs
  document.getElementById('bkCheckin').addEventListener('change', updatePriceBreakdown);
  document.getElementById('bkCheckout').addEventListener('change', updatePriceBreakdown);
  document.getElementById('bkGuests').addEventListener('change', updatePriceBreakdown);

  // Wire calendar to this property
  window.BkCal.propertyId = p.id;
  window.BkCal.data = null; // force reload for this property

  // Pre-fill from URL
  const params2 = new URLSearchParams(window.location.search);
  const urlCi = params2.get('checkin');
  const urlCo = params2.get('checkout');
  if (urlCi || urlCo) {
    window.BkCal.range = { ci: urlCi || null, co: urlCo || null };
    applyCalendarSelection();
  }
  if (params2.get('guests')) document.getElementById('bkGuests').value = params2.get('guests');
  updatePriceBreakdown();

  // Fetch the actual minimum nightly rate from PriceLabs (over the next 90 days)
  // and update the headline price + note. Falls back silently to base price.
  fetch(`/api/pricing?propertyId=${encodeURIComponent(p.id)}&basePrice=${p.basePrice}`)
    .then(r => r.json())
    .then(j => {
      if (!j.ok || j.mode !== "summary") return;
      const headline = document.getElementById("bkHeadlinePrice");
      const note = document.getElementById("bkPriceNote");
      if (!headline || !note) return;
      headline.textContent = `$${j.min.toLocaleString()}`;
      if (j.source === "pricelabs" && j.min !== j.max) {
        note.textContent = `Lowest nightly rate over the next 90 days (rates range $${j.min.toLocaleString()}–$${j.max.toLocaleString()}). Pick dates for an exact total.`;
      } else if (j.source === "pricelabs") {
        note.textContent = `Live PriceLabs rate. Pick dates for an exact total.`;
      } else {
        note.textContent = `Starting rate — pick dates for live pricing.`;
      }
    })
    .catch(() => {});

  function syncSaveBtn() {
    const btn = document.getElementById('saveBtn');
    if (!btn) return;
    const on = Wishlist.has(p.id);
    btn.querySelector('span').textContent = on ? 'Saved' : 'Save';
    btn.querySelector('svg').setAttribute('fill', on ? 'var(--color-danger)' : 'none');
    btn.querySelector('svg').setAttribute('stroke', on ? 'var(--color-danger)' : 'currentColor');
  }
  window.toggleSave = () => { Wishlist.toggle(p.id); syncSaveBtn(); toast(Wishlist.has(p.id) ? "Saved to wishlist" : "Removed"); };

  function syncCompareBtn() {
    const btn = document.getElementById('compareBtn');
    if (!btn) return;
    btn.textContent = Compare.has(p.id) ? '✓ Added to compare' : '+ Add to compare';
  }
  window.toggleCompare = (id) => { Compare.toggle(id); };

  let _priceReqId = 0;
  // Exposed on window so the calendar code (top-level, outside this IIFE)
  // can call it after every selection change.
  window.__updatePriceBreakdown = updatePriceBreakdown;
  async function updatePriceBreakdown() {
    const ci = document.getElementById('bkCheckin').value;
    const co = document.getElementById('bkCheckout').value;
    const breakdown = document.getElementById('priceBreakdown');
    const nightCount = nightsBetween(ci, co);
    if (!nightCount) { breakdown.innerHTML = ''; return; }

    // Optimistic render with base price while we fetch live prices
    const reqId = ++_priceReqId;
    renderBreakdown(breakdown, {
      perNight: Array(nightCount).fill(p.basePrice),
      avgNightly: p.basePrice,
      subtotal: nightCount * p.basePrice,
      nightCount, source: 'fallback', loading: true
    });

    try {
      const url = `/api/pricing?propertyId=${encodeURIComponent(p.id)}&checkin=${ci}&checkout=${co}&basePrice=${p.basePrice}`;
      const r = await fetch(url);
      const j = await r.json();
      if (reqId !== _priceReqId) return; // a newer request superseded this
      if (j.ok) {
        renderBreakdown(breakdown, {
          perNight: j.nights.map(n => n.price),
          avgNightly: j.avgNightly,
          subtotal: j.total,
          nightCount, source: j.source, coverage: j.coverage, coveragePct: j.coveragePct
        });
      }
    } catch (e) {
      // Already showed fallback — leave it
    }
  }

  function renderBreakdown(el, ctx) {
    const { nightCount, perNight, avgNightly, subtotal, source, coverage, coveragePct, loading } = ctx;
    const discountPct = nightCount >= 28 ? 0.20 : nightCount >= 7 ? 0.10 : 0;
    const discount = Math.round(subtotal * discountPct);
    // Per-property cleaning fee (admin-configurable). Falls back to 165 only
    // for older properties that don't declare one.
    const cleaning = (p.cleaningFee != null) ? Number(p.cleaningFee) : 165;
    const taxes = Math.round((subtotal - discount + cleaning) * 0.11);
    const total = subtotal - discount + cleaning + taxes;

    // Detect if there's nightly variance worth noting
    const allSame = perNight.every(x => x === perNight[0]);
    const minP = Math.min(...perNight), maxP = Math.max(...perNight);

    let priceLabel;
    if (allSame) {
      priceLabel = `$${perNight[0]} × ${nightCount} night${nightCount > 1 ? 's' : ''}`;
    } else {
      priceLabel = `$${minP}–$${maxP} × ${nightCount} nights (avg $${avgNightly})`;
    }

    let sourceTag = '';
    if (source === 'pricelabs') {
      sourceTag = `<span title="Live from PriceLabs" style="display:inline-flex; align-items:center; gap: 0.3rem; font-size: 0.72rem; color: var(--color-success); padding: 0.1rem 0.5rem; border: 1px solid var(--color-success); border-radius: 999px; margin-left: 0.5rem;">● Live</span>`;
    } else if (source === 'mixed') {
      sourceTag = `<span title="${coverage}/${nightCount} nights live" style="display:inline-flex; align-items:center; gap: 0.3rem; font-size: 0.72rem; color: var(--color-accent); padding: 0.1rem 0.5rem; border: 1px solid var(--color-accent); border-radius: 999px; margin-left: 0.5rem;">${coveragePct}% live</span>`;
    } else if (loading) {
      sourceTag = `<span style="font-size: 0.72rem; color: var(--color-stone); margin-left: 0.5rem;">checking live rates…</span>`;
    }

    el.innerHTML = `
      <div class="booking-line"><span>${priceLabel}${sourceTag}</span><span>$${subtotal.toLocaleString()}</span></div>
      ${discount ? `<div class="booking-line"><span>${(discountPct*100).toFixed(0)}% long-stay discount</span><span style="color: var(--color-success);">-$${discount.toLocaleString()}</span></div>` : ''}
      <div class="booking-line"><span>Cleaning fee</span><span>$${cleaning}</span></div>
      <div class="booking-line"><span>Occupancy taxes</span><span>$${taxes}</span></div>
      <div class="booking-total"><span>Total</span><span>$${total.toLocaleString()}</span></div>`;
  }
})();

// =============================================================================
// Booking calendar: 2-month grid with per-night prices + blocked booked dates.
// State (window.BkCal) is hoisted to the top of this file so the property
// IIFE can reference it without crashing.
// =============================================================================
async function openBookingCalendar(pickFor) {
  const cal = document.getElementById("bkCalendar");
  if (!cal) return;
  window.BkCal.pickFor = pickFor;
  // If already open, just rerender (in case user clicks the other trigger)
  if (!cal.hasAttribute("hidden")) { renderCalendar(); return; }
  cal.removeAttribute("hidden");

  // Lock month anchor to current month on open
  if (!window.BkCal.monthAnchor) {
    const t = new Date(); t.setUTCDate(1); t.setUTCHours(0,0,0,0);
    window.BkCal.monthAnchor = t.toISOString().slice(0, 10);
  }
  // Load availability data once
  if (!window.BkCal.data) await loadCalendarData();
  renderCalendar();

  // Click outside to close
  setTimeout(() => {
    document.addEventListener("click", outsideCalendarClose, { capture: true });
  }, 0);
}

function closeBookingCalendar() {
  const cal = document.getElementById("bkCalendar");
  if (cal) cal.setAttribute("hidden", "");
  document.removeEventListener("click", outsideCalendarClose, { capture: true });
}

function outsideCalendarClose(e) {
  const cal = document.getElementById("bkCalendar");
  if (!cal || cal.hasAttribute("hidden")) return;
  if (cal.contains(e.target)) return;
  if (e.target.closest(".date-trigger")) return; // toggling triggers, not closing
  closeBookingCalendar();
}

async function loadCalendarData() {
  const propertyId = window.BkCal.propertyId;
  if (!propertyId) return;
  window.BkCal.loading = true;
  try {
    const r = await fetch(`/api/availability?propertyId=${encodeURIComponent(propertyId)}&months=4`);
    const j = await r.json();
    if (j.ok) {
      const m = {};
      for (const d of (j.days || [])) m[d.date] = d;
      window.BkCal.data = m;
    }
  } catch {}
  window.BkCal.loading = false;
}

function renderCalendar() {
  const cal = document.getElementById("bkCalendar");
  if (!cal) return;
  const anchor = new Date(window.BkCal.monthAnchor + "T00:00:00Z");
  const m1 = monthGrid(anchor);
  const next = new Date(anchor); next.setUTCMonth(next.getUTCMonth() + 1);
  const m2 = monthGrid(next);

  cal.innerHTML = `
    <div class="bkcal-head">
      <button type="button" class="bkcal-nav" onclick="bkcalNav(-1)" aria-label="Previous month">‹</button>
      <div class="bkcal-titles"><span>${m1.title}</span><span>${m2.title}</span></div>
      <button type="button" class="bkcal-nav" onclick="bkcalNav(1)" aria-label="Next month">›</button>
      <button type="button" class="bkcal-close" onclick="closeBookingCalendar()" aria-label="Close">×</button>
    </div>
    <div class="bkcal-grids">
      ${renderMonth(m1)}
      ${renderMonth(m2)}
    </div>
    <div class="bkcal-foot">
      <span class="bkcal-legend"><span class="dot booked"></span> Booked</span>
      <span class="bkcal-legend"><span class="dot live"></span> Live PriceLabs rate</span>
      <button type="button" class="bkcal-clear" onclick="bkcalClear()">Clear dates</button>
    </div>`;

  bindCalendarCells();
}

function bkcalNav(dir) {
  const cur = new Date(window.BkCal.monthAnchor + "T00:00:00Z");
  cur.setUTCMonth(cur.getUTCMonth() + dir);
  // Don't go before this month
  const today = new Date(); today.setUTCDate(1); today.setUTCHours(0,0,0,0);
  if (cur < today) return;
  window.BkCal.monthAnchor = cur.toISOString().slice(0, 10);
  renderCalendar();
}

function bkcalClear() {
  window.BkCal.range = { ci: null, co: null };
  document.getElementById("bkCheckin").value = "";
  document.getElementById("bkCheckout").value = "";
  document.getElementById("bkCheckinDisplay").textContent = "Add date";
  document.getElementById("bkCheckoutDisplay").textContent = "Add date";
  renderCalendar();
  if (typeof updatePriceBreakdown === "function") updatePriceBreakdown();
}

function monthGrid(date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const startWeekday = first.getUTCDay(); // 0=Sun
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= last.getUTCDate(); d++) {
    cells.push(new Date(Date.UTC(y, m, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return {
    year: y, month: m,
    title: first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    cells
  };
}

function renderMonth(grid) {
  const today = new Date(); today.setUTCHours(0,0,0,0);
  const { ci, co } = window.BkCal.range;
  const ciDate = ci ? new Date(ci + "T00:00:00Z") : null;
  const coDate = co ? new Date(co + "T00:00:00Z") : null;
  const data = window.BkCal.data || {};

  const cellsHtml = grid.cells.map(d => {
    if (!d) return `<div class="bkcal-cell empty"></div>`;
    const iso = d.toISOString().slice(0, 10);
    const day = d.getUTCDate();
    const meta = data[iso] || { available: true, price: null };
    const past = d < today;
    const booked = meta.available === false;
    const disabled = past || booked;
    const isCi = ci && iso === ci;
    const isCo = co && iso === co;
    const inRange = ciDate && coDate && d > ciDate && d < coDate;
    const hoverInRange = ci && !co && window.BkCal.hover &&
      d > ciDate && d <= new Date(window.BkCal.hover + "T00:00:00Z");

    const classes = [
      "bkcal-cell",
      past && "past",
      booked && "booked",
      disabled && "disabled",
      isCi && "checkin",
      isCo && "checkout",
      (inRange || hoverInRange) && "in-range"
    ].filter(Boolean).join(" ");

    let bottomLabel = "";
    if (booked) {
      bottomLabel = `<span class="cell-price">Booked</span>`;
    } else if (!past && meta.price) {
      const formatted = meta.price >= 1000 ? Math.round(meta.price/100)/10 + 'k' : Math.round(meta.price);
      bottomLabel = `<span class="cell-price">$${formatted}</span>`;
    }

    // aria-disabled + tabindex=-1 ensure assistive tech and keyboard users
    // can't activate booked / past cells either.
    const blockAttrs = disabled ? `disabled aria-disabled="true" tabindex="-1"` : "";
    return `<button type="button" class="${classes}" data-date="${iso}" ${blockAttrs}>
      <span class="cell-day">${day}</span>${bottomLabel}
    </button>`;
  }).join("");

  return `
    <div class="bkcal-month">
      <div class="bkcal-month-title">${grid.title}</div>
      <div class="bkcal-dow">
        ${["S","M","T","W","T","F","S"].map(c => `<span>${c}</span>`).join("")}
      </div>
      <div class="bkcal-cells">${cellsHtml}</div>
    </div>`;
}

function bindCalendarCells() {
  document.querySelectorAll(".bkcal-cell[data-date]").forEach(cell => {
    if (cell.disabled || cell.classList.contains("booked") || cell.classList.contains("past")) {
      // Belt-and-suspenders: kill any click that somehow reaches a blocked cell.
      cell.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); }, true);
      cell.addEventListener("mousedown", e => e.preventDefault(), true);
      return;
    }
    cell.addEventListener("click", () => onCellClick(cell.dataset.date));
    // Only mutate CSS classes on hover — never re-render the DOM. Re-rendering
    // mid-interaction was killing real user clicks (mousedown on cell A,
    // hover into cell B triggers a render that replaces both, mouseup
    // never matches a click target → no click event fires).
    cell.addEventListener("mouseenter", () => {
      if (window.BkCal.range.ci && !window.BkCal.range.co) {
        window.BkCal.hover = cell.dataset.date;
        updateRangePreview();
      }
    });
  });
}

function updateRangePreview() {
  const { ci } = window.BkCal.range;
  const hov = window.BkCal.hover;
  document.querySelectorAll(".bkcal-cell[data-date]").forEach(cell => {
    if (cell.classList.contains("disabled") || cell.classList.contains("past") || cell.classList.contains("booked") || cell.classList.contains("checkin") || cell.classList.contains("checkout")) {
      cell.classList.remove("in-range");
      return;
    }
    if (!ci || !hov) {
      cell.classList.remove("in-range");
      return;
    }
    const d = cell.dataset.date;
    if (d > ci && d <= hov) cell.classList.add("in-range");
    else cell.classList.remove("in-range");
  });
}

function onCellClick(iso) {
  const { ci, co } = window.BkCal.range;
  if (!ci || (ci && co)) {
    // Start a new range
    window.BkCal.range = { ci: iso, co: null };
  } else {
    // Picking checkout
    if (iso <= ci) {
      // User clicked on or before existing checkin → restart with this as checkin
      window.BkCal.range = { ci: iso, co: null };
    } else {
      const conflicts = rangeBlockedDays(ci, iso);
      if (conflicts.length) {
        flashBlockedConflict(conflicts);
        showCalendarBanner(`That range covers ${conflicts.length} booked night${conflicts.length > 1 ? "s" : ""} (${conflicts.map(d => formatDateShort(d)).join(", ")}). Pick a checkout before the first booked night.`);
        return;
      }
      window.BkCal.range = { ci, co: iso };
    }
  }
  hideCalendarBanner();
  applyCalendarSelection();
  renderCalendar();
  if (window.BkCal.range.ci && window.BkCal.range.co) {
    setTimeout(closeBookingCalendar, 200);
  }
}

function rangeBlockedDays(ci, co) {
  // Returns array of ISO date strings within [ci, co) that are unavailable.
  const data = window.BkCal.data || {};
  const start = new Date(ci + "T00:00:00Z");
  const end = new Date(co + "T00:00:00Z");
  const out = [];
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const meta = data[iso];
    if (meta && meta.available === false) out.push(iso);
  }
  return out;
}

function flashBlockedConflict(dates) {
  // Pulse the conflicting cells with a red highlight so the user immediately
  // sees which booked nights blocked their selection.
  const set = new Set(dates);
  document.querySelectorAll(".bkcal-cell[data-date]").forEach(cell => {
    if (set.has(cell.dataset.date)) {
      cell.classList.add("conflict-flash");
      setTimeout(() => cell.classList.remove("conflict-flash"), 1400);
    }
  });
}

function showCalendarBanner(msg) {
  const cal = document.getElementById("bkCalendar");
  if (!cal) return;
  let banner = document.getElementById("bkCalBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "bkCalBanner";
    banner.className = "bkcal-banner";
    cal.insertBefore(banner, cal.firstChild);
  }
  banner.textContent = msg;
  banner.classList.remove("hidden");
}

function hideCalendarBanner() {
  document.getElementById("bkCalBanner")?.classList.add("hidden");
}

function applyCalendarSelection() {
  const { ci, co } = window.BkCal.range;
  document.getElementById("bkCheckin").value = ci || "";
  document.getElementById("bkCheckout").value = co || "";
  document.getElementById("bkCheckinDisplay").textContent = ci ? formatDateShort(ci) : "Add date";
  document.getElementById("bkCheckoutDisplay").textContent = co ? formatDateShort(co) : "Add date";
  // updatePriceBreakdown is scoped inside the property.js IIFE; the IIFE
  // exposes it on window so this top-level function can fire it.
  if (typeof window.__updatePriceBreakdown === "function") window.__updatePriceBreakdown();
}

function formatDateShort(iso) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function bookSubmit(e, slug) {
  e.preventDefault();
  const ci = document.getElementById('bkCheckin').value;
  const co = document.getElementById('bkCheckout').value;
  const g = document.getElementById('bkGuests').value;
  if (!ci || !co) { toast("Please pick check-in and checkout dates"); return; }
  if (new Date(co) <= new Date(ci)) { toast("Checkout must be after check-in"); return; }
  // Demo: redirect to a "booking" confirmation flow
  window.location.href = `/book.html?slug=${slug}&checkin=${ci}&checkout=${co}&guests=${g}`;
}

function shareProperty() {
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({ title: document.title, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => toast("Link copied to clipboard"));
  }
}
