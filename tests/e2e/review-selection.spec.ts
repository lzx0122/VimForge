import { expect, test } from "@playwright/test";

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
