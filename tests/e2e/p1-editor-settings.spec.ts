import { expect, test, type Page } from "@playwright/test";

const UNIT_ID = "00000000-0000-4000-8000-000000000801";
const EXERCISE_COUNT = 20;

/**
 * Every exercise is structurally identical (differing only in id/slug) so
 * that whichever one PracticeSelectionService happens to pick first is
 * always a valid, interactable, two-line exercise: "dd" then "p" is safe to
 * press on any of them without depending on selection order.
 */
function buildExercise(index: number) {
  const id = `00000000-0000-4000-8000-0000000090${String(index).padStart(2, "0")}`;
  return {
    id,
    unit_id: UNIT_ID,
    slug: `editor-settings-${index}`,
    title: `編輯器設定情境 ${index}`,
    instruction: "刪除第一行並貼回，維持 Normal Mode。",
    language: "plaintext",
    exercise_type: "challenge",
    difficulty: "beginner",
    supported_modes: ["efficiency"],
    target_duration_ms: 15000,
    version: 1,
    display_order: index,
    initial_content: "alpha\nbeta",
    expected_content: "alpha\nbeta",
    initial_cursor: { line: 0, column: 0 },
    completion_rule: {
      contentMatch: "unchanged",
      cursorMatch: { type: "ignore" },
      requiredMode: "normal",
    },
  };
}

const exercises = Array.from({ length: EXERCISE_COUNT }, (_unused, index) =>
  buildExercise(index + 1),
);
const exercisesById = new Map(
  exercises.map((exercise) => [exercise.id, exercise]),
);

async function mockEfficiencyCatalog(page: Page): Promise<void> {
  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    const idFilter = requestUrl.searchParams.get("id")?.replace("eq.", "");

    if (table === "exercises" && idFilter !== undefined) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(exercisesById.get(idFilter) ?? null),
      });
      return;
    }

    if (table === "exercises") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          exercises.map((exercise) => ({
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
          })),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

async function startEfficiencySession(page: Page): Promise<void> {
  // A brand-new guest has no attempt history, so PracticeSelectionService
  // reports the general-fallback message before confirming - two clicks,
  // matching PracticeSetupPage's existing preview-then-commit flow.
  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(
    page.getByText("尚無個人練習資料，本次先安排一般效率題目。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "使用這些題目開始練習" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);
}

test("connects Settings Store values to the practice editor, in both directions", async ({
  page,
}) => {
  await mockEfficiencyCatalog(page);

  const settingsStatus = page.getByTestId("settings-status");

  await page.goto("/settings");
  await page.getByTestId("editor-font-size").fill("22");
  await expect(page.getByText("編輯器字體大小：22 px")).toBeVisible();
  await expect(settingsStatus).toContainText("已保存");

  await page.getByTestId("show-line-numbers").uncheck();
  await expect(page.getByTestId("show-line-numbers")).not.toBeChecked();
  await expect(settingsStatus).toContainText("已保存");

  await page.getByTestId("show-keypresses").check();
  await expect(page.getByTestId("show-keypresses")).toBeChecked();
  await expect(settingsStatus).toContainText("已保存");

  const countSelector = page.getByTestId("question-count-selector");
  await countSelector.getByLabel("20 題").check();
  await expect(countSelector.getByLabel("20 題")).toBeChecked();
  // Wait for this last change to be durably persisted to IndexedDB before
  // navigating away: a hard navigation can interrupt an in-flight async
  // write, and page.goto() below must not race it.
  await expect(settingsStatus).toContainText("已保存");

  await page.goto("/practice/setup?mode=efficiency");
  await expect(
    page.getByTestId("question-count-selector").getByLabel("20 題"),
  ).toBeChecked();

  await startEfficiencySession(page);
  const practiceUrl = page.url();

  await expect(page.locator(".cm-lineNumbers")).toHaveCount(0);
  await expect(page.locator(".cm-editor")).toHaveCSS("font-size", "22px");

  const editorContent = page.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press("d");
  await page.keyboard.press("d");
  await page.keyboard.press("p");

  const recentKeypresses = page.locator('[aria-label="最近按鍵"]');
  await expect(recentKeypresses.getByTestId("recent-key")).toHaveText([
    "d",
    "d",
    "p",
  ]);

  await page.goto("/settings");
  await page.getByTestId("show-keypresses").uncheck();
  await expect(page.getByTestId("show-keypresses")).not.toBeChecked();
  await expect(settingsStatus).toContainText("已保存");

  await page.goto(practiceUrl);
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('[aria-label="最近按鍵"]')).toHaveCount(0);

  // Re-typing after the return proves the region stays hidden because the
  // setting is off, not merely because the resumed Draft's recent keys are
  // empty (Task 10 always clears them on resume, independently of this
  // setting).
  await page.locator(".cm-content").click();
  await page.keyboard.press("x");
  await expect(page.locator('[aria-label="最近按鍵"]')).toHaveCount(0);

  await page.goto("/practice/setup?mode=efficiency&count=5");
  await expect(
    page.getByTestId("question-count-selector").getByLabel("5 題"),
  ).toBeChecked();
});
