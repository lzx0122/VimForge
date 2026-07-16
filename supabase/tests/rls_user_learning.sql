begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'user_settings', 'user_settings exists');
select has_table('public', 'practice_sessions', 'practice_sessions exists');
select has_table('public', 'exercise_attempts', 'exercise_attempts exists');
select has_table(
  'public',
  'user_exercise_progress',
  'user_exercise_progress exists'
);
select has_table('public', 'user_skill_mastery', 'user_skill_mastery exists');
select has_table('public', 'user_review_items', 'user_review_items exists');
select has_table('public', 'guest_imports', 'guest_imports exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_settings'::regclass),
  'user_settings has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.practice_sessions'::regclass),
  'practice_sessions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.exercise_attempts'::regclass),
  'exercise_attempts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_exercise_progress'::regclass),
  'user_exercise_progress has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_skill_mastery'::regclass),
  'user_skill_mastery has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_review_items'::regclass),
  'user_review_items has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.guest_imports'::regclass),
  'guest_imports has RLS enabled'
);

update public.exercises
set is_published = false
where id = (
  select id
  from public.exercises
  where is_published = true
  order by slug
  limit 1
);

set local role anon;

select ok(
  (select count(*) from public.exercises where is_published = true) > 0,
  'anonymous users can read published exercises'
);

select is(
  (
    select count(*)::integer
    from public.exercises
    where is_published = false
  ),
  0,
  'anonymous users cannot read unpublished exercises'
);

reset role;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-00000000000a', 'user-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'user-b@example.test');

do $$
declare
  published_exercise_id uuid;
begin
  select id into published_exercise_id
  from public.exercises
  where is_published = true
  order by slug
  limit 1;

  if published_exercise_id is null then
    raise exception 'RLS tests require at least one published exercise';
  end if;

  insert into public.exercise_attempts (
    client_attempt_id,
    user_id,
    exercise_id,
    exercise_version,
    learning_mode,
    completed,
    started_at,
    accuracy_score
  )
  values
    (
      '10000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-00000000000a',
      published_exercise_id,
      1,
      'memory_review',
      false,
      now(),
      0
    ),
    (
      '10000000-0000-4000-8000-00000000000b',
      '00000000-0000-4000-8000-00000000000b',
      published_exercise_id,
      1,
      'memory_review',
      false,
      now(),
      0
    );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',
  true
);

select is(
  (
    select count(*)::integer
    from public.exercise_attempts
    where user_id = '00000000-0000-4000-8000-00000000000a'
  ),
  1,
  'user A can read their own attempt'
);

select is(
  (
    select count(*)::integer
    from public.exercise_attempts
    where user_id = '00000000-0000-4000-8000-00000000000b'
  ),
  0,
  'user A cannot read user B attempts'
);

select throws_ok(
  $$
    insert into public.exercise_attempts (
      client_attempt_id,
      user_id,
      exercise_id,
      exercise_version,
      learning_mode,
      completed,
      started_at,
      accuracy_score
    )
    select
      '20000000-0000-4000-8000-00000000000b',
      '00000000-0000-4000-8000-00000000000b',
      id,
      1,
      'memory_review',
      false,
      now(),
      0
    from public.exercises
    where is_published = true
    limit 1
  $$,
  'user A cannot insert an attempt owned by user B'
);

select throws_ok(
  $$
    update public.exercise_attempts
    set accuracy_score = 99
    where user_id = '00000000-0000-4000-8000-00000000000a'
  $$,
  'authenticated users cannot update append-only attempts'
);

select throws_ok(
  $$
    delete from public.exercise_attempts
    where user_id = '00000000-0000-4000-8000-00000000000a'
  $$,
  'authenticated users cannot delete attempts'
);

select is(
  (
    select count(*)::integer
    from public.exercise_attempts
    where user_id = '00000000-0000-4000-8000-00000000000a'
  ),
  1,
  'failed mutations leave the append-only attempt intact'
);

select * from finish();
rollback;
