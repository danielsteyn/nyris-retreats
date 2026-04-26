// Search/filters page

(function() {
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

  render();

  function render() {
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

    // Sort
    const sort = document.getElementById('sortBy').value;
    if (sort === 'rating') list.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    else if (sort === 'reviews') list.sort((a, b) => b.reviewCount - a.reviewCount);
    else if (sort === 'priceLow') list.sort((a, b) => a.basePrice - b.basePrice);
    else if (sort === 'priceHigh') list.sort((a, b) => b.basePrice - a.basePrice);
    else if (sort === 'capacity') list.sort((a, b) => b.capacity.guests - a.capacity.guests);

    document.getElementById('resultsCount').textContent = `${list.length} ${list.length === 1 ? 'home' : 'homes'} match your filters`;
    const grid = document.getElementById('resultsGrid');
    if (list.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 4rem 2rem; text-align:center; background: var(--color-cream-dark); border-radius: 18px;">
        <h3 style="margin: 0 0 0.5rem;">No matches.</h3>
        <p style="color: var(--color-stone); margin: 0 0 1rem;">Try clearing a filter or two.</p>
        <button class="btn btn-outline" onclick="clearFilters()">Clear filters</button>
      </div>`;
      return;
    }
    grid.innerHTML = list.map(p => propertyCard(p)).join('');
    bindPropertyCards(grid);
  }

  window.applySearch = (e) => { e.preventDefault(); render(); };

  window.clearFilters = () => {
    document.getElementById('fDest').value = '';
    document.getElementById('fGuests').value = '';
    document.getElementById('fMinPrice').value = '';
    document.getElementById('fMaxPrice').value = '';
    document.getElementById('fPets').checked = false;
    document.getElementById('fFav').checked = false;
    document.querySelectorAll('.f-type, .f-amenity').forEach(c => c.checked = false);
    document.querySelectorAll('.bed-chip').forEach((c, i) => {
      c.classList.toggle('btn-primary', i === 0);
      c.classList.toggle('btn-outline', i !== 0);
    });
    document.getElementById('sortBy').value = 'featured';
    render();
  };
})();
