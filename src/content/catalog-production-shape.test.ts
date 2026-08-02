import { describe, expect, it } from "vitest";

import { normalizeCatalogForProductionExportShape } from "./catalog-production-shape";
import type { CatalogExercise, CatalogSnapshot, CatalogUnit } from "./catalog-contract";

function exercise(overrides: Partial<CatalogExercise> = {}): CatalogExercise {
  return {
    slug: "exercise",
    title: "Exercise",
    instruction: "Do it",
    language: "plaintext",
    exerciseType: "challenge",
    difficulty: "beginner",
    initialContent: "before",
    expectedContent: "after",
    initialCursor: { line: 0, column: 0 },
    completionRule: { contentMatch: "exact", cursorMatch: { type: "ignore" } },
    supportedModes: ["beginner"],
    targetDurationMs: 1_000,
    version: 1,
    isPublished: true,
    skills: [{ skillSlug: "movement", weight: 1, primary: true }],
    solutions: [{
      sequence: "i",
      normalizedActions: [{ type: "vim_command", command: "i" }],
      keystrokeCount: 1,
      recommended: true,
      explanation: "Type it.",
    }],
    hints: [1, 2, 3, 4].map((level) => ({ level: level as 1 | 2 | 3 | 4, content: `Hint ${level}`, commandPreview: null })),
    ...overrides,
  };
}

function unit(overrides: Partial<CatalogUnit> = {}): CatalogUnit {
  return {
    slug: "unit",
    title: "Unit",
    description: "A unit",
    difficulty: "beginner",
    estimatedMinutes: 5,
    displayOrder: 1,
    isPublished: true,
    skills: [{ slug: "movement", name: "Movement", description: "Move", category: "movement", difficulty: "beginner" }],
    exercises: [exercise()],
    ...overrides,
  };
}

function snapshot(units: CatalogUnit[]): CatalogSnapshot {
  return {
    schemaVersion: 1,
    catalogRevision: 1,
    catalogHash: "sha256:" + "0".repeat(64),
    exportedAt: "2026-07-17T00:00:00.000Z",
    units,
  };
}

describe("normalizeCatalogForProductionExportShape", () => {
  it("defaults an omitted exercise displayOrder to 0, explicitly present", () => {
    const withoutDisplayOrder = exercise();
    delete (withoutDisplayOrder as { displayOrder?: number }).displayOrder;
    const result = normalizeCatalogForProductionExportShape(snapshot([unit({ exercises: [withoutDisplayOrder] })]));

    const normalized = result.units[0]?.exercises[0];
    expect(normalized).toHaveProperty("displayOrder", 0);
  });

  it("defaults omitted unit skill primary and displayOrder using array position", () => {
    const result = normalizeCatalogForProductionExportShape(snapshot([unit({
      skills: [
        { slug: "a", name: "A", description: "d", category: "movement", difficulty: "beginner" },
        { slug: "b", name: "B", description: "d", category: "movement", difficulty: "beginner" },
      ],
    })]));

    expect(result.units[0]?.skills).toEqual([
      { slug: "a", name: "A", description: "d", category: "movement", difficulty: "beginner", primary: false, displayOrder: 0 },
      { slug: "b", name: "B", description: "d", category: "movement", difficulty: "beginner", primary: false, displayOrder: 1 },
    ]);
  });

  it("orders unit skills by displayOrder then slug, matching production export ordering", () => {
    const result = normalizeCatalogForProductionExportShape(snapshot([unit({
      skills: [
        { slug: "z-second", name: "Z", description: "d", category: "movement", difficulty: "beginner", displayOrder: 2 },
        { slug: "a-first", name: "A", description: "d", category: "movement", difficulty: "beginner", displayOrder: 2 },
        { slug: "b-only", name: "B", description: "d", category: "movement", difficulty: "beginner", displayOrder: 1 },
      ],
    })]));

    expect(result.units[0]?.skills.map((skill) => skill.slug)).toEqual(["b-only", "a-first", "z-second"]);
  });

  it("orders exercise skills by skillSlug regardless of authored order", () => {
    const result = normalizeCatalogForProductionExportShape(snapshot([unit({
      exercises: [exercise({
        skills: [
          { skillSlug: "z-skill", weight: 0.5, primary: false },
          { skillSlug: "a-skill", weight: 0.5, primary: true },
        ],
      })],
    })]));

    expect(result.units[0]?.exercises[0]?.skills.map((skill) => skill.skillSlug)).toEqual(["a-skill", "z-skill"]);
  });

  it("defaults an omitted solution displayOrder to its source index and keeps it explicit", () => {
    const result = normalizeCatalogForProductionExportShape(snapshot([unit({
      exercises: [exercise({
        solutions: [
          { sequence: "first", normalizedActions: [], keystrokeCount: 1, recommended: true, explanation: "e" },
          { sequence: "second", normalizedActions: [], keystrokeCount: 1, recommended: false, explanation: "e" },
        ],
      })],
    })]));

    expect(result.units[0]?.exercises[0]?.solutions).toEqual([
      expect.objectContaining({ sequence: "first", displayOrder: 0 }),
      expect.objectContaining({ sequence: "second", displayOrder: 1 }),
    ]);
  });

  it("orders solutions by displayOrder then source index, preserving deterministic tie order", () => {
    const result = normalizeCatalogForProductionExportShape(snapshot([unit({
      exercises: [exercise({
        solutions: [
          { sequence: "explicit-later", normalizedActions: [], keystrokeCount: 1, recommended: false, explanation: "e", displayOrder: 5 },
          { sequence: "tie-a", normalizedActions: [], keystrokeCount: 1, recommended: false, explanation: "e", displayOrder: 1 },
          { sequence: "tie-b", normalizedActions: [], keystrokeCount: 1, recommended: true, explanation: "e", displayOrder: 1 },
        ],
      })],
    })]));

    expect(result.units[0]?.exercises[0]?.solutions.map((solution) => solution.sequence)).toEqual([
      "tie-a",
      "tie-b",
      "explicit-later",
    ]);
  });

  it("orders hints by level regardless of authored order", () => {
    const result = normalizeCatalogForProductionExportShape(snapshot([unit({
      exercises: [exercise({
        hints: [4, 2, 1, 3].map((level) => ({ level: level as 1 | 2 | 3 | 4, content: `Hint ${level}`, commandPreview: null })),
      })],
    })]));

    expect(result.units[0]?.exercises[0]?.hints.map((hint) => hint.level)).toEqual([1, 2, 3, 4]);
  });

  it("orders exercises by displayOrder then slug within a unit", () => {
    const result = normalizeCatalogForProductionExportShape(snapshot([unit({
      exercises: [
        exercise({ slug: "z", displayOrder: 1 }),
        exercise({ slug: "a", displayOrder: 1 }),
      ],
    })]));

    expect(result.units[0]?.exercises.map((item) => item.slug)).toEqual(["a", "z"]);
  });

  it("orders units by displayOrder", () => {
    const result = normalizeCatalogForProductionExportShape(snapshot([
      unit({ slug: "second", displayOrder: 2, exercises: [exercise({ slug: "second-exercise" })] }),
      unit({ slug: "first", displayOrder: 1, exercises: [exercise({ slug: "first-exercise" })] }),
    ]));

    expect(result.units.map((item) => item.slug)).toEqual(["first", "second"]);
  });
});
