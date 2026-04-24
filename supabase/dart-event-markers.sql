alter table public.dart_events
  add column if not exists board_x double precision,
  add column if not exists board_y double precision;
