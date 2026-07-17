begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

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

create temporary table catalog_release_fixture (
  exercise_id uuid primary key,
  attempts_count integer not null,
  progress_count integer not null,
  review_count integer not null
) on commit drop;
insert into catalog_release_fixture (exercise_id, attempts_count, progress_count, review_count)
select exercises.id,
  (select count(*)::integer from public.exercise_attempts where exercise_id = exercises.id),
  (select count(*)::integer from public.user_exercise_progress where exercise_id = exercises.id),
  (select count(*)::integer from public.user_review_items where exercise_id = exercises.id)
from public.exercises exercises
where exercises.slug = 'line-find-and-jump-01';

select is(
  (select count(*)::integer from catalog_release_fixture),
  1,
  'the canonical affected exercise exists exactly once'
);

update public.exercises
set is_published = false, updated_at = now()
where id = (select exercise_id from catalog_release_fixture);

select is(
  (select count(*)::integer
   from public.exercises
   join catalog_release_fixture on catalog_release_fixture.exercise_id = public.exercises.id),
  1,
  'the affected historical exercise ID remains present after reconciliation'
);
select is(
  (select public.exercises.id
   from public.exercises
   join catalog_release_fixture on catalog_release_fixture.exercise_id = public.exercises.id),
  (select exercise_id from catalog_release_fixture),
  'reconciliation preserves the affected exercise identity'
);

select ok(
  (select count(*)::integer
   from public.exercise_attempts attempts
   join catalog_release_fixture fixture on fixture.exercise_id = attempts.exercise_id)
    = (select attempts_count from catalog_release_fixture)
    and not exists (
    select 1
    from public.exercise_attempts attempts
    join catalog_release_fixture fixture on fixture.exercise_id = attempts.exercise_id
    left join public.exercises exercises on exercises.id = attempts.exercise_id
    where exercises.id is null
  ),
  'historical attempt references still resolve to the affected exercise'
);
select ok(
  (select count(*)::integer
   from public.user_exercise_progress progress
   join catalog_release_fixture fixture on fixture.exercise_id = progress.exercise_id)
    = (select progress_count from catalog_release_fixture)
    and not exists (
    select 1
    from public.user_exercise_progress progress
    join catalog_release_fixture fixture on fixture.exercise_id = progress.exercise_id
    left join public.exercises exercises on exercises.id = progress.exercise_id
    where exercises.id is null
  ),
  'historical progress references still resolve to the affected exercise'
);
select ok(
  (select count(*)::integer
   from public.user_review_items review
   join catalog_release_fixture fixture on fixture.exercise_id = review.exercise_id)
    = (select review_count from catalog_release_fixture)
    and not exists (
    select 1
    from public.user_review_items review
    join catalog_release_fixture fixture on fixture.exercise_id = review.exercise_id
    left join public.exercises exercises on exercises.id = review.exercise_id
    where exercises.id is null
  ),
  'historical review references still resolve to the affected exercise'
);

select ok(
  (select count(*) = 1
   from public.exercises
   join catalog_release_fixture on catalog_release_fixture.exercise_id = public.exercises.id
   where public.exercises.is_published = false),
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
