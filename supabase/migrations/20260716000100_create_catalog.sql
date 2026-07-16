create table public.learning_units (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) > 0),
  description text not null check (char_length(description) > 0),
  difficulty text not null
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  estimated_minutes smallint not null check (estimated_minutes > 0),
  display_order smallint not null unique check (display_order > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) > 0),
  description text not null check (char_length(description) > 0),
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

create table public.unit_skills (
  unit_id uuid not null
    references public.learning_units(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  is_primary boolean not null default false,
  display_order smallint not null default 0 check (display_order >= 0),
  primary key (unit_id, skill_id)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.learning_units(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) > 0),
  instruction text not null check (char_length(instruction) > 0),
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
  initial_cursor jsonb not null check (
    jsonb_typeof(initial_cursor) = 'object'
    and initial_cursor ? 'line'
    and initial_cursor ? 'column'
    and jsonb_typeof(initial_cursor -> 'line') = 'number'
    and jsonb_typeof(initial_cursor -> 'column') = 'number'
    and (initial_cursor ->> 'line')::integer >= 0
    and (initial_cursor ->> 'column')::integer >= 0
  ),
  completion_rule jsonb not null
    check (jsonb_typeof(completion_rule) = 'object'),
  supported_modes text[] not null,
  target_duration_ms integer not null check (target_duration_ms > 0),
  version integer not null default 1 check (version > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(supported_modes) > 0),
  check (
    supported_modes <@
      array['beginner', 'memory_review', 'efficiency']::text[]
  )
);

create table public.exercise_skills (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  weight numeric(4,3) not null check (weight > 0 and weight <= 1),
  is_primary boolean not null default false,
  primary key (exercise_id, skill_id)
);

create table public.exercise_solutions (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  sequence text not null check (char_length(sequence) > 0),
  normalized_actions jsonb not null
    check (jsonb_typeof(normalized_actions) = 'array'),
  keystroke_count smallint not null check (keystroke_count > 0),
  is_recommended boolean not null default false,
  explanation text not null check (char_length(explanation) > 0),
  display_order smallint not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now()
);

create table public.exercise_hints (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  level smallint not null check (level between 1 and 4),
  content text not null check (char_length(content) > 0),
  command_preview text,
  created_at timestamptz not null default now(),
  unique (exercise_id, level)
);

create index learning_units_published_order_idx
  on public.learning_units (is_published, display_order);
create index skills_category_difficulty_idx
  on public.skills (category, difficulty);
create index unit_skills_display_order_idx
  on public.unit_skills (unit_id, display_order);
create index exercises_unit_published_idx
  on public.exercises (unit_id, is_published, difficulty);
create index exercises_language_idx on public.exercises (language);
create index exercises_supported_modes_idx
  on public.exercises using gin (supported_modes);
create index exercise_skills_skill_idx
  on public.exercise_skills (skill_id, exercise_id);
create unique index exercise_skills_one_primary_idx
  on public.exercise_skills (exercise_id) where is_primary;
create index exercise_solutions_order_idx
  on public.exercise_solutions (exercise_id, display_order);
create unique index exercise_solutions_one_recommended_idx
  on public.exercise_solutions (exercise_id) where is_recommended;
create index exercise_hints_exercise_level_idx
  on public.exercise_hints (exercise_id, level);

alter table public.learning_units enable row level security;
alter table public.skills enable row level security;
alter table public.unit_skills enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_skills enable row level security;
alter table public.exercise_solutions enable row level security;
alter table public.exercise_hints enable row level security;

create policy "learning_units_read_published"
on public.learning_units for select to anon, authenticated
using (is_published = true);

create policy "skills_read_published"
on public.skills for select to anon, authenticated
using (
  exists (
    select 1
    from public.unit_skills
    join public.learning_units
      on learning_units.id = unit_skills.unit_id
    where skills.id = unit_skills.skill_id
      and learning_units.is_published = true
  )
);

create policy "unit_skills_read_published"
on public.unit_skills for select to anon, authenticated
using (
  exists (
    select 1
    from public.learning_units
    where learning_units.id = unit_skills.unit_id
      and learning_units.is_published = true
  )
);

create policy "exercises_read_published"
on public.exercises for select to anon, authenticated
using (is_published = true);

create policy "exercise_skills_read_published"
on public.exercise_skills for select to anon, authenticated
using (
  exists (
    select 1
    from public.exercises
    where exercises.id = exercise_skills.exercise_id
      and exercises.is_published = true
  )
);

create policy "exercise_solutions_read_published"
on public.exercise_solutions for select to anon, authenticated
using (
  exists (
    select 1
    from public.exercises
    where exercises.id = exercise_solutions.exercise_id
      and exercises.is_published = true
  )
);

create policy "exercise_hints_read_published"
on public.exercise_hints for select to anon, authenticated
using (
  exists (
    select 1
    from public.exercises
    where exercises.id = exercise_hints.exercise_id
      and exercises.is_published = true
  )
);

revoke all on table
  public.learning_units,
  public.skills,
  public.unit_skills,
  public.exercises,
  public.exercise_skills,
  public.exercise_solutions,
  public.exercise_hints
from anon, authenticated;

grant select on table
  public.learning_units,
  public.skills,
  public.unit_skills,
  public.exercises,
  public.exercise_skills,
  public.exercise_solutions,
  public.exercise_hints
to anon, authenticated;
