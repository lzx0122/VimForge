import { expect, test, type Page } from "@playwright/test";

interface PersistedAttemptDraftShape {
  clientAttemptId: string;
  exerciseId: string;
  startedAt: string;
  currentContent: string;
  currentCursor: { line: number; column: number };
  currentMode: string;
  actions: Array<Record<string, unknown>>;
  keystrokeCount: number;
  mistakeCount: number;
  lastMistakeFingerprint: string | null;
  undoCount: number;
  resetCount: number;
  highestHintLevel: number;
}

interface PersistedAttemptShape {
  clientAttemptId: string;
  resetCount: number;
  mistakeCount: number;
  undoCount: number;
  highestHintLevel: number;
  accuracyScore: number;
}

async function readAttemptDraft(
  page: Page,
  sessionId: string,
): Promise<PersistedAttemptDraftShape | null> {
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
    try {
      const request = database
        .transaction("sessions", "readonly")
        .objectStore("sessions")
        .get(id);
      const record = await new Promise<
        { attemptDraft: PersistedAttemptDraftShape | null } | undefined
      >((resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), {
          once: true,
        });
        request.addEventListener(
          "error",
          () => reject(request.error ?? new Error("Unable to read session")),
          { once: true },
        );
      });
      return record?.attemptDraft ?? null;
    } finally {
      database.close();
    }
  }, sessionId);
}

async function readStoredAttempt(
  page: Page,
  clientAttemptId: string,
): Promise<PersistedAttemptShape | null> {
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
    try {
      const request = database
        .transaction("attempts", "readonly")
        .objectStore("attempts")
        .get(id);
      const record = await new Promise<PersistedAttemptShape | undefined>(
        (resolve, reject) => {
          request.addEventListener("success", () => resolve(request.result), {
            once: true,
          });
          request.addEventListener(
            "error",
            () => reject(request.error ?? new Error("Unable to read attempt")),
            { once: true },
          );
        },
      );
      return record ?? null;
    } finally {
      database.close();
    }
  }, clientAttemptId);
}

// ---------------------------------------------------------------------------
// Journey 1: resume telemetry
// ---------------------------------------------------------------------------

const RESUME_SESSION_ID = "p1-resume-telemetry";
const RESUME_EXERCISE_ID = "p1-resume-exercise";
const RESUME_WRONG_CONTENT = "const restoredName = true;";
const RESUME_WRONG_CURSOR = { line: 0, column: 18 };
// Uses the exact production fingerprint format (session-repository.ts /
// attempt-mistake-service.ts): JSON.stringify([content, line, column, mode]).
const RESUME_SEEDED_FINGERPRINT = JSON.stringify([
  RESUME_WRONG_CONTENT,
  RESUME_WRONG_CURSOR.line,
  RESUME_WRONG_CURSOR.column,
  "normal",
]);

const resumeSession = {
  id: RESUME_SESSION_ID,
  learningMode: "beginner",
  selectionType: "course",
  requestedCount: null,
  actualCount: 1,
  status: "active",
  currentIndex: 0,
  exerciseIds: [RESUME_EXERCISE_ID],
  selectedSkillIds: [],
  startedAt: "2026-07-24T08:00:00.000Z",
  completedAt: null,
  updatedAt: "2026-07-24T08:00:00.000Z",
} as const;

// A complete AttemptDraft (every field types/attempt.ts requires), not an
// incomplete cast: a wrong, not-yet-satisfying snapshot already resting in
// Normal Mode, with one already-counted failed check baked into the seed.
const resumeAttemptDraft = {
  clientAttemptId: "p1-resume-attempt",
  exerciseId: RESUME_EXERCISE_ID,
  exerciseVersion: 1,
  learningMode: "beginner",
  source: "web",
  startedAt: "2026-07-24T08:00:30.000Z",
  completedAt: null,
  initialContent: "const oldName = true;",
  currentContent: RESUME_WRONG_CONTENT,
  initialCursor: { line: 0, column: 6 },
  currentCursor: RESUME_WRONG_CURSOR,
  currentMode: "normal",
  actions: [{ type: "vim_command", command: "ciw" }],
  keystrokeCount: 7,
  mistakeCount: 1,
  lastMistakeFingerprint: RESUME_SEEDED_FINGERPRINT,
  undoCount: 0,
  resetCount: 0,
  highestHintLevel: 0,
  completed: false,
} as const;

async function mockResumeExerciseCatalog(page: Page): Promise<void> {
  const exercise = {
    id: RESUME_EXERCISE_ID,
    unit_id: "p1-resume-unit",
    slug: "p1-resume-exercise",
    title: "還原練習",
    instruction: "將 restoredName 修正為 finalName，最後回到 Normal Mode。",
    language: "typescript",
    exercise_type: "guided",
    difficulty: "beginner",
    supported_modes: ["beginner"],
    target_duration_ms: 12000,
    version: 1,
    display_order: 1,
    initial_content: resumeAttemptDraft.initialContent,
    expected_content: "const finalName = true;",
    initial_cursor: resumeAttemptDraft.initialCursor,
    completion_rule: {
      contentMatch: "exact",
      cursorMatch: { type: "ignore" },
      requiredMode: "normal",
    },
  };

  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    const body: object | object[] =
      table === "exercises"
        ? requestUrl.searchParams.has("id")
          ? exercise
          : [exercise]
        : [];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function seedResumeSessionWithDraft(page: Page): Promise<void> {
  await page.evaluate(
    async ({ persistedSession, persistedDraft }) => {
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
      const transaction = database.transaction("sessions", "readwrite");
      const completion = new Promise<void>((resolve, reject) => {
        transaction.addEventListener("complete", () => resolve(), {
          once: true,
        });
        transaction.addEventListener(
          "error",
          () => reject(transaction.error ?? new Error("Transaction failed")),
          { once: true },
        );
      });
      transaction.objectStore("sessions").put({
        id: persistedSession.id,
        status: persistedSession.status,
        session: persistedSession,
        attemptDraft: persistedDraft,
      });
      await completion;
      database.close();
    },
    { persistedSession: resumeSession, persistedDraft: resumeAttemptDraft },
  );
}

test("resume telemetry: restores keystrokeCount/mistakeCount/fingerprint and keeps counting them correctly", async ({
  page,
}) => {
  await mockResumeExerciseCatalog(page);
  // Navigating first lets the real app create the IndexedDB schema, so the
  // seed below only has to write into stores that already exist.
  await page.goto(`/practice/${RESUME_SESSION_ID}`);
  await seedResumeSessionWithDraft(page);
  await page.reload();

  await page.getByRole("button", { name: "恢復未完成內容" }).click();

  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await expect(editor).toContainText(RESUME_WRONG_CONTENT);

  // One accepted physical key that changes neither content, cursor, nor
  // mode: Escape while already in Normal Mode with nothing pending.
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await readAttemptDraft(page, RESUME_SESSION_ID))?.keystrokeCount)
    .toBe(8);

  const afterKeypress = await readAttemptDraft(page, RESUME_SESSION_ID);
  expect(afterKeypress).toMatchObject({
    clientAttemptId: resumeAttemptDraft.clientAttemptId,
    startedAt: resumeAttemptDraft.startedAt,
    lastMistakeFingerprint: RESUME_SEEDED_FINGERPRINT,
  });

  // Same content/cursor/mode as the seeded fingerprint: must not double-count.
  await page.getByRole("button", { name: "檢查目前結果" }).click();
  await expect
    .poll(async () => (await readAttemptDraft(page, RESUME_SESSION_ID))?.mistakeCount)
    .toBe(1);
  expect(
    (await readAttemptDraft(page, RESUME_SESSION_ID))?.lastMistakeFingerprint,
  ).toBe(RESUME_SEEDED_FINGERPRINT);

  // Change the snapshot through the real editor (not IndexedDB), then check
  // again: a genuinely different fingerprint must increment. Inserting a
  // character (rather than guessing what a delete lands on) always changes
  // content regardless of the exact restored cursor offset, and returns to
  // Normal Mode afterward. Re-focus the editor via focus() (not click(),
  // which would click at the element's center and move the cursor away from
  // its current position) - the previous button click moved DOM focus onto
  // the button, not the editor.
  await editor.focus();
  await page.keyboard.press("i");
  await page.keyboard.type("Z");
  await page.keyboard.press("Escape");
  await expect(editor).not.toContainText(RESUME_WRONG_CONTENT);
  await page.getByRole("button", { name: "檢查目前結果" }).click();
  await expect
    .poll(async () => (await readAttemptDraft(page, RESUME_SESSION_ID))?.mistakeCount)
    .toBe(2);

  const finalDraft = await readAttemptDraft(page, RESUME_SESSION_ID);
  expect(finalDraft).toMatchObject({
    clientAttemptId: resumeAttemptDraft.clientAttemptId,
    startedAt: resumeAttemptDraft.startedAt,
  });
  expect(finalDraft?.lastMistakeFingerprint).not.toBe(RESUME_SEEDED_FINGERPRINT);
});

// ---------------------------------------------------------------------------
// Journey 3: Restart versus Retry
// ---------------------------------------------------------------------------

const RESTART_SKILL_ID = "p1-restart-skill";
const RESTART_EXERCISE_ID = "p1-restart-exercise";

async function mockRestartExerciseCatalog(page: Page): Promise<void> {
  const exercise = {
    id: RESTART_EXERCISE_ID,
    unit_id: "p1-restart-unit",
    slug: "p1-restart-exercise",
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

  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    let body: object | object[];

    if (table === "exercises") {
      body = requestUrl.searchParams.has("id") ? exercise : [exercise];
    } else if (table === "exercise_skills") {
      body = [
        {
          exercise_id: exercise.id,
          skill_id: RESTART_SKILL_ID,
          weight: 1,
          is_primary: true,
        },
      ];
    } else if (table === "skills") {
      body = [{ id: RESTART_SKILL_ID, slug: "basic-motion" }];
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

async function startRestartExerciseSession(page: Page): Promise<string> {
  await mockRestartExerciseCatalog(page);
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
  return page.url().split("/").at(-1) ?? "";
}

test("restart preserves Attempt identity and telemetry while retry creates a new Attempt", async ({
  page,
}) => {
  const sessionId = await startRestartExerciseSession(page);
  const editor = page.locator(".cm-content");
  const mode = page.locator(".practice-editor-status-bar .vim-mode-badge");
  await expect(editor).toBeFocused();

  // Real physical keypresses before Restart, confirmed persisted via
  // IndexedDB polling (not a fixed wait). Leaving Insert Mode active also
  // makes the post-restart "Normal Mode" assertion below discriminating.
  await page.keyboard.press("i");
  await page.keyboard.type("zzz");
  await expect(editor).toContainText("const zzzname = true;");
  await expect
    .poll(async () => (await readAttemptDraft(page, sessionId))?.keystrokeCount)
    .toBe(4);

  const originalDraft = await readAttemptDraft(page, sessionId);
  if (originalDraft === null) {
    throw new Error("Expected a persisted Draft before Restart.");
  }
  expect(originalDraft.resetCount).toBe(0);

  // Click the accessible restart control (PracticeEditorStatusBar), not a
  // DOM-position selector.
  await page.getByRole("button", { name: "重新開始本題" }).click();

  await expect
    .poll(async () => (await readAttemptDraft(page, sessionId))?.resetCount)
    .toBe(1);

  const restartedDraft = await readAttemptDraft(page, sessionId);
  if (restartedDraft === null) {
    throw new Error("Expected a persisted Draft after Restart.");
  }

  expect(restartedDraft.clientAttemptId).toBe(originalDraft.clientAttemptId);
  expect(restartedDraft.startedAt).toBe(originalDraft.startedAt);
  expect(restartedDraft.resetCount).toBe(originalDraft.resetCount + 1);
  expect(restartedDraft.keystrokeCount).toBe(originalDraft.keystrokeCount);
  expect(restartedDraft.mistakeCount).toBe(originalDraft.mistakeCount);
  expect(restartedDraft.highestHintLevel).toBe(originalDraft.highestHintLevel);
  expect(restartedDraft.actions).toEqual([
    ...originalDraft.actions,
    { type: "reset" },
  ]);
  expect(restartedDraft.currentContent).toBe("const name = true;");
  expect(restartedDraft.currentCursor).toEqual({ line: 0, column: 6 });
  expect(restartedDraft.currentMode).toBe("normal");

  await expect(editor).toHaveText("const name = true;");
  await expect(mode).toHaveText("Normal");

  // Complete cleanly after Restart (zero mistakes/undo/hints): the only
  // telemetry difference from a no-reset completion is resetCount, so the
  // accuracy penalty is exactly deterministic.
  await page.keyboard.press("i");
  await page.keyboard.type("x");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: "完成！" })).toBeVisible();

  const completedAttempt = await readStoredAttempt(
    page,
    originalDraft.clientAttemptId,
  );
  expect(completedAttempt).not.toBeNull();
  expect(completedAttempt?.clientAttemptId).toBe(originalDraft.clientAttemptId);
  expect(completedAttempt?.resetCount).toBe(1);
  expect(completedAttempt?.mistakeCount).toBe(0);
  expect(completedAttempt?.undoCount).toBe(0);
  expect(completedAttempt?.highestHintLevel).toBe(0);
  // ACCURACY_PENALTIES.reset === 12 (scoring-config.ts): a clean completion
  // (0 mistakes/undo/hints) with exactly one Restart scores 100 - 12 = 88,
  // deterministically under the current production rules.
  expect(completedAttempt?.accuracyScore).toBe(88);

  // Retry after feedback creates a brand-new Attempt.
  await page.getByRole("button", { name: "再試一次" }).click();

  await expect
    .poll(async () => (await readAttemptDraft(page, sessionId))?.clientAttemptId)
    .not.toBe(originalDraft.clientAttemptId);

  const retriedDraft = await readAttemptDraft(page, sessionId);
  if (retriedDraft === null) {
    throw new Error("Expected a persisted Draft after Retry.");
  }

  expect(retriedDraft.clientAttemptId).not.toBe(originalDraft.clientAttemptId);
  expect(retriedDraft.startedAt).not.toBe(originalDraft.startedAt);
  expect(retriedDraft.keystrokeCount).toBe(0);
  expect(retriedDraft.mistakeCount).toBe(0);
  expect(retriedDraft.resetCount).toBe(0);
  expect(retriedDraft.lastMistakeFingerprint).toBeNull();
  expect(retriedDraft.highestHintLevel).toBe(0);
  expect(retriedDraft.actions).toEqual([]);
  expect(retriedDraft.currentContent).toBe("const name = true;");
  expect(retriedDraft.currentCursor).toEqual({ line: 0, column: 6 });
  expect(retriedDraft.currentMode).toBe("normal");

  await expect(editor).toHaveText("const name = true;");
  await expect(mode).toHaveText("Normal");
});
