alter table public.training_sessions
  drop constraint if exists training_sessions_mode_check;

alter table public.training_sessions
  add constraint training_sessions_mode_check
  check (mode in ('around-the-clock', 'bull-drill', 'shanghai', 'doubles-around'));
