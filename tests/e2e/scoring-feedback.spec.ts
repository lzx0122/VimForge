import { expect, test, type Page } from "@playwright/test";

const EXERCISE_ID = "00000000-0000-4000-8000-000000000401";

async function mockExerciseCatalog(page: Page): Promise<void> {
  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    let body: object | object[];

    if (table === "exercises") {
      const exercise = {
        id: EXERCISE_ID,
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
      body = [{
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

async function startPracticeSession(page: Page): Promise<string> {
  await mockExerciseCatalog(page);
  await page.goto("/practice/setup?mode=memory_review");
  await page.getByLabel("5 題").check();
  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);
  await expect(page.getByText("在 name 前插入 x，最後回到 Normal Mode。")).toBeVisible();
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

test("requires the target mode before showing scored feedback", async ({ page }) => {
  const sessionId = await startPracticeSession(page);
  const editor = page.locator(".cm-content");
  await editor.focus();
  await page.keyboard.press("i");
  await page.keyboard.type("x");
  await page.getByRole("button", { name: "檢查答案" }).click();

  await expect(page.getByText("請回到 Normal Mode")).toBeVisible();
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);

  await editor.focus();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "檢查答案" }).click();

  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();
  await expect(page.getByText("準確", { exact: true })).toBeVisible();
  await expect(page.getByText("速度", { exact: true })).toBeVisible();
  await expect(page.getByText("推薦操作", { exact: true })).toBeVisible();
  await expect(page.getByText("ix<Esc>", { exact: true })).toBeVisible();
  await expect.poll(() => readAttemptCount(page)).toBe(1);

  await page.getByRole("button", { name: "下一題" }).click();
  await expect(page).toHaveURL(`/practice/${sessionId}/result`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "練習結果" })).toBeVisible();
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
