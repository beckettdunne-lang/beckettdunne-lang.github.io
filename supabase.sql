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
