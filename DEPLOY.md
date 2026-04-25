# Deployment guide — Nyris Retreats

The project is fully built and committed locally. The `gh` and `vercel` CLIs are already installed at `~/bin/` (added to your PATH via `~/.zshrc`). You only need to run a few commands — ~2 minutes total.

> **Note**: open a fresh terminal so the new PATH takes effect, or run `export PATH="$HOME/bin:$PATH"` once.

## 1. Push to GitHub

The `gh` CLI is installed (v2.91.0). The first command opens a browser to log into GitHub — that's the one step I couldn't do for you.

```bash
cd /Users/claude/Desktop/Claude/nyris-retreats
gh auth login                                     # browser-based, one time
gh repo create nyris-retreats --public --source=. --remote=origin --push
```

That creates the repo on GitHub, sets it as `origin`, and pushes the initial commit + DEPLOY.md commit.

### Alternative — without `gh`

If you'd rather not use `gh`, create a repo on the GitHub web UI then:

```bash
cd /Users/claude/Desktop/Claude/nyris-retreats
git remote add origin https://github.com/YOUR_USERNAME/nyris-retreats.git
git push -u origin main
```

## 2. Deploy to Vercel

The `vercel` CLI is installed (v52.0.0). Pick whichever path you prefer:

### Option A — Vercel CLI (3 commands)

```bash
cd /Users/claude/Desktop/Claude/nyris-retreats
vercel login           # browser-based, one time
vercel                 # answer the prompts; defaults are correct
vercel --prod          # promote to production — gives you the live URL
```

### Option B — Vercel web UI (1-click after GitHub push)

1. Go to <https://vercel.com/new>
2. Click **Import** next to the `nyris-retreats` repo
3. Framework preset: **Other** (it's a static site, no build step)
4. Build command and output directory: leave blank
5. Click **Deploy**

Either way, Vercel returns a live URL like `nyris-retreats-xxxx.vercel.app` in ~30 seconds. `vercel.json` is preconfigured for clean URLs, security headers, and asset caching.

## 3. Add a custom domain (optional)

Once deployed:

1. In Vercel: open the project → **Settings** → **Domains**
2. Add `nyrisretreats.com` (or whatever you've registered)
3. Vercel gives you DNS records — point your registrar at them
4. SSL provisions automatically; usually live within 5 minutes

## 4. Connect integrations (Hospitable, PriceLabs, Turso)

The admin dashboard works out of the box with localStorage. To unlock live API integration and multi-device admin sync, add these environment variables in Vercel → Project → **Settings → Environment Variables** (set for Production, Preview, and Development):

| Key | Where to get it | Used for |
|---|---|---|
| `HOSPITABLE_API_KEY` | [Hospitable → Settings → API](https://my.hospitable.com/settings/api) | Live property/photo/review/calendar/pricing sync |
| `PRICELABS_API_KEY` | [PriceLabs → Account → Integrations](https://app.pricelabs.co/account/integrations) | Dynamic pricing recommendations |
| `TURSO_DATABASE_URL` | [Turso dashboard](https://app.turso.tech) → DB → Show URL | Persistent admin overrides (multi-device) |
| `TURSO_AUTH_TOKEN` | Turso dashboard → DB → Tokens → Create | Auth for the Turso DB |

### Setting up Turso (1 minute)

```bash
# install once
brew install tursodatabase/tap/turso
# or: curl -sSfL https://get.tur.so/install.sh | bash

turso auth signup            # or: turso auth login
turso db create nyris-retreats
turso db show nyris-retreats --url            # → TURSO_DATABASE_URL
turso db tokens create nyris-retreats         # → TURSO_AUTH_TOKEN
```

Paste the URL and token into Vercel env vars. Schema migrations run automatically on first request — no manual DB setup needed.

After adding any env var, redeploy: `vercel --prod` (or push to git if you've connected GitHub).

In the admin dashboard, the **Hospitable API** and **PriceLabs** tabs show a green "Connected" indicator when the env vars are picked up.

## 5. Production hardening (do before going live)

The build is feature-complete but a few things should be swapped for production:

- **Admin auth** (`js/admin.js`): currently a hard-coded demo password. Replace with a real auth provider (Clerk, Auth0, Supabase, NextAuth).
- **Admin overrides storage**: currently `localStorage` (per-device). For shared edits across devices, persist to a database (Vercel KV, Supabase, Postgres).
- **Booking flow** (`book.html`): currently a UI mock. Wire to Hospitable's reservation API + Stripe Checkout.
- **Live availability**: add a serverless function at `/api/availability` that calls Hospitable's `search-properties` endpoint, then have `js/property.js` call it on date change.
- **Newsletter signup**: wire to your email provider (Klaviyo, ConvertKit, Mailchimp).
- **Contact / inquiry form**: currently shows a toast. Wire to email or your CRM.
- **Analytics**: add Vercel Analytics (one-click) or Plausible/Fathom.

## 5. Connecting live Hospitable data

The current site snapshots Hospitable data into `js/data.js` for performance. To go live with real-time data, add a serverless function:

```
api/properties.js     →  proxies Hospitable get-properties
api/availability.js   →  proxies Hospitable search-properties (date range)
api/reviews.js        →  proxies Hospitable get-property-reviews
```

Set your Hospitable API token as a Vercel environment variable (`HOSPITABLE_API_KEY`). Update the front-end JS to fetch from these endpoints instead of the static `data.js`.

## File structure

```
nyris-retreats/
├── index.html              Home — hero, featured, destinations, reviews, CTA
├── search.html             Browse + filter all stays
├── property.html           Property detail (uses ?slug=)
├── book.html               Booking confirmation flow
├── about.html              Superhost story
├── experiences.html        Local experiences by destination
├── faq.html                FAQ accordion
├── contact.html            Inquiry form
├── wishlist.html           Saved properties (localStorage)
├── compare.html            Side-by-side compare (up to 4)
├── gift-cards.html         Gift card purchase flow
├── admin.html              Host login + customization dashboard
├── 404.html                Branded not-found
├── css/styles.css          Global styles, design tokens, animations
├── js/
│   ├── data.js             All property data, images, reviews, FAQs
│   ├── app.js              Header, footer, wishlist, compare, lightbox, toast
│   ├── home.js             Home page logic
│   ├── property.js         Property detail logic
│   ├── search.js           Search/filter logic
│   └── admin.js            Admin auth + override editor
├── vercel.json             Clean URLs, headers, redirects
├── .gitignore
├── README.md
└── DEPLOY.md               This file
```
