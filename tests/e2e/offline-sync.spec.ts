import { expect, test, type Page } from "@playwright/test";

async function seedPendingAttempt(page: Page): Promise<void> {
  await page.evaluate(async () => {
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
    const transaction = database.transaction("attempts", "readwrite");
    const completion = new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve(), {
        once: true,
      });
      transaction.addEventListener(
        "error",
        () => reject(transaction.error ?? new Error("Write failed")),
        { once: true },
      );
    });

    transaction.objectStore("attempts").put({
      clientAttemptId: "00000000-0000-4000-8000-000000000601",
      sessionId: null,
      exerciseId: "00000000-0000-4000-8000-000000000301",
      exerciseVersion: 1,
      learningMode: "memory_review",
      source: "web",
      completed: true,
      startedAt: "2026-07-16T08:00:00.000Z",
      completedAt: "2026-07-16T08:00:08.000Z",
      durationMs: 8000,
      keystrokeCount: 5,
      recommendedKeystrokeCount: 5,
      mistakeCount: 0,
      undoCount: 0,
      resetCount: 0,
      highestHintLevel: 0,
      usedRecommendedSolution: true,
      normalizedActions: [{ type: "vim_command", command: "ciw" }],
      speedScore: 100,
      accuracyScore: 100,
      performanceQuality: 5,
      practiceContext: "different_exercise",
      syncStatus: "pending",
    });

    await completion;
    database.close();
  });
}

async function readSyncStatus(page: Page): Promise<string> {
  return page.evaluate(async () => {
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
    const request = database
      .transaction("attempts", "readonly")
      .objectStore("attempts")
      .get("00000000-0000-4000-8000-000000000601");
    const attempt = await new Promise<{ syncStatus: string }>(
      (resolve, reject) => {
        request.addEventListener("success", () => resolve(request.result), {
          once: true,
        });
        request.addEventListener(
          "error",
          () => reject(request.error ?? new Error("Read failed")),
          { once: true },
        );
      },
    );

    database.close();
    return attempt.syncStatus;
  });
}

test("keeps a pending attempt local and allows navigation while offline", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await seedPendingAttempt(page);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await expect(
    page.getByText("目前無法同步，紀錄已保存在這台裝置。"),
  ).toBeVisible();
  await page.getByRole("link", { name: "課程" }).click();
  await expect(
    page.getByRole("heading", { name: "課程", level: 1 }),
  ).toBeVisible();
  await expect.poll(() => readSyncStatus(page)).toBe("pending");

  await context.setOffline(false);
});
