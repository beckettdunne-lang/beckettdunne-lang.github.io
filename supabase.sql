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
