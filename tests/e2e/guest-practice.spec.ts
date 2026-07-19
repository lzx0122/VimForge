import { expect, test } from "@playwright/test";

test("lets a guest choose every mode with the keyboard", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "從零開始" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "記憶複習" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "效率進階" })).toBeVisible();

  const reviewButton = page.getByRole("button", { name: "開始複習" });
  await reviewButton.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/practice\/setup\?mode=memory_review$/u);
  await expect(page.getByRole("heading", { name: "練習設定" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /登入/u })).toHaveCount(0);
});

test("offers 5, 10, and 20 questions with 10 selected by default", async ({ page }) => {
  await page.goto("/practice/setup?mode=efficiency");

  const countSelector = page.getByTestId("question-count-selector");
  await expect(countSelector.getByLabel("5 題")).toBeVisible();
  await expect(countSelector.getByLabel("10 題")).toBeChecked();
  await expect(countSelector.getByLabel("20 題")).toBeVisible();

  await countSelector.getByLabel("5 題").check();
  await expect(countSelector.getByLabel("5 題")).toBeChecked();

  await page.getByRole("link", { name: "首頁" }).click();
  await expect(page.getByRole("button", { name: "開始學習" })).toBeEnabled();
});
