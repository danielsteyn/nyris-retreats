// Reviews page — full list of guest reviews for a single property, with
// sort (newest/oldest/highest/lowest) + rating filter (All / 5 / 4 / 3 / 2 / 1).
// URL contract: /reviews.html?slug=<property-slug>

(async function() {
  // Wait for the server-side overrides fetch kicked off by app.js so visitors
  // on devices without local admin data still see the latest copy.
  if (window.__overridesReady) await window.__overridesReady;
  if (typeof applyOverrides === "function" && typeof NYRIS !== "undefined") {
    NYRIS.properties = applyOverrides(NYRIS.properties);
  }

  const root = document.getElementById('reviewsRoot');
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const property = NYRIS.properties.find(p => p.slug === slug);

  if (!property) {
    root.innerHTML = `
      <div style="padding: 5rem 2rem; text-align:center;">
        <h1 style="font-size: clamp(1.6rem, 3vw, 2rem); margin: 0 0 0.85rem;">Property not found</h1>
        <p style="color: var(--color-stone); margin: 0 0 1.5rem;">We couldn't find the property you're looking for.</p>
        <a href="/search.html" class="btn btn-primary">Browse all stays</a>
      </div>`;
    return;
  }

  document.title = `${property.name} — All reviews | Nyris Retreats`;
  // Make the back link return to the property page for context.
  const back = document.getElementById('reviewsBackLink');
  if (back) {
    back.href = `/property.html?slug=${encodeURIComponent(slug)}`;
    back.textContent = `← Back to ${property.name}`;
  }

  // Start with whatever's baked into data.js so the page paints instantly,
  // then swap in the full list from Hospitable once the API resolves. The
  // static array is only ~6 reviews — Hospitable holds the full history.
  let reviews = Array.isArray(property.reviews) ? property.reviews.slice() : [];

  // State held in URL-sync-able form so a refresh keeps the user's filter.
  const state = {
    sort: params.get('sort') || 'recent',  // recent | oldest | highest | lowest
    rating: params.get('rating') || 'all'  // all | 5 | 4 | 3 | 2 | 1
  };

  // ---- Render shell ----
  root.innerHTML = `
    <div class="reveal">
      <span class="section-eyebrow">All reviews</span>
      <h1 style="font-size: clamp(1.85rem, 3.5vw, 2.6rem); margin: 0.4rem 0 0.6rem;">${escapeHtml(property.name)}</h1>
      <div class="reviews-summary" id="reviewsSummary"></div>
    </div>

    <div class="reviews-toolbar reveal" id="reviewsToolbar">
      <div class="group">
        <span class="group-label">Sort</span>
        <select id="reviewsSort" class="form-control" style="width: auto; padding: 0.45rem 0.75rem; font-size: 0.88rem;">
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest</option>
          <option value="highest">Highest rated</option>
          <option value="lowest">Lowest rated</option>
        </select>
      </div>
      <div class="group" id="ratingChips">
        <span class="group-label">Filter</span>
        ${[
          { v: 'all', label: 'All' },
          { v: '5', label: '5 ★' },
          { v: '4', label: '4 ★' },
          { v: '3', label: '3 ★' },
          { v: '2', label: '2 ★' },
          { v: '1', label: '1 ★' }
        ].map(opt => `<button type="button" class="rating-chip" data-rating="${opt.v}">${opt.label}</button>`).join('')}
      </div>
      <div class="group" style="margin-left: auto;">
        <span id="reviewsCount" style="font-size: 0.85rem; color: var(--color-stone);"></span>
      </div>
    </div>

    <div id="reviewsGrid"></div>
  `;

  // Apply initial state into the controls
  document.getElementById('reviewsSort').value = state.sort;
  syncChipActiveState();
  renderSummary(property.rating, reviews.length);

  // ---- Wire controls ----
  document.getElementById('reviewsSort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    pushState();
    render();
  });
  document.querySelectorAll('#ratingChips .rating-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.rating = btn.dataset.rating;
      syncChipActiveState();
      pushState();
      render();
    });
  });

  render();

  // Pull the full review history from Hospitable in the background and swap
  // it in once it resolves. We don't block the initial paint on this — if
  // it's slow or fails, the user still sees the curated subset.
  fetchFullReviews().catch(() => {});

  async function fetchFullReviews() {
    if (!property.id) return;
    const countLabel = document.getElementById('reviewsCount');
    if (countLabel) countLabel.textContent = `Loading full history…`;
    try {
      const r = await fetch(`/api/hospitable/reviews?uuid=${encodeURIComponent(property.id)}`);
      const j = await r.json();
      if (!j.ok || !Array.isArray(j.reviews) || j.reviews.length === 0) return;
      reviews = j.reviews;
      renderSummary(j.avgRating || property.rating, reviews.length);
      render();
    } catch {
      // Silent — keep the static list visible.
    }
  }

  function renderSummary(rating, count) {
    const el = document.getElementById('reviewsSummary');
    if (!el) return;
    el.innerHTML = `
      <span style="display:inline-flex; align-items:center; gap: 0.4rem;">${ICON.star.replace('width="14" height="14"','width="18" height="18"')} <strong style="font-size: 1.1rem;">${Number(rating || 0).toFixed(1)}</strong></span>
      <span style="color: var(--color-stone);">·</span>
      <span><strong>${count}</strong> review${count === 1 ? '' : 's'} · ${escapeHtml(property.city)}, ${escapeHtml(property.state)}</span>`;
  }

  // ===========================================================================

  function render() {
    let list = reviews.slice();

    // Filter
    if (state.rating !== 'all') {
      const r = parseInt(state.rating, 10);
      list = list.filter(rev => Math.round(rev.rating) === r);
    }

    // Sort
    list.sort((a, b) => {
      switch (state.sort) {
        case 'oldest':  return parseReviewDate(a.date) - parseReviewDate(b.date);
        case 'highest': return (b.rating || 0) - (a.rating || 0) || (parseReviewDate(b.date) - parseReviewDate(a.date));
        case 'lowest':  return (a.rating || 0) - (b.rating || 0) || (parseReviewDate(b.date) - parseReviewDate(a.date));
        case 'recent':
        default:        return parseReviewDate(b.date) - parseReviewDate(a.date);
      }
    });

    const grid = document.getElementById('reviewsGrid');
    document.getElementById('reviewsCount').textContent = `${list.length} of ${reviews.length} shown`;

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="reviews-empty">
          ${reviews.length === 0
            ? '<strong style="display:block; font-size: 1.05rem; color: var(--color-charcoal); margin-bottom: 0.4rem;">No reviews yet for this property.</strong>This is a brand new listing — be among the first to book it.'
            : `<strong style="display:block; font-size: 1.05rem; color: var(--color-charcoal); margin-bottom: 0.4rem;">No reviews match this filter.</strong>Try a different rating filter, or <button type="button" onclick="document.querySelector(\'.rating-chip[data-rating=&quot;all&quot;]\').click()" style="background: none; border: 0; padding: 0; color: var(--color-primary); cursor: pointer; font-family: inherit; font-size: inherit; text-decoration: underline;">reset to All</button>.`}
        </div>`;
      return;
    }

    grid.innerHTML = list.map(renderReviewCard).join('');
  }

  function renderReviewCard(r) {
    const stars = '★'.repeat(Math.round(r.rating || 0)) + '☆'.repeat(Math.max(0, 5 - Math.round(r.rating || 0)));
    const initial = (r.author && r.author[0]) ? r.author[0].toUpperCase() : '★';
    const dateLabel = formatReviewDate(r.date);
    return `
      <div class="review-list-card">
        <div class="review-header">
          <div class="avatar">${escapeHtml(initial)}</div>
          <div>
            <div class="review-author">${escapeHtml(r.author || 'Verified guest')}</div>
            <div class="review-meta">${escapeHtml(dateLabel)}</div>
          </div>
        </div>
        <div class="stars" aria-label="${Math.round(r.rating || 0)} of 5 stars">${stars}</div>
        <p class="review-text">${escapeHtml(r.text || '')}</p>
      </div>`;
  }

  function syncChipActiveState() {
    document.querySelectorAll('#ratingChips .rating-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.rating === state.rating);
    });
  }

  function pushState() {
    const u = new URL(window.location);
    if (state.sort && state.sort !== 'recent') u.searchParams.set('sort', state.sort); else u.searchParams.delete('sort');
    if (state.rating && state.rating !== 'all') u.searchParams.set('rating', state.rating); else u.searchParams.delete('rating');
    history.replaceState(null, '', u);
  }

  // Reviews from data.js have dates as month-year strings ("April 2026").
  // Reviews from the Hospitable API have ISO timestamps. Handle both.
  function parseReviewDate(str) {
    if (!str) return 0;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getTime();
    // Fallback: try "Month YYYY" parsing (works in most engines but be safe)
    const m = String(str).match(/([A-Za-z]+)\s+(\d{4})/);
    if (m) {
      const d2 = new Date(`${m[1]} 1, ${m[2]}`);
      if (!isNaN(d2.getTime())) return d2.getTime();
    }
    return 0;
  }

  function formatReviewDate(str) {
    if (!str) return '';
    const t = parseReviewDate(str);
    if (!t) return str;
    const d = new Date(t);
    // If the original string is already a friendly month-year, keep it; else
    // format ISO into "Month YYYY".
    if (/^[A-Za-z]+\s+\d{4}$/.test(String(str).trim())) return str;
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }
})();
