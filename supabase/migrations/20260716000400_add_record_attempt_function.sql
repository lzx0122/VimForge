create function public.record_exercise_attempt(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_attempt_id uuid;
  v_client_attempt_id uuid;
  v_session_id uuid;
  v_exercise_id uuid;
  v_exercise_version integer;
  v_learning_mode text;
  v_source text;
  v_completed boolean;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_duration_ms integer;
  v_keystroke_count integer;
  v_recommended_keystroke_count integer;
  v_mistake_count smallint;
  v_undo_count smallint;
  v_reset_count smallint;
  v_hint_level smallint;
  v_used_recommended boolean;
  v_normalized_actions jsonb;
  v_speed_score smallint;
  v_accuracy_score smallint;
  v_performance_quality smallint;
  v_practice_context text;
  v_skill record;
  v_primary_skill_id uuid;
  v_primary_mastery_level smallint;
  v_primary_mastery_score numeric(6, 2);
  v_previous_level smallint;
  v_previous_score numeric(6, 2);
  v_successful_attempts integer;
  v_failed_attempts integer;
  v_unique_exercises integer;
  v_consecutive_successes integer;
  v_average_speed numeric(6, 2);
  v_average_accuracy numeric(6, 2);
  v_average_hint numeric(4, 2);
  v_previous_attempt_count integer;
  v_next_level smallint;
  v_next_score numeric(6, 2);
  v_score_delta numeric;
  v_is_success boolean;
  v_has_seven_day_success boolean;
  v_current_interval numeric(6, 2);
  v_next_interval numeric(6, 2);
  v_due_at timestamptz;
  v_review_status text;
  v_review_priority smallint;
  v_last_result text;
  v_mastery jsonb := '[]'::jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Attempt payload must be a JSON object.'
      using errcode = '22023';
  end if;

  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication is required to record an attempt.'
      using errcode = '28000';
  end if;

  v_client_attempt_id := nullif(payload ->> 'clientAttemptId', '')::uuid;
  v_session_id := nullif(payload ->> 'sessionId', '')::uuid;
  v_exercise_id := nullif(payload ->> 'exerciseId', '')::uuid;
  v_exercise_version := (payload ->> 'exerciseVersion')::integer;
  v_learning_mode := payload ->> 'learningMode';
  v_source := coalesce(nullif(payload ->> 'source', ''), 'web');
  v_completed := (payload ->> 'completed')::boolean;
  v_started_at := (payload ->> 'startedAt')::timestamptz;
  v_completed_at := nullif(payload ->> 'completedAt', '')::timestamptz;
  v_duration_ms := nullif(payload ->> 'durationMs', '')::integer;
  v_keystroke_count := coalesce((payload ->> 'keystrokeCount')::integer, 0);
  v_recommended_keystroke_count :=
    nullif(payload ->> 'recommendedKeystrokeCount', '')::integer;
  v_mistake_count := coalesce((payload ->> 'mistakeCount')::smallint, 0);
  v_undo_count := coalesce((payload ->> 'undoCount')::smallint, 0);
  v_reset_count := coalesce((payload ->> 'resetCount')::smallint, 0);
  v_hint_level := coalesce((payload ->> 'highestHintLevel')::smallint, 0);
  v_used_recommended := coalesce(
    (payload ->> 'usedRecommendedSolution')::boolean,
    false
  );
  v_normalized_actions := payload -> 'normalizedActions';
  v_speed_score := (payload ->> 'speedScore')::smallint;
  v_accuracy_score := (payload ->> 'accuracyScore')::smallint;
  v_performance_quality := (payload ->> 'performanceQuality')::smallint;
  v_practice_context := payload ->> 'practiceContext';

  if v_client_attempt_id is null or v_exercise_id is null then
    raise exception 'clientAttemptId and exerciseId are required.'
      using errcode = '22023';
  end if;
  if v_performance_quality is null
    or v_performance_quality not between 0 and 5 then
    raise exception 'performanceQuality must be between 0 and 5.'
      using errcode = '22023';
  end if;
  if v_practice_context not in (
    'same_exercise_immediate',
    'different_exercise',
    'next_day',
    'seven_days'
  ) then
    raise exception 'Invalid practiceContext.' using errcode = '22023';
  end if;

  insert into public.exercise_attempts (
    client_attempt_id,
    user_id,
    session_id,
    exercise_id,
    exercise_version,
    learning_mode,
    source,
    completed,
    started_at,
    completed_at,
    duration_ms,
    keystroke_count,
    recommended_keystroke_count,
    mistake_count,
    undo_count,
    reset_count,
    hint_level_used,
    used_recommended_solution,
    normalized_actions,
    speed_score,
    accuracy_score
  ) values (
    v_client_attempt_id,
    v_user_id,
    v_session_id,
    v_exercise_id,
    v_exercise_version,
    v_learning_mode,
    v_source,
    v_completed,
    v_started_at,
    v_completed_at,
    v_duration_ms,
    v_keystroke_count,
    v_recommended_keystroke_count,
    v_mistake_count,
    v_undo_count,
    v_reset_count,
    v_hint_level,
    v_used_recommended,
    v_normalized_actions,
    v_speed_score,
    v_accuracy_score
  )
  on conflict (user_id, client_attempt_id) do nothing
  returning id into v_attempt_id;

  if v_attempt_id is null then
    select
      exercise_attempts.id,
      exercise_attempts.exercise_id
    into
      v_attempt_id,
      v_exercise_id
    from public.exercise_attempts
    where exercise_attempts.user_id = v_user_id
      and exercise_attempts.client_attempt_id = v_client_attempt_id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'skillId', user_skill_mastery.skill_id,
          'masteryLevel', user_skill_mastery.mastery_level,
          'masteryScore', user_skill_mastery.mastery_score
        )
        order by user_skill_mastery.skill_id
      ),
      '[]'::jsonb
    )
    into v_mastery
    from public.user_skill_mastery
    join public.exercise_skills
      on exercise_skills.skill_id = user_skill_mastery.skill_id
    where user_skill_mastery.user_id = v_user_id
      and exercise_skills.exercise_id = v_exercise_id;

    select user_review_items.due_at
    into v_due_at
    from public.user_review_items
    where user_review_items.user_id = v_user_id
      and user_review_items.exercise_id = v_exercise_id;

    return jsonb_build_object(
      'attemptId', v_attempt_id,
      'mastery', v_mastery,
      'dueAt', v_due_at
    );
  end if;

  insert into public.user_exercise_progress (
    user_id,
    exercise_id,
    attempt_count,
    completion_count,
    failure_count,
    best_speed_score,
    best_accuracy_score,
    average_speed_score,
    average_accuracy_score,
    lowest_hint_level_success,
    last_attempt_at,
    last_completed_at,
    updated_at
  ) values (
    v_user_id,
    v_exercise_id,
    1,
    case when v_completed then 1 else 0 end,
    case when v_completed then 0 else 1 end,
    v_speed_score,
    v_accuracy_score,
    v_speed_score,
    v_accuracy_score,
    case when v_completed then v_hint_level else null end,
    coalesce(v_completed_at, v_started_at),
    case when v_completed then coalesce(v_completed_at, v_started_at) else null end,
    now()
  )
  on conflict (user_id, exercise_id) do update set
    attempt_count = user_exercise_progress.attempt_count + 1,
    completion_count = user_exercise_progress.completion_count
      + case when v_completed then 1 else 0 end,
    failure_count = user_exercise_progress.failure_count
      + case when v_completed then 0 else 1 end,
    best_speed_score = greatest(
      coalesce(user_exercise_progress.best_speed_score, v_speed_score),
      v_speed_score
    ),
    best_accuracy_score = greatest(
      coalesce(user_exercise_progress.best_accuracy_score, v_accuracy_score),
      v_accuracy_score
    ),
    average_speed_score = round((
      coalesce(user_exercise_progress.average_speed_score, 0)
        * user_exercise_progress.attempt_count
      + v_speed_score
    ) / (user_exercise_progress.attempt_count + 1), 2),
    average_accuracy_score = round((
      coalesce(user_exercise_progress.average_accuracy_score, 0)
        * user_exercise_progress.attempt_count
      + v_accuracy_score
    ) / (user_exercise_progress.attempt_count + 1), 2),
    lowest_hint_level_success = case
      when not v_completed then user_exercise_progress.lowest_hint_level_success
      else least(
        coalesce(
          user_exercise_progress.lowest_hint_level_success,
          v_hint_level
        ),
        v_hint_level
      )
    end,
    last_attempt_at = coalesce(v_completed_at, v_started_at),
    last_completed_at = case
      when v_completed then coalesce(v_completed_at, v_started_at)
      else user_exercise_progress.last_completed_at
    end,
    updated_at = now();

  v_is_success := v_completed and v_performance_quality >= 3;

  for v_skill in
    select
      exercise_skills.skill_id,
      exercise_skills.weight,
      exercise_skills.is_primary
    from public.exercise_skills
    where exercise_skills.exercise_id = v_exercise_id
    order by
      exercise_skills.is_primary desc,
      exercise_skills.weight desc,
      exercise_skills.skill_id
  loop
    insert into public.user_skill_mastery (user_id, skill_id)
    values (v_user_id, v_skill.skill_id)
    on conflict (user_id, skill_id) do nothing;

    select
      user_skill_mastery.mastery_level,
      user_skill_mastery.mastery_score,
      user_skill_mastery.successful_attempts,
      user_skill_mastery.failed_attempts,
      user_skill_mastery.consecutive_successes,
      user_skill_mastery.average_speed_score,
      user_skill_mastery.average_accuracy_score,
      user_skill_mastery.average_hint_level
    into
      v_previous_level,
      v_previous_score,
      v_successful_attempts,
      v_failed_attempts,
      v_consecutive_successes,
      v_average_speed,
      v_average_accuracy,
      v_average_hint
    from public.user_skill_mastery
    where user_skill_mastery.user_id = v_user_id
      and user_skill_mastery.skill_id = v_skill.skill_id
    for update;

    v_previous_attempt_count := v_successful_attempts + v_failed_attempts;
    v_successful_attempts := v_successful_attempts
      + case when v_is_success then 1 else 0 end;
    v_failed_attempts := v_failed_attempts
      + case when v_is_success then 0 else 1 end;
    v_consecutive_successes := case
      when v_is_success then v_consecutive_successes + 1
      else 0
    end;

    select count(distinct exercise_attempts.exercise_id)::integer
    into v_unique_exercises
    from public.exercise_attempts
    join public.exercise_skills
      on exercise_skills.exercise_id = exercise_attempts.exercise_id
    where exercise_attempts.user_id = v_user_id
      and exercise_skills.skill_id = v_skill.skill_id
      and exercise_attempts.completed;

    select exists (
      select 1
      from public.exercise_attempts
      join public.exercise_skills
        on exercise_skills.exercise_id = exercise_attempts.exercise_id
      where exercise_attempts.user_id = v_user_id
        and exercise_skills.skill_id = v_skill.skill_id
        and exercise_attempts.completed
        and exercise_attempts.hint_level_used = 0
        and exercise_attempts.completed_at <=
          coalesce(v_completed_at, v_started_at) - interval '7 days'
    )
    into v_has_seven_day_success;

    v_score_delta := case v_performance_quality
      when 0 then -12
      when 1 then -8
      when 2 then -4
      when 3 then 4
      when 4 then 7
      else 10
    end;
    v_score_delta := v_score_delta * case v_learning_mode
      when 'beginner' then 0.75
      when 'memory_review' then 1.0
      else 1.15
    end;
    v_score_delta := v_score_delta * case v_hint_level
      when 0 then 1.0
      when 1 then 0.85
      when 2 then 0.65
      when 3 then 0.4
      else 0.15
    end;
    v_score_delta := v_score_delta * case v_practice_context
      when 'same_exercise_immediate' then 0.4
      when 'different_exercise' then 1.0
      when 'next_day' then 1.2
      else 1.35
    end;
    v_score_delta := v_score_delta * v_skill.weight;

    if v_performance_quality <= 2 and v_previous_level >= 4 then
      v_score_delta := greatest(v_score_delta, -5);
    end if;

    v_next_score := round(
      greatest(0, least(100, v_previous_score + v_score_delta)),
      2
    );
    v_next_level := case
      when v_next_score >= 85
        and v_successful_attempts >= 10
        and v_unique_exercises >= 5
        and v_consecutive_successes >= 5
        and v_has_seven_day_success then 5
      when v_next_score >= 75
        and v_successful_attempts >= 6
        and v_unique_exercises >= 3
        and v_consecutive_successes >= 3 then 4
      when v_next_score >= 60
        and v_successful_attempts >= 3
        and v_unique_exercises >= 2
        and v_consecutive_successes >= 2 then 3
      when v_next_score >= 40 then 2
      when v_next_score >= 20 then 1
      else 0
    end;

    if v_performance_quality <= 2 and v_previous_level = 5 then
      v_next_level := greatest(v_next_level, 4);
    elsif v_performance_quality <= 2 and v_previous_level = 4 then
      v_next_level := greatest(v_next_level, 3);
    end if;

    update public.user_skill_mastery
    set
      mastery_level = v_next_level,
      mastery_score = v_next_score,
      successful_attempts = v_successful_attempts,
      failed_attempts = v_failed_attempts,
      unique_exercises_completed = v_unique_exercises,
      consecutive_successes = v_consecutive_successes,
      average_speed_score = round((
        coalesce(v_average_speed, 0) * v_previous_attempt_count
        + v_speed_score
      ) / (v_previous_attempt_count + 1), 2),
      average_accuracy_score = round((
        coalesce(v_average_accuracy, 0) * v_previous_attempt_count
        + v_accuracy_score
      ) / (v_previous_attempt_count + 1), 2),
      average_hint_level = round((
        coalesce(v_average_hint, 0) * v_previous_attempt_count
        + v_hint_level
      ) / (v_previous_attempt_count + 1), 2),
      last_practiced_at = coalesce(v_completed_at, v_started_at),
      last_success_at = case
        when v_is_success then coalesce(v_completed_at, v_started_at)
        else user_skill_mastery.last_success_at
      end,
      updated_at = now()
    where user_skill_mastery.user_id = v_user_id
      and user_skill_mastery.skill_id = v_skill.skill_id;

    v_mastery := v_mastery || jsonb_build_array(jsonb_build_object(
      'skillId', v_skill.skill_id,
      'masteryLevel', v_next_level,
      'masteryScore', v_next_score
    ));

    if v_primary_skill_id is null or v_skill.is_primary then
      v_primary_skill_id := v_skill.skill_id;
      v_primary_mastery_level := v_next_level;
      v_primary_mastery_score := v_next_score;
    end if;
  end loop;

  if v_primary_skill_id is null then
    raise exception 'Exercise must have at least one skill.'
      using errcode = '23514';
  end if;

  select user_review_items.current_interval_days
  into v_current_interval
  from public.user_review_items
  where user_review_items.user_id = v_user_id
    and user_review_items.exercise_id = v_exercise_id;
  v_current_interval := coalesce(v_current_interval, 0);

  if v_performance_quality <= 2 then
    v_next_interval := 0;
    v_due_at := coalesce(v_completed_at, v_started_at) + interval '10 minutes';
    v_last_result := 'failed';
  else
    v_next_interval := greatest(
      v_current_interval,
      case v_primary_mastery_level
        when 0 then 0.25
        when 1 then 1
        when 2 then 3
        when 3 then 7
        when 4 then 14
        else 30
      end
    ) * case v_performance_quality
      when 3 then 0.75
      when 4 then 1
      else 1.25
    end;
    v_next_interval := round(least(
      v_next_interval,
      case v_hint_level
        when 0 then 30
        when 1 then 14
        when 2 then 7
        when 3 then 3
        else 1
      end,
      30
    ), 2);
    v_due_at := coalesce(v_completed_at, v_started_at)
      + (v_next_interval * interval '1 day');
    v_last_result := case
      when v_hint_level > 0 then 'completed_with_hint'
      when v_performance_quality = 5 then 'efficient'
      else 'completed'
    end;
  end if;

  v_review_status := case
    when v_primary_mastery_level = 5 then 'mastered'
    when v_primary_mastery_level >= 3 then 'reviewing'
    else 'learning'
  end;
  v_review_priority := case
    when v_performance_quality <= 2 then 100
    when v_hint_level >= 3 then 90
    when v_accuracy_score < 60 then 80
    when v_speed_score < 50 then 70
    else greatest(10, least(100, round(100 - v_primary_mastery_score)))
  end;

  insert into public.user_review_items (
    user_id,
    exercise_id,
    skill_id,
    review_status,
    priority,
    current_interval_days,
    due_at,
    last_reviewed_at,
    last_result,
    updated_at
  ) values (
    v_user_id,
    v_exercise_id,
    v_primary_skill_id,
    v_review_status,
    v_review_priority,
    v_next_interval,
    v_due_at,
    coalesce(v_completed_at, v_started_at),
    v_last_result,
    now()
  )
  on conflict (user_id, exercise_id) do update set
    skill_id = excluded.skill_id,
    review_status = excluded.review_status,
    priority = excluded.priority,
    current_interval_days = excluded.current_interval_days,
    due_at = excluded.due_at,
    last_reviewed_at = excluded.last_reviewed_at,
    last_result = excluded.last_result,
    updated_at = excluded.updated_at;

  if v_session_id is not null then
    update public.practice_sessions
    set
      current_index = least(
        practice_sessions.current_index + 1,
        jsonb_array_length(practice_sessions.exercise_plan)
      ),
      status = case
        when practice_sessions.current_index + 1 >=
          jsonb_array_length(practice_sessions.exercise_plan)
          then 'completed'
        else practice_sessions.status
      end,
      completed_at = case
        when practice_sessions.current_index + 1 >=
          jsonb_array_length(practice_sessions.exercise_plan)
          then coalesce(v_completed_at, v_started_at)
        else practice_sessions.completed_at
      end,
      updated_at = now()
    where practice_sessions.id = v_session_id
      and practice_sessions.user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'attemptId', v_attempt_id,
    'mastery', v_mastery,
    'dueAt', v_due_at
  );
end;
$$;

revoke execute on function public.record_exercise_attempt(jsonb) from public, anon;
grant execute on function public.record_exercise_attempt(jsonb) to authenticated;
