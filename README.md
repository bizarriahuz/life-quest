# Life Quest

A personal companion app — tasks, goals, prayer, fitness, sleep, books, comics, learning, notes, mood, quotes, hobbies, MTG decks, a watchlist, people to keep in touch with, client work and finance in one place — with a light XP-and-levels layer on top. Each person picks the sections they use in Settings. Pure black, white accents.

- **Static site**: plain HTML/CSS/JS modules, no build step.
- **Data**: Supabase (Postgres + Auth). Every table is locked to its owner with row-level security.
- **Hosting**: Cloudflare Pages.

## Deploy on Cloudflare Pages

1. Push this folder to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build settings: **Framework preset: None**, **Build command: _(empty)_**, **Build output directory: `/`**.
4. Deploy. You'll get a `*.pages.dev` URL.

## After the first deploy (Supabase)

1. **Authentication → URL Configuration**: set **Site URL** to your `*.pages.dev` URL (so confirmation emails link back to the app).
2. Open the app, **Create account**, confirm the email, sign in.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up" — it's a one-person app, so nobody else should be able to register.

## Configuration

`js/config.js` holds the Supabase URL and publishable key. Both are designed to be public; row-level security protects the data. Blank them out to run in offline mode (data stays in that browser).

## Database

`supabase/schema.sql` is the full schema (already applied to the live project).

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
js/store.js           Supabase + offline data stores (same interface)
js/game.js            XP rules and level maths
js/changelog.js       What's new entries
js/prayertimes.js     MUIS prayer times (api.prayertimes.sg)
js/mtg.js             decklist parser + Scryfall lookups (commander art, mana curve)
js/scanner.js         camera barcode scanner (native BarcodeDetector or bundled ZXing)
js/vendor/zxing.js    ZXing 0.21.3 1D decoder + a working EAN 5-digit add-on reader (bundled with esbuild)
js/views/*.js         one file per section
supabase/schema.sql   database schema
supabase/migrations/  changes applied after the first schema
_headers              Cloudflare security headers
```
