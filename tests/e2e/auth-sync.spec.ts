import { expect, test, type Page } from "@playwright/test";

const ATTEMPT_ID = "00000000-0000-4000-8000-000000000701";

async function seedPendingAttempt(page: Page): Promise<void> {
  await page.evaluate(async (attemptId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("vim-forge", 1);
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
