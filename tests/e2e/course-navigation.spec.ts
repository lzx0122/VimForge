import { expect, test } from "@playwright/test";

test("keeps every course unit open without prerequisite locking", async ({ page }) => {
  await page.goto("/courses");

  await expect(page.getByTestId("course-unit-card")).toHaveCount(10);
  const textObjects = page
    .getByTestId("course-unit-card")
    .filter({ has: page.getByRole("heading", { name: "文字物件" }) });

  await expect(textObjects.getByText("建議先熟悉刪除、修改與 Operator。")).toBeVisible();
  await expect(textObjects.getByRole("link", { name: "進入單元" })).toBeEnabled();
  await textObjects.getByRole("link", { name: "進入單元" }).click();

  await expect(page).toHaveURL(/\/courses\/text-objects$/u);
  await expect(page.getByRole("heading", { name: "課程單元" })).toBeVisible();
  await expect(page.getByText("text-objects", { exact: true })).toBeVisible();
});
