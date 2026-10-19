-- Goals, Learning, Clients, MTG, Mood, People, Watchlist + Sadaqah (in Finance)

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
