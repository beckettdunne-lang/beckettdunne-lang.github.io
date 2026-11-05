-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- It makes one row of grades per account, and only that account can read or change it.
create table if not exists public.gradebooks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  json text not null,
  updated_at bigint not null default 0
);

alter table public.gradebooks enable row level security;

create policy "Read own grades" on public.gradebooks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own grades" on public.gradebooks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own grades" on public.gradebooks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own grades" on public.gradebooks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- Free trial and $5 purchase ----------
-- Paid access: every account gets a 14-day free trial, then needs a $5 one-time purchase.
-- Rows are made by a trigger when an account is created, and marked paid by the
-- lemon-webhook Edge Function. Signed-in users can read their own row but never change it.
create table if not exists public.access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  paid_at timestamptz,
  order_id text,
  note text
);

alter table public.access enable row level security;

create policy "Read own access" on public.access
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.access (user_id, trial_ends_at)
  values (new.id, now() + interval '14 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.start_trial() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_access on auth.users;
create trigger on_auth_user_created_access
  after insert on auth.users
  for each row execute function public.start_trial();

-- Accounts that existed before payments started keep free access.
insert into public.access (user_id, trial_ends_at, paid_at, note)
select id, now(), now(), 'account made before payments started'
from auth.users
on conflict (user_id) do nothing;

-- Saving grades to the account needs a paid account or an active trial.
-- Reading and deleting your own grades always works, so nobody loses their data.
drop policy if exists "Add own grades" on public.gradebooks;
drop policy if exists "Update own grades" on public.gradebooks;
create policy "Add own grades" on public.gradebooks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.access a
                where a.user_id = (select auth.uid())
                  and (a.paid_at is not null or a.trial_ends_at > now())));
create policy "Update own grades" on public.gradebooks
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.access a
                where a.user_id = (select auth.uid())
                  and (a.paid_at is not null or a.trial_ends_at > now())));

-- ---------- Accounts that are free forever ----------
-- Set free_forever = true to give an account free access for good. A refund never removes it.
alter table public.access add column if not exists free_forever boolean not null default false;

update public.access a
set free_forever = true, paid_at = coalesce(a.paid_at, now()), note = 'free forever'
from auth.users u
where u.id = a.user_id and lower(u.email) in ('29baberke@ecfs.org', 'beckettdunne@gmail.com');

drop policy if exists "Add own grades" on public.gradebooks;
drop policy if exists "Update own grades" on public.gradebooks;
create policy "Add own grades" on public.gradebooks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.access a
                where a.user_id = (select auth.uid())
                  and (a.free_forever or a.paid_at is not null or a.trial_ends_at > now())));
create policy "Update own grades" on public.gradebooks
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.access a
                where a.user_id = (select auth.uid())
                  and (a.free_forever or a.paid_at is not null or a.trial_ends_at > now())));

-- ---------- 3-day free trial with a card first ----------
-- The product in Lemon Squeezy is a $5 yearly subscription with a 3-day free trial.
-- lemon-webhook records the subscription here and cancels it right after the $5 charge,
-- so the charge happens once. New accounts get no free time until checkout.
alter table public.access
  add column if not exists sub_id text,
  add column if not exists sub_status text,
  add column if not exists test_mode boolean not null default false,
  add column if not exists portal_url text;

alter table public.access alter column trial_ends_at set default now();

create or replace function public.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.access (user_id, trial_ends_at)
  values (new.id, now())
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.start_trial() from public, anon, authenticated;

-- Saving needs: free forever, paid, an active subscription, a trial that hasn't ended
-- (plus 12 hours while the $5 charge goes through), or a cancelled trial that hasn't ended.
drop policy if exists "Add own grades" on public.gradebooks;
drop policy if exists "Update own grades" on public.gradebooks;
create policy "Add own grades" on public.gradebooks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.access a
                where a.user_id = (select auth.uid())
                  and (a.free_forever or a.paid_at is not null or a.sub_status = 'active'
                       or (a.sub_status = 'on_trial' and a.trial_ends_at + interval '12 hours' > now())
                       or (a.sub_status = 'cancelled' and a.trial_ends_at > now()))));
create policy "Update own grades" on public.gradebooks
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.access a
                where a.user_id = (select auth.uid())
                  and (a.free_forever or a.paid_at is not null or a.sub_status = 'active'
                       or (a.sub_status = 'on_trial' and a.trial_ends_at + interval '12 hours' > now())
                       or (a.sub_status = 'cancelled' and a.trial_ends_at > now()))));

-- ---------- Lock down Supabase's rls_auto_enable ----------
-- This event-trigger function turns on row-level security for every new table in public.
-- It only runs from the ensure_rls event trigger, so nobody needs to call it directly.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ---------- Switched to a $5 one-time purchase (no free trial) ----------
-- The trial columns and policies above still exist but no trial is ever started now.

-- ---------- Friends: usernames, requests, sharing, high fives ----------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '',
  share text not null default 'none' check (share in ('none','gpa','letters')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke update on public.profiles from authenticated, anon;
grant update (display_name, share) on public.profiles to authenticated;

create or replace function public.short_name(full_name text)
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(btrim(full_name),'') = '' then ''
    when array_length(regexp_split_to_array(btrim(full_name), '\s+'), 1) = 1 then btrim(full_name)
    else (regexp_split_to_array(btrim(full_name), '\s+'))[1] || ' ' ||
         upper(left((regexp_split_to_array(btrim(full_name), '\s+'))[array_length(regexp_split_to_array(btrim(full_name), '\s+'), 1)], 1)) || '.'
  end
$$;

create or replace function public.make_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, username, display_name)
  values (new.id, nullif(lower(btrim(new.raw_user_meta_data->>'username')), ''), public.short_name(new.raw_user_meta_data->>'name'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.make_profile() from public, anon, authenticated;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public.make_profile();

insert into public.profiles (user_id, display_name)
select id, public.short_name(raw_user_meta_data->>'name') from auth.users
on conflict (user_id) do nothing;

create table public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_user_b on public.friendships (user_b);
alter table public.friendships enable row level security;

create table public.shared_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gpa numeric(4,2),
  classes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.shared_stats enable row level security;
create policy "Read own stats" on public.shared_stats for select to authenticated using ((select auth.uid()) = user_id);
create policy "Add own stats" on public.shared_stats for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own stats" on public.shared_stats for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own stats" on public.shared_stats for delete to authenticated using ((select auth.uid()) = user_id);

create table public.friend_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  class_name text not null check (char_length(class_name) between 1 and 60),
  letter text not null check (char_length(letter) between 1 and 4),
  created_at timestamptz not null default now()
);
create index friend_events_user on public.friend_events (user_id, created_at desc);
alter table public.friend_events enable row level security;

create table public.high_fives (
  event_id bigint not null references public.friend_events (id) on delete cascade,
  from_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, from_id)
);
create index high_fives_from on public.high_fives (from_id);
alter table public.high_fives enable row level security;

create or replace function public.are_friends(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f
    where f.user_a = least(x, y) and f.user_b = greatest(x, y) and f.status = 'accepted')
$$;
revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select lower(btrim(p_username)) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(btrim(p_username)))
$$;

create or replace function public.set_username(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); u text := lower(btrim(p_username));
begin
  if me is null then return 'signed_out'; end if;
  if u !~ '^[a-z0-9_]{3,20}$' then return 'invalid'; end if;
  if exists (select 1 from public.profiles where user_id = me and username is not null) then return 'already_set'; end if;
  if exists (select 1 from public.profiles where username = u) then return 'taken'; end if;
  insert into public.profiles (user_id, username) values (me, u)
    on conflict (user_id) do update set username = excluded.username;
  return 'ok';
exception when unique_violation then return 'taken';
end;
$$;

create or replace function public.send_friend_request(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); them uuid; row public.friendships;
begin
  if me is null then return 'signed_out'; end if;
  select user_id into them from public.profiles where username = lower(btrim(p_username));
  if them is null then return 'not_found'; end if;
  if them = me then return 'self'; end if;
  select * into row from public.friendships where user_a = least(me, them) and user_b = greatest(me, them);
  if found then
    if row.status = 'accepted' then return 'already_friends'; end if;
    if row.requested_by = me then return 'already_sent'; end if;
    update public.friendships set status = 'accepted' where user_a = row.user_a and user_b = row.user_b;
    return 'accepted';
  end if;
  insert into public.friendships (user_a, user_b, requested_by) values (least(me, them), greatest(me, them), me);
  return 'sent';
end;
$$;

create or replace function public.respond_friend_request(p_other uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return 'signed_out'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
      where user_a = least(me, p_other) and user_b = greatest(me, p_other) and status = 'pending' and requested_by <> me;
  else
    delete from public.friendships
      where user_a = least(me, p_other) and user_b = greatest(me, p_other) and status = 'pending';
  end if;
  return 'ok';
end;
$$;

create or replace function public.remove_friend(p_other uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return 'signed_out'; end if;
  delete from public.friendships where user_a = least(me, p_other) and user_b = greatest(me, p_other);
  return 'ok';
end;
$$;

create or replace function public.get_friends()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'status', x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.user_id, 'username', p.username, 'name', p.display_name, 'status', f.status,
      'incoming', f.requested_by <> auth.uid(),
      'share', case when f.status = 'accepted' then p.share else null end,
      'gpa', case when f.status = 'accepted' and p.share in ('gpa','letters') then s.gpa end,
      'classes', case when f.status = 'accepted' and p.share = 'letters' then s.classes end,
      'updated_at', case when f.status = 'accepted' and p.share <> 'none' then s.updated_at end
    ) as x
    from public.friendships f
    join public.profiles p on p.user_id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
    left join public.shared_stats s on s.user_id = p.user_id
    where auth.uid() in (f.user_a, f.user_b)
  ) t
$$;

create or replace function public.get_feed()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'events', coalesce((select jsonb_agg(e order by e->>'at' desc) from (
      select jsonb_build_object('id', ev.id, 'name', p.display_name, 'username', p.username,
        'class', ev.class_name, 'letter', ev.letter, 'at', ev.created_at,
        'mine', exists (select 1 from public.high_fives h where h.event_id = ev.id and h.from_id = auth.uid())) as e
      from public.friend_events ev
      join public.profiles p on p.user_id = ev.user_id
      where ev.created_at > now() - interval '14 days' and p.share = 'letters'
        and public.are_friends(auth.uid(), ev.user_id)
      order by ev.created_at desc limit 30) a), '[]'::jsonb),
    'high_fives', coalesce((select jsonb_agg(h order by h->>'at' desc) from (
      select jsonb_build_object('name', p.display_name, 'class', ev.class_name, 'letter', ev.letter, 'at', hf.created_at) as h
      from public.high_fives hf
      join public.friend_events ev on ev.id = hf.event_id
      join public.profiles p on p.user_id = hf.from_id
      where ev.user_id = auth.uid() and hf.created_at > now() - interval '14 days'
      order by hf.created_at desc limit 30) b), '[]'::jsonb)
  )
$$;

create or replace function public.high_five(p_event bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); owner uuid;
begin
  if me is null then return 'signed_out'; end if;
  select user_id into owner from public.friend_events where id = p_event;
  if owner is null or owner = me or not public.are_friends(me, owner) then return 'not_allowed'; end if;
  insert into public.high_fives (event_id, from_id) values (p_event, me) on conflict do nothing;
  return 'ok';
end;
$$;

create or replace function public.record_grade_up(p_class text, p_letter text)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then return 'signed_out'; end if;
  if not exists (select 1 from public.profiles where user_id = me and share = 'letters') then return 'not_sharing'; end if;
  if (select count(*) from public.friend_events where user_id = me and created_at > now() - interval '1 day') >= 20 then return 'too_many'; end if;
  insert into public.friend_events (user_id, class_name, letter) values (me, left(btrim(p_class), 60), left(btrim(p_letter), 4));
  return 'ok';
end;
$$;

revoke execute on function public.set_username(text), public.send_friend_request(text), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.get_friends(), public.get_feed(), public.high_five(bigint), public.record_grade_up(text, text) from public, anon;
grant execute on function public.set_username(text), public.send_friend_request(text), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.get_friends(), public.get_feed(), public.high_five(bigint), public.record_grade_up(text, text) to authenticated;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
