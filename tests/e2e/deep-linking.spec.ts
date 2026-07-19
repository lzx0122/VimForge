import { expect, test } from "@playwright/test";

test("loads and reloads a nested course route as an SPA", async ({ page }) => {
  const response = await page.goto("/courses/text-objects");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "課程單元" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "課程單元" })).toBeVisible();
});

test("shows physical keyboard guidance on a narrow practice screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/practice/mobile-session");

  await expect(
    page.getByText("建議使用電腦與實體鍵盤完成 Vim 練習", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "課程" }).click();
  await expect(page.getByRole("heading", { name: "課程地圖" })).toBeVisible();
});
