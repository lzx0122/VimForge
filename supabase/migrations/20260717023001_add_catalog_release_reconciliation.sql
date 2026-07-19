-- Reviewed production fixture for a release that omits one exercise.
-- This migration is intentionally not applied by Task 4; it demonstrates the
-- forward-only reconciliation shape used by renderCatalogMigration().
begin;

do $$
declare current_revision bigint; current_hash text;
begin
  select revision, catalog_hash
    into current_revision, current_hash
    from private.catalog_release_state
    where singleton = true
    for update;
  if current_revision is distinct from 1
     or current_hash is distinct from 'sha256:d97a6d3d372da58e41a608e7fed0daf4a306eedb6a2f39abd69bb2ba4d07858a' then
    raise exception 'catalog release base revision/hash mismatch';
  end if;
end $$;

-- Historical attempts retain their exercise ID; only publication visibility changes.
do $$
declare affected_rows integer;
begin
  update public.exercises
  set is_published = false, updated_at = now()
  where slug = 'line-find-and-jump-01';
  get diagnostics affected_rows = row_count;
  -- The fixture is intentionally fail-fast: a typo or stale slug must never
  -- silently publish a release that changed zero catalog rows.
  if affected_rows <> 1 then
    raise exception 'catalog release fixture expected one line-find-and-jump-01 row, found %', affected_rows;
  end if;
end $$;

update private.catalog_release_state
set revision = 2,
    catalog_hash = 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    published_at = now()
where singleton = true;

commit;
