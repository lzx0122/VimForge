alter table public.exercises
  add column display_order smallint not null default 0
    check (display_order >= 0);

-- One-time backfill for rows that predate this column. Preserve each
-- exercise's previously displayed order by reusing the same derivation the
-- production export used before this column existed: the numeric suffix in
-- the exercise slug, partitioned by unit, falling back to slug for ties or
-- exercises without a numeric suffix.
with ordered as (
  select
    id,
    row_number() over (
      partition by unit_id
      order by case
        when slug ~ '-[0-9]+$' then (regexp_match(slug, '([0-9]+)$'))[1]::integer
        else 2147483647
      end,
      slug
    ) as computed_display_order
  from public.exercises
)
update public.exercises e
set display_order = ordered.computed_display_order
from ordered
where ordered.id = e.id;

create index exercises_unit_display_order_idx
  on public.exercises (unit_id, display_order);
