import type { CatalogReleaseExercise, CatalogReleasePlan } from "./catalog-release-plan";

/** Return a single-quoted PostgreSQL literal with apostrophes escaped. */
export function escapeSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlJson(value: unknown): string {
  return `${escapeSqlString(JSON.stringify(value))}::jsonb`;
}

function sqlTextArray(values: readonly string[]): string {
  return `array[${values.map((value) => escapeSqlString(value)).join(", ")}]::text[]`;
}

function sqlBoolean(value: boolean): string {
  return value ? "true" : "false";
}

function renderExercise(exercise: CatalogReleaseExercise): string {
  const item = exercise.exercise;
  const lines = [
    `insert into public.exercises (unit_id, slug, title, instruction, language, exercise_type, difficulty, initial_content, expected_content, initial_cursor, completion_rule, supported_modes, target_duration_ms, version, is_published)`,
    `select id, ${escapeSqlString(item.slug)}, ${escapeSqlString(item.title)}, ${escapeSqlString(item.instruction)}, ${escapeSqlString(item.language)}, ${escapeSqlString(item.exerciseType)}, ${escapeSqlString(item.difficulty)}, ${escapeSqlString(item.initialContent)}, ${escapeSqlString(item.expectedContent)}, ${sqlJson(item.initialCursor)}, ${sqlJson(item.completionRule)}, ${sqlTextArray(item.supportedModes)}, ${item.targetDurationMs}, ${exercise.version}, ${sqlBoolean(exercise.isPublished)}`,
    `from public.learning_units where slug = ${escapeSqlString(exercise.unitSlug)}`,
    `on conflict (slug) do update set unit_id = excluded.unit_id, title = excluded.title, instruction = excluded.instruction, language = excluded.language, exercise_type = excluded.exercise_type, difficulty = excluded.difficulty, initial_content = excluded.initial_content, expected_content = excluded.expected_content, initial_cursor = excluded.initial_cursor, completion_rule = excluded.completion_rule, supported_modes = excluded.supported_modes, target_duration_ms = excluded.target_duration_ms, version = excluded.version, is_published = excluded.is_published, updated_at = now();`,
  ];
  if (exercise.replaceChildren) {
    lines.push(
      `delete from public.exercise_skills where exercise_id = (select id from public.exercises where slug = ${escapeSqlString(item.slug)});`,
      `delete from public.exercise_solutions where exercise_id = (select id from public.exercises where slug = ${escapeSqlString(item.slug)});`,
      `delete from public.exercise_hints where exercise_id = (select id from public.exercises where slug = ${escapeSqlString(item.slug)});`,
    );
    for (const [index, skill] of item.skills.entries()) {
      lines.push(
        `insert into public.exercise_skills (exercise_id, skill_id, weight, is_primary) select e.id, s.id, ${skill.weight}, ${sqlBoolean(skill.primary)} from public.exercises e join public.skills s on s.slug = ${escapeSqlString(skill.skillSlug)} where e.slug = ${escapeSqlString(item.slug)} on conflict (exercise_id, skill_id) do update set weight = excluded.weight, is_primary = excluded.is_primary;`,
      );
      // Keep an explicit stable ordering in generated SQL even when input omitted display metadata.
      void index;
    }
    for (const [index, solution] of item.solutions.entries()) {
      lines.push(
        `insert into public.exercise_solutions (exercise_id, sequence, normalized_actions, keystroke_count, is_recommended, explanation, display_order) select id, ${escapeSqlString(solution.sequence)}, ${sqlJson(solution.normalizedActions)}, ${solution.keystrokeCount}, ${sqlBoolean(solution.recommended)}, ${escapeSqlString(solution.explanation)}, ${solution.displayOrder ?? index} from public.exercises where slug = ${escapeSqlString(item.slug)};`,
      );
    }
    for (const hint of item.hints) {
      lines.push(
        `insert into public.exercise_hints (exercise_id, level, content, command_preview) select id, ${hint.level}, ${escapeSqlString(hint.content)}, ${hint.commandPreview === null ? "null" : escapeSqlString(hint.commandPreview)} from public.exercises where slug = ${escapeSqlString(item.slug)};`,
      );
    }
  }
  return lines.join("\n");
}

function renderPublicationUpdate(exercise: CatalogReleaseExercise): string {
  return `update public.exercises set is_published = ${sqlBoolean(exercise.isPublished)}, updated_at = now() where slug = ${escapeSqlString(exercise.slug)};`;
}

function renderUnitSkillReconciliation(plan: CatalogReleasePlan): string {
  if (plan.unitSkills.length === 0) {
    return "delete from public.unit_skills;";
  }
  const desiredValues = [...plan.unitSkills]
    .sort((a, b) => a.unitSlug.localeCompare(b.unitSlug) || a.skillSlug.localeCompare(b.skillSlug))
    .map((relation) => `(${escapeSqlString(relation.unitSlug)}, ${escapeSqlString(relation.skillSlug)})`)
    .join(", ");
  return [
    "with desired(unit_slug, skill_slug) as (",
    `  values ${desiredValues}`,
    ")",
    "delete from public.unit_skills existing",
    "using public.learning_units unit, public.skills skill",
    "where existing.unit_id = unit.id",
    "  and existing.skill_id = skill.id",
    "  and not exists (",
    "    select 1 from desired where desired.unit_slug = unit.slug and desired.skill_slug = skill.slug",
    ");",
  ].join("\n");
}

/** Render a reviewed, transactional, non-destructive catalog data migration. */
export function renderCatalogMigration(plan: CatalogReleasePlan): string {
  const lines: string[] = [
    "begin;",
    "do $$",
    "declare current_revision bigint; current_hash text;",
    "begin",
    "  select revision, catalog_hash into current_revision, current_hash from private.catalog_release_state where singleton = true for update;",
    `  if current_revision is distinct from ${plan.baseRevision} or current_hash is distinct from ${escapeSqlString(plan.baseHash)} then raise exception 'catalog release base revision/hash mismatch (expected revision %, hash %; found revision %, hash %)', ${plan.baseRevision}, ${escapeSqlString(plan.baseHash)}, current_revision, current_hash; end if;`,
    "end $$;",
  ];
  for (const unit of plan.units) {
    lines.push(
      `insert into public.learning_units (slug, title, description, difficulty, estimated_minutes, display_order, is_published) values (${escapeSqlString(unit.slug)}, ${escapeSqlString(unit.title)}, ${escapeSqlString(unit.description)}, ${escapeSqlString(unit.difficulty)}, ${unit.estimatedMinutes}, ${unit.displayOrder}, ${sqlBoolean(unit.isPublished)}) on conflict (slug) do update set title = excluded.title, description = excluded.description, difficulty = excluded.difficulty, estimated_minutes = excluded.estimated_minutes, display_order = excluded.display_order, is_published = excluded.is_published, updated_at = now();`,
    );
  }
  for (const skill of plan.skills) {
    lines.push(
      `insert into public.skills (slug, name, description, category, difficulty) values (${escapeSqlString(skill.slug)}, ${escapeSqlString(skill.name)}, ${escapeSqlString(skill.description)}, ${escapeSqlString(skill.category)}, ${escapeSqlString(skill.difficulty)}) on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, difficulty = excluded.difficulty, updated_at = now();`,
    );
  }
  for (const relation of plan.unitSkills) {
    lines.push(
      `insert into public.unit_skills (unit_id, skill_id, is_primary, display_order) select u.id, s.id, ${sqlBoolean(relation.isPrimary)}, ${relation.displayOrder} from public.learning_units u, public.skills s where u.slug = ${escapeSqlString(relation.unitSlug)} and s.slug = ${escapeSqlString(relation.skillSlug)} on conflict (unit_id, skill_id) do update set is_primary = excluded.is_primary, display_order = excluded.display_order;`,
    );
  }
  lines.push(renderUnitSkillReconciliation(plan));
  for (const exercise of plan.added) lines.push(renderExercise(exercise));
  for (const exercise of plan.changed) {
    if (!exercise.versionChanged && !exercise.unitChanged) {
      lines.push(renderPublicationUpdate(exercise));
    } else {
      lines.push(renderExercise(exercise));
    }
  }
  for (const exercise of plan.unpublished) {
    lines.push(`update public.exercises set is_published = false, updated_at = now() where slug = ${escapeSqlString(exercise.slug)};`);
  }
  lines.push(
    `update private.catalog_release_state set revision = ${plan.targetRevision}, catalog_hash = ${escapeSqlString(plan.targetHash)}, published_at = now() where singleton = true;`,
    "commit;",
  );
  return `${lines.join("\n")}\n`;
}
