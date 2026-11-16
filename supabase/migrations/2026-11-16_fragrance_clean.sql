-- One-shot fix: remove the empty stub table, then build the real thing.
-- Safe: the stub was created minutes ago and holds no rows.

drop table if exists public.fragrances cascade;

-- 1.56 · Fragrance: the bottles you own and the ones you want.
-- Details are looked up from Scento's public perfume API (no key, open CORS), which returns
-- name, house, year, concentration, perfumer, family and a top/heart/base pyramid.
-- Everything you spent or decided yourself (size, price, store, rating, notes, photo) is yours.
-- status is deliberately only own | want: a bottle is on the shelf or it is on the list.

create table public.fragrances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  house         text check (house is null or char_length(house) <= 120),
  year          smallint check (year is null or year between 1800 and 2100),
  concentration text check (concentration is null or char_length(concentration) <= 40),
  perfumer      text check (perfumer is null or char_length(perfumer) <= 200),
  family        text check (family is null or char_length(family) <= 80),
  top_notes     text[] not null default '{}',
  heart_notes   text[] not null default '{}',
  base_notes    text[] not null default '{}',
  status        text not null default 'own' check (status in ('own', 'want')),
  rating        smallint check (rating between 1 and 5),
  size_ml       numeric(6,1) check (size_ml is null or size_ml > 0),
  price         numeric(10,2) check (price is null or price >= 0),
  currency      text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  bought_at     date,
  store         text check (store is null or char_length(store) <= 120),
  notes         text check (notes is null or char_length(notes) <= 5000),
  source_url    text check (source_url is null or char_length(source_url) <= 300),
  photos        text[] not null default '{}' check (cardinality(photos) <= 6),
  created_at    timestamptz not null default now()
);

alter table public.fragrances enable row level security;

create policy "own rows" on public.fragrances for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index fragrances_user_created_idx on public.fragrances (user_id, created_at);
grant select, insert, update, delete on public.fragrances to authenticated;
revoke truncate, references, trigger on public.fragrances from authenticated;
revoke all on public.fragrances from anon;
create trigger row_limits before insert on public.fragrances
  for each row execute function public.enforce_row_limits('2000', 'bottles');

-- Photos: paths in the private fragrance-photos bucket, <bottle id>/<file uuid>.jpg
-- (same pattern as gundam_kits.photos).
alter table public.fragrances add constraint fragrance_photos_path_check
  check (array_to_string(photos, ',') ~ '^([0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp|png)(,|$))*$');

-- Every photo must sit under this bottle's folder; at most 6 per bottle and 600 across all of them.
create or replace function public.fragrance_photo_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p text; used int;
begin
  if tg_op = 'UPDATE' then new.id := old.id; end if;
  foreach p in array new.photos loop
    if split_part(p, '/', 1) <> new.id::text then
      raise exception 'That photo belongs to a different bottle.' using errcode = 'P0001';
    end if;
  end loop;
  if cardinality(new.photos) > 6 then
    raise exception 'A bottle can have 6 photos at most. Remove one to add another.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' or cardinality(new.photos) > cardinality(old.photos) then
    select coalesce(sum(cardinality(photos)), 0) into used
      from public.fragrances where user_id = new.user_id and id <> new.id;
    if used + cardinality(new.photos) > 600 then
      raise exception 'You''ve added 600 bottle photos, the most allowed. Remove some to add more.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger fragrance_photo_guard before insert or update of id, photos on public.fragrances
  for each row execute function public.fragrance_photo_guard();
revoke all on function public.fragrance_photo_guard() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fragrance-photos', 'fragrance-photos', false, 3145728, array['image/jpeg','image/webp','image/png']) on conflict (id) do nothing;

-- Is this file in one of your bottles' folders? With listed = true, it must also be named in that
-- bottle's photos (so files can only be uploaded after the row has passed fragrance_photo_guard).
create or replace function public.fragrance_photo_owner(object_name text, listed boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fragrances
                  where id::text = split_part(object_name, '/', 1) and user_id = auth.uid()
                    and (not listed or object_name = any(photos)))
$$;
revoke all on function public.fragrance_photo_owner(text, boolean) from public, anon;
grant execute on function public.fragrance_photo_owner(text, boolean) to authenticated;
create policy "fragrance owner sees photos" on storage.objects for select to authenticated
  using (bucket_id = 'fragrance-photos' and public.fragrance_photo_owner(name));
create policy "fragrance owner adds photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'fragrance-photos' and public.fragrance_photo_owner(name, true));
create policy "fragrance owner removes photos" on storage.objects for delete to authenticated
  using (bucket_id = 'fragrance-photos' and public.fragrance_photo_owner(name));

-- Section
alter table public.profiles drop constraint if exists profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@ array['tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes','hobbies','games','chess','mtg','watchlist','music','people','finance','couple','football','journal','renewals','meals','focus','gundam','fragrance']);
alter table public.profiles drop constraint if exists profiles_seen_intros_check;
alter table public.profiles add constraint profiles_seen_intros_check check (seen_intros is null or (cardinality(seen_intros) <= 100 and seen_intros <@ array['tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes','hobbies','games','chess','mtg','watchlist','music','people','finance','couple','football','journal','renewals','meals','focus','gundam','fragrance']));

-- Existing users who already picked their sections get Fragrance switched on too.
update public.profiles set sections = array_append(sections, 'fragrance')
 where sections is not null and not ('fragrance' = any(sections));
