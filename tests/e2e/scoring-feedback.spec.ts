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
        supported_modes: ["beginner", "memory_review", "efficiency"],
        target_duration_ms: 12000,
        version: 1,
        display_order: 1,
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
        supported_modes: ["beginner", "memory_review", "efficiency"],
        target_duration_ms: 12000,
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
            display_order: exercise.display_order,
          }];
    } else if (table === "exercise_skills") {
      body = [{
        exercise_id: exercise.id,
        skill_id: "00000000-0000-4000-8000-000000000101",
        weight: 1,
        is_primary: true,
      }];
    } else if (table === "skills") {
      body = [{
        id: "00000000-0000-4000-8000-000000000101",
        slug: "basic-motion",
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

/**
 * Task 12's setup page previews a partial match instead of navigating
 * immediately: when fewer exercises are available than requested, the first
 * click stays on the setup page and shows this message, and a second click
 * is required to actually create the session and navigate.
 */
async function startPracticeAfterPartialMatchPreview(
  page: Page,
  availableCount: number,
): Promise<void> {
  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(
    page.getByText(
      `目前符合條件的題目共有 ${availableCount} 題，本次將安排全部可用題目。`,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "使用這些題目開始練習" })
    .click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);
}

/**
 * daily_review requires existing personalization history and returns
 * nothing for a brand-new guest (Task 11), so these fixtures - which mock a
 * guest with zero attempt history - select 指定主題 / 基礎移動 instead.
 * Topic practice has no such history requirement and matches the mocked
 * exercises' "basic-motion" skill.
 */
async function selectTopicPractice(page: Page): Promise<void> {
  await page.getByLabel("指定主題").check();
  await page.getByTestId("topic-selector").getByLabel("基礎移動").check();
}

async function startPracticeSession(
  page: Page,
  scenario: ExerciseScenario = "insert",
): Promise<string> {
  await mockExerciseCatalog(page, scenario);
  await page.goto("/practice/setup?mode=memory_review");
  await page.getByLabel("5 題").check();
  await selectTopicPractice(page);
  await startPracticeAfterPartialMatchPreview(page, 1);
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
      const request = indexedDB.open("vim-forge");
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

async function readAttemptExerciseIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
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
      .getAll();
    const attempts = await new Promise<
      Array<{ exerciseId: string; startedAt: string }>
    >((resolve, reject) => {
      request.addEventListener(
        "success",
        () =>
          resolve(
            request.result as Array<{ exerciseId: string; startedAt: string }>,
          ),
        { once: true },
      );
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to read attempts")),
        { once: true },
      );
    });
    database.close();
    return attempts
      .slice()
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
      .map((attempt) => attempt.exerciseId);
  });
}

async function readPersistedAttemptDraft(
  page: Page,
  sessionId: string,
): Promise<unknown> {
  return page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to open IndexedDB")),
        { once: true },
      );
    });
    const request = database
      .transaction("sessions", "readonly")
      .objectStore("sessions")
      .get(id);
    const record = await new Promise<{ attemptDraft: unknown } | undefined>(
      (resolve, reject) => {
        request.addEventListener(
          "success",
          () => resolve(request.result as { attemptDraft: unknown } | undefined),
          { once: true },
        );
        request.addEventListener(
          "error",
          () => reject(request.error ?? new Error("Unable to read session")),
          { once: true },
        );
      },
    );
    database.close();
    if (record === undefined) {
      throw new Error(`Expected a stored session for id ${id}`);
    }
    return record.attemptDraft;
  }, sessionId);
}

async function forceDatabaseClosureMidFlight(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const currentVersion = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
      request.addEventListener(
        "success",
        () => {
          const version = request.result.version;
          request.result.close();
          resolve(version);
        },
        { once: true },
      );
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to open IndexedDB")),
        { once: true },
      );
    });

    await new Promise<void>((resolve, reject) => {
      const upgradeRequest = indexedDB.open("vim-forge", currentVersion + 1);
      upgradeRequest.addEventListener(
        "success",
        () => {
          upgradeRequest.result.close();
          resolve();
        },
        { once: true },
      );
      upgradeRequest.addEventListener(
        "error",
        () => reject(upgradeRequest.error ?? new Error("Unable to bump IndexedDB version")),
        { once: true },
      );
      upgradeRequest.addEventListener(
        "blocked",
        () => reject(new Error("IndexedDB version bump was blocked")),
        { once: true },
      );
    });
  });
}

const SECOND_EXERCISE_ID = "00000000-0000-4000-8000-000000000403";

async function mockTwoExerciseCatalogWithFlakySecondFetch(
  page: Page,
): Promise<{ failNextSecondExerciseFetch: () => void }> {
  let shouldFailSecondFetch = false;
  const firstExercise = {
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
  const secondExercise = {
    id: SECOND_EXERCISE_ID,
    unit_id: "00000000-0000-4000-8000-000000000201",
    slug: "insert-suffix-01",
    title: "插入字尾",
    instruction: "在 name 後插入 x，最後回到 Normal Mode。",
    language: "typescript",
    exercise_type: "guided",
    difficulty: "beginner",
    supported_modes: ["beginner", "memory_review"],
    target_duration_ms: 12000,
    version: 1,
    display_order: 2,
    initial_content: "const name = true;",
    expected_content: "const namxe = true;",
    initial_cursor: { line: 0, column: 9 },
    completion_rule: {
      contentMatch: "exact",
      cursorMatch: { type: "ignore" },
      requiredMode: "normal",
    },
  };
  const exercisesById: Record<string, typeof firstExercise> = {
    [firstExercise.id]: firstExercise,
    [secondExercise.id]: secondExercise,
  };
  const solutionsById: Record<string, object[]> = {
    [firstExercise.id]: [{
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
    }],
    [secondExercise.id]: [{
      sequence: "ix<Esc>",
      normalized_actions: [
        { type: "vim_command", command: "i" },
        { type: "insert_text", text: "x", textLength: 1 },
        { type: "mode_change", mode: "normal" },
      ],
      keystroke_count: 3,
      is_recommended: true,
      explanation: "使用 i 插入字尾，完成後按 Esc。",
      display_order: 0,
    }],
  };

  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    const idFilter = requestUrl.searchParams.get("id");
    const exerciseIdFilter = requestUrl.searchParams.get("exercise_id");
    const targetId =
      idFilter?.replace("eq.", "") ?? exerciseIdFilter?.replace("eq.", "") ?? null;

    if (table === "exercises" && idFilter) {
      if (targetId === secondExercise.id && shouldFailSecondFetch) {
        shouldFailSecondFetch = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "mock exercise fetch failure" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(targetId ? exercisesById[targetId] ?? null : null),
      });
      return;
    }

    if (table === "exercises") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          [firstExercise, secondExercise].map((exercise) => ({
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

    if (table === "exercise_skills") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([firstExercise, secondExercise].map((ex) => ({
          exercise_id: ex.id,
          skill_id: "00000000-0000-4000-8000-000000000101",
          weight: 1,
          is_primary: true,
        }))),
      });
      return;
    }

    if (table === "skills") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "00000000-0000-4000-8000-000000000101",
          slug: "basic-motion",
        }]),
      });
      return;
    }

    if (table === "exercise_solutions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(targetId ? solutionsById[targetId] ?? [] : []),
      });
      return;
    }

    if (table === "exercise_hints") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  return {
    failNextSecondExerciseFetch: () => {
      shouldFailSecondFetch = true;
    },
  };
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

async function completeInsertExercise(page: Page): Promise<void> {
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.keyboard.press("i");
  await page.keyboard.type("x");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();
}

async function readLatestAttemptTiming(
  page: Page,
): Promise<{ startedAt: string; durationMs: number }> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
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
      .getAll();
    const attempts = await new Promise<Array<{
      startedAt: string;
      durationMs: number;
    }>>((resolve, reject) => {
      request.addEventListener(
        "success",
        () => resolve(request.result as Array<{
          startedAt: string;
          durationMs: number;
        }>),
        { once: true },
      );
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to read attempts")),
        { once: true },
      );
    });
    database.close();
    const attempt = attempts.at(-1);
    if (!attempt) {
      throw new Error("Expected a stored attempt");
    }
    return attempt;
  });
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
  await page.setViewportSize({ width: 800, height: 400 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sessionId = await startPracticeSession(page);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.keyboard.press("h");
  await page.keyboard.press("l");
  await page.keyboard.press("i");
  await page.keyboard.type("x");

  await expect(page.getByText("請回到 Normal Mode")).toBeVisible();
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();
  await expect(page.locator("#exercise-feedback-title")).toBeInViewport({
    ratio: 0.5,
    timeout: 10_000,
  });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("button", { name: "檢查答案" })).toHaveCount(0);
  await expect(
    page.locator('[data-feedback-section="accuracy"]').getByText("準確", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator('[data-feedback-section="speed"]').getByText("速度", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "準確：是否一次到位；Undo 與提示會扣分，按鍵較多不會重複扣分。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "速度：按鍵精簡度 60% 加上完成時間 40%，並依學習模式提供時間寬限。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "熟練：跨題目、跨時間累積的 0–5 長期程度，不是單題分數。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".practice-workspace")).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("const xname = true;");
  const recommendation = page.locator('[data-testid="recommended-explanation"]');
  await expect(recommendation).toBeVisible();
  await expect(recommendation).toContainText("使用 i 插入字元，完成後按 Esc。");
  await expect(recommendation).not.toContainText("本題使用的 Vim 按鍵");
  await expect(page.locator('[data-testid="vim-key-guide"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "再試一次" })).toBeVisible();
  await page.getByText("查看計算方式", { exact: true }).click();
  await expect(page.locator("details.metric-explanation")).toContainText(
    "按鍵精簡度 60% + 時間效率 40%",
  );
  await expect(page.getByText("推薦操作", { exact: true })).toBeVisible();
  await expect(
    page.locator('[data-feedback-section="solutions"] code').first(),
  ).toHaveText("hlix<Esc>");
  await expect(
    page.locator('[data-feedback-section="solutions"] code').last(),
  ).toHaveText("ix<Esc>");
  await expect.poll(() => readAttemptCount(page)).toBe(1);

  await page.getByRole("button", { name: "下一題" }).click();
  await expect(page).toHaveURL(`/practice/${sessionId}/result`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "練習結果" })).toBeVisible();
});

test("keeps expanded metric calculations inside their layout", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await startPracticeSession(page);
  await completeInsertExercise(page);
  await page.getByText("查看計算方式", { exact: true }).click();

  const layout = await page.locator(".metric-explanation-grid").evaluate((grid) => ({
    gridFits: grid.scrollWidth <= grid.clientWidth,
    sectionsFit: Array.from(grid.children).every(
      (section) => section.scrollWidth <= section.clientWidth,
    ),
  }));
  expect(layout).toEqual({ gridFits: true, sectionsFit: true });

  const columnCount = await page
    .locator(".metric-explanation-grid")
    .evaluate((grid) =>
      window
        .getComputedStyle(grid)
        .gridTemplateColumns.split(/\s+/u)
        .filter(Boolean).length,
    );
  expect(columnCount).toBe(2);

  const detailsBox = await page.locator("details.metric-explanation").boundingBox();
  const solutionsBox = await page
    .locator('[data-feedback-section="solutions"]')
    .boundingBox();
  expect(detailsBox).not.toBeNull();
  expect(solutionsBox).not.toBeNull();
  expect((detailsBox?.y ?? 0) + (detailsBox?.height ?? 0)).toBeLessThanOrEqual(
    (solutionsBox?.y ?? 0) + 1,
  );
});

test("does not let the calculation summary bar overlap the metric definitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockExerciseCatalog(page);
  await page.goto("/practice/setup?mode=efficiency");
  await page.getByLabel("5 題").check();
  await startPracticeAfterPartialMatchPreview(page, 1);

  await completeInsertExercise(page);
  await expect(page.locator('[data-testid="keystroke-gap"]')).toBeVisible();

  const sections = page.locator(".exercise-feedback-metrics > section");
  const overflow = await sections.evaluateAll((elements) =>
    elements.map((element) => element.scrollHeight <= element.clientHeight + 1),
  );
  expect(overflow).toEqual([true, true, true]);

  const lastDefinitionBox = await page
    .locator(".metric-definition, [data-testid=\"keystroke-gap\"]")
    .last()
    .boundingBox();
  const summaryBox = await page
    .locator("details.metric-explanation summary")
    .boundingBox();
  expect(lastDefinitionBox).not.toBeNull();
  expect(summaryBox).not.toBeNull();
  expect((lastDefinitionBox?.y ?? 0) + (lastDefinitionBox?.height ?? 0)).toBeLessThanOrEqual(
    summaryBox?.y ?? 0,
  );
});

test("retries the completed exercise before advancing the session", async ({ page }) => {
  const sessionId = await startPracticeSession(page);
  const timer = page.getByLabel("已練習時間");

  await completeInsertExercise(page);
  await expect(page.getByText("第 1 / 1 題", { exact: true })).toBeVisible();
  await expect.poll(() => readAttemptCount(page)).toBe(1);

  await page.getByRole("button", { name: "再試一次" }).click();

  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);
  await expect(page.getByText("第 1 / 1 題", { exact: true })).toBeVisible();
  await expect
    .poll(async () => elapsedSeconds(await timer.textContent()))
    .toBeLessThanOrEqual(1);
  await expect(page.getByText("已解鎖 0 / 3", { exact: true })).toBeVisible();
  await expect.poll(() => readAttemptCount(page)).toBe(1);

  await completeInsertExercise(page);
  await expect.poll(() => readAttemptCount(page)).toBe(2);

  await page.getByRole("button", { name: "下一題" }).click();
  await expect(page).toHaveURL(`/practice/${sessionId}/result`);
});

test("locks the editor and rejects further input once feedback is shown", async ({ page }) => {
  await startPracticeSession(page);
  const editor = page.locator(".cm-content");

  await completeInsertExercise(page);
  await expect.poll(() => readAttemptCount(page)).toBe(1);
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(editor).toContainText("const xname = true;");

  await editor.click({ force: true });
  await page.keyboard.type("MORE TEXT");
  await page.keyboard.press("o");
  await page.keyboard.type("EVEN MORE");

  await expect(editor).toContainText("const xname = true;");
  await expect(editor).not.toContainText("MORE TEXT");
  await expect(editor).not.toContainText("EVEN MORE");
  expect(await readAttemptCount(page)).toBe(1);

  await page.reload();
  await expect(page.locator('[data-testid="restored-attempt-content"]')).toHaveCount(0);
  await expect.poll(() => readAttemptCount(page)).toBe(1);
});

test("keeps the hint panel locked and avoids recreating a draft after feedback is shown", async ({ page }) => {
  const sessionId = await startPracticeSession(page);

  await completeInsertExercise(page);
  await expect.poll(() => readAttemptCount(page)).toBe(1);
  expect(await readPersistedAttemptDraft(page, sessionId)).toBeNull();

  const revealButton = page.getByRole("button", { name: "顯示提示 1" });
  await expect(revealButton).toBeDisabled();
  await revealButton.click({ force: true });

  await expect(page.getByText("已解鎖 0 / 3", { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="restored-attempt-content"]')).toHaveCount(0);
  expect(await readAttemptCount(page)).toBe(1);
  expect(await readPersistedAttemptDraft(page, sessionId)).toBeNull();
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

test("autofocuses the target and restarts with a fresh timed attempt", async ({ page }) => {
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

  await page.getByRole("button", { name: "顯示提示 1" }).click();
  await expect(page.getByText("已解鎖 1 / 3", { exact: true })).toBeVisible();
  await editor.click();

  await page.keyboard.press("i");
  await expect(mode).toHaveText("Insert");
  await page.keyboard.type("x");

  const restartButton = page.getByRole("button", { name: "重新開始本題" });
  const restartRequestedAt = Date.now();
  await restartButton.click();

  await expect(editor).toHaveText("const name = true;");
  await expect(editor).toBeFocused();
  await expect.poll(() => domCursorOffset(page)).toBe(6);
  await expect(mode).toHaveText("Normal");
  await expect
    .poll(async () => elapsedSeconds(await timer.textContent()))
    .toBeLessThanOrEqual(1);
  await expect(page.getByText("已解鎖 0 / 3", { exact: true })).toBeVisible();
  expect(await readAttemptCount(page)).toBe(0);

  await completeInsertExercise(page);
  const timing = await readLatestAttemptTiming(page);
  expect(Date.parse(timing.startedAt)).toBeGreaterThanOrEqual(
    restartRequestedAt - 1_000,
  );
  expect(timing.durationMs).toBeLessThan(10_000);
});

test("keeps the pre-restart attempt visible when the fresh draft fails to persist", async ({ page }) => {
  await startPracticeSession(page);
  const editor = page.locator(".cm-content");

  await expect(editor).toBeFocused();
  await page.keyboard.press("i");
  await page.keyboard.type("zzz");
  await page.keyboard.press("Escape");
  await expect(editor).toContainText("const zzzname = true;");
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);

  await forceDatabaseClosureMidFlight(page);
  await page.getByRole("button", { name: "重新開始本題" }).click();

  await expect(page.getByText("已重新開始本題。", { exact: true })).toHaveCount(0);
  await expect(editor).toContainText("const zzzname = true;");
  await expect(page.locator(".error-message")).toBeVisible();
});

test("restores the fresh restart draft, not the pre-restart draft, after an immediate reload", async ({ page }) => {
  await startPracticeSession(page);
  const editor = page.locator(".cm-content");

  await expect(editor).toBeFocused();
  await page.keyboard.press("i");
  await page.keyboard.type("zzz");
  await page.keyboard.press("Escape");
  await expect(editor).toContainText("const zzzname = true;");

  await page.getByRole("button", { name: "重新開始本題" }).click();
  await expect(page.getByText("已重新開始本題。", { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("button", { name: "恢復未完成內容" })).toBeVisible();
  await page.getByRole("button", { name: "恢復未完成內容" }).click();

  await expect(editor).toHaveText("const name = true;");
  await expect(editor).not.toContainText("zzz");
});

test("reveals available hints in order without playback or an attempt", async ({ page }) => {
  await startPracticeSession(page);

  for (const level of [1, 3, 4]) {
    await page.getByRole("button", { name: `顯示提示 ${level}` }).click();
    await expect(page.getByText(`提示 ${level}`, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("已解鎖 3 / 3")).toBeVisible();
  await expect(page.getByRole("button", { name: "顯示提示 4" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "播放操作" })).toHaveCount(0);
  await expect(page.locator('[data-testid="playback-completed-content"]')).toHaveCount(0);
  await expect.poll(() => readAttemptCount(page)).toBe(0);
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);
  await expect(page.locator(".practice-workspace")).toBeVisible();
});

test("brings the skipped result into view after skipping an exercise", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 400 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startPracticeSession(page);

  await page.getByRole("button", { name: "跳過這題" }).click();

  await expect(page.getByRole("article", { name: "尚未完成" })).toBeVisible();
  await expect(page.locator("#exercise-feedback-title")).toBeInViewport({
    ratio: 0.5,
    timeout: 10_000,
  });
  await expect(page.locator(".practice-workspace")).toBeVisible();
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("recovers from a failed next-exercise load without losing feedback or advancing the session", async ({ page }) => {
  const { failNextSecondExerciseFetch } = await mockTwoExerciseCatalogWithFlakySecondFetch(page);
  // Both candidates are unattempted and tie on every topic-practice ranking
  // key, so their relative order otherwise depends on the date-seeded
  // shuffle (Task 10). Pin the clock so exercise order - which this test's
  // "second exercise" fetch failure targets by id - stays deterministic.
  // This date was chosen by running domain/review/seeded-order.ts's hash
  // against both exercise ids and confirming it orders EXERCISE_ID first.
  await page.clock.install({ time: new Date("2026-07-21T12:00:00.000Z") });
  await page.goto("/practice/setup?mode=memory_review");
  await page.getByLabel("5 題").check();
  await selectTopicPractice(page);
  await startPracticeAfterPartialMatchPreview(page, 2);
  await expect(page.getByText("在 name 前插入 x，最後回到 Normal Mode。")).toBeVisible();

  await completeInsertExercise(page);
  await expect.poll(() => readAttemptCount(page)).toBe(1);

  failNextSecondExerciseFetch();
  await page.getByRole("button", { name: "下一題" }).click();

  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();
  await expect(page.getByText("第 1 / 2 題", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("無法載入下一題");
  await expect(page.locator(".cm-content")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  await expect(page.getByRole("button", { name: "跳過這題" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重新開始本題" })).toBeDisabled();
  expect(await readAttemptCount(page)).toBe(1);

  await page.getByRole("button", { name: "下一題" }).click();

  await expect(page.getByText("在 name 後插入 x，最後回到 Normal Mode。")).toBeVisible();
  await expect(page.getByText("第 2 / 2 題", { exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "完成！" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);

  await completeInsertExercise(page);
  await expect.poll(() => readAttemptCount(page)).toBe(2);
  expect(await readAttemptExerciseIds(page)).toEqual([
    EXERCISE_ID,
    SECOND_EXERCISE_ID,
  ]);

  await page.getByRole("button", { name: "下一題" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+\/result$/u);
});
