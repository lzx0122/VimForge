-- Forward fix for the accidentally applied catalog release fixture.
-- Restore the repository baseline without deleting history or attempts.
begin;

do $$
declare
  current_revision bigint;
  current_hash text;
  affected_rows integer;
begin
  select revision, catalog_hash
    into current_revision, current_hash
    from private.catalog_release_state
    where singleton = true
    for update;

  if current_revision is distinct from 2
     or current_hash is distinct from 'sha256:1111111111111111111111111111111111111111111111111111111111111111' then
    raise exception 'unexpected catalog release state; refusing forward fix';
  end if;

  update public.exercises
  set is_published = true,
      updated_at = now()
  where slug = 'line-find-and-jump-01'
    and is_published = false;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'expected exactly one unpublished line-find-and-jump-01 row, found %', affected_rows;
  end if;

  update private.catalog_release_state
  set revision = 1,
      catalog_hash = 'sha256:d97a6d3d372da58e41a608e7fed0daf4a306eedb6a2f39abd69bb2ba4d07858a',
      published_at = now()
  where singleton = true;
end $$;

commit;
