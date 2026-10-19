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
