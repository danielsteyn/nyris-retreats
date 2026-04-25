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

There are **two ways** to provide the Hospitable and PriceLabs API keys:

**A. From the admin dashboard (recommended)** — once Turso is connected, you can paste keys directly into the admin UI's Hospitable API and PriceLabs tabs. They're encrypted at rest (AES-256-GCM) before being stored, and the raw values are never returned to the browser. Replace or remove keys with one click.

**B. Via Vercel env vars** — works without Turso, but you have to redeploy to update keys. Admin-saved keys (option A) take precedence over env vars when both are present.

To unlock multi-device admin sync and admin-managed API keys, add these env vars in Vercel → Project → **Settings → Environment Variables** (set for Production, Preview, and Development):

| Key | Required for | Where to get it |
|---|---|---|
| `TURSO_DATABASE_URL` | Multi-device admin + admin-saved API keys | [Turso dashboard](https://app.turso.tech) → DB → Show URL |
| `TURSO_AUTH_TOKEN` | Same as above | Turso dashboard → DB → Tokens → Create |
| `SECRETS_KEY` | Stronger encryption key for admin-saved API keys *(recommended)* | Generate with `openssl rand -base64 32` |
| `HOSPITABLE_API_KEY` | *Optional* — only if you don't want to enter via admin UI | [Hospitable → Settings → API](https://my.hospitable.com/settings/api) |
| `PRICELABS_API_KEY` | *Optional* — only if you don't want to enter via admin UI | [PriceLabs → Account → Integrations](https://app.pricelabs.co/account/integrations) |
| `CRON_SECRET` | *Required for the 15-min PriceLabs price sync* | Generate with `openssl rand -base64 32` |

### Automated price sync (every 15 minutes)

The endpoint `/api/cron/sync-pricelabs` does the work. On each run it:

1. Reads your saved Pricelabs↔Nyris property mapping
2. Calls PriceLabs `listing_prices` for every mapped property (today → +90 days)
3. Upserts the daily prices into the `daily_prices` table in Turso
4. Logs the run to `sync_log` (visible in the admin → PriceLabs tab → "Auto-sync" panel)

**Required to run at all:**
- Turso must be configured (cron has nowhere else to read the API key or store prices)
- The PriceLabs API key must be saved server-side — either via the admin UI (with Turso connected) or as `PRICELABS_API_KEY` env var. Browser-stored keys are not accessible to a scheduled job.
- `CRON_SECRET` env var must be set (used to authenticate the cron request)

**Two scheduler options** — pick one:

**Option A — GitHub Actions (recommended on Vercel Hobby).** A workflow at `.github/workflows/sync-prices.yml` calls the endpoint every 15 minutes from GitHub's free runners. Setup:

1. Push the project to GitHub (the workflow is committed already)
2. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
   - `SITE_URL` = `https://nyris-retreats.vercel.app` (or your deployed URL)
   - `CRON_SECRET` = same value as the `CRON_SECRET` env var in Vercel
3. Open the **Actions** tab — the "PriceLabs price sync" workflow should appear. The first run will fire on the next 15-minute mark.
4. Manual trigger anytime via Actions → workflow → "Run workflow"

Free for this use case (≤3,000 runs/month, well within GitHub's 2,000 free minutes since each run takes ~5s).

**Option B — Vercel Cron (requires Pro plan for sub-daily).** `vercel.json` ships with a daily backstop (`0 6 * * *`). On Vercel Pro you can change it to `*/15 * * * *` and remove the GitHub workflow:

```json
"crons": [{ "path": "/api/cron/sync-pricelabs", "schedule": "*/15 * * * *" }]
```

Other example schedules: `*/30 * * * *` (every 30 min) · `0 */2 * * *` (every 2 hours) · `0 6 * * *` (daily at 06:00 UTC).

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
