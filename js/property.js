// Property detail page logic

// Booking calendar state lives in /js/booking-calendar.js (loaded first).
// Property page wires the calendar to this property below.

(async function() {
  // Wait for the server-side overrides fetch kicked off by app.js so the
  // detail page renders with the latest admin-edited host/property/dest data
  // even on devices that haven't visited admin themselves.
  if (window.__overridesReady) await window.__overridesReady;
  // Apply admin overrides BEFORE finding p — without this, per-property
  // overrides (hospitableEmbed, name, basePrice, etc.) are not attached to
  // the property object yet. app.js calls applyOverrides on DOMContentLoaded,
  // but this IIFE awaits __overridesReady first and so wakes BEFORE the DCL
  // handler runs (microtask FIFO ordering on the same promise). Other pages
  // call applyOverrides at the top for exactly this reason.
  if (typeof applyOverrides === 'function' && typeof NYRIS !== 'undefined') {
    NYRIS.properties = applyOverrides(NYRIS.properties);
  }
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
        <a href="/reviews.html?slug=${encodeURIComponent(p.slug)}" style="color: var(--color-charcoal); text-decoration: underline; font-weight: 500;">${p.reviewCount} review${p.reviewCount===1?'':'s'}</a>
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
      <button class="show-all" id="showAllPhotos" onclick="PhotoGrid.open(window.__propImages)"${p.images.length < 2 ? ' hidden' : ''}>Show all ${p.images.length} photos</button>
    </div>

    <!-- Body grid -->
    <div class="detail-grid">
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
          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
            <h2 style="font-size: 1.4rem; margin: 0; display:inline-flex; align-items: center; gap: 0.5rem;">${ICON.star.replace('width="14" height="14"','width="22" height="22"')} ${p.rating.toFixed(1)} · ${p.reviewCount} review${p.reviewCount===1?'':'s'}</h2>
            ${p.reviewCount > 0 ? `<a href="/reviews.html?slug=${encodeURIComponent(p.slug)}" style="margin-left:auto; font-size: 0.92rem; color: var(--color-primary); text-decoration: underline;">See all reviews →</a>` : ''}
          </div>

          ${p.reviewCount > 0 ? `
          <div class="rating-bars">
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
          <div class="review-grid">
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
          </div>
          <div style="margin-top: 1.5rem; text-align: center;">
            <a href="/reviews.html?slug=${encodeURIComponent(p.slug)}" class="btn btn-outline">Show all ${p.reviewCount} review${p.reviewCount===1?'':'s'}</a>
          </div>` : `
          <div style="text-align:center; padding: 2rem; background: var(--color-cream-dark); border-radius: 16px;">
            <strong style="font-size: 1.1rem;">A brand new listing — and the next 5-star streak waiting to happen.</strong>
            <p style="color: var(--color-stone); margin: 0.5rem 0 0;">Sheena's portfolio holds a 5.0 average across 200+ stays. Be among the first to book this one.</p>
          </div>`}
        </div>

      </div>

      <!-- Right: booking widget -->
      <aside>
        <!-- Inline Hospitable Direct widget (admin-configurable). Renders
             above the existing Reserve form so guests have both options. -->
        <div id="hospInlineWidget" hidden style="margin-bottom: 1.25rem; max-width: 100%; overflow: hidden; isolation: isolate; contain: layout;"></div>
        <!-- Default Reserve widget — hidden by default. applyBookingSurface
             unhides it ONLY when admin → Bookings & Payments → provider is
             "stripe". For Hospitable mode the embed above is the only surface,
             so the Reserve form never flashes briefly while the embed loads. -->
        <div class="booking-widget" hidden>
          <div class="price-row">
            <span class="price-from-label">from</span>
            <span class="price" id="bkHeadlinePrice">$${p.basePrice}</span>
            <span class="per">/ night</span>
          </div>
          <p class="price-from-note" id="bkPriceNote" style="font-size: 0.78rem; color: var(--color-stone); margin: -0.5rem 0 1rem;">Lowest nightly rate over the next 90 days. Pick dates for an exact total.</p>
          <form class="booking-form" onsubmit="bookSubmit(event, '${p.slug}')">
            <div class="row">
              <button type="button" class="field date-trigger" id="bkCheckinBtn" onclick="openBookingCalendar('checkin', this)">
                <label>Check-in</label>
                <span class="date-display" id="bkCheckinDisplay">Add date</span>
              </button>
              <button type="button" class="field date-trigger" id="bkCheckoutBtn" onclick="openBookingCalendar('checkout', this)">
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

        <!-- Channel listings (Airbnb, Vrbo, etc.) — populated after render
             from /api/hospitable/listings if Hospitable has them on file. -->
        <div id="channelLinks" hidden style="margin-top: 1.25rem;"></div>

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

  // Decide which booking surface to show based on the admin's provider
  // selection (admin → Integrations → Bookings & Payments):
  //   provider="stripe"        → default Reserve widget + calendar
  //   provider="hospitable" + embed configured → Hospitable embed REPLACES
  //                              the Reserve widget inline
  //   provider="hospitable" without embed → default Reserve widget, but its
  //                              Reserve button opens the Hospitable URL
  //                              (handled in bookSubmit further down).
  applyBookingSurface(p);

  // Pull connected-channel URLs (Airbnb, Vrbo, etc.) from Hospitable in the
  // background. The slot stays hidden if Hospitable doesn't have any.
  loadChannelLinks(p);

  // Defined after the gallery is rendered so it can swap images in place
  // when admin overrides arrive late (slow /api/photos on first visit).
  window.applyOverridesToGallery = function(newImages) {
    window.__propImages = newImages;
    const wrappers = document.querySelectorAll('.detail-gallery > div');
    wrappers.forEach((d, i) => {
      const img = d.querySelector('img');
      if (i < newImages.length) {
        if (img && img.src !== newImages[i]) img.src = newImages[i];
        d.hidden = false;
        d.onclick = () => Lightbox.open(newImages, i);
      } else {
        // Override has fewer photos than the static fallback we initially
        // rendered — hide the orphan thumbnail wrappers so the layout
        // doesn't show stale images that aren't in the lightbox anymore.
        d.hidden = true;
        d.onclick = null;
      }
    });
    // Keep the "Show all N photos" button label in sync with the actual
    // count from the override. Without this, the count stays stuck at the
    // static-data value forever after admin add/remove.
    const showAll = document.getElementById('showAllPhotos');
    if (showAll) {
      if (newImages.length < 2) {
        showAll.hidden = true;
      } else {
        showAll.hidden = false;
        showAll.textContent = `Show all ${newImages.length} photos`;
      }
    }
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

  // Wire calendar to this property. Default targets ('bk*') already match
  // the property page IDs. onChange refreshes the price breakdown after
  // every selection.
  window.BkCal.propertyId = p.id;
  window.BkCal.data = null; // force reload for this property
  window.BkCal.onChange = () => {
    if (typeof window.__updatePriceBreakdown === "function") window.__updatePriceBreakdown();
  };

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


function bookSubmit(e, slug) {
  e.preventDefault();
  const ci = document.getElementById('bkCheckin').value;
  const co = document.getElementById('bkCheckout').value;
  const g = document.getElementById('bkGuests').value;
  if (!ci || !co) { toast("Please pick check-in and checkout dates"); return; }
  if (new Date(co) <= new Date(ci)) { toast("Checkout must be after check-in"); return; }

  // Route based on the admin's chosen booking provider (admin → Integrations
  // → Bookings & Payments). Default 'stripe' = our custom /book.html flow.
  const o = (typeof Overrides !== 'undefined') ? Overrides.get() : {};
  const pay = (o && o.payments) || {};
  const provider = pay.provider || 'stripe';

  if (provider === 'hospitable' && pay.hospitableBookingUrlTemplate) {
    const property = NYRIS.properties.find(p => p.slug === slug);
    if (property) {
      const url = buildHospitableBookingUrl(pay.hospitableBookingUrlTemplate, property, ci, co, g);
      const newTab = pay.hospitableBookingNewTab !== false; // default ON
      if (newTab) window.open(url, '_blank', 'noopener');
      else window.location.href = url;
      return;
    }
    // Property lookup failed — fall through to /book.html as a safety net.
  }

  // Default / fallback: custom checkout page.
  window.location.href = `/book.html?slug=${slug}&checkin=${ci}&checkout=${co}&guests=${g}`;
}

// Builds a Hospitable Direct booking URL by substituting {propertyId} or
// {slug} into the admin-configured template, then appending check-in,
// check-out, and guests as query params. Mirrored in admin.js.
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

// Fetches the property's channel listings (Airbnb, Vrbo, …) from Hospitable
// and renders simple "View on …" buttons. The container stays hidden when
// no channels are returned (Hospitable account isn't connected, property
// isn't synced, etc.) — silent failure is the right behavior for an optional
// secondary booking surface.
async function loadChannelLinks(property) {
  const slot = document.getElementById('channelLinks');
  if (!slot) return;

  // Build the link map from two sources, in priority order:
  //   1. Admin-edited overrides on the property (channelUrlOverrides) — wins
  //   2. Hospitable's /api/hospitable/listings response — fills the rest
  // Render as soon as we have at least one link, even if Hospitable hasn't
  // resolved yet, so admin-set links show without a network round-trip.
  const overrides = property.channelUrlOverrides || {};

  const renderIfAny = (links) => {
    const order = ['airbnb', 'vrbo', 'booking'];
    const labels = { airbnb: 'View on Airbnb', vrbo: 'View on Vrbo', booking: 'View on Booking.com' };
    const visible = order.filter(k => typeof links[k] === 'string' && links[k]);
    if (!visible.length) { slot.hidden = true; slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div style="padding: 1.1rem 1.25rem; background: white; border: 1px solid var(--color-line); border-radius: 14px;">
        <strong style="display:block; font-size: 0.92rem; margin-bottom: 0.65rem; color: var(--color-charcoal);">Also listed on</strong>
        <div style="display:flex; flex-direction: column; gap: 0.5rem;">
          ${visible.map(k => `<a href="${escapeHtml(links[k])}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="width: 100%; justify-content: center;">${labels[k]} →</a>`).join('')}
        </div>
      </div>`;
    slot.hidden = false;
  };

  // First paint with admin overrides only (instant — no fetch needed).
  renderIfAny({ ...overrides });

  // Then fetch Hospitable to fill in any unset channels.
  if (!property.id) return;
  try {
    const r = await fetch(`/api/hospitable/listings?uuid=${encodeURIComponent(property.id)}`);
    const j = await r.json();
    const fromHospitable = (j && j.links) || {};
    // Admin overrides win — only add Hospitable URLs for channels admin
    // hasn't explicitly set.
    const merged = { ...fromHospitable, ...overrides };
    renderIfAny(merged);
  } catch {
    // Silent — admin-only links remain visible from the first paint.
  }
}

// Combines the site-wide and per-property snippets into one HTML string.
// Per-property wins when the same container id appears in both (admin pasted
// a full snippet into both fields). Scripts are deduped by src so the loader
// only runs once.
function mergeHospitableEmbeds(siteWide, perProperty) {
  const tmp = document.createElement('div');
  tmp.innerHTML = [siteWide, perProperty].filter(Boolean).join('\n');

  const seenSrc = new Set();
  tmp.querySelectorAll('script[src]').forEach(s => {
    const src = s.getAttribute('src');
    if (seenSrc.has(src)) s.remove();
    else seenSrc.add(src);
  });

  // Walk in reverse so the per-property container (which appears later in
  // source order) wins when the same id is present in both fields.
  const seenId = new Set();
  const ided = Array.from(tmp.querySelectorAll('[id]'));
  for (let i = ided.length - 1; i >= 0; i--) {
    const id = ided[i].getAttribute('id');
    if (seenId.has(id)) ided[i].remove();
    else seenId.add(id);
  }

  return tmp.innerHTML;
}

// Decides what the right column shows based on the admin's selected provider.
// Stripe → show the default Reserve widget. Anything else (Hospitable) → keep
// the Reserve widget hidden and mount the embed in its place. The Reserve
// widget starts hidden in the template so it never flashes during render.
function applyBookingSurface(property) {
  const mount = document.getElementById('hospInlineWidget');
  const reserveWidget = document.querySelector('.booking-widget');
  const o = (typeof Overrides !== 'undefined') ? Overrides.get() : {};
  const pay = (o && o.payments) || {};
  const provider = pay.provider || 'stripe';

  if (provider === 'stripe') {
    if (mount) { mount.hidden = true; mount.innerHTML = ''; mount.style.minHeight = ''; }
    if (reserveWidget) reserveWidget.hidden = false;
    return;
  }

  // Hospitable mode — Reserve widget stays hidden. Concatenate site-wide and
  // per-property snippets, deduping <script src> tags and duplicate container
  // ids (per-property wins on conflict — admins commonly paste the full
  // snippet into both fields).
  if (reserveWidget) reserveWidget.hidden = true;
  if (!mount) return;

  const perPropertyEmbed = (property.hospitableEmbed || '').trim();
  const siteWideEmbed = (pay.hospitableWidgetEmbed || '').trim();
  if (!perPropertyEmbed && !siteWideEmbed) {
    mount.hidden = true; mount.innerHTML = ''; mount.style.minHeight = '';
    return;
  }

  mount.style.minHeight = '900px';

  try {
    const html = mergeHospitableEmbeds(siteWideEmbed, perPropertyEmbed)
      .replace(/\{propertyId\}/g, property.id)
      .replace(/\{slug\}/g, property.slug);
    mount.innerHTML = html;
    mount.hidden = false;

    mount.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      for (const a of oldScript.attributes) newScript.setAttribute(a.name, a.value);
      if (oldScript.textContent) newScript.text = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  } catch (e) {
    console.warn('[booking] Hospitable embed failed to mount:', e);
    mount.hidden = true; mount.innerHTML = ''; mount.style.minHeight = '';
  }

  // Hospitable's widget posts a height to the parent window so the host can
  // resize the iframe to fit the content. Listen for any of the common
  // shapes (Hospitable's snippets vary slightly across plan tiers) and
  // adjust mount min-height + the iframe height accordingly.
  if (!window.__hospResizeWired) {
    window.__hospResizeWired = true;
    window.addEventListener('message', (ev) => {
      const d = ev && ev.data;
      if (!d || typeof d !== 'object') return;
      const fromHospitable = (typeof ev.origin === 'string' && /hospitable/i.test(ev.origin)) ||
                             (typeof d.source === 'string' && /hospitable/i.test(d.source));
      if (!fromHospitable) return;
      // Common payload field names: height | newHeight | iframeHeight
      const h = Number(d.height || d.newHeight || d.iframeHeight || 0);
      if (!h || h < 200) return;
      const m = document.getElementById('hospInlineWidget');
      if (!m) return;
      m.style.minHeight = h + 'px';
      const iframe = m.querySelector('iframe');
      if (iframe) iframe.style.height = h + 'px';
    });
  }
}

function shareProperty() {
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({ title: document.title, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => toast("Link copied to clipboard"));
  }
}
