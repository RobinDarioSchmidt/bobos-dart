create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('301', '501')),
  double_out boolean not null default true,
  legs_to_win int not null check (legs_to_win between 1 and 9),
  sets_to_win int not null check (sets_to_win between 1 and 9),
  status text not null default 'finished' check (status in ('finished', 'abandoned')),
  winner_profile_id uuid references public.profiles(id) on delete set null,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  guest_name text,
  seat_index int not null check (seat_index between 0 and 3),
  sets_won int not null default 0,
  legs_won int not null default 0,
  average numeric(6,2),
  best_visit int,
  is_winner boolean not null default false,
  created_at timestamptz not null default now(),
  constraint match_players_identity_check
    check (profile_id is not null or guest_name is not null),
  constraint match_players_unique_seat unique (match_id, seat_index)
);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('around-the-clock', 'bull-drill')),
  score int not null default 0,
  hits int not null default 0,
  darts_thrown int not null default 0,
  finished boolean not null default true,
  notes jsonb not null default '[]'::jsonb,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.training_sessions enable row level security;

create policy "profiles_select_public"
on public.profiles
for select
to authenticated
using (true);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "matches_select_participants"
on public.matches
for select
to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.match_players mp
    where mp.match_id = matches.id
      and mp.profile_id = auth.uid()
  )
);

create policy "matches_insert_owner"
on public.matches
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "match_players_select_participants"
on public.match_players
for select
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = match_players.match_id
      and (
        m.owner_id = auth.uid()
        or exists (
          select 1
          from public.match_players mp2
          where mp2.match_id = m.id
            and mp2.profile_id = auth.uid()
        )
      )
  )
);

create policy "match_players_insert_owner"
on public.match_players
for insert
to authenticated
with check (
  exists (
    select 1
    from public.matches m
    where m.id = match_players.match_id
      and m.owner_id = auth.uid()
  )
);

create policy "training_select_own"
on public.training_sessions
for select
to authenticated
using (owner_id = auth.uid());

create policy "training_insert_own"
on public.training_sessions
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "training_update_own"
on public.training_sessions
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
