begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_schema('private', 'private schema exists');
select has_table('private', 'catalog_release_state', 'private release state exists');
select has_column('private', 'catalog_release_state', 'revision', 'release revision exists');
select has_column('private', 'catalog_release_state', 'catalog_hash', 'release hash exists');
select has_column('private', 'catalog_release_state', 'published_at', 'release timestamp exists');
select col_is_pk('private', 'catalog_release_state', 'singleton', 'singleton key enforces one release row');

select is(
  (select count(*)::integer from private.catalog_release_state),
  1,
  'release state has exactly one singleton row'
);
select ok(
  (select revision > 0 from private.catalog_release_state where singleton = true),
  'release revision is positive'
);
select ok(
  (select catalog_hash ~ '^sha256:[0-9a-f]{64}$' from private.catalog_release_state where singleton = true),
  'release hash has a 64-character digest'
);

select is(
  (select count(*)::integer
   from information_schema.role_table_grants
   where table_schema = 'private'
     and table_name = 'catalog_release_state'
     and grantee in ('anon', 'authenticated')),
  0,
  'browser roles have no release-state table grants'
);

set local role anon;
select throws_ok(
  $$ select * from private.catalog_release_state $$,
  '42501',
  null,
  'anonymous clients cannot read private release state'
);
reset role;

select throws_ok(
  $$ insert into private.catalog_release_state (revision, catalog_hash, published_at) values (2, 'sha256:' || repeat('0', 64), now()) $$,
  '23505',
  null,
  'a second singleton release row is rejected'
);

do $$
declare historical_id uuid;
begin
  select id into historical_id from public.exercises order by slug limit 1;
  if historical_id is null then
    raise exception 'catalog fixture requires an exercise';
  end if;
  update public.exercises set is_published = false where id = historical_id;
end $$;

select ok(
  (select count(*) > 0 from public.exercises where is_published = false),
  'unpublished historical exercise remains queryable by owner'
);

set local role anon;
select is(
  (select count(*)::integer from public.exercises where is_published = false),
  0,
  'published policy excludes omitted exercises for anonymous readers'
);

select * from finish();
rollback;
