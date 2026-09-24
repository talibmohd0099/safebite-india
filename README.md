# FoodGuard India (SafeBite India)

A packaged-food scanner for Indian shoppers. Scan a product's barcode (or its
ingredient label) and get an instant health score, a plain-language verdict,
and a breakdown of every ingredient — flagging harmful additives, allergens,
and nutrition red flags.

Runs as a web app (GitHub Pages) and as an Android app (Capacitor).

## Features

- **Barcode scanning** with checksum validation and GS1 country-of-origin lookup
- **Health score (0–100)** with verdicts from *Excellent* to *Very Poor*,
  computed by a rule-based engine (`src/services/scoringEngine.js`) — a single
  harmful ingredient caps the score so it can't be diluted by safe ones
- **Ingredient library** — known ingredients are scored locally; AI (Google
  Gemini) is only used for ingredients not yet in the library
- **Allergen alerts** and **family profiles** with a personalised score per member
- **Intake log** — track what you eat and your daily nutrient totals
- **Compare products** side by side
- **Browse by category** and popular searches
- **Food-safety news** with AI summaries and a daily "Did you know?" tip
- **Multi-language UI**, light/dark theme, local notifications, local backup
- **Submit a missing product**, and report data issues
- **Admin panel** (`/admin`) — manage products, review flags, submissions,
  duplicates, data issues, and live scrape progress

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS 3 |
| Mobile | Capacitor 8 (Android) |
| Backend / DB | Supabase (Postgres + storage) |
| AI | Google Gemini, Cloudflare Workers AI |
| Product data | Open Food Facts, Blinkit scraper |
| Automation | GitHub Actions (deploy, APK build, scrapers, news, reports) |
| Tests / lint | Node's built-in test runner, Oxlint |

## Project structure

```
src/
  pages/          App screens (Home, Result, Compare, Family, News, ...) + admin/
  components/     Reusable UI (BarcodeScanner, ScoreCircle, IngredientCard, ...)
  services/       Business logic: scoring, parsing, data repos, AI calls (+ *.test.js)
  contexts/       Language and family-profile React contexts
  data/           Static data (categories, GS1 prefixes, tips)
  i18n/           UI translation strings
scripts/          Node scripts run by GitHub Actions (scrapers, backfills, reports)
supabase/         SQL schemas and migrations
android/          Capacitor Android project
.github/workflows CI/CD and scheduled jobs
```

## Getting started

**Requirements:** Node.js 22+, npm. For Android: Java 21 and Android SDK.

```bash
npm install
# create a .env file first (see below)
npm run dev            # http://localhost:5173/safebite-india/
```

### Environment variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_API_KEY=...          # optional extra keys: VITE_GEMINI_API_KEY_2 ... _6
VITE_CLOUDFLARE_ACCOUNT_ID=...
VITE_CLOUDFLARE_API_TOKEN=...
NEWSDATA_API_KEY=...             # only used by the news-fetch script
```

Set up the database by running the SQL files in `supabase/` in your Supabase
project (start with `schema.sql` and the `*_schema.sql` files, then migrations).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build for GitHub Pages (into `dist/`) |
| `npm run preview` | Preview the production build |
| `npm test` | Run unit tests |
| `npm run lint` | Lint with Oxlint |

## Deployment

### Web (GitHub Pages)

`.github/workflows/deploy-pages.yml` builds and deploys on every push to
`main`, or manually from **Actions → Deploy to GitHub Pages → Run workflow**.

One-time setup:
1. **Settings → Pages → Source:** set to **GitHub Actions**.
2. **Settings → Secrets and variables → Actions:** add the `VITE_*` secrets
   listed above.

The site is served at `https://<username>.github.io/safebite-india/`.

### Android APK

Run **Actions → Build Android APK → Run workflow**. It publishes a debug APK to
the rolling `latest-apk` release, ready to sideload on your phone.

To also build a signed Play Store bundle (AAB), add these secrets:
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`.

Local Android build:

```bash
npx vite build --mode capacitor
npx cap sync android
npx cap open android      # opens in Android Studio
```

### Scheduled jobs

Other workflows run on a schedule: Blinkit scraping, Open Food Facts product
discovery, news fetching/summarising, the daily fact, and report generation.

## Disclaimer

Scores are informational and based on the ingredient and nutrition data
available. They are not medical advice.
