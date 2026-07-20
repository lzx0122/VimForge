import { expect, test, type Page } from "@playwright/test";

const UNIT_ID = "00000000-0000-4000-8000-000000000601";
const SKILL_DUE_ID = "00000000-0000-4000-8000-000000000602";
const SKILL_TIE_ID = "00000000-0000-4000-8000-000000000603";

const skillDue = {
  id: SKILL_DUE_ID,
  slug: "basic-motion",
  name: "基礎移動",
  description: "游標的基本移動方式。",
  category: "movement",
  difficulty: "beginner",
};

const skillTie = {
  id: SKILL_TIE_ID,
  slug: "precise-basic-motion",
  name: "精準移動",
  description: "以行號或字元位置精準移動游標。",
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
    exercise_type: "review",
    difficulty: "beginner",
    supported_modes: ["memory_review"],
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

// Exactly 10 exercises sharing one skill: with the daily-review default
// question count of 10, this is the whole due-or-incorrect pool AND the
// exact number of exercises a session should end up with, so the test can
// assert a real (not fabricated) due count and an exact persisted set.
const dueExercises = Array.from({ length: 10 }, (_, index) =>
  buildExercise(
    `00000000-0000-4000-8000-0000000007${String(index).padStart(2, "0")}`,
    `due-${index + 1}`,
    index + 1,
  ),
);

// 15 exercises sharing a different skill: more than the requested count of
// 10, and (once all marked incorrect) tied on priority, so which 10 of the
// 15 get selected depends entirely on the date-seeded tie-break order.
const tieExercises = Array.from({ length: 15 }, (_, index) =>
  buildExercise(
    `00000000-0000-4000-8000-0000000008${String(index).padStart(2, "0")}`,
    `tie-${index + 1}`,
    index + 1,
  ),
);

const exerciseSkillLinks = [
  ...dueExercises.map((exercise) => ({
    exercise_id: exercise.id,
    skill_id: SKILL_DUE_ID,
    weight: 1,
    is_primary: true,
  })),
  ...tieExercises.map((exercise) => ({
    exercise_id: exercise.id,
    skill_id: SKILL_TIE_ID,
    weight: 1,
    is_primary: true,
  })),
];

async function mockDailyReviewCatalog(page: Page): Promise<void> {
  await page.route("**/rest/v1/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const table = requestUrl.pathname.split("/").at(-1);
    let body: object | object[];

    if (table === "exercises") {
      body = [...dueExercises, ...tieExercises];
    } else if (table === "exercise_skills") {
      body = exerciseSkillLinks;
    } else if (table === "skills") {
      body = [skillDue, skillTie];
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

interface SeedAttempt {
  clientAttemptId: string;
  exerciseId: string;
  completed: boolean;
}

function toStoredAttempt(seed: SeedAttempt) {
  return {
    clientAttemptId: seed.clientAttemptId,
    sessionId: null,
    exerciseId: seed.exerciseId,
    exerciseVersion: 1,
    learningMode: "memory_review",
    source: "web",
    completed: seed.completed,
    startedAt: "2026-07-01T08:00:00.000Z",
    completedAt: "2026-07-01T08:01:00.000Z",
    durationMs: 60_000,
    keystrokeCount: 5,
    recommendedKeystrokeCount: 5,
    mistakeCount: 0,
    undoCount: 0,
    resetCount: 0,
    highestHintLevel: 0,
    usedRecommendedSolution: true,
    normalizedActions: [],
    speedScore: 90,
    accuracyScore: 90,
    performanceQuality: 4,
    practiceContext: "different_exercise",
    syncStatus: "synced",
  };
}

async function seedAttempts(
  page: Page,
  attempts: readonly SeedAttempt[],
): Promise<void> {
  await page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge");
      request.addEventListener(
        "upgradeneeded",
        () => {
          const db = request.result;
          const attempts = db.createObjectStore("attempts", {
            keyPath: "clientAttemptId",
          });
          attempts.createIndex("syncStatus", "syncStatus");
          const sessions = db.createObjectStore("sessions", {
            keyPath: "id",
          });
          sessions.createIndex("status", "status");
          db.createObjectStore("settings", { keyPath: "key" });
          db.createObjectStore("metadata", { keyPath: "key" });
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

    const transaction = database.transaction("attempts", "readwrite");
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
    const store = transaction.objectStore("attempts");
    for (const record of records) {
      store.put(record);
    }
    await completion;
    database.close();
  }, attempts.map(toStoredAttempt));
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

function sessionIdFromUrl(url: string): string {
  const id = url.split("/").pop();
  if (id === undefined) {
    throw new Error(`Unable to extract a session id from ${url}.`);
  }
  return id;
}

test("switches from daily review to required topic practice", async ({ page }) => {
  await page.goto("/practice/setup?mode=memory_review");

  await expect(page.getByLabel("今日複習")).toBeChecked();
  await expect(page.getByLabel("10 題")).toBeChecked();
  await page.getByLabel("20 題").check();
  await page.getByLabel("指定主題").check();

  const topics = page.getByTestId("topic-selector");
  await expect(topics).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("至少選擇一個主題");

  await topics.getByLabel("全文搜尋").check();
  await expect(topics).toHaveAttribute("aria-invalid", "false");
  await expect(topics.getByLabel("全文搜尋")).toBeChecked();
  await expect(page.getByLabel("20 題")).toBeChecked();
});

test("shows the real due count and starts a session with the seeded due exercises", async ({
  page,
}) => {
  await mockDailyReviewCatalog(page);
  await page.goto("/review");
  await seedAttempts(
    page,
    dueExercises.map((exercise, index) => ({
      clientAttemptId: `due-attempt-${index + 1}`,
      exerciseId: exercise.id,
      completed: false,
    })),
  );
  await page.reload();

  await expect(page.getByTestId("due-count")).toHaveText("10");

  await page.getByRole("link", { name: "建立今日複習" }).click();
  await expect(page).toHaveURL(
    /\/practice\/setup\?mode=memory_review&source=daily_review&count=10$/u,
  );

  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);

  const exerciseIds = await readSessionExerciseIds(
    page,
    sessionIdFromUrl(page.url()),
  );

  expect(exerciseIds).toHaveLength(10);
  expect([...exerciseIds].sort()).toEqual(
    dueExercises.map((exercise) => exercise.id).sort(),
  );
});

test("reshuffles tied-priority candidates differently on different local dates", async ({
  page,
}) => {
  await mockDailyReviewCatalog(page);
  await page.goto("/practice/setup?mode=memory_review&source=daily_review&count=10");
  await seedAttempts(
    page,
    tieExercises.map((exercise, index) => ({
      clientAttemptId: `tie-attempt-${index + 1}`,
      exerciseId: exercise.id,
      completed: false,
    })),
  );

  await page.clock.install({ time: new Date("2026-07-20T12:00:00.000Z") });
  await page.reload();
  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);
  const exerciseIdsA = await readSessionExerciseIds(
    page,
    sessionIdFromUrl(page.url()),
  );

  await page.goto("/practice/setup?mode=memory_review&source=daily_review&count=10");
  await page.clock.setFixedTime(new Date("2027-02-14T12:00:00.000Z"));
  await page.getByRole("button", { name: "開始練習" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/u);
  const exerciseIdsB = await readSessionExerciseIds(
    page,
    sessionIdFromUrl(page.url()),
  );

  expect(exerciseIdsA).toHaveLength(10);
  expect(exerciseIdsB).toHaveLength(10);
  expect([...exerciseIdsA].sort()).not.toEqual([...exerciseIdsB].sort());
});
