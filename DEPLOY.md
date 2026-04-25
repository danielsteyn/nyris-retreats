# Deployment guide — Nyris Retreats

The project is fully built and committed locally. Below is exactly what you need to run to push it to GitHub and deploy it on Vercel. Both flows take about 2 minutes total.

## 1. Push to GitHub

### Option A — using the GitHub CLI (`gh`)

If you have the [GitHub CLI](https://cli.github.com/) installed:

```bash
cd /Users/claude/Desktop/Claude/nyris-retreats
gh auth login                                     # if not already logged in
gh repo create nyris-retreats --public --source=. --remote=origin --push
```

That single command creates the repo on GitHub, sets it as `origin`, and pushes the initial commit.

### Option B — using the GitHub website

1. Go to <https://github.com/new>
2. Repository name: `nyris-retreats`
3. Visibility: your choice (public is fine)
4. **Do not** check "Initialize with README" — the project already has one
5. Click **Create repository**
6. Copy the URL it gives you, then run:

```bash
cd /Users/claude/Desktop/Claude/nyris-retreats
git remote add origin https://github.com/YOUR_USERNAME/nyris-retreats.git
git push -u origin main
```

## 2. Deploy to Vercel

### Option A — easiest: import from GitHub

1. Go to <https://vercel.com/new>
2. Click **Import** next to the `nyris-retreats` repo (Vercel will list it after you grant access)
3. Framework preset: **Other** (it's a static site, no build step)
4. Build command: leave blank
5. Output directory: leave blank (Vercel will serve from the root)
6. Click **Deploy**

Vercel will give you a URL like `nyris-retreats-xxxx.vercel.app` in 30 seconds. Your `vercel.json` is already configured for clean URLs, security headers, and asset caching — no extra config needed.

### Option B — using the Vercel CLI

```bash
npm install -g vercel
cd /Users/claude/Desktop/Claude/nyris-retreats
vercel              # follow prompts; defaults are correct
vercel --prod       # promote to production
```

## 3. Add a custom domain (optional)

Once deployed:

1. In Vercel: open the project → **Settings** → **Domains**
2. Add `nyrisretreats.com` (or whatever you've registered)
3. Vercel gives you DNS records — point your registrar at them
4. SSL provisions automatically; usually live within 5 minutes

## 4. Production hardening (do before going live)

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
