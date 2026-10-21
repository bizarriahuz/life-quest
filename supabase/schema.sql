-- LIFE QUEST — database schema
-- Every table is private to the signed-in user through row-level security.

-- ---------- hero ----------
create table public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  hero_name  text not null default 'HERO' check (char_length(hero_name) between 1 and 24),
  sections   text[] check (sections is null or sections <@ array['tasks','prayer','fitness','sleep','books','comics','notes','quotes','hobbies','finance']::text[]),
  currency   text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  sleep_goal_min int not null default 480 check (sleep_goal_min between 240 and 720),
  created_at timestamptz not null default now()
);

-- ---------- quests (tasks) ----------
create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  kind       text not null default 'side' check (kind in ('main','side','daily','job')),
  due_on     date,
  done       boolean not null default false,
  done_on    date,             -- for daily quests: the last day it was completed
  created_at timestamptz not null default now()
);

-- ---------- library (books) ----------
create table public.books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  author      text,
  isbn        text check (isbn is null or isbn ~ '^[0-9]{9}[0-9X]$|^[0-9]{13}$'),
  cover_url   text check (cover_url is null or cover_url ~ '^https://'),
  status      text not null default 'queued' check (status in ('queued','reading','finished')),
  pages_total int check (pages_total is null or pages_total > 0),
  pages_read  int not null default 0 check (pages_read >= 0),
  rating      smallint check (rating between 1 and 5),
  started_on  date,
  finished_on date,
  created_at  timestamptz not null default now()
);

-- ---------- journal (notes) ----------
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- scrolls (quotes) ----------
create table public.quotes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text       text not null check (char_length(text) between 1 and 1000),
  source     text,
  created_at timestamptz not null default now()
);

-- ---------- training (fitness) ----------
create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null default 'run' check (kind in ('run','strength','cardio','sport','other')),
  performed_on date not null default current_date,
  duration_min int not null default 0 check (duration_min between 0 and 1440),
  distance_km  numeric(6,2) check (distance_km is null or distance_km >= 0),
  notes        text,
  created_at   timestamptz not null default now()
);

-- ---------- prayer ----------
create table public.prayer_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prayed_on  date not null,
  prayer     text not null check (prayer in ('fajr','dhuhr','asr','maghrib','isha','awrad')),
  created_at timestamptz not null default now(),
  unique (user_id, prayed_on, prayer)
);

-- ---------- hobbies ----------
create table public.hobbies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.hobby_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hobby_id     uuid not null,
  session_on   date not null default current_date,
  duration_min int not null default 0 check (duration_min between 0 and 1440),
  note         text,
  created_at   timestamptz not null default now(),
  foreign key (hobby_id, user_id) references public.hobbies(id, user_id) on delete cascade
);
create index on public.hobby_sessions (hobby_id);

-- ---------- experience ----------
create table public.xp_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  stat       text not null check (stat in ('STR','DEX','INT','WIS','CHA','FTH','WLT','RST')),
  amount     int not null check (amount between 0 and 1000),
  source     text not null,
  source_id  text not null,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

-- ---------- finance ----------
create table public.finance_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  kind       text not null check (kind in ('expense','income')),
  budget     numeric(12,2) check (budget is null or budget > 0),   -- monthly
  created_at timestamptz not null default now(),
  unique (user_id, kind, name),
  unique (id, user_id)
);

create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('expense','income')),
  amount      numeric(12,2) not null check (amount > 0),
  category_id uuid,
  occurred_on date not null default current_date,
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  -- a category can only be one of your own; deleting it keeps the entry as uncategorised
  foreign key (category_id, user_id) references public.finance_categories(id, user_id) on delete set null (category_id)
);
create index on public.transactions (user_id, occurred_on);
create index on public.transactions (category_id);

create table public.savings_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  target     numeric(12,2) not null check (target > 0),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.savings_contributions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id    uuid not null,
  amount     numeric(12,2) not null check (amount <> 0),           -- negative = withdrawal
  made_on    date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.savings_goals(id, user_id) on delete cascade
);
create index on public.savings_contributions (goal_id);

-- Row-level security: every table is readable/writable only by its owner.
do $$
declare t text;
begin
  foreach t in array array['profiles','tasks','books','notes','quotes','workouts',
                           'prayer_logs','hobbies','hobby_sessions','xp_events',
                           'finance_categories','transactions','savings_goals','savings_contributions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid()))
                    with check (user_id = (select auth.uid()))', t);
    execute format('create index on public.%I (user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- XP per stat, computed in the database (RLS still applies via security_invoker)
create view public.stat_totals with (security_invoker = true) as
  select user_id, stat, sum(amount)::int as xp
  from public.xp_events
  group by user_id, stat;

grant select on public.stat_totals to authenticated;

-- ---------- abuse limits ----------
-- Size limits on free text
alter table public.notes          add constraint notes_title_len    check (char_length(title) <= 120),
                                  add constraint notes_body_len     check (char_length(body) <= 20000);
alter table public.quotes         add constraint quotes_source_len  check (source is null or char_length(source) <= 120);
alter table public.books          add constraint books_author_len   check (author is null or char_length(author) <= 120),
                                  add constraint books_cover_len    check (cover_url is null or char_length(cover_url) <= 500);
alter table public.workouts       add constraint workouts_notes_len check (notes is null or char_length(notes) <= 200);
alter table public.hobby_sessions add constraint hobby_note_len     check (note is null or char_length(note) <= 200);
alter table public.xp_events      add constraint xp_source_len      check (char_length(source) <= 32),
                                  add constraint xp_source_id_len   check (char_length(source_id) <= 80);

-- Per-person row caps + at most 60 new rows per table per minute
create or replace function public.enforce_row_limits()
returns trigger language plpgsql set search_path = '' as $$
declare cap int := TG_ARGV[0]::int; per_minute int := 60; total int; recent int;
begin
  execute format('select count(*), count(*) filter (where created_at > now() - interval ''1 minute'') from %I.%I where user_id = $1',
                 TG_TABLE_SCHEMA, TG_TABLE_NAME) into total, recent using new.user_id;
  if total >= cap then
    raise exception 'Limit reached: % % at most. Delete some old ones to add more.', to_char(cap, 'FM999,999'), TG_ARGV[1] using errcode = 'P0001';
  end if;
  if recent >= per_minute then
    raise exception 'Too many changes at once. Wait a minute and try again.' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('tasks', 5000, 'tasks'), ('books', 2000, 'books'), ('notes', 2000, 'notes'),
    ('quotes', 2000, 'quotes'), ('workouts', 10000, 'workouts'), ('prayer_logs', 25000, 'prayer entries'),
    ('hobbies', 100, 'hobbies'), ('hobby_sessions', 10000, 'hobby sessions'), ('xp_events', 60000, 'XP entries'),
    ('finance_categories', 100, 'categories'), ('transactions', 20000, 'finance entries'),
    ('savings_goals', 50, 'savings goals'), ('savings_contributions', 10000, 'savings entries')
  ) as t(tbl, cap, label) loop
    execute format('create trigger row_limits before insert on public.%I for each row execute function public.enforce_row_limits(%L, %L)', r.tbl, r.cap, r.label);
    execute format('create index if not exists %I on public.%I (user_id, created_at)', r.tbl || '_user_created_idx', r.tbl);
  end loop;
end $$;

-- Notes: at most 2,000,000 characters in total per person
create or replace function public.enforce_notes_total()
returns trigger language plpgsql set search_path = '' as $$
declare used bigint;
begin
  select coalesce(sum(char_length(title) + char_length(body)), 0) into used
  from public.notes where user_id = new.user_id and id is distinct from new.id;
  if used + char_length(new.title) + char_length(new.body) > 2000000 then
    raise exception 'Notes are full (2 million characters in total). Delete some old notes to make room.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger notes_total before insert or update of title, body on public.notes
  for each row execute function public.enforce_notes_total();

revoke all on function public.enforce_row_limits() from public, anon, authenticated;
revoke all on function public.enforce_notes_total() from public, anon, authenticated;

-- ---------- comics ----------
create table public.comics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),       -- series or book title
  issue      text check (issue is null or char_length(issue) <= 20),          -- "12", "Vol. 3"
  publisher  text check (publisher is null or char_length(publisher) <= 120),
  format     text not null default 'issue' check (format in ('issue','trade','manga','graphic_novel','omnibus')),
  status     text not null default 'queued' check (status in ('queued','reading','read')),
  owned      boolean not null default true,
  barcode    text check (barcode is null or barcode ~ '^[0-9X]{8,18}$'),
  cover_url  text check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 500)),
  rating     smallint check (rating between 1 and 5),
  read_on    date,
  created_at timestamptz not null default now()
);
alter table public.comics enable row level security;
create policy "own rows" on public.comics for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index on public.comics (user_id);
create index comics_user_created_idx on public.comics (user_id, created_at);
create index on public.comics (user_id, barcode);
grant select, insert, update, delete on public.comics to authenticated;
create trigger row_limits before insert on public.comics
  for each row execute function public.enforce_row_limits('10000', 'comics');

-- ---------- sleep ----------
create table public.sleep_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slept_on     date not null,                                   -- the morning you woke up
  bed_time     time not null,
  wake_time    time not null,
  duration_min int not null check (duration_min between 1 and 1440),
  quality      smallint check (quality between 1 and 5),
  note         text check (note is null or char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  unique (user_id, slept_on)
);
alter table public.sleep_logs enable row level security;
create policy "own rows" on public.sleep_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index on public.sleep_logs (user_id);
create index sleep_logs_user_created_idx on public.sleep_logs (user_id, created_at);
grant select, insert, update, delete on public.sleep_logs to authenticated;
create trigger row_limits before insert on public.sleep_logs
  for each row execute function public.enforce_row_limits('10000', 'sleep entries');


-- =====================================================================
-- 2026-10-19 · Goals, Learning, Clients, MTG, Mood, People, Watchlist, Sadaqah
-- (also in supabase/migrations/2026-10-19_more_sections.sql)
-- =====================================================================

-- ---------- goals ----------
create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  why         text check (why is null or char_length(why) <= 300),
  target_date date,
  status      text not null default 'active' check (status in ('active','done','dropped')),
  done_on     date,
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);
create table public.goal_milestones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id    uuid not null,
  title      text not null check (char_length(title) between 1 and 120),
  done       boolean not null default false,
  done_on    date,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete cascade
);
create index on public.goal_milestones (goal_id);

-- ---------- learning ----------
create table public.learning_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  kind         text not null default 'course' check (kind in ('course','certification','skill','other')),
  provider     text check (provider is null or char_length(provider) <= 120),
  status       text not null default 'active' check (status in ('active','paused','done')),
  target_hours int check (target_hours is null or target_hours between 1 and 10000),
  done_on      date,
  created_at   timestamptz not null default now(),
  unique (id, user_id)
);
create table public.learning_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id      uuid not null,
  session_on   date not null default current_date,
  duration_min int not null check (duration_min between 1 and 1440),
  note         text check (note is null or char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  foreign key (item_id, user_id) references public.learning_items(id, user_id) on delete cascade
);
create index on public.learning_sessions (item_id);

-- ---------- clients (side-gig pipeline) ----------
create table public.client_projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client     text not null check (char_length(client) between 1 and 120),
  title      text not null check (char_length(title) between 1 and 160),
  stage      text not null default 'lead' check (stage in ('lead','quoted','active','done','paid','lost')),
  value      numeric(12,2) check (value is null or value >= 0),
  due_on     date,
  note       text check (note is null or char_length(note) <= 500),
  paid_on    date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- MTG ----------
create table public.mtg_decks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  commander  text check (commander is null or char_length(commander) <= 160),
  format     text not null default 'commander' check (format in ('commander','standard','modern','pioneer','pauper','limited','other')),
  colors     text not null default '' check (colors ~ '^W?U?B?R?G?$'),
  art_url    text check (art_url is null or (art_url ~ '^https://' and char_length(art_url) <= 500)),
  decklist   text check (decklist is null or char_length(decklist) <= 20000),   -- pasted list, e.g. '1 Sol Ring'
  retired    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create table public.mtg_matches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deck_id    uuid not null,
  played_on  date not null default current_date,
  result     text not null check (result in ('win','loss','draw')),
  players    smallint not null default 4 check (players between 2 and 8),
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  foreign key (deck_id, user_id) references public.mtg_decks(id, user_id) on delete cascade
);
create index on public.mtg_matches (deck_id);

-- ---------- mood & gratitude ----------
create table public.moods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  logged_on  date not null,
  mood       smallint not null check (mood between 1 and 5),
  gratitude  text check (gratitude is null or char_length(gratitude) <= 300),
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);

-- ---------- people (keep in touch) ----------
create table public.contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  relation   text check (relation is null or char_length(relation) <= 60),
  every_days int not null default 30 check (every_days between 1 and 365),
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create table public.contact_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id   uuid not null,
  contacted_on date not null default current_date,
  how          text not null default 'message' check (how in ('call','visit','message','other')),
  note         text check (note is null or char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts(id, user_id) on delete cascade
);
create index on public.contact_logs (contact_id);

-- ---------- watchlist ----------
create table public.watchlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  kind       text not null default 'film' check (kind in ('film','series','anime','documentary','other')),
  status     text not null default 'queued' check (status in ('queued','watching','done')),
  rating     smallint check (rating between 1 and 5),
  note       text check (note is null or char_length(note) <= 200),
  done_on    date,
  created_at timestamptz not null default now()
);

-- ---------- RLS, indexes, grants, limits for all new tables ----------
do $$
declare r record;
begin
  for r in select * from (values
    ('goals', 200, 'goals'), ('goal_milestones', 5000, 'milestones'),
    ('learning_items', 500, 'learning items'), ('learning_sessions', 20000, 'learning sessions'),
    ('client_projects', 5000, 'client projects'),
    ('mtg_decks', 300, 'decks'), ('mtg_matches', 20000, 'matches'),
    ('moods', 10000, 'mood check-ins'),
    ('contacts', 300, 'people'), ('contact_logs', 20000, 'catch-ups'),
    ('watchlist', 5000, 'watchlist items')
  ) as t(tbl, cap, label) loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', r.tbl);
    execute format('create index on public.%I (user_id)', r.tbl);
    execute format('create index if not exists %I on public.%I (user_id, created_at)', r.tbl || '_user_created_idx', r.tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tbl);
    execute format('create trigger row_limits before insert on public.%I for each row execute function public.enforce_row_limits(%L, %L)', r.tbl, r.cap, r.label);
  end loop;
end $$;

-- ---------- Sadaqah lives in Finance as its own kind of entry ----------
alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check (kind in ('expense','income','sadaqah'));

-- ---------- new stat + sections ----------
alter table public.xp_events drop constraint xp_events_stat_check;
alter table public.xp_events add constraint xp_events_stat_check check (stat in ('STR','DEX','INT','WIS','CHA','FTH','WLT','RST','CON'));

alter table public.profiles drop constraint profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@
  array['tasks','goals','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes','hobbies','mtg','watchlist','people','finance']::text[]);

-- 2026-10-19 · Themes
alter table public.profiles add column if not exists theme text not null default 'midnight'
  check (theme in ('midnight','ocean','forest','plum','paper','blush','lavender','sand'));

-- 2026-10-19 · Watchlist details from TMDB
alter table public.watchlist
  add column if not exists tmdb_id int check (tmdb_id is null or tmdb_id > 0),
  add column if not exists tmdb_type text check (tmdb_type is null or tmdb_type in ('movie','tv')),
  add column if not exists imdb_id text check (imdb_id is null or imdb_id ~ '^tt[0-9]{5,10}$'),
  add column if not exists year smallint check (year is null or year between 1870 and 2100),
  add column if not exists poster_url text check (poster_url is null or (poster_url ~ '^https://image\.tmdb\.org/' and char_length(poster_url) <= 300)),
  add column if not exists details text check (details is null or char_length(details) <= 200),
  add column if not exists overview text check (overview is null or char_length(overview) <= 700);

-- 2026-10-20 · Music
create table public.albums (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  artist      text check (artist is null or char_length(artist) <= 200),
  year        smallint check (year is null or year between 1900 and 2100),
  tracks      smallint check (tracks is null or tracks between 1 and 500),
  genre       text check (genre is null or char_length(genre) <= 60),
  art_url     text check (art_url is null or (art_url ~ '^https://' and char_length(art_url) <= 400)),
  itunes_id   bigint check (itunes_id is null or itunes_id > 0),
  apple_url   text check (apple_url is null or (apple_url ~ '^https://(music|itunes)\.apple\.com/' and char_length(apple_url) <= 400)),
  status      text not null default 'want' check (status in ('want','listened')),
  listened_on date,
  rating      smallint check (rating between 1 and 5),
  note        text check (note is null or char_length(note) <= 200),
  created_at  timestamptz not null default now()
);
alter table public.albums enable row level security;
create policy "own rows" on public.albums for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index on public.albums (user_id);
create index albums_user_created_idx on public.albums (user_id, created_at);
grant select, insert, update, delete on public.albums to authenticated;
create trigger row_limits before insert on public.albums for each row execute function public.enforce_row_limits('5000', 'albums');
alter table public.profiles add column if not exists lastfm_user text
  check (lastfm_user is null or lastfm_user ~ '^[A-Za-z][A-Za-z0-9_-]{1,14}$');
alter table public.profiles drop constraint profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@
  array['tasks','goals','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes','hobbies','mtg','watchlist','music','people','finance']::text[]);

-- 2026-10-20 · More themes
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (theme in
  ('midnight','ocean','forest','plum','dusk','paper','sand','blush','lavender','peach','mint','sky','butter','candy','sage'));

-- ---------- 1.23: repeating tasks and tasks linked to a goal ----------
alter table public.tasks
  add column if not exists repeat text check (repeat is null or repeat in ('weekly','fortnightly','monthly','yearly')),
  add column if not exists goal_id uuid;
alter table public.tasks drop constraint if exists tasks_goal_fk;
alter table public.tasks add constraint tasks_goal_fk
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete set null (goal_id);
alter table public.tasks drop constraint if exists tasks_repeat_kind;
alter table public.tasks add constraint tasks_repeat_kind check (repeat is null or kind <> 'daily');
create index if not exists tasks_goal_idx on public.tasks(goal_id) where goal_id is not null;

-- ---------- 1.25: shared projects ----------
-- Everything else in Life Quest is private to its owner. Projects are the one place
-- other people can see your rows: only members of a project can read it, only
-- owners and editors can write to it, and you join only through an invite link.

alter table public.profiles drop constraint if exists profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@ array[
  'tasks','goals','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes',
  'hobbies','mtg','watchlist','music','people','finance','projects']::text[]);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  currency    text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  created_at  timestamptz not null default now()
);

create table public.project_members (
  project_id   uuid not null references public.projects(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'editor' check (role in ('owner','editor','viewer')),
  display_name text not null default 'Member' check (char_length(display_name) between 1 and 24),
  joined_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_invites (
  token      text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  project_id uuid not null references public.projects(id) on delete cascade,
  role       text not null default 'editor' check (role in ('editor','viewer')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create index project_invites_project_idx on public.project_invites (project_id);

create table public.project_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  author_id   uuid default auth.uid() references auth.users(id) on delete set null,
  author_name text not null default 'Member' check (char_length(author_name) <= 24),
  kind        text not null check (kind in ('task','note','expense')),
  title       text not null check (char_length(title) between 1 and 200),
  body        text check (body is null or char_length(body) <= 5000),
  amount      numeric(12,2) check (amount is null or amount > 0),
  paid_by     uuid references auth.users(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  due_on      date,
  done        boolean not null default false,
  done_by     uuid references auth.users(id) on delete set null,
  done_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (kind <> 'expense' or amount is not null)
);
create index project_entries_project_idx on public.project_entries (project_id, created_at);
create index project_entries_author_idx on public.project_entries (author_id, created_at);

-- ---------- membership helpers (security definer so policies don't recurse) ----------
create or replace function public.project_role(p uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.project_members where project_id = p and user_id = auth.uid()
$$;
create or replace function public.member_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(nullif(trim(hero_name), 'HERO'), 'You'), 'Member') from public.profiles where user_id = auth.uid()
$$;
revoke all on function public.project_role(uuid) from public, anon;
revoke all on function public.member_name() from public, anon;
grant execute on function public.project_role(uuid) to authenticated;

-- The person who creates a project becomes its owner. Caps: 50 projects owned, 100 joined.
create or replace function public.projects_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.owner_id := auth.uid();
  if (select count(*) from public.projects where owner_id = new.owner_id) >= 50 then
    raise exception 'Limit reached: 50 projects at most.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.projects where owner_id = new.owner_id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Too many changes at once. Wait a minute and try again.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger projects_before_insert before insert on public.projects
  for each row execute function public.projects_before_insert();

create or replace function public.projects_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members (project_id, user_id, role, display_name)
  values (new.id, new.owner_id, 'owner', coalesce(public.member_name(), 'Owner'));
  return new;
end $$;
create trigger projects_after_insert after insert on public.projects
  for each row execute function public.projects_after_insert();

-- The owner can't be changed by editing the row.
create or replace function public.projects_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.owner_id := old.owner_id; new.created_at := old.created_at;
  return new;
end $$;
create trigger projects_before_update before update on public.projects
  for each row execute function public.projects_before_update();

-- Members: only role can be changed, by the owner, and never to/from owner.
create or replace function public.members_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.role = 'owner' or new.role = 'owner' then
    raise exception 'The owner''s role can''t be changed.' using errcode = 'P0001';
  end if;
  new.project_id := old.project_id; new.user_id := old.user_id; new.joined_at := old.joined_at;
  return new;
end $$;
create trigger members_before_update before update on public.project_members
  for each row execute function public.members_before_update();

-- Invites: at most 20 live links per project.
create or replace function public.invites_before_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.expires_at := least(coalesce(new.expires_at, now() + interval '7 days'), now() + interval '30 days');
  if (select count(*) from public.project_invites where project_id = new.project_id and expires_at > now()) >= 20 then
    raise exception 'Too many invite links. Delete an old one first.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger invites_before_insert before insert on public.project_invites
  for each row execute function public.invites_before_insert();

-- Entries: the server fills in who wrote it and who ticked it; people named must be members.
create or replace function public.entries_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.author_id := uid;
    new.author_name := coalesce((select display_name from public.project_members where project_id = new.project_id and user_id = uid), 'Member');
    new.created_at := now();
    if (select count(*) from public.project_entries where project_id = new.project_id) >= 5000 then
      raise exception 'This project is full (5,000 entries). Remove some old ones to add more.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.project_entries where author_id = uid and created_at > now() - interval '1 minute') >= 60 then
      raise exception 'Too many changes at once. Wait a minute and try again.' using errcode = 'P0001';
    end if;
  else
    new.project_id := old.project_id; new.author_id := old.author_id; new.author_name := old.author_name;
    new.created_at := old.created_at; new.kind := old.kind;
  end if;
  if new.assignee_id is not null and not exists (select 1 from public.project_members where project_id = new.project_id and user_id = new.assignee_id) then
    raise exception 'That person isn''t in this project.' using errcode = 'P0001';
  end if;
  if new.paid_by is not null and not exists (select 1 from public.project_members where project_id = new.project_id and user_id = new.paid_by) then
    raise exception 'That person isn''t in this project.' using errcode = 'P0001';
  end if;
  if new.kind <> 'task' then new.done := false; new.assignee_id := null; new.due_on := null; end if;
  if new.kind <> 'expense' then new.amount := null; new.paid_by := null; end if;
  if not new.done then
    new.done_by := null; new.done_on := null;
  elsif tg_op = 'INSERT' then
    new.done_by := uid; new.done_on := current_date;
  elsif not old.done then
    new.done_by := uid; new.done_on := current_date;
  else
    new.done_by := old.done_by; new.done_on := old.done_on;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger entries_guard before insert or update on public.project_entries
  for each row execute function public.entries_guard();

-- Your name in projects follows your Life Quest name.
create or replace function public.profiles_sync_member_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.hero_name is distinct from old.hero_name then
    update public.project_members
       set display_name = coalesce(nullif(nullif(trim(new.hero_name), 'HERO'), 'You'), 'Member')
     where user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger profiles_sync_member_name after update of hero_name on public.profiles
  for each row execute function public.profiles_sync_member_name();

-- ---------- joining by invite link ----------
create or replace function public.invite_info(p_token text)
returns table (project_id uuid, name text, members int, role text, already boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'P0001'; end if;
  return query
    select p.id, p.name, (select count(*)::int from public.project_members m where m.project_id = p.id), i.role,
           exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = auth.uid())
      from public.project_invites i join public.projects p on p.id = i.project_id
     where i.token = p_token and i.expires_at > now();
end $$;

create or replace function public.join_project(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.project_invites; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.' using errcode = 'P0001'; end if;
  select * into inv from public.project_invites where token = p_token and expires_at > now();
  if not found then raise exception 'This invite link has expired or isn''t valid. Ask for a new one.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.project_members where project_id = inv.project_id and user_id = uid) then return inv.project_id; end if;
  if (select count(*) from public.project_members where project_id = inv.project_id) >= 50 then
    raise exception 'This project is full (50 people).' using errcode = 'P0001';
  end if;
  if (select count(*) from public.project_members where user_id = uid) >= 100 then
    raise exception 'You''re in 100 projects already. Leave one to join another.' using errcode = 'P0001';
  end if;
  insert into public.project_members (project_id, user_id, role, display_name)
  values (inv.project_id, uid, inv.role, coalesce(public.member_name(), 'Member'));
  return inv.project_id;
end $$;
revoke all on function public.invite_info(text) from public, anon;
revoke all on function public.join_project(text) from public, anon;
grant execute on function public.invite_info(text) to authenticated;
grant execute on function public.join_project(text) to authenticated;
revoke all on function public.member_name() from authenticated;
revoke all on function public.projects_before_insert() from public, anon, authenticated;
revoke all on function public.projects_after_insert() from public, anon, authenticated;
revoke all on function public.entries_guard() from public, anon, authenticated;
revoke all on function public.profiles_sync_member_name() from public, anon, authenticated;

-- ---------- row level security ----------
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.project_entries enable row level security;

create policy "members read" on public.projects for select to authenticated
  using (owner_id = (select auth.uid()) or public.project_role(id) is not null);
create policy "create own" on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "owner edits" on public.projects for update to authenticated
  using (public.project_role(id) = 'owner') with check (public.project_role(id) = 'owner');
create policy "owner deletes" on public.projects for delete to authenticated
  using (public.project_role(id) = 'owner');

create policy "members read" on public.project_members for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "owner sets roles" on public.project_members for update to authenticated
  using (public.project_role(project_id) = 'owner' and user_id <> (select auth.uid()))
  with check (role in ('editor','viewer'));
create policy "leave or remove" on public.project_members for delete to authenticated
  using ((user_id = (select auth.uid()) and role <> 'owner')
      or (public.project_role(project_id) = 'owner' and user_id <> (select auth.uid())));

create policy "owner reads invites" on public.project_invites for select to authenticated
  using (public.project_role(project_id) = 'owner');
create policy "owner makes invites" on public.project_invites for insert to authenticated
  with check (public.project_role(project_id) = 'owner');
create policy "owner removes invites" on public.project_invites for delete to authenticated
  using (public.project_role(project_id) = 'owner');

create policy "members read" on public.project_entries for select to authenticated
  using (public.project_role(project_id) is not null);
create policy "editors add" on public.project_entries for insert to authenticated
  with check (public.project_role(project_id) in ('owner','editor'));
create policy "editors change" on public.project_entries for update to authenticated
  using (public.project_role(project_id) in ('owner','editor'))
  with check (public.project_role(project_id) in ('owner','editor'));
create policy "author or owner deletes" on public.project_entries for delete to authenticated
  using ((author_id = (select auth.uid()) and public.project_role(project_id) in ('owner','editor'))
      or public.project_role(project_id) = 'owner');

grant select, insert, update, delete on public.projects, public.project_entries, public.project_invites to authenticated;
grant select, delete on public.project_members to authenticated;
grant update (role) on public.project_members to authenticated;

-- Live updates for people looking at the same project.
alter publication supabase_realtime add table public.project_entries, public.project_members, public.projects;

-- ---------- 1.26: calendar ----------
alter table public.profiles drop constraint if exists profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@ array[
  'tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes',
  'hobbies','mtg','watchlist','music','people','finance']::text[]);
create table public.calendar_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  starts_on  date not null,
  ends_on    date,
  start_time time,
  end_time   time,
  repeat     text check (repeat is null or repeat in ('weekly','fortnightly','monthly','yearly')),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (end_time is null or start_time is not null)
);
alter table public.calendar_events enable row level security;
create policy "own rows" on public.calendar_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index calendar_events_user_idx on public.calendar_events (user_id, starts_on);
create trigger row_limits before insert on public.calendar_events
  for each row execute function public.enforce_row_limits('5000', 'calendar events');
grant all on public.calendar_events to authenticated;
revoke truncate, references, trigger on public.calendar_events from authenticated;
revoke all on public.calendar_events from anon;
-- Private calendar links, read through /api/ics (functions/api/ics.js)
alter table public.profiles add column if not exists calendar_feeds jsonb not null default '[]'::jsonb
  check (jsonb_typeof(calendar_feeds) = 'array' and jsonb_array_length(calendar_feeds) <= 5 and pg_column_size(calendar_feeds) < 4000);

-- ---------- 1.28: "Every day" repeat ----------
alter table public.tasks drop constraint if exists tasks_repeat_check;
alter table public.tasks add constraint tasks_repeat_check check (repeat is null or repeat in ('daily','weekly','fortnightly','monthly','yearly'));
alter table public.calendar_events drop constraint if exists calendar_events_repeat_check;
alter table public.calendar_events add constraint calendar_events_repeat_check check (repeat is null or repeat in ('daily','weekly','fortnightly','monthly','yearly'));

-- ---------- 1.29: feedback ----------
create table public.app_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.app_admins enable row level security;
-- (the maker's account id is inserted here by hand)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  kind        text not null default 'idea' check (kind in ('bug','idea','other')),
  message     text not null check (char_length(message) between 3 and 2000),
  reply_to    text check (reply_to is null or char_length(reply_to) <= 254),
  sender_name text check (sender_name is null or char_length(sender_name) <= 24),
  app_version text check (app_version is null or char_length(app_version) <= 12),
  device      text check (device is null or char_length(device) <= 120),
  page        text check (page is null or char_length(page) <= 40),
  status      text not null default 'new' check (status in ('new','read','done')),
  created_at  timestamptz not null default now()
);
create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_user_idx on public.feedback (user_id, created_at);
alter table public.feedback enable row level security;
create or replace function public.feedback_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); want_reply boolean := new.reply_to is not null;
begin
  new.user_id := uid; new.status := 'new'; new.created_at := now();
  new.sender_name := (select hero_name from public.profiles where user_id = uid);
  new.reply_to := case when want_reply then (select email from auth.users where id = uid) end;
  if (select count(*) from public.feedback where user_id = uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Thanks! That''s a lot of feedback in one hour. Please try again a bit later.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.feedback where user_id = uid) >= 500 then
    raise exception 'Feedback limit reached.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger feedback_before_insert before insert on public.feedback for each row execute function public.feedback_before_insert();
revoke all on function public.feedback_before_insert() from public, anon, authenticated;
create or replace function public.feedback_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := old.id; new.user_id := old.user_id; new.kind := old.kind; new.message := old.message; new.reply_to := old.reply_to;
  new.sender_name := old.sender_name; new.app_version := old.app_version; new.device := old.device; new.page := old.page; new.created_at := old.created_at;
  return new;
end $$;
create trigger feedback_before_update before update on public.feedback for each row execute function public.feedback_before_update();
create policy "send own" on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy "see own or admin" on public.feedback for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "admin marks" on public.feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert on public.feedback to authenticated;
grant update (status) on public.feedback to authenticated;
revoke all on public.feedback from anon;
revoke all on public.app_admins from anon, authenticated;

-- ---------- 1.30: project photos ----------
alter table public.project_entries drop constraint if exists project_entries_kind_check;
alter table public.project_entries add constraint project_entries_kind_check check (kind in ('task','note','expense','photo'));
alter table public.project_entries add column if not exists photo_path text
  check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp|png)$');
create or replace function public.photo_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'photo' then
    if new.photo_path is null or split_part(new.photo_path, '/', 1) <> new.project_id::text then
      raise exception 'Photo is missing.' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' then
      if (select count(*) from public.project_entries where project_id = new.project_id and kind = 'photo') >= 300 then
        raise exception 'This project has 300 photos, the most it can hold. Remove some to add more.' using errcode = 'P0001';
      end if;
      if (select count(*) from public.project_entries where author_id = auth.uid() and kind = 'photo') >= 500 then
        raise exception 'You''ve added 500 photos across your projects, the most allowed. Remove some to add more.' using errcode = 'P0001';
      end if;
    else
      new.photo_path := old.photo_path;
    end if;
  else
    new.photo_path := null;
  end if;
  return new;
end $$;
create trigger photo_guard before insert or update on public.project_entries for each row execute function public.photo_guard();
revoke all on function public.photo_guard() from public, anon, authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-photos', 'project-photos', false, 3145728, array['image/jpeg','image/webp','image/png']) on conflict (id) do nothing;
create or replace function public.photo_role(object_name text)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.project_members where project_id::text = split_part(object_name, '/', 1) and user_id = auth.uid()
$$;
revoke all on function public.photo_role(text) from public, anon;
grant execute on function public.photo_role(text) to authenticated;
create policy "project members see photos" on storage.objects for select to authenticated
  using (bucket_id = 'project-photos' and public.photo_role(name) is not null);
create policy "project editors add photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-photos' and public.photo_role(name) in ('owner','editor'));
create policy "photo owner or uploader removes" on storage.objects for delete to authenticated
  using (bucket_id = 'project-photos' and (public.photo_role(name) = 'owner'
         or (owner_id = (select auth.uid())::text and public.photo_role(name) = 'editor')));

-- ---------- 1.33: episode tracking, task notes ----------
alter table public.watchlist
  add column if not exists season  smallint check (season is null or season between 0 and 200),
  add column if not exists episode smallint check (episode is null or episode between 0 and 5000);
alter table public.tasks
  add column if not exists note text check (note is null or char_length(note) <= 1000);

-- ---------- 1.34: which new-section pop-ups someone has seen ----------
alter table public.profiles add column if not exists seen_intros text[]
  check (seen_intros is null or (cardinality(seen_intros) <= 100 and seen_intros <@ array[
    'tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes',
    'hobbies','mtg','watchlist','music','people','finance']::text[]));
-- (when adding a section, add its id here and to profiles_sections_check)

-- ---------- 1.34: comments and reactions on shared notes ----------
create table public.project_comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  entry_id    uuid not null references public.project_entries(id) on delete cascade,
  author_id   uuid default auth.uid() references auth.users(id) on delete set null,
  author_name text not null default 'Member' check (char_length(author_name) <= 24),
  body        text not null check (char_length(body) <= 1000),
  removed     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index project_comments_entry_idx on public.project_comments (project_id, entry_id, created_at);
create index project_comments_author_idx on public.project_comments (author_id, created_at);
create table public.project_reactions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_id   uuid not null references public.project_entries(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji      text not null check (emoji in ('👍','❤️','😂','🎉','🙏','👀')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (entry_id, user_id, emoji)
);
create index project_reactions_project_idx on public.project_reactions (project_id, entry_id);
-- comments_guard(): sets author, checks the note is in the project, 500 per note, 30/min; updates may only "remove" (text wiped).
-- reactions_guard(): sets user, checks the note is in the project; updates may only toggle `active`.
-- (full function bodies as applied in migration project_comments_reactions)
alter table public.project_comments enable row level security;
alter table public.project_reactions enable row level security;
create policy "members read" on public.project_comments for select to authenticated using (public.project_role(project_id) is not null);
create policy "editors comment" on public.project_comments for insert to authenticated with check (public.project_role(project_id) in ('owner','editor'));
create policy "author or owner removes" on public.project_comments for update to authenticated
  using (author_id = (select auth.uid()) or public.project_role(project_id) = 'owner') with check (public.project_role(project_id) is not null);
create policy "members read" on public.project_reactions for select to authenticated using (public.project_role(project_id) is not null);
create policy "members react" on public.project_reactions for insert to authenticated with check (public.project_role(project_id) is not null);
create policy "own reactions" on public.project_reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.project_role(project_id) is not null);
grant select, insert on public.project_comments, public.project_reactions to authenticated;
grant update (removed) on public.project_comments to authenticated;
grant update (active) on public.project_reactions to authenticated;
alter publication supabase_realtime add table public.project_comments, public.project_reactions;
-- ---------- 1.34: chess ----------
alter table public.profiles drop constraint if exists profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@ array[
  'tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes',
  'hobbies','chess','mtg','watchlist','music','people','finance']::text[]);
alter table public.profiles drop constraint if exists profiles_seen_intros_check;
alter table public.profiles add constraint profiles_seen_intros_check check (seen_intros is null or (cardinality(seen_intros) <= 100 and seen_intros <@ array[
  'tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes',
  'hobbies','chess','mtg','watchlist','music','people','finance']::text[]));

create table public.chess_games (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  level      smallint not null check (level between 1 and 5),
  color      text not null check (color in ('w','b')),
  result     text check (result is null or result in ('win','loss','draw')),
  ending     text check (ending is null or ending in ('checkmate','resigned','stalemate','repetition','insufficient','fifty','abandoned')),
  pgn        text not null default '' check (char_length(pgn) <= 20000),
  moves      smallint not null default 0 check (moves between 0 and 2000),
  ended_on   date,
  created_at timestamptz not null default now()
);
create table public.chess_puzzles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  puzzle_id  text not null check (char_length(puzzle_id) <= 12),
  rating     smallint check (rating is null or rating between 0 and 4000),
  solved     boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.chess_games enable row level security;
alter table public.chess_puzzles enable row level security;
create policy "own rows" on public.chess_games for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.chess_puzzles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index chess_games_user_idx on public.chess_games (user_id, created_at);
create index chess_puzzles_user_idx on public.chess_puzzles (user_id, day);
create trigger row_limits before insert on public.chess_games for each row execute function public.enforce_row_limits('5000', 'chess games');
create trigger row_limits before insert on public.chess_puzzles for each row execute function public.enforce_row_limits('5000', 'puzzles');
grant all on public.chess_games, public.chess_puzzles to authenticated;
revoke truncate, references, trigger on public.chess_games, public.chess_puzzles from authenticated;
revoke all on public.chess_games, public.chess_puzzles from anon;
-- ---------- 1.36: Games section (Chess moves inside) + Daily Word ----------
alter table public.profiles drop constraint if exists profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@ array[
  'tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes',
  'hobbies','games','chess','mtg','watchlist','music','people','finance']::text[]);
alter table public.profiles drop constraint if exists profiles_seen_intros_check;
alter table public.profiles add constraint profiles_seen_intros_check check (seen_intros is null or (cardinality(seen_intros) <= 100 and seen_intros <@ array[
  'tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes',
  'hobbies','games','chess','mtg','watchlist','music','people','finance']::text[]));
-- People who switched Chess on now have Games instead (and have seen it).
update public.profiles set sections = array_replace(sections, 'chess', 'games') where 'chess' = any(sections);
update public.profiles set seen_intros = array_append(seen_intros, 'games') where 'games' = any(sections) and not ('games' = any(coalesce(seen_intros, '{}')));

create table public.word_games (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  guesses    text[] not null default '{}' check (cardinality(guesses) <= 6 and array_to_string(guesses, '') ~ '^[a-z]*$'),
  solved     boolean not null default false,
  finished   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.word_games enable row level security;
create policy "own rows" on public.word_games for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index word_games_user_idx on public.word_games (user_id, day);
create trigger row_limits before insert on public.word_games for each row execute function public.enforce_row_limits('5000', 'daily words');
grant all on public.word_games to authenticated;
revoke truncate, references, trigger on public.word_games from authenticated;
revoke all on public.word_games from anon;

-- 1.37: Sudoku and Word Hive
create table public.sudoku_games (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  level      text not null check (level in ('easy', 'medium', 'hard')),
  cells      text not null check (cells ~ '^[0-9]{81}$'),
  notes      int[] not null default '{}' check (cardinality(notes) in (0, 81)),
  mistakes   int not null default 0 check (mistakes between 0 and 10000),
  seconds    int not null default 0 check (seconds between 0 and 864000),
  solved     boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, day, level)
);
alter table public.sudoku_games enable row level security;
create policy "own rows" on public.sudoku_games for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger row_limits before insert on public.sudoku_games for each row execute function public.enforce_row_limits('10000', 'sudoku puzzles');
grant all on public.sudoku_games to authenticated;
revoke truncate, references, trigger on public.sudoku_games from authenticated;
revoke all on public.sudoku_games from anon;

create table public.hive_games (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  words      text[] not null default '{}' check (cardinality(words) <= 400 and array_to_string(words, '') ~ '^[a-z]*$'),
  score      int not null default 0 check (score between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.hive_games enable row level security;
create policy "own rows" on public.hive_games for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger row_limits before insert on public.hive_games for each row execute function public.enforce_row_limits('5000', 'word hives');
grant all on public.hive_games to authenticated;
revoke truncate, references, trigger on public.hive_games from authenticated;
revoke all on public.hive_games from anon;

-- 1.38: Couple space. Built on shared projects: a couple is a project with kind 'couple' and at most two people.
alter table public.projects add column if not exists kind text not null default 'project' check (kind in ('project', 'couple'));
alter table public.projects add column if not exists together_since date check (together_since is null or together_since >= date '1900-01-01');
alter table public.project_entries add column if not exists yearly boolean not null default false;
alter table public.project_entries drop constraint if exists project_entries_kind_check;
alter table public.project_entries add constraint project_entries_kind_check
  check (kind in ('task', 'note', 'expense', 'photo', 'idea', 'memory', 'countdown', 'love', 'answer'));
create unique index if not exists project_entries_answer_once on public.project_entries (project_id, author_id, title) where kind = 'answer';

alter table public.profiles drop constraint if exists profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@ array['tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes','hobbies','games','chess','mtg','watchlist','music','people','finance','couple']);
alter table public.profiles drop constraint if exists profiles_seen_intros_check;
alter table public.profiles add constraint profiles_seen_intros_check check (seen_intros is null or (cardinality(seen_intros) <= 100 and seen_intros <@ array['tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes','hobbies','games','chess','mtg','watchlist','music','people','finance','couple']));

-- Is this user already in a couple space?
create or replace function public.in_couple(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members m join public.projects p on p.id = m.project_id where m.user_id = u and p.kind = 'couple')
$$;
revoke all on function public.in_couple(uuid) from public, anon, authenticated;

create or replace function public.projects_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.owner_id := auth.uid();
  if (select count(*) from public.projects where owner_id = new.owner_id) >= 50 then
    raise exception 'Limit reached: 50 projects at most.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.projects where owner_id = new.owner_id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Too many changes at once. Wait a minute and try again.' using errcode = 'P0001';
  end if;
  if new.kind = 'couple' and public.in_couple(new.owner_id) then
    raise exception 'You already have a couple space.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function public.projects_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.owner_id := old.owner_id; new.created_at := old.created_at; new.kind := old.kind;
  return new;
end $$;

-- Either partner can edit the couple space (name, date you got together).
alter policy "owner edits" on public.projects
  using (public.project_role(id) = 'owner' or (kind = 'couple' and public.project_role(id) = 'editor'))
  with check (public.project_role(id) = 'owner' or (kind = 'couple' and public.project_role(id) = 'editor'));

create or replace function public.join_project(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.project_invites; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.' using errcode = 'P0001'; end if;
  select * into inv from public.project_invites where token = p_token and expires_at > now();
  if not found then raise exception 'This invite link has expired or isn''t valid. Ask for a new one.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.project_members where project_id = inv.project_id and user_id = uid) then return inv.project_id; end if;
  if (select kind from public.projects where id = inv.project_id) = 'couple' then
    if (select count(*) from public.project_members where project_id = inv.project_id) >= 2 then
      raise exception 'This couple space already has two people.' using errcode = 'P0001';
    end if;
    if public.in_couple(uid) then
      raise exception 'You''re already in a couple space. Leave it first to join this one.' using errcode = 'P0001';
    end if;
    inv.role := 'editor';
  end if;
  if (select count(*) from public.project_members where project_id = inv.project_id) >= 50 then
    raise exception 'This project is full (50 people).' using errcode = 'P0001';
  end if;
  if (select count(*) from public.project_members where user_id = uid) >= 100 then
    raise exception 'You''re in 100 projects already. Leave one to join another.' using errcode = 'P0001';
  end if;
  insert into public.project_members (project_id, user_id, role, display_name)
  values (inv.project_id, uid, inv.role, coalesce(public.member_name(), 'Member'));
  return inv.project_id;
end $$;

-- Extra invite details (kept separate so invite_info keeps its shape).
create or replace function public.invite_kind(p_token text)
returns table (kind text, inviter text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'P0001'; end if;
  return query
    select p.kind, (select m.display_name from public.project_members m where m.project_id = p.id and m.user_id = i.created_by)
      from public.project_invites i join public.projects p on p.id = i.project_id
     where i.token = p_token and i.expires_at > now();
end $$;
revoke all on function public.invite_kind(text) from public, anon;
grant execute on function public.invite_kind(text) to authenticated;

-- Entries: rules for the couple kinds.
create or replace function public.entries_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); pkind text;
begin
  if tg_op = 'INSERT' then
    new.author_id := uid;
    new.author_name := coalesce((select display_name from public.project_members where project_id = new.project_id and user_id = uid), 'Member');
    new.created_at := now();
    if (select count(*) from public.project_entries where project_id = new.project_id) >= 5000 then
      raise exception 'This project is full (5,000 entries). Remove some old ones to add more.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.project_entries where author_id = uid and created_at > now() - interval '1 minute') >= 60 then
      raise exception 'Too many changes at once. Wait a minute and try again.' using errcode = 'P0001';
    end if;
  else
    new.project_id := old.project_id; new.author_id := old.author_id; new.author_name := old.author_name;
    new.created_at := old.created_at; new.kind := old.kind;
    -- Only the writer can change an answer or a note's words; a partner can only mark a note as read.
    if old.kind in ('answer', 'love') and uid is distinct from old.author_id then
      if old.kind = 'answer' then raise exception 'You can only change your own answer.' using errcode = 'P0001'; end if;
      new.title := old.title; new.body := old.body; new.assignee_id := old.assignee_id;
    end if;
    if old.kind = 'love' then new.assignee_id := old.assignee_id; end if;
  end if;
  if new.kind in ('idea', 'memory', 'countdown', 'love', 'answer') then
    select kind into pkind from public.projects where id = new.project_id;
    if pkind is distinct from 'couple' then raise exception 'That only works in a couple space.' using errcode = 'P0001'; end if;
  end if;
  if new.kind = 'answer' and new.title !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Answers belong to a day.' using errcode = 'P0001';
  end if;
  if new.kind = 'love' and (new.assignee_id is null or new.assignee_id = new.author_id) then
    raise exception 'Notes are for your partner.' using errcode = 'P0001';
  end if;
  if new.kind = 'countdown' and new.due_on is null then
    raise exception 'Pick a date for the countdown.' using errcode = 'P0001';
  end if;
  if new.assignee_id is not null and not exists (select 1 from public.project_members where project_id = new.project_id and user_id = new.assignee_id) then
    raise exception 'That person isn''t in this project.' using errcode = 'P0001';
  end if;
  if new.paid_by is not null and not exists (select 1 from public.project_members where project_id = new.project_id and user_id = new.paid_by) then
    raise exception 'That person isn''t in this project.' using errcode = 'P0001';
  end if;
  if new.kind not in ('task', 'love') then new.assignee_id := null; end if;
  if new.kind not in ('task', 'idea', 'love') then new.done := false; end if;
  if new.kind not in ('task', 'countdown', 'memory') then new.due_on := null; end if;
  if new.kind <> 'countdown' then new.yearly := false; end if;
  if new.kind <> 'expense' then new.amount := null; new.paid_by := null; end if;
  if not new.done then
    new.done_by := null; new.done_on := null;
  elsif tg_op = 'INSERT' then
    new.done_by := uid; new.done_on := current_date;
  elsif not old.done then
    new.done_by := uid; new.done_on := current_date;
  else
    new.done_by := old.done_by; new.done_on := old.done_on;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Photos: memories may have one too.
create or replace function public.photo_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'photo' or (new.kind = 'memory' and new.photo_path is not null) then
    if new.photo_path is null or split_part(new.photo_path, '/', 1) <> new.project_id::text then
      raise exception 'Photo is missing.' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' then
      if (select count(*) from public.project_entries where project_id = new.project_id and photo_path is not null) >= 300 then
        raise exception 'This space has 300 photos, the most it can hold. Remove some to add more.' using errcode = 'P0001';
      end if;
      if (select count(*) from public.project_entries where author_id = auth.uid() and photo_path is not null) >= 500 then
        raise exception 'You''ve added 500 photos across your projects, the most allowed. Remove some to add more.' using errcode = 'P0001';
      end if;
    else
      new.photo_path := old.photo_path;
    end if;
  elsif new.kind = 'memory' and tg_op = 'UPDATE' then
    new.photo_path := old.photo_path;
  else
    new.photo_path := null;
  end if;
  return new;
end $$;

-- Question of the day: you see your partner's answer only after giving yours.
create or replace function public.answered(p uuid, d text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_entries where project_id = p and kind = 'answer' and title = d and author_id = auth.uid())
$$;
revoke all on function public.answered(uuid, text) from public, anon;
grant execute on function public.answered(uuid, text) to authenticated;
alter policy "members read" on public.project_entries
  using (public.project_role(project_id) is not null and (kind <> 'answer' or author_id = (select auth.uid()) or public.answered(project_id, title)));

-- Who has answered a day's question (names only, never the words), so the app can say "your partner answered".
create or replace function public.answer_authors(p uuid, d text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select author_id from public.project_entries
   where project_id = p and kind = 'answer' and title = d and public.project_role(p) is not null
$$;
revoke all on function public.answer_authors(uuid, text) from public, anon;
grant execute on function public.answer_authors(uuid, text) to authenticated;

-- 1.39: Admin overview for the maker. Names and activity counts only, never anyone's entries or email.
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare res jsonb;
begin
  if not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  with u as (
    select au.id, au.created_at, au.email_confirmed_at is not null as confirmed,
           p.hero_name, p.sections,
           greatest(au.last_sign_in_at,
                    (select max(greatest(s.updated_at, s.refreshed_at::timestamptz)) from auth.sessions s where s.user_id = au.id),
                    (select max(x.created_at) from public.xp_events x where x.user_id = au.id)) as last_seen,
           (select count(*) from public.xp_events x where x.user_id = au.id and x.created_at > now() - interval '7 days') as xp7,
           (select coalesce(sum(x.amount), 0) from public.xp_events x where x.user_id = au.id) as xp_total
      from auth.users au left join public.profiles p on p.user_id = au.id
  )
  select jsonb_build_object(
    'total', (select count(*) from u),
    'confirmed', (select count(*) from u where confirmed),
    'active7', (select count(*) from u where last_seen > now() - interval '7 days'),
    'active1', (select count(*) from u where last_seen > now() - interval '1 day'),
    'new7', (select count(*) from u where created_at > now() - interval '7 days'),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
        'me', id = auth.uid(),
        'name', coalesce(nullif(trim(hero_name), ''), null),
        'joined', created_at, 'confirmed', confirmed, 'last_seen', last_seen,
        'xp7', xp7, 'xp_total', xp_total,
        'sections', case when sections is null then null else cardinality(sections) end)
        order by last_seen desc nulls last) from u), '[]'::jsonb),
    'sections', coalesce((select jsonb_object_agg(s, n) from (
        select s, count(*) as n from u, unnest(u.sections) s group by s) t), '{}'::jsonb),
    'not_set_up', (select count(*) from u where sections is null),
    'signups', coalesce((select jsonb_object_agg(d, n) from (
        select (created_at at time zone 'Asia/Singapore')::date::text as d, count(*) as n from u
         where created_at > now() - interval '30 days' group by 1) t), '{}'::jsonb),
    'feedback_new', (select count(*) from public.feedback where status = 'new'),
    'couples', (select count(*) from public.projects where kind = 'couple'),
    'projects', (select count(*) from public.projects where kind = 'project')
  ) into res;
  return res;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
