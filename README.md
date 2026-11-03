# Life Quest

A personal companion app — tasks, goals, prayer, fitness, sleep, books, comics, learning, notes, mood, quotes, hobbies, MTG decks, a watchlist, people to keep in touch with, client work and finance in one place — with a light XP-and-levels layer on top. Each person picks the sections they use in Settings. Pure black, white accents.

- **Static site**: plain HTML/CSS/JS modules, no build step.
- **Data**: Cloudflare D1 (SQLite) behind a small API in `functions/` (Cloudflare Pages Functions), photos in Cloudflare R2.
  Every row is checked against its owner by the API; shared projects follow the member / editor / owner rules in `functions/_lib/projects.js`.
- **Hosting**: Cloudflare Pages.

## Deploy on Cloudflare Pages

1. Push this folder to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build settings: **Framework preset: None**, **Build command: _(empty)_**, **Build output directory: `/`**.
4. Deploy. You'll get a `*.pages.dev` URL (now lifequestapp.pages.dev).

## Cloudflare set-up (once)

In the Pages project (**lifequestapp**) → **Settings**:

- **Bindings** (Production and Preview): D1 database `DB` → `life-quest`; R2 bucket `PHOTOS` → `life-quest-photos`.
- **Variables and Secrets** (Production): `RESEND_API_KEY` (emails), `MAIL_FROM` (e.g. `Life Quest <hello@mail.yourdomain.com>`),
  `TURNSTILE_SECRET` (bot check on sign-in / sign-up).

The API creates and updates the database tables itself on its first request after a change (`functions/_middleware.js`),
so there is nothing to run by hand.

## Accounts

Email + password. New accounts get a confirmation email (Resend); "Forgot password?" emails a reset link.
Sessions are an HttpOnly cookie that lasts 90 days. Passwords are stored as PBKDF2 hashes (accounts carried over from
Supabase keep working: their bcrypt hash is upgraded on the next sign-in).

## Configuration

`js/config.js` holds an optional TMDB key (Watchlist search, posters and where to watch), the Last.fm key and the
Turnstile site key. All are designed to be public. Set `OFFLINE_ONLY = true` to run in offline mode (data stays in that browser).

## Database

`functions/_lib/schema.js` describes every table once: columns, defaults and validation rules.
`npm run schema` writes `schema.sql` and `functions/_lib/schema-sql.js` from it.

## Testing locally

```sh
npm install
npx wrangler pages dev . --d1 DB --r2 PHOTOS --binding DEV_MAIL=1
npm test            # in another terminal: end-to-end API tests (accounts, private data, projects, couple space, photos)
```

`DEV_MAIL=1` hands email links back in the response instead of sending them; never set it in production.

## Backups

Nightly, encrypted, in the private repo bizarriahuz/life-quest-backups (it reads `/api/backup` with its own key).

## XP rules

| Action | XP | Stat |
|---|---|---|
| Task (main or job / side / daily) | 30 / 15 / 10 | Discipline |
| Each prayer, +20 for all five in a day | 10 | Faith |
| Daily Awrad | 20 | Faith |
| Workout | 1 per minute (max 120) + 5 per km | Strength |
| Reading | 1 per 10 pages, 50 for finishing | Knowledge |
| Comic read | 15 | Knowledge |
| Night of sleep logged (+10 if goal met) | 5 | Rest |
| New note / quote | 10 / 5 | Reflection |
| Hobby session | 1 per 2 min (min 5) | Craft |
| First finance entry on a day | 10 | Wealth |
| Deposit into a savings goal | 1 per 10 (5–50) | Wealth |
| Finished month at or under budget | 50 | Wealth |
| First sadaqah on a day (logged in Finance) | 10 | Faith |
| Goal milestone / goal achieved | 15 / 100 | Discipline |
| Study time / course completed | 1 per 2 min (min 5) / 75 | Knowledge |
| Mood check-in | 10 | Reflection |
| MTG game (+5 for a win) | 10 | Craft |
| Film or series finished | 5 | Craft |
| Catch-up with someone (once per person per day) | 10 | Connection |
| Client project started / paid | 20 / 40 | Wealth |

Only stats for the sections someone has switched on count toward their level.

Undoing or deleting something removes its XP. Tune values in `js/game.js`.

## Limits

The database enforces fair-use limits so one account can't fill the free plan: size caps on all text (notes 20,000 characters each, 2 million in total), per-person row caps per section (e.g. 5,000 tasks, 20,000 finance entries, 100 hobbies), and at most 60 new rows per section per minute. See the end of `supabase/schema.sql`.

## Updating

When you ship something, add an entry at the top of `js/changelog.js`. It shows under Settings → What's new, and a dot appears on Settings until each person has seen it.

## Project layout

```
index.html            app shell
about.html            public showcase page (/about), with img/showcase/ and og.png for link previews
css/style.css         all styling
js/app.js             routing, sign-in, level-ups
js/store.js           server (/api) + offline data stores (same interface)
functions/            the API: accounts, data, photos, backup (Cloudflare Pages Functions)
js/game.js            XP rules and level maths
js/changelog.js       What's new entries
js/prayertimes.js     MUIS prayer times (api.prayertimes.sg)
js/tmdb.js            TMDB search, details and Singapore streaming services for the Watchlist
js/theme.js           colourways (picked in Settings)
js/mtg.js             decklist parser + Scryfall lookups (commander art, mana curve)
js/scanner.js         camera barcode scanner (native BarcodeDetector or bundled ZXing)
js/vendor/zxing.js    ZXing 0.21.3 1D decoder + a working EAN 5-digit add-on reader (bundled with esbuild)
js/views/*.js         one file per section
supabase/schema.sql   database schema
supabase/migrations/  changes applied after the first schema
_headers              Cloudflare security headers
```
