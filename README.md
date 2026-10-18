# Life Quest

A personal companion app — tasks, prayer, fitness, books, notes, quotes and hobbies in one place — with a light XP-and-levels layer on top. Pure black, white accents.

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
| New note / quote | 10 / 5 | Reflection |
| Hobby session | 1 per 2 min (min 5) | Craft |

Undoing or deleting something removes its XP. Tune values in `js/game.js`.

## Project layout

```
index.html            app shell
css/style.css         all styling
js/app.js             routing, sign-in, level-ups
js/store.js           Supabase + offline data stores (same interface)
js/game.js            XP rules and level maths
js/views/*.js         one file per section
supabase/schema.sql   database schema
_headers              Cloudflare security headers
```
