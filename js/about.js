// About / Our Story page — applies admin overrides to the otherwise-static
// markup. Mirrors the home.js pattern: keep defaults in HTML, mutate via
// IDs / data-attributes when o.aboutPage is present.

(async function() {
  if (window.__overridesReady) await window.__overridesReady;
  // Overrides is a top-level `const` declared in app.js — script-scope,
  // not on window. typeof guard avoids ReferenceError if app.js hasn't
  // loaded for any reason (CDN issue, ad blocker, etc.).
  if (typeof Overrides === 'undefined') return;
  const o = Overrides.get();
  const a = o && o.aboutPage;
  if (!a) return;

  if (a.hero) {
    if (a.hero.image) document.getElementById('aboutHeroImg').style.backgroundImage = `url('${a.hero.image}')`;
    if (a.hero.eyebrow) document.getElementById('aboutEyebrow').textContent = a.hero.eyebrow;
    if (a.hero.title) document.getElementById('aboutTitle').textContent = a.hero.title;
  }

  if (a.lead) document.getElementById('aboutLead').textContent = a.lead;
  if (a.body1) document.getElementById('aboutBody1').textContent = a.body1;
  if (a.body2) document.getElementById('aboutBody2').textContent = a.body2;

  if (a.quote) document.getElementById('aboutQuote').textContent = a.quote;
  if (a.quoteCaption) document.getElementById('aboutQuoteCaption').textContent = a.quoteCaption;

  if (a.bulletsTitle) document.getElementById('aboutBulletsTitle').textContent = a.bulletsTitle;
  if (Array.isArray(a.bullets)) {
    a.bullets.forEach((b, i) => {
      if (!b) return;
      const t = document.querySelector(`[data-about-bullet="${i}-title"]`);
      const p = document.querySelector(`[data-about-bullet="${i}-body"]`);
      if (t && b.title) t.textContent = b.title;
      if (p && b.body) p.textContent = b.body;
    });
  }

  if (a.cta) {
    const btn = document.getElementById('aboutCta');
    if (btn) {
      if (a.cta.text) btn.textContent = a.cta.text;
      if (a.cta.link) btn.setAttribute('href', a.cta.link);
    }
  }

  if (Array.isArray(a.stats)) {
    a.stats.forEach((s, i) => {
      if (!s) return;
      const n = document.querySelector(`[data-about-stat="${i}-num"]`);
      const l = document.querySelector(`[data-about-stat="${i}-label"]`);
      if (n && s.num) n.textContent = s.num;
      if (l && s.label) l.textContent = s.label;
    });
  }
})();
