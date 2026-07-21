import { expect, test, type Page } from "@playwright/test";

const UNIT_ID = "00000000-0000-4000-8000-000000000901";
const UNIT_SLUG = "learning-loop-unit";
const SKILL_ID = "00000000-0000-4000-8000-000000000902";
const EXERCISE_ID = "00000000-0000-4000-8000-000000000903";
const EXERCISE_SLUG = "learning-loop-01";

const unit = {
  id: UNIT_ID,
  slug: UNIT_SLUG,
  title: "打字模式入門",
  description: "認識 Normal 與 Insert 模式的切換方式。",
  difficulty: "beginner",
  estimated_minutes: 12,
  display_order: 1,
  is_published: true,
};

const skill = {
  id: SKILL_ID,
  slug: "mode-switching",
  name: "模式切換",
  description: "在 Normal 與 Insert 模式間切換。",
  category: "mode",
  difficulty: "beginner",
};

const unitSkillLink = {
  unit_id: UNIT_ID,
  skill_id: SKILL_ID,
  is_primary: true,
  display_order: 1,
};

const exerciseInstruction = "在 name 前面插入 x，完成後按 Esc 回到 Normal Mode。";

const exercise = {
  id: EXERCISE_ID,
  unit_id: UNIT_ID,
  slug: EXERCISE_SLUG,
  title: "進入插入模式",
  instruction: exerciseInstruction,
  language: "typescript",
  exercise_type: "guided",
  difficulty: "beginner",
  supported_modes: ["beginner"],
  target_duration_ms: 8000,
  version: 1,
  display_order: 1,
  initial_content: "const name = true;",
  expected_content: "const xname = true;",
  initial_cursor: { line: 0, column: 6 },
  completion_rule: {
    contentMatch: "exact",
    cursorMatch: { type: "ignore" },
    requiredMode: "normal",
  },
};

/** The whole learning loop touches every published-catalog table the app queries. */
async function mockLearningLoopCatalog(page: Page): Promise<void> {
  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    let body: object | object[];

    if (table === "learning_units") {
      body = requestUrl.searchParams.has("slug") ? unit : [unit];
    } else if (table === "unit_skills") {
      body = [unitSkillLink];
    } else if (table === "skills") {
      body = [skill];
    } else if (table === "exercises") {
      body = requestUrl.searchParams.has("id")
        ? exercise
        : [
            {
              id: exercise.id,
              unit_id: exercise.unit_id,
              slug: exercise.slug,
              title: exercise.title,
              instruction: exercise.instruction,
              language: exercise.language,
              exercise_type: exercise.exercise_type,
              difficulty: exercise.difficulty,
              supported_modes: exercise.supported_modes,
              target_duration_ms: exercise.target_duration_ms,
              version: exercise.version,
              display_order: exercise.display_order,
            },
          ];
    } else if (table === "exercise_skills") {
      body = [
        {
          exercise_id: EXERCISE_ID,
          skill_id: SKILL_ID,
          weight: 1,
          is_primary: true,
        },
      ];
    } else if (table === "exercise_solutions") {
      body = [
        {
          sequence: "ix<Esc>",
          normalized_actions: [
            { type: "vim_command", command: "i" },
            { type: "insert_text", text: "x", textLength: 1 },
            { type: "mode_change", mode: "normal" },
          ],
          keystroke_count: 3,
          is_recommended: true,
          explanation: "使用 i 插入字元，完成後按 Esc。",
          display_order: 0,
        },
      ];
    } else if (table === "exercise_hints") {
      body = [
        { level: 1, content: "先進入可輸入文字的模式。", command_preview: null },
        { level: 3, content: "輸入 x 後離開 Insert Mode。", command_preview: "ix" },
        { level: 4, content: "完整操作如下。", command_preview: "ix<Esc>" },
      ];
    } else {
      body = [];
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function completeTheExercise(page: Page): Promise<void> {
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.keyboard.press("i");
  await page.keyboard.type("x");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();
}

/** Reads the actual persisted masteryLevel back, rather than predicting the mastery calculator's exact output. */
async function readSkillMasteryLevel(
  page: Page,
  skillId: string,
): Promise<number | null> {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
      request.addEventListener("success", () => resolve(request.result), {
        once: true,
      });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to open IndexedDB")),
        { once: true },
      );
    });
    const getRequest = database
      .transaction("skillMastery", "readonly")
      .objectStore("skillMastery")
      .get(id);
    const record = await new Promise<{ masteryLevel: number } | undefined>(
      (resolve, reject) => {
        getRequest.addEventListener(
          "success",
          () => resolve(getRequest.result),
          { once: true },
        );
        getRequest.addEventListener(
          "error",
          () => reject(getRequest.error ?? new Error("Read failed")),
          { once: true },
        );
      },
    );
    database.close();
    return record?.masteryLevel ?? null;
  }, skillId);
}

test("carries a guest's first completed exercise through feedback, result, progress, and review - and survives a reload", async ({
  page,
}) => {
  await mockLearningLoopCatalog(page);

  // beginner course -> complete exercise
  await page.goto("/");
  await page.getByRole("button", { name: "開始學習" }).click();
  await page.getByRole("link", { name: "選擇課程單元" }).click();
  await expect(page).toHaveURL(/\/courses$/u);

  const unitCard = page
    .getByTestId("course-unit-card")
    .filter({ has: page.getByRole("heading", { name: unit.title } ) });
  await unitCard.getByRole("link", { name: "進入單元" }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${UNIT_SLUG}$`, "u"));

  await page.getByRole("button", { name: "開始本單元" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);
  const sessionId = page.url().split("/").at(-1) ?? "";
  await expect(page.getByText(exerciseInstruction)).toBeVisible();

  await completeTheExercise(page);

  // feedback shows a real skill change: a brand-new guest's primary skill
  // starts at score 0, and a successful, unhinted completion raises it.
  const masterySection = page.locator('[data-feedback-section="mastery"]');
  await expect(masterySection).toContainText(/0 → [1-9][\d.]* 分/u);

  // finish session -> result shows aggregate
  await page.getByRole("button", { name: "下一題" }).click();
  await expect(page).toHaveURL(`/practice/${sessionId}/result`);
  await expect(page.getByRole("heading", { name: "練習結果" })).toBeVisible();
  await expect(page.getByText("1 / 1")).toBeVisible();
  await expect(page.getByText(SKILL_ID)).toBeVisible();

  const masteryLevel = await readSkillMasteryLevel(page, SKILL_ID);
  expect(masteryLevel).not.toBeNull();

  // progress shows unit and skill progress
  await page.goto("/progress");
  const progressDueCount = await page.getByTestId("due-review-count").innerText();
  // A fresh success always schedules its next review at least 6 hours out
  // (review-scheduler.ts), so nothing is due yet - the shared value below
  // should be "0", not merely equal to whatever (possibly wrong) number
  // Progress happens to show.
  expect(progressDueCount).toBe("0");
  await expect(page.getByText(skill.name)).toBeVisible();
  await expect(page.getByText(`Level ${masteryLevel} / 5`)).toBeVisible();
  await expect(page.getByText("1 / 1 題")).toBeVisible();

  // review shows the exact same due count Progress just showed
  await page.goto("/review");
  await expect(page.getByTestId("due-count")).toHaveText(progressDueCount);

  // reload -> data remains
  await page.reload();
  await expect(page.getByTestId("due-count")).toHaveText(progressDueCount);
  await page.goto("/progress");
  await expect(page.getByTestId("due-review-count")).toHaveText(progressDueCount);
  await expect(page.getByText(skill.name)).toBeVisible();
  await expect(page.getByText(`Level ${masteryLevel} / 5`)).toBeVisible();
  await expect(page.getByText("1 / 1 題")).toBeVisible();
});
