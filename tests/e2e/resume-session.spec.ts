import { expect, test, type Page } from "@playwright/test";

const SESSION_ID = "resume-session";

// Intentionally omits actualCount to model a version-1 IndexedDB record
// persisted before that field existed. SessionRepository must normalize it
// back to exerciseIds.length when reading and re-persisting this session.
const session = {
  id: SESSION_ID,
  learningMode: "memory_review",
  selectionType: "daily_review",
  requestedCount: 5,
  status: "active",
  currentIndex: 1,
  exerciseIds: ["exercise-1", "exercise-2"],
  selectedSkillIds: [],
  startedAt: "2026-07-16T08:00:00.000Z",
  completedAt: null,
  updatedAt: "2026-07-16T08:01:00.000Z",
} as const;

const LEGACY_SESSION_ACTUAL_COUNT = session.exerciseIds.length;

type PersistedSession = Omit<typeof session, "status"> & {
  status: "active" | "completed" | "abandoned";
  actualCount?: number;
};

const attemptDraft = {
  clientAttemptId: "attempt-resume",
  exerciseId: "exercise-2",
  exerciseVersion: 1,
  learningMode: "memory_review",
  source: "web",
  startedAt: "2026-07-16T08:01:00.000Z",
  completedAt: null,
  initialContent: "const oldName = true;",
  currentContent: "const restoredName = true;",
  initialCursor: { line: 0, column: 6 },
  currentCursor: { line: 0, column: 18 },
  currentMode: "normal",
  actions: [{ type: "vim_command", command: "ciw" }],
  mistakeCount: 0,
  undoCount: 0,
  resetCount: 0,
  highestHintLevel: 0,
  completed: false,
} as const;

async function seedInterruptedSession(page: Page) {
  await page.evaluate(
    async ({ persistedSession, persistedDraft }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("vim-forge", 1);
        request.addEventListener(
          "upgradeneeded",
          () => {
            const database = request.result;
            const attempts = database.createObjectStore("attempts", {
              keyPath: "clientAttemptId",
            });
            attempts.createIndex("syncStatus", "syncStatus");
            const sessions = database.createObjectStore("sessions", {
              keyPath: "id",
            });
            sessions.createIndex("status", "status");
            database.createObjectStore("settings", { keyPath: "key" });
            database.createObjectStore("metadata", { keyPath: "key" });
          },
          { once: true },
        );
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
          () =>
            reject(transaction.error ?? new Error("Transaction failed")),
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
    { persistedSession: session, persistedDraft: attemptDraft },
  );
}

async function readPersistedState(page: Page) {
  return page.evaluate(async (sessionId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge", 1);
      request.addEventListener("success", () => resolve(request.result), {
        once: true,
      });
      request.addEventListener(
        "error",
        () => reject(request.error ?? new Error("Unable to open IndexedDB")),
        { once: true },
      );
    });
    const transaction = database.transaction(
      ["sessions", "attempts"],
      "readonly",
    );
    const sessionRequest = transaction.objectStore("sessions").get(sessionId);
    const attemptsRequest = transaction.objectStore("attempts").count();
    const storedSessionPromise = new Promise<{
      session: PersistedSession;
      attemptDraft: typeof attemptDraft | null;
    }>((resolve, reject) => {
      sessionRequest.addEventListener(
        "success",
        () => resolve(sessionRequest.result),
        { once: true },
      );
      sessionRequest.addEventListener(
        "error",
        () => reject(sessionRequest.error ?? new Error("Read failed")),
        { once: true },
      );
    });
    const attemptCountPromise = new Promise<number>((resolve, reject) => {
      attemptsRequest.addEventListener(
        "success",
        () => resolve(attemptsRequest.result),
        { once: true },
      );
      attemptsRequest.addEventListener(
        "error",
        () => reject(attemptsRequest.error ?? new Error("Count failed")),
        { once: true },
      );
    });
    const [storedSession, attemptCount] = await Promise.all([
      storedSessionPromise,
      attemptCountPromise,
    ]);

    database.close();
    return { storedSession, attemptCount };
  }, SESSION_ID);
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/practice/${SESSION_ID}`);
  await seedInterruptedSession(page);
  await page.reload();
});

test("finds an active session after reload and restores unfinished content", async ({
  page,
}) => {
  await expect(
    page.getByRole("dialog", { name: "發現尚未完成的練習" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "恢復未完成內容" }).click();

  await expect(page.getByTestId("restored-attempt-content")).toContainText(
    attemptDraft.currentContent,
  );
});

test("resets only the unfinished attempt while keeping session progress", async ({
  page,
}) => {
  await page.getByRole("button", { name: "重設這一題" }).click();

  await expect(page.getByText("已重設目前題目，可重新開始操作。")).toBeVisible();
  const { storedSession, attemptCount } = await readPersistedState(page);
  expect(storedSession.session.status).toBe("active");
  expect(storedSession.session.currentIndex).toBe(1);
  expect(storedSession.attemptDraft).toBeNull();
  expect(attemptCount).toBe(0);
});

test("abandons the session without recording an automatic failure", async ({
  page,
}) => {
  await page.getByRole("button", { name: "放棄題組" }).click();

  await expect(page.getByText("已放棄這個題組，未完成題目不會算失敗。")).toBeVisible();
  const { storedSession, attemptCount } = await readPersistedState(page);
  expect(storedSession.session.status).toBe("abandoned");
  expect(storedSession.attemptDraft).toBeNull();
  expect(attemptCount).toBe(0);
  // The seeded fixture is a legacy (pre-actualCount) record. Reading it via
  // SessionRepository.getResumeState() normalizes actualCount in memory, and
  // abandoning re-persists the full session, so the record on disk now
  // carries a real actualCount instead of the legacy shape.
  expect(storedSession.session.actualCount).toBe(LEGACY_SESSION_ACTUAL_COUNT);
});
