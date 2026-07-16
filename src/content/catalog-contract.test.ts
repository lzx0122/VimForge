import { describe, expect, it } from "vitest";

import {
  canonicalizeCatalog,
  exerciseVersionChanged,
  hashCatalog,
  parseCatalogSnapshot,
  validateCatalogSnapshot,
  type CatalogSnapshot,
} from "./catalog-contract";

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

  it("increments exercise version only for exercise-owned changes", () => {
    const before = getExercise(copyFixture());
    const publicationOnly = { ...before, isPublished: !before.isPublished, displayOrder: 2 };
    const contentChanged = { ...before, expectedContent: "const renamed = true;" };

    expect(exerciseVersionChanged(before, publicationOnly)).toBe(false);
    expect(exerciseVersionChanged(before, contentChanged)).toBe(true);
  });
});
