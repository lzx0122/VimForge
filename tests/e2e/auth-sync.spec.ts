import { expect, test, type Page } from "@playwright/test";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000701";

async function seedPendingAttempt(page: Page): Promise<void> {
  await page.evaluate(async (attemptId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to open IndexedDB")),
        { once: true },
      );
    });
    const transaction = database.transaction("attempts", "readwrite");
    const completion = new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener(
        "error",
        () => reject(transaction.error ?? new Error("Unable to seed attempt")),
        { once: true },
      );
    });
    transaction.objectStore("attempts").put({
      clientAttemptId: attemptId,
      sessionId: null,
      exerciseId: "00000000-0000-4000-8000-000000000401",
      exerciseVersion: 1,
      learningMode: "memory_review",
      source: "web",
      completed: true,
      startedAt: "2026-07-16T08:00:00.000Z",
      completedAt: "2026-07-16T08:00:08.000Z",
      durationMs: 8000,
      keystrokeCount: 3,
      recommendedKeystrokeCount: 3,
      mistakeCount: 0,
      undoCount: 0,
      resetCount: 0,
      highestHintLevel: 0,
      usedRecommendedSolution: true,
      normalizedActions: [{ type: "vim_command", command: "dw" }],
      speedScore: 100,
      accuracyScore: 100,
      performanceQuality: 5,
      practiceContext: "different_exercise",
      syncStatus: "pending",
    });
    await completion;
    database.close();
  }, ATTEMPT_ID);
}

async function readSyncStatus(page: Page): Promise<string> {
  return page.evaluate(async (attemptId) => {
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
      .get(attemptId);
    const attempt = await new Promise<{ syncStatus: string }>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to read attempt")),
        { once: true },
      );
    });
    database.close();
    return attempt.syncStatus;
  }, ATTEMPT_ID);
}

const RECONCILE_EXERCISE_ID = "00000000-0000-4000-8000-000000000801";
const RECONCILE_SKILL_ID = "00000000-0000-4000-8000-000000000802";

async function mockReconcileExerciseCatalog(page: Page): Promise<void> {
  const exercise = {
    id: RECONCILE_EXERCISE_ID,
    unit_id: "00000000-0000-4000-8000-000000000201",
    slug: "insert-prefix-reconcile",
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
          exercise_id: exercise.id,
          skill_id: RECONCILE_SKILL_ID,
          weight: 1,
          is_primary: true,
        },
      ];
    } else if (table === "skills") {
      body = [{ id: RECONCILE_SKILL_ID, slug: "basic-motion" }];
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
      body = [];
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

function seedGoogleAuthToken(page: Page): Promise<void> {
  return page.evaluate(() => {
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: "header.eyJleHAiOjQxMDI0NDQ4MDB9.signature",
        refresh_token: "playwright-refresh-token",
        expires_in: 3600,
        expires_at: 4102444800,
        token_type: "bearer",
        user: {
          id: "00000000-0000-4000-8000-000000000901",
          aud: "authenticated",
          role: "authenticated",
          email: "learner@example.com",
          app_metadata: { provider: "google" },
          user_metadata: { name: "Vim Learner" },
          created_at: "2026-07-16T00:00:00.000Z",
        },
      }),
    );
  });
}

async function readSkillMastery(
  page: Page,
  skillId: string,
): Promise<{ masteryScore: number; masteryLevel: number } | null> {
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
    const getRequest = database
      .transaction("skillMastery", "readonly")
      .objectStore("skillMastery")
      .get(id);
    const record = await new Promise<
      { masteryScore: number; masteryLevel: number } | undefined
    >((resolve, reject) => {
      getRequest.addEventListener("success", () => resolve(getRequest.result), {
        once: true,
      });
      getRequest.addEventListener(
        "error",
        () => reject(getRequest.error ?? new Error("Read failed")),
        { once: true },
      );
    });
    database.close();
    return record ?? null;
  }, skillId);
}

/** Every attempt's syncStatus, so a test can confirm the sync scan settled on "synced" rather than merely that time passed. */
async function readAllAttemptSyncStatuses(page: Page): Promise<string[]> {
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
    const getAllRequest = database
      .transaction("attempts", "readonly")
      .objectStore("attempts")
      .getAll();
    const records = await new Promise<{ syncStatus: string }[]>((resolve, reject) => {
      getAllRequest.addEventListener(
        "success",
        () => resolve(getAllRequest.result),
        { once: true },
      );
      getAllRequest.addEventListener(
        "error",
        () => reject(getAllRequest.error ?? new Error("Read failed")),
        { once: true },
      );
    });
    database.close();
    return records.map((record) => record.syncStatus);
  });
}

test("reconciles the local mastery prediction to the server's absolute value exactly once", async ({
  page,
}) => {
  // Route handlers run in reverse registration order and don't
  // auto-fallthrough, so the specific RPC mock must be registered AFTER
  // the broad catalog mock below - otherwise the catalog mock's `**/rest/v1/**`
  // pattern would swallow the RPC request first.
  await mockReconcileExerciseCatalog(page);
  let recordAttemptCalls = 0;
  await page.route("**/rest/v1/rpc/record_exercise_attempt", async (route) => {
    recordAttemptCalls += 1;
    // A second call means an already-synced attempt is being re-sent - fail
    // immediately rather than relying on the test asserting the call count
    // at exactly the right moment.
    if (recordAttemptCalls > 1) {
      throw new Error(
        "record_exercise_attempt must not be called for an already-synced attempt.",
      );
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        attemptId: "00000000-0000-4000-8000-000000000803",
        mastery: [
          { skillId: RECONCILE_SKILL_ID, masteryScore: 85, masteryLevel: 4 },
        ],
        dueAt: "2026-09-01T00:00:00.000Z",
      }),
    });
  });

  await page.goto("/practice/setup?mode=memory_review");
  await page.getByLabel("5 題").check();
  await page.getByLabel("指定主題").check();
  await page.getByTestId("topic-selector").getByLabel("基礎移動").check();
  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(
    page.getByText("目前符合條件的題目共有 1 題，本次將安排全部可用題目。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "使用這些題目開始練習" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);

  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.keyboard.press("i");
  await page.keyboard.type("x");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();

  // The local prediction from calculateLearningProjection() - a fresh
  // guest's first attempt, well short of the server's absolute values below.
  const localPrediction = await readSkillMastery(page, RECONCILE_SKILL_ID);
  expect(localPrediction).not.toBeNull();
  expect(localPrediction?.masteryScore).toBeLessThan(85);
  expect(localPrediction?.masteryLevel).toBeLessThan(4);

  await expect(page.getByRole("button", { name: "使用 Google 登入" })).toBeVisible();
  await seedGoogleAuthToken(page);
  // waitUntil: "networkidle" - not just the navigation, but the sync scan's
  // RPC request itself - has quieted down before any assertion below runs.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "登出" })).toBeVisible();

  await expect
    .poll(async () => (await readSkillMastery(page, RECONCILE_SKILL_ID))?.masteryScore)
    .toBe(85);
  const reconciled = await readSkillMastery(page, RECONCILE_SKILL_ID);
  expect(reconciled).toMatchObject({ masteryScore: 85, masteryLevel: 4 });
  expect(recordAttemptCalls).toBe(1);
  expect(await readAllAttemptSyncStatuses(page)).toEqual(["synced"]);

  // Reconciliation happens exactly once: reloading again must not re-sync
  // an attempt that is already marked "synced". The RPC route itself throws
  // on a second call (above), so any regression that re-sends it fails this
  // test regardless of exactly when that second call lands; waiting for
  // network idle here still gives the sync scan its full chance to run
  // before the final assertions read its result.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "登出" })).toBeVisible();
  expect(recordAttemptCalls).toBe(1);
  expect(await readAllAttemptSyncStatuses(page)).toEqual(["synced"]);
  expect(await readSkillMastery(page, RECONCILE_SKILL_ID)).toMatchObject({
    masteryScore: 85,
    masteryLevel: 4,
  });
});

test("merges a pending guest attempt after authentication", async ({ page }) => {
  await page.route("**/rest/v1/rpc/record_exercise_attempt", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        attemptId: "00000000-0000-4000-8000-000000000801",
        mastery: [],
        dueAt: null,
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "使用 Google 登入" })).toBeVisible();
  await seedPendingAttempt(page);
  await page.evaluate(() => {
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: "header.eyJleHAiOjQxMDI0NDQ4MDB9.signature",
        refresh_token: "playwright-refresh-token",
        expires_in: 3600,
        expires_at: 4102444800,
        token_type: "bearer",
        user: {
          id: "00000000-0000-4000-8000-000000000901",
          aud: "authenticated",
          role: "authenticated",
          email: "learner@example.com",
          app_metadata: { provider: "google" },
          user_metadata: { name: "Vim Learner" },
          created_at: "2026-07-16T00:00:00.000Z",
        },
      }),
    );
  });

  await page.reload();

  await expect(page.getByRole("button", { name: "登出" })).toBeVisible();
  await expect.poll(() => readSyncStatus(page)).toBe("synced");
});
