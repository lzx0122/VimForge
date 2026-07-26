import { expect, test, type Page, type Route } from "@playwright/test";

const USER_ID = "00000000-0000-4000-8000-000000001001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000001002";
const UNIT_ID = "00000000-0000-4000-8000-000000001100";
const SKILL_ID = "00000000-0000-4000-8000-000000001200";
const EXERCISE_ID_1 = "00000000-0000-4000-8000-000000001301";
const EXERCISE_ID_2 = "00000000-0000-4000-8000-000000001302";
const ATTEMPT_ID_1 = "00000000-0000-4000-8000-000000001401";
const ATTEMPT_ID_2 = "00000000-0000-4000-8000-000000001402";

const CATALOG_EXERCISE = {
  id: EXERCISE_ID_1,
  unit_id: UNIT_ID,
  slug: "insert-prefix-p1",
  title: "插入字首",
  instruction: "在 name 前插入 x，最後回到 Normal Mode。",
  language: "typescript",
  exercise_type: "guided",
  difficulty: "beginner",
  supported_modes: ["beginner", "memory_review", "efficiency"],
  target_duration_ms: 12000,
  version: 1,
  display_order: 1,
  is_published: true,
  initial_content: "const name = true;",
  expected_content: "const xname = true;",
  initial_cursor: { line: 0, column: 6 },
  completion_rule: {
    contentMatch: "exact",
    cursorMatch: { type: "ignore" },
    requiredMode: "normal",
  },
};

const CATALOG_EXERCISE_2 = {
  ...CATALOG_EXERCISE,
  id: EXERCISE_ID_2,
  slug: "insert-prefix-p1-second",
  display_order: 2,
};

function seedAuthToken(page: Page, userId: string): Promise<void> {
  return page.evaluate((id) => {
    localStorage.setItem(
      "sb-127-auth-token",
      JSON.stringify({
        access_token: "header.eyJleHAiOjQxMDI0NDQ4MDB9.signature",
        refresh_token: "playwright-refresh-token",
        expires_in: 3600,
        expires_at: 4102444800,
        token_type: "bearer",
        user: {
          id,
          aud: "authenticated",
          role: "authenticated",
          email: "learner@example.com",
          app_metadata: { provider: "google" },
          user_metadata: { name: "Vim Learner" },
          created_at: "2026-07-16T00:00:00.000Z",
        },
      }),
    );
  }, userId);
}

/**
 * Mocks the read-only course catalog (units/skills/exercises) that
 * ProgressPage, ReviewPage, and real exercise completion all depend on -
 * one unit, one skill, two published exercises. Route handlers run in
 * reverse registration order with no auto-fallthrough, so any
 * table-specific mock (settings, learning-state, RPC) must be registered
 * AFTER this one.
 */
async function mockCourseCatalog(page: Page): Promise<void> {
  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    let body: object | object[];

    if (table === "learning_units") {
      const unit = {
        id: UNIT_ID,
        slug: "p1-cloud-hydration-unit",
        title: "雲端同步練習",
        description: "驗證雲端同步的練習單元。",
        difficulty: "beginner",
        estimated_minutes: 5,
        display_order: 1,
      };
      // listPublishedUnits() has no slug filter and expects an array;
      // getPublishedUnitBySlug() filters by slug and expects a single object.
      body = requestUrl.searchParams.has("slug") ? unit : [unit];
    } else if (table === "unit_skills") {
      body = [
        {
          unit_id: UNIT_ID,
          skill_id: SKILL_ID,
          is_primary: true,
          display_order: 1,
        },
      ];
    } else if (table === "skills") {
      body = [
        { id: SKILL_ID, slug: "basic-motion", name: "基礎移動", category: "movement" },
      ];
    } else if (table === "exercises") {
      const exerciseId = requestUrl.searchParams.get("id")?.replace("eq.", "");
      if (requestUrl.searchParams.get("select") === "unit_id") {
        // Exercise-count-only query (listPublishedUnits).
        body = [{ unit_id: UNIT_ID }, { unit_id: UNIT_ID }];
      } else if (exerciseId !== undefined) {
        // Single full exercise detail fetch (practice page content load).
        body = exerciseId === EXERCISE_ID_2 ? CATALOG_EXERCISE_2 : CATALOG_EXERCISE;
      } else {
        // Exercise summary list (unit detail / candidate listing).
        body = [
          {
            id: CATALOG_EXERCISE.id,
            unit_id: CATALOG_EXERCISE.unit_id,
            slug: CATALOG_EXERCISE.slug,
            title: CATALOG_EXERCISE.title,
            instruction: CATALOG_EXERCISE.instruction,
            language: CATALOG_EXERCISE.language,
            exercise_type: CATALOG_EXERCISE.exercise_type,
            difficulty: CATALOG_EXERCISE.difficulty,
            supported_modes: CATALOG_EXERCISE.supported_modes,
            target_duration_ms: CATALOG_EXERCISE.target_duration_ms,
            version: CATALOG_EXERCISE.version,
            display_order: CATALOG_EXERCISE.display_order,
          },
          {
            id: CATALOG_EXERCISE_2.id,
            unit_id: CATALOG_EXERCISE_2.unit_id,
            slug: CATALOG_EXERCISE_2.slug,
            title: CATALOG_EXERCISE_2.title,
            instruction: CATALOG_EXERCISE_2.instruction,
            language: CATALOG_EXERCISE_2.language,
            exercise_type: CATALOG_EXERCISE_2.exercise_type,
            difficulty: CATALOG_EXERCISE_2.difficulty,
            supported_modes: CATALOG_EXERCISE_2.supported_modes,
            target_duration_ms: CATALOG_EXERCISE_2.target_duration_ms,
            version: CATALOG_EXERCISE_2.version,
            display_order: CATALOG_EXERCISE_2.display_order,
          },
        ];
      }
    } else if (table === "exercise_skills") {
      body = [
        { exercise_id: EXERCISE_ID_1, skill_id: SKILL_ID, weight: 1, is_primary: true },
        { exercise_id: EXERCISE_ID_2, skill_id: SKILL_ID, weight: 1, is_primary: true },
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

interface CloudFixture {
  settings?: {
    editorFontSize: number;
    showLineNumbers: boolean;
    showKeypresses: boolean;
    preferredQuestionCount: number;
    lastLearningMode: string | null;
    updatedAt: string;
  };
  attempts?: Array<Record<string, unknown>>;
  mastery?: Array<Record<string, unknown>>;
  reviews?: Array<Record<string, unknown>>;
}

function defaultAttempt(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    client_attempt_id: ATTEMPT_ID_1,
    session_id: null,
    exercise_id: EXERCISE_ID_1,
    exercise_version: 1,
    learning_mode: "memory_review",
    source: "web",
    completed: true,
    started_at: "2026-07-16T08:00:00.000Z",
    completed_at: "2026-07-16T08:00:08.000Z",
    duration_ms: 8000,
    keystroke_count: 3,
    recommended_keystroke_count: 3,
    mistake_count: 0,
    undo_count: 0,
    reset_count: 0,
    hint_level_used: 0,
    used_recommended_solution: true,
    normalized_actions: [{ type: "vim_command", command: "dw" }],
    speed_score: 100,
    accuracy_score: 100,
    performance_quality: 5,
    practice_context: "different_exercise",
    created_at: "2026-07-16T08:00:09.000Z",
    ...overrides,
  };
}

function defaultMastery(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    skill_id: SKILL_ID,
    mastery_score: 82,
    mastery_level: 4,
    successful_attempts: 6,
    unique_exercise_ids: [EXERCISE_ID_1, EXERCISE_ID_2],
    consecutive_successes: 3,
    first_unhinted_success_at: "2026-07-01T08:00:00.000Z",
    latest_unhinted_success_at: "2026-07-16T08:00:00.000Z",
    last_practiced_at: "2026-07-16T08:00:00.000Z",
    updated_at: "2026-07-16T08:00:00.000Z",
    ...overrides,
  };
}

function defaultReview(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    exercise_id: EXERCISE_ID_1,
    mastery_level: 4,
    current_interval_days: 1,
    due_at: "2026-07-16T00:00:00.000Z",
    last_performance_quality: 5,
    last_attempt_at: "2026-07-16T08:00:00.000Z",
    updated_at: "2026-07-16T08:00:00.000Z",
    ...overrides,
  };
}

function defaultSettings(): CloudFixture["settings"] {
  return {
    editorFontSize: 20,
    showLineNumbers: false,
    showKeypresses: true,
    preferredQuestionCount: 20,
    lastLearningMode: null,
    updatedAt: "2026-07-16T08:00:00.000Z",
  };
}

interface MockCloudLearningStateOptions {
  recordRequest?: (name: string) => void;
  /** Each gate, if given, is awaited before that table's response is sent - lets a test hold a specific response open and release it later. */
  gates?: {
    settings?: Promise<void>;
    attempts?: Promise<void>;
    mastery?: Promise<void>;
    reviews?: Promise<void>;
    rpc?: Promise<void>;
  };
}

/**
 * Mocks the authenticated cloud-hydration read surface: user_settings,
 * exercise_attempts, user_skill_mastery, user_review_items, and the
 * record_exercise_attempt RPC. Must be registered AFTER mockCourseCatalog
 * so its broad `**\/rest/v1/**` pattern doesn't swallow these requests
 * first (route handlers run in reverse registration order).
 */
async function mockCloudLearningState(
  page: Page,
  fixture: CloudFixture,
  options: MockCloudLearningStateOptions = {},
): Promise<void> {
  const settings = fixture.settings ?? null;
  const attempts = fixture.attempts ?? [];
  const mastery = fixture.mastery ?? [];
  const reviews = fixture.reviews ?? [];
  const recordRequest = options.recordRequest;
  const gates = options.gates ?? {};

  await page.route("**/rest/v1/user_settings**", async (route) => {
    recordRequest?.("select:user_settings");
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await gates.settings;
    const body = settings === null
      ? null
      : {
          editor_font_size: settings.editorFontSize,
          show_line_numbers: settings.showLineNumbers,
          show_keypresses: settings.showKeypresses,
          preferred_question_count: settings.preferredQuestionCount,
          last_learning_mode: settings.lastLearningMode,
          updated_at: settings.updatedAt,
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.route("**/rest/v1/exercise_attempts**", async (route: Route) => {
    recordRequest?.("select:exercise_attempts");
    await gates.attempts;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attempts),
    });
  });

  await page.route("**/rest/v1/user_skill_mastery**", async (route: Route) => {
    recordRequest?.("select:user_skill_mastery");
    await gates.mastery;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mastery),
    });
  });

  await page.route("**/rest/v1/user_review_items**", async (route: Route) => {
    recordRequest?.("select:user_review_items");
    await gates.reviews;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(reviews),
    });
  });

  await page.route(
    "**/rest/v1/rpc/record_exercise_attempt",
    async (route: Route) => {
      recordRequest?.("rpc:record_exercise_attempt:start");
      await gates.rpc;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          attemptId: ATTEMPT_ID_1,
          mastery: [],
          dueAt: null,
        }),
      });
      recordRequest?.("rpc:record_exercise_attempt:complete");
    },
  );
}

async function openIndexedDb(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
      request.addEventListener("success", () => {
        request.result.close();
        resolve();
      }, { once: true });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to open IndexedDB")),
        { once: true },
      );
    });
  });
}

async function clearIndexedDb(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("vim-forge");
      request.addEventListener("success", () => resolve(), { once: true });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to delete IndexedDB")),
        { once: true },
      );
      request.addEventListener("blocked", () => resolve(), { once: true });
    });
  });
}

async function readStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async (name) => {
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
      .transaction(name, "readonly")
      .objectStore(name)
      .getAll();
    const records = await new Promise<unknown[]>((resolve, reject) => {
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
    return records;
  }, storeName) as Promise<T[]>;
}

async function seedLocalDataOwner(page: Page, userId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to open IndexedDB")),
        { once: true },
      );
    });
    const transaction = database.transaction("metadata", "readwrite");
    const completion = new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener(
        "error",
        () => reject(transaction.error ?? new Error("Unable to seed owner")),
        { once: true },
      );
    });
    transaction.objectStore("metadata").put({ key: "local-data-owner", userId: id });
    await completion;
    database.close();
  }, userId);
}

async function seedIndexedDbRecord(
  page: Page,
  storeName: string,
  record: unknown,
): Promise<void> {
  await page.evaluate(
    async ({ name, value }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("vim-forge");
        request.addEventListener("success", () => resolve(request.result), { once: true });
        request.addEventListener(
          "error",
          () => reject(request.error ?? new Error("Unable to open IndexedDB")),
          { once: true },
        );
      });
      const transaction = database.transaction(name, "readwrite");
      const completion = new Promise<void>((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), { once: true });
        transaction.addEventListener(
          "error",
          () => reject(transaction.error ?? new Error("Unable to seed record")),
          { once: true },
        );
      });
      transaction.objectStore(name).put(value);
      await completion;
      database.close();
    },
    { name: storeName, value: record },
  );
}

async function readCloudHydrationCompletedAt(page: Page): Promise<string | null> {
  const records = await readStore<{ key: string; completedAt: string | null }>(
    page,
    "metadata",
  );
  return records.find((record) => record.key === "cloud-hydration")?.completedAt ?? null;
}

function seedPendingAttempt(page: Page, clientAttemptId: string): Promise<void> {
  return seedIndexedDbRecord(page, "attempts", {
    clientAttemptId,
    sessionId: null,
    exerciseId: EXERCISE_ID_1,
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
}

test.describe("P1 cloud hydration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearIndexedDb(page);
  });

  test("Journey A - new device hydration populates every page and marks settings synced", async ({
    page,
  }) => {
    await mockCourseCatalog(page);
    await mockCloudLearningState(page, {
      settings: defaultSettings(),
      attempts: [
        defaultAttempt({ client_attempt_id: ATTEMPT_ID_1, exercise_id: EXERCISE_ID_1 }),
        defaultAttempt({
          client_attempt_id: ATTEMPT_ID_2,
          exercise_id: EXERCISE_ID_2,
          created_at: "2026-07-16T08:05:00.000Z",
          completed_at: "2026-07-16T08:00:07.000Z",
        }),
      ],
      mastery: [defaultMastery()],
      reviews: [defaultReview()],
    });

    await page.goto("/");
    await openIndexedDb(page);
    // Seeds a device-local sound preference and stale local values for
    // every other cloud-backed field, so the final assertions can prove
    // both directions at once: cloud values overwrite the stale local
    // settings, while the device-local soundEnabled preference (which the
    // cloud fixture and row shape have no field for) is left untouched.
    await seedIndexedDbRecord(page, "settings", {
      key: "preferences",
      value: {
        editorFontSize: 16,
        showLineNumbers: true,
        showKeypresses: false,
        soundEnabled: true,
        preferredQuestionCount: 5,
        lastLearningMode: "beginner",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    });
    await seedAuthToken(page, USER_ID);
    // A full reload, exactly once - the genuine cold-start moment where the
    // app boots and hydration begins. Every navigation after this uses
    // client-side router links, matching a real signed-in session: a full
    // page.goto() reboots the whole SPA and would reset Pinia's in-memory
    // hydrated state, forcing hydration to restart from scratch each time.
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByText("正在恢復帳號學習進度…")).toBeHidden();

    await page.getByRole("link", { name: "進度", exact: true }).click();
    await expect(page.getByText("基礎移動")).toBeVisible();
    await expect(page.locator("[data-attempt-id]")).toHaveCount(2);

    await page.getByRole("link", { name: "複習", exact: true }).click();
    await expect(page.getByTestId("due-count")).toHaveText("1");

    await page.getByRole("link", { name: "首頁", exact: true }).click();
    await page.getByRole("button", { name: "挑戰效率" }).click();
    await expect(page).toHaveURL(/\/practice\/setup\?mode=efficiency/u);
    await expect(
      page.locator('[data-testid="question-count-selector"] input[value="20"]'),
    ).toBeChecked();

    await page.getByRole("link", { name: "設定", exact: true }).click();
    await expect(page.getByTestId("settings-status")).toContainText(
      "設定已同步至登入帳號。",
    );

    const settingsRecords = await readStore<{
      key: string;
      value: Record<string, unknown>;
    }>(page, "settings");
    expect(
      settingsRecords.find((record) => record.key === "preferences")?.value,
    ).toEqual({
      editorFontSize: 20,
      showLineNumbers: false,
      showKeypresses: true,
      // Preserved from the local seed above - the cloud row has no
      // soundEnabled field, so this proves it is never sourced from cloud.
      soundEnabled: true,
      preferredQuestionCount: 20,
      lastLearningMode: null,
      updatedAt: "2026-07-16T08:00:00.000Z",
    });

    const attempts = await readStore<Record<string, unknown>>(page, "attempts");
    expect(
      [...attempts].sort((a, b) =>
        String(a.clientAttemptId).localeCompare(String(b.clientAttemptId)),
      ),
    ).toEqual([
      {
        clientAttemptId: ATTEMPT_ID_1,
        sessionId: null,
        exerciseId: EXERCISE_ID_1,
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
        syncStatus: "synced",
      },
      {
        clientAttemptId: ATTEMPT_ID_2,
        sessionId: null,
        exerciseId: EXERCISE_ID_2,
        exerciseVersion: 1,
        learningMode: "memory_review",
        source: "web",
        completed: true,
        startedAt: "2026-07-16T08:00:00.000Z",
        completedAt: "2026-07-16T08:00:07.000Z",
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
        syncStatus: "synced",
      },
    ]);

    const mastery = await readStore<Record<string, unknown>>(page, "skillMastery");
    expect(mastery).toEqual([
      {
        skillId: SKILL_ID,
        masteryScore: 82,
        masteryLevel: 4,
        successfulAttempts: 6,
        uniqueExerciseIds: [EXERCISE_ID_1, EXERCISE_ID_2],
        consecutiveSuccesses: 3,
        firstUnhintedSuccessAt: "2026-07-01T08:00:00.000Z",
        latestUnhintedSuccessAt: "2026-07-16T08:00:00.000Z",
        lastAttemptAt: "2026-07-16T08:00:00.000Z",
        updatedAt: "2026-07-16T08:00:00.000Z",
        revision: 1,
      },
    ]);

    const reviews = await readStore<Record<string, unknown>>(page, "exerciseReviews");
    expect(reviews).toEqual([
      {
        exerciseId: EXERCISE_ID_1,
        masteryLevel: 4,
        currentIntervalDays: 1,
        dueAt: "2026-07-16T00:00:00.000Z",
        lastPerformanceQuality: 5,
        lastAttemptAt: "2026-07-16T08:00:00.000Z",
        updatedAt: "2026-07-16T08:00:00.000Z",
        revision: 1,
      },
    ]);

    const metadataRecords = await readStore<Record<string, unknown>>(page, "metadata");
    expect(
      metadataRecords.find((record) => record.key === "local-data-owner")?.userId,
    ).toBe(USER_ID);
    const cloudHydration = metadataRecords.find(
      (record) => record.key === "cloud-hydration",
    );
    expect(cloudHydration?.userId).toBe(USER_ID);
    expect(cloudHydration?.completedAt).not.toBeNull();
    expect(cloudHydration?.schemaVersion).toBe(1);
    expect(cloudHydration?.attemptsCursor).toEqual({
      createdAt: "2026-07-16T08:05:00.000Z",
      clientAttemptId: ATTEMPT_ID_2,
    });
    expect(cloudHydration?.masteryCursor).toEqual({
      updatedAt: "2026-07-16T08:00:00.000Z",
      skillId: SKILL_ID,
    });
    expect(cloudHydration?.reviewsCursor).toEqual({
      updatedAt: "2026-07-16T08:00:00.000Z",
      exerciseId: EXERCISE_ID_1,
    });
  });

  test("Journey B - uploads pending attempts before downloading cloud state", async ({
    page,
  }) => {
    await mockCourseCatalog(page);
    const calls: string[] = [];
    let releaseRpc!: () => void;
    const rpcGate = new Promise<void>((resolve) => {
      releaseRpc = resolve;
    });
    await mockCloudLearningState(
      page,
      { settings: defaultSettings(), attempts: [], mastery: [], reviews: [] },
      { recordRequest: (name) => calls.push(name), gates: { rpc: rpcGate } },
    );

    await page.goto("/");
    await openIndexedDb(page);
    await seedPendingAttempt(page, ATTEMPT_ID_1);
    await seedAuthToken(page, USER_ID);
    // Do not await networkidle - the RPC response is deliberately held open
    // below to prove the download SELECTs wait for the RPC to *complete*,
    // not merely for it to have been *sent*.
    await page.reload();

    await expect
      .poll(() => calls.includes("rpc:record_exercise_attempt:start"))
      .toBe(true);
    expect(calls.some((call) => call.startsWith("select:"))).toBe(false);

    releaseRpc();

    await expect(page.getByText("正在恢復帳號學習進度…")).toBeHidden();

    const rpcCompleteIndex = calls.indexOf("rpc:record_exercise_attempt:complete");
    expect(rpcCompleteIndex).toBeGreaterThanOrEqual(0);
    const selectIndexesAfterRpc = calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call.startsWith("select:"))
      .every(({ index }) => index > rpcCompleteIndex);
    expect(selectIndexesAfterRpc).toBe(true);
  });

  test("Journey D - account conflict stops upload and download, and preserves existing local progress", async ({
    page,
  }) => {
    await mockCourseCatalog(page);
    const calls: string[] = [];
    await mockCloudLearningState(
      page,
      {
        settings: defaultSettings(),
        attempts: [],
        mastery: [defaultMastery()],
        reviews: [],
      },
      { recordRequest: (name) => calls.push(name) },
    );

    await page.goto("/");
    await openIndexedDb(page);
    await seedLocalDataOwner(page, OTHER_USER_ID);
    await seedIndexedDbRecord(page, "skillMastery", {
      skillId: SKILL_ID,
      masteryScore: 55,
      masteryLevel: 3,
      successfulAttempts: 2,
      uniqueExerciseIds: [EXERCISE_ID_1],
      consecutiveSuccesses: 1,
      firstUnhintedSuccessAt: "2026-07-10T08:00:00.000Z",
      latestUnhintedSuccessAt: "2026-07-10T08:00:00.000Z",
      lastAttemptAt: "2026-07-10T08:00:00.000Z",
      updatedAt: "2026-07-10T08:00:00.000Z",
      revision: 1,
    });
    await seedAuthToken(page, USER_ID);
    await page.reload({ waitUntil: "networkidle" });

    await expect(
      page.getByText("此瀏覽器已有其他帳號的本機學習資料，已停止同步。"),
    ).toBeVisible();
    expect(calls).toEqual([]);

    await page.getByRole("link", { name: "進度", exact: true }).click();
    await expect(page.getByText("基礎移動")).toBeVisible();
    const mastery = await readStore<{ skillId: string; masteryScore: number }>(
      page,
      "skillMastery",
    );
    expect(mastery).toEqual([
      expect.objectContaining({ skillId: SKILL_ID, masteryScore: 55 }),
    ]);
  });

  test("Journey C - an already-open Progress page refreshes without navigation once hydration completes", async ({
    page,
  }) => {
    await mockCourseCatalog(page);
    let releaseGates!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGates = resolve;
    });
    await mockCloudLearningState(
      page,
      {
        settings: defaultSettings(),
        attempts: [],
        mastery: [defaultMastery()],
        reviews: [],
      },
      { gates: { settings: gate, attempts: gate, mastery: gate, reviews: gate } },
    );

    await page.goto("/");
    await openIndexedDb(page);
    await seedAuthToken(page, USER_ID);
    // Do not await networkidle here - the whole point is to observe the
    // page while hydration's cloud responses are still held open.
    await page.reload();

    await page.getByRole("link", { name: "進度", exact: true }).click();
    await expect(page.getByText("尚無學習紀錄")).toBeVisible();

    releaseGates();
    await expect(page.getByText("基礎移動")).toBeVisible();
  });

  test("Journey E - a stale mastery response cannot overwrite a newer local completion", async ({
    page,
  }) => {
    await mockCourseCatalog(page);
    let releaseMasteryGate!: () => void;
    const masteryGate = new Promise<void>((resolve) => {
      releaseMasteryGate = resolve;
    });
    let recordAttemptCalls = 0;
    await mockCloudLearningState(
      page,
      {
        settings: defaultSettings(),
        attempts: [],
        mastery: [
          defaultMastery({ mastery_score: 40, mastery_level: 2 }),
        ],
        reviews: [],
      },
      { gates: { mastery: masteryGate } },
    );
    await page.route(
      "**/rest/v1/rpc/record_exercise_attempt",
      async (route) => {
        recordAttemptCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            attemptId: ATTEMPT_ID_1,
            mastery: [{ skillId: SKILL_ID, masteryScore: 65, masteryLevel: 3 }],
            dueAt: null,
          }),
        });
      },
    );

    await page.goto("/");
    await openIndexedDb(page);
    await seedAuthToken(page, USER_ID);
    // Do not await networkidle - hydration is deliberately stuck on the
    // mastery response until releaseMasteryGate() fires below.
    await page.reload();

    await page.getByRole("link", { name: "首頁", exact: true }).click();
    await page.getByRole("button", { name: "開始複習" }).click();
    await expect(page).toHaveURL(/\/practice\/setup/u);
    await page.getByLabel("5 題").check();
    await page.getByLabel("指定主題").check();
    await page.getByTestId("topic-selector").getByLabel("基礎移動").check();
    await page.getByRole("button", { name: "開始練習" }).click();
    await page.getByRole("button", { name: "使用這些題目開始練習" }).click();
    await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);

    const editor = page.locator(".cm-content");
    await expect(editor).toBeFocused();
    await page.keyboard.press("i");
    await page.keyboard.type("x");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();

    await expect
      .poll(async () => (await readStore<{ masteryScore: number }>(page, "skillMastery"))[0]?.masteryScore)
      .toBe(65);

    releaseMasteryGate();
    await expect
      .poll(() => readCloudHydrationCompletedAt(page))
      .not.toBeNull();
    await expect(page.getByText("正在恢復帳號學習進度…")).toBeHidden();

    const finalMastery = await readStore<{ masteryScore: number; revision: number }>(
      page,
      "skillMastery",
    );
    expect(finalMastery).toHaveLength(1);
    expect(finalMastery[0]?.masteryScore).toBe(65);
    expect(recordAttemptCalls).toBe(1);
  });
});
