alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.user_exercise_progress enable row level security;
alter table public.user_skill_mastery enable row level security;
alter table public.user_review_items enable row level security;
alter table public.guest_imports enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "user_settings_select_own"
on public.user_settings for select to authenticated
using ((select auth.uid()) = user_id);
create policy "user_settings_insert_own"
on public.user_settings for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "user_settings_update_own"
on public.user_settings for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "practice_sessions_select_own"
on public.practice_sessions for select to authenticated
using ((select auth.uid()) = user_id);
create policy "practice_sessions_insert_own"
on public.practice_sessions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "practice_sessions_update_own"
on public.practice_sessions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "exercise_attempts_select_own"
on public.exercise_attempts for select to authenticated
using ((select auth.uid()) = user_id);
create policy "exercise_attempts_insert_own"
on public.exercise_attempts for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "user_exercise_progress_select_own"
on public.user_exercise_progress for select to authenticated
using ((select auth.uid()) = user_id);
create policy "user_exercise_progress_insert_own"
on public.user_exercise_progress for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "user_exercise_progress_update_own"
on public.user_exercise_progress for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "user_skill_mastery_select_own"
on public.user_skill_mastery for select to authenticated
using ((select auth.uid()) = user_id);
create policy "user_skill_mastery_insert_own"
on public.user_skill_mastery for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "user_skill_mastery_update_own"
on public.user_skill_mastery for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "user_review_items_select_own"
on public.user_review_items for select to authenticated
using ((select auth.uid()) = user_id);
create policy "user_review_items_insert_own"
on public.user_review_items for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "user_review_items_update_own"
on public.user_review_items for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "guest_imports_select_own"
on public.guest_imports for select to authenticated
using ((select auth.uid()) = user_id);
create policy "guest_imports_insert_own"
on public.guest_imports for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "guest_imports_update_own"
on public.guest_imports for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table
  public.profiles,
  public.user_settings,
  public.practice_sessions,
  public.exercise_attempts,
  public.user_exercise_progress,
  public.user_skill_mastery,
  public.user_review_items,
  public.guest_imports
from anon, authenticated;

grant select, insert, update on table
  public.profiles,
  public.user_settings,
  public.practice_sessions,
  public.user_exercise_progress,
  public.user_skill_mastery,
  public.user_review_items,
  public.guest_imports
to authenticated;

grant select, insert on table public.exercise_attempts to authenticated;
