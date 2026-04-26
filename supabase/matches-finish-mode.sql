alter table public.matches
  add column if not exists finish_mode text;

update public.matches
set finish_mode = case
  when finish_mode is not null then finish_mode
  when double_out = true then 'double'
  else 'single'
end
where finish_mode is null;

alter table public.matches
  alter column finish_mode set default 'double';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matches_finish_mode_check'
  ) then
    alter table public.matches
      add constraint matches_finish_mode_check
      check (finish_mode in ('single', 'double', 'master'));
  end if;
end $$;
