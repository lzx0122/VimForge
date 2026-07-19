import { describe, expect, it } from "vitest";

import { diffCatalog } from "./catalog-diff";
import { hashCatalog, type CatalogExercise, type CatalogSnapshot } from "./catalog-contract";

const exercise = (slug: string, expectedContent = "done") => ({
  slug,
  title: slug,
  instruction: `Instruction for ${slug}`,
  language: "plaintext" as const,
  exerciseType: "guided" as const,
  difficulty: "beginner" as const,
  initialContent: "start",
  expectedContent,
  initialCursor: { line: 0, column: 0 },
  completionRule: {
    contentMatch: "exact" as const,
    cursorMatch: { type: "ignore" as const },
  },
  supportedModes: ["beginner" as const],
  targetDurationMs: 1_000,
  version: 1,
  isPublished: true,
  skills: [{ skillSlug: "skill", weight: 1, primary: true }],
  solutions: [{
    sequence: "i",
    normalizedActions: [{ type: "vim_command" as const, command: "i" }],
    keystrokeCount: 1,
    recommended: true,
    explanation: "Type the value.",
  }],
  hints: [
    { level: 1 as const, content: "Hint one", commandPreview: null },
    { level: 2 as const, content: "Hint two", commandPreview: null },
    { level: 3 as const, content: "Hint three", commandPreview: null },
    { level: 4 as const, content: "Hint four", commandPreview: null },
  ],
});

const snapshot = (exercises: CatalogExercise[], revision = 1): CatalogSnapshot => {
  const draft = {
    schemaVersion: 1 as const,
    catalogRevision: revision,
    catalogHash: "sha256:" + "0".repeat(64),
    exportedAt: "2026-07-17T00:00:00.000Z",
    units: [{
      slug: "unit",
      title: "Unit",
      description: "A unit",
      difficulty: "beginner" as const,
      estimatedMinutes: 5,
      displayOrder: 1,
      isPublished: true,
      skills: [{ slug: "skill", name: "Skill", description: "A skill", category: "movement" as const, difficulty: "beginner" as const }],
      exercises,
    }],
  } satisfies CatalogSnapshot;
  return { ...draft, catalogHash: hashCatalog(draft) };
};

describe("diffCatalog", () => {
  it("classifies additions, exercise-owned changes, removals, and unchanged slugs", () => {
    const base = snapshot([exercise("removed"), exercise("changed"), exercise("same")]);
    const next = snapshot([exercise("changed", "changed"), exercise("same"), exercise("new-exercise")]);

    const diff = diffCatalog(base, next);

    expect(diff.added.map((item) => item.slug)).toEqual(["new-exercise"]);
    expect(diff.changed.map((item) => item.slug)).toEqual(["changed"]);
    expect(diff.removed[0]?.action).toBe("unpublish");
    expect(diff.unchanged.map((item) => item.slug)).toEqual(["same"]);
    expect(diff.changed[0]?.fields.map((field) => field.field)).toContain("expectedContent");
  });

  it("flags a catalog with more than 25 percent affected exercises", () => {
    const base = snapshot(Array.from({ length: 50 }, (_, index) => exercise(`exercise-${index + 1}`)));
    const nextExercises = base.units[0]!.exercises.map((item, index) =>
      index < 13 ? { ...item, expectedContent: `changed-${index}` } : item,
    );
    const next = snapshot(nextExercises);

    expect(diffCatalog(base, next).largeChange).toBe(true);
  });

  it("classifies publication-only visibility changes without treating them as content changes", () => {
    const base = snapshot([exercise("visible")]);
    const next = snapshot([{ ...exercise("visible"), isPublished: false }]);

    const diff = diffCatalog(base, next);

    expect(diff.changed[0]).toMatchObject({
      slug: "visible",
      unitChanged: false,
      publicationChanged: true,
    });
    expect(diff.changed[0]?.fields.map((field) => field.field)).toContain("isPublished");
    expect(diff.unchanged).toHaveLength(0);
  });

  it("rejects a changed snapshot with a stale canonical hash or revision", () => {
    const base = snapshot([exercise("one")]);
    const staleHash = { ...base, catalogHash: "sha256:" + "0".repeat(64) };
    expect(() => diffCatalog(base, staleHash)).toThrow(/hash/i);
    const next = snapshot([exercise("one")], 2);
    expect(() => diffCatalog(base, next)).toThrow(/revision/i);
  });

  it("rejects omitted base units but treats missing exercises as unpublishes", () => {
    const base = snapshot([exercise("one")]);
    const omittedUnitDraft = { ...base, units: [] } satisfies CatalogSnapshot;
    const omittedUnit = { ...omittedUnitDraft, catalogHash: hashCatalog(omittedUnitDraft) };
    expect(() => diffCatalog(base, omittedUnit)).toThrow(/base unit.*omitted/i);

    const unpublishedDraft = snapshot([exercise("replacement")]);
    expect(diffCatalog(base, unpublishedDraft).removed).toHaveLength(1);
  });
});
