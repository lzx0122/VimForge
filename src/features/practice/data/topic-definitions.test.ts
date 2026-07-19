import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { TOPIC_DEFINITIONS, topicSkillSlugs } from "./topic-definitions";

const EXPECTED_TOPIC_SLUGS = [
  "mode-switching",
  "basic-movement",
  "word-movement",
  "line-find",
  "delete-change",
  "copy-paste",
  "search",
  "text-objects",
  "visual-mode",
  "composition",
];

function catalogSkillSlugs(): Set<string> {
  const catalog = JSON.parse(
    readFileSync(resolve(process.cwd(), "content/catalog-v2.json"), "utf8"),
  ) as { units: Array<{ skills: Array<{ slug: string }> }> };
  const slugs = new Set<string>();
  for (const unit of catalog.units) {
    for (const skill of unit.skills) {
      slugs.add(skill.slug);
    }
  }
  return slugs;
}

function definitionFor(slug: string) {
  const definition = TOPIC_DEFINITIONS.find((topic) => topic.slug === slug);
  if (definition === undefined) {
    throw new Error(`No topic definition for slug: ${slug}.`);
  }
  return definition;
}

describe("TOPIC_DEFINITIONS", () => {
  it("declares exactly the ten current topic slugs in order", () => {
    expect(TOPIC_DEFINITIONS.map((topic) => topic.slug)).toEqual(
      EXPECTED_TOPIC_SLUGS,
    );
  });

  it("gives every topic a non-empty skill mapping", () => {
    for (const topic of TOPIC_DEFINITIONS) {
      expect(topic.skillSlugs.length).toBeGreaterThan(0);
    }
  });

  it("uses unique topic slugs", () => {
    const slugs = TOPIC_DEFINITIONS.map((topic) => topic.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("maps every topic to skill slugs that exist in the catalog", () => {
    const validSlugs = catalogSkillSlugs();
    for (const topic of TOPIC_DEFINITIONS) {
      for (const skillSlug of topic.skillSlugs) {
        expect(validSlugs.has(skillSlug)).toBe(true);
      }
    }
  });
});

describe("topicSkillSlugs", () => {
  it("resolves a single topic to its mapped skill slugs", () => {
    expect(topicSkillSlugs(["mode-switching"])).toEqual(
      definitionFor("mode-switching").skillSlugs,
    );
  });

  it("returns an empty array for unknown topic slugs", () => {
    expect(topicSkillSlugs(["not-a-real-topic"])).toEqual([]);
  });

  it("deduplicates skill slugs when the same topic is selected twice", () => {
    const result = topicSkillSlugs(["mode-switching", "mode-switching"]);

    expect(result).toEqual(definitionFor("mode-switching").skillSlugs);
    expect(new Set(result).size).toBe(result.length);
  });

  it("combines skill slugs from several distinct topics without duplicates", () => {
    const result = topicSkillSlugs(["mode-switching", "basic-movement"]);

    expect(result).toEqual([
      ...definitionFor("mode-switching").skillSlugs,
      ...definitionFor("basic-movement").skillSlugs,
    ]);
    expect(new Set(result).size).toBe(result.length);
  });
});
