import { describe, expect, it } from "vitest";

import {
  canonicalizeCatalog,
  exerciseVersionChanged,
  hashCatalog,
  parseCatalogSnapshot,
  reviewCatalogContent,
  validateCatalogSnapshot,
  type CatalogSnapshot,
} from "./catalog-contract";
import { canonicalizeValue } from "./catalog-canonicalizer";

const fixture = {
  schemaVersion: 1,
  catalogRevision: 1,
  catalogHash:
    "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  exportedAt: "2026-07-17T00:00:00.000Z",
  units: [
    {
      slug: "text-objects",
      title: "Text objects",
      description: "Practice text objects.",
      difficulty: "beginner",
      estimatedMinutes: 10,
      displayOrder: 1,
      isPublished: true,
      skills: [
        {
          slug: "inner-word",
          name: "Inner word",
          description: "Select a word without surrounding whitespace.",
          category: "text_object",
          difficulty: "beginner",
        },
      ],
      exercises: [
        {
          slug: "text-objects-01",
          title: "Change a word",
          instruction: "Change the word under the cursor.",
          language: "typescript",
          exerciseType: "guided",
          difficulty: "beginner",
          initialContent: "const oldName = true;",
          expectedContent: "const newName = true;",
          initialCursor: { line: 0, column: 6 },
          completionRule: {
            contentMatch: "exact",
            cursorMatch: { type: "ignore" },
            requiredMode: "normal",
          },
          supportedModes: ["beginner", "memory_review"],
          targetDurationMs: 8_000,
          version: 1,
          isPublished: true,
          skills: [{ skillSlug: "inner-word", weight: 1, primary: true }],
          solutions: [
            {
              sequence: "ciwnewName<Esc>",
              normalizedActions: [
                { type: "vim_command", command: "ciw" },
                { type: "insert_text", text: "newName", textLength: 7 },
                { type: "mode_change", mode: "normal" },
              ],
              keystrokeCount: 12,
              recommended: true,
              explanation: "Change the current word with ciw.",
              displayOrder: 1,
            },
          ],
          hints: [
            { level: 1, content: "Select the word under the cursor.", commandPreview: null },
            { level: 2, content: "Use a change operator and text object.", commandPreview: "c + iw" },
            { level: 3, content: "Type ciw, then the replacement.", commandPreview: "ciwnewName" },
            { level: 4, content: "Complete: ciwnewName followed by Escape.", commandPreview: "ciwnewName<Esc>" },
          ],
        },
      ],
    },
  ],
} satisfies CatalogSnapshot;

function copyFixture(): CatalogSnapshot {
  return structuredClone(fixture);
}

function getExercise(snapshot: CatalogSnapshot) {
  return snapshot.units[0]!.exercises[0]!;
}

describe("catalog contract", () => {
  it("parses, validates, canonicalizes, and hashes a complete snapshot", () => {
    const parsed = parseCatalogSnapshot(fixture);

    expect(parsed.schemaVersion).toBe(1);
    expect(validateCatalogSnapshot(parsed)).toEqual([]);
    const hash = hashCatalog(parsed);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const metadataOnlyChange = {
      ...parsed,
      catalogHash: "sha256:" + "f".repeat(64),
      exportedAt: "2027-01-01T00:00:00.000Z",
    };
    expect(hashCatalog(metadataOnlyChange)).toBe(hash);
    expect(canonicalizeCatalog(parsed)).not.toContain(parsed.catalogHash);
    expect(canonicalizeCatalog(parsed)).not.toContain(parsed.exportedAt);
  });

  it("reports duplicate exercise slugs with a JSON path", () => {
    const snapshot = copyFixture();
    snapshot.units[0]!.exercises.push({
      ...getExercise(snapshot),
      title: "Duplicate",
    });

    const errors = validateCatalogSnapshot(snapshot);

    expect(errors.some((error) => error.path === "units[0].exercises[1].slug")).toBe(true);
  });

  it("reports an initial cursor column beyond its line", () => {
    const snapshot = copyFixture();
    getExercise(snapshot).initialCursor.column = 100;

    const errors = validateCatalogSnapshot(snapshot);

    expect(errors.some((error) => error.path === "units[0].exercises[0].initialCursor.column")).toBe(true);
  });

  it("reports skill weights that do not sum to one", () => {
    const snapshot = copyFixture();
    getExercise(snapshot).skills[0]!.weight = 0.5;

    const errors = validateCatalogSnapshot(snapshot);

    expect(errors.some((error) => error.path.endsWith("skills"))).toBe(true);
  });

  it("reports a missing level-four hint", () => {
    const snapshot = copyFixture();
    getExercise(snapshot).hints = getExercise(snapshot).hints.slice(0, 3);

    const errors = validateCatalogSnapshot(snapshot);

    expect(errors.some((error) => error.path.endsWith("hints[4]"))).toBe(true);
  });

  it("reports a renamed slug when comparing a base and next exercise", () => {
    const before = copyFixture();
    const after = copyFixture();
    getExercise(after).slug = "text-objects-renamed";

    const beforeSlugs = new Set(
      before.units.flatMap((unit) => unit.exercises.map((exercise) => exercise.slug)),
    );
    const afterSlugs = new Set(
      after.units.flatMap((unit) => unit.exercises.map((exercise) => exercise.slug)),
    );

    expect([...beforeSlugs].some((slug) => !afterSlugs.has(slug))).toBe(true);
    expect([...afterSlugs].some((slug) => !beforeSlugs.has(slug))).toBe(true);
    expect(
      validateCatalogSnapshot(after, before).some((error) =>
        error.message.includes("renamed"),
      ),
    ).toBe(true);
  });

  it("rejects a likely slug rename even when content was edited", () => {
    const before = copyFixture();
    const after = copyFixture();
    getExercise(after).slug = "text-objects-renamed";
    getExercise(after).expectedContent = "const approvedName = true;";
    expect(validateCatalogSnapshot(after, before).some((error) => error.message.includes("changed content"))).toBe(true);
  });

  it("rejects a likely changed-content slug rename across catalog units", () => {
    const before = copyFixture();
    const secondUnit = structuredClone(before.units[0]!);
    secondUnit.slug = "movement-basics";
    secondUnit.title = "Movement basics";
    secondUnit.skills[0]!.slug = "word-movement";
    secondUnit.exercises[0]!.slug = "movement-basics-01";
    secondUnit.exercises[0]!.skills[0]!.skillSlug = "word-movement";
    secondUnit.exercises[0]!.title = "Move to a word";
    secondUnit.exercises[0]!.instruction = "Move to the next word.";
    secondUnit.exercises[0]!.initialContent = "const first = true;";
    secondUnit.exercises[0]!.expectedContent = "const second = true;";
    secondUnit.exercises[0]!.initialCursor = { line: 0, column: 6 };
    secondUnit.displayOrder = 2;
    before.units.push(secondUnit);

    const after = structuredClone(before);
    after.units[0]!.exercises = [];
    const renamed = structuredClone(getExercise(before));
    renamed.slug = "movement-basics-renamed";
    renamed.expectedContent = "const approvedName = true;";
    after.units[1]!.exercises.push(renamed);

    expect(validateCatalogSnapshot(after, before).some((error) => error.message.includes("changed content"))).toBe(true);
  });

  it("allows an independent removal and addition with equal slug counts", () => {
    const before = copyFixture();
    getExercise(before).slug = "text-objects-removed";
    const after = copyFixture();
    getExercise(after).slug = "text-objects-new";
    getExercise(after).title = "A separate exercise";
    getExercise(after).expectedContent = "const another = true;";

    const errors = validateCatalogSnapshot(after, before);

    expect(errors.some((error) => error.message.includes("renamed"))).toBe(false);
  });

  it("rejects an omitted base unit while allowing an explicitly omitted exercise", () => {
    const before = copyFixture();
    const after = copyFixture();
    after.units = [];
    expect(validateCatalogSnapshot(after, before).some((error) => error.message.includes("base unit"))).toBe(true);

    const exerciseUnpublished = copyFixture();
    exerciseUnpublished.units[0]!.exercises = [];
    expect(validateCatalogSnapshot(exerciseUnpublished, before).some((error) => error.message.includes("base unit"))).toBe(false);
  });

  it("rejects an exercise relationship that references a missing unit skill", () => {
    const before = copyFixture();
    const after = copyFixture();
    after.units.push({
      slug: "second-unit",
      title: "Second unit",
      description: "Another unit",
      difficulty: "beginner",
      estimatedMinutes: 5,
      displayOrder: 2,
      isPublished: true,
      skills: [],
      exercises: [getExercise(after)],
    });
    after.units[0]!.exercises = [];
    expect(validateCatalogSnapshot(after, before).some((error) => error.message.includes("not declared by the unit"))).toBe(true);
  });

  it("rejects exact duplicate content even when stable slugs differ", () => {
    const snapshot = copyFixture();
    snapshot.units[0]!.exercises.push({ ...getExercise(snapshot), slug: "text-objects-02" });
    expect(validateCatalogSnapshot(snapshot).some((error) => error.message.includes("exact duplicate exercise content"))).toBe(true);
  });

  it("treats administrative metadata changes as exact duplicate content", () => {
    const snapshot = copyFixture();
    const duplicate = structuredClone(getExercise(snapshot));
    duplicate.slug = "text-objects-02";
    duplicate.version = 99;
    duplicate.isPublished = false;
    duplicate.displayOrder = 42;
    duplicate.solutions[0]!.displayOrder = 99;
    snapshot.units[0]!.exercises.push(duplicate);

    expect(validateCatalogSnapshot(snapshot).some((error) => error.message.includes("exact duplicate exercise content"))).toBe(true);
  });

  it("reports ordinal-only content as a warning without invalidating the catalog", () => {
    const snapshot = copyFixture();
    snapshot.units[0]!.exercises.push({
      ...getExercise(snapshot),
      slug: "text-objects-02",
      title: "Change a word 2",
      instruction: "Change the word under the cursor 2.",
      initialContent: "const oldName2 = true;",
      expectedContent: "const newName2 = true;",
    });
    snapshot.catalogHash = hashCatalog(snapshot);
    expect(validateCatalogSnapshot(snapshot)).not.toContainEqual(expect.objectContaining({ message: expect.stringContaining("exact duplicate") }));
    expect(reviewCatalogContent(snapshot).warnings.some((warning) => warning.message.includes("ordinal-only"))).toBe(true);
  });

  it("sorts object keys recursively while preserving array order", () => {
    const value = {
      zeta: 1,
      alpha: 2,
      nested: { zeta: "last", alpha: "first" },
      ordered: ["second", "first"],
    };

    expect(canonicalizeValue(value)).toBe(
      '{"alpha":2,"nested":{"alpha":"first","zeta":"last"},"ordered":["second","first"],"zeta":1}',
    );
  });

  it("increments exercise version only for exercise-owned changes", () => {
    const before = getExercise(copyFixture());
    const publicationOnly = { ...before, isPublished: !before.isPublished, displayOrder: 2 };
    const contentChanged = { ...before, expectedContent: "const renamed = true;" };

    expect(exerciseVersionChanged(before, publicationOnly)).toBe(false);
    expect(exerciseVersionChanged(before, contentChanged)).toBe(true);
  });
});
