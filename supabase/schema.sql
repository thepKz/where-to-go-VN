-- Đi Đâu: lược đồ Supabase. Chạy nguyên tệp này trong SQL Editor. Chạy lại bao nhiêu lần cũng được.
-- Đã kiểm trên PostgreSQL chạy trong máy (PGlite), xem tests/sql-rls.test.mjs. Chưa kiểm trên dự án Supabase thật.
begin;
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(), invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'), created_at timestamptz not null default now()
);
create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade, household_id uuid not null references public.households(id), name text not null check (length(trim(name)) between 1 and 80), joined_at timestamptz not null default now(), seen_at timestamptz not null default now()
);
alter table public.members add column if not exists seen_at timestamptz not null default now();
create index if not exists members_house on public.members(household_id);
create table if not exists public.marks (
  household_id uuid not null references public.households(id), place_id text not null, member_id uuid not null references auth.users(id) on delete cascade, want boolean not null default false, visited_at timestamptz, verdict text check (verdict in ('great','ok','never')), note text not null default '' check (length(note) <= 4000), updated_at timestamptz not null default now(), primary key(household_id,place_id,member_id)
);
create table if not exists public.custom_places (
  id text not null, household_id uuid not null references public.households(id), added_by uuid not null references auth.users(id) on delete cascade, name text not null check(length(name) between 1 and 200), "group" text not null check("group" in ('an','ca-phe','nhau','choi')), kind text not null, address text not null, district text, "areaId" text, lat double precision check(lat between -90 and 90), lng double precision check(lng between -180 and 180), geo text check(geo in ('exact','street','area','none')), dishes jsonb not null default '[]', "dishNotes" jsonb not null default '[]', price text, hours jsonb, "hoursText" text, why text, sources jsonb not null default '[]', "mapsUrl" text not null, "googlePlaceId" text, trust double precision check(trust between 0 and 1), badges jsonb not null default '[]', status text not null default 'open', updated date, primary key(household_id,id)
);
create table if not exists public.rounds (
  id text primary key, household_id uuid not null references public.households(id), "group" text not null check("group" in ('an','ca-phe','nhau','choi')), "where" jsonb, seed bigint not null, place_ids jsonb not null check(jsonb_array_length(place_ids) <= 3), created_at timestamptz not null default now()
);
create index if not exists rounds_house_time on public.rounds(household_id,created_at desc);
create table if not exists public.votes (
  round_id text not null references public.rounds(id), household_id uuid not null references public.households(id), member_id uuid not null references auth.users(id) on delete cascade, place_id text not null, "like" boolean not null, at timestamptz not null default now(), primary key(round_id,member_id,place_id)
);
alter table public.votes add column if not exists household_id uuid references public.households(id);
update public.votes v set household_id = r.household_id from public.rounds r where r.id = v.round_id and v.household_id is null;
alter table public.votes alter column household_id set not null;
create index if not exists votes_house on public.votes(household_id);
create table if not exists public.picks (
  household_id uuid not null references public.households(id), place_id text not null, round_id text not null references public.rounds(id), picked_at timestamptz not null default now(), asked_verdict boolean not null default false, primary key(household_id,round_id)
);
create index if not exists picks_house_time on public.picks(household_id,picked_at desc);
-- Máy đã chốt, để máy kia nói được ai chốt. Lượt chốt cũ để trống.
alter table public.picks add column if not exists picked_by uuid;
-- Bộ đếm số lần nhập sai mã mời. Người dùng không đọc được bảng này.
create table if not exists public.join_attempts (
  member_id uuid primary key references auth.users(id) on delete cascade, failures int not null default 0, window_start timestamptz not null default now()
);

create or replace function public.my_household() returns uuid language sql stable security definer set search_path = '' as $$
  select household_id from public.members where id = auth.uid()
$$;

-- Xoá nhà cũ khi người cuối cùng rời đi và nhà chưa có dữ liệu. Chỉ các hàm khác gọi.
create or replace function public.drop_empty_household(old_house uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if old_house is null then return; end if;
  if not exists(select 1 from public.members where household_id = old_house)
    and not exists(select 1 from public.marks where household_id = old_house)
    and not exists(select 1 from public.custom_places where household_id = old_house)
    and not exists(select 1 from public.rounds where household_id = old_house)
    and not exists(select 1 from public.picks where household_id = old_house)
    and not exists(select 1 from public.votes where household_id = old_house) then
    delete from public.households where id = old_house;
  end if;
end $$;

-- Mã mời: sáu ký tự từ 32 ký tự dễ đọc (bỏ I, O, 0, 1).
create or replace function public.create_household(member_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare house uuid; invitation text; previous uuid; raw bytea;
begin
  if auth.uid() is null or length(trim(member_name)) not between 1 and 80 then raise exception 'Invalid member'; end if;
  select household_id into previous from public.members where id = auth.uid();
  loop
    raw := decode(replace(gen_random_uuid()::text,'-',''),'hex');
    invitation := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + get_byte(raw, i) % 32, 1), '' order by i) from generate_series(0,5) as i);
    begin
      insert into public.households(invite_code) values(invitation) returning id into house;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into public.members(id,household_id,name) values(auth.uid(),house,trim(member_name)) on conflict(id) do update set household_id=excluded.household_id,name=excluded.name,joined_at=now(),seen_at=now();
  if previous is distinct from house then perform public.drop_empty_household(previous); end if;
  return house;
end $$;

-- Trả null khi mã sai (không ném lỗi, để bộ đếm không bị huỷ). Ném lỗi khi nhập sai quá nhiều lần hoặc nhà đầy.
create or replace function public.join_household(invite text, member_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare house uuid; previous uuid; stale uuid;
begin
  if auth.uid() is null or length(trim(member_name)) not between 1 and 80 or invite !~ '^[A-Z0-9]{6}$' then raise exception 'Invalid input'; end if;
  insert into public.join_attempts(member_id) values(auth.uid()) on conflict do nothing;
  update public.join_attempts set
    failures = case when window_start < now() - interval '15 minutes' then 0 else failures end,
    window_start = case when window_start < now() - interval '15 minutes' then now() else window_start end
    where member_id = auth.uid();
  if (select failures from public.join_attempts where member_id = auth.uid()) >= 5 then raise exception 'Too many attempts'; end if;
  select id into house from public.households where invite_code = invite for update;
  if house is null then
    update public.join_attempts set failures = failures + 1 where member_id = auth.uid();
    return null;
  end if;
  select household_id into previous from public.members where id = auth.uid();
  if previous is distinct from house and (select count(*) from public.members where household_id = house and id <> auth.uid()) >= 4 then
    select id into stale from public.members where household_id = house and id <> auth.uid() and seen_at < now() - interval '30 days' order by seen_at asc limit 1;
    if stale is not null then delete from public.members where id = stale; end if;
    if (select count(*) from public.members where household_id = house and id <> auth.uid()) >= 4 then raise exception 'Household full'; end if;
  end if;
  insert into public.members(id,household_id,name) values(auth.uid(),house,trim(member_name)) on conflict(id) do update set household_id=excluded.household_id,name=excluded.name,joined_at=now(),seen_at=now();
  delete from public.join_attempts where member_id = auth.uid();
  if previous is distinct from house then perform public.drop_empty_household(previous); end if;
  return house;
end $$;

-- Đánh dấu máy này còn dùng. Chỉ ghi lại tối đa một lần mỗi giờ để khỏi gửi tin thừa cho người kia.
create or replace function public.touch() returns void language sql security definer set search_path = '' as $$
  update public.members set seen_at = now() where id = auth.uid() and seen_at < now() - interval '1 hour'
$$;

-- Gỡ một máy cùng nhà (không gỡ chính mình).
create or replace function public.remove_member(target uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  if auth.uid() is null then raise exception 'Invalid member'; end if;
  delete from public.members where id = target and id <> auth.uid() and household_id = (select household_id from public.members where id = auth.uid());
  get diagnostics removed = row_count;
  return removed > 0;
end $$;

revoke all on function public.my_household(), public.create_household(text), public.join_household(text,text), public.touch(), public.remove_member(uuid), public.drop_empty_household(uuid) from public, anon, authenticated;
grant execute on function public.my_household(), public.create_household(text), public.join_household(text,text), public.touch(), public.remove_member(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.marks enable row level security;
alter table public.custom_places enable row level security;
alter table public.rounds enable row level security;
alter table public.votes enable row level security;
alter table public.picks enable row level security;
alter table public.join_attempts enable row level security;

drop policy if exists household_read on public.households;
drop policy if exists member_read on public.members;
drop policy if exists member_update on public.members;
drop policy if exists marks_read on public.marks;
drop policy if exists marks_write on public.marks;
drop policy if exists custom_read on public.custom_places;
drop policy if exists custom_write on public.custom_places;
drop policy if exists rounds_read on public.rounds;
drop policy if exists rounds_insert on public.rounds;
drop policy if exists votes_read on public.votes;
drop policy if exists votes_write on public.votes;
drop policy if exists picks_write on public.picks;

create policy household_read on public.households for select to authenticated using(id=(select public.my_household()));
create policy member_read on public.members for select to authenticated using(household_id=(select public.my_household()));
create policy member_update on public.members for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()) and household_id=(select public.my_household()));
create policy marks_read on public.marks for select to authenticated using(household_id=(select public.my_household()));
create policy marks_write on public.marks for all to authenticated using(household_id=(select public.my_household()) and member_id=(select auth.uid())) with check(household_id=(select public.my_household()) and member_id=(select auth.uid()));
create policy custom_read on public.custom_places for select to authenticated using(household_id=(select public.my_household()));
create policy custom_write on public.custom_places for all to authenticated using(household_id=(select public.my_household()) and added_by=(select auth.uid())) with check(household_id=(select public.my_household()) and added_by=(select auth.uid()));
create policy rounds_read on public.rounds for select to authenticated using(household_id=(select public.my_household()));
create policy rounds_insert on public.rounds for insert to authenticated with check(
  household_id=(select public.my_household())
  and id like ('round-' || household_id::text || '-%')
  and ("where" is null or case jsonb_typeof("where")
    when 'string' then ("where" #>> '{}') ~ '^[a-z0-9-]{1,60}$'
    when 'object' then ("where" ? 'lat') and ("where" ? 'lng') and ("where" - 'lat' - 'lng') = '{}'::jsonb
      and jsonb_typeof("where"->'lat')='number' and jsonb_typeof("where"->'lng')='number'
      and ("where"->>'lat')::numeric between -90 and 90 and ("where"->>'lng')::numeric between -180 and 180
      and round(("where"->>'lat')::numeric,3)=("where"->>'lat')::numeric and round(("where"->>'lng')::numeric,3)=("where"->>'lng')::numeric
    when 'null' then true
    else false end));
create policy votes_read on public.votes for select to authenticated using(household_id=(select public.my_household()));
create policy votes_write on public.votes for all to authenticated
  using(member_id=(select auth.uid()) and household_id=(select public.my_household()))
  with check(member_id=(select auth.uid()) and household_id=(select public.my_household()) and exists(select 1 from public.rounds r where r.id=votes.round_id and r.household_id=votes.household_id and r.place_ids ? votes.place_id));
create policy picks_write on public.picks for all to authenticated
  using(household_id=(select public.my_household()))
  with check(household_id=(select public.my_household()) and exists(select 1 from public.rounds r where r.id=picks.round_id and r.household_id=picks.household_id and r.place_ids ? picks.place_id));

revoke all on public.households,public.members,public.marks,public.custom_places,public.rounds,public.votes,public.picks,public.join_attempts from anon,authenticated;
grant select on public.households,public.members,public.marks,public.custom_places,public.rounds,public.votes,public.picks to authenticated;
grant update(name) on public.members to authenticated;
grant insert,update on public.marks,public.custom_places,public.votes,public.picks to authenticated;
grant insert on public.rounds to authenticated;
do $$ declare table_name text; begin
  foreach table_name in array array['households','members','marks','custom_places','rounds','votes','picks'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then execute format('alter publication supabase_realtime add table public.%I',table_name); end if;
  end loop;
end $$;
commit;
