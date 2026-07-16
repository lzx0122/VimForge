import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  expandSeedCatalog,
  validateCatalogFile,
  type SeedCatalogUnit,
} from "./content-validate";

const seedFixture: SeedCatalogUnit = {
  slug: "fixture-unit",
  title: "Fixture unit",
  description: "A conversion fixture.",
  difficulty: "beginner",
  estimatedMinutes: 5,
  displayOrder: 1,
  published: true,
  exerciseType: "guided",
  supportedModes: ["beginner"],
  skills: [
    {
      slug: "fixture-skill",
      name: "Fixture skill",
      description: "A skill for the conversion fixture.",
      category: "movement",
      difficulty: "beginner",
      weight: 1,
      primary: true,
    },
  ],
  solutions: [
    {
      sequence: "i{{n}}<Esc>",
      normalizedActions: [
        { type: "vim_command", command: "i" },
        { type: "insert_text", text: "{{n}}", textLength: 5 },
        { type: "mode_change", mode: "normal" },
      ],
      keystrokeCount: 4,
      recommended: true,
      explanation: "Insert ordinal {{n}}.",
    },
  ],
  hints: [
    { level: 1, content: "Move to item {{n}}.", commandPreview: null },
    { level: 2, content: "Insert the ordinal.", commandPreview: "i{{n}}" },
    { level: 3, content: "Use i followed by {{n}}.", commandPreview: "i{{n}}" },
    { level: 4, content: "Finish with i{{n}}<Esc>.", commandPreview: "i{{n}}<Esc>" },
  ],
  variants: [
    {
      language: "typescript",
      count: 2,
      title: "Edit item {{n}}",
      instruction: "Edit item {{n}}.",
      initialContent: "item-{{n}}",
      expectedContent: "item-{{n}}-done",
      initialCursor: { line: 0, column: 5 },
      completionRule: {
        contentMatch: "exact",
        cursorMatch: { type: "ignore" },
        requiredMode: "normal",
      },
      targetDurationMs: 5_000,
    },
  ],
};

describe("expanded catalog conversion", () => {
  it("expands variant counts in order with stable slugs and ordinal substitutions", () => {
    const snapshot = expandSeedCatalog([seedFixture], "2026-07-17T00:00:00.000Z");

    expect(snapshot.units[0]?.exercises.map((exercise) => exercise.slug)).toEqual([
      "fixture-unit-01",
      "fixture-unit-02",
    ]);
    expect(snapshot.units[0]?.exercises[1]?.title).toBe("Edit item 2");
    expect(snapshot.units[0]?.exercises[1]?.initialContent).toBe("item-2");
    expect(snapshot.units[0]?.exercises[1]?.solutions[0]?.sequence).toBe(
      "i2<Esc>",
    );
    expect(snapshot.units[0]?.exercises[1]?.hints[0]?.content).toBe(
      "Move to item 2.",
    );
    expect(snapshot.catalogRevision).toBe(1);
    expect(snapshot.catalogHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("catalog file validation", () => {
  it("returns path-based errors without modifying an invalid snapshot", () => {
    const snapshot = expandSeedCatalog([seedFixture], "2026-07-17T00:00:00.000Z");
    const invalidSnapshot = structuredClone(snapshot);
    invalidSnapshot.units[0]!.exercises[0]!.initialCursor.column = 999;
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "vimforge-content-"));
    const filePath = join(temporaryDirectory, "invalid.json");
    const original = JSON.stringify(invalidSnapshot, null, 2) + "\n";
    writeFileSync(filePath, original, "utf8");

    try {
      const report = validateCatalogFile(filePath);

      expect(report.errors.some((error) =>
        error.path === "units[0].exercises[0].initialCursor.column",
      )).toBe(true);
      expect(readFileSync(filePath, "utf8")).toBe(original);
    } finally {
      expect(existsSync(filePath)).toBe(true);
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
