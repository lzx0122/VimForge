import { expect, test } from "@playwright/test";

test("displays the Vim Practice home page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Vim Practice", level: 1 }),
  ).toBeVisible();
});
