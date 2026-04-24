create table if not exists public.dart_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('match', 'training')),
  match_id uuid references public.matches(id) on delete cascade,
  training_session_id uuid references public.training_sessions(id) on delete cascade,
  player_name text not null,
  player_seat_index int not null default 0 check (player_seat_index between 0 and 3),
  visit_index int not null default 0,
  dart_index int not null default 0,
  segment_label text not null,
  base_value int not null default 0,
  multiplier int not null default 1 check (multiplier between 0 and 3),
  ring text not null check (ring in ('single', 'double', 'triple', 'outer-bull', 'bull', 'miss', 'unknown')),
  score int not null default 0,
  is_hit boolean not null default true,
  is_checkout_dart boolean not null default false,
  target_label text,
  board_x double precision,
  board_y double precision,
  created_at timestamptz not null default now(),
  constraint dart_events_context_check
    check (
      (source_type = 'match' and match_id is not null and training_session_id is null)
      or (source_type = 'training' and training_session_id is not null and match_id is null)
    )
);

alter table public.dart_events enable row level security;

create policy "dart_events_select_own"
on public.dart_events
for select
to authenticated
using (owner_id = auth.uid());

create policy "dart_events_insert_own"
on public.dart_events
for insert
to authenticated
with check (owner_id = auth.uid());
