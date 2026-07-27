import { expect, test } from "@playwright/test";
import { openCommand, openFreshDesign } from "./helpers";

test("empty editor shell is visually stable @visual", async ({ page }) => {
  await openFreshDesign(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot("editor-empty.png", {
    fullPage: true,
    mask: [
      page.locator("[title='Notifiche']"),
      page.locator("text=Sincronizzato"),
    ],
  });
});

test("asset picker and PNG Studio grid are visually stable @visual", async ({ page }) => {
  await openFreshDesign(page);
  await openCommand(page, "Apri asset picker");
  await expect(page.getByRole("heading", { name: "Libreria immagini e PNG" })).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByRole("dialog", { name: "Libreria immagini e PNG" })).toHaveScreenshot("asset-picker.png");
});