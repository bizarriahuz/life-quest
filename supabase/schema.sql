-- LIFE QUEST — database schema
-- Every table is private to the signed-in user through row-level security.

-- ---------- hero ----------
create table public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  hero_name  text not null default 'HERO' check (char_length(hero_name) between 1 and 24),
  sections   text[] check (sections is null or sections <@ array['tasks','prayer','fitness','books','notes','quotes','hobbies','finance']::text[]),
  currency   text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
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
  stat       text not null check (stat in ('STR','DEX','INT','WIS','CHA','FTH','WLT')),
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
