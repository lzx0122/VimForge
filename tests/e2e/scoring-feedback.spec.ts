import { expect, test, type Page } from "@playwright/test";

const EXERCISE_ID = "00000000-0000-4000-8000-000000000401";
const MOVEMENT_EXERCISE_ID = "00000000-0000-4000-8000-000000000402";

type ExerciseScenario = "insert" | "movement";

async function mockExerciseCatalog(
  page: Page,
  scenario: ExerciseScenario = "insert",
): Promise<void> {
  const isMovement = scenario === "movement";
  const exerciseId = isMovement ? MOVEMENT_EXERCISE_ID : EXERCISE_ID;
  const exercise = isMovement
    ? {
        id: exerciseId,
        unit_id: "00000000-0000-4000-8000-000000000201",
        slug: "move-cursor-01",
        title: "移動游標",
        instruction: "把游標移到 c 上，完成後維持 Normal Mode。",
        language: "plaintext",
        exercise_type: "challenge",
        difficulty: "beginner",
        supported_modes: ["beginner", "memory_review"],
        target_duration_ms: 12000,
        version: 1,
        initial_content: "abc",
        expected_content: "abc",
        initial_cursor: { line: 0, column: 0 },
        completion_rule: {
          contentMatch: "unchanged",
          cursorMatch: { type: "exact", line: 0, column: 2 },
          requiredMode: "normal",
        },
      }
    : {
        id: exerciseId,
        unit_id: "00000000-0000-4000-8000-000000000201",
        slug: "insert-prefix-01",
        title: "插入字首",
        instruction: "在 name 前插入 x，最後回到 Normal Mode。",
        language: "typescript",
        exercise_type: "guided",
        difficulty: "beginner",
        supported_modes: ["beginner", "memory_review"],
        target_duration_ms: 12000,
        version: 1,
        initial_content: "const name = true;",
        expected_content: "const xname = true;",
        initial_cursor: { line: 0, column: 6 },
        completion_rule: {
          contentMatch: "exact",
          cursorMatch: { type: "ignore" },
          requiredMode: "normal",
        },
      };

  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    let body: object | object[];

    if (table === "exercises") {
      body = requestUrl.searchParams.has("id")
        ? exercise
        : [{
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
          }];
    } else if (table === "exercise_skills") {
      body = [{
        skill_id: "00000000-0000-4000-8000-000000000101",
        weight: 1,
        is_primary: true,
      }];
    } else if (table === "exercise_solutions") {
      body = isMovement
        ? [{
            sequence: "ll",
            normalized_actions: [
              { type: "vim_command", command: "l" },
              { type: "vim_command", command: "l" },
            ],
            keystroke_count: 2,
            is_recommended: true,
            explanation: "使用 l 向右移動兩格。",
            display_order: 0,
          }]
        : [{
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
          }];
    } else if (table === "exercise_hints") {
      body = [
        { level: 1, content: "先進入可輸入文字的模式。", command_preview: null },
        { level: 2, content: "使用 Insert Mode。", command_preview: "i" },
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

async function startPracticeSession(
  page: Page,
  scenario: ExerciseScenario = "insert",
): Promise<string> {
  await mockExerciseCatalog(page, scenario);
  await page.goto("/practice/setup?mode=memory_review");
  await page.getByLabel("5 題").check();
  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);
  await expect(
    page.getByText(
      scenario === "movement"
        ? "把游標移到 c 上，完成後維持 Normal Mode。"
        : "在 name 前插入 x，最後回到 Normal Mode。",
    ),
  ).toBeVisible();
  return page.url().split("/").at(-1) ?? "";
}

async function readAttemptCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge", 1);
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to open IndexedDB")),
        { once: true },
      );
    });
    const request = database
      .transaction("attempts", "readonly")
      .objectStore("attempts")
      .count();
    const count = await new Promise<number>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to count attempts")),
        { once: true },
      );
    });
    database.close();
    return count;
  });
}

function elapsedSeconds(value: string | null): number {
  if (value === null) {
    throw new Error("Expected an elapsed-time value");
  }

  const [minutes, seconds] = value.split(":").map(Number);
  if (
    minutes === undefined ||
    seconds === undefined ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    throw new Error(`Invalid elapsed-time value: ${value}`);
  }

  return minutes * 60 + seconds;
}

async function domCursorOffset(page: Page): Promise<number | null> {
  return page.locator(".cm-content").evaluate((content) => {
    const selection = window.getSelection();
    if (
      selection?.anchorNode === null ||
      selection?.anchorNode === undefined ||
      !content.contains(selection.anchorNode)
    ) {
      return null;
    }

    const range = document.createRange();
    range.selectNodeContents(content);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  });
}

test("automatically completes after every target condition matches", async ({ page }) => {
  const sessionId = await startPracticeSession(page);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.keyboard.press("i");
  await page.keyboard.type("x");

  await expect(page.getByText("請回到 Normal Mode")).toBeVisible();
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();
  await expect(page.getByRole("button", { name: "檢查答案" })).toHaveCount(0);
  await expect(page.getByText("準確", { exact: true })).toBeVisible();
  await expect(page.getByText("速度", { exact: true })).toBeVisible();
  await expect(page.getByText("推薦操作", { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-feedback-section="solutions"] code').first(),
  ).toHaveText("ix<Esc>");
  await expect.poll(() => readAttemptCount(page)).toBe(1);

  await page.getByRole("button", { name: "下一題" }).click();
  await expect(page).toHaveURL(`/practice/${sessionId}/result`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "練習結果" })).toBeVisible();
});

test("shows a cursor target and auto-completes a movement exercise", async ({ page }) => {
  await startPracticeSession(page, "movement");

  await expect(page.getByText("黃色框為目標游標位置")).toBeVisible();
  await expect(
    page.locator(
      ".cm-cursor-target:not(.cm-cursor-target-eol)",
    ),
  ).toHaveText("c");
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);

  await page.keyboard.press("l");
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);
  await page.keyboard.press("l");

  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();
  await expect.poll(() => readAttemptCount(page)).toBe(1);
});

test("autofocuses the target and restarts without creating an attempt", async ({ page }) => {
  await startPracticeSession(page);

  const editor = page.locator(".cm-content");
  const mode = page.locator(".practice-editor-status-bar .vim-mode-badge");
  const timer = page.getByLabel("已練習時間");

  await expect(editor).toBeFocused();
  await expect.poll(() => domCursorOffset(page)).toBe(6);
  await expect(mode).toHaveText("Normal");
  await expect(timer).toHaveText(/^\d{2,}:\d{2}$/u);
  await expect
    .poll(async () => elapsedSeconds(await timer.textContent()))
    .toBeGreaterThanOrEqual(1);

  await page.keyboard.press("i");
  await expect(mode).toHaveText("Insert");
  await page.keyboard.type("x");
  const beforeRestart = elapsedSeconds(await timer.textContent());

  const restartButton = page.getByRole("button", { name: "重新開始本題" });
  await restartButton.click();
  await expect(editor).toHaveText("const name = true;");
  await expect(editor).toBeFocused();
  await expect.poll(() => domCursorOffset(page)).toBe(6);
  await expect(mode).toHaveText("Normal");
  expect(elapsedSeconds(await timer.textContent())).toBeGreaterThanOrEqual(
    beforeRestart,
  );
  expect(await readAttemptCount(page)).toBe(0);
});

test("reveals four hints in order and resets after playback without an attempt", async ({ page }) => {
  await startPracticeSession(page);

  for (const level of [1, 2, 3, 4]) {
    await page.getByRole("button", { name: `顯示提示 ${level}` }).click();
    await expect(page.getByText(`提示 ${level}`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("已解鎖 4 / 4")).toBeVisible();
  await expect(page.getByRole("button", { name: "顯示提示 4" })).toHaveCount(0);

  await page.getByRole("button", { name: "播放操作" }).click();
  await expect(
    page.getByText("示範已結束，題目已重設，請親自完成。"),
  ).toBeVisible();
  await expect.poll(() => readAttemptCount(page)).toBe(0);
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);
});
