alter table public.exercises
  add column display_order smallint not null default 0
    check (display_order >= 0);

create index exercises_unit_display_order_idx
  on public.exercises (unit_id, display_order);
