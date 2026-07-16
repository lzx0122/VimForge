# Supabase Database Schema

## 1. Schema 原則

- 使用 PostgreSQL。
- 所有 `public` tables 啟用 RLS。
- 題庫為公開唯讀。
- 使用者資料只能由本人讀寫。
- Attempt append-only。
- 熟練與複習摘要由資料庫 Transaction 更新。
- 所有時間使用 `timestamptz`。
- 所有 UUID 預設 `gen_random_uuid()`。
- 所有可枚舉文字欄位使用 `check` constraint。

## 2. Tables

### 2.1 profiles

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 2.2 user_settings

```sql
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  editor_font_size smallint not null default 16
    check (editor_font_size between 12 and 28),
  show_line_numbers boolean not null default true,
  show_keypresses boolean not null default true,
  sound_enabled boolean not null default false,
  preferred_question_count smallint not null default 10
    check (preferred_question_count in (5, 10, 20)),
  last_learning_mode text
    check (last_learning_mode in ('beginner', 'memory_review', 'efficiency')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 2.3 learning_units

```sql
create table public.learning_units (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  difficulty text not null
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  estimated_minutes smallint not null check (estimated_minutes > 0),
  display_order smallint not null unique,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 2.4 skills

```sql
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  category text not null check (
    category in (
      'mode', 'movement', 'editing', 'copy_paste',
      'find', 'search', 'text_object', 'visual', 'composition'
    )
  ),
  difficulty text not null
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 2.5 unit_skills

```sql
create table public.unit_skills (
  unit_id uuid not null references public.learning_units(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  is_primary boolean not null default false,
  display_order smallint not null default 0,
  primary key (unit_id, skill_id)
);
```

### 2.6 exercises

```sql
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.learning_units(id),
  slug text not null unique,
  title text not null,
  instruction text not null,
  language text not null check (
    language in (
      'csharp', 'typescript', 'javascript', 'json',
      'html', 'css', 'sql', 'markdown', 'plaintext'
    )
  ),
  exercise_type text not null check (
    exercise_type in ('tutorial', 'guided', 'challenge', 'review')
  ),
  difficulty text not null check (
    difficulty in ('beginner', 'intermediate', 'advanced')
  ),
  initial_content text not null,
  expected_content text not null,
  initial_cursor jsonb not null,
  completion_rule jsonb not null,
  supported_modes text[] not null,
  target_duration_ms integer not null check (target_duration_ms > 0),
  version integer not null default 1 check (version > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    supported_modes <@ array['beginner', 'memory_review', 'efficiency']::text[]
  )
);
```

`initial_cursor`：

```json
{ "line": 0, "column": 4 }
```

`completion_rule`：

```json
{
  "contentMatch": "exact",
  "cursorMatch": {
    "type": "exact",
    "line": 0,
    "column": 8
  },
  "requiredMode": "normal"
}
```

### 2.7 exercise_skills

```sql
create table public.exercise_skills (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  weight numeric(4,3) not null check (weight > 0 and weight <= 1),
  is_primary boolean not null default false,
  primary key (exercise_id, skill_id)
);
```

每題所有技能權重總和必須由 Seed Validation 測試確認為 `1.0`。

### 2.8 exercise_solutions

```sql
create table public.exercise_solutions (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  sequence text not null,
  normalized_actions jsonb not null,
  keystroke_count smallint not null check (keystroke_count > 0),
  is_recommended boolean not null default false,
  explanation text not null,
  display_order smallint not null default 0,
  created_at timestamptz not null default now()
);
```

每題至少一個 `is_recommended = true`，由 Seed Validation 測試確認。

### 2.9 exercise_hints

```sql
create table public.exercise_hints (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  level smallint not null check (level between 1 and 4),
  content text not null,
  command_preview text,
  created_at timestamptz not null default now(),
  unique (exercise_id, level)
);
```

### 2.10 practice_sessions

```sql
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
  requested_count smallint
    check (requested_count is null or requested_count in (5, 10, 20)),
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned')),
  current_index smallint not null default 0 check (current_index >= 0),
  exercise_plan jsonb not null,
  selected_skill_ids uuid[],
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
```

### 2.11 exercise_attempts

```sql
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
  recommended_keystroke_count integer
    check (recommended_keystroke_count is null or recommended_keystroke_count > 0),
  mistake_count smallint not null default 0 check (mistake_count >= 0),
  undo_count smallint not null default 0 check (undo_count >= 0),
  reset_count smallint not null default 0 check (reset_count >= 0),
  hint_level_used smallint not null default 0 check (hint_level_used between 0 and 4),
  used_recommended_solution boolean not null default false,
  normalized_actions jsonb,
  speed_score smallint check (speed_score between 0 and 100),
  accuracy_score smallint not null check (accuracy_score between 0 and 100),
  scoring_version text not null default 'v1',
  created_at timestamptz not null default now(),
  unique (user_id, client_attempt_id)
);
```

### 2.12 user_exercise_progress

```sql
create table public.user_exercise_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  completion_count integer not null default 0 check (completion_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  best_speed_score smallint check (best_speed_score between 0 and 100),
  best_accuracy_score smallint check (best_accuracy_score between 0 and 100),
  average_speed_score numeric(6,2),
  average_accuracy_score numeric(6,2),
  lowest_hint_level_success smallint
    check (lowest_hint_level_success between 0 and 4),
  last_attempt_at timestamptz,
  last_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
```

### 2.13 user_skill_mastery

```sql
create table public.user_skill_mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  mastery_level smallint not null default 0 check (mastery_level between 0 and 5),
  mastery_score numeric(6,2) not null default 0
    check (mastery_score between 0 and 100),
  successful_attempts integer not null default 0 check (successful_attempts >= 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  unique_exercises_completed integer not null default 0
    check (unique_exercises_completed >= 0),
  consecutive_successes integer not null default 0
    check (consecutive_successes >= 0),
  average_speed_score numeric(6,2),
  average_accuracy_score numeric(6,2),
  average_hint_level numeric(4,2),
  last_practiced_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
```

### 2.14 user_review_items

```sql
create table public.user_review_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  review_status text not null default 'learning'
    check (review_status in ('learning', 'reviewing', 'mastered', 'suspended')),
  priority smallint not null default 50 check (priority between 0 and 100),
  current_interval_days numeric(6,2) not null default 0
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
```

### 2.15 guest_imports

```sql
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
```

## 3. Indexes

```sql
create index exercises_unit_published_idx
  on public.exercises(unit_id, is_published);

create index exercises_difficulty_published_idx
  on public.exercises(difficulty, is_published);

create index review_user_due_idx
  on public.user_review_items(user_id, due_at);

create index review_user_priority_due_idx
  on public.user_review_items(user_id, priority desc, due_at);

create index attempts_user_created_idx
  on public.exercise_attempts(user_id, created_at desc);

create index attempts_user_exercise_created_idx
  on public.exercise_attempts(user_id, exercise_id, created_at desc);

create index sessions_user_status_updated_idx
  on public.practice_sessions(user_id, status, updated_at desc);

create index mastery_user_level_idx
  on public.user_skill_mastery(user_id, mastery_level);
```

## 4. RLS

題庫：

- `learning_units` 與 `exercises` 只公開 `is_published = true`。
- `skills` 可公開唯讀；技能本身不包含答案或私人資料。
- `unit_skills`、`exercise_skills`、`exercise_solutions`、`exercise_hints` 只能在其關聯的 Unit／Exercise 已發布時讀取。

```sql
alter table public.learning_units enable row level security;

create policy "published units are readable"
on public.learning_units
for select
to anon, authenticated
using (is_published = true);
```

同樣套用至：

- `skills`
- `unit_skills`
- `exercises`
- `exercise_skills`
- `exercise_solutions`
- `exercise_hints`

關聯表政策必須驗證所關聯 Exercise／Unit 已發布。

使用者表範例：

```sql
alter table public.practice_sessions enable row level security;

create policy "users select own sessions"
on public.practice_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users insert own sessions"
on public.practice_sessions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update own sessions"
on public.practice_sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
```

其他使用者資料表使用相同擁有者模型。

一般使用者不提供直接刪除 Attempts 的政策。

## 5. record_exercise_attempt Function

前端不直接依序修改多張摘要表。

建立單一 Transaction 函式：

```text
record_exercise_attempt(payload jsonb)
```

必要行為：

1. 確認 `auth.uid()` 存在。
2. 忽略 Payload 中偽造的 `user_id`。
3. 使用目前 `auth.uid()`。
4. 依 `(user_id, client_attempt_id)` 去重。
5. Insert `exercise_attempts`。
6. Upsert `user_exercise_progress`。
7. 依 `exercise_skills.weight` 更新 `user_skill_mastery`。
8. Upsert `user_review_items`。
9. 更新 `practice_sessions.current_index`。
10. 同一 Transaction 完成。
11. 回傳 Attempt ID、最新熟練度與 dueAt。

MVP 的 RPC 使用 `security invoker`，讓 RLS 繼續生效：

- 函式放在 `public`，供 Supabase RPC 呼叫。
- 函式宣告 `security invoker`。
- 函式內使用 `(select auth.uid())`，不得接受前端傳入的 `user_id`。
- 所有資料表操作仍受 own-row RLS policy 保護。
- 建立後 `revoke execute on function ... from public, anon;`。
- 只 `grant execute ... to authenticated;`。
- 若未來確實需要 `security definer` 的內部輔助函式，必須放在非 exposed schema、固定 `search_path`，且不可直接授權前端角色。

## 6. Profile 建立

Auth 使用者建立後，以 Trigger 建立：

- `profiles`
- `user_settings`

Trigger 不得將 `raw_user_meta_data` 用於授權。

可讀取 `full_name` 與 `avatar_url` 作顯示用途，但須提供 fallback。

## 7. Seed Data 驗證

Seed 完成後必須通過：

- 10 個 published units。
- 約 100 個 published exercises。
- 每題至少 1 個 Skill。
- 每題 Skill 權重總和 = 1。
- 每題至少 1 個推薦解法。
- 每題 Hint Level 不重複。
- 語言比例接近 60/20/20。
- supported_modes 只包含合法值。
- 游標位置不超出 initial_content。
- expected_content 與 completion_rule 可被 TypeScript Schema 驗證。
