# Nyris Retreats — Direct Booking Site

A world-class direct booking site for Nyris Retreats, a portfolio of six Top 1% Guest Favorite vacation homes managed by an experienced Superhost. Static HTML / CSS / JS — zero build step. Property data sourced from Hospitable.

## What's inside

- **Home** — hero with search, featured properties grid, destinations, trust strip, value props, Superhost story, reviews carousel, newsletter, FAQ teaser
- **Search** — full filters: destination, dates, guests, beds, price range, property type, amenities, pet friendly, Guest Favorite. Sortable.
- **Property detail** — 5-up gallery with full lightbox, sticky booking widget with date picker + live price breakdown (incl. long-stay discounts, taxes), reviews with rating breakdown, amenities grid, map link, share, wishlist, compare, similar properties
- **Booking flow** — multi-step confirmation page with split-pay options
- **About / Our Story** — Superhost narrative with portfolio stats
- **Experiences** — destination-by-destination curated activity guide
- **FAQ** — accordion
- **Contact** — inquiry form with topic routing
- **Wishlist** — persisted per-device via localStorage
- **Compare** — side-by-side comparison of up to 4 properties
- **Gift cards** — designed gift-card mockup with live amount preview
- **Admin** — login + dashboard to customize hero copy, hero image, featured property order, and per-property name/tagline/price overrides
- **404** — branded not-found page

## Tech

- Vanilla HTML, CSS, and JavaScript — no framework, no build
- Tailwind-style utility class structure with custom CSS using design tokens
- Google Fonts: Cormorant Garamond (display) + Inter (body)
- Hospitable image CDN for property photos
- localStorage for wishlist, compare list, recently viewed, and admin overrides
- Smooth scroll-reveal via IntersectionObserver
- Image carousel on property cards
- Responsive: full mobile drawer nav, sticky mobile CTA on property detail, single-column layouts on small screens

## Brand

- Primary color: `#1F3D2B` (deep emerald)
- Accent color: `#C28456` (warm copper)
- Cream background: `#FAF6EE`
- Display font: Cormorant Garamond
- Body font: Inter

Edit `js/data.js` for source-of-truth property data, or use `/admin` to layer overrides.

## Run locally

```bash
# any static server works:
python3 -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000`.

## Admin

Visit `/admin.html`.

Demo credentials:
- Email: `sheena@nyrisretreats.com`
- Password: `nyris2026`

**Production note:** swap the demo auth in `js/admin.js` for a real provider (Clerk, Auth0, Supabase, NextAuth, etc.) and persist overrides server-side instead of localStorage.

## Deploy

- **Vercel:** push to GitHub and import — `vercel.json` is preconfigured (clean URLs, security headers, asset caching)
- **Netlify / Cloudflare Pages:** any static host works; copy the rules in `vercel.json` to that host's equivalent

## Connecting live Hospitable data

The current build snapshots Hospitable property data into `js/data.js` at build time so the site is fully static (fast, no API costs, no rate limits). For live availability/pricing:

1. Add a thin serverless function (e.g. `/api/availability`) that hits Hospitable's `search-properties` endpoint
2. Wire the property detail booking widget to call it on date change
3. Replace the demo `/book` flow with a real Hospitable reservation call + Stripe Checkout

## License

Private project. © Nyris Retreats.
