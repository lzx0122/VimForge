import { expect, test, type Page } from "@playwright/test";

const UNIT_ID = "00000000-0000-4000-8000-000000000501";
const UNIT_SLUG = "getting-started";
const SKILL_ID = "00000000-0000-4000-8000-000000000502";
const EXERCISE_ID = "00000000-0000-4000-8000-000000000503";
const EXERCISE_SLUG = "getting-started-01";

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

async function mockCourseCatalog(page: Page): Promise<void> {
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
      body = requestUrl.searchParams.has("id") ? exercise : [exercise];
    } else if (table === "exercise_skills") {
      body = [{ skill_id: SKILL_ID, weight: 1, is_primary: true }];
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

test("starts a beginner course unit from the home page and resumes it after a reload", async ({
  page,
}) => {
  await mockCourseCatalog(page);

  await page.goto("/");
  await page.getByRole("button", { name: "開始學習" }).click();
  await expect(page).toHaveURL(/\/practice\/setup\?mode=beginner$/u);

  await page.getByRole("link", { name: "選擇課程單元" }).click();
  await expect(page).toHaveURL(/\/courses$/u);

  const unitCard = page
    .getByTestId("course-unit-card")
    .filter({ has: page.getByRole("heading", { name: unit.title } ) });
  await expect(unitCard).toHaveCount(1);
  await expect(unitCard.getByText("1 題")).toBeVisible();
  await expect(unitCard.getByText(skill.name)).toBeVisible();

  await unitCard.getByRole("link", { name: "進入單元" }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${UNIT_SLUG}$`, "u"));

  await expect(page.getByRole("heading", { name: unit.title })).toBeVisible();
  await expect(page.getByText(unit.description)).toBeVisible();
  await expect(page.getByText(skill.name)).toBeVisible();
  await expect(
    page.getByTestId("exercise-type-counts").getByText("引導：1"),
  ).toBeVisible();

  await page.getByRole("button", { name: "開始本單元" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);
  await expect(page.getByText(exerciseInstruction)).toBeVisible();

  const practiceUrl = page.url();
  await page.reload();

  await expect(
    page.getByRole("dialog", { name: "發現尚未完成的練習" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "繼續題組" }).click();

  await expect(page).toHaveURL(practiceUrl);
  await expect(page.getByText(exerciseInstruction)).toBeVisible();
});
