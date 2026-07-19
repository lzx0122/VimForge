create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  editor_font_size smallint not null default 16
    check (editor_font_size between 12 and 28),
  show_line_numbers boolean not null default true,
  show_keypresses boolean not null default true,
  sound_enabled boolean not null default false,
  preferred_question_count smallint not null default 10
    check (preferred_question_count in (5, 10, 20)),
  last_learning_mode text check (
    last_learning_mode in ('beginner', 'memory_review', 'efficiency')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  learning_mode text not null check (
    learning_mode in ('beginner', 'memory_review', 'efficiency')
  ),
  selection_type text not null check (
    selection_type in (
      'course', 'daily_review', 'topic_practice', 'weakness_practice'
    )
  ),
  requested_count smallint check (
    requested_count is null or requested_count in (5, 10, 20)
  ),
  status text not null default 'active' check (
    status in ('active', 'completed', 'abandoned')
  ),
  current_index smallint not null default 0 check (current_index >= 0),
  exercise_plan jsonb not null
    check (jsonb_typeof(exercise_plan) = 'array'),
  selected_skill_ids uuid[],
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at)
);

create table public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  client_attempt_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.practice_sessions(id) on delete set null,
  exercise_id uuid not null references public.exercises(id),
  exercise_version integer not null check (exercise_version > 0),
  learning_mode text not null check (
    learning_mode in ('beginner', 'memory_review', 'efficiency')
  ),
  source text not null default 'web' check (
    source in ('web', 'neovim', 'ideavim', 'vscode_vim')
  ),
  completed boolean not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  keystroke_count integer not null default 0 check (keystroke_count >= 0),
  recommended_keystroke_count integer check (
    recommended_keystroke_count is null or recommended_keystroke_count > 0
  ),
  mistake_count smallint not null default 0 check (mistake_count >= 0),
  undo_count smallint not null default 0 check (undo_count >= 0),
  reset_count smallint not null default 0 check (reset_count >= 0),
  hint_level_used smallint not null default 0
    check (hint_level_used between 0 and 4),
  used_recommended_solution boolean not null default false,
  normalized_actions jsonb check (
    normalized_actions is null or jsonb_typeof(normalized_actions) = 'array'
  ),
  speed_score smallint check (speed_score between 0 and 100),
  accuracy_score smallint not null check (accuracy_score between 0 and 100),
  scoring_version text not null default 'v1'
    check (char_length(scoring_version) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, client_attempt_id),
  check (completed_at is null or completed_at >= started_at)
);

create table public.user_exercise_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  completion_count integer not null default 0 check (completion_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  best_speed_score smallint check (best_speed_score between 0 and 100),
  best_accuracy_score smallint check (best_accuracy_score between 0 and 100),
  average_speed_score numeric(6, 2)
    check (average_speed_score between 0 and 100),
  average_accuracy_score numeric(6, 2)
    check (average_accuracy_score between 0 and 100),
  lowest_hint_level_success smallint
    check (lowest_hint_level_success between 0 and 4),
  last_attempt_at timestamptz,
  last_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create table public.user_skill_mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  mastery_level smallint not null default 0
    check (mastery_level between 0 and 5),
  mastery_score numeric(6, 2) not null default 0
    check (mastery_score between 0 and 100),
  successful_attempts integer not null default 0
    check (successful_attempts >= 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  unique_exercises_completed integer not null default 0
    check (unique_exercises_completed >= 0),
  consecutive_successes integer not null default 0
    check (consecutive_successes >= 0),
  average_speed_score numeric(6, 2)
    check (average_speed_score between 0 and 100),
  average_accuracy_score numeric(6, 2)
    check (average_accuracy_score between 0 and 100),
  average_hint_level numeric(4, 2)
    check (average_hint_level between 0 and 4),
  last_practiced_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

create table public.user_review_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  review_status text not null default 'learning' check (
    review_status in ('learning', 'reviewing', 'mastered', 'suspended')
  ),
  priority smallint not null default 50 check (priority between 0 and 100),
  current_interval_days numeric(6, 2) not null default 0
    check (current_interval_days between 0 and 30),
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  last_result text check (
    last_result is null or last_result in (
      'failed', 'completed_with_hint', 'completed', 'efficient'
    )
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create table public.guest_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null,
  import_batch_id uuid not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  status text not null check (status in ('processing', 'completed', 'failed')),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, guest_id)
);

create index attempts_user_created_idx
  on public.exercise_attempts (user_id, created_at desc);
create index attempts_user_exercise_created_idx
  on public.exercise_attempts (user_id, exercise_id, created_at desc);
create index sessions_user_status_updated_idx
  on public.practice_sessions (user_id, status, updated_at desc);
create index progress_user_last_attempt_idx
  on public.user_exercise_progress (user_id, last_attempt_at desc);
create index mastery_user_level_idx
  on public.user_skill_mastery (user_id, mastery_level);
create index review_user_due_idx
  on public.user_review_items (user_id, due_at);
create index review_user_priority_due_idx
  on public.user_review_items (user_id, priority desc, due_at);
create index guest_imports_user_status_idx
  on public.guest_imports (user_id, status, created_at desc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Vim learner'
    ), 50),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
