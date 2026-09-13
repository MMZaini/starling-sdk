import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("masked account details can be revealed with the keyboard", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#accounts")).not.toContainText("12345678");
  const toggle = page.getByRole("button", { name: "Show account details" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#accounts")).toContainText("12345678");
  await expect(page.getByRole("button", { name: "Hide account details" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#accounts")).not.toContainText("12345678");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("fits a narrow mobile viewport without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("./");
  await page.getByRole("button", { name: "Show account details" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
