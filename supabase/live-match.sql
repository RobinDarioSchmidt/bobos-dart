create table if not exists public.live_matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  room_code text not null unique,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_matches enable row level security;

create policy "live_matches_select_owner"
on public.live_matches
for select
to authenticated
using (owner_id = auth.uid());

create policy "live_matches_insert_owner"
on public.live_matches
for insert
to authenticated
with check (owner_id = auth.uid());
