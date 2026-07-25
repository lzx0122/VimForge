-- Authored but not executed here: this environment has no running
-- PostgreSQL/Supabase instance (Docker daemon unavailable), so this file
-- has not been run against a real database. It must be run via
-- `npm run supabase:cli -- test db` before Task 15 is fully accepted.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- === Step 1: authenticated user and published exercise setup ===

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000000c1', 'hydration-user-a@example.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'hydration-user-b@example.test');

do $$
declare
  target_exercise_id uuid;
  target_skill_id uuid;
begin
  select exercises.id, exercise_skills.skill_id
  into target_exercise_id, target_skill_id
  from public.exercises
  join public.exercise_skills on exercise_skills.exercise_id = exercises.id
  where exercises.is_published = true
  order by exercises.slug, exercise_skills.skill_id
  limit 1;

  if target_exercise_id is null then
    raise exception
      'P1 hydration test requires at least one published exercise with a skill link';
  end if;
end;
$$;

-- === Step 2: call record_exercise_attempt as user A ===

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000c1',
  true
);

do $$
declare
  target_exercise_id uuid;
begin
  select exercises.id
  into target_exercise_id
  from public.exercises
  join public.exercise_skills on exercise_skills.exercise_id = exercises.id
  where exercises.is_published = true
  order by exercises.slug, exercise_skills.skill_id
  limit 1;

  perform public.record_exercise_attempt(jsonb_build_object(
    'clientAttemptId', '10000000-0000-4000-8000-0000000000c1',
    'sessionId', null,
    'exerciseId', target_exercise_id,
    'exerciseVersion', 1,
    'learningMode', 'efficiency',
    'source', 'web',
    'completed', true,
    'startedAt', '2026-07-21T08:00:00.000Z',
    'completedAt', '2026-07-21T08:00:12.000Z',
    'durationMs', 12000,
    'keystrokeCount', 8,
    'recommendedKeystrokeCount', 6,
    'mistakeCount', 0,
    'undoCount', 0,
    'resetCount', 0,
    'highestHintLevel', 0,
    'usedRecommendedSolution', false,
    'normalizedActions', '[]'::jsonb,
    'speedScore', 90,
    'accuracyScore', 95,
    'performanceQuality', 5,
    'practiceContext', 'different_exercise'
  ));
end;
$$;

-- === Steps 3-5: assert stored hydration fields for user A ===

select is(
  (
    select performance_quality
    from public.exercise_attempts
    where client_attempt_id = '10000000-0000-4000-8000-0000000000c1'
  ),
  5::smallint,
  'attempt stores performance_quality'
);

select is(
  (
    select practice_context
    from public.exercise_attempts
    where client_attempt_id = '10000000-0000-4000-8000-0000000000c1'
  ),
  'different_exercise',
  'attempt stores practice_context'
);

select isnt_empty(
  $$
    select 1
    from public.user_skill_mastery as mastery
    join public.exercise_skills
      on exercise_skills.skill_id = mastery.skill_id
    join public.exercise_attempts
      on exercise_attempts.exercise_id = exercise_skills.exercise_id
    where mastery.user_id = '00000000-0000-4000-8000-0000000000c1'
      and exercise_attempts.client_attempt_id
        = '10000000-0000-4000-8000-0000000000c1'
      and exercise_attempts.exercise_id = any(mastery.unique_exercise_ids)
  $$,
  'mastery stores the completed exercise id in unique_exercise_ids'
);

select isnt_empty(
  $$
    select 1
    from public.user_skill_mastery as mastery
    join public.exercise_skills
      on exercise_skills.skill_id = mastery.skill_id
    join public.exercise_attempts
      on exercise_attempts.exercise_id = exercise_skills.exercise_id
    where mastery.user_id = '00000000-0000-4000-8000-0000000000c1'
      and exercise_attempts.client_attempt_id
        = '10000000-0000-4000-8000-0000000000c1'
      and mastery.first_unhinted_success_at = '2026-07-21T08:00:12.000Z'
      and mastery.latest_unhinted_success_at = '2026-07-21T08:00:12.000Z'
  $$,
  'mastery stores the first and latest unhinted-success timestamps'
);

select isnt_empty(
  $$
    select 1
    from public.user_review_items as review
    join public.exercise_attempts
      on exercise_attempts.exercise_id = review.exercise_id
    where review.user_id = '00000000-0000-4000-8000-0000000000c1'
      and exercise_attempts.client_attempt_id
        = '10000000-0000-4000-8000-0000000000c1'
      and review.mastery_level is not null
      and review.last_performance_quality = 5
      and review.last_attempt_at = '2026-07-21T08:00:12.000Z'
  $$,
  'review stores mastery level, last performance quality, and last attempt time'
);

-- === Step 6: user B cannot read user A's hydration rows (RLS) ===

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000c2',
  true
);

select is(
  (
    select count(*)::integer
    from public.exercise_attempts
    where client_attempt_id = '10000000-0000-4000-8000-0000000000c1'
  ),
  0,
  'user B cannot read user A attempt rows'
);

select is(
  (
    select count(*)::integer
    from public.user_skill_mastery
    where user_id = '00000000-0000-4000-8000-0000000000c1'
  ),
  0,
  'user B cannot read user A mastery rows'
);

select is(
  (
    select count(*)::integer
    from public.user_review_items
    where user_id = '00000000-0000-4000-8000-0000000000c1'
  ),
  0,
  'user B cannot read user A review rows'
);

reset role;

-- === Step 7: cursor indexes exist ===

select has_index(
  'public',
  'exercise_attempts',
  'attempts_user_hydration_cursor_idx',
  'attempts_user_hydration_cursor_idx exists'
);
select has_index(
  'public',
  'user_skill_mastery',
  'mastery_user_hydration_cursor_idx',
  'mastery_user_hydration_cursor_idx exists'
);
select has_index(
  'public',
  'user_review_items',
  'reviews_user_hydration_cursor_idx',
  'reviews_user_hydration_cursor_idx exists'
);

select has_column(
  'public', 'exercise_attempts', 'performance_quality',
  'exercise_attempts.performance_quality exists'
);
select has_column(
  'public', 'user_skill_mastery', 'unique_exercise_ids',
  'user_skill_mastery.unique_exercise_ids exists'
);
select has_column(
  'public', 'user_review_items', 'last_attempt_at',
  'user_review_items.last_attempt_at exists'
);

-- === Step 8: roll back ===

select * from finish();
rollback;
