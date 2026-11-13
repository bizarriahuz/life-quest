-- 1.55 · Gundam collection: kits you own, want or have built, split by who made them.
-- origin keeps three kinds apart and is never collapsed:
--   official             = Bandai
--   third_party_copy     = unlicensed reproductions (Daban, TT Hongli, Dragon Momoko…)
--   third_party_original = original designs in the Gunpla idiom (Motor Nuclear, In Era+, Zero Gravity…)

create table public.gundam_kits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  series     text check (series is null or char_length(series) <= 120),
  grade      text not null default 'HG' check (grade in
             ('HG','RG','MG','PG','EG','SD','Mega Size','Full Mechanics','Other')),
  scale      text check (scale is null or char_length(scale) <= 20),
  brand      text check (brand is null or char_length(brand) <= 120),
  origin     text not null default 'official' check (origin in
             ('official','third_party_copy','third_party_original')),
  status     text not null default 'unbuilt' check (status in
             ('wishlist','unbuilt','built','painted','sold')),
  rating     smallint check (rating between 1 and 5),
  price      numeric(10,2) check (price is null or price >= 0),
  currency   text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  bought_at  date,
  store      text check (store is null or char_length(store) <= 120),
  notes      text check (notes is null or char_length(notes) <= 5000),
  photos     text[] not null default '{}' check (cardinality(photos) <= 8),
  created_at timestamptz not null default now()
);

alter table public.gundam_kits enable row level security;

create policy "own rows" on public.gundam_kits for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index gundam_kits_user_created_idx on public.gundam_kits (user_id, created_at);
grant select, insert, update, delete on public.gundam_kits to authenticated;
revoke truncate, references, trigger on public.gundam_kits from authenticated;
revoke all on public.gundam_kits from anon;
create trigger row_limits before insert on public.gundam_kits
  for each row execute function public.enforce_row_limits('2000', 'kits');

-- Photos: paths in the private kit-photos bucket, <kit id>/<file uuid>.jpg (same pattern as project_entries.photo_path).
alter table public.gundam_kits add constraint gundam_kits_photos_path_check
  check (array_to_string(photos, ',') ~ '^([0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webp|png)(,|$))*$');

-- Every photo must sit under this kit's folder; at most 8 per kit and 1,000 across all your kits.
create or replace function public.kit_photo_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p text; used int;
begin
  if tg_op = 'UPDATE' then new.id := old.id; end if;
  foreach p in array new.photos loop
    if split_part(p, '/', 1) <> new.id::text then
      raise exception 'That photo belongs to a different kit.' using errcode = 'P0001';
    end if;
  end loop;
  if cardinality(new.photos) > 8 then
    raise exception 'A kit can have 8 photos at most. Remove one to add another.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' or cardinality(new.photos) > cardinality(old.photos) then
    select coalesce(sum(cardinality(photos)), 0) into used
      from public.gundam_kits where user_id = new.user_id and id <> new.id;
    if used + cardinality(new.photos) > 1000 then
      raise exception 'You''ve added 1,000 kit photos, the most allowed. Remove some to add more.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger kit_photo_guard before insert or update of id, photos on public.gundam_kits
  for each row execute function public.kit_photo_guard();
revoke all on function public.kit_photo_guard() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kit-photos', 'kit-photos', false, 3145728, array['image/jpeg','image/webp','image/png']) on conflict (id) do nothing;

-- Is this file in one of your kits' folders? With listed = true, it must also be named in that kit's photos
-- (so files can only be uploaded after the row has passed kit_photo_guard).
create or replace function public.kit_photo_owner(object_name text, listed boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gundam_kits
                  where id::text = split_part(object_name, '/', 1) and user_id = auth.uid()
                    and (not listed or object_name = any(photos)))
$$;
revoke all on function public.kit_photo_owner(text, boolean) from public, anon;
grant execute on function public.kit_photo_owner(text, boolean) to authenticated;
create policy "kit owner sees photos" on storage.objects for select to authenticated
  using (bucket_id = 'kit-photos' and public.kit_photo_owner(name));
create policy "kit owner adds photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'kit-photos' and public.kit_photo_owner(name, true));
create policy "kit owner removes photos" on storage.objects for delete to authenticated
  using (bucket_id = 'kit-photos' and public.kit_photo_owner(name));

-- Section
alter table public.profiles drop constraint if exists profiles_sections_check;
alter table public.profiles add constraint profiles_sections_check check (sections is null or sections <@ array['tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes','hobbies','games','chess','mtg','watchlist','music','people','finance','couple','football','journal','renewals','meals','focus','gundam']);
alter table public.profiles drop constraint if exists profiles_seen_intros_check;
alter table public.profiles add constraint profiles_seen_intros_check check (seen_intros is null or (cardinality(seen_intros) <= 100 and seen_intros <@ array['tasks','goals','projects','calendar','clients','prayer','fitness','sleep','books','comics','learning','notes','mood','quotes','hobbies','games','chess','mtg','watchlist','music','people','finance','couple','football','journal','renewals','meals','focus','gundam']));
