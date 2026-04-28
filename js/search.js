// Search/filters page

(async function() {
  // Wait for the server-side overrides fetch kicked off by app.js so the
  // destination dropdown + cards render with the latest admin-edited data.
  if (window.__overridesReady) await window.__overridesReady;

  // Apply admin overrides up-front. This IIFE runs before DOMContentLoaded
  // (where app.js also calls applyOverrides), so without this call the
  // destination dropdown + property cards render with un-overridden data.
  if (typeof applyOverrides === "function" && typeof NYRIS !== "undefined") {
    NYRIS.properties = applyOverrides(NYRIS.properties);
  }
  // Populate destination dropdown
  const dest = document.getElementById('fDest');
  NYRIS.destinations.forEach(d => {
    const o = document.createElement('option');
    o.value = d.slug; o.textContent = `${d.name}, ${d.state}`;
    dest.appendChild(o);
  });

  // Property types
  const types = [...new Set(NYRIS.properties.map(p => p.type))];
  document.getElementById('fType').innerHTML = types.map(t => `
    <label style="display:flex; align-items:center; gap: 0.5rem; font-size: 0.92rem;">
      <input type="checkbox" class="f-type" value="${escapeHtml(t)}"/> ${escapeHtml(t)}
    </label>`).join('');

  // Beds chips
  document.getElementById('fBeds').innerHTML = ['Any','2+','3+','4+'].map((b, i) => `
    <button type="button" data-min="${i === 0 ? 0 : i+1}" class="bed-chip btn ${i===0?'btn-primary':'btn-outline'} btn-sm" style="border-radius:999px;">${b}</button>
  `).join('');
  document.querySelectorAll('.bed-chip').forEach(c => {
    c.onclick = () => {
      document.querySelectorAll('.bed-chip').forEach(x => { x.classList.remove('btn-primary'); x.classList.add('btn-outline'); });
      c.classList.add('btn-primary'); c.classList.remove('btn-outline');
      render();
    };
  });

  // Amenity filters
  const amenityOptions = ["Hot tub","Pool","Beachfront","Lakefront","Pet friendly","Game console","Fireplace","Workspace","Sauna","Gym"];
  document.getElementById('fAmenities').innerHTML = amenityOptions.map(a => `
    <label style="display:flex; align-items:center; gap: 0.5rem; font-size: 0.92rem;">
      <input type="checkbox" class="f-amenity" value="${a.toLowerCase()}"/> ${a}
    </label>
  `).join('');

  // Wire the shared booking calendar to the search bar (no property selected
  // → just a date picker, same UX as home and property pages).
  if (window.BkCal) {
    window.BkCal.propertyId = null;
    window.BkCal.targets = {
      container: "searchPageCalendar",
      checkinValue: "fCheckin",
      checkoutValue: "fCheckout",
      checkinDisplay: "fCheckinDisplay",
      checkoutDisplay: "fCheckoutDisplay"
    };
    window.BkCal.onChange = render;
  }

  // Read URL params
  const params = new URLSearchParams(window.location.search);
  if (params.get('dest')) document.getElementById('fDest').value = params.get('dest');
  if (params.get('checkin')) {
    document.getElementById('fCheckin').value = params.get('checkin');
    document.getElementById('fCheckinDisplay').textContent = formatDateShort(params.get('checkin'));
    if (window.BkCal) window.BkCal.range.ci = params.get('checkin');
  }
  if (params.get('checkout')) {
    document.getElementById('fCheckout').value = params.get('checkout');
    document.getElementById('fCheckoutDisplay').textContent = formatDateShort(params.get('checkout'));
    if (window.BkCal) window.BkCal.range.co = params.get('checkout');
  }
  if (params.get('guests')) document.getElementById('fGuests').value = params.get('guests');

  // Bind filter events
  ['fDest','fGuests','fMinPrice','fMaxPrice','fPets','fFav','sortBy'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', render);
    if (el && el.tagName === 'INPUT' && el.type !== 'checkbox') el.addEventListener('input', () => clearTimeout(window._t) || (window._t = setTimeout(render, 250)));
  });
  document.querySelectorAll('.f-type, .f-amenity').forEach(c => c.addEventListener('change', render));

  // Per-session availability cache. Keyed by propertyId, value is a map of
  // ISO date → boolean (true = available). Avoids refetching the same data
  // every time the user tweaks an unrelated filter.
  window._availCache = window._availCache || {};

  async function fetchAvailability(propertyId) {
    if (window._availCache[propertyId]) return window._availCache[propertyId];
    try {
      const r = await fetch(`/api/availability?propertyId=${encodeURIComponent(propertyId)}&months=12`);
      const j = await r.json();
      if (j.ok) {
        const map = {};
        for (const d of (j.days || [])) map[d.date] = d.available !== false;
        window._availCache[propertyId] = map;
        return map;
      }
    } catch {}
    // On error we cache an empty map so subsequent renders don't keep
    // hammering the endpoint. Empty map → all dates treated as available
    // (we never hide a property just because we couldn't reach the API).
    window._availCache[propertyId] = {};
    return {};
  }

  // [ci, co) — every night from ci until the morning of co must be available.
  function isAvailableForRange(availMap, ci, co) {
    const start = new Date(ci + "T00:00:00Z");
    const end = new Date(co + "T00:00:00Z");
    if (!(end > start)) return true; // invalid / zero-night range — skip filter
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (availMap[iso] === false) return false;
    }
    return true;
  }

  // A monotonic "render token" so a fast filter change can supersede a
  // slower in-flight availability fetch without races.
  let _renderToken = 0;

  // On phones / tablets, the layout collapses to a single column at ≤960px,
  // so filters and the search bar push results well below the fold. Pulling
  // the user down to the first result on submit (and on initial load when
  // they came from the home page's Search button) saves a scroll.
  function scrollToResultsOnMobile() {
    if (window.innerWidth > 960) return;
    const target = document.getElementById('resultsCount');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // If the user landed here via the home page's Search button (URL has
  // checkin / dest / guests), scroll to results once the initial render
  // resolves. Otherwise this is a casual /search.html visit — leave them
  // at the top so they can see the full filter UI.
  const hasInitialSearch = params.has('checkin') || params.has('dest') || params.has('guests');
  render().then(() => { if (hasInitialSearch) scrollToResultsOnMobile(); });

  async function render() {
    const token = ++_renderToken;
    let list = NYRIS.properties.slice();
    const d = document.getElementById('fDest').value;
    const g = parseInt(document.getElementById('fGuests').value, 10);
    const minP = parseInt(document.getElementById('fMinPrice').value, 10);
    const maxP = parseInt(document.getElementById('fMaxPrice').value, 10);
    const pets = document.getElementById('fPets').checked;
    const fav = document.getElementById('fFav').checked;
    const types = [...document.querySelectorAll('.f-type:checked')].map(c => c.value);
    const amens = [...document.querySelectorAll('.f-amenity:checked')].map(c => c.value);
    const minBed = parseInt(document.querySelector('.bed-chip.btn-primary')?.dataset.min || '0', 10);
    const ci = document.getElementById('fCheckin').value;
    const co = document.getElementById('fCheckout').value;

    if (d) list = list.filter(p => p.destination === d);
    if (g) list = list.filter(p => p.capacity.guests >= g);
    if (minP) list = list.filter(p => p.basePrice >= minP);
    if (maxP) list = list.filter(p => p.basePrice <= maxP);
    if (pets) list = list.filter(p => p.petsAllowed);
    if (fav) list = list.filter(p => p.isGuestFavorite);
    if (minBed) list = list.filter(p => p.capacity.bedrooms >= minBed);
    if (types.length) list = list.filter(p => types.includes(p.type));
    if (amens.length) {
      list = list.filter(p => {
        const text = (p.amenities.join(' ') + ' ' + (p.summary || '') + ' ' + (p.tagline || '')).toLowerCase();
        return amens.every(a => text.includes(a));
      });
    }

    // Date-range availability — exclude properties with any blocked night
    // in [ci, co). Only runs when both dates are picked AND co > ci.
    const dateRange = ci && co && new Date(co + "T00:00:00Z") > new Date(ci + "T00:00:00Z");
    if (dateRange) {
      document.getElementById('resultsCount').textContent = `Checking availability for ${list.length} ${list.length === 1 ? 'home' : 'homes'}…`;
      const checks = await Promise.all(list.map(async p => ({
        p,
        ok: isAvailableForRange(await fetchAvailability(p.id), ci, co)
      })));
      // Stale token? Another render() superseded us — abort.
      if (token !== _renderToken) return;
      list = checks.filter(x => x.ok).map(x => x.p);
    }

    // Sort
    const sort = document.getElementById('sortBy').value;
    if (sort === 'rating') list.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    else if (sort === 'reviews') list.sort((a, b) => b.reviewCount - a.reviewCount);
    else if (sort === 'priceLow') list.sort((a, b) => a.basePrice - b.basePrice);
    else if (sort === 'priceHigh') list.sort((a, b) => b.basePrice - a.basePrice);
    else if (sort === 'capacity') list.sort((a, b) => b.capacity.guests - a.capacity.guests);

    const countLabel = dateRange
      ? `${list.length} ${list.length === 1 ? 'home' : 'homes'} available for your dates`
      : `${list.length} ${list.length === 1 ? 'home' : 'homes'} match your filters`;
    document.getElementById('resultsCount').textContent = countLabel;
    const grid = document.getElementById('resultsGrid');
    if (list.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 4rem 2rem; text-align:center; background: var(--color-cream-dark); border-radius: 18px;">
        <h3 style="margin: 0 0 0.5rem;">${dateRange ? 'No homes available for those dates.' : 'No matches.'}</h3>
        <p style="color: var(--color-stone); margin: 0 0 1rem;">${dateRange ? 'Try adjusting your dates or clearing other filters.' : 'Try clearing a filter or two.'}</p>
        <button class="btn btn-outline" onclick="clearFilters()">Clear filters</button>
      </div>`;
      return;
    }
    grid.innerHTML = list.map(p => propertyCard(p)).join('');
    bindPropertyCards(grid);
  }

  window.applySearch = async (e) => {
    e.preventDefault();
    await render();
    scrollToResultsOnMobile();
  };

  window.clearFilters = () => {
    document.getElementById('fDest').value = '';
    document.getElementById('fGuests').value = '';
    document.getElementById('fMinPrice').value = '';
    document.getElementById('fMaxPrice').value = '';
    document.getElementById('fPets').checked = false;
    document.getElementById('fFav').checked = false;
    // Dates + calendar state — without this, clicking "Clear filters" from
    // the "no homes available for those dates" empty state wouldn't clear
    // the dates that caused the empty result.
    document.getElementById('fCheckin').value = '';
    document.getElementById('fCheckout').value = '';
    document.getElementById('fCheckinDisplay').textContent = 'Add date';
    document.getElementById('fCheckoutDisplay').textContent = 'Add date';
    if (window.BkCal) window.BkCal.range = { ci: null, co: null };
    document.querySelectorAll('.f-type, .f-amenity').forEach(c => c.checked = false);
    document.querySelectorAll('.bed-chip').forEach((c, i) => {
      c.classList.toggle('btn-primary', i === 0);
      c.classList.toggle('btn-outline', i !== 0);
    });
    document.getElementById('sortBy').value = 'featured';
    render();
  };
})();
