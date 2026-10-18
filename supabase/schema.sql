-- LIFE QUEST — database schema
-- Every table is private to the signed-in user through row-level security.

-- ---------- hero ----------
create table public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  hero_name  text not null default 'HERO' check (char_length(hero_name) between 1 and 24),
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
  unique (user_id, name)
);

create table public.hobby_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hobby_id     uuid not null references public.hobbies(id) on delete cascade,
  session_on   date not null default current_date,
  duration_min int not null default 0 check (duration_min between 0 and 1440),
  note         text,
  created_at   timestamptz not null default now()
);
create index on public.hobby_sessions (hobby_id);

-- ---------- experience ----------
create table public.xp_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  stat       text not null check (stat in ('STR','DEX','INT','WIS','CHA','FTH')),
  amount     int not null check (amount between 0 and 1000),
  source     text not null,
  source_id  text not null,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

-- Row-level security: every table is readable/writable only by its owner.
do $$
declare t text;
begin
  foreach t in array array['profiles','tasks','books','notes','quotes','workouts',
                           'prayer_logs','hobbies','hobby_sessions','xp_events'] loop
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
