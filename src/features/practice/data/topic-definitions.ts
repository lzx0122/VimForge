export interface TopicDefinition {
  slug: string;
  label: string;
  skillSlugs: readonly string[];
}

export const TOPIC_DEFINITIONS: readonly TopicDefinition[] = [
  {
    slug: "mode-switching",
    label: "模式切換",
    skillSlugs: [
      "normal-insert-switch",
      "insert-entry-points",
      "open-line-entry",
      "insert-normal-switch",
    ],
  },
  {
    slug: "basic-movement",
    label: "基礎移動",
    skillSlugs: [
      "basic-motion",
      "precise-basic-motion",
      "counted-character-motion",
      "line-boundary-motion",
    ],
  },
  {
    slug: "word-movement",
    label: "單字移動",
    skillSlugs: [
      "word-motion",
      "precise-word-motion",
      "big-word-motion",
      "token-end-motion",
    ],
  },
  {
    slug: "line-find",
    label: "行內跳轉",
    skillSlugs: ["character-find", "till-motion", "find-repeat", "line-find"],
  },
  {
    slug: "delete-change",
    label: "刪除與修改",
    skillSlugs: [
      "character-delete",
      "character-replace",
      "character-substitute",
      "line-delete-change",
      "line-tail-editing",
      "change-text",
    ],
  },
  {
    slug: "copy-paste",
    label: "複製貼上",
    skillSlugs: [
      "line-yank",
      "directional-put",
      "partial-yank",
      "named-register",
      "black-hole-register",
      "register-safe-paste",
      "numbered-register",
      "copy-paste",
    ],
  },
  {
    slug: "search",
    label: "全文搜尋",
    skillSlugs: [
      "forward-search",
      "backward-search",
      "search-repeat",
      "word-under-cursor-search",
      "document-search",
    ],
  },
  {
    slug: "text-objects",
    label: "文字物件",
    skillSlugs: [
      "word-text-object",
      "inner-text-object",
      "around-text-object",
      "delimiter-text-object",
      "quoted-text-object",
    ],
  },
  {
    slug: "visual-mode",
    label: "Visual Mode",
    skillSlugs: [
      "visual-character-selection",
      "visual-line-selection",
      "visual-block-selection",
      "visual-operator",
      "block-insert",
      "block-append",
      "visual-word-change",
    ],
  },
  {
    slug: "composition",
    label: "綜合操作",
    skillSlugs: [
      "operator-motion-basic",
      "dot-repeat",
      "repeatable-change",
      "delete-composition",
      "change-composition",
      "yank-composition",
      "count-composition",
      "find-change-composition",
      "text-object-composition",
      "repeatable-refactor",
      "minimal-keystroke-selection",
      "multi-step-workflow",
      "cross-line-refactor",
      "efficiency-review",
      "command-selection",
      "operator-composition",
    ],
  },
];

const DEFINITION_BY_SLUG = new Map(
  TOPIC_DEFINITIONS.map((topic) => [topic.slug, topic]),
);

/** Resolve selected topic slugs to their mapped, deduplicated skill slugs. */
export function topicSkillSlugs(topicSlugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const topicSlug of topicSlugs) {
    const definition = DEFINITION_BY_SLUG.get(topicSlug);
    if (definition === undefined) {
      continue;
    }
    for (const skillSlug of definition.skillSlugs) {
      if (!seen.has(skillSlug)) {
        seen.add(skillSlug);
        result.push(skillSlug);
      }
    }
  }

  return result;
}
