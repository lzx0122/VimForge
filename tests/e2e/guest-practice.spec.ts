import { expect, test, type Page } from "@playwright/test";

const UNIT_ID = "00000000-0000-4000-8000-000000000701";
const SKILL_TEXT_OBJECT_ID = "00000000-0000-4000-8000-000000000702";
const SKILL_MOVEMENT_ID = "00000000-0000-4000-8000-000000000703";

const skillTextObject = {
  id: SKILL_TEXT_OBJECT_ID,
  slug: "inner-text-object",
  name: "內部文字物件",
  description: "選取括號、引號內的文字範圍。",
  category: "text_object",
  difficulty: "advanced",
};

const skillMovement = {
  id: SKILL_MOVEMENT_ID,
  slug: "basic-motion",
  name: "基礎移動",
  description: "游標的基本移動方式。",
  category: "movement",
  difficulty: "beginner",
};

function buildExercise(id: string, slug: string, displayOrder: number) {
  return {
    id,
    unit_id: UNIT_ID,
    slug,
    title: slug,
    instruction: "指示內容。",
    language: "typescript",
    exercise_type: "challenge",
    difficulty: "advanced",
    supported_modes: ["efficiency"],
    target_duration_ms: 8000,
    version: 1,
    display_order: displayOrder,
    initial_content: "const value = 1;",
    expected_content: "const value = 1;",
    initial_cursor: { line: 0, column: 0 },
    completion_rule: {
      contentMatch: "exact",
      cursorMatch: { type: "ignore" },
      requiredMode: "normal",
    },
  };
}

// Exactly 10 exercises in the "文字物件" topic, matching the default
// question count, so a single click selects every one of them with no
// partial-match confirmation step. 3 more exercises share an unrelated
// skill outside that topic, to prove the topic filter excludes them.
const textObjectExercises = Array.from({ length: 10 }, (_, index) =>
  buildExercise(
    `00000000-0000-4000-8000-0000000009${String(index).padStart(2, "0")}`,
    `text-object-${index + 1}`,
    index + 1,
  ),
);
const movementExercises = Array.from({ length: 3 }, (_, index) =>
  buildExercise(
    `00000000-0000-4000-8000-0000000010${String(index).padStart(2, "0")}`,
    `movement-${index + 1}`,
    index + 1,
  ),
);

const exerciseSkillLinks = [
  ...textObjectExercises.map((exercise) => ({
    exercise_id: exercise.id,
    skill_id: SKILL_TEXT_OBJECT_ID,
    weight: 1,
    is_primary: true,
  })),
  ...movementExercises.map((exercise) => ({
    exercise_id: exercise.id,
    skill_id: SKILL_MOVEMENT_ID,
    weight: 1,
    is_primary: true,
  })),
];

async function mockTopicPracticeCatalog(page: Page): Promise<void> {
  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    let body: object | object[];

    if (table === "exercises") {
      body = [...textObjectExercises, ...movementExercises];
    } else if (table === "exercise_skills") {
      body = exerciseSkillLinks;
    } else if (table === "skills") {
      body = [skillTextObject, skillMovement];
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

async function readSessionExerciseIds(
  page: Page,
  sessionId: string,
): Promise<string[]> {
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
    const transaction = database.transaction("sessions", "readonly");
    const getRequest = transaction.objectStore("sessions").get(id);
    const record = await new Promise<{
      session: { exerciseIds: string[] };
    }>((resolve, reject) => {
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
    });
    database.close();
    return record.session.exerciseIds;
  }, sessionId);
}

test("lets a guest choose every mode with the keyboard", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "從零開始" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "記憶複習" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "效率進階" })).toBeVisible();

  const reviewButton = page.getByRole("button", { name: "開始複習" });
  await reviewButton.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/practice\/setup\?mode=memory_review$/u);
  await expect(page.getByRole("heading", { name: "練習設定" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /登入/u })).toHaveCount(0);
});

test("offers 5, 10, and 20 questions with 10 selected by default", async ({ page }) => {
  await page.goto("/practice/setup?mode=efficiency");

  const countSelector = page.getByTestId("question-count-selector");
  await expect(countSelector.getByLabel("5 題")).toBeVisible();
  await expect(countSelector.getByLabel("10 題")).toBeChecked();
  await expect(countSelector.getByLabel("20 題")).toBeVisible();

  await countSelector.getByLabel("5 題").check();
  await expect(countSelector.getByLabel("5 題")).toBeChecked();

  await page.getByRole("link", { name: "首頁" }).click();
  await expect(page.getByRole("button", { name: "開始學習" })).toBeEnabled();
});

test("selecting a topic only includes exercises from that topic's skills", async ({
  page,
}) => {
  await mockTopicPracticeCatalog(page);
  await page.goto("/practice/setup?mode=efficiency");

  await page
    .getByTestId("topic-selector")
    .getByLabel("文字物件")
    .check();
  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);

  const sessionId = page.url().split("/").pop() as string;
  const exerciseIds = await readSessionExerciseIds(page, sessionId);
  const movementExerciseIds = new Set(
    movementExercises.map((exercise) => exercise.id),
  );

  expect(exerciseIds).toHaveLength(10);
  expect([...exerciseIds].sort()).toEqual(
    textObjectExercises.map((exercise) => exercise.id).sort(),
  );
  expect(exerciseIds.some((id) => movementExerciseIds.has(id))).toBe(false);
});
