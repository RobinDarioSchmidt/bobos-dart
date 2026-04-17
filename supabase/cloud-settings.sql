alter table public.profiles
add column if not exists app_settings jsonb not null default '{}'::jsonb;
