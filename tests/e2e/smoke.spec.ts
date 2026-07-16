import { expect, test } from "@playwright/test";

test("displays the Vim Practice home page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Vim Practice", level: 1 }),
  ).toBeVisible();
});

test("loads a course unit from a deep link", async ({ page }) => {
  await page.goto("/courses/text-objects");

  await expect(
    page.getByRole("heading", { name: /課程單元/ }),
  ).toBeVisible();
  await expect(page.getByText("text-objects")).toBeVisible();
});
