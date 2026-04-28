// Nyris Retreats — Runtime Theme System
// Loads BEFORE other scripts so theme is applied as early as possible
// (ideally in <head>) to avoid flash-of-default-theme.

(function() {
  const THEME_KEY = "nyris.theme";

  const DEFAULTS = {
    templateId: "default",
    brandName: "Nyris Retreats",
    brandTagline: "Top 1% Guest Favorite stays. Curated by a Superhost.",
    logoUrl: "", // empty -> use default SVG mark
    logoSvg: "", // optional inline SVG override
    logoFooterUrl: "", // optional separate logo for the dark footer; falls back to logoUrl
    fontDisplay: "Cormorant Garamond",
    fontBody: "Inter",
    fontDisplayWeight: "500",
    colors: {
      primary: "#1F3D2B",
      primaryDark: "#15291D",
      primaryLight: "#2C5639",
      accent: "#C28456",
      accentDark: "#A66B40",
      cream: "#FAF6EE",
      creamDark: "#F2EBDC",
      sand: "#E8DDC9",
      charcoal: "#1A1A1A",
      stone: "#6B7568",
      success: "#2C7A5A",
      danger: "#B14A3F"
    },
    radius: { card: "16px", button: "999px" }
  };

  // Templates bundle a complete look (colors + fonts + structural CSS hooks
  // via `data-template`). Picking a template overwrites the saved theme;
  // tweaks made after picking remain part of the template's saved state.
  const TEMPLATES = {
    default: {
      name: "Default — Cormorant & Cream",
      description: "Warm cream backgrounds, serif display type, classic editorial feel.",
      theme: {
        fontDisplay: "Cormorant Garamond",
        fontBody: "Inter",
        colors: {
          primary: "#1F3D2B", primaryDark: "#15291D", primaryLight: "#2C5639",
          accent: "#C28456", accentDark: "#A66B40",
          cream: "#FAF6EE", creamDark: "#F2EBDC", sand: "#E8DDC9",
          charcoal: "#1A1A1A", stone: "#6B7568",
          success: "#2C7A5A", danger: "#B14A3F"
        },
        radius: { card: "16px", button: "999px" }
      }
    },
    modern: {
      name: "Modern — Airbnb-style",
      description: "Sans-serif throughout, coral accents, clean white surfaces, tighter radii.",
      theme: {
        fontDisplay: "Inter",
        fontBody: "Inter",
        colors: {
          primary: "#222222", primaryDark: "#000000", primaryLight: "#484848",
          accent: "#FF7B5C", accentDark: "#E5634A",
          cream: "#FFFFFF", creamDark: "#F7F7F7", sand: "#FAF5EC",
          charcoal: "#222222", stone: "#717171",
          success: "#008A05", danger: "#C13515"
        },
        radius: { card: "12px", button: "10px" }
      }
    },
    luxury: {
      name: "Luxury — Champagne & Navy",
      description: "High-contrast Bodoni serif, deep navy text, champagne-gold accents, ivory surfaces — magazine-luxury feel.",
      theme: {
        fontDisplay: "Bodoni Moda",
        fontBody: "Inter",
        colors: {
          primary: "#1B2638", primaryDark: "#0E1828", primaryLight: "#2E3F5A",
          accent: "#B89968", accentDark: "#967649",
          cream: "#FBF7EE", creamDark: "#F2ECDB", sand: "#E8DFC8",
          charcoal: "#1B1B1B", stone: "#6E6960",
          success: "#2C7A5A", danger: "#9B3A2E"
        },
        radius: { card: "18px", button: "999px" }
      }
    }
  };

  const PRESETS = {
    "emerald-copper": { name: "Emerald & Copper (default)", colors: { primary: "#1F3D2B", primaryDark: "#15291D", primaryLight: "#2C5639", accent: "#C28456", accentDark: "#A66B40", cream: "#FAF6EE", sand: "#E8DDC9" } },
    "midnight-gold": { name: "Midnight & Gold", colors: { primary: "#1A2238", primaryDark: "#10172A", primaryLight: "#2A3656", accent: "#D4A857", accentDark: "#B68A3D", cream: "#F8F4EC", sand: "#E5DBC7" } },
    "terracotta-cream": { name: "Terracotta & Cream", colors: { primary: "#8E3B2A", primaryDark: "#6E2C1F", primaryLight: "#A8513F", accent: "#5C8A6E", accentDark: "#456A55", cream: "#FBF6EC", sand: "#EDE0CC" } },
    "ocean-sand": { name: "Ocean & Sand", colors: { primary: "#1E4D5B", primaryDark: "#143945", primaryLight: "#2D6273", accent: "#E8A552", accentDark: "#C9893E", cream: "#F7F4EE", sand: "#E2D8C5" } },
    "noir-rose": { name: "Noir & Rose", colors: { primary: "#1F1A1F", primaryDark: "#13101A", primaryLight: "#2F2630", accent: "#D08F8F", accentDark: "#B07474", cream: "#FAF6F4", sand: "#E8DEDB" } }
  };

  const FONT_OPTIONS = {
    display: [
      { name: "Cormorant Garamond", weights: "400;500;600", url: "Cormorant+Garamond:wght@400;500;600" },
      { name: "Playfair Display", weights: "400;500;600", url: "Playfair+Display:wght@400;500;600" },
      { name: "DM Serif Display", weights: "400", url: "DM+Serif+Display" },
      { name: "Fraunces", weights: "400;500;600", url: "Fraunces:wght@400;500;600" },
      { name: "Libre Baskerville", weights: "400;700", url: "Libre+Baskerville:wght@400;700" },
      { name: "Cormorant", weights: "400;500;600", url: "Cormorant:wght@400;500;600" },
      { name: "EB Garamond", weights: "400;500;600", url: "EB+Garamond:wght@400;500;600" },
      { name: "Crimson Pro", weights: "400;500;600", url: "Crimson+Pro:wght@400;500;600" },
      { name: "Bodoni Moda", weights: "400;500;600", url: "Bodoni+Moda:wght@400;500;600" },
      { name: "Italiana", weights: "400", url: "Italiana" }
    ],
    body: [
      { name: "Inter", weights: "400;500;600;700", url: "Inter:wght@400;500;600;700" },
      { name: "Manrope", weights: "400;500;600;700", url: "Manrope:wght@400;500;600;700" },
      { name: "DM Sans", weights: "400;500;700", url: "DM+Sans:wght@400;500;700" },
      { name: "Plus Jakarta Sans", weights: "400;500;600;700", url: "Plus+Jakarta+Sans:wght@400;500;600;700" },
      { name: "Work Sans", weights: "400;500;600;700", url: "Work+Sans:wght@400;500;600;700" },
      { name: "Outfit", weights: "400;500;600;700", url: "Outfit:wght@400;500;600;700" },
      { name: "Geist", weights: "400;500;600;700", url: "Geist:wght@400;500;600;700" },
      { name: "Figtree", weights: "400;500;600;700", url: "Figtree:wght@400;500;600;700" },
      { name: "Be Vietnam Pro", weights: "400;500;600;700", url: "Be+Vietnam+Pro:wght@400;500;600;700" },
      { name: "Karla", weights: "400;500;700", url: "Karla:wght@400;500;700" }
    ]
  };

  const Theme = {
    DEFAULTS, PRESETS, FONT_OPTIONS, TEMPLATES,
    get() {
      try {
        const stored = JSON.parse(localStorage.getItem(THEME_KEY) || "{}");
        return deepMerge(structuredClone(DEFAULTS), stored);
      } catch { return structuredClone(DEFAULTS); }
    },
    set(theme) {
      try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch {}
      this.apply(theme);
    },
    reset() {
      try { localStorage.removeItem(THEME_KEY); } catch {}
      this.apply(DEFAULTS);
    },
    // Replace the saved theme with a template's bundled colors+fonts+radii,
    // preserving brand-identity fields (name, tagline, logo) so picking a
    // template doesn't wipe the customer's wordmark or uploaded logo.
    applyTemplate(key) {
      const tpl = TEMPLATES[key] || TEMPLATES.default;
      const cur = this.get();
      const next = deepMerge(structuredClone(DEFAULTS), structuredClone(tpl.theme));
      next.templateId = key;
      next.brandName = cur.brandName;
      next.brandTagline = cur.brandTagline;
      next.logoUrl = cur.logoUrl;
      next.logoSvg = cur.logoSvg;
      next.logoFooterUrl = cur.logoFooterUrl;
      this.set(next);
      return next;
    },
    apply(theme = null) {
      const t = theme || this.get();
      const root = document.documentElement;
      // Template hook — drives structural CSS overrides ([data-template="…"]).
      root.dataset.template = t.templateId || "default";
      // Colors
      root.style.setProperty("--color-primary", t.colors.primary);
      root.style.setProperty("--color-primary-dark", t.colors.primaryDark);
      root.style.setProperty("--color-primary-light", t.colors.primaryLight);
      root.style.setProperty("--color-accent", t.colors.accent);
      root.style.setProperty("--color-accent-dark", t.colors.accentDark);
      root.style.setProperty("--color-cream", t.colors.cream);
      root.style.setProperty("--color-cream-dark", t.colors.creamDark);
      root.style.setProperty("--color-sand", t.colors.sand);
      root.style.setProperty("--color-charcoal", t.colors.charcoal);
      root.style.setProperty("--color-stone", t.colors.stone);
      // Fonts
      root.style.setProperty("--font-display", `"${t.fontDisplay}", Georgia, serif`);
      root.style.setProperty("--font-body", `"${t.fontBody}", system-ui, sans-serif`);
      // Update favicon to match primary color
      this.updateFavicon(t.colors.primary);
      // Load Google Fonts if not default
      this.loadFonts(t);
      // Update brand name in DOM if rendered
      requestAnimationFrame(() => {
        document.querySelectorAll("[data-brand-name]").forEach(el => el.textContent = t.brandName);
        document.querySelectorAll("[data-brand-tagline]").forEach(el => el.textContent = t.brandTagline);
      });
    },
    loadFonts(t) {
      const dispFont = FONT_OPTIONS.display.find(f => f.name === t.fontDisplay);
      const bodyFont = FONT_OPTIONS.body.find(f => f.name === t.fontBody);
      if (!dispFont || !bodyFont) return;
      const url = `https://fonts.googleapis.com/css2?family=${dispFont.url}&family=${bodyFont.url}&display=swap`;
      let link = document.getElementById("nyris-fonts");
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet"; link.id = "nyris-fonts";
        document.head.appendChild(link);
      }
      if (link.href !== url) link.href = url;
    },
    updateFavicon(primary) {
      const enc = encodeURIComponent(primary);
      const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='${enc}' d='M4 26 L16 6 L28 26 Z'/%3E%3C/svg%3E`;
      let link = document.querySelector("link[rel='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = svg;
    },
    logoMark(t = null, variant = 'header') {
      t = t || this.get();
      // Footer can override the image with logoFooterUrl — useful when the
      // header logo is dark on a light bar but the footer needs a light
      // variant on the dark band. Falls back to the header logo otherwise.
      if (variant === 'footer' && t.logoFooterUrl) {
        return `<img class="brand-mark-img" src="${escapeAttr(t.logoFooterUrl)}" alt="${escapeAttr(t.brandName)}"/>`;
      }
      if (t.logoUrl) {
        // Sized to fit the header bar; wordmarks taller than this get scaled down.
        return `<img class="brand-mark-img" src="${escapeAttr(t.logoUrl)}" alt="${escapeAttr(t.brandName)}"/>`;
      }
      if (t.logoSvg) {
        return `<span class="brand-mark-svg">${t.logoSvg}</span>`;
      }
      return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:28px; height:28px;"><path d="M4 26 L16 6 L28 26 Z"/><path d="M10 26 L16 14 L22 26"/><circle cx="16" cy="22" r="1.2" fill="currentColor"/></svg>`;
    }
  };

  function escapeAttr(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    for (const k of Object.keys(source)) {
      if (source[k] && typeof source[k] === "object" && !Array.isArray(source[k])) {
        target[k] = deepMerge(target[k] || {}, source[k]);
      } else {
        target[k] = source[k];
      }
    }
    return target;
  }

  // Apply immediately so theme appears before paint
  Theme.apply();

  // Re-apply on storage change (cross-tab updates)
  window.addEventListener("storage", e => { if (e.key === THEME_KEY) Theme.apply(); });

  // Expose globally
  window.Theme = Theme;
})();
